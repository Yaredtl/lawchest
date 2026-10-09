export interface ClientField {
  label: string
  value: string
}

export interface Client {
  id: number
  name: string
  folder: string
  fields: ClientField[]
  createdAt: string
  updatedAt: string
}

export interface ClientSummary extends Client {
  ingresos: number
  gastos: number
  balance: number
  movementsCount: number
}

export type MovementType = 'ingreso' | 'gasto'

export interface Movement {
  id: number
  clientId: number
  concept: string
  type: MovementType
  /** Importe en céntimos (entero) para evitar errores de redondeo */
  amount: number
  /** Fecha opcional en formato YYYY-MM-DD */
  date: string | null
  createdAt: string
}

export interface MovementInput {
  concept: string
  type: MovementType
  amount: number
  date: string | null
}

export interface ClientInput {
  name: string
  fields: ClientField[]
}

export interface FileEntry {
  name: string
  /** Ruta relativa a la carpeta del cliente, con "/" como separador */
  path: string
  isDir: boolean
  size: number
  modified: string
  ext: string
}

export type TrashKind = 'cliente' | 'carpeta' | 'archivo'

export interface TrashItem {
  id: number
  kind: TrashKind
  name: string
  clientName: string | null
  originalPath: string | null
  deletedAt: string
  daysLeft: number
  size: number
}

export type ExportFormat = 'pdf' | 'xlsx' | 'csv'

export interface AppInfo {
  version: string
  dataDir: string
  trashRetentionDays: number
}

export interface Result<T = void> {
  ok: boolean
  data?: T
  error?: string
  canceled?: boolean
}
