import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import EchoArticleActions from './components/EchoArticleActions.vue'
import EchoSelectionComment from './components/EchoSelectionComment.vue'
import EchoSearchLanding from './components/EchoSearchLanding.vue'
import EchoTagsPage from './components/EchoTagsPage.vue'
import EchoChatBubbles from './components/EchoChatBubbles.vue'
import EchoProjectTabs from './components/EchoProjectTabs.vue'
import EchoCommentChain from './components/EchoCommentChain.vue'
import EchoCommentNode from './components/EchoCommentNode.vue'
import EchoLiveSession from './components/EchoLiveSession.vue'
import EchoLegacyRecovery from './components/EchoLegacyRecovery.vue'
import EchoGlobalControls from './components/EchoGlobalControls.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: any) {
    app.component('EchoArticleActions', EchoArticleActions)
    app.component('EchoSelectionComment', EchoSelectionComment)
    app.component('EchoSearchLanding', EchoSearchLanding)
    app.component('EchoTagsPage', EchoTagsPage)
    app.component('EchoChatBubbles', EchoChatBubbles)
    app.component('EchoProjectTabs', EchoProjectTabs)
    app.component('EchoCommentChain', EchoCommentChain)
    app.component('EchoCommentNode', EchoCommentNode)
    app.component('EchoLiveSession', EchoLiveSession)
    app.component('EchoLegacyRecovery', EchoLegacyRecovery)
    app.component('EchoGlobalControls', EchoGlobalControls)
  },
}
