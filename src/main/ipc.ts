import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { ExportFormat, Result } from '@shared/types'
import * as clients from './clients'
import * as files from './files'
import * as trash from './trash'
import * as exporter from './exporter'
import * as backup from './backup'
import { UserError } from './fsutil'
import { getDataDir } from './paths'

function errorMessage(e: unknown): string {
  if (e instanceof UserError) return e.message
  const err = e as NodeJS.ErrnoException
  if (err?.code === 'EBUSY' || err?.code === 'EPERM' || err?.code === 'EACCES') {
    return 'Windows no permite esta operación. Comprueba que el archivo no esté abierto en otro programa.'
  }
  if (err?.code === 'ENOSPC') return 'No queda espacio en el disco.'
  if (err?.code === 'ENOENT') return 'No se ha encontrado el archivo o la carpeta.'
  console.error(e)
  return 'Ha ocurrido un error inesperado: ' + (err?.message ?? String(e))
}

/** Registra un canal IPC que siempre devuelve { ok, data } o { ok: false, error } */
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (e) {
      return { ok: false, error: errorMessage(e) }
    }
  })
}

const win = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

const FILTERS: Record<ExportFormat, Electron.FileFilter> = {
  pdf: { name: 'Documento PDF', extensions: ['pdf'] },
  xlsx: { name: 'Libro de Excel', extensions: ['xlsx'] },
  csv: { name: 'Archivo CSV', extensions: ['csv'] }
}

async function askSavePath(defaultName: string, filter: Electron.FileFilter): Promise<string | null> {
  const w = win()
  const opts: Electron.SaveDialogOptions = {
    title: 'Guardar como',
    defaultPath: `${app.getPath('downloads')}/${defaultName}`,
    filters: [filter],
    buttonLabel: 'Guardar'
  }
  const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
  return res.canceled || !res.filePath ? null : res.filePath
}

/** Solo se pueden abrir desde la interfaz los archivos que acaba de generar LawChest */
const generated = new Set<string>()
const remember = (p: string): string => {
  generated.add(p)
  return p
}

export function registerIpc(): void {
  /* App */
  handle('app:info', () => ({ version: app.getVersion(), dataDir: getDataDir(), trashRetentionDays: trash.TRASH_RETENTION_DAYS }))
  handle('app:openDataDir', async () => {
    await shell.openPath(getDataDir())
  })

  /* Clientes */
  handle('clients:list', () => clients.listClients())
  handle('clients:get', (id: number) => clients.getClient(id))
  handle('clients:create', (input) => clients.createClient(input as Parameters<typeof clients.createClient>[0]))
  handle('clients:update', (id: number, input) => clients.updateClient(id, input as Parameters<typeof clients.updateClient>[1]))
  handle('clients:delete', (id: number) => trash.trashClient(id))
  handle('clients:openFolder', async (id: number) => {
    const p = await clients.ensureClientRoot(id)
    const err = await shell.openPath(p)
    if (err) throw new UserError(err)
  })

  /* Movimientos */
  handle('movements:list', (clientId: number) => clients.listMovements(clientId))
  handle('movements:create', (clientId: number, input) => clients.createMovement(clientId, input as Parameters<typeof clients.createMovement>[1]))
  handle('movements:update', (id: number, input) => clients.updateMovement(id, input as Parameters<typeof clients.updateMovement>[1]))
  handle('movements:delete', (id: number) => clients.deleteMovement(id))

  /* Archivos */
  handle('files:list', (clientId: number, rel: string) => files.listFiles(clientId, rel))
  handle('files:folders', (clientId: number) => files.listAllFolders(clientId))
  handle('files:createFolder', (clientId: number, rel: string, name: string) => files.createFolder(clientId, rel, name))
  handle('files:addPaths', (clientId: number, rel: string, paths: string[]) => files.addPaths(clientId, rel, paths))
  handle('files:addBuffer', (clientId: number, rel: string, name: string, data: Uint8Array) => files.addBuffer(clientId, rel, name, data))
  handle('files:rename', (clientId: number, rel: string, name: string) => files.renameEntry(clientId, rel, name))
  handle('files:move', (clientId: number, rel: string, targetDir: string) => files.moveEntry(clientId, rel, targetDir))
  handle('files:delete', (clientId: number, rel: string) => trash.trashEntry(clientId, rel))
  handle('files:open', async (clientId: number, rel: string) => {
    const err = await shell.openPath(await files.entryPath(clientId, rel))
    if (err) throw new UserError('No hay ningún programa instalado para abrir este archivo.')
  })
  handle('files:showInFolder', async (clientId: number, rel: string) => {
    shell.showItemInFolder(await files.entryPath(clientId, rel))
  })
  handle('files:pick', async (mode: 'files' | 'folder') => {
    const w = win()
    const opts: Electron.OpenDialogOptions = {
      title: mode === 'folder' ? 'Elige una carpeta para añadir' : 'Elige los archivos para añadir',
      buttonLabel: 'Añadir',
      properties: mode === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? [] : res.filePaths
  })
  /** Archivos copiados en el Explorador de Windows (Ctrl+C) */
  handle('files:clipboardPaths', () => {
    const out: string[] = []
    if (process.platform === 'win32') {
      try {
        const raw = clipboard.readBuffer('FileNameW')
        if (raw && raw.length) {
          const p = raw.toString('ucs2').replace(/\u0000+$/g, '').split('\u0000')[0]
          if (p) out.push(p)
        }
      } catch {
        /* sin archivos en el portapapeles */
      }
    }
    return out
  })

  /* Papelera */
  handle('trash:list', () => trash.listTrash())
  handle('trash:restore', (id: number) => trash.restoreTrash(id))
  handle('trash:delete', (id: number) => trash.deleteTrashForever(id))
  handle('trash:empty', () => trash.emptyTrash())

  /* Resúmenes */
  handle('summary:month', (year: number, month: number) => clients.movementsForMonth(year, month))
  handle('export:client', async (clientId: number, format: ExportFormat) => {
    const path = await askSavePath(exporter.clientSummaryFileName(clientId, format), FILTERS[format])
    if (!path) return null
    await exporter.exportClientSummary(clientId, format, path)
    return remember(path)
  })
  handle('export:monthly', async (year: number, month: number, format: ExportFormat) => {
    const path = await askSavePath(exporter.monthlySummaryFileName(year, month, format), FILTERS[format])
    if (!path) return null
    await exporter.exportMonthlySummary(year, month, format, path)
    return remember(path)
  })
  handle('shell:openPath', async (p: string) => {
    if (!generated.has(p)) throw new UserError('Ruta no permitida.')
    await shell.openPath(p)
  })
  handle('shell:showItem', (p: string) => {
    if (!generated.has(p)) throw new UserError('Ruta no permitida.')
    shell.showItemInFolder(p)
  })

  /* Copias de seguridad */
  handle('backup:create', async () => {
    const path = await askSavePath(backup.backupFileName(), { name: 'Copia de LawChest', extensions: ['zip'] })
    if (!path) return null
    await backup.createBackup(path)
    return remember(path)
  })
  handle('backup:pick', async () => {
    const w = win()
    const opts: Electron.OpenDialogOptions = {
      title: 'Elige la copia de seguridad',
      buttonLabel: 'Elegir',
      filters: [{ name: 'Copia de LawChest', extensions: ['zip'] }],
      properties: ['openFile']
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : res.filePaths[0]
  })
  handle('backup:restore', (path: string) => backup.restoreBackup(path))
}
