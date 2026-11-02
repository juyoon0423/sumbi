import { CONFIG } from '../config'
import { setState } from '../haenyeo/types'
import { net } from '../net'
import type { Zone, Vec3 } from '../net/protocol'
import { useBulteok } from '../store/bulteokStore'
import { useGame } from '../store/gameStore'
import { restingTewak, seatPose } from '../world/bulteok/layout'
import { stopBreathe } from './breathe'
import { cameraRig, player } from './runtime'

// 바다 ↔ 불턱 이동: 화면을 부드럽게 가렸다가(페이드) 서버가 자리를 정해 주면 옮기고 다시 밝힘

const FADE_MS = 450

export function travel(to: Zone) {
  const b = useBulteok.getState()
  const game = useGame.getState()
  if (b.traveling || b.zone === to) return
  if (to === 'bulteok' && (game.diving || player.pose.state !== 'surfaceIdle' && player.pose.state !== 'surfaceSwim')) return
  stopBreathe()
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
  player.pos.set(s.x, s.y, s.z)
  player.yaw = s.yaw
  const pose = player.pose
  setState(pose, 'sit')
  pose.act = null
  pose.breatheTime = -1
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
