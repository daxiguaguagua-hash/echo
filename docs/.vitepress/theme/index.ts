import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import EchoArticleActions from './components/EchoArticleActions.vue'
import EchoSelectionComment from './components/EchoSelectionComment.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: any) {
    app.component('EchoArticleActions', EchoArticleActions)
    app.component('EchoSelectionComment', EchoSelectionComment)
  },
}
