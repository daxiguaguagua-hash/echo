<template>
  <div class="echo-tag-cloud" aria-label="标签筛选">
    <!-- Existing tag chips with action buttons -->
    <div
      v-for="group in groups"
      :key="group.anchor"
      class="echo-tag-chip-row"
    >
      <!-- Inline rename for editing tag -->
      <template v-if="editingTag === group.tag">
        <input
          :ref="(el) => { if (el) renameInput = el as HTMLInputElement }"
          v-model="renameValue"
          class="echo-tag-rename-input"
          maxlength="60"
          @keydown.enter="confirmRename(group.tag)"
          @keydown.escape="cancelRename"
          @blur="confirmRename(group.tag)"
        />
        <button class="echo-tag-action-btn echo-tag-action-confirm" title="确认" @mousedown.prevent="confirmRename(group.tag)">✓</button>
        <button class="echo-tag-action-btn echo-tag-action-cancel" title="取消" @mousedown.prevent="cancelRename">✕</button>
      </template>

      <!-- Normal display -->
      <template v-else>
        <a
          :href="`#${encodeURIComponent(group.anchor)}`"
          class="echo-tag-chip"
          :class="{ 'echo-tag-chip-active': group.anchor === selectedAnchor, 'echo-tag-chip-muted': selectedAnchor && group.anchor !== selectedAnchor }"
          @click="select(group.anchor)"
        >
          {{ group.tag }}<span>{{ group.articles.length }}</span>
        </a>
        <button
          class="echo-tag-action-btn"
          title="重命名"
          :disabled="busyTag === group.tag"
          @click.stop="startRename(group.tag)"
        >✏️</button>
        <button
          class="echo-tag-action-btn echo-tag-action-danger"
          title="删除"
          :disabled="busyTag === group.tag"
          @click.stop="promptDelete(group.tag, group.articles.length)"
        >🗑️</button>
      </template>
    </div>

    <!-- New tag button -->
    <button
      class="echo-tag-new-btn"
      :disabled="busy"
      @click="showNewTagModal = true"
    >+ 新建标签</button>
  </div>

  <!-- Delete confirmation -->
  <div v-if="deleteTarget" class="echo-modal" @click.self="deleteTarget = null">
    <div class="echo-modal-content">
      <h3>删除标签「{{ deleteTarget.tag }}」</h3>
      <p>此标签将从 {{ deleteTarget.count }} 篇文章中移除。此操作不可撤销。</p>
      <div class="echo-modal-btns">
        <button class="echo-btn" :disabled="busy" @click="doDelete">确认删除</button>
        <button class="echo-btn echo-btn-off" :disabled="busy" @click="deleteTarget = null">取消</button>
      </div>
      <p v-if="error" class="echo-serve-notice">{{ error }}</p>
    </div>
  </div>

  <!-- New tag modal -->
  <div v-if="showNewTagModal" class="echo-modal" @click.self="showNewTagModal = false">
    <div class="echo-modal-content">
      <h3>新建标签</h3>
      <input
        v-model="newTagName"
        class="echo-tag-rename-input"
        placeholder="输入标签名..."
        maxlength="60"
        style="width:100%;box-sizing:border-box;margin:12px 0;"
        @keydown.enter="doCreateTag"
      />
      <p class="echo-muted-text" style="font-size:13px;margin:0 0 12px;">
        选择要添加此标签的文章（至少选择一篇）：
      </p>
      <div class="echo-new-tag-articles">
        <label
          v-for="article in allArticles"
          :key="article.id"
          class="echo-new-tag-article-label"
        >
          <input
            type="checkbox"
            :value="article.id"
            v-model="selectedArticleIds"
          />
          <span class="echo-new-tag-article-title">{{ article.title }}</span>
        </label>
      </div>
      <div class="echo-modal-btns">
        <button
          class="echo-btn"
          :disabled="busy || !newTagName.trim() || selectedArticleIds.length === 0"
          @click="doCreateTag"
        >创建</button>
        <button class="echo-btn echo-btn-off" :disabled="busy" @click="showNewTagModal = false">取消</button>
      </div>
      <p v-if="error" class="echo-serve-notice">{{ error }}</p>
    </div>
  </div>

  <!-- Toast -->
  <div v-if="toast" class="echo-toast">{{ toast }}</div>

  <!-- Results -->
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
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { renameTag, purgeTag, postTag } from '../lib/echo-api'

type TagArticle = {
  id: string
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

// --- Rename ---
const editingTag = ref('')
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const busyTag = ref('')
const error = ref('')
const toast = ref('')

function startRename(tag: string) {
  editingTag.value = tag
  renameValue.value = tag
  error.value = ''
  nextTick(() => renameInput.value?.focus())
}

function cancelRename() {
  editingTag.value = ''
  renameValue.value = ''
  error.value = ''
}

async function confirmRename(oldTag: string) {
  const newTag = renameValue.value.trim()
  if (!newTag || newTag === oldTag) {
    cancelRename()
    return
  }
  busy.value = true
  busyTag.value = oldTag
  error.value = ''
  try {
    const result = await renameTag({ oldTag, newTag })
    editingTag.value = ''
    renameValue.value = ''
    toast.value = `已重命名：${oldTag} → ${newTag}（${result.renamed} 篇文章）`
    setTimeout(() => { toast.value = '' }, 3000)
    // Reload the page to get updated tags payload
    setTimeout(() => { window.location.reload() }, 800)
  } catch (err: any) {
    error.value = err?.message || '重命名失败'
  } finally {
    busy.value = false
    busyTag.value = ''
  }
}

// --- Delete ---
const deleteTarget = ref<{ tag: string; count: number } | null>(null)

function promptDelete(tag: string, count: number) {
  deleteTarget.value = { tag, count }
  error.value = ''
}

async function doDelete() {
  if (!deleteTarget.value) return
  const tag = deleteTarget.value.tag
  busy.value = true
  busyTag.value = tag
  error.value = ''
  try {
    const result = await purgeTag({ tag })
    deleteTarget.value = null
    toast.value = `已删除标签「${tag}」（从 ${result.purged} 篇文章中移除）`
    setTimeout(() => { toast.value = '' }, 3000)
    setTimeout(() => { window.location.reload() }, 800)
  } catch (err: any) {
    error.value = err?.message || '删除失败'
  } finally {
    busy.value = false
    busyTag.value = ''
  }
}

// --- Create ---
const showNewTagModal = ref(false)
const newTagName = ref('')
const selectedArticleIds = ref<string[]>([])

const allArticles = computed(() => {
  const seen = new Map<string, TagArticle>()
  for (const group of groups.value) {
    for (const article of group.articles) {
      if (!seen.has(article.id)) {
        seen.set(article.id, article)
      }
    }
  }
  return [...seen.values()]
})

async function doCreateTag() {
  const tag = newTagName.value.trim()
  if (!tag || selectedArticleIds.value.length === 0) return
  busy.value = true
  error.value = ''
  try {
    // Add tag to each selected article
    for (const articleId of selectedArticleIds.value) {
      await postTag({ articleId, tag })
    }
    showNewTagModal.value = false
    newTagName.value = ''
    selectedArticleIds.value = []
    toast.value = `已创建标签「${tag}」（${selectedArticleIds.value.length} 篇文章）`
    setTimeout(() => { toast.value = '' }, 3000)
    setTimeout(() => { window.location.reload() }, 800)
  } catch (err: any) {
    error.value = err?.message || '创建失败'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  syncFromHash()
  window.addEventListener('hashchange', syncFromHash)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', syncFromHash)
})
</script>
