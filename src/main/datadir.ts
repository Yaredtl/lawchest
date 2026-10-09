import { promises as fs, existsSync, readFileSync, readdirSync } from 'fs'
import { basename, join, resolve, sep } from 'path'
import { homedir } from 'os'
import { getDb } from './db'
import { readConfig, writeConfig } from './config'
import { defaultDataDir, getDataDir, setDataDirPath } from './paths'
import { attachToDataDir, flush } from './store'
import { UserError } from './fsutil'

export type CloudProvider = 'OneDrive' | 'Google Drive' | 'Dropbox' | 'iCloud'

export interface FolderInfo {
  /** Carpeta exacta donde se guardarían los datos (…\LawChest) */
  target: string
  hasData: boolean
  provider: CloudProvider | null
  isCurrent: boolean
}

export interface CloudSuggestion extends FolderInfo {
  name: CloudProvider
}

export function detectProvider(p: string): CloudProvider | null {
  const s = p.toLowerCase()
  if (s.includes('onedrive')) return 'OneDrive'
  if (s.includes('google drive') || s.includes('googledrive') || s.includes('mi unidad') || s.includes('my drive')) return 'Google Drive'
  if (s.includes('dropbox')) return 'Dropbox'
  if (s.includes('icloud')) return 'iCloud'
  return null
}

const samePath = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

function info(target: string): FolderInfo {
  return {
    target,
    hasData: existsSync(join(target, 'lawchest.db')),
    provider: detectProvider(target),
    isCurrent: samePath(target, getDataDir())
  }
}

/** Carpeta elegida por el usuario -> carpeta LawChest dentro de ella (salvo que ya lo sea) */
export function inspectFolder(picked: string): FolderInfo {
  const abs = resolve(picked)
  if (existsSync(join(abs, 'lawchest.db')) || basename(abs).toLowerCase() === 'lawchest') return info(abs)
  return info(join(abs, 'LawChest'))
}

/** Busca OneDrive, Google Drive, Dropbox e iCloud instalados en este ordenador */
export function cloudSuggestions(): CloudSuggestion[] {
  const found: { name: CloudProvider; base: string }[] = []
  for (const key of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
    const p = process.env[key]
    if (p && existsSync(p)) found.push({ name: 'OneDrive', base: p })
  }
  const home = homedir()
  if (process.platform === 'win32') {
    for (const letter of 'GHIJKLMNOPQRSTUVWXYZ') {
      for (const sub of ['Mi unidad', 'My Drive']) {
        const p = `${letter}:\\${sub}`
        try {
          if (existsSync(p)) found.push({ name: 'Google Drive', base: p })
        } catch {
          /* unidad no disponible */
        }
      }
    }
  }
  for (const sub of ['Google Drive', 'Google Drive\\Mi unidad', 'Google Drive\\My Drive']) {
    const p = join(home, sub)
    if (existsSync(p) && !existsSync(join(p, 'Mi unidad')) && !existsSync(join(p, 'My Drive'))) found.push({ name: 'Google Drive', base: p })
  }
  try {
    const infoFile = join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Dropbox', 'info.json')
    if (existsSync(infoFile)) {
      const j = JSON.parse(readFileSync(infoFile, 'utf8'))
      for (const k of ['personal', 'business']) if (j[k]?.path && existsSync(j[k].path)) found.push({ name: 'Dropbox', base: j[k].path })
    }
  } catch {
    /* sin Dropbox */
  }
  if (existsSync(join(home, 'Dropbox'))) found.push({ name: 'Dropbox', base: join(home, 'Dropbox') })
  if (existsSync(join(home, 'iCloudDrive'))) found.push({ name: 'iCloud', base: join(home, 'iCloudDrive') })

  const out: CloudSuggestion[] = []
  for (const f of found) {
    const target = join(f.base, 'LawChest')
    if (out.some((o) => samePath(o.target, target))) continue
    out.push({ ...info(target), name: f.name })
  }
  return out
}

/** ¿La carpeta actual está vacía (sin clientes ni papelera)? Para limpiar tras cambiar de carpeta */
function currentIsEmpty(): boolean {
  const n = getDb().prepare('SELECT (SELECT COUNT(*) FROM clients) + (SELECT COUNT(*) FROM trash) AS n').get() as { n: number }
  return Number(n.n) === 0
}

async function removeIfEmpty(dir: string): Promise<void> {
  const allowed = new Set(['Clientes', 'Papelera', 'lawchest.db', 'lawchest.db-wal', 'lawchest.db-shm'])
  try {
    const entries = readdirSync(dir)
    if (!entries.every((e) => allowed.has(e))) return
    for (const sub of ['Clientes', 'Papelera']) {
      if (existsSync(join(dir, sub)) && readdirSync(join(dir, sub)).length > 0) return
    }
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    /* no pasa nada si no se puede limpiar */
  }
}

/**
 * Cambia la carpeta de datos.
 * - "use": la carpeta ya tiene datos de LawChest (p. ej. el otro ordenador): se usan esos.
 * - "move": se copian ahí los datos actuales (la carpeta antigua se conserva intacta).
 */
export async function switchDataDir(target: string, mode: 'use' | 'move'): Promise<{ previous: string; removedPrevious: boolean }> {
  const dest = resolve(target)
  const previous = getDataDir()
  if (samePath(dest, previous)) throw new UserError('Ya estás usando esa carpeta.')
  const destHasData = existsSync(join(dest, 'lawchest.db'))
  if (mode === 'use' && !destHasData) throw new UserError('En esa carpeta no hay datos de LawChest.')
  if (mode === 'move' && destHasData) {
    throw new UserError('Esa carpeta ya tiene datos de LawChest. Elige «Usar los datos de esa carpeta».')
  }
  if (dest.toLowerCase().startsWith(resolve(previous).toLowerCase() + sep)) {
    throw new UserError('La nueva carpeta no puede estar dentro de la carpeta de datos actual.')
  }

  await flush()
  const wasEmpty = currentIsEmpty()

  await fs.mkdir(dest, { recursive: true })
  if (mode === 'move') {
    for (const sub of ['Clientes', 'Papelera']) {
      const from = join(previous, sub)
      if (existsSync(from)) await fs.cp(from, join(dest, sub), { recursive: true, force: false, errorOnExist: false, preserveTimestamps: true })
    }
  }

  setDataDirPath(dest)
  writeConfig({ ...readConfig(), dataDir: samePath(dest, defaultDataDir()) ? undefined : dest, setupDone: true })
  try {
    await attachToDataDir(mode)
  } catch (e) {
    // Volvemos a la carpeta anterior si algo falla
    setDataDirPath(previous)
    writeConfig({ ...readConfig(), dataDir: samePath(previous, defaultDataDir()) ? undefined : previous })
    await attachToDataDir('use').catch(() => undefined)
    throw e
  }

  let removedPrevious = false
  if (wasEmpty) {
    await removeIfEmpty(previous)
    removedPrevious = !existsSync(previous)
  }
  return { previous, removedPrevious }
}

export function markSetupDone(): void {
  writeConfig({ ...readConfig(), setupDone: true })
}
