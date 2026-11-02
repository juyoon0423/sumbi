import { CONFIG } from '../config'
import { setState } from '../haenyeo/types'
import { net } from '../net'
import type { Zone, Vec3 } from '../net/protocol'
import { useBulteok } from '../store/bulteokStore'
import { useGame } from '../store/gameStore'
import { useBubbles } from '../store/bubbleStore'
import { restingTewak, seatPose } from '../world/bulteok/layout'
import { beginSeatWalk, startOops } from '../world/bulteok/seatMotion'
import { walkDuration } from '../world/bulteok/seatWalk'
import { cameraRig, player } from './runtime'

// 바다 ↔ 불턱 이동: 화면을 부드럽게 가렸다가(페이드) 서버가 자리를 정해 주면 옮기고 다시 밝힘

const FADE_MS = 450

export function travel(to: Zone) {
  const b = useBulteok.getState()
  const game = useGame.getState()
  if (b.traveling || b.zone === to) return
  if (to === 'bulteok' && (game.diving || player.pose.state !== 'surfaceIdle' && player.pose.state !== 'surfaceSwim')) return
  b.setTraveling(to)
  window.setTimeout(() => net.send({ t: 'zone', to }), FADE_MS)
  // 서버가 답하지 않으면 원래대로
  window.setTimeout(() => {
    if (useBulteok.getState().traveling === to) useBulteok.getState().setTraveling(null)
  }, 5000)
}

function endFade() {
  window.setTimeout(() => useBulteok.getState().setTraveling(null), 120)
}

/** 서버가 정해 준 불턱 자리에 앉기 */
export function enterBulteokLocal(seat: number) {
  const s = seatPose(seat)
  player.zone = 'bulteok'
  player.seat = seat
  player.walk = null
  seatRequest.seat = -1
  player.pos.set(s.x, s.y, s.z)
  player.yaw = s.yaw
  const pose = player.pose
  setState(pose, seat >= 24 ? 'stand' : 'sit')
  pose.act = null
  pose.heldItem = null
  player.breath = 1
  const tw = restingTewak(seat)
  player.tewak.pos.set(tw.x, tw.y, tw.z)
  player.tewak.attached = false
  player.tewak.rest = true
  // 해녀 뒤에서 모닥불 너머를 보게
  cameraRig.yaw = s.yaw + Math.PI
  cameraRig.pitch = 0.4
  cameraRig.distance = 4.4
  cameraRig.snap = true
  cameraRig.lastInputAt = performance.now()
  useGame.getState().setDiving(false)
  useBulteok.getState().setZone('bulteok')
  useBulteok.getState().setDozing(false)
  endFade()
}

/** 불턱에서 바다로: 불턱 아래 바닷가 수면 */
export function returnToSeaLocal(p: Vec3 | undefined) {
  const [x, , z] = p ?? [16, 0, -24]
  player.zone = 'sea'
  player.seat = -1
  player.walk = null
  seatRequest.seat = -1
  player.pos.set(x, CONFIG.surfaceSink * -1, z)
  player.yaw = 0
  const pose = player.pose
  setState(pose, 'surfaceIdle')
  pose.act = null
  player.tewak.rest = false
  player.tewak.attached = true
  player.tewak.pos.set(x, 0, z + 0.47)
  cameraRig.yaw = Math.PI
  cameraRig.pitch = 0.42
  cameraRig.distance = 5.2
  cameraRig.snap = true
  useBulteok.getState().setZone('sea')
  useBulteok.getState().setDozing(false)
  endFade()
}

// ── 불턱 자리 옮기기: 빈자리를 누르면 서버에 요청, 승인되면 걸어감 ──

/** 서버 답을 기다리는 자리 (그 사이 그 자리는 눌러도 반응 없음) */
export const seatRequest = { seat: -1, at: 0 }

/** 빈자리를 누름 */
export function requestSeat(seat: number) {
  const b = useBulteok.getState()
  if (player.zone !== 'bulteok' || b.traveling) return
  const now = performance.now()
  cameraRig.lastInputAt = now
  if (seat === player.seat || seat < 0 || seat >= 24) return
  if (seatRequest.seat === seat && now - seatRequest.at < 1500) return
  if (b.busyUntil > now && !player.walk) {
    useBubbles.getState().sayself('하던 걸 마치고 옮겨 앉아요', 1800)
    return
  }
  seatRequest.seat = seat
  seatRequest.at = now
  net.send({ t: 'seat', seat })
}

/** 서버가 내 자리 이동을 승인 (from → to) */
export function startLocalSeatWalk(from: number, to: number) {
  if (player.zone !== 'bulteok') return
  seatRequest.seat = -1
  beginSeatWalk(player, from, to)
  player.breath = 1
  const b = useBulteok.getState()
  b.setDozing(false)
  // 걷는 동안엔 손질·귤·졸기 버튼을 쉼 (서버도 거절)
  if (player.walk) b.setBusyUntil(performance.now() + walkDuration(player.walk) * 1000)
  cameraRig.lastInputAt = performance.now()
}

/** 그 자리는 다른 해녀가 먼저: "앗" 하고 그대로 (걷던 중이면 원래 가던 자리로) */
export function denyLocalSeat(seat: number) {
  seatRequest.seat = -1
  if (player.zone !== 'bulteok') return
  startOops(player, seat)
  useBubbles.getState().sayself('앗', 1200)
}
