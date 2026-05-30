import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { getStatus, EchoApiError, type EchoStatus } from './echo-api'

type StatusState = 'loading' | 'ready' | 'unavailable'

export function useEchoStatus(articleId: Ref<string | undefined>) {
  const state = ref<StatusState>('loading')
  const status = ref<EchoStatus | null>(null)
  const error = ref<string>('')
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  async function check() {
    controller?.abort()
    controller = new AbortController()
    state.value = 'loading'
    error.value = ''

    try {
      const result = await getStatus()
      status.value = result
      state.value = 'ready'
    } catch (err) {
      if ((err as Error).name === 'AbortError' || (err as Error).message?.includes('abort')) return
      state.value = 'unavailable'
      error.value = err instanceof EchoApiError ? err.message : '无法连接 Echo 服务'
      scheduleRetry()
    }
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(check, 30000)
  }

  function cancel() {
    controller?.abort()
    controller = null
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  onMounted(() => {
    check()
  })

  watch(articleId, () => {
    cancel()
    check()
  })

  onUnmounted(() => {
    cancel()
  })

  return { state, status, error, retry: check }
}
