<template>
  <div v-if="visible" class="echo-legacy-overlay" @click.self="dismiss">
    <div class="echo-legacy-dialog">
      <h2>Echo 发现遗留会话 / Echo found legacy sessions</h2>
      <p class="echo-legacy-desc">
        Echo 发现有一些会话记录之前进入了 legacy 区。它们看起来属于当前项目。<br/>
        Echo found chat records in the legacy area. They appear to belong to the current project.
      </p>
      <p class="echo-legacy-question">
        是否迁移到当前项目？迁移后，它们会出现在当前项目的实时会话或文章列表中。<br/>
        Move them into this project? After migration, they will appear in this project's live sessions or articles.
      </p>

      <div v-if="mode === 'list' && candidates.length > 0" class="echo-legacy-list">
        <div v-for="c in candidates" :key="c.sessionId" class="echo-legacy-item">
          <span class="echo-legacy-session">{{ c.fileName }}</span>
          <span class="echo-legacy-meta">{{ c.turnCount }} turns, {{ c.confidence }} confidence</span>
        </div>
      </div>

      <div v-if="error" class="echo-legacy-error">{{ error }}</div>
      <div v-if="success" class="echo-legacy-success">{{ success }}</div>

      <div class="echo-legacy-buttons">
        <button class="echo-legacy-btn later" @click="dismiss" :disabled="migrating">
          稍后处理 / Later
        </button>
        <button v-if="mode === 'prompt'" class="echo-legacy-btn review" @click="mode = 'list'">
          查看候选 / Review
        </button>
        <button class="echo-legacy-btn migrate" @click="migrate" :disabled="migrating">
          {{ migrating ? '迁移中... / Migrating...' : '迁移到当前项目 / Move to this project' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useData } from 'vitepress'
import { getLegacyCandidates, migrateLegacyCandidates, getStatus } from '../lib/echo-api'

const props = defineProps<{ projectId?: string }>()

const { frontmatter } = useData()
const pageProjectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)

const visible = ref(false)
const mode = ref<'prompt' | 'list'>('prompt')
const candidates = ref<any[]>([])
const migrating = ref(false)
const error = ref('')
const success = ref('')
const resolvedProjectId = ref<string | null>(null)

onMounted(async () => {
  let pid = pageProjectId.value || props.projectId || null
  if (!pid) {
    try { const s = await getStatus(); pid = s.projectId } catch (_) {}
  }
  if (!pid) return
  resolvedProjectId.value = pid
  try {
    const result = await getLegacyCandidates(pid)
    if (result.candidates.length > 0) {
      candidates.value = result.candidates
      visible.value = true
    }
  } catch (_) {}
})

function dismiss() {
  visible.value = false
}

async function migrate() {
  migrating.value = true
  error.value = ''
  try {
    const ids = candidates.value.map((c) => c.sessionId)
    const result = await migrateLegacyCandidates(resolvedProjectId.value!, ids)
    if (result.ok) {
      success.value = `已迁移 ${result.migrated} 个会话。页面即将刷新... / Migrated ${result.migrated} sessions. Refreshing...`
      setTimeout(() => location.reload(), 1500)
    }
  } catch (err: any) {
    error.value = err.message || '迁移失败 / Migration failed'
  } finally {
    migrating.value = false
  }
}
</script>

<style scoped>
.echo-legacy-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.echo-legacy-dialog {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 24px;
  max-width: 520px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.echo-legacy-dialog h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
.echo-legacy-desc, .echo-legacy-question {
  margin: 0 0 12px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}
.echo-legacy-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}
.echo-legacy-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px;
}
.echo-legacy-session {
  font-weight: 600;
}
.echo-legacy-meta {
  color: var(--vp-c-text-3);
}
.echo-legacy-error {
  color: var(--vp-c-danger);
  margin-bottom: 12px;
  font-size: 14px;
}
.echo-legacy-success {
  color: var(--vp-c-brand);
  margin-bottom: 12px;
  font-size: 14px;
}
.echo-legacy-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.echo-legacy-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  font-size: 14px;
}
.echo-legacy-btn.migrate {
  background: var(--vp-c-brand);
  color: #fff;
  border-color: var(--vp-c-brand);
}
.echo-legacy-btn.migrate:hover {
  background: var(--vp-c-brand-dark);
}
.echo-legacy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
