import { useEffect } from 'react'
import { audio } from '../audio/AudioEngine'
import { CONFIG, ITEM_LABEL, withObjectParticle, type ItemType } from '../config'
import { startAct } from '../haenyeo/acts'
import { sanitizeCustomization } from '../haenyeo/customize'
import { cameraRig, player } from '../player/runtime'
import { denyLocalSeat, enterBulteokLocal, returnToSeaLocal, startLocalSeatWalk } from '../player/zone'
import { useBubbles } from '../store/bubbleStore'
import { useBulteok } from '../store/bulteokStore'
import { bulteokFx } from '../world/bulteok/bulteokFx'
import { useCustomize } from '../store/customizeStore'
import { useFloat } from '../store/floatStore'
import { useGame } from '../store/gameStore'
import { useSession } from '../store/sessionStore'
import { useToasts } from '../store/toastStore'
import { net } from '.'
import { buildHello } from './hello'
import type { ServerMessage } from './protocol'
import { applyEvent, applyPrep, applySeatMove, applySnap, applyZone, remoteNick, remotes, useRemotes } from './remotes'

/** 다른 해녀의 행동 → 토스트 문구. 잠수·상승은 너무 잦아서 알리지 않음 */
export function actionText(nick: string, msg: Extract<ServerMessage, { t: 'evt' }>): string | null {
  switch (msg.a) {
    case 'sumbi':
      return `${nick}님이 숨비소리를 냈어요`
    case 'wave':
      return `${nick}님이 손 흔들어 인사했어요`
    case 'harvest':
      return msg.item ? `${nick}님이 ${withObjectParticle(ITEM_LABEL[msg.item])} 땄어요` : null
    case 'tangerine':
      return `${nick}님이 귤을 까먹어요`
    case 'doze':
      return `${nick}님이 꾸벅꾸벅 졸아요`
    default:
      return null
  }
}

/** 손질 알림 문구 (PLAN 5.3) */
export function prepText(item: ItemType) {
  switch (item) {
    case 'conch':
      return '소라를 톡톡 두드렸어요'
    case 'abalone':
      return '전복을 떼어냈어요'
    case 'urchin':
      return '성게 알을 꺼냈어요'
  }
}

/** 대야가 가득 참: 불턱에 있는 해녀 모두 만세 */
function celebrateAll() {
  if (player.zone === 'bulteok') player.pose.celebrateTime = 0
  for (const rm of remotes.values()) if (rm.zone === 'bulteok') rm.pose.celebrateTime = 0
  bulteokFx.burst = true
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
  // 둥둥 중엔 아주 작게 멀리서
  const far = useFloat.getState().active ? 3 : 1
  audio.playSumbi({ distance: distance * far + (far > 1 ? 20 : 0), pan: pan * 0.8, pitch: 0.9 + ((id * 37) % 20) / 100 })
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
          // 처음 들어오면 바다에서 시작 (재접속이면 서버가 불턱 자리를 다시 알려 줌)
          if (player.zone === 'bulteok') returnToSeaLocal([player.pos.x, 0, player.pos.z])
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
        case 'zone': {
          if (msg.id === game.selfId) {
            if (msg.zone === 'bulteok') {
              enterBulteokLocal(msg.seat ?? 0)
              useBulteok.getState().setServerLeft(msg.left ?? null)
            } else {
              returnToSeaLocal(msg.p)
            }
          } else {
            applyZone(msg.id, msg.zone, msg.seat, msg.p)
          }
          break
        }
        case 'prep': {
          if (msg.id === game.selfId) {
            startAct(player.pose, 'prep', msg.item)
            game.addPrepped(msg.item)
            useSession.getState().addPrepped(msg.item)
            if (msg.left !== undefined) useBulteok.getState().setLeftOne(msg.item, msg.left)
            useBulteok.getState().setBusyUntil(performance.now() + CONFIG.prepDuration * 1000)
            useBulteok.getState().setDozing(false)
            useBubbles.getState().sayself(prepText(msg.item), CONFIG.prepDuration * 1000)
          } else {
            applyPrep(msg.id, msg.item)
            const nick = remoteNick(msg.id) ?? '이웃 해녀'
            if (player.zone === 'bulteok' && game.phase === 'playing') useToasts.getState().push(`${nick}님이 ${prepText(msg.item)}`)
          }
          break
        }
        case 'seat':
          if (msg.id === game.selfId) startLocalSeatWalk(msg.from, msg.to)
          else applySeatMove(msg.id, msg.from, msg.to)
          break
        case 'seat_no':
          denyLocalSeat(msg.seat)
          break
        case 'basin': {
          const was = useBulteok.getState().basin
          useBulteok.getState().setBasin({ fill: msg.fill, capacity: msg.capacity, round: msg.round, full: !!msg.full })
          if (msg.full && !(was.full && was.round === msg.round)) {
            celebrateAll()
            if (player.zone === 'bulteok') {
              audio.playCelebrate()
              useToasts.getState().push('대야가 가득 찼어요! 다 같이 만세')
            }
          }
          break
        }
        case 'err':
          if (msg.code === 'NO_ITEM') useBubbles.getState().sayself('바다에서 따 온 것만 손질할 수 있어요', 2600)
          break
        case 'evt': {
          if (msg.id === game.selfId) break
          applyEvent(msg.id, msg.a, msg.item)
          const nick = remoteNick(msg.id) ?? msg.nick ?? '이웃 해녀'
          const text = actionText(nick, msg)
          // 쉬기 알림은 같은 불턱에 있을 때만
          const restAct = msg.a === 'tangerine' || msg.a === 'doze'
          if (text && game.phase === 'playing' && (!restAct || player.zone === 'bulteok')) useToasts.getState().push(text)
          if (msg.a === 'sumbi' && game.phase === 'playing') playRemoteSumbi(msg.id)
          break
        }
      }
    })

    // 입장 버튼을 누르면 그때 고른 닉네임·꾸미기로 접속, 바다를 떠나면(입장 화면으로) 연결을 끊음
    let connected = false
    const connectIfPlaying = () => {
      const playing = useGame.getState().phase === 'playing'
      if (playing && !connected) {
        connected = true
        net.connect(buildHello())
      } else if (!playing && connected) {
        connected = false
        net.disconnect()
        useRemotes.getState().reset([])
      }
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
