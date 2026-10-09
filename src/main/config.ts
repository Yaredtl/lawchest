import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'

/** Ajustes propios de cada ordenador (se guardan en AppData, no se sincronizan) */
export interface LocalConfig {
  /** Carpeta de datos elegida (si no hay, se usa Documentos\LawChest) */
  dataDir?: string
  /** Ya se ha mostrado la bienvenida / elegido dónde guardar los datos */
  setupDone?: boolean
}

/** Estado de la sincronización de la base de datos en este ordenador */
export interface SyncState {
  dataDir?: string
  /** Revisión de la base de datos compartida que tenemos cargada */
  baseRev: number
  /** Hay cambios locales que todavía no se han guardado en la carpeta compartida */
  dirty: boolean
  /** mtime + tamaño del lawchest.db compartido la última vez que lo vimos */
  seenMtime: number
  seenSize: number
}

export const localDir = (): string => {
  const dir = process.env.LAWCHEST_LOCAL_DIR || join(app.getPath('userData'), 'datos-locales')
  mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    return { ...fallback, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

const configFile = (): string => join(localDir(), 'config.json')
const syncFile = (): string => join(localDir(), 'sync.json')

export const configExists = (): boolean => existsSync(configFile())
export const readConfig = (): LocalConfig => readJson<LocalConfig>(configFile(), {})
export const writeConfig = (c: LocalConfig): void => writeJson(configFile(), c)

export const readSyncState = (): SyncState =>
  readJson<SyncState>(syncFile(), { baseRev: 0, dirty: false, seenMtime: 0, seenSize: 0 })
export const writeSyncState = (s: SyncState): void => writeJson(syncFile(), s)
