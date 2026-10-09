import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Folder, FolderOpen, LayoutGrid, List, Pencil, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import type { Client, ClientSummary } from '@shared/types'
import { api } from '../lib/api'
import { eur } from '../lib/format'
import { useNav, useNewMenu } from '../App'
import { Button, EmptyState, IconButton, Spinner } from '../components/ui'
import { MenuButton, PopupMenu, type MenuItem } from '../components/Menu'
import { ClientFormDialog } from '../components/ClientFormDialog'
import { ExportDialog } from '../components/ExportDialog'
import { useConfirm, useToast } from '../components/feedback'

const VIEW_KEY = 'lawchest.clientsView'

function loadView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function BalanceBadge({ cents, className = '' }: { cents: number; className?: string }) {
  const color = cents > 0 ? 'bg-green-50 text-green-700' : cents < 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-500'
  return <span className={`tabular inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${color} ${className}`}>{eur(cents)}</span>
}

export default function ClientsPage() {
  const { go } = useNav()
  const [clients, setClients] = useState<ClientSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(loadView)
  const [form, setForm] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null })
  const [exportFor, setExportFor] = useState<ClientSummary | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; client: ClientSummary } | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(() => {
    api.clients
      .list()
      .then(setClients)
      .catch((e) => toast.error(e.message))
  }, [toast])

  useEffect(load, [load])
  useNewMenu([{ label: 'Nuevo cliente', icon: <UserPlus className="size-4" />, onClick: () => setForm({ open: true, client: null }) }], [])

  const changeView = (v: 'grid' | 'list'): void => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* sin almacenamiento */
    }
  }

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
    if (!clients) return []
    if (!q) return clients
    return clients.filter((c) =>
      [c.name, ...c.fields.map((f) => f.value)].some((v) =>
        v
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .includes(q)
      )
    )
  }, [clients, query])

  const remove = async (c: ClientSummary): Promise<void> => {
    const ok = await confirm({
      title: `¿Eliminar a ${c.name}?`,
      danger: true,
      confirmText: 'Sí, eliminar',
      message: (
        <>
          El cliente, <b>todos sus archivos</b> y sus cuentas se moverán a la <b>Papelera</b>. Podrás recuperarlo durante 30 días.
        </>
      )
    })
    if (!ok) return
    try {
      await api.clients.remove(c.id)
      toast.success(`"${c.name}" se ha movido a la papelera.`, { label: 'Ver papelera', run: () => go({ page: 'trash' }) })
      load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const menuFor = (c: ClientSummary): MenuItem[] => [
    { label: 'Abrir', icon: <FolderOpen className="size-4" />, onClick: () => go({ page: 'client', id: c.id }) },
    { label: 'Editar datos', icon: <Pencil className="size-4" />, onClick: () => setForm({ open: true, client: c }) },
    { label: 'Descargar resumen', icon: <Download className="size-4" />, onClick: () => setExportFor(c) },
    { label: 'Abrir en el Explorador', icon: <ExternalLink className="size-4" />, onClick: () => api.clients.openFolder(c.id).catch((e) => toast.error(e.message)) },
    { label: 'Eliminar', icon: <Trash2 className="size-4" />, danger: true, divider: true, onClick: () => remove(c) }
  ]

  const onContext = (e: React.MouseEvent, c: ClientSummary): void => {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, client: c })
  }

  const totalBalance = clients?.reduce((s, c) => s + c.balance, 0) ?? 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-stone-100 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display mr-auto text-[34px] leading-none text-brand-800">Clientes</h1>
          <div className="hidden sm:block">
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setForm({ open: true, client: null })}>
              Nuevo cliente
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente por nombre, DNI, teléfono…"
              className="h-12 w-full rounded-full border-0 bg-stone-100 pr-12 pl-12 text-[15px] placeholder:text-stone-500 focus:bg-white focus:shadow-md focus:ring-1 focus:ring-stone-200 focus:outline-none"
            />
            {query && (
              <IconButton label="Borrar búsqueda" className="absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setQuery('')}>
                <X className="size-5" />
              </IconButton>
            )}
          </div>
          <div className="flex rounded-full border border-stone-300 p-0.5">
            <IconButton label="Ver como cuadrícula" onClick={() => changeView('grid')} className={`size-9 ${view === 'grid' ? 'bg-brand-100 text-brand-800' : ''}`}>
              <LayoutGrid className="size-4" />
            </IconButton>
            <IconButton label="Ver como lista" onClick={() => changeView('list')} className={`size-9 ${view === 'list' ? 'bg-brand-100 text-brand-800' : ''}`}>
              <List className="size-4" />
            </IconButton>
          </div>
        </div>
        {clients && clients.length > 0 && (
          <p className="text-sm text-stone-500">
            {clients.length} cliente{clients.length === 1 ? '' : 's'} · Balance total: <BalanceBadge cents={totalBalance} />
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {clients === null ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Users className="size-9" />}
            title="Todavía no hay clientes"
            text="Crea tu primer cliente. Cada cliente tendrá su propia carpeta para guardar archivos y llevar sus gastos e ingresos."
            action={
              <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setForm({ open: true, client: null })}>
                Crear el primer cliente
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search className="size-9" />} title="Sin resultados" text={`No hay ningún cliente que coincida con «${query}».`} />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => go({ page: 'client', id: c.id })}
                onKeyDown={(e) => e.key === 'Enter' && go({ page: 'client', id: c.id })}
                onContextMenu={(e) => onContext(e, c)}
                className="group flex cursor-pointer flex-col rounded-2xl bg-stone-100/80 p-1.5 transition hover:bg-brand-50 hover:shadow-md"
              >
                <div className="flex min-h-14 items-center gap-3 py-1 pr-0 pl-3">
                  <Folder className="size-6 shrink-0 text-brand-600" fill="currentColor" fillOpacity={0.2} />
                  <span className="font-display line-clamp-2 flex-1 text-xl leading-tight break-words text-stone-800" title={c.name}>
                    {c.name}
                  </span>
                  <MenuButton items={menuFor(c)} className="opacity-70 group-hover:opacity-100" />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
                  <div className="text-xs text-stone-500">
                    {c.movementsCount} movimiento{c.movementsCount === 1 ? '' : 's'}
                    {c.fields[0] && <div className="mt-0.5 max-w-36 truncate text-stone-400">{c.fields[0].value}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] tracking-wide text-stone-400 uppercase">Balance</div>
                    <BalanceBadge cents={c.balance} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            <div className="hidden grid-cols-[1fr_140px_120px_40px] gap-4 px-3 pb-2 text-xs font-medium text-stone-500 md:grid">
              <span>Nombre</span>
              <span>Movimientos</span>
              <span className="text-right">Balance</span>
              <span />
            </div>
            {filtered.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => go({ page: 'client', id: c.id })}
                onKeyDown={(e) => e.key === 'Enter' && go({ page: 'client', id: c.id })}
                onContextMenu={(e) => onContext(e, c)}
                className="grid cursor-pointer grid-cols-[1fr_auto_40px] items-center gap-4 rounded-xl px-3 py-2 hover:bg-brand-50 md:grid-cols-[1fr_140px_120px_40px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Folder className="size-5 shrink-0 text-brand-600" fill="currentColor" fillOpacity={0.2} />
                  <span className="font-display truncate text-lg text-stone-800">{c.name}</span>
                </span>
                <span className="hidden text-sm text-stone-500 md:block">{c.movementsCount}</span>
                <span className="text-right">
                  <BalanceBadge cents={c.balance} />
                </span>
                <MenuButton items={menuFor(c)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {ctx && <PopupMenu x={ctx.x} y={ctx.y} items={menuFor(ctx.client)} onClose={() => setCtx(null)} />}
      <ClientFormDialog
        open={form.open}
        client={form.client}
        onClose={() => setForm({ open: false, client: null })}
        onSaved={(c) => {
          load()
          if (!form.client) go({ page: 'client', id: c.id })
        }}
      />
      <ExportDialog
        open={!!exportFor}
        onClose={() => setExportFor(null)}
        title="Resumen del cliente"
        description={exportFor && <>Datos, gastos, ingresos y balance de <b>{exportFor.name}</b>.</>}
        run={(f) => api.exports.client(exportFor!.id, f)}
      />
    </div>
  )
}
