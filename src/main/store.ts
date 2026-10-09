/**
 * Sincronización de la base de datos entre ordenadores.
 *
 * SQLite no debe abrirse directamente dentro de una carpeta de OneDrive / Google Drive /
 * Dropbox: el programa de sincronización puede copiar el archivo a medio escribir o crear
 * copias en conflicto. Por eso cada ordenador trabaja con una copia local (AppData) y
 * LawChest "publica" una instantánea completa y consistente en la carpeta de datos
 * (lawchest.db) tras cada cambio, sustituyéndola de forma atómica. Al abrir la app, al
 * volver a la ventana y cada pocos segundos se comprueba si otro ordenador ha publicado
 * una versión más nueva y, si es así, se carga.
 */
import { EventEmitter } from 'events'
import { promises as fs, existsSync, statSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { hostname, tmpdir } from 'os'
import { DatabaseSync } from 'node:sqlite'
import { applySchema, closeDb, getDb, openDb, workingDbPath } from './db'
import { readSyncState, writeSyncState, type SyncState } from './config'
import { dbPath, ensureDataDirs, getDataDir } from './paths'

export const syncEvents = new EventEmitter()

let state: SyncState = { baseRev: 0, dirty: false, seenMtime: 0, seenSize: 0 }
let lastChanges = 0
let timer: NodeJS.Timeout | null = null
let queue: Promise<void> = Promise.resolve()
let lastError: string | null = null

const PUBLISH_DELAY_MS = 1500
const machineName = (): string => hostname() || 'Este ordenador'

function totalChanges(): number {
  const row = getDb().prepare('SELECT total_changes() AS n').get() as { n: number }
  return Number(row.n)
}

function saveState(): void {
  writeSyncState(state)
}

function sharedStat(): { mtime: number; size: number } | null {
  try {
    const st = statSync(dbPath())
    return { mtime: st.mtimeMs, size: st.size }
  } catch {
    return null
  }
}

function markSeen(): void {
  const st = sharedStat()
  state.seenMtime = st?.mtime ?? 0
  state.seenSize = st?.size ?? 0
}

function sharedChangedSinceSeen(): boolean {
  const st = sharedStat()
  if (!st) return false
  return st.mtime !== state.seenMtime || st.size !== state.seenSize
}

function readMeta(d: DatabaseSync): { rev: number; machine: string | null; savedAt: string | null } {
  const rows = d.prepare('SELECT key, value FROM sync_meta').all() as { key: string; value: string }[]
  const m = new Map(rows.map((r) => [r.key, r.value]))
  return { rev: Number(m.get('rev') ?? 0), machine: m.get('machine') ?? null, savedAt: m.get('savedAt') ?? null }
}

/**
 * Abre una copia temporal de la base de datos compartida (así nunca la dejamos bloqueada
 * para el programa de sincronización) y ejecuta fn con ella.
 */
async function withSharedCopy<T>(fn: (d: DatabaseSync, tmpDir: string) => T): Promise<T> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'lawchest-'))
  try {
    const copy = join(tmpDir, 'compartida.db')
    await fs.copyFile(dbPath(), copy)
    // Bases de datos de la versión 1.0 (escritas directamente en la carpeta, con WAL)
    for (const ext of ['-wal', '-shm']) {
      if (existsSync(dbPath() + ext)) await fs.copyFile(dbPath() + ext, copy + ext).catch(() => undefined)
    }
    const d = new DatabaseSync(copy)
    try {
      applySchema(d)
      return fn(d, tmpDir)
    } finally {
      d.close()
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function readSharedRev(): Promise<number> {
  if (!existsSync(dbPath())) return 0
  return withSharedCopy((d) => readMeta(d).rev)
}

/** Sustituye la copia de trabajo por el contenido de otra base de datos */
async function replaceWorkingWith(fill: (target: string) => Promise<void>): Promise<void> {
  const next = workingDbPath() + '.nueva'
  await fs.rm(next, { force: true })
  await fill(next)
  closeDb()
  for (const ext of ['', '-wal', '-shm']) await fs.rm(workingDbPath() + ext, { force: true })
  await fs.rename(next, workingDbPath())
  openDb()
  lastChanges = totalChanges()
}

/** Carga en este ordenador la última versión guardada en la carpeta de datos */
async function loadFromShared(): Promise<void> {
  let rev = 0
  await replaceWorkingWith(async (target) => {
    await withSharedCopy((d) => {
      rev = readMeta(d).rev
      d.prepare('VACUUM INTO ?').run(target)
    })
  })
  // Restos de la versión 1.0 que ya hemos incorporado
  for (const ext of ['-wal', '-shm']) await fs.rm(dbPath() + ext, { force: true }).catch(() => undefined)
  state.baseRev = rev
  state.dirty = false
  state.dataDir = getDataDir()
  markSeen()
  saveState()
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  // OneDrive/Dropbox pueden tener el archivo abierto un instante mientras lo suben
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to)
      return
    } catch (e) {
      if (i >= 8) throw e
      await new Promise((r) => setTimeout(r, 250 * (i + 1)))
    }
  }
}

/** Guarda los cambios locales que otro ordenador haya pisado y carga la versión compartida */
async function handleConflict(): Promise<void> {
  const dir = join(getDataDir(), 'Conflictos de sincronización')
  await fs.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const file = join(dir, `lawchest ${machineName()} ${stamp}.db`)
  getDb().prepare('VACUUM INTO ?').run(file)
  await loadFromShared()
  syncEvents.emit('conflict', { file })
  syncEvents.emit('reloaded')
}

