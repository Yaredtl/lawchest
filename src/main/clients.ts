import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import type { Client, ClientField, ClientInput, ClientSummary, Movement, MovementInput } from '@shared/types'
import { getDb, nowIso } from './db'
import { clientsDir } from './paths'
import { toFolderName, uniqueName, UserError } from './fsutil'

type Row = Record<string, unknown>

function mapClient(r: Row): Client {
  let fields: ClientField[] = []
  try {
    fields = JSON.parse(String(r.fields ?? '[]'))
  } catch {
    fields = []
  }
  return {
    id: Number(r.id),
    name: String(r.name),
    folder: String(r.folder),
    fields,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

function mapMovement(r: Row): Movement {
  return {
    id: Number(r.id),
    clientId: Number(r.client_id),
    concept: String(r.concept),
    type: r.type === 'gasto' ? 'gasto' : 'ingreso',
    amount: Number(r.amount),
    date: r.date ? String(r.date) : null,
    createdAt: String(r.created_at)
  }
}

function cleanFields(fields: ClientField[] | undefined): ClientField[] {
  return (fields ?? [])
    .map((f) => ({ label: String(f.label ?? '').trim().slice(0, 80), value: String(f.value ?? '').trim().slice(0, 2000) }))
    .filter((f) => f.label && f.value)
}

function cleanName(name: string): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!n) throw new UserError('El nombre del cliente es obligatorio.')
  if (n.length > 150) throw new UserError('El nombre es demasiado largo (máximo 150 caracteres).')
  return n
}

export function listClients(): ClientSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*,
        COALESCE(SUM(CASE WHEN m.type = 'ingreso' THEN m.amount END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN m.type = 'gasto' THEN m.amount END), 0) AS gastos,
        COUNT(m.id) AS movements_count
       FROM clients c LEFT JOIN movements m ON m.client_id = c.id
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`
    )
    .all() as Row[]
  return rows.map((r) => {
    const ingresos = Number(r.ingresos)
    const gastos = Number(r.gastos)
    return { ...mapClient(r), ingresos, gastos, balance: ingresos - gastos, movementsCount: Number(r.movements_count) }
  })
}

export function getClient(id: number): Client {
  const r = getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id) as Row | undefined
  if (!r) throw new UserError('El cliente no existe.')
  return mapClient(r)
}

export function clientRoot(id: number): string {
  const c = getClient(id)
  const dir = join(clientsDir(), c.folder)
  return dir
}

export async function ensureClientRoot(id: number): Promise<string> {
  const dir = clientRoot(id)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function createClient(input: ClientInput): Promise<Client> {
  const name = cleanName(input.name)
  const fields = cleanFields(input.fields)
  const folder = uniqueName(clientsDir(), toFolderName(name))
  await fs.mkdir(join(clientsDir(), folder), { recursive: true })
  const now = nowIso()
  const res = getDb()
    .prepare('INSERT INTO clients (name, folder, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, folder, JSON.stringify(fields), now, now)
  return getClient(Number(res.lastInsertRowid))
}

export async function updateClient(id: number, input: ClientInput): Promise<Client> {
  const current = getClient(id)
  const name = cleanName(input.name)
  const fields = cleanFields(input.fields)
  let folder = current.folder
  // Si cambia el nombre, renombramos también su carpeta para que coincida
  const wanted = toFolderName(name)
  if (wanted.toLowerCase() !== current.folder.toLowerCase()) {
    const target = uniqueName(clientsDir(), wanted)
    const from = join(clientsDir(), current.folder)
    try {
      if (existsSync(from)) await fs.rename(from, join(clientsDir(), target))
      else await fs.mkdir(join(clientsDir(), target), { recursive: true })
      folder = target
    } catch {
      // Si Windows bloquea la carpeta (un archivo abierto), mantenemos la carpeta anterior
      folder = current.folder
    }
  } else if (wanted !== current.folder) {
    // Solo cambian mayúsculas/minúsculas
    const from = join(clientsDir(), current.folder)
    const tmp = join(clientsDir(), `${current.folder}.__tmp__`)
    try {
      await fs.rename(from, tmp)
      await fs.rename(tmp, join(clientsDir(), wanted))
      folder = wanted
    } catch {
      folder = current.folder
    }
  }
  getDb()
    .prepare('UPDATE clients SET name = ?, fields = ?, folder = ?, updated_at = ? WHERE id = ?')
    .run(name, JSON.stringify(fields), folder, nowIso(), id)
  return getClient(id)
}

/* ---------------------------- Movimientos ---------------------------- */

function cleanMovement(input: MovementInput): MovementInput {
  const concept = String(input.concept ?? '').trim()
  if (!concept) throw new UserError('El concepto es obligatorio.')
  if (concept.length > 300) throw new UserError('El concepto es demasiado largo (máximo 300 caracteres).')
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount) || amount < 0) throw new UserError('El importe no es válido.')
  if (amount > 100_000_000_000) throw new UserError('El importe es demasiado grande.')
  const type = input.type === 'gasto' ? 'gasto' : 'ingreso'
  let date: string | null = input.date ? String(input.date) : null
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError('La fecha no es válida.')
  if (date === '') date = null
  return { concept, amount, type, date }
}

export function listMovements(clientId: number): Movement[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM movements WHERE client_id = ?
       ORDER BY COALESCE(date, substr(created_at, 1, 10)) DESC, id DESC`
    )
    .all(clientId) as Row[]
  return rows.map(mapMovement)
}

export function createMovement(clientId: number, input: MovementInput): Movement {
  getClient(clientId)
  const m = cleanMovement(input)
  const res = getDb()
    .prepare('INSERT INTO movements (client_id, concept, type, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(clientId, m.concept, m.type, m.amount, m.date, nowIso())
  return mapMovement(getDb().prepare('SELECT * FROM movements WHERE id = ?').get(Number(res.lastInsertRowid)) as Row)
}

export function updateMovement(id: number, input: MovementInput): Movement {
  const m = cleanMovement(input)
  const res = getDb()
    .prepare('UPDATE movements SET concept = ?, type = ?, amount = ?, date = ? WHERE id = ?')
    .run(m.concept, m.type, m.amount, m.date, id)
  if (Number(res.changes) === 0) throw new UserError('El movimiento no existe.')
  return mapMovement(getDb().prepare('SELECT * FROM movements WHERE id = ?').get(id) as Row)
}

export function deleteMovement(id: number): void {
  getDb().prepare('DELETE FROM movements WHERE id = ?').run(id)
}

/** Movimientos de todos los clientes de un mes (los sin fecha cuentan en el mes en que se registraron) */
export function movementsForMonth(year: number, month: number): { client: Client; movements: Movement[] }[] {
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const rows = getDb()
    .prepare(
      `SELECT * FROM movements
       WHERE substr(COALESCE(date, substr(created_at, 1, 10)), 1, 7) = ?
       ORDER BY COALESCE(date, substr(created_at, 1, 10)) ASC, id ASC`
    )
    .all(ym) as Row[]
  const byClient = new Map<number, Movement[]>()
  for (const r of rows) {
    const m = mapMovement(r)
    if (!byClient.has(m.clientId)) byClient.set(m.clientId, [])
    byClient.get(m.clientId)!.push(m)
  }
  return listClients()
    .filter((c) => byClient.has(c.id))
    .map((c) => ({ client: c, movements: byClient.get(c.id)! }))
}

export { mapClient, mapMovement }
