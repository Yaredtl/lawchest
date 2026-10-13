/** Cliente mínimo de la API de Google Drive v3 (sin dependencias) */
import { createReadStream, createWriteStream, promises as fs } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { getAccessToken, invalidateAccessToken } from './gauth'

const API = (process.env.LAWCHEST_GDRIVE_API || 'https://www.googleapis.com').replace(/\/$/, '')
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FIELDS = 'id,name,mimeType,md5Checksum,modifiedTime,size,parents,trashed,appProperties'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  md5Checksum?: string
  modifiedTime?: string
  size?: string
  parents?: string[]
  appProperties?: Record<string, string>
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Petición autenticada con reintentos (límites de Google, cortes de red) */
async function request(path: string, init: RequestInit & { noRetry?: boolean } = {}, attempt = 0): Promise<Response> {
  const token = await getAccessToken()
  const { noRetry: _noRetry, ...fetchInit } = init
  void _noRetry
  let res: Response
  try {
    res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
      ...fetchInit,
      headers: { Authorization: `Bearer ${token}`, ...((fetchInit.headers as Record<string, string>) ?? {}) }
    } as RequestInit)
  } catch (e) {
    if (attempt < 4 && !init.noRetry) {
      await sleep(1000 * 2 ** attempt)
      return request(path, init, attempt + 1)
    }
    throw new Error('Sin conexión con Google Drive.')
  }
  if ((res.status === 429 || res.status >= 500 || res.status === 403) && attempt < 5 && !init.noRetry) {
    const text = res.status === 403 ? await res.clone().text() : ''
    if (res.status !== 403 || /rateLimit|userRateLimitExceeded/.test(text)) {
      await sleep(1000 * 2 ** attempt + Math.random() * 500)
      return request(path, init, attempt + 1)
    }
  }
  if (res.status === 401 && attempt === 0) {
    // Token caducado o revocado: se renueva (y si Google ya no lo permite, se pide reconectar)
    invalidateAccessToken()
    return request(path, init, attempt + 1)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 404) throw new NotFoundError(text)
    if (res.status === 403 && /storageQuotaExceeded/.test(text)) throw new Error('Tu Google Drive está lleno.')
    throw new Error(`Google Drive respondió ${res.status}: ${text.slice(0, 200)}`)
  }
  return res
}

export class NotFoundError extends Error {}

const q = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export async function listQuery(query: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ q: query, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000', spaces: 'drive' })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await request(`/drive/v3/files?${params}`)
    const json = (await res.json()) as { files: DriveFile[]; nextPageToken?: string }
    out.push(...json.files)
    pageToken = json.nextPageToken
  } while (pageToken)
  return out
}

export const listChildren = (folderId: string): Promise<DriveFile[]> => listQuery(`'${q(folderId)}' in parents and trashed = false`)

export async function getFile(id: string): Promise<DriveFile | null> {
  try {
    const res = await request(`/drive/v3/files/${id}?fields=${FIELDS}`)
    const f = (await res.json()) as DriveFile & { trashed?: boolean }
    return f.trashed ? null : f
  } catch (e) {
    if (e instanceof NotFoundError) return null
    throw e
  }
}

export async function createFolder(name: string, parentId: string, appProperties?: Record<string, string>): Promise<DriveFile> {
  const res = await request(`/drive/v3/files?fields=${FIELDS}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties })
  })
  return (await res.json()) as DriveFile
}

/** Busca la carpeta «LawChest» de la persona (o la crea) */
export async function findOrCreateRoot(knownId?: string): Promise<DriveFile> {
  if (knownId) {
    const f = await getFile(knownId)
    if (f && f.mimeType === FOLDER_MIME) return f
  }
  const marked = await listQuery(`appProperties has { key='lawchest' and value='root' } and trashed = false`)
  if (marked[0]) return marked[0]
  const byName = await listQuery(`name = 'LawChest' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`)
  if (byName[0]) return byName[0]
  return createFolder('LawChest', 'root', { lawchest: 'root' })
}

/** Sube un archivo nuevo o sustituye el contenido de uno existente (subida reanudable) */
export async function uploadFile(localPath: string, opts: { name: string; parentId?: string; fileId?: string; modifiedTime?: string }): Promise<DriveFile> {
  const stat = await fs.stat(localPath)
  const meta: Record<string, unknown> = { name: opts.name }
  if (opts.modifiedTime) meta.modifiedTime = opts.modifiedTime
  if (!opts.fileId && opts.parentId) meta.parents = [opts.parentId]
  const init = await request(
    opts.fileId
      ? `/upload/drive/v3/files/${opts.fileId}?uploadType=resumable&fields=${FIELDS}`
      : `/upload/drive/v3/files?uploadType=resumable&fields=${FIELDS}`,
    {
      method: opts.fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(stat.size) },
      body: JSON.stringify(meta)
    }
  )
  const location = init.headers.get('location')
  if (!location) throw new Error('Google Drive no aceptó la subida.')
  for (let attempt = 0; ; attempt++) {
    try {
      // duplex: 'half' es necesario para enviar un stream con fetch de Node
      const res = await request(location, {
        method: 'PUT',
        noRetry: true,
        headers: { 'Content-Length': String(stat.size) },
        body: (stat.size === 0 ? Buffer.alloc(0) : Readable.toWeb(createReadStream(localPath))) as unknown as RequestInit['body'],
        duplex: 'half'
      } as RequestInit & { noRetry: boolean })
      return (await res.json()) as DriveFile
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}

/** Descarga el contenido a un archivo temporal y lo coloca en su sitio de golpe */
export async function downloadFile(id: string, target: string, modifiedTime?: string): Promise<void> {
  const res = await request(`/drive/v3/files/${id}?alt=media`)
  const tmp = `${target}.lawchest-descarga`
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp))
  await fs.rename(tmp, target).catch(async (e) => {
    await fs.rm(tmp, { force: true })
    throw e
  })
  if (modifiedTime) {
    const t = new Date(modifiedTime)
    await fs.utimes(target, t, t).catch(() => undefined)
  }
}

export async function updateMeta(id: string, patch: { name?: string; addParents?: string; removeParents?: string; trashed?: boolean }): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: FIELDS })
  if (patch.addParents) params.set('addParents', patch.addParents)
  if (patch.removeParents) params.set('removeParents', patch.removeParents)
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.trashed !== undefined) body.trashed = patch.trashed
  const res = await request(`/drive/v3/files/${id}?${params}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return (await res.json()) as DriveFile
}

/** Envía a la papelera de Google Drive (se puede recuperar durante 30 días) */
export const trashFile = (id: string): Promise<DriveFile> => updateMeta(id, { trashed: true })
