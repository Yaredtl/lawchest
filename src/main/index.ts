import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { defaultDataDir, ensureDataDirs } from './paths'
import { closeDb } from './db'
import { registerIpc } from './ipc'
import { purgeExpired } from './trash'
import { checkDirty, flush, initStore, poll } from './store'
import { configExists, writeConfig } from './config'
import { startAutoCheck } from './updater'
import { finalSync, scheduleSync, startGSync } from './gsync'

// Una sola ventana de LawChest abierta a la vez
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'LawChest',
    backgroundColor: '#FFFFFF',
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged
    }
  })

  // Al volver a LawChest comprobamos si hay cambios hechos en el otro ordenador;
  // al salir de la ventana guardamos enseguida lo pendiente
  let lastFocusSync = 0
  mainWindow.on('focus', () => {
    poll()
    // También se buscan cambios en Google Drive (como mucho una vez por minuto)
    if (Date.now() - lastFocusSync > 60 * 1000) {
      lastFocusSync = Date.now()
      scheduleSync(1500)
    }
  })
  mainWindow.on('blur', () => flush())

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  // Nunca se navega fuera de la app ni se abren ventanas nuevas
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(async () => {
  app.setAppUserModelId('com.lawchest.app')
  Menu.setApplicationMenu(null)
  // Usuarios de la versión 1.0: ya tienen sus datos en Documentos\LawChest
  if (!configExists() && existsSync(join(defaultDataDir(), 'lawchest.db'))) writeConfig({ setupDone: true })
  ensureDataDirs()
  await initStore()
  registerIpc()
  // Limpieza automática de la papelera (al abrir y cada 6 horas)
  const purge = (): Promise<void> =>
    purgeExpired()
      .then(() => checkDirty())
      .catch((e) => console.error('Error limpiando la papelera', e))
  await purge()
  setInterval(purge, 6 * 60 * 60 * 1000)
  // Cambios desde el otro ordenador
  setInterval(() => poll(), 15 * 1000)
  createWindow()
  startAutoCheck()
  startGSync()
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  flush()
    .catch(() => undefined)
    .then(() => finalSync())
    .catch(() => undefined)
    .finally(() => {
      closeDb()
      app.quit()
    })
})

app.on('window-all-closed', () => {
  app.quit()
})
