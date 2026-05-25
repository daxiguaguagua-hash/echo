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
import { postComment } from '../lib/echo-api'

const { frontmatter } = useData()
const articleId = computed(() => (frontmatter.value as any)?.echo?.articleId as string | undefined)
const projectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)

const visible = ref(false)
const popupTop = ref(0)
const popupLeft = ref(0)
let currentQuote = ''

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
    projectId: projectId.value ?? null,
  }).then(() => {
    location.reload()
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
