<template>
  <div class="echo-thread" :class="{ 'echo-thread-root': depth === 0 }">
    <div class="echo-thread-item">
      <div class="echo-thread-connector" v-if="depth > 0">
        <span class="echo-evo-kind" v-if="comment.evolutionKind && comment.evolutionKind !== 'null'">
          {{ kindLabel(comment.evolutionKind) }}
        </span>
      </div>
      <div class="echo-thread-card">
        <div class="echo-thread-head">
          <strong>{{ comment.author }}</strong>
          <span>{{ comment.date }}</span>
        </div>
        <div class="echo-thread-body" v-html="comment.content"></div>
        <button class="echo-btn echo-reply-btn" @click="toggleReply">
          {{ replying ? '取消回复' : '回复' }}
        </button>
        <div class="echo-reply-form" v-if="replying">
          <textarea
            v-model="replyText"
            :placeholder="`回复 ${comment.id}...`"
            rows="2"
          ></textarea>
          <div class="echo-reply-btns">
            <button
              class="echo-btn"
              :disabled="!replyText.trim() || submitting"
              @click="submitReply"
            >
              {{ submitting ? '提交中...' : '提交回复' }}
            </button>
            <button class="echo-btn" @click="replying = false">取消</button>
          </div>
          <span v-if="replyError" class="echo-inline-error">{{ replyError }}</span>
        </div>
      </div>
    </div>
    <div class="echo-thread-children">
      <EchoCommentNode
        v-for="child in children"
        :key="child.id"
        :comment="child"
        :children-map="childrenMap"
        :depth="depth + 1"
        :article-id="articleId"
        :project-id="projectId"
        :author="author"
        @reply-submitted="$emit('replySubmitted')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { postComment } from '../lib/echo-api'

interface CommentData {
  id: string
  author: string
  date: string
  content: string
  quote: string | null
  evolutionOf: string[]
  evolutionKind: string
}

const props = defineProps<{
  comment: CommentData
  childrenMap: Map<string, CommentData[]>
  depth: number
  articleId: string | undefined
  projectId: string | null | undefined
  author: string
}>()

const emit = defineEmits<{
  replySubmitted: []
}>()

const children = computed(() => props.childrenMap.get(props.comment.id) || [])

const replying = ref(false)
const replyText = ref('')
const submitting = ref(false)
const replyError = ref('')

const kindLabels: Record<string, string> = {
  expands: '扩展',
  contradicts: '反驳',
  refines: '深化',
  supersedes: '替代',
}

function kindLabel(kind: string): string {
  return kindLabels[kind] || kind
}

function toggleReply() {
  replying.value = !replying.value
  replyText.value = ''
  replyError.value = ''
}

async function submitReply() {
  if (!props.articleId || !replyText.value.trim()) return
  submitting.value = true
  replyError.value = ''
  try {
    await postComment({
      articleId: props.articleId,
      comment: replyText.value.trim(),
      scope: 'article',
      author: props.author,
      evolutionOf: [props.comment.id],
      evolutionKind: 'expands',
      projectId: props.projectId ?? null,
    })
    emit('replySubmitted')
  } catch (err: any) {
    replyError.value = err.message || '提交失败'
  } finally {
    submitting.value = false
  }
}
</script>
