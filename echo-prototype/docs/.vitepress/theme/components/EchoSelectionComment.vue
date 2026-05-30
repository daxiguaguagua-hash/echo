<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="echo-sel-popup"
      :style="{ top: popupTop + 'px', left: popupLeft + 'px' }"
    >
      <button class="echo-btn" @click="startComment">评论选中文字</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useData } from 'vitepress'
import { useEchoStatus } from '../lib/useEchoStatus'
import { postComment } from '../lib/echo-api'

const { frontmatter } = useData()
const articleId = computed(() => (frontmatter.value as any)?.echo?.articleId as string | undefined)
const projectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)
const { status } = useEchoStatus(articleId)

const visible = ref(false)
const popupTop = ref(0)
const popupLeft = ref(0)
let currentQuote = ''
let currentPrefix = ''
let currentSuffix = ''
let currentOccurrence = 1

function getArticleText(): string {
  const doc = document.querySelector('.vp-doc')
  if (!doc) return ''
  return (doc as HTMLElement).innerText || ''
}

function computeAnchor(quote: string): { prefix: string; suffix: string; occurrence: number } {
  const body = getArticleText()
  const idx = body.indexOf(quote)
  const prefix = body.slice(Math.max(0, idx - 100), idx).trim()
  const suffix = body.slice(idx + quote.length, idx + quote.length + 100).trim()

  let occurrence = 0
  let pos = -1
  while ((pos = body.indexOf(quote, pos + 1)) !== -1) {
    occurrence++
    if (pos === idx) break
  }

  return { prefix, suffix, occurrence }
}

function handleMouseUp(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target) return

  // Only handle selections inside .vp-doc content area
  const doc = target.closest('.vp-doc')
  if (!doc) return

  // Exclude echo components, textareas, buttons, nav
  if (target.closest('.echo-sel-popup, .echo-comment-box, .echo-toolbar, .echo-modal, textarea, button, nav')) return

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const text = sel.toString().trim()
  if (text.length < 3 || text.length > 500) {
    visible.value = false
    return
  }

  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  popupTop.value = window.scrollY + rect.bottom + 8
  popupLeft.value = window.scrollX + rect.left
  currentQuote = text

  const anchor = computeAnchor(text)
  currentPrefix = anchor.prefix
  currentSuffix = anchor.suffix
  currentOccurrence = anchor.occurrence

  visible.value = true
}

function hide() {
  visible.value = false
  currentQuote = ''
}

function startComment() {
  const comment = prompt(`评论 "${currentQuote.slice(0, 60)}...":`)
  if (!comment) { hide(); return }
  postComment({
    articleId: articleId.value || '',
    comment: comment.trim(),
    quote: currentQuote,
    prefix: currentPrefix,
    suffix: currentSuffix,
    occurrence: currentOccurrence,
    author: status.value?.author,
    projectId: projectId.value ?? null,
  }).then(() => {
    setTimeout(() => location.reload(), 800)
  }).catch((err) => {
    alert('评论失败: ' + (err.message || '未知错误'))
  })
  hide()
}

// Hide on click outside
function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target && !target.closest('.echo-sel-popup')) {
    hide()
  }
}

onMounted(() => {
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('click', handleClick)
})

onUnmounted(() => {
  document.removeEventListener('mouseup', handleMouseUp)
  document.removeEventListener('click', handleClick)
})
</script>
