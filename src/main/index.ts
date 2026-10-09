import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { ensureDataDirs } from './paths'
import { openDb, closeDb } from './db'
import { registerIpc } from './ipc'
import { purgeExpired } from './trash'

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
  ensureDataDirs()
  openDb()
  registerIpc()
  // Limpieza automática de la papelera (al abrir y cada 6 horas)
  await purgeExpired().catch((e) => console.error('Error limpiando la papelera', e))
  setInterval(() => purgeExpired().catch(() => undefined), 6 * 60 * 60 * 1000)
  createWindow()
})

app.on('window-all-closed', () => {
  closeDb()
  app.quit()
})
