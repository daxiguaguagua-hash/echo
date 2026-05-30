<template>
  <div class="echo-project-tabs" aria-label="项目筛选">
    <a
      v-for="tab in tabs"
      :key="tab.key"
      :href="`#${encodeURIComponent(tab.anchor)}`"
      class="echo-project-tab"
      :class="{ 'echo-project-tab-active': tab.key === selectedKey }"
      @click.prevent="select(tab.key)"
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useProjectFilter } from '../lib/useProjectFilter'

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

const projectFilter = useProjectFilter()

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

const emptyProjectTabs = computed<ProjectGroup[]>(() => {
  const withArticles = new Set(projectGroups.value.map((group) => group.key))
  return projectFilter.allProjects.value
    .filter((project) => !withArticles.has(project.id))
    .map((project) => ({
      anchor: `project-${project.id}`,
      articles: [],
      key: project.id,
      label: project.name,
    }))
})

const tabs = computed(() => [allTab.value, ...projectGroups.value, ...emptyProjectTabs.value])
const selectedKey = ref('__all__')

const selectedArticles = computed(() => {
  return tabs.value.find((tab) => tab.key === selectedKey.value)?.articles || []
})

function resolveTabKey(projectId: string): string {
  if (projectId === '__all__') return '__all__'
  const tab = tabs.value.find((t) => t.key === projectId)
  return tab ? tab.key : '__all__'
}

function syncFromHash() {
  const hash = decodeURIComponent(window.location.hash.slice(1) || '')
  const tab = tabs.value.find((item) => item.anchor === hash)
  selectedKey.value = tab?.key || '__all__'
}

function select(key: string) {
  selectedKey.value = key
  // Also update the global filter so nav dropdown syncs
  projectFilter.select(key === '__all__' ? '__all__' : key)
}

function syncFromProjectFilter(projectId: string) {
  selectedKey.value = resolveTabKey(projectId)
}

// Sync with global project filter (nav dropdown), including async project loads.
watch(
  () => [projectFilter.selectedProject.value, tabs.value.map((tab) => tab.key).join('|')],
  ([projectId]) => syncFromProjectFilter(projectId),
)

onMounted(() => {
  projectFilter.load()
  projectFilter.restore()
  // If global filter is set, use it; otherwise fall back to hash
  if (projectFilter.selectedProject.value !== '__all__') {
    syncFromProjectFilter(projectFilter.selectedProject.value)
  } else {
    syncFromHash()
  }
  window.addEventListener('hashchange', syncFromHash)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', syncFromHash)
})
</script>
