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

interface PublishPayload {
  sessionId: string
  projectId?: string | null
}

interface PublishResponse {
  ok: boolean
  id: string
  slug: string
  turnCount: number
  version: number
  latest: boolean
}

interface LiveSessionState {
  ok: boolean
  exists: boolean
  projectId: string | null
  sessionId: string
  turnCount: number
  hash: string | null
  updatedAt: string | null
}

interface LegacyCandidate {
  sessionId: string
  fileName: string
  sourcePath: string
  turnCount: number
  mtime: string
  confidence: string
  evidence: { kind: string; projectRoot: string } | null
}

interface LegacyCandidatesResponse {
  projectId: string
  sourceDir: string
  candidates: LegacyCandidate[]
}

interface ClaudeImportCandidate {
  sessionId: string
  filePath: string
  status: string
  articleId: string
  turnCount: number
  mtime: string
  fileHash: string
}

interface ClaudeImportCandidatesResponse {
  projectId: string
  provider: string
  projectDir: string
  summary: { total: number; new: number; updated: number; skipped: number }
  candidates: ClaudeImportCandidate[]
}

interface ClaudeImportResponse {
  ok: boolean
  imported: number
  skipped: number
  articlesDir: string | null
  refreshScheduled: boolean
}

interface LegacyMigrateResponse {
  ok: boolean
  migrated: number
  skipped: number
  targetDir: string
  refreshScheduled: boolean
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

interface RemoveTagPayload {
  articleId: string
  tags: string[]
  projectId?: string | null
}

export function removeTags(payload: RemoveTagPayload): Promise<any> {
  return request('/api/tags/remove', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

interface RenameTagPayload {
  oldTag: string
  newTag: string
  projectId?: string | null
}

interface RenameTagResponse {
  oldTag: string
  newTag: string
  renamed: number
}

export function renameTag(payload: RenameTagPayload): Promise<RenameTagResponse> {
  return request<RenameTagResponse>('/api/tags/rename', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

interface PurgeTagPayload {
  tag: string
  projectId?: string | null
}

interface PurgeTagResponse {
  tag: string
  purged: number
}

export function purgeTag(payload: PurgeTagPayload): Promise<PurgeTagResponse> {
  return request<PurgeTagResponse>('/api/tags/purge', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

interface SummaryPayload {
  articleId: string
  summary: string
  projectId?: string | null
}

export function updateSummary(payload: SummaryPayload): Promise<any> {
  return request('/api/summary', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function postPublish(payload: PublishPayload): Promise<PublishResponse> {
  return request<PublishResponse>('/api/publish', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getLiveSessionState(projectId: string | null, sessionId: string): Promise<LiveSessionState> {
  const params = new URLSearchParams({ sessionId })
  if (projectId) params.set('projectId', projectId)
  return request<LiveSessionState>(`/api/live-session-state?${params.toString()}`)
}

export function getLegacyCandidates(projectId: string): Promise<LegacyCandidatesResponse> {
  return request<LegacyCandidatesResponse>(`/api/legacy-candidates?projectId=${encodeURIComponent(projectId)}`)
}

export function migrateLegacyCandidates(projectId: string, candidateIds?: string[]): Promise<LegacyMigrateResponse> {
  return request<LegacyMigrateResponse>('/api/legacy-candidates/migrate', {
    method: 'POST',
    body: JSON.stringify({ projectId, candidateIds }),
  })
}

interface ProjectsResponse {
  projects: { id: string; name: string; root: string; dataRoot: string }[]
  currentId: string | null
}

export function getProjects(): Promise<ProjectsResponse> {
  return request<ProjectsResponse>('/api/projects')
}

export function getClaudeImportCandidates(projectId: string): Promise<ClaudeImportCandidatesResponse> {
  return request<ClaudeImportCandidatesResponse>(`/api/import/claude-candidates?projectId=${encodeURIComponent(projectId)}`)
}

export function importClaudeSessions(projectId: string, sessionIds: string[]): Promise<ClaudeImportResponse> {
  return request<ClaudeImportResponse>('/api/import/claude', {
    method: 'POST',
    body: JSON.stringify({ projectId, sessionIds }),
  })
}

export { EchoApiError, CONFIGURED_API_BASE, DEFAULT_API_BASE }
export type { EchoStatus, CommentPayload, TagPayload, RemoveTagPayload, RenameTagPayload, RenameTagResponse, PurgeTagPayload, PurgeTagResponse, SummaryPayload, PublishPayload, PublishResponse, LiveSessionState, LegacyCandidate, LegacyCandidatesResponse, LegacyMigrateResponse, ClaudeImportCandidate, ClaudeImportCandidatesResponse, ClaudeImportResponse }
