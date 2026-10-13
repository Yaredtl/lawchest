/**
 * Inicio de sesión con Google (OAuth 2.0 para apps de escritorio, con PKCE).
 * Se abre el navegador, la persona inicia sesión y Google redirige a un pequeño
 * servidor local (127.0.0.1) que recoge el código. El permiso (refresh token) se
 * guarda cifrado con el usuario de Windows (safeStorage / DPAPI).
 */
import { safeStorage, shell } from 'electron'
import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import { localDir } from './config'
import { UserError } from './fsutil'

export const authEvents = new EventEmitter()

const CLIENT_ID = process.env.LAWCHEST_GOOGLE_CLIENT_ID || __GOOGLE_CLIENT_ID__
const CLIENT_SECRET = process.env.LAWCHEST_GOOGLE_CLIENT_SECRET || __GOOGLE_CLIENT_SECRET__
const AUTH_URL = process.env.LAWCHEST_GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = process.env.LAWCHEST_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'
const REVOKE_URL = process.env.LAWCHEST_GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke'
const SCOPES = ['https://www.googleapis.com/auth/drive', 'openid', 'email']

/** Google caduca el permiso a los 7 días mientras la app esté «en prueba» */
export const TESTING_TOKEN_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

interface StoredAuth {
  refreshToken: string
  email: string
  connectedAt: string
}

let stored: StoredAuth | null = null
let access: { token: string; expiresAt: number } | null = null
let needsReconnect = false

export const googleConfigured = (): boolean => !!CLIENT_ID && !!CLIENT_SECRET

const authFile = (): string => join(localDir(), 'google.json')

function save(a: StoredAuth): void {
  const json = JSON.stringify(a)
  const payload = safeStorage.isEncryptionAvailable()
    ? { enc: 'dpapi', data: safeStorage.encryptString(json).toString('base64') }
    : { enc: 'none', data: Buffer.from(json).toString('base64') }
  writeFileSync(authFile(), JSON.stringify(payload), 'utf8')
}

function load(): StoredAuth | null {
  if (stored) return stored
  try {
    if (!existsSync(authFile())) return null
    const payload = JSON.parse(readFileSync(authFile(), 'utf8'))
    const buf = Buffer.from(payload.data, 'base64')
    const json = payload.enc === 'dpapi' ? safeStorage.decryptString(buf) : buf.toString('utf8')
    stored = JSON.parse(json)
    return stored
  } catch {
    return null
  }
}

export interface AuthStatus {
  configured: boolean
  connected: boolean
  email: string | null
  connectedAt: string | null
  /** Días que faltan para que Google pida volver a conectar (modo prueba) */
  daysLeft: number | null
  needsReconnect: boolean
}

export function authStatus(): AuthStatus {
  const a = load()
  const daysLeft = a ? Math.max(0, Math.ceil((new Date(a.connectedAt).getTime() + TESTING_TOKEN_DAYS * DAY_MS - Date.now()) / DAY_MS)) : null
  return {
    configured: googleConfigured(),
    connected: !!a,
    email: a?.email ?? null,
    connectedAt: a?.connectedAt ?? null,
    daysLeft,
    needsReconnect
  }
}

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function emailFromIdToken(idToken: string | undefined): string {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split('.')[1]!, 'base64').toString('utf8'))
    return String(payload.email ?? '')
  } catch {
    return ''
  }
}

