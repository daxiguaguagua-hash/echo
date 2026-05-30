<template>
  <div class="echo-comment-chain" v-if="roots.length > 0">
    <h3>评论回复链</h3>
    <EchoCommentNode
      v-for="root in roots"
      :key="root.id"
      :comment="root"
      :children-map="childrenMap"
      :depth="0"
      :article-id="articleId"
      :project-id="projectId"
      :author="author"
      @reply-submitted="handleReplySubmitted"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useData } from 'vitepress'
import { useEchoStatus } from '../lib/useEchoStatus'
import EchoCommentNode from './EchoCommentNode.vue'

interface CommentData {
  id: string
  author: string
  date: string
  content: string
  quote: string | null
  evolutionOf: string[]
  evolutionKind: string
}

const { frontmatter } = useData()
const articleId = computed(() => (frontmatter.value as any)?.echo?.articleId as string | undefined)
const projectId = computed(() => (frontmatter.value as any)?.echo?.projectId as string | null | undefined)
const { status } = useEchoStatus(articleId)
const author = computed(() => status.value?.author || 'vincent')

const comments = ref<CommentData[]>([])
const roots = ref<CommentData[]>([])
const childrenMap = ref<Map<string, CommentData[]>>(new Map())

function buildTree(items: CommentData[]) {
  const byId = new Map<string, CommentData>()
  for (const c of items) byId.set(c.id, c)

  const children = new Map<string, CommentData[]>()
  const rootIds = new Set(byId.keys())

  for (const c of items) {
    const parents = c.evolutionOf.filter((pid) => byId.has(pid))
    if (parents.length > 0) {
      rootIds.delete(c.id)
      for (const pid of parents) {
        if (!children.has(pid)) children.set(pid, [])
        children.get(pid)!.push(c)
      }
    }
  }

  childrenMap.value = children
  roots.value = [...rootIds].map((id) => byId.get(id)!).sort((a, b) => a.id.localeCompare(b.id))
}

function handleReplySubmitted() {
  setTimeout(() => location.reload(), 1200)
}

onMounted(() => {
  try {
    const el = document.getElementById('echo-comments-data')
    if (!el) return
    const items = JSON.parse(el.textContent || '[]') as CommentData[]
    comments.value = items
    buildTree(items)
  } catch (_) {}
})
</script>
