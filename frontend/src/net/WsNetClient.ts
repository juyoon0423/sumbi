import { Emitter, type NetClient } from './NetClient'
import type { ClientMessage, HelloMessage, ServerMessage } from './protocol'

export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline'

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
    ws.onclose = () => this.handleClose()
  }

  private handleClose() {
    window.clearTimeout(this.openTimer)
    window.clearInterval(this.pingTimer)
    this.ws = null
    this.welcomed = false
    if (this.closedByUser) return
    if (!this.everWelcomed && this.retries === 0) {
      // 서버가 아예 없음
      this.opts.onUnavailable()
      return
    }
    // 잠깐 끊김: 1, 2, 4… 최대 5초 간격으로 다시 시도
    this.opts.onStatus('reconnecting')
    const delay = Math.min(5_000, 1000 * 2 ** this.retries)
    this.retries++
    this.retryTimer = window.setTimeout(() => this.open(), delay)
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
