<template>
  <div class="echo-live-actions" v-if="!isPublished">
    <button class="echo-publish-btn" @click="publish" :disabled="publishing">
      {{ publishing ? '发布中...' : '发布为正式文章' }}
    </button>
    <span v-if="error" class="echo-publish-error">{{ error }}</span>
    <span v-if="ok" class="echo-publish-ok">{{ ok }}</span>
  </div>
  <div class="echo-live-actions" v-else>
    <a :href="`/articles/generated/${publishedSlug}`" class="echo-published-link">查看已发布文章</a>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { postPublish, EchoApiError } from '../lib/echo-api'

const props = defineProps<{
  projectId: string
  sessionId: string
  published: string
  publishedSlug: string
}>()

const publishing = ref(false)
const error = ref("")
const ok = ref("")
const isPublished = computed(() => props.published === "true")
let refreshTimer: ReturnType<typeof window.setInterval> | null = null

onMounted(() => {
  const livePath = window.location.pathname
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden") return
    if (window.location.pathname === livePath) window.location.reload()
  }, 30000)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})

async function publish() {
  publishing.value = true
  error.value = ""
  ok.value = ""
  try {
    const data = await postPublish({
      projectId: props.projectId || null,
      sessionId: props.sessionId,
    })
    ok.value = '发布成功！页面即将跳转...'
    setTimeout(() => { window.location.href = `/articles/generated/${data.slug}` }, 1500)
  } catch (e: any) {
    error.value = e instanceof EchoApiError && e.status === 409
      ? '已经是最新快照'
      : e.message || '网络错误'
  } finally {
    publishing.value = false
  }
}
</script>
