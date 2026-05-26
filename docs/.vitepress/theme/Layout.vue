<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { computed } from 'vue'

const { frontmatter } = useData()
const echoInteractive = computed(() => !!(frontmatter.value as any)?.echo?.interactive)
</script>

<template>
  <EchoSearchLanding />
  <DefaultTheme.Layout>
    <template #doc-bottom>
      <EchoArticleActions v-if="echoInteractive" />
      <EchoSelectionComment v-if="echoInteractive" />
    </template>
  </DefaultTheme.Layout>
</template>
