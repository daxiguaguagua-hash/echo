import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Echo 知识库',
  description: '本地优先的 AI 对话知识论坛',

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '文章', link: '/articles/' },
      { text: '标签', link: '/tags/' },
    ],

    sidebar: {
      '/articles/': [
        {
          text: '文章列表',
          items: [
            { text: '示例文章', link: '/articles/sample-article' },
          ],
        },
      ],
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
