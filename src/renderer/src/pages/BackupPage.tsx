import { useEffect, useState } from 'react'
import { Archive, DownloadCloud, FolderOpen, HardDrive, ShieldCheck, UploadCloud } from 'lucide-react'
import { api } from '../lib/api'
import { useNewMenu } from '../App'
import { Button } from '../components/ui'
import { useConfirm, useToast } from '../components/feedback'

export default function BackupPage() {
  const [dataDir, setDataDir] = useState('')
  const [busy, setBusy] = useState<'create' | 'restore' | null>(null)
  const confirm = useConfirm()
  const toast = useToast()
  useNewMenu([], [])

  useEffect(() => {
    api.app.info().then((i) => setDataDir(i.dataDir)).catch(() => undefined)
  }, [])

  const create = async (): Promise<void> => {
    const ok = await confirm({
      title: '¿Crear una copia de seguridad?',
      message: 'Se guardará en un único archivo .zip todo LawChest: clientes, archivos, cuentas y papelera. Después podrás elegir dónde guardarlo (por ejemplo, en un USB).',
      confirmText: 'Sí, crear copia'
    })
    if (!ok) return
    setBusy('create')
    try {
      const path = await api.backup.create()
      if (path) toast.success('Copia de seguridad creada.', { label: 'Mostrar', run: () => api.shell.showItem(path) })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const restore = async (): Promise<void> => {
    const path = await api.backup.pick().catch(() => null)
    if (!path) return
    const ok = await confirm({
      title: '¿Restaurar esta copia?',
      danger: true,
      confirmText: 'Sí, restaurar copia',
      message: (
        <>
          Los datos actuales se sustituirán por los de la copia <b>{path.split(/[\\/]/).pop()}</b>.
          <br />
          <br />
          Por seguridad, los datos actuales <b>no se borran</b>: se guardarán en la carpeta «Antes de restaurar» dentro de la carpeta de datos.
        </>
      )
    })
    if (!ok) return
    setBusy('restore')
    try {
      await api.backup.restore(path)
      toast.success('Copia restaurada correctamente.')
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-stone-100 px-4 pt-5 pb-4 sm:px-6">
        <h1 className="font-display text-[34px] leading-none text-brand-800">Copias de seguridad</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="grid max-w-4xl gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-3xl border border-stone-200 p-6">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <DownloadCloud className="size-6" />
            </div>
            <h2 className="font-display text-2xl text-brand-800">Crear copia</h2>
            <p className="mt-2 mb-6 flex-1 text-sm text-stone-600">
              Guarda todo en un archivo .zip. Te recomendamos hacerlo de vez en cuando y guardarlo en un USB o disco externo.
            </p>
            <Button variant="primary" icon={<Archive className="size-4" />} onClick={create} loading={busy === 'create'} disabled={!!busy}>
              Crear copia de seguridad
            </Button>
          </div>
          <div className="flex flex-col rounded-3xl border border-stone-200 p-6">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-700">
              <UploadCloud className="size-6" />
            </div>
            <h2 className="font-display text-2xl text-brand-800">Restaurar copia</h2>
            <p className="mt-2 mb-6 flex-1 text-sm text-stone-600">
              Recupera los datos desde una copia anterior, por ejemplo si cambias de ordenador.
            </p>
            <Button icon={<UploadCloud className="size-4" />} onClick={restore} loading={busy === 'restore'} disabled={!!busy}>
              Restaurar desde un archivo…
            </Button>
          </div>
        </div>
        <div className="mt-6 max-w-4xl space-y-3 rounded-3xl bg-stone-50 p-6 text-sm text-stone-600">
          <p className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green-700" />
            LawChest funciona sin internet: tus datos no salen nunca de este ordenador.
          </p>
          <p className="flex items-start gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <span>
              Carpeta de datos: <code className="rounded bg-white px-1.5 py-0.5 text-xs break-all text-stone-800">{dataDir}</code>
            </span>
          </p>
          <Button variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => api.app.openDataDir()}>
            Abrir carpeta de datos
          </Button>
        </div>
      </div>
    </div>
  )
}
