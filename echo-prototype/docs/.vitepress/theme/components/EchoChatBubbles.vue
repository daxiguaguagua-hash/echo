<template></template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function isUserSpeaker(speaker: string): boolean {
  const s = speaker.toLowerCase()
  return s === 'vincent' || s === 'user' || s === '我' || s === 'human'
}

function isAssistantSpeaker(speaker: string): boolean {
  const s = speaker.toLowerCase()
  return s === 'ai' || s === 'claude' || s === 'assistant' || s === 'codex'
}

function shouldStopAt(el: Element): boolean {
  const tag = el.tagName
  if (tag === 'H2' || tag === 'H1') {
    const id = el.id || ''
    return /评论|comment|标注|annotation/i.test(id)
  }
  const cls = el.className || ''
  if (typeof cls === 'string') {
    return /echo-comment-list|echo-comment-box|echo-toolbar|echo-tag-box|echo-serve-notice/i.test(cls)
  }
  return false
}

function markerBoundary(marker: Element): Element {
  const parent = marker.parentElement
  if (
    parent?.tagName === 'P' &&
    parent.children.length === 1 &&
    parent.textContent?.trim() === ''
  ) {
    return parent
  }
  return marker
}

function chatify() {
  const doc = document.querySelector('.vp-doc')
  if (!doc) return

  if (doc.hasAttribute('data-echo-chatified')) return

  const markers = Array.from(doc.querySelectorAll('.echo-turn-marker'))
  if (markers.length === 0) return
  const boundaries = markers.map(markerBoundary)

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const speaker = marker.getAttribute('data-speaker') || 'unknown'
    const boundary = boundaries[i]
    const nextBoundary = boundaries[i + 1] || null

    boundary.classList.add('echo-turn-boundary')

    const nodes: Node[] = []
    let cursor: Node | null = boundary.nextSibling

    while (cursor) {
      if (nextBoundary && cursor === nextBoundary) break
      if (cursor instanceof Element && shouldStopAt(cursor)) break
      if (cursor instanceof Element && cursor.classList.contains('echo-turn-marker')) break
      if (cursor instanceof Element && cursor.classList.contains('echo-turn-boundary')) break

      const next: Node | null = cursor.nextSibling
      nodes.push(cursor)
      cursor = next
    }

    if (nodes.length === 0) continue

    let bubbleClass = 'echo-chat-assistant'
    if (isUserSpeaker(speaker)) {
      bubbleClass = 'echo-chat-user'
    } else if (!isAssistantSpeaker(speaker)) {
      bubbleClass = 'echo-chat-unknown'
    }

    const wrapper = document.createElement('div')
    wrapper.className = `echo-chat-turn ${bubbleClass}`

    boundary.after(wrapper)
    for (const node of nodes) {
      wrapper.appendChild(node)
    }
  }

  doc.setAttribute('data-echo-chatified', '')
}

function dechatify() {
  const doc = document.querySelector('.vp-doc')
  if (!doc) return
  doc.removeAttribute('data-echo-chatified')

  const turns = Array.from(doc.querySelectorAll('.echo-chat-turn'))
  for (const turn of turns) {
    const parent = turn.parentNode
    if (!parent) continue
    while (turn.firstChild) {
      parent.insertBefore(turn.firstChild, turn)
    }
    parent.removeChild(turn)
  }

  for (const boundary of Array.from(doc.querySelectorAll('.echo-turn-boundary'))) {
    boundary.classList.remove('echo-turn-boundary')
  }
}

let observer: MutationObserver | null = null

function setup() {
  dechatify()
  if (observer) observer.disconnect()

  const doc = document.querySelector('.vp-doc')
  if (doc && !doc.hasAttribute('data-echo-chatified')) {
    chatify()
  }

  observer = new MutationObserver(() => {
    const d = document.querySelector('.vp-doc')
    if (d && !d.hasAttribute('data-echo-chatified') && d.querySelector('.echo-turn-marker')) {
      chatify()
    }
  })

  const content = document.querySelector('.VPContent')
  if (content) {
    observer.observe(content, { childList: true, subtree: true })
  }
}

onMounted(() => {
  setup()
})

watch(() => route.path, () => {
  setTimeout(setup, 100)
})

onUnmounted(() => {
  if (observer) observer.disconnect()
  dechatify()
})
</script>
