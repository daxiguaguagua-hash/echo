<template>
  <div class="echo-reply-form" v-if="activeReplyId">
    <textarea
      v-model="replyText"
      :placeholder="`回复 ${activeReplyId}...`"
      rows="2"
    ></textarea>
    <div class="echo-reply-btns">
      <button class="echo-btn" :disabled="!replyText.trim() || submitting" @click="submitReply">
        {{ submitting ? '提交中...' : '提交回复' }}
      </button>
      <button class="echo-btn" @click="cancelReply">取消</button>
    </div>
    <span v-if="replyError" class="echo-inline-error">{{ replyError }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'
import { useEchoStatus } from '../lib/useEchoStatus'
import { postComment } from '../lib/echo-api'

const { frontmatter } = useData()
const articleId = computed(() => (frontmatter.value as any)?.echo?.articleId as string | undefined)
const projectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)
const { status } = useEchoStatus(articleId)

const activeReplyId = ref('')
const replyText = ref('')
const submitting = ref(false)
const replyError = ref('')

function attachReplyButtons() {
  const comments = document.querySelectorAll<HTMLElement>('.echo-comment[data-comment-id]')
  for (const el of comments) {
    if (el.querySelector('.echo-reply-btn')) continue
    const btn = document.createElement('button')
    btn.className = 'echo-btn echo-reply-btn'
    btn.textContent = '回复'
    btn.addEventListener('click', () => {
      const id = el.dataset.commentId
      if (!id) return
      activeReplyId.value = id
      replyText.value = ''
      replyError.value = ''
    })
    el.appendChild(btn)
  }
}

async function submitReply() {
  if (!activeReplyId.value || !replyText.value.trim() || !articleId.value) return
  submitting.value = true
  replyError.value = ''
  try {
    await postComment({
      articleId: articleId.value,
      comment: replyText.value.trim(),
      scope: 'article',
      author: status.value?.author,
      evolutionOf: [activeReplyId.value],
      evolutionKind: 'expands',
      projectId: projectId.value ?? null,
    })
    replyText.value = ''
    activeReplyId.value = ''
    replyError.value = '回复已提交，即将刷新...'
    setTimeout(() => location.reload(), 1200)
  } catch (err: any) {
    replyError.value = err.message || '提交失败'
  } finally {
    submitting.value = false
  }
}

function cancelReply() {
  activeReplyId.value = ''
  replyText.value = ''
}

let observer: MutationObserver | null = null
onMounted(() => {
  attachReplyButtons()

  observer = new MutationObserver(() => {
    attachReplyButtons()
  })
  observer.observe(document.body, { childList: true, subtree: true })
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>
