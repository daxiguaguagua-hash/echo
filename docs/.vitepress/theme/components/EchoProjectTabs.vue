<template>
  <div class="echo-project-tabs" aria-label="项目筛选">
    <a
      v-for="tab in tabs"
      :key="tab.key"
      :href="`#${encodeURIComponent(tab.anchor)}`"
      class="echo-project-tab"
      :class="{ 'echo-project-tab-active': tab.key === selectedKey }"
      @click="select(tab.key)"
    >
      {{ tab.label }}<span>{{ tab.articles.length }}</span>
    </a>
  </div>

  <div class="echo-article-grid">
    <a
      v-for="article in selectedArticles"
      :key="article.href"
      class="echo-article-card"
      :href="article.href"
    >
      <strong>{{ article.title }}</strong>
      <small>{{ article.updated || '-' }}</small>
      <p>{{ article.summary || '无摘要' }}</p>
      <div v-if="article.tags.length" class="echo-tags">
        <span v-for="tag in article.tags" :key="tag">{{ tag }}</span>
      </div>
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

type ProjectArticle = {
  href: string
  summary?: string
  tags: string[]
  title: string
  updated?: string
}

type ProjectGroup = {
  anchor: string
  articles: ProjectArticle[]
  key: string
  label: string
}

const props = defineProps<{ payload: string }>()

const projectGroups = computed<ProjectGroup[]>(() => {
  try {
    return JSON.parse(decodeURIComponent(props.payload)) as ProjectGroup[]
  } catch {
    return []
  }
})

const allTab = computed<ProjectGroup>(() => ({
  anchor: 'project-all',
  articles: projectGroups.value.flatMap((group) => group.articles),
  key: '__all__',
  label: '全部',
}))

const tabs = computed(() => [allTab.value, ...projectGroups.value])
const selectedKey = ref('__all__')

const selectedArticles = computed(() => {
  return tabs.value.find((tab) => tab.key === selectedKey.value)?.articles || []
})

function syncFromHash() {
  const hash = decodeURIComponent(window.location.hash.slice(1) || '')
  const tab = tabs.value.find((item) => item.anchor === hash)
  selectedKey.value = tab?.key || '__all__'
}

function select(key: string) {
  selectedKey.value = key
}

onMounted(() => {
  syncFromHash()
  window.addEventListener('hashchange', syncFromHash)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', syncFromHash)
})
</script>
