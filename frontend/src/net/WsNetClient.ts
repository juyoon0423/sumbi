import { Emitter, type NetClient } from './NetClient'
import type { ClientMessage, HelloMessage, ServerMessage } from './protocol'

/**
 * connecting: 처음 연결 중 / online: 바다에 들어옴 / reconnecting: 잠깐 끊겨 다시 연결 중
 * restarting: 서버가 새 버전으로 바뀌는 중(1012) / waiting: 바다가 붐벼 대기 중(그동안 혼자 하는 바다) / offline: 혼자 하는 바다
 */
export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'restarting' | 'waiting' | 'offline'

/** WebSocket 닫기 코드 1012: 서버가 다시 시작하는 중 (배포) */
const SERVICE_RESTART = 1012

const TOKEN_KEY = 'sumbi.token'
const PING_MS = 10_000
const OPEN_TIMEOUT_MS = 4_000

export function loadToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 무시 */
  }
}

interface Options {
  onStatus: (s: NetStatus) => void
  /** 처음 연결부터 실패 (서버가 없음) → 오프라인 모드로 */
  onUnavailable: () => void
}

/**
 * 실제 서버 연결. 끊기면 재접속 토큰으로 다시 붙어 같은 해녀로 돌아간다.
 * 처음부터 연결이 안 되면 onUnavailable 로 알려서 혼자 하는 바다로 바꾼다.
 */
export class WsNetClient implements NetClient {
  private emitter = new Emitter()
  private ws: WebSocket | null = null
  private hello: HelloMessage | null = null
  private welcomed = false
  private everWelcomed = false
  /** 한 번이라도 서버에 붙었음 (대기만 하다 끊겨도 "서버 없음"으로 보지 않음) */
  private everOpened = false
  private closedByUser = false
  private retries = 0
  private pingTimer: number | undefined
  private retryTimer: number | undefined
  private openTimer: number | undefined
  private url: string
  private opts: Options

  constructor(url: string, opts: Options) {
    this.url = url
    this.opts = opts
  }

  connect(hello: HelloMessage) {
    this.hello = hello
    this.closedByUser = false
    this.opts.onStatus('connecting')
    this.open()
  }

  private open() {
    window.clearTimeout(this.retryTimer)
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      this.handleClose()
      return
    }
    this.ws = ws
    this.welcomed = false
    // 서버가 응답 없이 매달려 있으면 실패로 봄
    this.openTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close()
    }, OPEN_TIMEOUT_MS)
    ws.onopen = () => {
      window.clearTimeout(this.openTimer)
      this.everOpened = true
      const token = loadToken()
      this.raw({ ...this.hello!, ...(token ? { token } : {}) })
      this.pingTimer = window.setInterval(() => this.raw({ t: 'ping', ts: Date.now() }), PING_MS)
    }
    ws.onmessage = (e) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(e.data as string) as ServerMessage
      } catch {
        return
      }
      if (msg.t === 'welcome') {
        this.welcomed = true
        this.everWelcomed = true
        this.retries = 0
        saveToken(msg.you.token)
        this.opts.onStatus('online')
      }
      this.emitter.emit(msg)
    }
    ws.onclose = (e) => this.handleClose(e.code)
  }

  private handleClose(code = 0) {
    window.clearTimeout(this.openTimer)
    window.clearInterval(this.pingTimer)
    this.ws = null
    this.welcomed = false
    if (this.closedByUser) return
    if (!this.everWelcomed && !this.everOpened && this.retries === 0) {
      // 서버가 아예 없음
      this.opts.onUnavailable()
      return
    }
    let delay: number
    if (code === SERVICE_RESTART) {
      // 서버가 새 버전으로 바뀌는 중: 모두가 한꺼번에 몰리지 않게 0.3~3초 사이 아무 때나
      this.opts.onStatus('restarting')
      delay = 300 + Math.random() * 2700
      this.retries = 1
    } else {
      // 잠깐 끊김: 1, 2, 4… 최대 5초 간격(±30%)으로 다시 시도
      this.opts.onStatus('reconnecting')
      delay = Math.min(5_000, 1000 * 2 ** this.retries) * (0.7 + Math.random() * 0.6)
      this.retries++
    }
    this.retryTimer = window.setTimeout(() => this.open(), delay)
  }

  /** 대기하다 자리가 났을 때 "들어가기" (welcome 전이라 send 로는 못 보냄) */
  enter() {
    this.raw({ t: 'enter' })
  }

  disconnect() {
    this.closedByUser = true
    window.clearTimeout(this.retryTimer)
    window.clearInterval(this.pingTimer)
    this.ws?.close(1000)
    this.ws = null
  }

  onMessage(handler: Parameters<NetClient['onMessage']>[0]) {
    return this.emitter.on(handler)
  }

  send(msg: ClientMessage) {
    // 꾸미기를 바꾸면 재접속 때 보낼 hello 에도 반영
    if (msg.t === 'look' && this.hello) this.hello = { ...this.hello, nick: msg.nick, look: msg.look }
    if (!this.welcomed) return
    this.raw(msg)
  }

  private raw(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }
}
