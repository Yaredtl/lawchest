import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type { ExportFormat, Result } from '@shared/types'
import * as clients from './clients'
import * as files from './files'
import * as trash from './trash'
import * as exporter from './exporter'
import * as backup from './backup'
import * as datadir from './datadir'
import * as updater from './updater'
import * as uninstaller from './uninstall'
import * as gsync from './gsync'
import { authEvents } from './gauth'
import { checkDirty, flush, poll, storeStatus, syncEvents } from './store'
import { UserError } from './fsutil'
import { getDataDir } from './paths'
import { configExists, readConfig } from './config'

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

/** Canales que cambian archivos o datos: tras ellos se sincroniza con Google Drive */
const MUTATING = new Set([
  'clients:create', 'clients:update', 'clients:delete',
  'movements:create', 'movements:update', 'movements:delete',
  'files:createFolder', 'files:addPaths', 'files:addBuffer', 'files:rename', 'files:move', 'files:delete',
  'trash:restore', 'trash:delete', 'trash:empty', 'backup:restore'
])

/** Registra un canal IPC que siempre devuelve { ok, data } o { ok: false, error } */
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...(args as A)) }
    } catch (e) {
      return { ok: false, error: errorMessage(e) }
    } finally {
      // Si la operación cambió la base de datos, se guarda en la carpeta de datos (sincronizada)
      try {
        checkDirty()
      } catch {
        /* base de datos cerrándose */
      }
      if (MUTATING.has(channel)) gsync.scheduleSync()
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

function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

export function registerIpc(): void {
  syncEvents.on('reloaded', () => broadcast('sync:reloaded'))
  syncEvents.on('conflict', (info) => broadcast('sync:conflict', info))
  syncEvents.on('error', (msg) => broadcast('sync:error', msg))
  syncEvents.on('saved', () => broadcast('sync:saved'))
  gsync.gsyncEvents.on('status', () => broadcast('gdrive:status', gsync.gsyncStatus()))
  gsync.gsyncEvents.on('filesChanged', () => broadcast('sync:reloaded'))
  authEvents.on('changed', () => broadcast('gdrive:status', gsync.gsyncStatus()))

  /* Google Drive (por internet) */
  handle('gdrive:status', () => gsync.gsyncStatus())
  handle('gdrive:connect', async () => {
    await gsync.enableGoogleDrive()
    return gsync.gsyncStatus()
  })
  handle('gdrive:reconnect', async () => {
    await gsync.reconnectGoogleDrive()
    return gsync.gsyncStatus()
  })
  handle('gdrive:disconnect', async () => {
    await gsync.disableGoogleDrive()
    return gsync.gsyncStatus()
  })
  handle('gdrive:syncNow', async () => {
    await gsync.syncNow()
    return gsync.gsyncStatus()
  })

  /* Carpeta de datos y sincronización entre ordenadores */
  handle('settings:get', () => {
    const dataDir = getDataDir()
    return {
      dataDir,
      provider: datadir.detectProvider(dataDir),
      firstRun: !readConfig().setupDone,
      suggestions: datadir.cloudSuggestions(),
      sync: storeStatus(),
      version: app.getVersion(),
      updatesSupported: updater.updatesSupported(),
      uninstallSupported: uninstaller.uninstallSupported(),
      gdrive: gsync.gsyncStatus(),
      configExists: configExists()
    }
  })
  handle('settings:pickFolder', async () => {
    const w = win()
    const opts: Electron.OpenDialogOptions = {
      title: 'Elige dónde guardar los datos de LawChest',
      buttonLabel: 'Elegir esta carpeta',
      properties: ['openDirectory', 'createDirectory']
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return datadir.inspectFolder(res.filePaths[0])
  })
  handle('settings:inspect', (p: string) => datadir.inspectFolder(p))
  handle('settings:switch', (target: string, mode: 'use' | 'move') => datadir.switchDataDir(target, mode))
  handle('settings:setupDone', () => datadir.markSetupDone())
  handle('sync:status', () => storeStatus())
  handle('sync:now', async () => {
    await flush()
    await poll()
    return storeStatus()
  })

  handle('app:uninstall', (deleteData: boolean) => uninstaller.uninstall(!!deleteData))

  /* Actualizaciones */
  handle('update:state', () => updater.getUpdateState())
  handle('update:check', () => updater.checkForUpdates())
  handle('update:download', () => updater.downloadUpdate())
  handle('update:install', () => updater.installUpdate())

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
