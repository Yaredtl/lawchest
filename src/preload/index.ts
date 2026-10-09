import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

const call = (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args)

/** Avisos que el proceso principal puede enviar a la interfaz */
const EVENTS = new Set(['sync:reloaded', 'sync:conflict', 'sync:error', 'sync:saved', 'update:state'])

const api = {
  call,
  /** Ruta real en disco de un archivo arrastrado o pegado (vacío si no la tiene) */
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  on: (channel: string, cb: (payload: unknown) => void): (() => void) => {
    if (!EVENTS.has(channel)) return () => undefined
    const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('lawchest', api)
