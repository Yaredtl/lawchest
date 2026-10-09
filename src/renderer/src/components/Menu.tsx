import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { IconButton } from './ui'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

export function PopupMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8))
    const top = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y
    setPos({ left, top })
  }, [x, y])

  useEffect(() => {
    const close = (e: Event): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('contextmenu', close)
    }, 0)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      className="animate-pop fixed z-[55] min-w-56 overflow-hidden rounded-2xl border border-stone-200 bg-white py-2 shadow-xl"
    >
      {items.map((it, i) => (
        <div key={i}>
          {it.divider && <div className="my-1.5 border-t border-stone-100" />}
          <button
            role="menuitem"
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-stone-100 ${it.danger ? 'text-red-600' : 'text-stone-700'}`}
            onClick={() => {
              onClose()
              it.onClick()
            }}
          >
            <span className={`flex size-5 items-center justify-center ${it.danger ? 'text-red-500' : 'text-stone-500'}`}>{it.icon}</span>
            {it.label}
          </button>
        </div>
      ))}
    </div>
  )
}

export function MenuButton({ items, label = 'Más opciones', className = '' }: { items: MenuItem[]; label?: string; className?: string }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <IconButton
        label={label}
        className={className}
        onClick={(e) => {
          e.stopPropagation()
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setAt({ x: r.right - 224, y: r.bottom + 4 })
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="size-5" />
      </IconButton>
      {at && <PopupMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />}
    </>
  )
}
