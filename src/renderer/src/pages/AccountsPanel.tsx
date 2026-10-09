import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Pencil, Plus, Receipt, Scale, Trash2 } from 'lucide-react'
import type { Movement, MovementType } from '@shared/types'
import { api } from '../lib/api'
import { centsToInput, eur, fmtDate, parseEuros, todayIso } from '../lib/format'
import { useNewMenu } from '../App'
import { Button, EmptyState, Field, IconButton, Input, Modal, Spinner } from '../components/ui'
import { useConfirm, useToast } from '../components/feedback'

const CONCEPTS = ['Honorarios', 'Provisión de fondos', 'Tasas judiciales', 'Procurador', 'Notaría', 'Registro', 'Peritaje', 'Desplazamiento', 'Copias y envíos', 'Pago a cuenta']

export function SummaryCards({ movements }: { movements: Movement[] }) {
  const t = useMemo(() => {
    let ingresos = 0
    let gastos = 0
    for (const m of movements) m.type === 'gasto' ? (gastos += m.amount) : (ingresos += m.amount)
    return { ingresos, gastos, balance: ingresos - gastos }
  }, [movements])
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-green-50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-green-800">
          <ArrowUpRight className="size-4" /> Ingresos
        </div>
        <div className="tabular mt-1 text-2xl font-semibold text-green-800">{eur(t.ingresos)}</div>
      </div>
      <div className="rounded-2xl bg-red-50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-red-800">
          <ArrowDownRight className="size-4" /> Gastos
        </div>
        <div className="tabular mt-1 text-2xl font-semibold text-red-800">{eur(t.gastos)}</div>
      </div>
      <div className="rounded-2xl bg-brand-700 p-4 text-white shadow-md">
        <div className="flex items-center gap-2 text-sm font-medium text-accent-200">
          <Scale className="size-4" /> Balance
        </div>
        <div className="tabular mt-1 text-2xl font-semibold">{eur(t.balance)}</div>
        <div className="text-xs text-brand-200">Ingresos − Gastos</div>
      </div>
    </div>
  )
}