const PAGE = (title: string, text: string): string => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>LawChest</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#f7f4f3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#fff;padding:40px 48px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center;max-width:440px}
h1{font-family:Georgia,serif;color:#6A1F2B;font-weight:400;margin:0 0 12px}p{color:#555;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${text}</p></div></body></html>`

let pending: { server: Server; reject: (e: Error) => void } | null = null

/** Abre el navegador para conectar (o reconectar) la cuenta de Google */
export async function connectGoogle(): Promise<AuthStatus> {
  if (!googleConfigured()) throw new UserError('Esta versión de LawChest no tiene configuradas las credenciales de Google.')
  if (pending) {
    pending.reject(new UserError('Se ha iniciado una nueva conexión.'))
    pending.server.close()
    pending = null
  }
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  const previous = load()

  const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const err = url.searchParams.get('error')
      const got = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (err || !got || url.searchParams.get('state') !== state) {
        res.end(PAGE('No se ha conectado', 'Has cancelado la conexión o algo ha fallado. Puedes cerrar esta pestaña y volver a intentarlo desde LawChest.'))
        reject(new UserError(err === 'access_denied' ? 'Has cancelado la conexión con Google.' : 'No se pudo conectar con Google.'))
      } else {
        res.end(PAGE('¡LawChest conectado!', 'Ya puedes cerrar esta pestaña y volver a LawChest.'))
        resolve({ code: got, redirectUri: `http://127.0.0.1:${(server.address() as { port: number }).port}` })
      }
      setTimeout(() => server.close(), 500)
      pending = null
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        state
      })
      if (previous?.email) params.set('login_hint', previous.email)
      const url = `${AUTH_URL}?${params}`
      if (process.env.LAWCHEST_GOOGLE_AUTO_OPEN === 'fetch') {
        // Solo pruebas automáticas: el servidor de pruebas redirige directamente
        fetch(url).catch(() => undefined)
      } else {
        shell.openExternal(url)
      }
    })
    // Si no se completa en 10 minutos, se cancela
    const timer = setTimeout(() => {
      server.close()
      pending = null
      reject(new UserError('Ha pasado demasiado tiempo. Vuelve a pulsar «Conectar con Google Drive».'))
    }, 10 * 60 * 1000)
    server.on('close', () => clearTimeout(timer))
    pending = { server, reject }
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code.code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: code.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
  })
  const json = (await res.json()) as Record<string, string | number>
  if (!res.ok || !json.refresh_token) {
    throw new UserError('Google no ha dado permiso a LawChest. Vuelve a intentarlo y acepta todos los permisos.')
  }
  const email = emailFromIdToken(json.id_token as string) || previous?.email || ''
  stored = { refreshToken: String(json.refresh_token), email, connectedAt: new Date().toISOString() }
  access = { token: String(json.access_token), expiresAt: Date.now() + (Number(json.expires_in) - 60) * 1000 }
  save(stored)
  needsReconnect = false
  authEvents.emit('changed')
  return authStatus()
}

/** Token de acceso válido (se renueva solo); lanza si hay que volver a conectar */
export async function getAccessToken(): Promise<string> {
  const a = load()
  if (!a) throw new UserError('Google Drive no está conectado.')
  if (access && access.expiresAt > Date.now()) return access.token
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: a.refreshToken,
      grant_type: 'refresh_token'
    })
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, string | number>
  if (!res.ok) {
    if (json.error === 'invalid_grant') {
      if (!needsReconnect) {
        needsReconnect = true
        authEvents.emit('changed')
      }
      throw new ReconnectError()
    }
    throw new Error(`Google respondió ${res.status}`)
  }
  access = { token: String(json.access_token), expiresAt: Date.now() + (Number(json.expires_in) - 60) * 1000 }
  if (needsReconnect) {
    needsReconnect = false
    authEvents.emit('changed')
  }
  return access.token
}

/** Google rechazó el token de acceso (p. ej. permiso caducado): se pedirá uno nuevo */
export function invalidateAccessToken(): void {
  access = null
}

export class ReconnectError extends UserError {
  constructor() {
    super('Hay que volver a conectar Google Drive.')
  }
}

export async function disconnectGoogle(): Promise<void> {
  const a = load()
  if (a) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(a.refreshToken)}`, { method: 'POST' }).catch(() => undefined)
  stored = null
  access = null
  needsReconnect = false
  rmSync(authFile(), { force: true })
  authEvents.emit('changed')
}
