import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let dataDir: string | null = null

/** Carpeta de datos: Documentos\LawChest (fuera de la carpeta de instalación) */
export function getDataDir(): string {
  if (!dataDir) {
    dataDir = process.env.LAWCHEST_DATA_DIR || join(app.getPath('documents'), 'LawChest')
  }
  return dataDir
}

export const clientsDir = (): string => join(getDataDir(), 'Clientes')
export const trashDir = (): string => join(getDataDir(), 'Papelera')
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
