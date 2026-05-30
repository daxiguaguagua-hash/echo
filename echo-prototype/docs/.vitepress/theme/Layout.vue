<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { computed } from 'vue'

const { frontmatter } = useData()
const echoInteractive = computed(() => !!(frontmatter.value as any)?.echo?.interactive)
</script>

<template>
  <EchoSearchLanding />
  <EchoChatBubbles />
  <EchoLegacyRecovery />
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <EchoGlobalControls />
    </template>
    <template #doc-bottom>
      <div v-if="echoInteractive" class="echo-doc-bottom">
        <div class="echo-doc-bottom-inner">
          <EchoArticleActions />
          <EchoCommentChain />
        </div>
      </div>
      <EchoSelectionComment v-if="echoInteractive" />
    </template>
  </DefaultTheme.Layout>
</template>
