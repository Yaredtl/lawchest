import type {
  AppInfo,
  Client,
  ClientInput,
  ClientSummary,
  ExportFormat,
  FileEntry,
  Movement,
  MovementInput,
  Result,
  TrashItem
} from '@shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await window.lawchest.call(channel, ...args)) as Result<T>
  if (!res.ok) throw new Error(res.error || 'Error desconocido')
  return res.data as T
}

export const api = {
  app: {
    info: () => invoke<AppInfo>('app:info'),
    openDataDir: () => invoke<void>('app:openDataDir')
  },
  clients: {
    list: () => invoke<ClientSummary[]>('clients:list'),
    get: (id: number) => invoke<Client>('clients:get', id),
    create: (input: ClientInput) => invoke<Client>('clients:create', input),
    update: (id: number, input: ClientInput) => invoke<Client>('clients:update', id, input),
    remove: (id: number) => invoke<void>('clients:delete', id),
    openFolder: (id: number) => invoke<void>('clients:openFolder', id)
  },
  movements: {
    list: (clientId: number) => invoke<Movement[]>('movements:list', clientId),
    create: (clientId: number, input: MovementInput) => invoke<Movement>('movements:create', clientId, input),
    update: (id: number, input: MovementInput) => invoke<Movement>('movements:update', id, input),
    remove: (id: number) => invoke<void>('movements:delete', id)
  },
  files: {
    list: (clientId: number, path: string) => invoke<FileEntry[]>('files:list', clientId, path),
    folders: (clientId: number) => invoke<string[]>('files:folders', clientId),
    createFolder: (clientId: number, path: string, name: string) => invoke<string>('files:createFolder', clientId, path, name),
    addPaths: (clientId: number, path: string, paths: string[]) => invoke<number>('files:addPaths', clientId, path, paths),
    addBuffer: (clientId: number, path: string, name: string, data: Uint8Array) =>
      invoke<string>('files:addBuffer', clientId, path, name, data),
    rename: (clientId: number, path: string, name: string) => invoke<string>('files:rename', clientId, path, name),
    move: (clientId: number, path: string, targetDir: string) => invoke<string>('files:move', clientId, path, targetDir),
    remove: (clientId: number, path: string) => invoke<void>('files:delete', clientId, path),
    open: (clientId: number, path: string) => invoke<void>('files:open', clientId, path),
    showInFolder: (clientId: number, path: string) => invoke<void>('files:showInFolder', clientId, path),
    pick: (mode: 'files' | 'folder') => invoke<string[]>('files:pick', mode),
    clipboardPaths: () => invoke<string[]>('files:clipboardPaths')
  },
  trash: {
    list: () => invoke<TrashItem[]>('trash:list'),
    restore: (id: number) => invoke<string>('trash:restore', id),
    remove: (id: number) => invoke<void>('trash:delete', id),
    empty: () => invoke<number>('trash:empty')
  },
  summary: {
    month: (year: number, month: number) => invoke<{ client: Client; movements: Movement[] }[]>('summary:month', year, month)
  },
  exports: {
    client: (clientId: number, format: ExportFormat) => invoke<string | null>('export:client', clientId, format),
    monthly: (year: number, month: number, format: ExportFormat) =>
      invoke<string | null>('export:monthly', year, month, format)
  },
  shell: {
    openPath: (p: string) => invoke<void>('shell:openPath', p),
    showItem: (p: string) => invoke<void>('shell:showItem', p)
  },
  backup: {
    create: () => invoke<string | null>('backup:create'),
    pick: () => invoke<string | null>('backup:pick'),
    restore: (path: string) => invoke<string>('backup:restore', path)
  }
}
