import type { Vector3 } from 'three'
import { setState, type HaenyeoPose } from '../../haenyeo/types'
import { bulteokFx } from './bulteokFx'
import { restingTewak, seatPose } from './layout'
import { isStanding, planWalk, standingPose, stepWalk, type SeatWalk, type WalkFrame } from './seatWalk'

// 불턱에 있는 해녀(내 해녀·다른 해녀 공용): 자리에 앉아 있기 / 담 밖에 서 있기 / 자리를 옮겨 걷기

export interface SeatHolder {
  pos: Vector3
  yaw: number
  pose: HaenyeoPose
  seat: number
  walk: SeatWalk | null
  /** 앉으면 옆에 내려놓고, 걸을 땐 옆구리에 끼고 감 */
  tewak: { pos: Vector3 }
}

/** 서버가 승인한 자리 이동 시작. 걷는 중이면 지금 선 곳에서 새 자리로 방향을 바꿈 */
export function beginSeatWalk(h: SeatHolder, from: number, to: number) {
  const w = h.walk
  if (w && isStanding(w)) {
    h.walk = planWalk(from, to, { x: h.pos.x, y: h.pos.y, z: h.pos.z, yaw: h.yaw })
  } else if (w && w.t < w.rise) {
    // 아직 일어나는 중: 일어나기는 이어서 하고 가는 곳만 바꿈
    const next = planWalk(w.from, to)
    next.t = w.t
    h.walk = next
  } else {
    h.walk = planWalk(from, to)
  }
  h.seat = to
  h.pose.act = null
}

const frame: WalkFrame = { x: 0, y: 0, z: 0, yaw: 0, state: 'sit', move: 0, done: false, landed: false }

/** 매 프레임: 위치·방향·자세. 털썩 앉은 프레임이면 true (먼지·소리) */
export function driveSeat(h: SeatHolder, dt: number): boolean {
  if (h.walk) {
    const f = stepWalk(h.walk, dt, frame)
    h.pos.set(f.x, f.y, f.z)
    h.yaw = f.yaw
    setState(h.pose, f.state)
    h.pose.move = f.move
    // 테왁은 오른쪽 옆구리에 끼고 (앉는 순간 옆에 내려놓음)
    if (f.state === 'walk' || f.state === 'rise') {
      const rx = -Math.cos(f.yaw)
      const rz = Math.sin(f.yaw)
      h.tewak.pos.set(f.x + rx * 0.36, f.y - 0.04, f.z + rz * 0.36)
    } else {
      placeTewak(h)
    }
    if (f.done) h.walk = null
    if (f.landed) bulteokFx.puffs.push({ x: f.x, y: seatPose(h.seat).stoneY + 0.16, z: f.z })
    return f.landed
  }
  h.pose.move = 0
  placeTewak(h)
  if (h.seat >= 24) {
    const s = standingPose(h.seat)
    h.pos.set(s.x, s.y, s.z)
    h.yaw = s.yaw
    setState(h.pose, 'stand')
  } else {
    const s = seatPose(h.seat)
    h.pos.set(s.x, s.y, s.z)
    h.yaw = s.yaw
    setState(h.pose, 'sit')
  }
  return false
}

function placeTewak(h: SeatHolder) {
  const tw = restingTewak(h.seat)
  h.tewak.pos.set(tw.x, tw.y, tw.z)
}

/** "앗": 원하던 자리를 다른 사람이 먼저 잡음. 그 자리 쪽을 돌아봄 */
export function startOops(h: { pos: Vector3; yaw: number; pose: HaenyeoPose }, seat: number) {
  const s = seatPose(seat)
  const world = Math.atan2(s.x - h.pos.x, s.z - h.pos.z)
  const rel = Math.atan2(Math.sin(world - h.yaw), Math.cos(world - h.yaw))
  h.pose.oopsYaw = Math.max(-1.1, Math.min(1.1, rel))
  h.pose.oopsTime = 0
}
