import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X, XCircle } from 'lucide-react'
import { Button, Modal } from './ui'

/* ----------------------------- Confirmaciones ----------------------------- */

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => undefined)

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (value: boolean): void => {
    resolver.current(value)
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        size="sm"
        title={opts?.title}
        icon={
          opts?.danger ? (
            <div className="flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="size-5" />
            </div>
          ) : (
            <div className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-700">
              <HelpCircle className="size-5" />
            </div>
          )
        }
        footer={
          <>
            <Button onClick={() => close(false)}>{opts?.cancelText ?? 'Cancelar'}</Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {opts?.confirmText ?? 'Sí, continuar'}
            </Button>
          </>
        }
      >
        <div className="text-[15px] leading-relaxed text-stone-600">{opts?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = (): ConfirmFn => useContext(ConfirmContext)

/* --------------------------------- Avisos --------------------------------- */

type ToastType = 'success' | 'error' | 'info'
interface Toast {
  id: number
  type: ToastType
  text: string
  action?: { label: string; run: () => void }
}
interface ToastApi {
  success: (text: string, action?: Toast['action']) => void
  error: (text: string) => void
  info: (text: string) => void
}
const ToastContext = createContext<ToastApi>({ success: () => undefined, error: () => undefined, info: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const remove = (id: number): void => setToasts((t) => t.filter((x) => x.id !== id))
  const push = useCallback((type: ToastType, text: string, action?: Toast['action']) => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-2), { id, type, text, action }])
    setTimeout(() => remove(id), type === 'error' ? 8000 : 4000)
  }, [])

  const api = useRef<ToastApi>({
    success: (t, a) => push('success', t, a),
    error: (t) => push('error', t),
    info: (t) => push('info', t)
  })

  const icon = (t: ToastType): ReactNode =>
    t === 'success' ? (
      <CheckCircle2 className="size-5 text-green-400" />
    ) : t === 'error' ? (
      <XCircle className="size-5 text-red-400" />
    ) : (
      <Info className="size-5 text-accent-400" />
    )

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:right-6 sm:left-auto sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} className="animate-pop pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-xl">
            {icon(t.type)}
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                className="rounded-full px-3 py-1 font-semibold text-accent-400 hover:bg-white/10"
                onClick={() => {
                  t.action!.run()
                  remove(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="rounded-full p-1 text-stone-400 hover:bg-white/10" onClick={() => remove(t.id)} aria-label="Cerrar aviso">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = (): ToastApi => useContext(ToastContext)
