/**
 * Sincronización en dos sentidos entre la carpeta de datos local y la carpeta
 * «LawChest» de Google Drive (por internet, sin necesidad de instalar Google Drive).
 *
 * Se guarda el estado de la última sincronización (por ruta: id en Drive, fecha,
 * tamaño y huella MD5) y en cada pasada se compara local, Drive y ese estado:
 * - cambiado solo aquí → se sube; cambiado solo en Drive → se descarga
 * - borrado aquí (y sin cambios en Drive) → a la papelera de Drive
 * - borrado en Drive (y sin cambios aquí) → a la papelera de Windows
 * - cambiado en los dos → se conservan ambas versiones («… (conflicto EQUIPO …)»)
 * Los movimientos se detectan por la huella, para no volver a subir/bajar archivos.
 * La base de datos (lawchest.db) la gestiona store.ts con su número de revisión.
 */
import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { createReadStream, existsSync, promises as fs } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { tmpdir } from 'os'
import { shell } from 'electron'
import { localDir, readConfig, writeConfig } from './config'
import { getDataDir, dbPath } from './paths'
import { getDb } from './db'
import { flush as flushStore, installRemoteSnapshot, machineName } from './store'
import { authStatus, connectGoogle, disconnectGoogle, ReconnectError } from './gauth'
import * as drive from './gdrive'
import { FOLDER_MIME, type DriveFile } from './gdrive'

export const gsyncEvents = new EventEmitter()

interface BaseEntry {
  id: string
  dir: boolean
  mtime: number
  size: number
  md5?: string
  /** md5 en Drive la última vez */
  rmd5?: string
}

interface SyncStateFile {
  rootId?: string
  dataDir?: string
  entries: Record<string, BaseEntry>
  lastSyncAt?: string
}

export interface GSyncStatus {
  enabled: boolean
  state: 'idle' | 'syncing' | 'error' | 'reconnect' | 'off'
  lastSyncAt: string | null
  lastError: string | null
  progress: { done: number; total: number } | null
  lastResult: { up: number; down: number; deleted: number; conflicts: number; failed: number } | null
}

const DB_REL = 'lawchest.db'
const INCLUDE_TOP = new Set(['Clientes', 'Papelera', 'Conflictos de sincronización', DB_REL])
const IGNORE = (name: string): boolean =>
  name.startsWith('.lawchest') ||
  name.startsWith('.restaurando') ||
  name.endsWith('.lawchest-descarga') ||
  name.startsWith('~$') ||
  name === 'desktop.ini' ||
  name === 'Thumbs.db' ||
  name === '.DS_Store'

let status: GSyncStatus = { enabled: false, state: 'off', lastSyncAt: null, lastError: null, progress: null, lastResult: null }
let running: Promise<void> | null = null
let rerun = false
let timer: NodeJS.Timeout | null = null
let interval: NodeJS.Timeout | null = null

const stateFile = (): string => join(localDir(), 'gsync.json')

async function readState(): Promise<SyncStateFile> {
  try {
    return JSON.parse(await fs.readFile(stateFile(), 'utf8'))
  } catch {
    return { entries: {} }
  }
}

async function writeState(s: SyncStateFile): Promise<void> {
  await fs.writeFile(stateFile() + '.tmp', JSON.stringify(s))
  await fs.rename(stateFile() + '.tmp', stateFile())
}

function setStatus(patch: Partial<GSyncStatus>): void {
  status = { ...status, ...patch }
  gsyncEvents.emit('status', status)
}

export const gsyncEnabled = (): boolean => !!readConfig().gdrive?.enabled

export function gsyncStatus(): GSyncStatus & ReturnType<typeof authStatus> & { rootId: string | null } {
  return { ...status, enabled: gsyncEnabled(), ...authStatus(), rootId: readConfig().gdrive?.rootId ?? null }
}

/* ------------------------------ Lectura local ------------------------------ */

interface LocalEntry {
  dir: boolean
  mtime: number
  size: number
}

