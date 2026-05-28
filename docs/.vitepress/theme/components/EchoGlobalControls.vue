<template>
  <div class="echo-global-controls">
    <button
      class="echo-global-btn"
      :class="status?.captureEnabled ? 'echo-btn-on' : 'echo-btn-off'"
      :disabled="state !== 'ready'"
      :title="state === 'ready' ? '切换 Echo 收集状态' : 'Echo API 未运行'"
      @click="toggleCapture"
    >
      收集 {{ status?.captureEnabled ? '开' : '关' }}
    </button>
    <button
      class="echo-global-btn"
      :disabled="state !== 'ready'"
      title="复制 Echo MCP 配置"
      @click="showMcp"
    >
      MCP
    </button>
  </div>

  <Teleport to="body">
    <div v-if="mcpVisible" class="echo-modal" @click.self="mcpVisible = false">
      <div class="echo-modal-content">
        <h3>MCP 配置</h3>
        <p>这是 AI 访问 Echo 的桥。将此 JSON 添加到 Claude/Codex MCP 配置中：</p>
        <pre>{{ mcpConfigText }}</pre>
        <div class="echo-modal-btns">
          <button class="echo-btn" @click="copyMcp">复制</button>
          <button class="echo-btn" @click="mcpVisible = false">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useEchoStatus } from '../lib/useEchoStatus'
import { getMcpConfig, setCapture } from '../lib/echo-api'

const articleId = ref<string | undefined>(undefined)
const { state, status } = useEchoStatus(articleId)

const mcpVisible = ref(false)
const mcpConfigText = ref('')

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
    mcpConfigText.value = JSON.stringify({
      mcpServers: { echo: { command: cfg.canonical.command, args: cfg.canonical.args } }
    }, null, 2)
    mcpVisible.value = true
  } catch (_) {}
}

async function copyMcp() {
  try {
    await navigator.clipboard.writeText(mcpConfigText.value)
  } catch (_) {}
}
</script>
