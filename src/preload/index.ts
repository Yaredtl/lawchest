import { contextBridge, ipcRenderer, webUtils } from 'electron'

const call = (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args)

const api = {
  call,
  /** Ruta real en disco de un archivo arrastrado o pegado (vacío si no la tiene) */
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  }
}

contextBridge.exposeInMainWorld('lawchest', api)


