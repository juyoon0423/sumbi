import { useGame } from '../store/gameStore'
import { Emitter, type NetClient } from './NetClient'
import { OfflineNetClient } from './OfflineNetClient'
import { useToasts } from '../store/toastStore'
import type { ClientMessage, HelloMessage } from './protocol'
import { WsNetClient } from './WsNetClient'

/**
 * 서버 주소: VITE_WS_URL (Vercel 은 Production 환경에만 넣음). 개발 모드에서 비어 있으면 같은 컴퓨터의 8080 포트.
 * 서버에 처음부터 못 붙으면 혼자 하는 바다(OfflineNetClient)로 자동 전환.
 */
function wsUrl(): string | undefined {
  // Vercel 미리보기(preview)는 운영 서버에 붙지 않고 혼자 하는 바다로만 (VITE_WS_URL 을 잘못 넣어도)
  const vercelEnv = import.meta.env.VITE_VERCEL_ENV as string | undefined
  if (vercelEnv && vercelEnv !== 'production') return undefined
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  if (import.meta.env.DEV) return `ws://${location.hostname}:8080/ws`
  return undefined
}

/**
 * 게임이 쓰는 연결 하나. 상황에 따라 안쪽을 바꿔 낌:
 * - 서버에 붙으면 WsNetClient, 처음부터 못 붙으면 혼자 하는 바다(OfflineNetClient)
 * - 바다가 붐벼 대기(queue)하면: 서버 연결은 줄만 서 있고, 게임은 혼자 하는 바다로 계속 놀기.
 *   자리가 나면(slot) 화면에 "바다에 자리가 났어요" → 들어가기(enter) → welcome 이 오면 서버 연결로 바꿈
 */
class AutoNetClient implements NetClient {
  private emitter = new Emitter()
  /** 지금 게임 메시지를 주고받는 쪽 */
  private game: NetClient | null = null
  private gameUnsub: (() => void) | null = null
  private ws: WsNetClient | null = null
  private wsUnsub: (() => void) | null = null
  private waiting = false

  connect(hello: HelloMessage) {
    this.disconnect()
    const url = wsUrl()
    if (!url) {
      this.useOffline(hello, 'offline')
      return
    }
    const ws = new WsNetClient(url, {
      onStatus: (s) => {
        // 대기 중엔 서버 연결 상태가 바뀌어도(재연결 등) 화면엔 "대기 중"
        if (this.waiting && s !== 'online') return
        useGame.getState().setNetStatus(s)
      },
      onUnavailable: () => {
        useToasts.getState().push('서버에 연결하지 못해 혼자 하는 바다로 들어왔어요')
        this.ws = null
        this.wsUnsub?.()
        this.useOffline(hello, 'offline')
      },
    })
    this.ws = ws
    this.wsUnsub = ws.onMessage((m) => {
      if (m.t === 'queue' || m.t === 'slot') {
        if (!this.waiting) this.startWaiting(hello)
        this.emitter.emit(m)
        return
      }
      if (m.t === 'welcome' && this.game !== ws) {
        // 대기 끝: 혼자 하는 바다를 접고 서버 바다로
        this.waiting = false
        this.setGame(ws)
        useGame.getState().setNetStatus('online')
      }
      if (this.game === ws) this.emitter.emit(m)
    })
    this.game = ws
    ws.connect(hello)
  }

  /** 대기 시작: 기다리는 동안 혼자 하는 바다에서 (가짜 이웃 없이) */
  private startWaiting(hello: HelloMessage) {
    this.waiting = true
    useGame.getState().setNetStatus('waiting')
    useToasts.getState().push('바다가 붐벼요 · 자리가 날 때까지 혼자 바다에서 놀 수 있어요')
    this.useOffline(hello, 'waiting')
  }

  private useOffline(hello: HelloMessage, status: 'offline' | 'waiting') {
    // 개발 모드의 진짜 오프라인에서만 가짜 이웃을 흉내냄 (대기 중엔 없는 사람을 지어내지 않음)
    const offline = new OfflineNetClient({ simulateOthers: import.meta.env.DEV && status === 'offline' })
    this.setGame(offline)
    useGame.getState().setNetStatus(status)
    offline.connect(hello)
  }

  private setGame(client: NetClient) {
    this.gameUnsub?.()
    this.gameUnsub = null
    // 서버 연결은 대기 중에도 살려 둠 (줄 서기)
    if (this.game && this.game !== this.ws) this.game.disconnect()
    this.game = client
    if (client !== this.ws) this.gameUnsub = client.onMessage((m) => this.emitter.emit(m))
  }

  /** 자리가 났을 때 들어가기 */
  enterSlot() {
    this.ws?.enter()
  }

  disconnect() {
    this.gameUnsub?.()
    this.gameUnsub = null
    this.wsUnsub?.()
    this.wsUnsub = null
    if (this.game && this.game !== this.ws) this.game.disconnect()
    this.ws?.disconnect()
    this.ws = null
    this.game = null
    this.waiting = false
  }

  send(msg: ClientMessage) {
    if (msg.t === 'enter') {
      this.enterSlot()
      return
    }
    // 꾸미기는 서버 연결의 재접속 hello 에도 반영 (대기 중이어도)
    if (msg.t === 'look' && this.ws && this.game !== this.ws) this.ws.send(msg)
    this.game?.send(msg)
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
    import('../world/sea/friends/devEvents'),
    import('../world/sea/friends/Cephalopods'),
    import('../world/sea/friends/Turtle'),
    import('../world/sea/friends/SeaFriends'),
  ]).then(([rt, sf, inp, rm, bt, zone, time, session, layout, float, gulls, star, fcam, quality, dev, ceph, turtle, friends]) => {
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
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, behind: v.z > 1 }
      },
      net,
      /** 시간대 고정: setTime('night') · setTime(21.5) · setTime(null) = 실제 한국 시간 */
      setTime: time.setTimeOverride,
      env: time.env,
      session: session.useSession,
      /** 둥둥: float.start() · float.stop() · float.cam (둘러보기 각도) */
      float: { start: float.startFloat, stop: float.stopFloat, toggle: float.toggleFloat, cam: float.floatCam, state: float.floatState, view: fcam.FLOAT_VIEW },
      /** 하늘: 갈매기 바로 날리기 · 별똥별 바로 떨어뜨리기 */
      gulls: () => gulls.gullControl.spawn(),
      shootingStar: () => star.shootingStarControl.fire(),
      /** 바다 친구들: turtle() 다음 잠수에 · octopus.peekNow() · 자리 확인 */
      turtle: dev.callTurtle,
      friends: { octopus: ceph.octopusDebug, turtle: turtle.turtleControl, schools: friends.schoolSpots, where: friends.friendsDebug },
    }
  })
}
