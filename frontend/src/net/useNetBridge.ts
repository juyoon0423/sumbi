import { useEffect } from 'react'
import { audio } from '../audio/AudioEngine'
import { ITEM_LABEL, withObjectParticle } from '../config'
import { useGame } from '../store/gameStore'
import { useToasts } from '../store/toastStore'
import { net } from '.'
import type { ServerMessage } from './protocol'

/** 다른 해녀의 행동 → 토스트 문구. 잠수·상승은 너무 잦아서 알리지 않음 */
export function actionText(nick: string, msg: Extract<ServerMessage, { t: 'evt' }>): string | null {
  switch (msg.a) {
    case 'sumbi':
      return `${nick}님이 숨비소리를 냈어요`
    case 'wave':
      return `${nick}님이 손 흔들어 인사했어요`
    case 'harvest':
      return msg.item ? `${nick}님이 ${withObjectParticle(ITEM_LABEL[msg.item])} 땄어요` : null
    default:
      return null
  }
}

/** 서버(또는 오프라인 흉내) 메시지를 스토어·소리·토스트로 연결 */
export function useNetBridge() {
  useEffect(() => {
    const off = net.onMessage((msg) => {
      const game = useGame.getState()
      switch (msg.t) {
        case 'welcome':
          game.setSelf(msg.you.id, msg.you.nick)
          game.setToday(msg.today)
          break
        case 'today':
          game.setToday({ divers: msg.divers, items: msg.items })
          break
        case 'evt': {
          if (msg.id === game.selfId) break
          // 3단계에서는 플레이어 목록에서 닉네임을 찾는다
          const nick = msg.nick ?? '이웃 해녀'
          const text = actionText(nick, msg)
          if (text && game.phase === 'playing') useToasts.getState().push(text)
          if (msg.a === 'sumbi' && game.phase === 'playing') {
            // 멀리서 들려오는 다른 해녀의 숨비소리
            audio.playSumbi({
              distance: 25 + Math.random() * 35,
              pan: Math.random() * 1.6 - 0.8,
              pitch: 0.88 + Math.random() * 0.24,
            })
          }
          break
        }
      }
    })
    net.connect()
    return () => {
      off()
      net.disconnect()
    }
  }, [])
}
