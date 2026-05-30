import { defineConfig } from 'vitepress'
import { articleSidebar } from './echo-sidebar.mts'

export default defineConfig({
  title: 'Echo 知识库',
  description: '本地优先的 AI 对话知识论坛',

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '文章', link: '/articles/', activeMatch: '^/articles/' },
      { text: '标签', link: '/tags/', activeMatch: '^/tags/' },
    ],

    sidebar: {
      '/articles/': articleSidebar,
      '/live/': articleSidebar,
    },

    socialLinks: [],

    search: {
      provider: 'local',
    },

    footer: {
      message: '基于 Echo 管线生成',
    },

    lastUpdated: {
      text: '最后更新',
    },
  },

  markdown: {
    // Preserve HTML comments (turn markers) in output for custom theme processing
  },
})