async function scanLocal(root: string): Promise<Map<string, LocalEntry>> {
  const out = new Map<string, LocalEntry>()
  async function walk(abs: string, rel: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (IGNORE(e.name)) continue
      if (!rel && !INCLUDE_TOP.has(e.name)) continue
      const childRel = rel ? `${rel}/${e.name}` : e.name
      const childAbs = join(abs, e.name)
      try {
        const st = await fs.stat(childAbs)
        if (st.isDirectory()) {
          out.set(childRel, { dir: true, mtime: 0, size: 0 })
          await walk(childAbs, childRel)
        } else if (st.isFile()) {
          out.set(childRel, { dir: false, mtime: Math.floor(st.mtimeMs), size: st.size })
        }
      } catch {
        /* archivo inaccesible en este momento */
      }
    }
  }
  await walk(root, '')
  return out
}

function md5File(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('md5')
    createReadStream(p)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })
}

/* ------------------------------ Lectura en Drive ------------------------------ */

interface RemoteEntry {
  id: string
  dir: boolean
  md5?: string
  size: number
  modifiedTime?: string
  parentId: string
}

async function scanRemote(rootId: string): Promise<Map<string, RemoteEntry>> {
  const out = new Map<string, RemoteEntry>()
  const queue: { id: string; rel: string }[] = [{ id: rootId, rel: '' }]
  let active = 0
  await new Promise<void>((resolve, reject) => {
    const next = (): void => {
      if (queue.length === 0 && active === 0) return resolve()
      while (queue.length && active < 6) {
        const item = queue.shift()!
        active++
        drive
          .listChildren(item.id)
          .then((files) => {
            for (const f of files) {
              if (IGNORE(f.name) || f.name.includes('/')) continue
              const isDir = f.mimeType === FOLDER_MIME
              // Documentos nativos de Google (Docs, Hojas…) no son archivos descargables
              if (!isDir && f.mimeType.startsWith('application/vnd.google-apps.')) continue
              if (!item.rel && !INCLUDE_TOP.has(f.name)) continue
              const rel = item.rel ? `${item.rel}/${f.name}` : f.name
              if (out.has(rel)) continue // nombres repetidos en Drive: se usa el primero
              out.set(rel, { id: f.id, dir: isDir, md5: f.md5Checksum, size: Number(f.size ?? 0), modifiedTime: f.modifiedTime, parentId: item.id })
              if (isDir) queue.push({ id: f.id, rel })
            }
          })
          .then(() => {
            active--
            next()
          })
          .catch(reject)
      }
    }
    next()
  })
  return out
}

/* --------------------------------- Pasada --------------------------------- */

const depth = (p: string): number => p.split('/').length
const parentRel = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

function conflictName(rel: string): string {
  const name = basename(rel)
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')
  const dir = parentRel(rel)
  const n = `${stem} (conflicto ${machineName()} ${stamp})${ext}`
  return dir ? `${dir}/${n}` : n
}

async function localDbIsEmpty(): Promise<boolean> {
  const n = getDb().prepare('SELECT (SELECT COUNT(*) FROM clients) + (SELECT COUNT(*) FROM trash) + (SELECT COUNT(*) FROM movements) AS n').get() as { n: number }
  return Number(n.n) === 0
}

