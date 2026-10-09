import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Download, ExternalLink, FolderOpen, IdCard, Pencil, Receipt, Trash2 } from 'lucide-react'
import type { Client, ClientSummary } from '@shared/types'
import { api } from '../lib/api'
import { fmtDateLong } from '../lib/format'
import { useNav } from '../App'
import { Button, IconButton, Spinner } from '../components/ui'
import { MenuButton } from '../components/Menu'
import { ClientFormDialog } from '../components/ClientFormDialog'
import { ExportDialog } from '../components/ExportDialog'
import { useConfirm, useToast } from '../components/feedback'
import FilesPanel from './FilesPanel'
import AccountsPanel from './AccountsPanel'
import { BalanceBadge } from './ClientsPage'

type Tab = 'archivos' | 'cuentas' | 'datos'

export default function ClientPage({ id, initialTab }: { id: number; initialTab?: Tab }) {
  const { go } = useNav()
  const [client, setClient] = useState<Client | null>(null)
  const [summary, setSummary] = useState<ClientSummary | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab ?? 'archivos')
  const [editing, setEditing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(() => {
    api.clients
      .get(id)
      .then(setClient)
      .catch((e) => {
        toast.error(e.message)
        go({ page: 'clients' })
      })
    api.clients
      .list()
      .then((all) => setSummary(all.find((c) => c.id === id) ?? null))
      .catch(() => undefined)
  }, [id, go, toast])
  useEffect(load, [load])

  const remove = async (): Promise<void> => {
    if (!client) return
    const ok = await confirm({
      title: `¿Eliminar a ${client.name}?`,
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
      await api.clients.remove(client.id)
      toast.success(`"${client.name}" se ha movido a la papelera.`)
      go({ page: 'clients' })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!client) return <Spinner />

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'archivos', label: 'Archivos', icon: <FolderOpen className="size-4" /> },
    { id: 'cuentas', label: 'Gastos e ingresos', icon: <Receipt className="size-4" /> },
    { id: 'datos', label: 'Datos del cliente', icon: <IdCard className="size-4" /> }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-stone-100 px-2 pt-3 sm:px-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <IconButton label="Volver a clientes" onClick={() => go({ page: 'clients' })}>
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <button onClick={() => go({ page: 'clients' })} className="text-xs text-stone-500 hover:text-brand-700">
              Clientes
            </button>
            <h1 className="font-display truncate text-[28px] leading-tight text-brand-800 sm:text-[32px]" title={client.name}>
              {client.name}
            </h1>
          </div>
          {summary && (
            <button onClick={() => setTab('cuentas')} className="hidden flex-col items-end px-2 sm:flex" title="Ver gastos e ingresos">
              <span className="text-[11px] tracking-wide text-stone-400 uppercase">Balance</span>
              <BalanceBadge cents={summary.balance} className="text-sm" />
            </button>
          )}
          <div className="hidden md:block">
            <Button icon={<Download className="size-4" />} onClick={() => setExporting(true)}>
              Resumen
            </Button>
          </div>
          <MenuButton
            items={[
              { label: 'Editar datos', icon: <Pencil className="size-4" />, onClick: () => setEditing(true) },
              { label: 'Descargar resumen', icon: <Download className="size-4" />, onClick: () => setExporting(true) },
              { label: 'Abrir en el Explorador', icon: <ExternalLink className="size-4" />, onClick: () => api.clients.openFolder(client.id) },
              { label: 'Eliminar cliente', icon: <Trash2 className="size-4" />, danger: true, divider: true, onClick: remove }
            ]}
          />
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-[3px] px-4 pt-2 pb-2.5 text-[15px] transition-colors ${
                tab === t.id ? 'border-accent-500 font-semibold text-brand-800' : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'archivos' && <FilesPanel clientId={client.id} clientName={client.name} />}
      {tab === 'cuentas' && <AccountsPanel clientId={client.id} onChanged={load} />}
      {tab === 'datos' && (
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl text-brand-800">Datos del cliente</h2>
              <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Editar
              </Button>
            </div>
            <dl className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm font-medium text-brand-700">Nombre</dt>
                <dd className="text-stone-800">{client.name}</dd>
              </div>
              {client.fields.map((f, i) => (
                <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm font-medium text-brand-700">{f.label}</dt>
                  <dd className="break-words whitespace-pre-wrap text-stone-800 select-text">{f.value}</dd>
                </div>
              ))}
              <div className="grid gap-1 bg-stone-50 px-4 py-3 text-sm sm:grid-cols-[180px_1fr]">
                <dt className="text-stone-500">Cliente desde</dt>
                <dd className="text-stone-600">{fmtDateLong(client.createdAt)}</dd>
              </div>
            </dl>
            {client.fields.length === 0 && (
              <p className="mt-4 text-sm text-stone-500">
                No hay más datos guardados. Pulsa «Editar» para añadir teléfono, email, DNI, dirección o cualquier otro dato.
              </p>
            )}
          </div>
        </div>
      )}

      <ClientFormDialog open={editing} client={client} onClose={() => setEditing(false)} onSaved={() => load()} />
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        title="Resumen del cliente"
        description={
          <>
            Datos, gastos, ingresos y balance de <b>{client.name}</b>.
          </>
        }
        run={(f) => api.exports.client(client.id, f)}
      />
    </div>
  )
}
