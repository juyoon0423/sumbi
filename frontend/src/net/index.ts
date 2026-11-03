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
    import('../store/bulteokStore'),
    import('../player/zone'),
    import('../world/time/env'),
    import('../store/sessionStore'),
    import('../world/bulteok/layout'),
    import('../player/float'),
    import('../world/sky/Gulls'),
    import('../world/sky/ShootingStar'),
    import('../player/FollowCamera'),
    import('../lib/quality'),
  ]).then(([rt, sf, inp, rm, bt, zone, time, session, layout, float, gulls, star, fcam, quality]) => {
    ;(window as unknown as Record<string, unknown>).__sumbi = {
      player: rt.player,
      cameraRig: rt.cameraRig,
      seafood: sf.seafood,
      input: inp,
      remotes: rm.remotes,
      game: useGame,
      /** 그래픽 품질: quality.getState().level / quality.getState().set('low') */
      quality: quality.useQuality,
      bulteok: bt.useBulteok,
      travel: zone.travel,
      /** 불턱 빈자리 누르기: seat(5) */
      seat: zone.requestSeat,
      seatPose: layout.seatPose,
      /** 화면 좌표 (CSS px) */
      toScreen: (x: number, y: number, z: number) => {
        const cam = rt.view.camera
        if (!cam) return null
        const v = cam.position.clone().set(x, y, z).project(cam)
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }
      },
      net,
      /** 시간대 고정: setTime('night') · setTime(21.5) · setTime(null) = 실제 한국 시간 */
      setTime: time.setTimeOverride,
      env: time.env,
      session: session.useSession,
      /** 둥둥: float.start() · float.stop() · float.cam (둘러보기 각도) */
      float: { start: float.startFloat, stop: float.stopFloat, toggle: float.toggleFloat, cam: float.floatCam, view: fcam.FLOAT_VIEW },
      /** 하늘: 갈매기 바로 날리기 · 별똥별 바로 떨어뜨리기 */
      gulls: () => gulls.gullControl.spawn(),
      shootingStar: () => star.shootingStarControl.fire(),
    }
  })
}
