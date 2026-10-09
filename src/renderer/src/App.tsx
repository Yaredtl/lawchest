import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Archive, CalendarRange, FolderOpen, Menu as MenuIcon, Plus, Trash2, Users, X } from 'lucide-react'
import { Logo } from './components/Logo'
import { PopupMenu, type MenuItem } from './components/Menu'
import { IconButton } from './components/ui'
import ClientsPage from './pages/ClientsPage'
import ClientPage from './pages/ClientPage'
import TrashPage from './pages/TrashPage'
import MonthlyPage from './pages/MonthlyPage'
import BackupPage from './pages/BackupPage'
import { api } from './lib/api'

export type Route =
  | { page: 'clients' }
  | { page: 'client'; id: number; tab?: 'archivos' | 'cuentas' | 'datos'; path?: string }
  | { page: 'monthly' }
  | { page: 'trash' }
  | { page: 'backup' }

interface Nav {
  route: Route
  go: (r: Route) => void
  setNewItems: (items: MenuItem[]) => void
}
const NavContext = createContext<Nav>({ route: { page: 'clients' }, go: () => undefined, setNewItems: () => undefined })
export const useNav = (): Nav => useContext(NavContext)

/** Las páginas registran aquí lo que ofrece el botón "Nuevo" */
export function useNewMenu(items: MenuItem[], deps: unknown[]): void {
  const { setNewItems } = useNav()
  useEffect(() => {
    setNewItems(items)
    return () => setNewItems([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const NAV_ITEMS: { page: Route['page']; label: string; icon: ReactNode }[] = [
  { page: 'clients', label: 'Clientes', icon: <Users className="size-5" /> },
  { page: 'monthly', label: 'Resumen mensual', icon: <CalendarRange className="size-5" /> },
  { page: 'trash', label: 'Papelera', icon: <Trash2 className="size-5" /> },
  { page: 'backup', label: 'Copias de seguridad', icon: <Archive className="size-5" /> }
]

export default function App() {
  const [route, setRoute] = useState<Route>({ page: 'clients' })
  const [newItems, setNewItems] = useState<MenuItem[]>([])
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    api.app.info().then((i) => setVersion(i.version)).catch(() => undefined)
  }, [])

  const go = useCallback((r: Route): void => {
    setRoute(r)
    setDrawer(false)
  }, [])
  const nav = useMemo(() => ({ route, go, setNewItems }), [route, go])
  const activePage = route.page === 'client' ? 'clients' : route.page

  const sidebar = (
    <div className="flex h-full flex-col gap-1 px-3 pt-4 pb-4">
      <div className="mb-4 flex items-center justify-between px-3">
        <Logo />
        <IconButton label="Cerrar menú" className="lg:hidden" onClick={() => setDrawer(false)}>
          <X className="size-5" />
        </IconButton>
      </div>
      <button
        disabled={newItems.length === 0}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (newItems.length === 1) newItems[0]!.onClick()
          else setNewMenu({ x: r.left, y: r.bottom + 6 })
          setDrawer(false)
        }}
        className="mb-4 ml-1 flex h-14 w-fit items-center gap-3 rounded-2xl bg-white pr-6 pl-4 text-[15px] font-medium text-brand-800 shadow-md ring-1 ring-stone-200/70 transition hover:bg-brand-50 hover:shadow-lg disabled:opacity-50 disabled:shadow-none"
      >
        <Plus className="size-6 text-accent-600" strokeWidth={2.5} />
        Nuevo
      </button>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((n) => (
          <button
            key={n.page}
            onClick={() => go({ page: n.page } as Route)}
            className={`flex h-11 items-center gap-4 rounded-full px-4 text-left text-[15px] transition-colors ${
              activePage === n.page ? 'bg-brand-100 font-semibold text-brand-800' : 'text-stone-700 hover:bg-stone-200/60'
            }`}
          >
            <span className={activePage === n.page ? 'text-brand-700' : 'text-stone-500'}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto px-4 pt-6 text-xs text-stone-400">
        <button className="flex items-center gap-2 hover:text-brand-700" onClick={() => api.app.openDataDir()}>
          <FolderOpen className="size-4" /> Abrir carpeta de datos
        </button>
        <p className="mt-2">LawChest {version && `v${version}`} · Todo se guarda en este ordenador</p>
      </div>
    </div>
  )

  return (
    <NavContext.Provider value={nav}>
      <div className="flex h-full">
        {/* Menú lateral fijo en pantallas grandes */}
        <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>

        {/* Menú lateral desplegable en pantallas pequeñas */}
        {drawer && (
          <div className="animate-fade fixed inset-0 z-40 bg-stone-900/40 lg:hidden" onClick={() => setDrawer(false)}>
            <aside className="animate-pop h-full w-72 max-w-[85vw] bg-canvas shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {sidebar}
            </aside>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-3 pt-3 lg:hidden">
            <IconButton label="Abrir menú" onClick={() => setDrawer(true)}>
              <MenuIcon className="size-6" />
            </IconButton>
            <Logo />
            {newItems.length > 0 && (
              <button
                aria-label="Nuevo"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  if (newItems.length === 1) newItems[0]!.onClick()
                  else setNewMenu({ x: r.right - 224, y: r.bottom + 6 })
                }}
                className="ml-auto flex size-11 items-center justify-center rounded-2xl bg-white text-accent-600 shadow-md ring-1 ring-stone-200"
              >
                <Plus className="size-6" strokeWidth={2.5} />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 p-2 sm:p-3 lg:pl-0">
            <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200/60">
              {route.page === 'clients' && <ClientsPage />}
              {route.page === 'client' && <ClientPage key={route.id} id={route.id} initialTab={route.tab} />}
              {route.page === 'monthly' && <MonthlyPage />}
              {route.page === 'trash' && <TrashPage />}
              {route.page === 'backup' && <BackupPage />}
            </div>
          </div>
        </main>
      </div>
      {newMenu && <PopupMenu x={newMenu.x} y={newMenu.y} items={newItems} onClose={() => setNewMenu(null)} />}
    </NavContext.Provider>
  )
}
