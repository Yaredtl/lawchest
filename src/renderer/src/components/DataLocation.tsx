import { useState } from 'react'
import { Cloud, FolderSearch, HardDrive, CheckCircle2 } from 'lucide-react'
import type { CloudSuggestion, FolderInfo } from '@shared/types'
import { api } from '../lib/api'
import { Button } from './ui'
import { useConfirm, useToast } from './feedback'

const PROVIDER_COLOR: Record<string, string> = {
  OneDrive: 'text-sky-600 bg-sky-50',
  'Google Drive': 'text-green-700 bg-green-50',
  Dropbox: 'text-blue-600 bg-blue-50',
  iCloud: 'text-stone-600 bg-stone-100'
}

/** Elegir una carpeta sincronizada (OneDrive, Google Drive…) para usar LawChest en varios ordenadores */
export function DataLocationChooser({
  suggestions,
  currentDir,
  onSwitched
}: {
  suggestions: CloudSuggestion[]
  currentDir: string
  onSwitched?: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const choose = async (f: FolderInfo): Promise<void> => {
    if (f.isCurrent) {
      toast.info('Ya estás usando esa carpeta.')
      return
    }
    const ok = await confirm(
      f.hasData
        ? {
            title: '¿Usar los datos de esta carpeta?',
            confirmText: 'Sí, usar estos datos',
            message: (
              <>
                En <b className="break-all">{f.target}</b> hay datos de LawChest (seguramente de tu otro ordenador). A partir de ahora este
                ordenador usará esos datos.
                <br />
                <br />
                <span className="text-sm text-stone-500">
                  Lo que hubiera en la carpeta actual no se borra; se queda en <span className="break-all">{currentDir}</span>.
                </span>
              </>
            )
          }
        : {
            title: '¿Guardar los datos en esta carpeta?',
            confirmText: 'Sí, guardar aquí',
            message: (
              <>
                Se copiarán todos tus datos (clientes, archivos, cuentas y papelera) a <b className="break-all">{f.target}</b> y LawChest
                guardará ahí todo a partir de ahora.
                <br />
                <br />
                <span className="text-sm text-stone-500">La carpeta actual no se borra; puedes eliminarla cuando compruebes que todo está bien.</span>
              </>
            )
          }
    )
    if (!ok) return
    setBusy(f.target)
    try {
      await api.settings.switchTo(f.target, f.hasData ? 'use' : 'move')
      toast.success(f.hasData ? 'Listo: ahora se usan los datos de esa carpeta.' : 'Listo: tus datos se guardan ahora en esa carpeta.')
      onSwitched?.()
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const pick = async (): Promise<void> => {
    try {
      const f = await api.settings.pickFolder()
      if (f) await choose(f)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <button
          key={s.target}
          onClick={() => choose(s)}
          disabled={!!busy}
          className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${
            s.isCurrent ? 'border-brand-600 bg-brand-50' : 'border-stone-200 hover:border-brand-300 hover:bg-brand-50/50'
          } disabled:opacity-60`}
        >
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${PROVIDER_COLOR[s.name] ?? ''}`}>
            <Cloud className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-semibold text-stone-800">
              {s.name}
              {s.isCurrent && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">En uso</span>}
              {!s.isCurrent && s.hasData && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  <CheckCircle2 className="size-3" /> Datos encontrados
                </span>
              )}
            </div>
            <div className="truncate text-xs text-stone-500" title={s.target}>
              {s.target}
            </div>
          </div>
          {busy === s.target && <span className="text-sm text-stone-500">Copiando…</span>}
        </button>
      ))}
      {suggestions.length === 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
          <HardDrive className="mt-0.5 size-5 shrink-0 text-stone-400" />
          <span>
            No hemos encontrado OneDrive, Google Drive ni Dropbox en este ordenador. Puedes iniciar sesión en OneDrive (viene con Windows) o
            elegir otra carpeta compartida, como un disco de red.
          </span>
        </div>
      )}
      <Button icon={<FolderSearch className="size-4" />} onClick={pick} disabled={!!busy}>
        Elegir otra carpeta…
      </Button>
    </div>
  )
}
