import { promises as fs, existsSync } from 'fs'
import { join, basename, extname, dirname, resolve, sep } from 'path'
import type { FileEntry } from '@shared/types'
import { ensureClientRoot } from './clients'
import { safeJoin, toRel, uniqueName, validateName, movePath, UserError } from './fsutil'

export async function listFiles(clientId: number, rel: string): Promise<FileEntry[]> {
  const root = await ensureClientRoot(clientId)
  const dir = safeJoin(root, rel)
  if (!existsSync(dir)) throw new UserError('La carpeta ya no existe.')
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out: FileEntry[] = []
  for (const e of entries) {
    if (e.name.startsWith('~$') || e.name === 'desktop.ini' || e.name === 'Thumbs.db') continue
    const full = join(dir, e.name)
    try {
      const st = await fs.stat(full)
      out.push({
        name: e.name,
        path: toRel(root, full),
        isDir: st.isDirectory(),
        size: st.isDirectory() ? 0 : st.size,
        modified: st.mtime.toISOString(),
        ext: st.isDirectory() ? '' : extname(e.name).slice(1).toLowerCase()
      })
    } catch {
      /* archivo inaccesible: lo omitimos */
    }
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'es', { numeric: true }) : a.isDir ? -1 : 1))
  return out
}

export async function createFolder(clientId: number, rel: string, name: string): Promise<string> {
  const root = await ensureClientRoot(clientId)
  const dir = safeJoin(root, rel)
  const clean = validateName(name)
  if (existsSync(join(dir, clean))) throw new UserError(`Ya existe una carpeta o archivo llamado "${clean}".`)
  await fs.mkdir(join(dir, clean))
  return toRel(root, join(dir, clean))
}

/** Copia archivos o carpetas del ordenador a la carpeta del cliente */
export async function addPaths(clientId: number, rel: string, sources: string[]): Promise<number> {
  const root = await ensureClientRoot(clientId)
  const dir = safeJoin(root, rel)
  let count = 0
  for (const src of sources) {
    if (!src || !existsSync(src)) continue
    // Evita copiar una carpeta dentro de sí misma
    const abs = resolve(src)
    if (dir === abs || dir.startsWith(abs + sep)) throw new UserError('No se puede copiar una carpeta dentro de sí misma.')
    const name = uniqueName(dir, basename(src))
    await fs.cp(src, join(dir, name), { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true })
    count++
  }
  return count
}

/** Guarda datos pegados (p. ej. una captura de pantalla) como archivo */
export async function addBuffer(clientId: number, rel: string, name: string, data: Uint8Array): Promise<string> {
  const root = await ensureClientRoot(clientId)
  const dir = safeJoin(root, rel)
  const clean = uniqueName(dir, validateName(name))
  await fs.writeFile(join(dir, clean), Buffer.from(data))
  return clean
}

export async function renameEntry(clientId: number, rel: string, newName: string): Promise<string> {
  const root = await ensureClientRoot(clientId)
  if (!rel) throw new UserError('No se puede renombrar la carpeta principal.')
  const full = safeJoin(root, rel)
  if (!existsSync(full)) throw new UserError('El elemento ya no existe.')
  const clean = validateName(newName)
  const target = join(dirname(full), clean)
  if (target === full) return rel
  if (existsSync(target) && target.toLowerCase() !== full.toLowerCase()) {
    throw new UserError(`Ya existe un elemento llamado "${clean}" en esta carpeta.`)
  }
  await fs.rename(full, target)
  return toRel(root, target)
}

export async function moveEntry(clientId: number, rel: string, targetDirRel: string): Promise<string> {
  const root = await ensureClientRoot(clientId)
  if (!rel) throw new UserError('No se puede mover la carpeta principal.')
  const full = safeJoin(root, rel)
  const targetDir = safeJoin(root, targetDirRel)
  if (!existsSync(full)) throw new UserError('El elemento ya no existe.')
  if (targetDir === full || targetDir.startsWith(full + sep)) {
    throw new UserError('No se puede mover una carpeta dentro de sí misma.')
  }
  if (dirname(full) === targetDir) return rel
  const name = uniqueName(targetDir, basename(full))
  await movePath(full, join(targetDir, name))
  return toRel(root, join(targetDir, name))
}

export async function entryPath(clientId: number, rel: string): Promise<string> {
  const root = await ensureClientRoot(clientId)
  const full = safeJoin(root, rel)
  if (!existsSync(full)) throw new UserError('El elemento ya no existe.')
  return full
}

/** Lista todas las carpetas del cliente (para el diálogo "Mover a...") */
export async function listAllFolders(clientId: number): Promise<string[]> {
  const root = await ensureClientRoot(clientId)
  const out: string[] = ['']
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 12) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const full = join(dir, e.name)
      out.push(toRel(root, full))
      await walk(full, depth + 1)
    }
  }
  await walk(root, 0)
  return out.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}
