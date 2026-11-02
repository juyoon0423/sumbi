import { useEffect } from 'react'
import { audio } from '../audio/AudioEngine'
import { ITEM_LABEL, withObjectParticle } from '../config'
import { sanitizeCustomization } from '../haenyeo/customize'
import { cameraRig, player } from '../player/runtime'
import { useCustomize } from '../store/customizeStore'
import { useGame } from '../store/gameStore'
import { useToasts } from '../store/toastStore'
import { net } from '.'
import { buildHello } from './hello'
import type { ServerMessage } from './protocol'
import { applyEvent, applySnap, remoteNick, remotes, useRemotes } from './remotes'

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

/** 다른 해녀의 숨비소리: 거리만큼 작게, 카메라 기준 좌우로 */
function playRemoteSumbi(id: number) {
  const rm = remotes.get(id)
  if (!rm) {
    // 위치를 모르는 해녀(개발용 가짜 이웃): 멀리서 들리는 소리
    audio.playSumbi({ distance: 25 + Math.random() * 35, pan: Math.random() * 1.6 - 0.8, pitch: 0.88 + Math.random() * 0.24 })
    return
  }
  const dx = rm.pos.x - player.pos.x
  const dz = rm.pos.z - player.pos.z
  const distance = Math.hypot(dx, dz)
  if (distance > 90) return
  // 카메라 오른쪽 = (cos yaw, -sin yaw)
  const pan = distance > 0.5 ? Math.max(-1, Math.min(1, (dx * Math.cos(cameraRig.yaw) - dz * Math.sin(cameraRig.yaw)) / distance)) : 0
  audio.playSumbi({ distance, pan: pan * 0.8, pitch: 0.9 + ((id * 37) % 20) / 100 })
}

/** 서버(또는 오프라인 흉내) 메시지를 스토어·소리·토스트로 연결 */
export function useNetBridge() {
  useEffect(() => {
    let wasWelcomed = false
    const off = net.onMessage((msg) => {
      const game = useGame.getState()
      switch (msg.t) {
        case 'queue':
          game.setQueueAhead(msg.ahead)
          break
        case 'welcome': {
          game.setQueueAhead(null)
          game.setSelf(msg.you.id)
          game.setToday(msg.today)
          useRemotes.getState().reset(msg.players)
          // 서버가 정해 준 시작 위치 (처음 입장할 때만: 재접속이면 지금 위치 유지)
          if (msg.you.p && player.pose.state === 'surfaceIdle' && !wasWelcomed) {
            const [x, , z] = msg.you.p
            player.pos.set(x, player.pos.y, z)
            player.tewak.pos.set(x + Math.sin(player.yaw) * 0.47, player.tewak.pos.y, z + Math.cos(player.yaw) * 0.47)
          }
          wasWelcomed = true
          // 서버가 목록에 없는 값을 고쳤으면 그대로 받아들임
          const mine = useCustomize.getState().custom
          const [adj, ...rest] = msg.you.nick.split(' ')
          const fixed = sanitizeCustomization({ ...msg.you.look, adj, noun: rest.join(' ') })
          if (JSON.stringify(fixed) !== JSON.stringify(mine)) useCustomize.getState().adopt(fixed)
          break
        }
        case 'join':
          if (msg.player.id !== game.selfId) useRemotes.getState().add(msg.player)
          break
        case 'leave':
          useRemotes.getState().remove(msg.id)
          break
        case 'look':
          if (msg.id !== game.selfId) useRemotes.getState().setLook(msg.id, msg.nick, msg.look)
          break
        case 'snap':
          applySnap(msg.ts, msg.ps, game.selfId)
          break
        case 'today':
          game.setToday({ divers: msg.divers, items: msg.items })
          break
        case 'evt': {
          if (msg.id === game.selfId) break
          applyEvent(msg.id, msg.a, msg.item)
          const nick = remoteNick(msg.id) ?? msg.nick ?? '이웃 해녀'
          const text = actionText(nick, msg)
          if (text && game.phase === 'playing') useToasts.getState().push(text)
          if (msg.a === 'sumbi' && game.phase === 'playing') playRemoteSumbi(msg.id)
          break
        }
      }
    })

    // 입장 버튼을 누르면 그때 고른 닉네임·꾸미기로 접속
    let connected = false
    const connectIfPlaying = () => {
      if (connected || useGame.getState().phase !== 'playing') return
      connected = true
      net.connect(buildHello())
    }
    connectIfPlaying()
    const unsub = useGame.subscribe(connectIfPlaying)
    return () => {
      off()
      unsub()
      net.disconnect()
    }
  }, [])
}
