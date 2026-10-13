import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react'
import type { GDriveStatus } from '@shared/types'
import { api } from '../lib/api'
import { Button, Modal } from './ui'
import { useConfirm, useToast } from './feedback'

export function GoogleDriveLogo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 87.3 78" className={className} aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  )
}

export function useGDriveStatus(initial?: GDriveStatus | null): GDriveStatus | null {
  const [s, setS] = useState<GDriveStatus | null>(initial ?? null)
  useEffect(() => {
    api.gdrive.status().then(setS).catch(() => undefined)
    return window.lawchest.on('gdrive:status', (x) => setS(x as GDriveStatus))
  }, [])
  return s
}

function ago(iso: string | null): string {
  if (!iso) return 'todavía no'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Botón grande para conectar Google Drive (bienvenida y ajustes) */
export function ConnectGoogleButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const connect = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.gdrive.connect()
      toast.success('Google Drive conectado. Tus datos se sincronizan por internet.')
      onDone?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={connect}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-2xl border-2 border-stone-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-70"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-stone-50">
        <GoogleDriveLogo className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-stone-800">
          Google Drive (por internet)
          <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">Recomendado</span>
        </div>
        <div className="text-xs text-stone-500">
          {busy
            ? 'Se ha abierto el navegador: inicia sesión con tu cuenta de Google y pulsa «Continuar»…'
            : 'Sin instalar nada: inicia sesión con tu cuenta de Google y LawChest sincroniza tus datos.'}
        </div>
      </div>
      {busy && <Loader2 className="size-5 animate-spin text-brand-600" />}
    </button>
  )
}

/** Tarjeta de Ajustes con el estado de la conexión */
export function GoogleDriveCard({ initial }: { initial: GDriveStatus }) {
  const s = useGDriveStatus(initial) ?? initial
  const [busy, setBusy] = useState<string | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!s.configured) {
    return (
      <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-500">
        Esta versión de LawChest no tiene configurada la conexión con Google Drive.
      </p>
    )
  }

  if (!s.enabled) return <ConnectGoogleButton />

  const reconnect = s.state === 'reconnect' || s.needsReconnect
  return (
    <div className="rounded-2xl border-2 border-brand-600 bg-brand-50/60 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white">
          <GoogleDriveLogo className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-stone-800">
            Google Drive (por internet)
            <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">Conectado</span>
          </div>
          <div className="truncate text-xs text-stone-500">{s.email}</div>
          <div className="mt-2 text-sm">
            {reconnect ? (
              <span className="inline-flex items-center gap-1.5 text-red-700">
                <AlertTriangle className="size-4" /> Google pide volver a conectar.
              </span>
            ) : s.state === 'syncing' ? (
              <span className="inline-flex items-center gap-1.5 text-stone-600">
                <Loader2 className="size-4 animate-spin" /> Sincronizando
                {s.progress && s.progress.total > 1 ? ` (${s.progress.done} de ${s.progress.total})` : '…'}
              </span>
            ) : s.state === 'error' ? (
              <span className="inline-flex items-center gap-1.5 text-red-700">
                <AlertTriangle className="size-4" /> {s.lastError}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="size-4" /> Sincronizado {ago(s.lastSyncAt)}
              </span>
            )}
          </div>
          {!reconnect && s.daysLeft !== null && s.daysLeft <= 2 && (
            <p className="mt-1 text-xs text-accent-700">
              Google pedirá volver a conectar {s.daysLeft <= 0 ? 'hoy' : s.daysLeft === 1 ? 'mañana' : `en ${s.daysLeft} días`}. Puedes renovarlo ya.
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(reconnect || (s.daysLeft !== null && s.daysLeft <= 2)) && (
          <Button variant="primary" icon={<RefreshCw className="size-4" />} loading={busy === 'reconnect'} onClick={() => run('reconnect', () => api.gdrive.reconnect(), 'Conexión renovada.')}>
            {reconnect ? 'Volver a conectar' : 'Renovar conexión'}
          </Button>
        )}
        {!reconnect && (
          <Button icon={<RefreshCw className={`size-4 ${s.state === 'syncing' ? 'animate-spin' : ''}`} />} disabled={s.state === 'syncing'} onClick={() => run('sync', () => api.gdrive.syncNow())}>
            Sincronizar ahora
          </Button>
        )}
        <Button variant="ghost" icon={<ExternalLink className="size-4" />} onClick={() => window.open(s.rootId ? `https://drive.google.com/drive/folders/${s.rootId}` : 'https://drive.google.com', '_blank')}>
          Ver en Google Drive
        </Button>
        <Button
          variant="ghost"
          icon={<LogOut className="size-4" />}
          loading={busy === 'disconnect'}
          onClick={async () => {
            const ok = await confirm({
              title: '¿Desconectar Google Drive?',
              danger: true,
              confirmText: 'Sí, desconectar',
              message: 'LawChest dejará de sincronizar con Google Drive. No se borra nada: tus datos se quedan en este ordenador y en tu Google Drive.'
            })
            if (ok) run('disconnect', () => api.gdrive.disconnect(), 'Google Drive desconectado.')
          }}
        >
          Desconectar
        </Button>
      </div>
    </div>
  )
}

/** Aviso cuando Google pide volver a conectar (cada 7 días mientras la app esté «en prueba») */
export function ReconnectNotice() {
  const s = useGDriveStatus()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const show = !!s && s.enabled && (s.state === 'reconnect' || s.needsReconnect) && !dismissed

  return (
    <Modal
      open={show}
      onClose={() => setDismissed(true)}
      title="Vuelve a conectar Google Drive"
      icon={<GoogleDriveLogo className="size-9" />}
      footer={
        <>
          <Button onClick={() => setDismissed(true)}>Más tarde</Button>
          <Button
            variant="primary"
            icon={<RefreshCw className="size-4" />}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.gdrive.reconnect()
                toast.success('Conexión renovada. Sincronizando…')
              } catch (e) {
                toast.error((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Conectar
          </Button>
        </>
      }
    >
      <div className="space-y-3 pb-2 text-[15px] text-stone-600">
        <p>
          Por seguridad, Google pide renovar el permiso de LawChest cada 7 días. Pulsa <b>Conectar</b>: se abrirá el navegador y solo tendrás que
          elegir tu cuenta{s?.email ? ` (${s.email})` : ''} y pulsar <b>Continuar</b>.
        </p>
        <p className="text-sm text-stone-500">Mientras tanto puedes seguir trabajando: lo que hagas se sincronizará al volver a conectar.</p>
      </div>
    </Modal>
  )
}
