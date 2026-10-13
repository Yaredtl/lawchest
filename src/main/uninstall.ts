import { app } from 'electron'
import { spawn } from 'child_process'
import { promises as fs, existsSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { closeDb } from './db'
import { flush } from './store'
import { getDataDir } from './paths'
import { UserError } from './fsutil'

const uninstallerPath = (): string => join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`)

export const uninstallSupported = (): boolean => app.isPackaged && process.platform === 'win32' && existsSync(uninstallerPath())

/** Borra solo lo que crea LawChest dentro de la carpeta de datos */
async function deleteDataDir(dir: string): Promise<void> {
  const ours = (name: string): boolean =>
    ['Clientes', 'Papelera', 'Conflictos de sincronización', 'Antes de restaurar'].includes(name) ||
    /^lawchest\.db(-wal|-shm)?$/.test(name) ||
    name.startsWith('.restaurando-') ||
    name.startsWith('.lawchest-guardando-')
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (ours(name)) await fs.rm(join(dir, name), { recursive: true, force: true })
  }
  if (readdirSync(dir).length === 0) await fs.rmdir(dir).catch(() => undefined)
}

/** Desinstala LawChest (y opcionalmente borra los datos) y cierra la app */
export async function uninstall(deleteData: boolean): Promise<void> {
  if (!uninstallSupported()) throw new UserError('La desinstalación solo está disponible en la versión instalada en Windows.')
  await flush().catch(() => undefined)
  if (deleteData) {
    closeDb()
    await deleteDataDir(getDataDir())
  }
  const child = spawn(uninstallerPath(), ['--from-app'], { detached: true, stdio: 'ignore' })
  child.unref()
  setTimeout(() => app.quit(), 300)
}
