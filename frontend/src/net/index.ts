import { useGame } from '../store/gameStore'
import { Emitter, type NetClient } from './NetClient'
import { OfflineNetClient } from './OfflineNetClient'
import { useToasts } from '../store/toastStore'
import type { ClientMessage, HelloMessage } from './protocol'
import { WsNetClient } from './WsNetClient'

/**
 * 서버 주소: VITE_WS_URL. 개발 모드에서 비어 있으면 같은 컴퓨터의 8080 포트.
 * 서버에 처음부터 못 붙으면 혼자 하는 바다(OfflineNetClient)로 자동 전환.
 */
function wsUrl(): string | undefined {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  if (import.meta.env.DEV) return `ws://${location.hostname}:8080/ws`
  return undefined
}

class AutoNetClient implements NetClient {
  private emitter = new Emitter()
  private active: NetClient | null = null
  private unsub: (() => void) | null = null

  connect(hello: HelloMessage) {
    this.disconnect()
    const url = wsUrl()
    if (!url) {
      this.useOffline(hello)
      return
    }
    const ws = new WsNetClient(url, {
      onStatus: (s) => useGame.getState().setNetStatus(s),
      onUnavailable: () => {
        useToasts.getState().push('서버에 연결하지 못해 혼자 하는 바다로 들어왔어요')
        this.useOffline(hello)
      },
    })
    this.attach(ws)
    ws.connect(hello)
  }

  /** 개발 모드의 오프라인에서만 가짜 이웃을 흉내냄 (서버에 연결되면 가짜 이웃 없음) */
  private useOffline(hello: HelloMessage) {
    this.attach(new OfflineNetClient({ simulateOthers: import.meta.env.DEV }))
    useGame.getState().setNetStatus('offline')
    this.active!.connect(hello)
  }

  private attach(client: NetClient) {
    this.unsub?.()
    this.active?.disconnect()
    this.active = client
    this.unsub = client.onMessage((m) => this.emitter.emit(m))
  }

  disconnect() {
    this.unsub?.()
    this.unsub = null
    this.active?.disconnect()
    this.active = null
  }

  send(msg: ClientMessage) {
    this.active?.send(msg)
  }

  onMessage(handler: Parameters<NetClient['onMessage']>[0]) {
    return this.emitter.on(handler)
  }
}

export const net: NetClient = new AutoNetClient()

// 개발용: 브라우저 콘솔에서 상태 확인 (window.__sumbi)
if (import.meta.env.DEV) {
  void Promise.all([
    import('../player/runtime'),
    import('../world/sea/seafood/seafoodState'),
    import('../player/input'),
    import('./remotes'),
  ]).then(([rt, sf, inp, rm]) => {
    ;(window as unknown as Record<string, unknown>).__sumbi = {
      player: rt.player,
      cameraRig: rt.cameraRig,
      seafood: sf.seafood,
      input: inp,
      remotes: rm.remotes,
      game: useGame,
    }
  })
}
