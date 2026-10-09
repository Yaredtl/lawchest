import { promises as fs, existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import type { TrashItem, TrashKind, Movement } from '@shared/types'
import { getDb, nowIso, tx } from './db'
import { clientsDir, trashDir } from './paths'
import { getClient, ensureClientRoot, listMovements, mapClient } from './clients'
import { safeJoin, movePath, pathSize, uniqueName, toRel, UserError } from './fsutil'

export const TRASH_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

type Row = Record<string, unknown>

interface FilePayload {
  clientId: number
}
interface ClientPayload {
  client: Row
  movements: Movement[]
}

const storageOf = (id: number): string => join(trashDir(), String(id))

function insertTrash(kind: TrashKind, name: string, clientId: number | null, clientName: string | null, originalPath: string | null, payload: object, size: number): number {
  const res = getDb()
    .prepare(
      'INSERT INTO trash (kind, name, client_id, client_name, original_path, payload, size, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(kind, name, clientId, clientName, originalPath, JSON.stringify(payload), size, nowIso())
  return Number(res.lastInsertRowid)
}

/** Envía un archivo o carpeta de un cliente a la papelera */
export async function trashEntry(clientId: number, rel: string): Promise<void> {
  const client = getClient(clientId)
  const root = await ensureClientRoot(clientId)
  if (!rel) throw new UserError('No se puede borrar la carpeta principal del cliente.')
  const full = safeJoin(root, rel)
  if (!existsSync(full)) throw new UserError('El elemento ya no existe.')
  const st = await fs.stat(full)
  const size = await pathSize(full)
  const id = insertTrash(st.isDirectory() ? 'carpeta' : 'archivo', basename(full), clientId, client.name, rel, { clientId } as FilePayload, size)
  try {
    await fs.mkdir(storageOf(id), { recursive: true })
    await movePath(full, join(storageOf(id), basename(full)))
  } catch (e) {
    getDb().prepare('DELETE FROM trash WHERE id = ?').run(id)
    await fs.rm(storageOf(id), { recursive: true, force: true }).catch(() => undefined)
    throw new UserError('No se pudo borrar. Comprueba que el archivo no esté abierto en otro programa.')
  }
}

/** Envía un cliente completo (carpeta + datos + movimientos) a la papelera */
export async function trashClient(clientId: number): Promise<void> {
  const client = getClient(clientId)
  const row = getDb().prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Row
  const movements = listMovements(clientId)
  const folder = join(clientsDir(), client.folder)
  const size = await pathSize(folder)
  const id = insertTrash('cliente', client.name, clientId, client.name, client.folder, { client: row, movements } as ClientPayload, size)
  try {
    await fs.mkdir(storageOf(id), { recursive: true })
    if (existsSync(folder)) await movePath(folder, join(storageOf(id), 'carpeta'))
  } catch {
    getDb().prepare('DELETE FROM trash WHERE id = ?').run(id)
    await fs.rm(storageOf(id), { recursive: true, force: true }).catch(() => undefined)
    throw new UserError('No se pudo borrar el cliente. Comprueba que ningún archivo suyo esté abierto en otro programa.')
  }
  getDb().prepare('DELETE FROM clients WHERE id = ?').run(clientId)
}

export function listTrash(): TrashItem[] {
  const rows = getDb().prepare('SELECT * FROM trash ORDER BY deleted_at DESC').all() as Row[]
  const now = Date.now()
  return rows.map((r) => {
    const deleted = new Date(String(r.deleted_at)).getTime()
    const daysLeft = Math.max(0, Math.ceil((deleted + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS))
    return {
      id: Number(r.id),
      kind: String(r.kind) as TrashKind,
      name: String(r.name),
      clientName: r.client_name ? String(r.client_name) : null,
      originalPath: r.original_path ? String(r.original_path) : null,
      deletedAt: String(r.deleted_at),
      daysLeft,
      size: Number(r.size)
    }
  })
}

export async function restoreTrash(id: number): Promise<string> {
  const r = getDb().prepare('SELECT * FROM trash WHERE id = ?').get(id) as Row | undefined
  if (!r) throw new UserError('El elemento ya no está en la papelera.')
  const payload = JSON.parse(String(r.payload || '{}'))
  const storage = storageOf(id)

  if (r.kind === 'cliente') {
    const { client, movements } = payload as ClientPayload
    const c = mapClient(client)
    const exists = getDb().prepare('SELECT id FROM clients WHERE id = ?').get(c.id)
    const folder = uniqueName(clientsDir(), c.folder)
    const src = join(storage, 'carpeta')
    if (existsSync(src)) await movePath(src, join(clientsDir(), folder))
    else await fs.mkdir(join(clientsDir(), folder), { recursive: true })
    tx(() => {
      const ins = getDb().prepare(
        'INSERT INTO clients (id, name, folder, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      const res = exists
        ? getDb()
            .prepare('INSERT INTO clients (name, folder, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(c.name, folder, JSON.stringify(c.fields), c.createdAt, nowIso())
        : ins.run(c.id, c.name, folder, JSON.stringify(c.fields), c.createdAt, nowIso())
      const newId = exists ? Number(res.lastInsertRowid) : c.id
      const insM = getDb().prepare(
        'INSERT INTO movements (client_id, concept, type, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const m of movements) insM.run(newId, m.concept, m.type, m.amount, m.date, m.createdAt)
      getDb().prepare('DELETE FROM trash WHERE id = ?').run(id)
    })
    await fs.rm(storage, { recursive: true, force: true }).catch(() => undefined)
    return `Cliente "${c.name}" restaurado.`
  }

  // Archivo o carpeta
  const { clientId } = payload as FilePayload
  const clientRow = getDb().prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId) as Row | undefined
  if (!clientRow) {
    throw new UserError(`El cliente "${r.client_name}" está en la papelera o ya no existe. Restaura primero el cliente.`)
  }
  const root = await ensureClientRoot(clientId)
  const originalRel = String(r.original_path ?? r.name)
  let targetDir = safeJoin(root, dirname(originalRel) === '.' ? '' : dirname(originalRel))
  // Si la carpeta original ya no existe, la recreamos
  await fs.mkdir(targetDir, { recursive: true }).catch(() => {
    targetDir = root
  })
  const src = join(storage, String(r.name))
  if (!existsSync(src)) {
    getDb().prepare('DELETE FROM trash WHERE id = ?').run(id)
    throw new UserError('El contenido de este elemento ya no se encuentra en la papelera.')
  }
  const name = uniqueName(targetDir, String(r.name))
  await movePath(src, join(targetDir, name))
  getDb().prepare('DELETE FROM trash WHERE id = ?').run(id)
  await fs.rm(storage, { recursive: true, force: true }).catch(() => undefined)
  const where = toRel(root, targetDir) || 'carpeta principal'
  return `"${name}" restaurado en ${clientRow.name} › ${where}.`
}

export async function deleteTrashForever(id: number): Promise<void> {
  getDb().prepare('DELETE FROM trash WHERE id = ?').run(id)
  await fs.rm(storageOf(id), { recursive: true, force: true })
}

export async function emptyTrash(): Promise<number> {
  const ids = (getDb().prepare('SELECT id FROM trash').all() as Row[]).map((r) => Number(r.id))
  getDb().prepare('DELETE FROM trash').run()
  const entries = existsSync(trashDir()) ? await fs.readdir(trashDir()) : []
  for (const e of entries) await fs.rm(join(trashDir(), e), { recursive: true, force: true }).catch(() => undefined)
  return ids.length
}

/** Borra definitivamente lo que lleve más de 30 días en la papelera */
export async function purgeExpired(): Promise<number> {
  const limit = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS).toISOString()
  const rows = getDb().prepare('SELECT id FROM trash WHERE deleted_at < ?').all(limit) as Row[]
  for (const r of rows) await deleteTrashForever(Number(r.id)).catch(() => undefined)
  // Limpieza de restos sin registro
  const known = new Set((getDb().prepare('SELECT id FROM trash').all() as Row[]).map((r) => String(r.id)))
  const entries = existsSync(trashDir()) ? await fs.readdir(trashDir()) : []
  for (const e of entries) {
    if (!known.has(e)) await fs.rm(join(trashDir(), e), { recursive: true, force: true }).catch(() => undefined)
  }
  return rows.length
}