async function doPublish(force = false): Promise<void> {
  if (!state.dirty && !force) return
  ensureDataDirs()
  if (!force && existsSync(dbPath()) && sharedChangedSinceSeen()) {
    const sharedRev = await readSharedRev()
    if (sharedRev > state.baseRev) {
      // Otro ordenador guardó cambios mientras aquí también se cambiaba algo
      await handleConflict()
      return
    }
  }
  const sharedRev = force && existsSync(dbPath()) ? await readSharedRev() : state.baseRev
  const rev = Math.max(state.baseRev, sharedRev) + 1
  const savedAt = new Date().toISOString()
  const d = getDb()
  const upsert = d.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  upsert.run('rev', String(rev))
  upsert.run('machine', machineName())
  upsert.run('savedAt', savedAt)
  const tmp = join(getDataDir(), `.lawchest-guardando-${process.pid}-${Date.now()}.db`)
  d.prepare('VACUUM INTO ?').run(tmp)
  const changesAtSnapshot = totalChanges()
  try {
    for (const ext of ['-wal', '-shm']) await fs.rm(dbPath() + ext, { force: true }).catch(() => undefined)
    await renameWithRetry(tmp, dbPath())
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
  state.baseRev = rev
  state.dataDir = getDataDir()
  markSeen()
  // Si mientras guardábamos se hizo otro cambio, queda pendiente para la siguiente vez
  const now = totalChanges()
  state.dirty = now !== changesAtSnapshot
  lastChanges = now
  saveState()
  lastError = null
  syncEvents.emit('saved')
  if (state.dirty) schedulePublish()
}

function enqueue(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job).catch((e) => {
    lastError = (e as Error).message
    console.error('Error de sincronización', e)
    syncEvents.emit('error', lastError)
  })
  return queue
}

/** Como enqueue, pero el que llama recibe el error (para mostrarlo en pantalla) */
function enqueueStrict(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job)
  queue = run.catch((e) => {
    lastError = (e as Error).message
    console.error('Error de sincronización', e)
  })
  return run
}

function schedulePublish(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    enqueue(() => doPublish())
  }, PUBLISH_DELAY_MS)
}

/** Llamar después de cualquier operación: si la base de datos cambió, se guardará en la carpeta de datos */
export function checkDirty(): void {
  const n = totalChanges()
  if (n !== lastChanges) {
    lastChanges = n
    if (!state.dirty) {
      state.dirty = true
      saveState()
    }
    schedulePublish()
  }
}

/** Guarda ya los cambios pendientes (al cerrar la app o al cambiar de ventana) */
export function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  return enqueue(() => doPublish())
}

/** Comprueba si otro ordenador ha guardado una versión más nueva */
export function poll(): Promise<void> {
  return enqueue(async () => {
    if (!existsSync(dbPath())) {
      // La carpeta de datos no tiene base de datos (borrada o recién elegida): la creamos
      state.dirty = true
      await doPublish()
      return
    }
    if (!sharedChangedSinceSeen()) return
    const rev = await readSharedRev()
    if (rev > state.baseRev) {
      if (state.dirty) await handleConflict()
      else {
        await loadFromShared()
        syncEvents.emit('reloaded')
      }
    } else {
      markSeen()
      saveState()
    }
  })
}

/** Prepara la base de datos al arrancar */
export async function initStore(): Promise<void> {
  ensureDataDirs()
  state = readSyncState()
  const dataDir = getDataDir()
  const hasShared = existsSync(dbPath())
  const hasWorking = existsSync(workingDbPath())

  if (!hasWorking || state.dataDir !== dataDir) {
    if (hasShared) {
      await loadFromShared()
    } else {
      openDb()
      state = { ...state, dataDir, dirty: true }
      lastChanges = totalChanges()
      await doPublish(true)
    }
  } else {
    openDb()
    lastChanges = totalChanges()
    if (!hasShared) {
      state.dirty = true
      await doPublish(true)
    } else if (sharedChangedSinceSeen()) {
      const rev = await readSharedRev()
      if (rev > state.baseRev) {
        if (state.dirty) await handleConflict()
        else await loadFromShared()
      } else if (state.dirty) {
        await doPublish()
      }
    } else if (state.dirty) {
      await doPublish()
    }
  }
  lastChanges = totalChanges()
}

/** Sustituye todos los datos por una base de datos importada (restaurar copia de seguridad) */
export async function importDatabase(file: string): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  await queue
  await replaceWorkingWith(async (target) => {
    const d = new DatabaseSync(file)
    try {
      applySchema(d)
      d.prepare('VACUUM INTO ?').run(target)
    } finally {
      d.close()
    }
  })
  state.dirty = true
  await enqueueStrict(() => doPublish(true))
}

/** Tras cambiar de carpeta de datos: carga la que hay allí o publica la actual */
export async function attachToDataDir(mode: 'use' | 'move'): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  await queue
  ensureDataDirs()
  if (mode === 'use') {
    await enqueueStrict(() => loadFromShared())
  } else {
    state.dirty = true
    state.baseRev = 0
    await enqueueStrict(() => doPublish(true))
  }
  syncEvents.emit('reloaded')
}

export interface StoreStatus {
  dirty: boolean
  rev: number
  savedAt: string | null
  savedBy: string | null
  thisMachine: string
  lastError: string | null
}

export function storeStatus(): StoreStatus {
  const meta = readMeta(getDb())
  return {
    dirty: state.dirty,
    rev: state.baseRev,
    savedAt: meta.savedAt,
    savedBy: meta.machine,
    thisMachine: machineName(),
    lastError
  }
}
