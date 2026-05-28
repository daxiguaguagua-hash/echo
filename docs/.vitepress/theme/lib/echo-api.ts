const CONFIGURED_API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ECHO_API_BASE) || ''
const DEFAULT_API_BASE = 'http://127.0.0.1:8787'
const API_CANDIDATES = [CONFIGURED_API_BASE, DEFAULT_API_BASE].filter(Boolean)

interface EchoStatus {
  ok: boolean
  captureEnabled: boolean
  projectId: string | null
  version: string
  author: string
}

interface CommentPayload {
  articleId: string
  comment: string
  quote?: string
  prefix?: string
  suffix?: string
  occurrence?: number
  author?: string
  scope?: string
  evolutionOf?: string[]
  evolutionKind?: string
  projectId?: string | null
}

interface TagPayload {
  articleId: string
  tag: string
  projectId?: string | null
}

class EchoApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'EchoApiError'
    this.status = status
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (API_CANDIDATES.length === 0) {
    throw new EchoApiError('API not available', 0)
  }

  let lastError: EchoApiError | null = null
  for (const base of API_CANDIDATES) {
    try {
      return await requestFrom<T>(base, path, options)
    } catch (err) {
      lastError = err instanceof EchoApiError ? err : new EchoApiError((err as Error).message || 'Network error', 0)
    }
  }

  throw lastError || new EchoApiError('Network error', 0)
}

async function requestFrom<T>(base: string, path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new EchoApiError((body as any).error || res.statusText, res.status)
    }
    return res.json() as Promise<T>
  } catch (err) {
    if (err instanceof EchoApiError) throw err
    if ((err as Error).name === 'AbortError') {
      throw new EchoApiError('Request timed out', 0)
    }
    throw new EchoApiError((err as Error).message || 'Network error', 0)
  } finally {
    clearTimeout(timeout)
  }
}

export function getStatus(): Promise<EchoStatus> {
  return request<EchoStatus>('/api/status')
}

export function getCaptureStatus(): Promise<{ enabled: boolean }> {
  return request<{ enabled: boolean }>('/api/capture')
}

export function setCapture(enabled: boolean): Promise<{ enabled: boolean }> {
  return request<{ enabled: boolean }>('/api/capture', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
}

export function getMcpConfig(): Promise<{ canonical: { command: string; args: string[] }; legacy: any[]; serverInfo: any }> {
  return request('/api/mcp-config')
}

export function postComment(payload: CommentPayload): Promise<any> {
  return request('/api/comments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function postTag(payload: TagPayload): Promise<any> {
  return request('/api/tags', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export { EchoApiError, CONFIGURED_API_BASE, DEFAULT_API_BASE }
export type { EchoStatus, CommentPayload, TagPayload }
