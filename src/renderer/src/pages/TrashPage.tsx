import { useCallback, useEffect, useState } from 'react'
import { Clock, RotateCcw, Trash2, User, XCircle } from 'lucide-react'
import type { TrashItem } from '@shared/types'
import { api } from '../lib/api'
import { fmtDateLong, fmtSize } from '../lib/format'
import { useNewMenu } from '../App'
import { Button, EmptyState, IconButton, Spinner } from '../components/ui'
import { FileIcon } from '../components/FileIcon'
import { useConfirm, useToast } from '../components/feedback'

const KIND_LABEL: Record<TrashItem['kind'], string> = { cliente: 'Cliente', carpeta: 'Carpeta', archivo: 'Archivo' }

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(() => {
    api.trash
      .list()
      .then(setItems)
      .catch((e) => toast.error(e.message))
  }, [toast])
  useEffect(load, [load])
  useNewMenu([], [])

  const restore = async (it: TrashItem): Promise<void> => {
    try {
      toast.success(await api.trash.restore(it.id))
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const removeForever = async (it: TrashItem): Promise<void> => {
    const ok = await confirm({
      title: '¿Eliminar para siempre?',
      danger: true,
      confirmText: 'Sí, eliminar para siempre',
      message: (
        <>
          <b>{it.name}</b> se borrará definitivamente del ordenador. <b>No se podrá recuperar.</b>
        </>
      )
    })
    if (!ok) return
    try {
      await api.trash.remove(it.id)
      toast.success('Eliminado definitivamente.')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const empty = async (): Promise<void> => {
    const ok = await confirm({
      title: '¿Vaciar la papelera?',
      danger: true,
      confirmText: 'Sí, vaciar papelera',
      message: (
        <>
          Se borrarán definitivamente los <b>{items?.length}</b> elementos de la papelera. <b>No se podrán recuperar.</b>
        </>
      )
    })
    if (!ok) return
    try {
      const n = await api.trash.empty()
      toast.success(`Papelera vaciada (${n} elemento${n === 1 ? '' : 's'}).`)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 pt-5 pb-4 sm:px-6">
        <h1 className="font-display mr-auto text-[34px] leading-none text-brand-800">Papelera</h1>
        <Button variant="secondary" icon={<Trash2 className="size-4" />} onClick={empty} disabled={!items?.length} className="hover:border-red-300 hover:text-red-700">
          Vaciar papelera
        </Button>
      </header>
      <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl bg-accent-50 px-4 py-3 text-sm text-stone-700 sm:mx-6">
        <Clock className="mt-0.5 size-4 shrink-0 text-accent-700" />
        <span>
          Lo que borres se guarda aquí <b>30 días</b> y después se elimina automáticamente. Puedes restaurarlo o vaciar la papelera cuando quieras.
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon={<Trash2 className="size-9" />} title="La papelera está vacía" text="Aquí aparecerán los clientes, carpetas y archivos que elimines." />
        ) : (
          <div className="divide-y divide-stone-100">
            {items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-3 hover:bg-stone-50 sm:flex-nowrap">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-100">
                  {it.kind === 'cliente' ? <User className="size-5 text-brand-600" /> : <FileIcon ext={it.name.split('.').pop()?.toLowerCase() ?? ''} isDir={it.kind === 'carpeta'} className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-stone-800 ${it.kind === 'cliente' ? 'font-display text-lg' : 'font-medium'}`}>{it.name}</div>
                  <div className="truncate text-xs text-stone-500">
                    {KIND_LABEL[it.kind]}
                    {it.kind !== 'cliente' && it.clientName && ` · ${it.clientName}`}
                    {it.kind !== 'cliente' && it.originalPath && it.originalPath.includes('/') && ` › ${it.originalPath.split('/').slice(0, -1).join(' › ')}`}
                    {' · '}Borrado el {fmtDateLong(it.deletedAt)}
                    {it.size > 0 && ` · ${fmtSize(it.size)}`}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${it.daysLeft <= 3 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600'}`}>
                  {it.daysLeft === 0 ? 'Se borra hoy' : `Quedan ${it.daysLeft} día${it.daysLeft === 1 ? '' : 's'}`}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button icon={<RotateCcw className="size-4" />} onClick={() => restore(it)}>
                    Restaurar
                  </Button>
                  <IconButton label="Eliminar para siempre" onClick={() => removeForever(it)} className="hover:text-red-600">
                    <XCircle className="size-5" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