async function runSync(): Promise<void> {
  const cfg = readConfig().gdrive
  if (!cfg?.enabled || !cfg.rootId) return
  const root = getDataDir()
  const abs = (rel: string): string => join(root, ...rel.split('/'))

  setStatus({ state: 'syncing', lastError: null, progress: null })
  await flushStore().catch(() => undefined)

  let st = await readState()
  if (st.rootId !== cfg.rootId || st.dataDir !== root) st = { rootId: cfg.rootId, dataDir: root, entries: {} }
  const firstSync = Object.keys(st.entries).length === 0
  const base = st.entries

  const [local, remote] = await Promise.all([scanLocal(root), scanRemote(cfg.rootId)])
  const result = { up: 0, down: 0, deleted: 0, conflicts: 0, failed: 0 }

  // Carpetas de Drive por ruta (se va completando al crear carpetas)
  const remoteDirId = (rel: string): string | undefined => (rel === '' ? cfg.rootId : remote.get(rel)?.dir ? remote.get(rel)!.id : undefined)
  async function ensureRemoteDir(rel: string): Promise<string> {
    const existing = remoteDirId(rel)
    if (existing) return existing
    const parentId = await ensureRemoteDir(parentRel(rel))
    const f = await drive.createFolder(basename(rel), parentId)
    remote.set(rel, { id: f.id, dir: true, size: 0, parentId })
    base[rel] = { id: f.id, dir: true, mtime: 0, size: 0 }
    return f.id
  }

  const changedLocally = (rel: string, l: LocalEntry, b?: BaseEntry): boolean => !b || l.mtime !== b.mtime || l.size !== b.size
  const changedRemotely = (r: RemoteEntry, b?: BaseEntry): boolean => !b || (r.md5 ?? '') !== (b.rmd5 ?? '')

  type Action =
    | { kind: 'upload'; rel: string }
    | { kind: 'download'; rel: string }
    | { kind: 'trashRemote'; rel: string }
    | { kind: 'deleteLocal'; rel: string }
    | { kind: 'conflict'; rel: string }
    | { kind: 'same'; rel: string; md5: string }
  const actions: Action[] = []

  // ---------------------------- Archivos ----------------------------
  const filePaths = new Set<string>()
  for (const [p, e] of local) if (!e.dir) filePaths.add(p)
  for (const [p, e] of remote) if (!e.dir) filePaths.add(p)
  for (const [p, e] of Object.entries(base)) if (!e.dir) filePaths.add(p)

  for (const rel of filePaths) {
    if (rel === DB_REL) continue
    const l = local.get(rel)
    const r = remote.get(rel)
    const b = base[rel]
    if (l?.dir || r?.dir) continue
    if (l && r) {
      const lc = changedLocally(rel, l, b)
      const rc = changedRemotely(r, b)
      if (!lc && !rc) continue
      if (lc && !rc && b) actions.push({ kind: 'upload', rel })
      else if (!lc && rc) actions.push({ kind: 'download', rel })
      else {
        // Cambiado en los dos (o nuevo en los dos): si es igual, no pasa nada
        const md5 = await md5File(abs(rel)).catch(() => '')
        if (md5 && md5 === r.md5) actions.push({ kind: 'same', rel, md5 })
        else actions.push({ kind: 'conflict', rel })
      }
    } else if (l && !r) {
      if (b && !changedLocally(rel, l, b)) actions.push({ kind: 'deleteLocal', rel })
      else actions.push({ kind: 'upload', rel })
    } else if (!l && r) {
      if (b && !changedRemotely(r, b)) actions.push({ kind: 'trashRemote', rel })
      else actions.push({ kind: 'download', rel })
    } else if (b) {
      delete base[rel]
    }
  }

  // Detección de movimientos/renombrados (misma huella) para no repetir transferencias
  const trashCandidates = actions.filter((a) => a.kind === 'trashRemote') as { kind: 'trashRemote'; rel: string }[]
  const deleteCandidates = actions.filter((a) => a.kind === 'deleteLocal') as { kind: 'deleteLocal'; rel: string }[]
  const moves: { from: string; to: string; side: 'remote' | 'local' }[] = []
  for (const a of actions) {
    if (a.kind === 'upload' && !remote.get(a.rel) && !base[a.rel]) {
      const md5 = await md5File(abs(a.rel)).catch(() => '')
      const idx = trashCandidates.findIndex((t) => remote.get(t.rel)?.md5 === md5 && md5)
      if (idx >= 0) {
        moves.push({ from: trashCandidates[idx]!.rel, to: a.rel, side: 'remote' })
        trashCandidates.splice(idx, 1)
      }
    } else if (a.kind === 'download' && !local.get(a.rel) && !base[a.rel]) {
      const md5 = remote.get(a.rel)?.md5
      const idx = deleteCandidates.findIndex((d) => base[d.rel]?.md5 === md5 && md5)
      if (idx >= 0) {
        moves.push({ from: deleteCandidates[idx]!.rel, to: a.rel, side: 'local' })
        deleteCandidates.splice(idx, 1)
      }
    }
  }
  const movedTo = new Set(moves.map((m) => m.to))
  const movedFrom = new Set(moves.map((m) => m.from))
  const todo = actions.filter((a) => !movedTo.has(a.rel) && !movedFrom.has(a.rel))

  const total = todo.filter((a) => a.kind !== 'same').length + moves.length + 1
  let done = 0
  const tick = (): void => setStatus({ progress: { done: ++done, total } })

  // Carpetas nuevas vacías en uno de los dos lados
  const dirPaths = new Set<string>()
  for (const [p, e] of local) if (e.dir) dirPaths.add(p)
  for (const [p, e] of remote) if (e.dir) dirPaths.add(p)
  for (const [p, e] of Object.entries(base)) if (e.dir) dirPaths.add(p)
  const sortedDirs = [...dirPaths].sort((a, b) => depth(a) - depth(b))
  for (const rel of sortedDirs) {
    const l = local.get(rel)
    const r = remote.get(rel)
    const b = base[rel]
    try {
      if (l?.dir && r?.dir) base[rel] = { id: r.id, dir: true, mtime: 0, size: 0 }
      else if (l?.dir && !r && !b) await ensureRemoteDir(rel)
      else if (!l && r?.dir && !b) {
        await fs.mkdir(abs(rel), { recursive: true })
        base[rel] = { id: r.id, dir: true, mtime: 0, size: 0 }
      }
    } catch (e) {
      result.failed++
      console.error('gsync carpeta', rel, e)
    }
  }

  // Movimientos
  for (const m of moves) {
    try {
      if (m.side === 'remote') {
        const r = remote.get(m.from)!
        const newParent = await ensureRemoteDir(parentRel(m.to))
        await drive.updateMeta(r.id, {
          name: basename(m.to),
          addParents: newParent !== r.parentId ? newParent : undefined,
          removeParents: newParent !== r.parentId ? r.parentId : undefined
        })
        const l = local.get(m.to)!
        base[m.to] = { id: r.id, dir: false, mtime: l.mtime, size: l.size, md5: r.md5, rmd5: r.md5 }
        remote.delete(m.from)
        remote.set(m.to, { ...r, parentId: newParent })
      } else {
        await fs.mkdir(dirname(abs(m.to)), { recursive: true })
        await fs.rename(abs(m.from), abs(m.to))
        const r = remote.get(m.to)!
        const s = await fs.stat(abs(m.to))
        base[m.to] = { id: r.id, dir: false, mtime: Math.floor(s.mtimeMs), size: s.size, md5: r.md5, rmd5: r.md5 }
      }
      delete base[m.from]
    } catch (e) {
      result.failed++
      console.error('gsync mover', m, e)
    }
    tick()
  }

  // Resto de acciones, de 4 en 4
  const runAction = async (a: Action): Promise<void> => {
    const rel = a.rel
    try {
      if (a.kind === 'same') {
        const l = local.get(rel)!
        const r = remote.get(rel)!
        base[rel] = { id: r.id, dir: false, mtime: l.mtime, size: l.size, md5: a.md5, rmd5: r.md5 }
        return
      }
      if (a.kind === 'upload') {
        const l = local.get(rel)!
        const r = remote.get(rel)
        const parentId = await ensureRemoteDir(parentRel(rel))
        const md5 = await md5File(abs(rel))
        const f = await drive.uploadFile(abs(rel), {
          name: basename(rel),
          parentId,
          fileId: r?.id,
          modifiedTime: new Date(l.mtime).toISOString()
        })
        base[rel] = { id: f.id, dir: false, mtime: l.mtime, size: l.size, md5, rmd5: f.md5Checksum ?? md5 }
        remote.set(rel, { id: f.id, dir: false, md5: f.md5Checksum, size: l.size, parentId })
        result.up++
      } else if (a.kind === 'download') {
        const r = remote.get(rel)!
        await fs.mkdir(dirname(abs(rel)), { recursive: true })
        await drive.downloadFile(r.id, abs(rel), r.modifiedTime)
        const s = await fs.stat(abs(rel))
        base[rel] = { id: r.id, dir: false, mtime: Math.floor(s.mtimeMs), size: s.size, md5: r.md5, rmd5: r.md5 }
        result.down++
      } else if (a.kind === 'trashRemote') {
        const r = remote.get(rel)!
        await drive.trashFile(r.id)
        remote.delete(rel)
        delete base[rel]
        result.deleted++
      } else if (a.kind === 'deleteLocal') {
        // A la papelera de Windows, por si acaso
        await shell.trashItem(abs(rel)).catch(() => fs.rm(abs(rel), { force: true }))
        delete base[rel]
        result.deleted++
      } else if (a.kind === 'conflict') {
        // Se conservan las dos versiones: la de este ordenador con otro nombre
        const r = remote.get(rel)!
        const alt = conflictName(rel)
        await fs.rename(abs(rel), abs(alt))
        const s = await fs.stat(abs(alt))
        const parentId = await ensureRemoteDir(parentRel(alt))
        const up = await drive.uploadFile(abs(alt), { name: basename(alt), parentId, modifiedTime: new Date(s.mtimeMs).toISOString() })
        base[alt] = { id: up.id, dir: false, mtime: Math.floor(s.mtimeMs), size: s.size, md5: up.md5Checksum, rmd5: up.md5Checksum }
        await drive.downloadFile(r.id, abs(rel), r.modifiedTime)
        const s2 = await fs.stat(abs(rel))
        base[rel] = { id: r.id, dir: false, mtime: Math.floor(s2.mtimeMs), size: s2.size, md5: r.md5, rmd5: r.md5 }
        result.conflicts++
      }
    } catch (e) {
      if (e instanceof ReconnectError) throw e
      result.failed++
      console.error('gsync', a, e)
    }
    tick()
  }
  const queue = todo.filter((a) => a.kind !== 'same')
  for (const a of todo.filter((x) => x.kind === 'same')) await runAction(a)
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) await runAction(queue.shift()!)
    })
  )

  // Carpetas borradas en un lado (de la más profunda a la más general)
  for (const rel of [...sortedDirs].reverse()) {
    const b = base[rel]
    if (!b) continue
    const lExists = existsSync(abs(rel))
    const r = remote.get(rel)
    try {
      if (!lExists && r) {
        const hasRemoteChildren = [...remote.keys()].some((k) => k.startsWith(rel + '/'))
        if (!hasRemoteChildren) {
          await drive.trashFile(r.id)
          remote.delete(rel)
          delete base[rel]
        } else {
          await fs.mkdir(abs(rel), { recursive: true })
        }
      } else if (lExists && !r) {
        const children = await fs.readdir(abs(rel)).catch(() => ['x'])
        if (children.length === 0) {
          await fs.rmdir(abs(rel)).catch(() => undefined)
          delete base[rel]
        } else {
          delete base[rel]
          await ensureRemoteDir(rel)
        }
      } else if (!lExists && !r) {
        delete base[rel]
      }
    } catch (e) {
      result.failed++
      console.error('gsync borrar carpeta', rel, e)
    }
  }

  // --------------------------- Base de datos ---------------------------
  try {
    await syncDatabase(local, remote, base, firstSync, root, ensureRemoteDir)
  } catch (e) {
    if (e instanceof ReconnectError) throw e
    result.failed++
    console.error('gsync base de datos', e)
  }
  tick()

  st.entries = base
  st.lastSyncAt = new Date().toISOString()
  await writeState(st)
  setStatus({
    state: result.failed ? 'error' : 'idle',
    lastSyncAt: st.lastSyncAt,
    lastError: result.failed ? `${result.failed} elemento(s) no se pudieron sincronizar; se reintentará.` : null,
    progress: null,
    lastResult: result
  })
  if (result.down || result.deleted || result.conflicts) gsyncEvents.emit('filesChanged')
}

