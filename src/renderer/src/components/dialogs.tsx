import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Folder, FolderInput, Home } from 'lucide-react'
import { Button, Field, Modal } from './ui'

/** Diálogo para pedir un nombre (nueva carpeta, renombrar…) */
export function PromptDialog({
  open,
  title,
  label,
  initial = '',
  confirmText = 'Aceptar',
  icon,
  selectBase,
  onCancel,
  onSubmit
}: {
  open: boolean
  title: string
  label: string
  initial?: string
  confirmText?: string
  icon?: ReactNode
  /** Al renombrar archivos, selecciona el nombre sin la extensión */
  selectBase?: boolean
  onCancel: () => void
  onSubmit: (value: string) => Promise<void> | void
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initial)
    setError('')
    setTimeout(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const dot = initial.lastIndexOf('.')
      if (selectBase && dot > 0) el.setSelectionRange(0, dot)
      else el.select()
    }, 60)
  }, [open, initial, selectBase])

  const submit = async (): Promise<void> => {
    if (!value.trim()) {
      setError('Escribe un nombre.')
      return
    }
    setBusy(true)
    try {
      await onSubmit(value.trim())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      icon={icon}
      footer={
        <>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {confirmText}
          </Button>
        </>
      }
    >
      <form
        className="pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={label}>
          <input
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            maxLength={180}
            className="h-11 w-full rounded-xl border border-stone-300 px-3.5 text-[15px] focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </Field>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  )
}

/** Diálogo para elegir la carpeta de destino al mover */
export function MoveDialog({
  open,
  name,
  folders,
  exclude,
  onCancel,
  onSubmit
}: {
  open: boolean
  name: string
  folders: string[]
  exclude: string
  onCancel: () => void
  onSubmit: (target: string) => void
}) {
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => {
    if (open) setTarget(null)
  }, [open])
  const options = folders.filter((f) => f !== exclude && !f.startsWith(exclude + '/'))

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Mover «${name}»`}
      icon={
        <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <FolderInput className="size-5" />
        </div>
      }
      footer={
        <>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" disabled={target === null} onClick={() => target !== null && onSubmit(target)}>
            Mover aquí
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm text-stone-600">Elige la carpeta de destino:</p>
      <div className="max-h-80 overflow-y-auto rounded-2xl border border-stone-200 p-1">
        {options.map((f) => {
          const depth = f ? f.split('/').length : 0
          return (
            <button
              key={f || '__root'}
              onClick={() => setTarget(f)}
              style={{ paddingLeft: 12 + depth * 18 }}
              className={`flex w-full items-center gap-2.5 rounded-xl py-2.5 pr-3 text-left text-sm ${
                target === f ? 'bg-brand-100 font-semibold text-brand-800' : 'hover:bg-stone-100'
              }`}
            >
              {f ? <Folder className="size-4 text-brand-600" fill="currentColor" fillOpacity={0.2} /> : <Home className="size-4 text-brand-600" />}
              {f ? f.split('/').pop() : 'Carpeta principal del cliente'}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
