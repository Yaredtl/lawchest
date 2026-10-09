import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { readConfig } from './config'

let dataDir: string | null = null

export const defaultDataDir = (): string => join(app.getPath('documents'), 'LawChest')

/**
 * Carpeta de datos: por defecto Documentos\LawChest. Puede estar dentro de
 * OneDrive / Google Drive / Dropbox para usar LawChest en varios ordenadores.
 */
export function getDataDir(): string {
  if (!dataDir) {
    dataDir = process.env.LAWCHEST_DATA_DIR || readConfig().dataDir || defaultDataDir()
  }
  return dataDir
}

export function setDataDirPath(dir: string): void {
  dataDir = dir
}

export const clientsDir = (): string => join(getDataDir(), 'Clientes')
export const trashDir = (): string => join(getDataDir(), 'Papelera')
/** Base de datos compartida (la copia "oficial" que se sincroniza entre ordenadores) */
export const dbPath = (): string => join(getDataDir(), 'lawchest.db')

export function ensureDataDirs(): void {
  mkdirSync(clientsDir(), { recursive: true })
  mkdirSync(trashDir(), { recursive: true })
}

export function fontsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'fonts')
    : join(app.getAppPath(), 'resources', 'fonts')
}
