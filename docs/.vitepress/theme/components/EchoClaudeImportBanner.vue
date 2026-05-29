<template>
  <div v-if="visible" class="echo-import-banner">
    <div class="echo-import-banner-inner">
      <div class="echo-import-banner-header" @click="expanded = !expanded">
        <span class="echo-import-banner-icon">📥</span>
        <span class="echo-import-banner-title">
          发现 <strong>{{ candidates.length }}</strong> 个未导入的 Claude 历史会话
        </span>
        <span class="echo-import-banner-chevron">{{ expanded ? '▾' : '▸' }}</span>
        <button class="echo-import-banner-close" @click.stop="dismiss" title="关闭">✕</button>
      </div>

      <div v-if="expanded" class="echo-import-banner-body">
        <p class="echo-import-banner-desc">
          这些会话来自 Claude Code 的 JSONL 转录文件，尚未导入 Echo。
          导入后它们会作为不可变文章出现在当前项目的文章列表中。
        </p>

        <div class="echo-import-banner-candidates" v-if="candidates.length > 0">
          <div v-for="c in candidates" :key="c.sessionId" class="echo-import-candidate-item">
            <span class="echo-import-candidate-id">{{ c.articleId }}</span>
            <span class="echo-import-candidate-meta">{{ c.turnCount }} turns · {{ formatDate(c.mtime) }}</span>
            <span class="echo-import-candidate-status" :class="'echo-status-' + c.status">{{ statusLabel(c.status) }}</span>
          </div>
        </div>

        <div class="echo-import-banner-cli">
          <p class="echo-import-banner-cli-title">💡 命令行导入</p>
          <pre class="echo-import-banner-cli-code"><code>echoctl import claude --project {{ projectRoot || '&lt;项目路径&gt;' }} --all --apply</code></pre>
          <p class="echo-import-banner-cli-note">
            更多选项：<code>echoctl import claude --help</code>
          </p>
        </div>

        <div v-if="error" class="echo-import-banner-error">{{ error }}</div>
        <div v-if="success" class="echo-import-banner-success">{{ success }}</div>

        <div class="echo-import-banner-actions">
          <button
            class="echo-import-btn echo-import-btn-primary"
            :disabled="importing"
            @click="importAll"
          >
            {{ importing ? '导入中…' : `导入全部（${candidates.length} 个）` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getClaudeImportCandidates, importClaudeSessions, getStatus } from '../lib/echo-api'

const STORAGE_KEY = 'echo-claude-import-dismissed'

const visible = ref(false)
const expanded = ref(false)
const candidates = ref<any[]>([])
const projectRoot = ref('')
const projectId = ref<string | null>(null)
const importing = ref(false)
const error = ref('')
const success = ref('')

onMounted(async () => {
  // 检查是否已被关闭（跨会话保留）
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return
  } catch (_) {}

  // 获取当前项目 ID
  let pid: string | null = null
  try {
    const s = await getStatus()
    pid = s.projectId
  } catch (_) {}

  if (!pid) return
  projectId.value = pid

  try {
    const result = await getClaudeImportCandidates(pid)
    const newCandidates = result.candidates.filter(
      (c) => c.status === 'new' || c.status === 'updated'
    )
    if (newCandidates.length === 0) return
    candidates.value = newCandidates
    projectRoot.value = result.projectDir || ''
    visible.value = true
  } catch (_) {}
})

function dismiss() {
  visible.value = false
  try { localStorage.setItem(STORAGE_KEY, '1') } catch (_) {}
}

function statusLabel(status: string): string {
  switch (status) {
    case 'new': return '新'
    case 'updated': return '已更新'
    case 'skipped': return '已跳过'
    default: return status
  }
}

function formatDate(mtime: string): string {
  try {
    const d = new Date(mtime)
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return mtime
  }
}

async function importAll() {
  if (!projectId.value) return
  importing.value = true
  error.value = ''
  success.value = ''
  try {
    const ids = candidates.value.map((c) => c.sessionId)
    const result = await importClaudeSessions(projectId.value, ids)
    if (result.ok) {
      success.value = `已导入 ${result.imported} 个会话，跳过 ${result.skipped} 个。页面即将刷新…`
      try { localStorage.removeItem(STORAGE_KEY) } catch (_) {}
      setTimeout(() => location.reload(), 2000)
    }
  } catch (err: any) {
    error.value = err.message || '导入失败'
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.echo-import-banner {
  margin: 16px 0 24px;
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}

.echo-import-banner-inner {
  padding: 0;
}

.echo-import-banner-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.echo-import-banner-header:hover {
  background: var(--vp-c-bg-mute);
}

.echo-import-banner-icon {
  font-size: 16px;
}

.echo-import-banner-title {
  flex: 1;
  font-size: 14px;
  color: var(--vp-c-text-1);
}

.echo-import-banner-chevron {
  font-size: 12px;
  color: var(--vp-c-text-3);
  transition: transform 0.15s;
}

.echo-import-banner-close {
  background: none;
  border: none;
  color: var(--vp-c-text-3);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.echo-import-banner-close:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
}

.echo-import-banner-body {
  padding: 0 16px 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.echo-import-banner-desc {
  margin: 12px 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.echo-import-banner-candidates {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}

.echo-import-candidate-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--vp-c-divider-light);
  font-size: 13px;
}
.echo-import-candidate-item:last-child {
  border-bottom: none;
}

.echo-import-candidate-id {
  font-family: monospace;
  font-weight: 600;
  color: var(--vp-c-brand);
  min-width: 140px;
}

.echo-import-candidate-meta {
  color: var(--vp-c-text-3);
  flex: 1;
}

.echo-import-candidate-status {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.echo-status-new {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand);
}
.echo-status-updated {
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning);
}

.echo-import-banner-cli {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}

.echo-import-banner-cli-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.echo-import-banner-cli-code {
  margin: 0 0 4px;
  padding: 8px 12px;
  background: var(--vp-code-block-bg);
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}
.echo-import-banner-cli-code code {
  color: var(--vp-c-text-1);
}

.echo-import-banner-cli-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.echo-import-banner-cli-note code {
  font-size: 12px;
}

.echo-import-banner-error {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger);
  border-radius: 4px;
  font-size: 13px;
}

.echo-import-banner-success {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand);
  border-radius: 4px;
  font-size: 13px;
}

.echo-import-banner-actions {
  display: flex;
  gap: 8px;
}

.echo-import-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  font-size: 14px;
}

.echo-import-btn-primary {
  background: var(--vp-c-brand);
  color: #fff;
  border-color: var(--vp-c-brand);
}
.echo-import-btn-primary:hover {
  background: var(--vp-c-brand-dark);
}
.echo-import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
