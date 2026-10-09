import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import type { Client, Movement } from '@shared/types'
import { api } from '../lib/api'
import { eur, MONTHS } from '../lib/format'
import { useNav } from '../App'
import { Button, EmptyState, IconButton, Spinner } from '../components/ui'
import { ExportDialog } from '../components/ExportDialog'
import { useToast } from '../components/feedback'
import { BalanceBadge } from './ClientsPage'

export default function MonthlyPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData] = useState<{ client: Client; movements: Movement[] }[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const { go } = useNav()
  const toast = useToast()

  useEffect(() => {
    setData(null)
    api.summary
      .month(year, month)
      .then(setData)
      .catch((e) => toast.error(e.message))
  }, [year, month, toast])

  const shift = (delta: number): void => {
    let m = month + delta
    let y = year
    if (m < 1) {
      m = 12
      y--
    } else if (m > 12) {
      m = 1
      y++
    }
    setMonth(m)
    setYear(y)
  }

  const rows = useMemo(
    () =>
      (data ?? []).map((g) => {
        let ingresos = 0
        let gastos = 0
        for (const m of g.movements) m.type === 'gasto' ? (gastos += m.amount) : (ingresos += m.amount)
        return { client: g.client, count: g.movements.length, ingresos, gastos, balance: ingresos - gastos }
      }),
    [data]
  )
  const total = rows.reduce((t, r) => ({ ingresos: t.ingresos + r.ingresos, gastos: t.gastos + r.gastos, balance: t.balance + r.balance }), { ingresos: 0, gastos: 0, balance: 0 })
  const years = Array.from({ length: 12 }, (_, i) => now.getFullYear() + 1 - i)

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 pt-5 pb-4 sm:px-6">
        <h1 className="font-display mr-auto text-[34px] leading-none text-brand-800">Resumen mensual</h1>
        <Button variant="primary" icon={<Download className="size-4" />} onClick={() => setExporting(true)}>
          Descargar resumen
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <IconButton label="Mes anterior" onClick={() => shift(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-[15px] focus:border-brand-500 focus:outline-none">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-[15px] focus:border-brand-500 focus:outline-none">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <IconButton label="Mes siguiente" onClick={() => shift(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>

        {data === null ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={<CalendarRange className="size-9" />} title={`Sin movimientos en ${MONTHS[month - 1]?.toLowerCase()}`} text="Cuando añadas gastos o ingresos con fecha de este mes aparecerán aquí. Los movimientos sin fecha cuentan en el mes en que se añadieron." />
        ) : (
          <>
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-green-50 p-4">
                <div className="text-sm font-medium text-green-800">Ingresos del mes</div>
                <div className="tabular mt-1 text-2xl font-semibold text-green-800">{eur(total.ingresos)}</div>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <div className="text-sm font-medium text-red-800">Gastos del mes</div>
                <div className="tabular mt-1 text-2xl font-semibold text-red-800">{eur(total.gastos)}</div>
              </div>
              <div className="rounded-2xl bg-brand-700 p-4 text-white shadow-md">
                <div className="text-sm font-medium text-accent-200">Balance del mes</div>
                <div className="tabular mt-1 text-2xl font-semibold">{eur(total.balance)}</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-stone-200">
              <div className="hidden grid-cols-[1fr_110px_120px_120px_120px] gap-3 bg-brand-700 px-4 py-2.5 text-xs font-semibold tracking-wide text-white uppercase md:grid">
                <span>Cliente</span>
                <span className="text-right">Movimientos</span>
                <span className="text-right">Ingresos</span>
                <span className="text-right">Gastos</span>
                <span className="text-right">Balance</span>
              </div>
              {rows.map((r) => (
                <button
                  key={r.client.id}
                  onClick={() => go({ page: 'client', id: r.client.id, tab: 'cuentas' })}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-t border-stone-100 px-4 py-3 text-left first:border-t-0 even:bg-stone-50/60 hover:bg-accent-50 md:grid-cols-[1fr_110px_120px_120px_120px]"
                >
                  <span className="font-display truncate text-lg text-stone-800">{r.client.name}</span>
                  <span className="tabular hidden text-right text-sm text-stone-500 md:block">{r.count}</span>
                  <span className="tabular hidden text-right text-green-700 md:block">{eur(r.ingresos)}</span>
                  <span className="tabular hidden text-right text-red-700 md:block">{eur(r.gastos)}</span>
                  <span className="text-right">
                    <BalanceBadge cents={r.balance} className="text-sm" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        title={`Resumen de ${MONTHS[month - 1]} ${year}`}
        description="Incluye a cada cliente con sus gastos, ingresos, movimientos y balance del mes."
        run={(f) => api.exports.monthly(year, month, f)}
      />
    </div>
  )
}
