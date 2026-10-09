import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  ClipboardPaste,
  ExternalLink,
  FileUp,
  FolderInput,
  FolderPlus,
  FolderUp,
  Home,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  Upload,
  FolderOpen
} from 'lucide-react'
import type { FileEntry } from '@shared/types'
import { api } from '../lib/api'
import { fmtDateLong, fmtSize } from '../lib/format'
import { useNewMenu } from '../App'
import { Button, EmptyState, IconButton, Spinner } from '../components/ui'
import { FileIcon, fileStyle } from '../components/FileIcon'
import { MenuButton, PopupMenu, type MenuItem } from '../components/Menu'
import { MoveDialog, PromptDialog } from '../components/dialogs'
import { useConfirm, useToast } from '../components/feedback'

const VIEW_KEY = 'lawchest.filesView'
const INTERNAL = 'application/x-lawchest-path'

type Incoming = { paths: string[]; buffers: { name: string; data: Uint8Array }[] }

function loadView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() || p
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export default function FilesPanel({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<FileEntry[] | null>(null)
  const [view, setView] = useState<'grid' | 'list'>(loadView)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState<null | { mode: 'folder' } | { mode: 'rename'; entry: FileEntry }>(null)
  const [moving, setMoving] = useState<{ entry: FileEntry; folders: string[] } | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null)
  const dragDepth = useRef(0)
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(
    (p = path) => {
      api.files
        .list(clientId, p)
        .then((e) => {
          setEntries(e)
          setSelected(null)
        })
        .catch((e) => {
          toast.error(e.message)
          if (p) setPath('')
        })
    },
    [clientId, path, toast]
  )

  useEffect(() => {
    setEntries(null)
    load(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, path])

  // Al volver a la ventana, refrescamos por si se cambiaron archivos desde el Explorador
  useEffect(() => {
    const onFocus = (): void => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const changeView = (v: 'grid' | 'list'): void => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* sin almacenamiento */
    }
  }

  const folderLabel = (p: string): string => (p ? `la carpeta «${baseName(p)}»` : `la carpeta principal de ${clientName}`)

  /* ------------------------------ Añadir archivos ------------------------------ */

  const addIncoming = async (incoming: Incoming, target = path): Promise<void> => {
    const total = incoming.paths.length + incoming.buffers.length
    if (total === 0) return
    const names = [...incoming.paths.map(baseName), ...incoming.buffers.map((b) => b.name)]
    const ok = await confirm({
      title: total === 1 ? '¿Añadir este archivo?' : `¿Añadir ${total} elementos?`,
      message: (
        <>
          Se copiará{total === 1 ? '' : 'n'} a {folderLabel(target)}:
          <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-sm text-stone-500">
            {names.slice(0, 12).map((n, i) => (
              <li key={i} className="truncate">
                {n}
              </li>
            ))}
            {names.length > 12 && <li>y {names.length - 12} más…</li>}
          </ul>
        </>
      ),
      confirmText: 'Sí, añadir'
    })
    if (!ok) return
    setBusy(true)
    try {
      let n = 0
      if (incoming.paths.length) n += await api.files.addPaths(clientId, target, incoming.paths)
      for (const b of incoming.buffers) {
        await api.files.addBuffer(clientId, target, b.name, b.data)
        n++
      }
      toast.success(`${plural(n, 'elemento añadido', 'elementos añadidos')}.`)
      load()
    } catch (e) {
      toast.error((e as Error).message)
      load()
    } finally {
      setBusy(false)
    }
  }

  const fromFileList = async (files: FileList | File[]): Promise<Incoming> => {
    const out: Incoming = { paths: [], buffers: [] }
    let shot = 0
    for (const f of Array.from(files)) {
      const p = window.lawchest.pathForFile(f)
      if (p) out.paths.push(p)
      else {
        // Contenido sin archivo en disco (p. ej. una captura de pantalla copiada)
        const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
        const stamp = new Date().toLocaleString('es-ES').replace(/[/:]/g, '-').replace(',', '')
        const name = f.name && f.name !== 'image.png' ? f.name : `Captura ${stamp}${shot++ ? ` (${shot})` : ''}.${ext}`
        out.buffers.push({ name, data: new Uint8Array(await f.arrayBuffer()) })
      }
    }
    return out
  }

  const pick = async (mode: 'files' | 'folder'): Promise<void> => {
    try {
      const paths = await api.files.pick(mode)
      if (paths.length) await addIncoming({ paths, buffers: [] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const pasteFromClipboard = useCallback(
    async (files?: FileList | null): Promise<void> => {
      let incoming: Incoming = { paths: [], buffers: [] }
      if (files && files.length) incoming = await fromFileList(files)
      if (incoming.paths.length + incoming.buffers.length === 0) {
        const paths = await api.files.clipboardPaths().catch(() => [])
        incoming = { paths, buffers: [] }
      }
      if (incoming.paths.length + incoming.buffers.length === 0) {
        toast.info('No hay archivos copiados. Copia un archivo (Ctrl+C) y vuelve a pegar aquí (Ctrl+V).')
        return
      }
      await addIncoming(incoming)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, clientId]
  )

  // Pegar con Ctrl+V en cualquier parte de la zona de archivos
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      pasteFromClipboard(e.clipboardData?.files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pasteFromClipboard])

  /* ---------------------------- Acciones de elementos ---------------------------- */

  const open = (e: FileEntry): void => {
    if (e.isDir) setPath(e.path)
    else api.files.open(clientId, e.path).catch((err) => toast.error(err.message))
  }

  const remove = async (e: FileEntry): Promise<void> => {
    const ok = await confirm({
      title: e.isDir ? '¿Eliminar esta carpeta?' : '¿Eliminar este archivo?',
      danger: true,
      confirmText: 'Sí, eliminar',
      message: (
        <>
          <b>{e.name}</b>
          {e.isDir ? ' y todo su contenido' : ''} se moverá a la <b>Papelera</b>. Podrás recuperarlo durante 30 días.
        </>
      )
    })
    if (!ok) return
    try {
      await api.files.remove(clientId, e.path)
      toast.success(`«${e.name}» se ha movido a la papelera.`)
      load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const moveTo = async (e: FileEntry, target: string): Promise<void> => {
    const ok = await confirm({
      title: '¿Mover aquí?',
      message: (
        <>
          <b>{e.name}</b> se moverá a {folderLabel(target)}.
        </>
      ),
      confirmText: 'Sí, mover'
    })
    if (!ok) return
    try {
      await api.files.move(clientId, e.path, target)
      toast.success(`«${e.name}» movido.`)
      setMoving(null)
      load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const startMove = async (e: FileEntry): Promise<void> => {
    try {
      setMoving({ entry: e, folders: await api.files.folders(clientId) })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const menuFor = (e: FileEntry): MenuItem[] => [
    { label: e.isDir ? 'Abrir carpeta' : 'Abrir', icon: <FolderOpen className="size-4" />, onClick: () => open(e) },
    { label: 'Cambiar nombre', icon: <Pencil className="size-4" />, onClick: () => setPrompt({ mode: 'rename', entry: e }) },
    { label: 'Mover a…', icon: <FolderInput className="size-4" />, onClick: () => startMove(e) },
    { label: 'Mostrar en el Explorador', icon: <ExternalLink className="size-4" />, onClick: () => api.files.showInFolder(clientId, e.path) },
    { label: 'Eliminar', icon: <Trash2 className="size-4" />, danger: true, divider: true, onClick: () => remove(e) }
  ]

  const backgroundMenu: MenuItem[] = [
    { label: 'Nueva carpeta', icon: <FolderPlus className="size-4" />, onClick: () => setPrompt({ mode: 'folder' }) },
    { label: 'Subir archivos', icon: <FileUp className="size-4" />, onClick: () => pick('files') },
    { label: 'Subir carpeta', icon: <FolderUp className="size-4" />, onClick: () => pick('folder') },
    { label: 'Pegar', icon: <ClipboardPaste className="size-4" />, onClick: () => pasteFromClipboard(null) }
  ]

  useNewMenu(backgroundMenu, [path, clientId])

  /* ------------------------------- Arrastrar y soltar ------------------------------- */

  const isExternal = (e: React.DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files')

  const onDrop = async (e: React.DragEvent, targetDir = path): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragOver(false)
    setDropTarget(null)
    const internal = e.dataTransfer.getData(INTERNAL)
    if (internal) {
      const entry = entries?.find((x) => x.path === internal)
      if (entry && targetDir !== internal) await moveTo(entry, targetDir)
      return
    }
    if (e.dataTransfer.files.length) await addIncoming(await fromFileList(e.dataTransfer.files), targetDir)
  }

  const folderDropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDropTarget(target)
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => onDrop(e, target)
  })

  const itemProps = (e: FileEntry) => ({
    draggable: true,
    onDragStart: (ev: React.DragEvent) => {
      ev.dataTransfer.setData(INTERNAL, e.path)
      ev.dataTransfer.effectAllowed = 'move'
    },
    onClick: (ev: React.MouseEvent) => {
      setSelected(e.path)
      // En pantallas táctiles un toque abre directamente
      if ((ev.nativeEvent as PointerEvent).pointerType === 'touch') open(e)
    },
    onDoubleClick: () => open(e),
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (ev.key === 'Enter') open(e)
      if (ev.key === 'Delete') remove(e)
      if (ev.key === 'F2') setPrompt({ mode: 'rename', entry: e })
    },
    onContextMenu: (ev: React.MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      setSelected(e.path)
      setCtx({ x: ev.clientX, y: ev.clientY, entry: e })
    },
    tabIndex: 0,
    ...(e.isDir ? folderDropProps(e.path) : {})
  })

  const crumbs = path ? path.split('/') : []

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (!isExternal(e)) return
        dragDepth.current++
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!isExternal(e)) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragOver(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e)}
    >
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 sm:px-6">
        <nav className="mr-auto flex min-w-0 flex-wrap items-center text-[15px]" aria-label="Ruta">
          <button
            onClick={() => setPath('')}
            {...folderDropProps('')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-stone-100 ${!path ? 'font-semibold text-brand-800' : 'text-stone-600'} ${dropTarget === '' ? 'bg-brand-100 ring-2 ring-brand-400' : ''}`}
          >
            <Home className="size-4" /> Archivos
          </button>
          {crumbs.map((c, i) => {
            const p = crumbs.slice(0, i + 1).join('/')
            return (
              <span key={p} className="flex min-w-0 items-center">
                <ChevronRight className="size-4 shrink-0 text-stone-400" />
                <button
                  onClick={() => setPath(p)}
                  {...folderDropProps(p)}
                  className={`max-w-48 truncate rounded-full px-3 py-1.5 hover:bg-stone-100 ${i === crumbs.length - 1 ? 'font-semibold text-brand-800' : 'text-stone-600'} ${dropTarget === p ? 'bg-brand-100 ring-2 ring-brand-400' : ''}`}
                >
                  {c}
                </button>
              </span>
            )
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<FolderPlus className="size-4" />} onClick={() => setPrompt({ mode: 'folder' })}>
            <span className="hidden sm:inline">Nueva carpeta</span>
          </Button>
          <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => pick('files')} loading={busy}>
            Subir archivos
          </Button>
          <MenuButton
            label="Más formas de añadir"
            items={[
              { label: 'Subir una carpeta entera', icon: <FolderUp className="size-4" />, onClick: () => pick('folder') },
              { label: 'Pegar (Ctrl+V)', icon: <ClipboardPaste className="size-4" />, onClick: () => pasteFromClipboard(null) },
              { label: 'Abrir en el Explorador', icon: <ExternalLink className="size-4" />, onClick: () => api.clients.openFolder(clientId) }
            ]}
          />
          <div className="flex rounded-full border border-stone-300 p-0.5">
            <IconButton label="Ver como lista" onClick={() => changeView('list')} className={`size-9 ${view === 'list' ? 'bg-brand-100 text-brand-800' : ''}`}>
              <List className="size-4" />
            </IconButton>
            <IconButton label="Ver como cuadrícula" onClick={() => changeView('grid')} className={`size-9 ${view === 'grid' ? 'bg-brand-100 text-brand-800' : ''}`}>
              <LayoutGrid className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6"
        onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        onContextMenu={(e) => {
          e.preventDefault()
          setCtx({ x: e.clientX, y: e.clientY, entry: null })
        }}
      >
        {entries === null ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Upload className="size-9" />}
            title={path ? 'Esta carpeta está vacía' : 'Aún no hay archivos'}
            text="Arrastra aquí archivos o carpetas desde tu ordenador, pulsa «Subir archivos» o pega con Ctrl+V lo que hayas copiado."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => pick('files')}>
                  Subir archivos
                </Button>
                <Button icon={<FolderPlus className="size-4" />} onClick={() => setPrompt({ mode: 'folder' })}>
                  Nueva carpeta
                </Button>
              </div>
            }
          />
        ) : view === 'list' ? (
          <div>
            <div className="sticky top-0 z-[1] hidden grid-cols-[1fr_170px_110px_40px] gap-4 border-b border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-500 md:grid">
              <span>Nombre</span>
              <span>Modificado</span>
              <span className="text-right">Tamaño</span>
              <span />
            </div>
            {entries.map((e) => (
              <div
                {...itemProps(e)}
                key={e.path}
                className={`grid cursor-default grid-cols-[1fr_40px] items-center gap-4 border-b border-stone-100 px-3 py-1.5 outline-none select-none md:grid-cols-[1fr_170px_110px_40px] ${
                  dropTarget === e.path ? 'bg-brand-100 ring-2 ring-brand-400' : selected === e.path ? 'bg-accent-50' : 'hover:bg-stone-50'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3 py-1">
                  <FileIcon ext={e.ext} isDir={e.isDir} className="size-6 shrink-0" />
                  <span className="truncate text-[15px] text-stone-800" title={e.name}>
                    {e.name}
                  </span>
                </span>
                <span className="hidden text-sm text-stone-500 md:block">{fmtDateLong(e.modified)}</span>
                <span className="tabular hidden text-right text-sm text-stone-500 md:block">{e.isDir ? '—' : fmtSize(e.size)}</span>
                <MenuButton items={menuFor(e)} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {entries.some((e) => e.isDir) && <h3 className="mt-2 mb-2 text-sm font-medium text-stone-600">Carpetas</h3>}
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {entries
                .filter((e) => e.isDir)
                .map((e) => (
                  <div
                    {...itemProps(e)}
                    key={e.path}
                    className={`flex cursor-default items-center gap-3 rounded-2xl py-1.5 pr-1 pl-4 outline-none select-none ${
                      dropTarget === e.path ? 'bg-brand-100 ring-2 ring-brand-400' : selected === e.path ? 'bg-accent-100' : 'bg-stone-100 hover:bg-stone-200/70'
                    }`}
                  >
                    <FileIcon ext="" isDir className="size-6 shrink-0" />
                    <span className="flex-1 truncate text-[15px] font-medium" title={e.name}>
                      {e.name}
                    </span>
                    <MenuButton items={menuFor(e)} />
                  </div>
                ))}
            </div>
            {entries.some((e) => !e.isDir) && <h3 className="mt-6 mb-2 text-sm font-medium text-stone-600">Archivos</h3>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {entries
                .filter((e) => !e.isDir)
                .map((e) => {
                  const st = fileStyle(e.ext, false)
                  return (
                    <div
                      {...itemProps(e)}
                      key={e.path}
                      className={`flex cursor-default flex-col rounded-2xl p-1.5 outline-none select-none ${selected === e.path ? 'bg-accent-100' : 'bg-stone-100 hover:bg-stone-200/70'}`}
                    >
                      <div className="flex items-center gap-2 py-0.5 pl-2">
                        <FileIcon ext={e.ext} isDir={false} className="size-5 shrink-0" />
                        <span className="flex-1 truncate text-sm font-medium" title={e.name}>
                          {e.name}
                        </span>
                        <MenuButton items={menuFor(e)} className="size-8" />
                      </div>
                      <div className={`flex aspect-[4/3] items-center justify-center rounded-xl ${st.bg}`}>
                        <FileIcon ext={e.ext} isDir={false} className="size-14 opacity-80" />
                      </div>
                      <div className="flex justify-between px-2 pt-1.5 text-xs text-stone-500">
                        <span className="uppercase">{e.ext || 'archivo'}</span>
                        <span className="tabular">{fmtSize(e.size)}</span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}
      </div>

      {/* Capa al arrastrar archivos desde el ordenador */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center rounded-3xl border-4 border-dashed border-accent-500 bg-accent-50/90">
          <Upload className="mb-3 size-12 text-accent-600" />
          <p className="font-display text-3xl text-brand-800">Suelta aquí para añadir</p>
          <p className="mt-1 text-sm text-stone-600">
            {dropTarget !== null && dropTarget !== path ? `Dentro de «${baseName(dropTarget) || 'Archivos'}»` : `En ${path ? `«${baseName(path)}»` : 'la carpeta principal'}`}
          </p>
        </div>
      )}

      {ctx && <PopupMenu x={ctx.x} y={ctx.y} items={ctx.entry ? menuFor(ctx.entry) : backgroundMenu} onClose={() => setCtx(null)} />}

      <PromptDialog
        open={prompt?.mode === 'folder'}
        title="Nueva carpeta"
        label={`Nombre de la carpeta (dentro de ${path ? `«${baseName(path)}»` : 'la carpeta principal'})`}
        initial="Carpeta sin título"
        confirmText="Crear"
        icon={
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <FolderPlus className="size-5" />
          </div>
        }
        onCancel={() => setPrompt(null)}
        onSubmit={async (name) => {
          const ok = await confirm({ title: '¿Crear la carpeta?', message: <>Se creará la carpeta <b>{name}</b>.</>, confirmText: 'Sí, crear' })
          if (!ok) return
          await api.files.createFolder(clientId, path, name)
          toast.success(`Carpeta «${name}» creada.`)
          setPrompt(null)
          load()
        }}
      />
      <PromptDialog
        open={prompt?.mode === 'rename'}
        title="Cambiar nombre"
        label="Nuevo nombre"
        initial={prompt?.mode === 'rename' ? prompt.entry.name : ''}
        selectBase={prompt?.mode === 'rename' && !prompt.entry.isDir}
        confirmText="Guardar"
        icon={
          <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Pencil className="size-5" />
          </div>
        }
        onCancel={() => setPrompt(null)}
        onSubmit={async (name) => {
          if (prompt?.mode !== 'rename') return
          if (name === prompt.entry.name) {
            setPrompt(null)
            return
          }
          const ok = await confirm({
            title: '¿Cambiar el nombre?',
            message: (
              <>
                <b>{prompt.entry.name}</b> pasará a llamarse <b>{name}</b>.
              </>
            ),
            confirmText: 'Sí, cambiar'
          })
          if (!ok) return
          await api.files.rename(clientId, prompt.entry.path, name)
          toast.success('Nombre cambiado.')
          setPrompt(null)
          load()
        }}
      />
      <MoveDialog
        open={!!moving}
        name={moving?.entry.name ?? ''}
        folders={moving?.folders ?? []}
        exclude={moving?.entry.isDir ? moving.entry.path : '\u0000'}
        onCancel={() => setMoving(null)}
        onSubmit={(target) => moving && moveTo(moving.entry, target)}
      />
    </div>
  )
}
