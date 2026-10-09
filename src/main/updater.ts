import { app, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { flush } from './store'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none'; checkedAt: string }
  | { status: 'available'; version: string; notes: string; date: string | null }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

let state: UpdateState = { status: 'idle' }
let configured = false

function send(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:state', state)
}

function set(s: UpdateState): void {
  state = s
  send()
}

function notesText(info: UpdateInfo): string {
  const n = info.releaseNotes
  if (!n) return ''
  const raw = typeof n === 'string' ? n : n.map((x) => x.note ?? '').join('\n')
  // Las notas de GitHub llegan en HTML: nos quedamos con el texto
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function configure(): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: new Date().toISOString() }))
  autoUpdater.on('update-available', (info) =>
    set({ status: 'available', version: info.version, notes: notesText(info), date: info.releaseDate ?? null })
  )
  autoUpdater.on('download-progress', (p) => {
    const version = state.status === 'downloading' || state.status === 'available' ? state.version : ''
    set({ status: 'downloading', version, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (e) => {
    console.error('Actualizaciones:', e)
    set({ status: 'error', message: 'No se ha podido comprobar si hay actualizaciones. Comprueba la conexión a internet.' })
  })
}

export const updatesSupported = (): boolean => app.isPackaged && process.platform === 'win32'

export function getUpdateState(): UpdateState {
  return state
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!updatesSupported()) {
    set({ status: 'none', checkedAt: new Date().toISOString() })
    return state
  }
  configure()
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    /* el evento 'error' ya actualiza el estado */
  }
  return state
}

export async function downloadUpdate(): Promise<void> {
  if (!updatesSupported()) return
  configure()
  if (state.status === 'available') set({ status: 'downloading', version: state.version, percent: 0 })
  await autoUpdater.downloadUpdate()
}

export async function installUpdate(): Promise<void> {
  if (state.status !== 'ready') return
  await flush().catch(() => undefined)
  // Instalación silenciosa y LawChest se vuelve a abrir solo
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}

/** Comprobación automática al abrir la app y cada 6 horas */
export function startAutoCheck(): void {
  if (!updatesSupported()) return
  setTimeout(() => checkForUpdates(), 8000)
  setInterval(() => {
    if (state.status === 'idle' || state.status === 'none' || state.status === 'error') checkForUpdates()
  }, 6 * 60 * 60 * 1000)
}
