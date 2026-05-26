<template>
  <div class="echo-tag-cloud" aria-label="标签筛选">
    <a
      v-for="group in groups"
      :key="group.anchor"
      :href="`#${encodeURIComponent(group.anchor)}`"
      class="echo-tag-chip"
      :class="{ 'echo-tag-chip-active': group.anchor === selectedAnchor, 'echo-tag-chip-muted': selectedAnchor && group.anchor !== selectedAnchor }"
      @click="select(group.anchor)"
    >
      {{ group.tag }}<span>{{ group.articles.length }}</span>
    </a>
  </div>

  <div v-if="selectedGroup" class="echo-tag-result">
    <h2 :id="selectedGroup.anchor">{{ selectedGroup.tag }} ({{ selectedGroup.articles.length }})</h2>
    <div class="echo-article-grid">
      <a
        v-for="article in selectedGroup.articles"
        :key="article.href"
        class="echo-article-card"
        :href="article.href"
      >
        <strong>{{ article.title }}</strong>
        <p>{{ article.summary || '无摘要' }}</p>
      </a>
    </div>
  </div>

  <div v-else class="echo-tag-result">
    <h2>选择一个标签</h2>
    <p class="echo-muted-text">点击上方标签后，只显示对应文章。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

type TagArticle = {
  href: string
  summary?: string
  title: string
}

type TagGroup = {
  anchor: string
  articles: TagArticle[]
  tag: string
}

const props = defineProps<{ payload: string }>()

const groups = computed<TagGroup[]>(() => {
  try {
    return JSON.parse(decodeURIComponent(props.payload)) as TagGroup[]
  } catch {
    return []
  }
})

const selectedAnchor = ref('')

const selectedGroup = computed(() => {
  const anchor = selectedAnchor.value || groups.value[0]?.anchor || ''
  return groups.value.find((group) => group.anchor === anchor) || null
})

function syncFromHash() {
  selectedAnchor.value = decodeURIComponent(window.location.hash.slice(1) || '') || groups.value[0]?.anchor || ''
}

function select(anchor: string) {
  selectedAnchor.value = anchor
}

onMounted(() => {
  syncFromHash()
  window.addEventListener('hashchange', syncFromHash)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', syncFromHash)
})
</script>
