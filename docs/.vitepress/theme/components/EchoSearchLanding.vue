<template></template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const STORAGE_KEY = 'echo:lastSearchQuery'
const APPLIED_KEY = 'echo:lastSearchApplied'
const MAX_AGE_MS = 2 * 60 * 1000
let memorySearch: StoredSearch | null = null
let memoryApplied = ''

type StoredSearch = {
  query: string
  ts: number
}

function readStoredSearch(): StoredSearch | null {
  if (memorySearch && Date.now() - memorySearch.ts <= MAX_AGE_MS) return memorySearch
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSearch
    if (!parsed.query || Date.now() - parsed.ts > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeSearchQuery(query: string) {
  const value = query.trim()
  if (!value) return
  memorySearch = { query: value, ts: Date.now() }
  try {
    window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(memorySearch))
  } catch {}
}

function isSearchInput(input: HTMLInputElement): boolean {
  const text = [
    input.type,
    input.placeholder,
    input.ariaLabel,
    input.className,
    input.id,
    input.closest('[class*="Search"], [class*="search"], [id*="Search"], [id*="search"]')?.className || '',
  ].join(' ')
  return /search|docsearch|搜索/i.test(text)
}

function currentSearchQuery(): string {
  const active = document.activeElement
  if (active instanceof HTMLInputElement && isSearchInput(active)) return active.value.trim()

  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
  const found = inputs.find((input) => isSearchInput(input) && input.value.trim())
  return found?.value.trim() || ''
}

function rememberSearchQuery() {
  const query = currentSearchQuery()
  if (query) writeSearchQuery(query)
}

function handleInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement && isSearchInput(target)) {
    writeSearchQuery(target.value)
  }
}

function handlePointerDown(event: Event) {
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('a, button, [role="option"], [role="link"], [role="button"]')) {
    rememberSearchQuery()
    scheduleSearchLanding()
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    rememberSearchQuery()
    scheduleSearchLanding()
  }
}

function unwrapPreviousHighlights(root: Element) {
  const marks = Array.from(root.querySelectorAll('mark.echo-search-hit'))
  for (const mark of marks) {
    mark.replaceWith(document.createTextNode(mark.textContent || ''))
  }
  root.normalize()
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement
  if (!parent) return true
  return !!parent.closest('script, style, pre, code, textarea, input, select, button, nav, .echo-toolbar, .echo-modal, .echo-sel-popup, .echo-comment-box')
}

function highlightTextNode(node: Text, query: string): HTMLElement[] {
  const text = node.nodeValue || ''
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const hits: HTMLElement[] = []
  let index = lowerText.indexOf(lowerQuery)
  if (index === -1) return hits

  const fragment = document.createDocumentFragment()
  let cursor = 0
  while (index !== -1) {
    if (index > cursor) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, index)))
    }
    const mark = document.createElement('mark')
    mark.className = 'echo-search-hit'
    mark.textContent = text.slice(index, index + query.length)
    fragment.appendChild(mark)
    hits.push(mark)
    cursor = index + query.length
    index = lowerText.indexOf(lowerQuery, cursor)
  }
  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)))
  }

  node.replaceWith(fragment)
  return hits
}

function highlightQuery(root: Element, query: string): HTMLElement[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT
      return (node.nodeValue || '').toLowerCase().includes(query.toLowerCase())
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
    },
  })

  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  return nodes.flatMap((node) => highlightTextNode(node, query))
}

function bestHit(hits: HTMLElement[]): HTMLElement | null {
  if (hits.length === 0) return null

  const hash = decodeURIComponent(location.hash.slice(1))
  const hashTarget = hash ? document.getElementById(hash) : null
  const anchorTop = hashTarget
    ? hashTarget.getBoundingClientRect().top + window.scrollY
    : window.scrollY + 120

  return hits
    .map((hit) => {
      const rect = hit.getBoundingClientRect()
      const top = rect.top + window.scrollY
      return { hit, distance: Math.abs(top - anchorTop) }
    })
    .sort((a, b) => a.distance - b.distance)[0].hit
}

function applySearchLanding() {
  const stored = readStoredSearch()
  const root = document.querySelector('.vp-doc')
  if (!stored || !root) return

  const applyKey = `${location.pathname}${location.hash}:${stored.query}:${stored.ts}`
  let applied = memoryApplied
  try {
    applied = window.sessionStorage?.getItem(APPLIED_KEY) || memoryApplied
  } catch {}
  if (applied === applyKey) return

  unwrapPreviousHighlights(root)
  const hits = highlightQuery(root, stored.query)
  const target = bestHit(hits)
  if (!target) return

  memoryApplied = applyKey
  try {
    window.sessionStorage?.setItem(APPLIED_KEY, applyKey)
  } catch {}
  target.classList.add('echo-search-hit-active')
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function scheduleSearchLanding() {
  window.setTimeout(() => {
    nextTick(() => applySearchLanding())
  }, 120)
}

onMounted(() => {
  document.addEventListener('input', handleInput, true)
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleKeyDown, true)
  scheduleSearchLanding()
})

onUnmounted(() => {
  document.removeEventListener('input', handleInput, true)
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleKeyDown, true)
})

watch(
  () => route.path,
  () => scheduleSearchLanding(),
)
</script>
