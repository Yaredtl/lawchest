import { useState } from 'react'
import { Laptop, MonitorSmartphone } from 'lucide-react'
import type { SettingsInfo } from '@shared/types'
import { api } from '../lib/api'
import { Modal } from './ui'
import { ChestMark } from './Logo'
import { DataLocationChooser } from './DataLocation'
import { ConnectGoogleButton } from './GoogleDrive'

/** Primera vez que se abre LawChest en este ordenador: ¿uno o varios ordenadores? */
export function Welcome({ info, onDone }: { info: SettingsInfo; onDone: () => void }) {
  const [step, setStep] = useState<'choose' | 'cloud'>(() => (info.suggestions.some((s) => s.hasData) ? 'cloud' : 'choose'))

  const onlyHere = async (): Promise<void> => {
    await api.settings.setupDone().catch(() => undefined)
    onDone()
  }

  const foundData = info.suggestions.some((s) => s.hasData)

  return (
    <Modal open onClose={onlyHere} size="lg" title="Te damos la bienvenida a LawChest" icon={<ChestMark className="size-10" />}>
      {step === 'choose' ? (
        <div className="space-y-3 pb-4">
          <p className="text-[15px] text-stone-600">¿Dónde vas a usar LawChest?</p>
          <button onClick={onlyHere} className="flex w-full items-center gap-4 rounded-2xl border-2 border-stone-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50/50">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Laptop className="size-6" />
            </div>
            <div>
              <div className="font-semibold text-stone-800">Solo en este ordenador</div>
              <div className="text-sm text-stone-500">Los datos se guardan en Documentos\LawChest. Podrás cambiarlo más adelante en Ajustes.</div>
            </div>
          </button>
          <button onClick={() => setStep('cloud')} className="flex w-full items-center gap-4 rounded-2xl border-2 border-stone-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50/50">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
              <MonitorSmartphone className="size-6" />
            </div>
            <div>
              <div className="font-semibold text-stone-800">En varios ordenadores</div>
              <div className="text-sm text-stone-500">
                Los datos se guardan en tu OneDrive, Google Drive o Dropbox y los verás igual en todos tus ordenadores.
              </div>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          <p className="text-[15px] text-stone-600">
            {foundData
              ? 'Hemos encontrado datos de LawChest en tu nube (seguramente de tu otro ordenador). Pulsa en ella para usarlos aquí:'
              : 'Conecta tu Google Drive (recomendado) o elige otra nube. En tu otro ordenador, instala LawChest y elige la misma: se descargará todo.'}
          </p>
          {info.gdrive.configured && (
            <>
              <ConnectGoogleButton onDone={() => setTimeout(() => window.location.reload(), 600)} />
              <p className="pt-1 text-xs font-medium tracking-wide text-stone-400 uppercase">O una carpeta de tu ordenador</p>
            </>
          )}
          <DataLocationChooser suggestions={info.suggestions} currentDir={info.dataDir} />
          <button onClick={() => setStep('choose')} className="text-sm text-stone-500 hover:text-brand-700">
            ← Volver
          </button>
        </div>
      )}
    </Modal>
  )
}
