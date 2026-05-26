import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import EchoArticleActions from './components/EchoArticleActions.vue'
import EchoSelectionComment from './components/EchoSelectionComment.vue'
import EchoSearchLanding from './components/EchoSearchLanding.vue'
import EchoTagsPage from './components/EchoTagsPage.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: any) {
    app.component('EchoArticleActions', EchoArticleActions)
    app.component('EchoSelectionComment', EchoSelectionComment)
    app.component('EchoSearchLanding', EchoSearchLanding)
    app.component('EchoTagsPage', EchoTagsPage)
  },
}
