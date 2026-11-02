import type { ClientMessage, ServerMessage } from './protocol'

export type ServerHandler = (msg: ServerMessage) => void

/**
 * 게임 코드는 이 인터페이스만 안다.
 * 1~2단계: OfflineNetClient (혼자 하는 바다), 3단계: WsNetClient (WebSocket)
 */
export interface NetClient {
  connect(): void
  disconnect(): void
  send(msg: ClientMessage): void
  onMessage(handler: ServerHandler): () => void
}

export class Emitter {
  private handlers = new Set<ServerHandler>()

  on(handler: ServerHandler) {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  emit(msg: ServerMessage) {
    for (const h of this.handlers) h(msg)
  }
}
