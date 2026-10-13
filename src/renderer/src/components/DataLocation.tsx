import { useState } from 'react'
import { Cloud, FolderSearch, CheckCircle2 } from 'lucide-react'
import type { CloudSuggestion, FolderInfo } from '@shared/types'
import { api } from '../lib/api'
import { Button } from './ui'
import { useToast } from './feedback'

const PROVIDER_COLOR: Record<string, string> = {
  OneDrive: 'text-sky-600 bg-sky-50',
  'Google Drive': 'text-green-700 bg-green-50',
  Dropbox: 'text-blue-600 bg-blue-50',
  iCloud: 'text-stone-600 bg-stone-100'
}

const MAIN_PROVIDERS = ['OneDrive', 'Google Drive', 'Dropbox'] as const

/** «Google Drive para ordenador» para no confundirlo con la conexión por internet */
const label = (p: string): string => (p === 'Google Drive' ? 'Google Drive para ordenador' : p)

const PROVIDER_HINT: Record<string, string> = {
  OneDrive: 'suele estar en C:\\Usuarios\\(tu usuario)\\OneDrive.',
  'Google Drive': 'instala «Google Drive para ordenador», inicia sesión y elige «Mi unidad» (normalmente en la unidad G:).',
  Dropbox: 'suele estar en C:\\Usuarios\\(tu usuario)\\Dropbox.'
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
  const toast = useToast()

  const choose = async (f: FolderInfo): Promise<void> => {
    if (f.isCurrent) {
      toast.info('Ya estás usando esa carpeta.')
      return
    }
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
              {label(s.name)}
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
      {MAIN_PROVIDERS.filter((p) => !suggestions.some((s) => s.name === p)).map((p) => (
        <button
          key={p}
          onClick={pick}
          disabled={!!busy}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-stone-200 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-60"
        >
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl opacity-70 ${PROVIDER_COLOR[p] ?? ''}`}>
            <Cloud className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-stone-700">{label(p)}</div>
            <div className="text-xs text-stone-500">No lo hemos encontrado automáticamente. Pulsa para elegir su carpeta: {PROVIDER_HINT[p]}</div>
          </div>
        </button>
      ))}
      <Button icon={<FolderSearch className="size-4" />} onClick={pick} disabled={!!busy}>
        Elegir otra carpeta…
      </Button>
    </div>
  )
}
