import { promises as fs, existsSync } from 'fs'
import { join, resolve, relative, sep, extname, basename } from 'path'

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

export class UserError extends Error {}

/** Valida un nombre de archivo/carpeta introducido por el usuario */
export function validateName(raw: string): string {
  const name = (raw ?? '').trim()
  if (!name) throw new UserError('El nombre no puede estar vacío.')
  if (name.length > 180) throw new UserError('El nombre es demasiado largo (máximo 180 caracteres).')
  if (INVALID_CHARS.test(name)) {
    INVALID_CHARS.lastIndex = 0
    throw new UserError('El nombre no puede contener estos caracteres: < > : " / \\ | ? *')
  }
  if (name === '.' || name === '..' || /[. ]$/.test(name)) {
    throw new UserError('El nombre no puede terminar en punto ni en espacio.')
  }
  if (RESERVED.test(name)) throw new UserError('Ese nombre está reservado por Windows. Elige otro.')
  return name
}

/** Convierte un texto libre (p. ej. el nombre de un cliente) en un nombre de carpeta válido */
export function toFolderName(raw: string): string {
  let name = (raw ?? '').replace(INVALID_CHARS, ' ').replace(/\s+/g, ' ').trim()
  name = name.replace(/[. ]+$/, '')
  if (!name) name = 'Cliente'
  if (RESERVED.test(name)) name = `_${name}`
  return name.slice(0, 120)
}

/** Une rutas garantizando que el resultado queda dentro de root (evita "../") */
export function safeJoin(root: string, rel = ''): string {
  const parts = rel.split(/[\\/]+/).filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) throw new UserError('Ruta no válida.')
  const base = resolve(root)
  const full = resolve(base, ...parts)
  if (full !== base && !full.startsWith(base + sep)) throw new UserError('Ruta no válida.')
  return full
}

export function toRel(root: string, full: string): string {
  return relative(root, full).split(sep).join('/')
}

/** Devuelve un nombre libre en dir: "Contrato.pdf" -> "Contrato (2).pdf" */
export function uniqueName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name
  const ext = extname(name)
  const base = ext ? basename(name, ext) : name
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base} (${i})${ext}`
    if (!existsSync(join(dir, candidate))) return candidate
  }
  return `${base} (${Date.now()})${ext}`
}

/** Mueve un archivo o carpeta (con alternativa si están en discos distintos) */
export async function movePath(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'EXDEV' || err.code === 'EPERM') {
      await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false })
      await fs.rm(from, { recursive: true, force: true })
    } else {
      throw e
    }
  }
}

export async function pathSize(p: string): Promise<number> {
  try {
    const st = await fs.stat(p)
    if (!st.isDirectory()) return st.size
    let total = 0
    for (const entry of await fs.readdir(p)) total += await pathSize(join(p, entry))
    return total
  } catch {
    return 0
  }
}
