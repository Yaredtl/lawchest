import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Sparkles } from 'lucide-react'
import type { UpdateState } from '@shared/types'
import { api } from '../lib/api'
import { Button, Modal } from './ui'
import { useToast } from './feedback'

export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    api.updates.state().then(setState).catch(() => undefined)
    return window.lawchest.on('update:state', (s) => setState(s as UpdateState))
  }, [])
  return state
}

/** Aviso al abrir la app cuando hay una versión nueva de LawChest */
export function UpdateNotice() {
  const state = useUpdateState()
  const [open, setOpen] = useState(false)
  const shownFor = useRef<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    if ((state.status === 'available' || state.status === 'ready') && shownFor.current !== `${state.status}-${state.version}`) {
      shownFor.current = `${state.status}-${state.version}`
      setOpen(true)
    }
  }, [state])

  const download = async (): Promise<void> => {
    try {
      await api.updates.download()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const install = async (): Promise<void> => {
    try {
      await api.updates.install()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      {/* Progreso de la descarga, siempre visible abajo */}
      {state.status === 'downloading' && !open && (
        <div className="fixed bottom-4 left-4 z-40 w-72 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-stone-200">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-stone-700">
            <Download className="size-4 text-brand-600" /> Descargando LawChest {state.version}… {state.percent}%
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${state.percent}%` }} />
          </div>
        </div>
      )}

      <Modal
        open={open && (state.status === 'available' || state.status === 'downloading' || state.status === 'ready')}
        onClose={() => setOpen(false)}
        title={state.status === 'ready' ? 'Actualización lista' : 'Nueva versión de LawChest'}
        icon={
          <div className="flex size-10 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <Sparkles className="size-5" />
          </div>
        }
        footer={
          state.status === 'available' ? (
            <>
              <Button onClick={() => setOpen(false)}>Más tarde</Button>
              <Button variant="primary" icon={<Download className="size-4" />} onClick={download}>
                Actualizar ahora
              </Button>
            </>
          ) : state.status === 'ready' ? (
            <>
              <Button onClick={() => setOpen(false)}>Al cerrar LawChest</Button>
              <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={install}>
                Reiniciar y actualizar
              </Button>
            </>
          ) : (
            <Button onClick={() => setOpen(false)}>Seguir trabajando</Button>
          )
        }
      >
        {state.status === 'available' && (
          <div className="space-y-3 pb-2 text-[15px] text-stone-600">
            <p>
              Hay disponible la versión <b className="text-brand-800">{state.version}</b>. Se descarga e instala sola; tus datos no se tocan.
            </p>
            {state.notes && (
              <div className="max-h-48 overflow-y-auto rounded-2xl bg-stone-50 p-4 text-sm whitespace-pre-wrap text-stone-600">{state.notes}</div>
            )}
          </div>
        )}
        {state.status === 'downloading' && (
          <div className="pb-2">
            <p className="mb-3 text-[15px] text-stone-600">Descargando la versión {state.version}… Puedes seguir trabajando mientras tanto.</p>
            <div className="h-3 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${state.percent}%` }} />
            </div>
            <p className="mt-1 text-right text-sm text-stone-500">{state.percent}%</p>
          </div>
        )}
        {state.status === 'ready' && (
          <p className="pb-2 text-[15px] text-stone-600">
            La versión <b className="text-brand-800">{state.version}</b> está descargada. LawChest se cerrará un momento, se actualizará y se
            volverá a abrir solo. Si lo prefieres, se instalará la próxima vez que cierres LawChest.
          </p>
        )}
      </Modal>
    </>
  )
}
