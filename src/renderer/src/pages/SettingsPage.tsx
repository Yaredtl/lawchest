import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, Download, FolderOpen, HardDrive, Info, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { SettingsInfo } from '@shared/types'
import { api } from '../lib/api'
import { useNewMenu } from '../App'
import { Button, Spinner } from '../components/ui'
import { useToast } from '../components/feedback'
import { DataLocationChooser } from '../components/DataLocation'
import { useUpdateState } from '../components/UpdateNotice'

export function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'hace un momento'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function SettingsPage() {
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [syncing, setSyncing] = useState(false)
  const update = useUpdateState()
  const toast = useToast()
  useNewMenu([], [])

  const load = useCallback(() => {
    api.settings
      .get()
      .then(setInfo)
      .catch((e) => toast.error(e.message))
  }, [toast])
  useEffect(load, [load])
  useEffect(() => window.lawchest.on('sync:saved', () => load()), [load])

  const syncNow = async (): Promise<void> => {
    setSyncing(true)
    try {
      await api.sync.now()
      toast.success('Sincronizado.')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  if (!info) return <Spinner />
  const shared = !!info.provider

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-stone-100 px-4 pt-5 pb-4 sm:px-6">
        <h1 className="font-display text-[34px] leading-none text-brand-800">Ajustes</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="max-w-3xl space-y-6">
          {/* ---------------------------- Datos ---------------------------- */}
          <section className="rounded-3xl border border-stone-200 p-5 sm:p-6">
            <h2 className="font-display mb-1 text-2xl text-brand-800">Dónde se guardan tus datos</h2>
            <div className="mt-3 flex items-start gap-3 rounded-2xl bg-stone-50 p-4">
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${shared ? 'bg-sky-50 text-sky-600' : 'bg-brand-50 text-brand-700'}`}>
                {shared ? <Cloud className="size-5" /> : <HardDrive className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-800">{shared ? `En ${info.provider} (varios ordenadores)` : 'Solo en este ordenador'}</div>
                <div className="text-xs break-all text-stone-500">{info.dataDir}</div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
                  {info.sync.lastError ? (
                    <span className="inline-flex items-center gap-1.5 text-red-700">
                      <AlertTriangle className="size-4" /> {info.sync.lastError}
                    </span>
                  ) : info.sync.dirty ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-4 animate-spin" /> Guardando cambios…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-green-700">
                      <CheckCircle2 className="size-4" /> Todo guardado
                    </span>
                  )}
                  <span className="text-stone-400">·</span>
                  <span>
                    Último cambio {timeAgo(info.sync.savedAt)}
                    {info.sync.savedBy && info.sync.savedBy !== info.sync.thisMachine && ` desde ${info.sync.savedBy}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => api.app.openDataDir()}>
                Abrir carpeta
              </Button>
              {shared && (
                <Button variant="ghost" icon={<RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={syncNow} disabled={syncing}>
                  Sincronizar ahora
                </Button>
              )}
            </div>

            <h3 className="mt-6 mb-1 text-[15px] font-semibold text-stone-800">Usar LawChest en varios ordenadores</h3>
            <ol className="mb-4 list-inside list-decimal space-y-1 text-sm text-stone-600">
              <li>
                En este ordenador, elige tu <b>OneDrive</b>, <b>Google Drive</b> o <b>Dropbox</b>. Tus datos se copiarán allí.
              </li>
              <li>En el otro ordenador, instala LawChest e inicia sesión en la misma nube.</li>
              <li>
                Al abrir LawChest allí, elige la misma nube: aparecerá como <b>«Datos encontrados»</b>.
              </li>
            </ol>
            <DataLocationChooser suggestions={info.suggestions} currentDir={info.dataDir} />
            <p className="mt-4 flex items-start gap-2 text-xs text-stone-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Los cambios tardan unos segundos en llegar al otro ordenador (lo que tarde tu nube en sincronizar). Para evitar conflictos, usa
              LawChest en un ordenador cada vez. Si se edita a la vez en los dos, se conserva la versión más reciente y la otra se guarda en la
              carpeta «Conflictos de sincronización».
            </p>
          </section>

          {/* ------------------------- Actualizaciones ------------------------- */}
          <section className="rounded-3xl border border-stone-200 p-5 sm:p-6">
            <h2 className="font-display mb-1 text-2xl text-brand-800">Actualizaciones</h2>
            <p className="text-sm text-stone-600">
              Versión instalada: <b>{info.version}</b>. Al abrir LawChest se comprueba si hay una versión nueva y te avisa.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {update.status === 'available' ? (
                <Button variant="primary" icon={<Download className="size-4" />} onClick={() => api.updates.download()}>
                  Descargar la versión {update.version}
                </Button>
              ) : update.status === 'ready' ? (
                <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={() => api.updates.install()}>
                  Reiniciar e instalar {update.version}
                </Button>
              ) : (
                <Button
                  icon={<Sparkles className="size-4" />}
                  loading={update.status === 'checking' || update.status === 'downloading'}
                  onClick={() => api.updates.check().catch((e) => toast.error(e.message))}
                  disabled={!info.updatesSupported}
                >
                  Buscar actualizaciones
                </Button>
              )}
              <span className="text-sm text-stone-500">
                {update.status === 'none' && 'Tienes la última versión.'}
                {update.status === 'checking' && 'Comprobando…'}
                {update.status === 'downloading' && `Descargando… ${update.percent}%`}
                {update.status === 'error' && <span className="text-red-700">{update.message}</span>}
                {!info.updatesSupported && 'Las actualizaciones automáticas solo funcionan en la versión instalada en Windows.'}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