async function syncDatabase(
  local: Map<string, LocalEntry>,
  remote: Map<string, RemoteEntry>,
  base: Record<string, BaseEntry>,
  firstSync: boolean,
  root: string,
  ensureRemoteDir: (rel: string) => Promise<string>
): Promise<void> {
  const l = local.get(DB_REL)
  const r = remote.get(DB_REL)
  const b = base[DB_REL]
  const lChanged = !!l && (!b || l.mtime !== b.mtime || l.size !== b.size)
  const rChanged = !!r && (!b || (r.md5 ?? '') !== (b.rmd5 ?? ''))

  const upload = async (): Promise<void> => {
    // Copia temporal para no leer el archivo mientras LawChest lo sustituye
    const tmp = join(tmpdir(), `lawchest-subida-${Date.now()}.db`)
    await fs.copyFile(dbPath(), tmp)
    try {
      const s = await fs.stat(dbPath())
      const md5 = await md5File(tmp)
      const f = await drive.uploadFile(tmp, { name: DB_REL, parentId: await ensureRemoteDir(''), fileId: r?.id })
      base[DB_REL] = { id: f.id, dir: false, mtime: Math.floor(s.mtimeMs), size: s.size, md5, rmd5: f.md5Checksum ?? md5 }
    } finally {
      await fs.rm(tmp, { force: true })
    }
  }
  const download = async (conflict: boolean): Promise<void> => {
    const tmp = join(root, `.lawchest-descarga-${Date.now()}.db`)
    await drive.downloadFile(r!.id, tmp)
    await installRemoteSnapshot(tmp, conflict)
    const s = await fs.stat(dbPath())
    base[DB_REL] = { id: r!.id, dir: false, mtime: Math.floor(s.mtimeMs), size: s.size, md5: r!.md5, rmd5: r!.md5 }
  }

  if (l && !r) return upload()
  if (!l && r) return download(false)
  if (!l || !r) return
  if (lChanged && !rChanged) return upload()
  if (!lChanged && rChanged) return download(false)
  if (lChanged && rChanged) {
    const md5 = await md5File(dbPath()).catch(() => '')
    if (md5 === r.md5) {
      base[DB_REL] = { id: r.id, dir: false, mtime: l.mtime, size: l.size, md5, rmd5: r.md5 }
      return
    }
    // Primera conexión en un ordenador sin datos: se usan los de Drive sin más
    const conflict = !(firstSync && (await localDbIsEmpty()))
    await download(conflict)
    // Si había cambios aquí, store.ts los guarda en «Conflictos de sincronización»
    // y la siguiente pasada sube la versión resultante
  }
}

