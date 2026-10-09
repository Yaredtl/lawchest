import { createWriteStream, promises as fs, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import archiver from 'archiver'
import extract from 'extract-zip'
import { app } from 'electron'
import { getDb } from './db'
import { flush, importDatabase } from './store'
import { clientsDir, ensureDataDirs, getDataDir, trashDir } from './paths'
import { UserError } from './fsutil'

export function backupFileName(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `LawChest copia ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.zip`
}

/** Crea un .zip con la base de datos, las carpetas de clientes y la papelera */
export async function createBackup(target: string): Promise<void> {
  const tmpDb = join(tmpdir(), `lawchest-copia-${Date.now()}.db`)
  // Copia consistente de la base de datos aunque esté en uso
  getDb().prepare('VACUUM INTO ?').run(tmpDb)
  try {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(target)
      const zip = archiver('zip', { zlib: { level: 6 } })
      out.on('close', () => resolve())
      out.on('error', reject)
      zip.on('error', reject)
      zip.on('warning', (err) => {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') reject(err)
      })
      zip.pipe(out)
      zip.file(tmpDb, { name: 'lawchest.db' })
      zip.append(
        JSON.stringify({ app: 'LawChest', version: app.getVersion(), createdAt: new Date().toISOString() }, null, 2),
        { name: 'lawchest-copia.json' }
      )
      if (existsSync(clientsDir())) zip.directory(clientsDir(), 'Clientes')
      if (existsSync(trashDir())) zip.directory(trashDir(), 'Papelera')
      zip.finalize()
    })
  } finally {
    await fs.rm(tmpDb, { force: true })
  }
}

/**
 * Restaura una copia. Antes guarda los datos actuales en
 * <carpeta de datos>\Antes de restaurar\<fecha> por seguridad.
 */
export async function restoreBackup(source: string): Promise<string> {
  const dataDir = getDataDir()
  const staging = join(dataDir, `.restaurando-${Date.now()}`)
  await fs.mkdir(staging, { recursive: true })
  try {
    await extract(source, { dir: staging })
    if (!existsSync(join(staging, 'lawchest.db')) || !existsSync(join(staging, 'lawchest-copia.json'))) {
      throw new UserError('Este archivo no es una copia de seguridad de LawChest.')
    }
    await flush()
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const previous = join(dataDir, 'Antes de restaurar', stamp)
    await fs.mkdir(previous, { recursive: true })
    getDb().prepare('VACUUM INTO ?').run(join(previous, 'lawchest.db'))
    for (const name of ['Clientes', 'Papelera']) {
      if (existsSync(join(dataDir, name))) await fs.rename(join(dataDir, name), join(previous, name))
    }
    for (const name of ['Clientes', 'Papelera']) {
      if (existsSync(join(staging, name))) await fs.rename(join(staging, name), join(dataDir, name))
    }
    ensureDataDirs()
    await importDatabase(join(staging, 'lawchest.db'))
    return previous
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
    ensureDataDirs()
  }
}
