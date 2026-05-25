const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ECHO_API_BASE) || ''

interface EchoStatus {
  ok: boolean
  captureEnabled: boolean
  projectId: string | null
  version: string
}

interface CommentPayload {
  articleId: string
  comment: string
  quote?: string
  author?: string
  scope?: string
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
  if (!API_BASE) {
    throw new EchoApiError('API not available (no VITE_ECHO_API_BASE)', 0)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
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

export { EchoApiError, API_BASE }
export type { EchoStatus, CommentPayload }