/* ------------------------------- Control ------------------------------- */

export function syncNow(): Promise<void> {
  if (!gsyncEnabled()) return Promise.resolve()
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    try {
      do {
        rerun = false
        await runSync()
      } while (rerun)
    } catch (e) {
      if (e instanceof ReconnectError) setStatus({ state: 'reconnect', progress: null, lastError: (e as Error).message })
      else setStatus({ state: 'error', progress: null, lastError: (e as Error).message })
    } finally {
      running = null
    }
  })()
  return running
}

/** Programa una sincronización dentro de unos segundos (agrupa varios cambios seguidos) */
export function scheduleSync(delayMs = 8000): void {
  if (!gsyncEnabled()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    syncNow()
  }, delayMs)
}

export function startGSync(): void {
  if (interval) clearInterval(interval)
  interval = setInterval(() => syncNow(), 3 * 60 * 1000)
  if (gsyncEnabled()) {
    setStatus({ enabled: true, state: 'idle' })
    syncNow()
  }
}

/** Conecta la cuenta de Google y hace la primera sincronización */
export async function enableGoogleDrive(): Promise<void> {
  await connectGoogle()
  const rootFolder = await drive.findOrCreateRoot(readConfig().gdrive?.rootId)
  writeConfig({ ...readConfig(), gdrive: { enabled: true, rootId: rootFolder.id }, setupDone: true })
  setStatus({ enabled: true, state: 'idle', lastError: null })
  await syncNow()
}

/** Vuelve a conectar (cuando Google lo pide) y sincroniza lo pendiente */
export async function reconnectGoogleDrive(): Promise<void> {
  await connectGoogle()
  setStatus({ state: 'idle', lastError: null })
  await syncNow()
}

/** Desconecta: los datos se quedan en este ordenador y en Google Drive */
export async function disableGoogleDrive(): Promise<void> {
  if (running) await running.catch(() => undefined)
  await disconnectGoogle()
  const cfg = readConfig()
  delete cfg.gdrive
  writeConfig(cfg)
  await fs.rm(stateFile(), { force: true })
  setStatus({ enabled: false, state: 'off', lastSyncAt: null, lastError: null, progress: null, lastResult: null })
}

/** Al cerrar: última sincronización (como mucho 20 s) */
export async function finalSync(): Promise<void> {
  if (!gsyncEnabled() || status.state === 'reconnect') return
  await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 20000))])
}