function MovementDialog({
  open,
  movement,
  onClose,
  onSave
}: {
  open: boolean
  movement: Movement | null
  onClose: () => void
  onSave: (input: { concept: string; type: MovementType; amount: number; date: string | null }) => Promise<void>
}) {
  const [type, setType] = useState<MovementType>('ingreso')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(movement?.type ?? 'ingreso')
    setConcept(movement?.concept ?? '')
    setAmount(movement ? centsToInput(movement.amount) : '')
    setDate(movement?.date ?? '')
    setError('')
  }, [open, movement])

  const submit = async (): Promise<void> => {
    if (!concept.trim()) return setError('Escribe el concepto (por ejemplo: Honorarios).')
    const cents = parseEuros(amount)
    if (cents === null) return setError('Escribe un importe válido, por ejemplo: 20 o 150,50')
    setBusy(true)
    try {
      await onSave({ concept: concept.trim(), type, amount: cents, date: date || null })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={movement ? 'Editar movimiento' : 'Nuevo movimiento'}
      icon={
        <div className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-700">
          <Receipt className="size-5" />
        </div>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {movement ? 'Guardar cambios' : 'Añadir'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1">
          {(['ingreso', 'gasto'] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition ${
                type === t ? (t === 'ingreso' ? 'bg-green-600 text-white shadow' : 'bg-red-600 text-white shadow') : 'text-stone-600 hover:bg-white'
              }`}
            >
              {t === 'ingreso' ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
              {t === 'ingreso' ? 'Ingreso' : 'Gasto'}
            </button>
          ))}
        </div>
        <Field label="Concepto">
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej.: Honorarios" list="lawchest-concepts" autoFocus maxLength={300} />
          <datalist id="lawchest-concepts">
            {CONCEPTS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importe (€)">
            <div className="relative">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" className="tabular pr-9 text-right" />
              <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-stone-400">€</span>
            </div>
          </Field>
          <Field label="Fecha (opcional)">
            <div className="flex gap-1">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Button type="button" variant="ghost" className="shrink-0 px-3" onClick={() => setDate(date ? '' : todayIso())}>
                {date ? 'Quitar' : 'Hoy'}
              </Button>
            </div>
          </Field>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

export default function AccountsPanel({ clientId, onChanged }: { clientId: number; onChanged: () => void }) {
  const [movements, setMovements] = useState<Movement[] | null>(null)
  const [filter, setFilter] = useState<'todos' | MovementType>('todos')
  const [dialog, setDialog] = useState<{ open: boolean; movement: Movement | null }>({ open: false, movement: null })
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(() => {
    api.movements
      .list(clientId)
      .then(setMovements)
      .catch((e) => toast.error(e.message))
  }, [clientId, toast])
  useEffect(load, [load])

  const openNew = (): void => setDialog({ open: true, movement: null })
  useNewMenu([{ label: 'Nuevo movimiento', icon: <Plus className="size-4" />, onClick: openNew }], [clientId])

  const save = async (input: { concept: string; type: MovementType; amount: number; date: string | null }): Promise<void> => {
    const editing = dialog.movement
    const ok = await confirm({
      title: editing ? '¿Guardar los cambios?' : '¿Añadir este movimiento?',
      message: (
        <>
          {input.type === 'ingreso' ? 'Ingreso' : 'Gasto'} de <b>{eur(input.amount)}</b> por «{input.concept}»
          {input.date ? ` con fecha ${fmtDate(input.date)}` : ' sin fecha'}.
        </>
      ),
      confirmText: editing ? 'Sí, guardar' : 'Sí, añadir'
    })
    if (!ok) return
    if (editing) await api.movements.update(editing.id, input)
    else await api.movements.create(clientId, input)
    toast.success(editing ? 'Movimiento actualizado.' : 'Movimiento añadido.')
    setDialog({ open: false, movement: null })
    load()
    onChanged()
  }

  const remove = async (m: Movement): Promise<void> => {
    const ok = await confirm({
      title: '¿Eliminar este movimiento?',
      danger: true,
      confirmText: 'Sí, eliminar',
      message: (
        <>
          Se eliminará «{m.concept}» de <b>{eur(m.amount)}</b>. Esta acción no se puede deshacer.
        </>
      )
    })
    if (!ok) return
    try {
      await api.movements.remove(m.id)
      toast.success('Movimiento eliminado.')
      load()
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!movements) return <Spinner />
  const shown = movements.filter((m) => filter === 'todos' || m.type === filter)

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 sm:px-6">
      <SummaryCards movements={movements} />

      <div className="mt-6 mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display mr-auto text-2xl text-brand-800">Gastos e ingresos</h2>
        <div className="flex rounded-full bg-stone-100 p-1 text-sm">
          {(
            [
              ['todos', 'Todos'],
              ['ingreso', 'Ingresos'],
              ['gasto', 'Gastos']
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3.5 py-1.5 ${filter === k ? 'bg-white font-semibold text-brand-800 shadow-sm' : 'text-stone-600'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
          Añadir movimiento
        </Button>
      </div>

      {movements.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-9" />}
          title="Sin movimientos"
          text="Añade honorarios, provisiones de fondos, tasas… El balance se calculará solo."
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>
              Añadir el primer movimiento
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200">
          <div className="hidden grid-cols-[110px_1fr_100px_130px_88px] gap-3 bg-brand-700 px-4 py-2.5 text-xs font-semibold tracking-wide text-white uppercase md:grid">
            <span>Fecha</span>
            <span>Concepto</span>
            <span>Tipo</span>
            <span className="text-right">Importe</span>
            <span />
          </div>
          {shown.map((m) => (
            <div
              key={m.id}
              onDoubleClick={() => setDialog({ open: true, movement: m })}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-stone-100 px-4 py-2.5 first:border-t-0 even:bg-stone-50/60 hover:bg-accent-50 md:grid-cols-[110px_1fr_100px_130px_88px]"
            >
              <span className="order-3 flex items-center gap-1.5 text-sm text-stone-500 md:order-none">
                <CalendarDays className="size-3.5 md:hidden" />
                {m.date ? fmtDate(m.date) : <span className="text-stone-400 italic">Sin fecha</span>}
              </span>
              <span className="order-1 truncate font-medium text-stone-800 md:order-none" title={m.concept}>
                {m.concept}
              </span>
              <span className="hidden md:block">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.type === 'gasto' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {m.type === 'gasto' ? 'Gasto' : 'Ingreso'}
                </span>
              </span>
              <span className={`tabular order-2 text-right font-semibold md:order-none ${m.type === 'gasto' ? 'text-red-700' : 'text-green-700'}`}>
                {m.type === 'gasto' ? '−' : '+'}
                {eur(m.amount)}
              </span>
              <span className="order-4 flex justify-end md:order-none">
                <IconButton label="Editar" onClick={() => setDialog({ open: true, movement: m })} className="size-9">
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label="Eliminar" onClick={() => remove(m)} className="size-9 hover:text-red-600">
                  <Trash2 className="size-4" />
                </IconButton>
              </span>
            </div>
          ))}
          {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-stone-500">No hay movimientos de este tipo.</p>}
        </div>
      )}

      <MovementDialog open={dialog.open} movement={dialog.movement} onClose={() => setDialog({ open: false, movement: null })} onSave={save} />
    </div>
  )
}
