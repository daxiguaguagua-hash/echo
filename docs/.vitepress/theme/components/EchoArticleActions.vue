<template>
  <div v-if="state === 'unavailable'" class="echo-serve-notice">
    Echo API 未运行 — 运行 <code>echoctl serve</code> 以启用交互功能
  </div>
  <div v-else class="echo-toolbar">
    <div class="echo-toolbar-btns">
      <button
        class="echo-btn"
        :class="status?.captureEnabled ? 'echo-btn-on' : 'echo-btn-off'"
        :disabled="state !== 'ready'"
        @click="toggleCapture"
      >
        收集: {{ status?.captureEnabled ? '开' : '关' }}
      </button>
      <button
        class="echo-btn"
        :disabled="state !== 'ready'"
        @click="showMcp"
      >
        MCP 配置
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="mcpVisible" class="echo-modal" @click.self="mcpVisible = false">
      <div class="echo-modal-content">
        <h3>MCP 配置</h3>
        <p>将此 JSON 添加到你的 Claude/Codex MCP 配置文件中：</p>
        <pre>{{ mcpConfigText }}</pre>
        <div class="echo-modal-btns">
          <button class="echo-btn" @click="copyMcp">复制</button>
          <button class="echo-btn" @click="mcpVisible = false">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>

  <div class="echo-comment-box">
    <h3>发表评论</h3>
    <textarea
      v-model="commentText"
      placeholder="对整篇文章的评论..."
      rows="3"
      :disabled="state !== 'ready'"
    ></textarea>
    <button
      class="echo-btn"
      :disabled="state !== 'ready' || !commentText.trim() || submitting"
      @click="submitComment"
    >
      {{ submitting ? '提交中...' : '提交评论' }}
    </button>
    <span v-if="submitError" style="color:var(--vp-c-danger-1);font-size:13px;">{{ submitError }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'
import { useEchoStatus } from '../lib/useEchoStatus'
import { setCapture, getMcpConfig, postComment } from '../lib/echo-api'

const { frontmatter } = useData()
const articleId = computed(() => (frontmatter.value as any)?.echo?.articleId as string | undefined)
const projectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)

const { state, status } = useEchoStatus(articleId)

const mcpVisible = ref(false)
const mcpConfigText = ref('')
const commentText = ref('')
const submitting = ref(false)
const submitError = ref('')

async function toggleCapture() {
  if (!status.value) return
  try {
    const r = await setCapture(!status.value.captureEnabled)
    status.value = { ...status.value, captureEnabled: r.enabled }
  } catch (_) {}
}

async function showMcp() {
  try {
    const cfg = await getMcpConfig()
    const json = JSON.stringify({
      mcpServers: { echo: { command: cfg.canonical.command, args: cfg.canonical.args } }
    }, null, 2)
    mcpConfigText.value = json
    mcpVisible.value = true
  } catch (_) {}
}

async function copyMcp() {
  try {
    await navigator.clipboard.writeText(mcpConfigText.value)
  } catch (_) {}
}

async function submitComment() {
  if (!articleId.value || !commentText.value.trim()) return
  submitting.value = true
  submitError.value = ''
  try {
    await postComment({
      articleId: articleId.value,
      comment: commentText.value.trim(),
      scope: 'article',
      projectId: projectId.value ?? null,
    })
    commentText.value = ''
    location.reload()
  } catch (err: any) {
    submitError.value = err.message || '提交失败'
  } finally {
    submitting.value = false
  }
}
</script>
