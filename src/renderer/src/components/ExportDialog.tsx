import { useState, type ReactNode } from 'react'
import { Download, FileSpreadsheet, FileText, Sheet } from 'lucide-react'
import type { ExportFormat } from '@shared/types'
import { Button, Modal } from './ui'
import { useToast } from './feedback'
import { api } from '../lib/api'

const FORMATS: { id: ExportFormat; label: string; text: string; icon: ReactNode }[] = [
  { id: 'pdf', label: 'PDF', text: 'Para imprimir o enviar por email.', icon: <FileText className="size-6 text-red-600" /> },
  { id: 'xlsx', label: 'Excel', text: 'Para revisar o editar las cuentas.', icon: <FileSpreadsheet className="size-6 text-green-700" /> },
  { id: 'csv', label: 'CSV', text: 'Formato sencillo compatible con todo.', icon: <Sheet className="size-6 text-stone-600" /> }
]

export function ExportDialog({
  open,
  onClose,
  title,
  description,
  run
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  run: (format: ExportFormat) => Promise<string | null>
}) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const go = async (): Promise<void> => {
    setBusy(true)
    try {
      const path = await run(format)
      if (path) {
        toast.success('Resumen guardado.', { label: 'Abrir', run: () => api.shell.openPath(path) })
        onClose()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={
        <div className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-700">
          <Download className="size-5" />
        </div>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={go} loading={busy} icon={<Download className="size-4" />}>
            Descargar
          </Button>
        </>
      }
    >
      {description && <div className="mb-4 text-sm text-stone-600">{description}</div>}
      <p className="mb-2 text-sm font-medium text-stone-700">¿En qué formato lo quieres?</p>
      <div className="grid gap-2 pb-2 sm:grid-cols-3">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFormat(f.id)}
            className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition sm:flex-col sm:items-start ${
              format === f.id ? 'border-brand-600 bg-brand-50' : 'border-stone-200 hover:border-stone-300'
            }`}
          >
            {f.icon}
            <div>
              <div className="font-semibold text-stone-800">{f.label}</div>
              <div className="text-xs text-stone-500">{f.text}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}
