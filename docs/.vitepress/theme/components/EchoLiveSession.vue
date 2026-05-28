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
import { ref, computed } from 'vue'

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

async function publish() {
  publishing.value = true
  error.value = ""
  ok.value = ""
  try {
    const resp = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: props.projectId || null,
        sessionId: props.sessionId,
      }),
    })
    const data = await resp.json()
    if (!resp.ok) {
      error.value = data.error || '发布失败'
    } else {
      ok.value = '发布成功！页面即将跳转...'
      setTimeout(() => { window.location.href = `/articles/generated/${data.slug}` }, 1500)
    }
  } catch (e: any) {
    error.value = e.message || '网络错误'
  } finally {
    publishing.value = false
  }
}
</script>
