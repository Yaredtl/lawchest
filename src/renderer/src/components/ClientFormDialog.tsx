import { useEffect, useState } from 'react'
import { Plus, Trash2, UserPlus, UserPen } from 'lucide-react'
import type { Client, ClientField } from '@shared/types'
import { Button, Field, IconButton, Input, Modal } from './ui'
import { useConfirm, useToast } from './feedback'
import { api } from '../lib/api'

const SUGGESTED = ['DNI / NIE', 'Teléfono', 'Email', 'Dirección', 'Nº de expediente', 'Juzgado', 'Empresa', 'Notas']

export function ClientFormDialog({
  open,
  onClose,
  client,
  onSaved
}: {
  open: boolean
  onClose: () => void
  client?: Client | null
  onSaved: (c: Client) => void
}) {
  const [name, setName] = useState('')
  const [fields, setFields] = useState<ClientField[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const confirm = useConfirm()
  const toast = useToast()
  const editing = !!client

  useEffect(() => {
    if (!open) return
    setName(client?.name ?? '')
    setFields(client?.fields.length ? client.fields.map((f) => ({ ...f })) : [])
    setError('')
  }, [open, client])

  const addField = (label = ''): void => setFields((f) => [...f, { label, value: '' }])
  const setField = (i: number, patch: Partial<ClientField>): void =>
    setFields((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const removeField = (i: number): void => setFields((f) => f.filter((_, j) => j !== i))

  const submit = async (): Promise<void> => {
    const clean = name.trim()
    if (!clean) {
      setError('Escribe el nombre del cliente.')
      return
    }
    const ok = await confirm({
      title: editing ? '¿Guardar los cambios?' : '¿Crear este cliente?',
      message: editing ? (
        <>Se actualizarán los datos de <b>{clean}</b>.</>
      ) : (
        <>Se creará el cliente <b>{clean}</b> con su propia zona de trabajo para archivos y cuentas.</>
      ),
      confirmText: editing ? 'Sí, guardar' : 'Sí, crear cliente'
    })
    if (!ok) return
    setSaving(true)
    try {
      const input = { name: clean, fields: fields.filter((f) => f.label.trim() && f.value.trim()) }
      const saved = editing ? await api.clients.update(client!.id, input) : await api.clients.create(input)
      toast.success(editing ? 'Cambios guardados.' : `Cliente "${saved.name}" creado.`)
      onSaved(saved)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const unused = SUGGESTED.filter((s) => !fields.some((f) => f.label === s))

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar cliente' : 'Nuevo cliente'}
      icon={
        <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          {editing ? <UserPen className="size-5" /> : <UserPlus className="size-5" />}
        </div>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Nombre del cliente" hint="Escríbelo como quieras, por ejemplo: «Mario Vázquez Fontanero».">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" autoFocus maxLength={150} />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-stone-700">Otros datos (opcionales)</span>
          </div>
          {fields.length === 0 && (
            <p className="mb-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
              Puedes añadir los datos que quieras: teléfono, email, DNI, dirección… Pulsa en uno de los botones de abajo.
            </p>
          )}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-2 sm:flex-row sm:items-center sm:bg-transparent sm:p-0">
                <Input
                  value={f.label}
                  onChange={(e) => setField(i, { label: e.target.value })}
                  placeholder="Nombre del dato"
                  className="sm:w-44"
                  list="lawchest-field-suggestions"
                  maxLength={80}
                />
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    value={f.value}
                    onChange={(e) => setField(i, { value: e.target.value })}
                    placeholder="Valor"
                    autoFocus={!f.value && !!f.label}
                    type={f.label === 'Email' ? 'email' : f.label === 'Teléfono' ? 'tel' : 'text'}
                  />
                  <IconButton label="Quitar dato" onClick={() => removeField(i)} type="button">
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
          <datalist id="lawchest-field-suggestions">
            {SUGGESTED.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="mt-3 flex flex-wrap gap-2">
            {unused.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => addField(s)}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                + {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addField('')}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus className="size-4" /> Otro dato
            </button>
          </div>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}
