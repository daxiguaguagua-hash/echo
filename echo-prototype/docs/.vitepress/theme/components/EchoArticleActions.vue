<template>
  <div v-if="state === 'unavailable'" class="echo-serve-notice">
    Echo API 未运行 — 运行 <code>echoctl serve</code> 以启用评论和标记
  </div>

  <div class="echo-tag-strip">
    <span class="echo-tag-strip-label">标记</span>
    <div class="echo-existing-tags" v-if="existingTags.length">
      <span v-for="tag in existingTags" :key="tag" class="echo-tag-chip">
        {{ tag }}
        <button
          class="echo-tag-remove"
          :disabled="state !== 'ready' || removingTags.has(tag)"
          title="删除标记"
          @click="removeTag(tag)"
        >×</button>
      </span>
    </div>
    <div class="echo-tag-form">
      <input
        v-model="tagText"
        placeholder="添加文章标记"
        :disabled="state !== 'ready'"
        @keydown.enter.prevent="submitTag"
      />
      <button
        class="echo-btn"
        :disabled="state !== 'ready' || !tagText.trim() || tagging"
        @click="submitTag"
      >
        {{ tagging ? '添加中...' : '添加' }}
      </button>
    </div>
    <span v-if="tagError" class="echo-inline-error">{{ tagError }}</span>
  </div>

  <div class="echo-summary-strip">
    <span class="echo-summary-strip-label">摘要</span>
    <textarea
      v-model="summaryText"
      placeholder="文章摘要..."
      rows="2"
      :disabled="state !== 'ready' || savingSummary"
    ></textarea>
    <div class="echo-summary-actions">
      <button
        class="echo-btn"
        :disabled="state !== 'ready' || savingSummary || summaryText === originalSummary"
        @click="saveSummary"
      >
        {{ savingSummary ? '保存中...' : '保存摘要' }}
      </button>
      <span v-if="summaryError" class="echo-inline-error">{{ summaryError }}</span>
      <span v-if="summarySaved" class="echo-inline-ok">{{ summarySaved }}</span>
    </div>
  </div>

  <div v-if="canPublish" class="echo-publish-strip">
    <button
      class="echo-btn"
      :disabled="state !== 'ready' || publishing"
      @click="publishLatest"
    >
      {{ publishing ? '发布中...' : '发布最新快照' }}
    </button>
    <span v-if="publishMessage" class="echo-inline-ok">{{ publishMessage }}</span>
    <span v-if="publishError" class="echo-inline-error">{{ publishError }}</span>
  </div>

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
import { ref, computed, watch } from 'vue'
import { useData } from 'vitepress'
import { useEchoStatus } from '../lib/useEchoStatus'
import { EchoApiError, postComment, postPublish, postTag, removeTags, updateSummary } from '../lib/echo-api'

const { frontmatter } = useData()
const articleId = computed(() => (frontmatter.value as any)?.echo?.articleId as string | undefined)
const projectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)

const { state, status } = useEchoStatus(articleId)

const commentText = ref('')
const submitting = ref(false)
const submitError = ref('')
const existingTags = computed(() => {
  const tags = (frontmatter.value as any)?.tags
  return Array.isArray(tags) ? tags : []
})
const removingTags = ref<Set<string>>(new Set())
const tagText = ref('')
const tagging = ref(false)
const tagError = ref('')
const summaryText = ref('')
const originalSummary = ref('')
const savingSummary = ref(false)
const summaryError = ref('')
const summarySaved = ref('')
const publishing = ref(false)
const publishMessage = ref('')
const publishError = ref('')
const canPublish = computed(() => !!articleId.value?.startsWith('session-'))

watch(articleId, () => {
  tagError.value = ''
  submitError.value = ''
  publishMessage.value = ''
  publishError.value = ''
  tagText.value = ''
  commentText.value = ''
  summaryError.value = ''
  summarySaved.value = ''
  const s = (frontmatter.value as any)?.summary || ''
  summaryText.value = s
  originalSummary.value = s
})

async function submitComment() {
  if (!articleId.value || !commentText.value.trim()) return
  submitting.value = true
  submitError.value = ''
  try {
    await postComment({
      articleId: articleId.value,
      comment: commentText.value.trim(),
      scope: 'article',
      author: status.value?.author,
      projectId: projectId.value ?? null,
    })
    commentText.value = ''
    submitError.value = '评论已提交，即将刷新...'
    setTimeout(() => location.reload(), 1200)
  } catch (err: any) {
    submitError.value = err.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

async function submitTag() {
  if (!articleId.value || !tagText.value.trim()) return
  tagging.value = true
  tagError.value = ''
  try {
    await postTag({
      articleId: articleId.value,
      tag: tagText.value.trim(),
      projectId: projectId.value ?? null,
    })
    tagText.value = ''
    location.reload()
  } catch (err: any) {
    tagError.value = err.message || '创建失败'
  } finally {
    tagging.value = false
  }
}

async function removeTag(tag: string) {
  if (!articleId.value) return
  removingTags.value = new Set([...removingTags.value, tag])
  tagError.value = ''
  try {
    await removeTags({
      articleId: articleId.value,
      tags: [tag],
      projectId: projectId.value ?? null,
    })
    location.reload()
  } catch (err: any) {
    tagError.value = err.message || '删除失败'
    removingTags.value = new Set([...removingTags.value].filter(t => t !== tag))
  }
}

async function saveSummary() {
  if (!articleId.value) return
  savingSummary.value = true
  summaryError.value = ''
  summarySaved.value = ''
  try {
    await updateSummary({
      articleId: articleId.value,
      summary: summaryText.value.trim(),
      projectId: projectId.value ?? null,
    })
    originalSummary.value = summaryText.value.trim()
    summarySaved.value = '摘要已保存'
    setTimeout(() => { summarySaved.value = '' }, 3000)
  } catch (err: any) {
    summaryError.value = err.message || '保存失败'
  } finally {
    savingSummary.value = false
  }
}

async function publishLatest() {
  if (!articleId.value) return
  publishing.value = true
  publishMessage.value = ''
  publishError.value = ''
  try {
    const result = await postPublish({
      sessionId: articleId.value,
      projectId: projectId.value ?? null,
    })
    publishMessage.value = '发布成功，即将跳转...'
    setTimeout(() => { window.location.href = `/articles/generated/${result.slug}` }, 1000)
  } catch (err: any) {
    publishError.value = err instanceof EchoApiError && err.status === 409
      ? '已经是最新快照'
      : err.message || '发布失败'
  } finally {
    publishing.value = false
  }
}
</script>
