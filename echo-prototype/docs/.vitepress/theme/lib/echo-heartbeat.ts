type Subscriber = () => void | Promise<void>

const subscribers = new Set<Subscriber>()
let timer: ReturnType<typeof window.setInterval> | null = null
const intervalMs = 10000

function tick() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  for (const subscriber of Array.from(subscribers)) {
    void subscriber()
  }
}

function start() {
  if (typeof window === 'undefined' || timer) return
  timer = window.setInterval(tick, intervalMs)
}

function stop() {
  if (!timer || subscribers.size > 0) return
  window.clearInterval(timer)
  timer = null
}

export function subscribeEchoHeartbeat(subscriber: Subscriber): () => void {
  subscribers.add(subscriber)
  start()
  return () => {
    subscribers.delete(subscriber)
    stop()
  }
}

export { intervalMs as echoHeartbeatIntervalMs }
