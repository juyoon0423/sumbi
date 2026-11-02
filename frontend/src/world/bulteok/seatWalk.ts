import type { HaenyeoState } from '../../haenyeo/types'
import { lerpAngle, smoothstep } from '../../lib/math'
import { terrainY } from '../terrain'
import { BULTEOK, seatPose } from './layout'

// 불턱 자리 옮기기: 일어나기 → 가는 쪽으로 돌기 → 모닥불 둘레를 돌아 걷기 → 모닥불 쪽으로 돌기 → 털썩 앉기.
// 내 해녀와 다른 해녀가 같은 길·같은 시간으로 걷는다 (서버는 from → to 만 알려 줌).
// 길·시간은 서버 SeatPath.java 와 같은 공식 (서버는 걷는 동안 손질 등을 막는 데 씀).

export const WALK = {
  rise: 0.55,
  turn: 0.35,
  arrive: 0.35,
  settle: 0.55,
  /** 앉는 순간 (settle 안에서) */
  land: 0.25,
  speed: 1.0,
  /** 걷는 고리: 안쪽 자리(2.05)와 바깥 자리(3.15) 사이 */
  ringR: 2.6,
  wallR: 4.2,
}

/** 서 있을 때 몸 중심이 발바닥 위로 */
const STAND_BODY = 0.4
/** 앉는 돌 윗면 높이 (돌 위에 서 있다가 내려옴) */
const STONE_TOP = 0.16

interface Pt {
  x: number
  z: number
}

export interface SeatWalk {
  from: number
  to: number
  /** 시작 후 지난 시간 (초) */
  t: number
  pts: Pt[]
  /** 각 점까지 누적 거리 */
  cum: number[]
  len: number
  rise: number
  turn: number
  startY: number
  startYaw: number
  /** 걷기 시작 방향 / 마지막 걷는 방향 */
  yaw0: number
  yaw1: number
  /** 앉기 시작한 순간 먼지 한 번 */
  puffed: boolean
}

export interface WalkFrame {
  x: number
  y: number
  z: number
  yaw: number
  state: HaenyeoState
  /** 걸음 세기 0~1 (다리 흔들기) */
  move: number
  done: boolean
  /** 이번 프레임에 털썩 앉음 */
  landed: boolean
}

const polar = (p: Pt) => ({ r: Math.hypot(p.x - BULTEOK.x, p.z - BULTEOK.z), a: Math.atan2(p.z - BULTEOK.z, p.x - BULTEOK.x) })
const onCircle = (r: number, a: number): Pt => ({ x: BULTEOK.x + Math.cos(a) * r, z: BULTEOK.z + Math.sin(a) * r })
/** a → b 짧은 쪽 각도 차 (-π~π) */
const delta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

function arc(out: Pt[], r: number, a0: number, a1: number) {
  const d = delta(a0, a1)
  const n = Math.max(1, Math.ceil(Math.abs(d) / 0.12))
  for (let i = 1; i <= n; i++) out.push(onCircle(r, a0 + (d * i) / n))
}

/** 바닥 높이: 돌담 안은 평평, 밖은 지형 (담 근처에서 섞음) */
function floorY(x: number, z: number) {
  const r = Math.hypot(x - BULTEOK.x, z - BULTEOK.z)
  const k = smoothstep(BULTEOK.wallRadius + 0.2, BULTEOK.wallRadius + 0.8, r)
  return BULTEOK.y * (1 - k) + terrainY(x, z) * k
}

/** 앉는 돌 위에선 돌 높이만큼 (출발·도착 자리) */
function stoneLift(x: number, z: number, seats: number[]) {
  let lift = 0
  for (const s of seats) {
    if (s >= 24) continue
    const p = seatPose(s)
    const d = Math.hypot(x - p.x, z - p.z)
    lift = Math.max(lift, STONE_TOP * (1 - smoothstep(0.12, 0.36, d)))
  }
  return lift
}

/** 서 있는 몸 중심 높이 */
export function standY(x: number, z: number, seats: number[] = []) {
  return floorY(x, z) + STAND_BODY + stoneLift(x, z, seats)
}

/** 걷는 길 점들: 담 밖이면 담 둘레로 입구까지 → 걷는 고리 → 고리를 따라 돌아 → 목적지 자리 */
function pathPoints(start: Pt, to: number): Pt[] {
  const pts: Pt[] = [start]
  let { r, a } = polar(start)
  if (r > WALK.wallR) {
    arc(pts, r, a, BULTEOK.entrance)
    a = BULTEOK.entrance
  }
  r = WALK.ringR
  pts.push(onCircle(r, a))
  const goal = seatPose(to)
  const ga = polar(goal).a
  arc(pts, r, a, ga)
  pts.push({ x: goal.x, z: goal.z })
  // 길이 0인 마디 빼기
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1e-4)
}

/**
 * 새 걸음. cur 를 주면(걷다가 방향 바꾸기) 지금 선 자리에서 바로 출발 (일어나기 없음).
 * 아니면 from 자리에서 일어나서 출발.
 */
export function planWalk(from: number, to: number, cur?: { x: number; y: number; z: number; yaw: number }): SeatWalk {
  const fromPose = seatPose(Math.max(0, from))
  const start = cur ? { x: cur.x, z: cur.z } : { x: fromPose.x, z: fromPose.z }
  const pts = pathPoints(start, to)
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  const len = cum[cum.length - 1]
  const dirAt = (i: number) => Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
  return {
    from,
    to,
    t: 0,
    pts,
    cum,
    len,
    rise: cur ? 0 : WALK.rise,
    turn: cur ? 0.2 : WALK.turn,
    startY: cur ? cur.y : fromPose.y,
    startYaw: cur ? cur.yaw : fromPose.yaw,
    yaw0: pts.length > 1 ? dirAt(0) : fromPose.yaw,
    yaw1: pts.length > 1 ? dirAt(pts.length - 2) : fromPose.yaw,
    puffed: false,
  }
}

/** 걷는 데 걸리는 전체 시간 (초) */
export function walkDuration(w: SeatWalk) {
  return w.rise + w.turn + w.len / WALK.speed + WALK.arrive + WALK.settle
}

/** 길 위 거리 s 인 점 */
function pointAt(w: SeatWalk, s: number, out: Pt) {
  const { pts, cum } = w
  if (s <= 0 || pts.length < 2) return Object.assign(out, pts[0])
  if (s >= w.len) return Object.assign(out, pts[pts.length - 1])
  let i = 1
  while (cum[i] < s) i++
  const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1])
  out.x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k
  out.z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k
  return out
}

const tmpA = { x: 0, z: 0 }
const tmpB = { x: 0, z: 0 }
const ease = (x: number) => smoothstep(0, 1, x)
/** 0→1→0 */
const hump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2)

/** 시간을 dt 만큼 진행하고 이번 프레임의 위치·방향·자세 */
export function stepWalk(w: SeatWalk, dt: number, out: WalkFrame): WalkFrame {
  w.t += dt
  const t = w.t
  const seats = [w.from, w.to]
  const goal = seatPose(w.to)
  const tWalk0 = w.rise + w.turn
  const tWalk1 = tWalk0 + w.len / WALK.speed
  const tArrive = tWalk1 + WALK.arrive
  const tEnd = tArrive + WALK.settle
  out.landed = false
  out.done = false

  if (t < w.rise) {
    // 엉덩이를 들며 일어남 (살짝 기지개)
    const k = ease(t / w.rise)
    const p = w.pts[0]
    out.x = p.x
    out.z = p.z
    out.y = w.startY + (standY(p.x, p.z, seats) - w.startY) * k + 0.05 * hump(t / w.rise)
    out.yaw = w.startYaw
    out.state = 'rise'
    out.move = 0
  } else if (t < tWalk0) {
    // 가는 쪽으로 몸 돌리기 (제자리 종종걸음)
    const p = w.pts[0]
    out.x = p.x
    out.z = p.z
    const k = w.turn > 0 ? ease((t - w.rise) / w.turn) : 1
    out.y = w.rise > 0 ? standY(p.x, p.z, seats) : w.startY + (standY(p.x, p.z, seats) - w.startY) * k
    out.yaw = lerpAngle(w.startYaw, w.yaw0, k)
    out.state = 'walk'
    out.move = 0.45
  } else if (t < tWalk1) {
    // 모닥불 둘레를 따라 뒤뚱뒤뚱 (조금 앞 점을 보며 돌아서 길이 꺾여도 부드럽게)
    const s = (t - tWalk0) * WALK.speed
    pointAt(w, s, tmpA)
    pointAt(w, Math.min(w.len, s + 0.3), tmpB)
    out.x = tmpA.x
    out.z = tmpA.z
    out.y = standY(tmpA.x, tmpA.z, seats)
    const dx = tmpB.x - tmpA.x
    const dz = tmpB.z - tmpA.z
    const ahead = Math.hypot(dx, dz) > 0.02 ? Math.atan2(dx, dz) : w.yaw1
    out.yaw = lerpAngle(w.yaw0, ahead, smoothstep(0, 0.25, s))
    out.state = 'walk'
    out.move = 1
  } else if (t < tArrive) {
    // 도착: 모닥불 쪽으로 돌아섬
    const k = ease((t - tWalk1) / WALK.arrive)
    out.x = goal.x
    out.z = goal.z
    out.y = standY(goal.x, goal.z, seats)
    out.yaw = lerpAngle(w.yaw1, goal.yaw, k)
    out.state = 'walk'
    out.move = 0.45
  } else if (t < tEnd) {
    // 콩 뛰었다 털썩 (땅에 닿는 순간 먼지)
    const st = t - tArrive
    out.x = goal.x
    out.z = goal.z
    const top = standY(goal.x, goal.z, seats)
    if (st < WALK.land) {
      const k = st / WALK.land
      out.y = top + 0.07 * Math.sin(Math.PI * Math.min(1, k * 1.15)) + (goal.y - top) * k * k
    } else {
      out.y = goal.y
      if (!w.puffed) {
        w.puffed = true
        out.landed = true
      }
    }
    out.yaw = goal.yaw
    out.state = 'settle'
    out.move = 0
  } else {
    out.x = goal.x
    out.z = goal.z
    out.y = goal.y
    out.yaw = goal.yaw
    out.state = 'sit'
    out.move = 0
    out.done = true
    if (!w.puffed) {
      w.puffed = true
      out.landed = true
    }
  }
  return out
}

/** 지금 일어서 있나 (걷다가 방향을 바꾸면 일어나기를 건너뜀) */
export function isStanding(w: SeatWalk | null) {
  if (!w) return false
  const tArrive = w.rise + w.turn + w.len / WALK.speed + WALK.arrive
  return w.t >= w.rise * 0.7 && w.t < tArrive
}

/** 담 밖에 서서 불 쬐는 자리 (24번~) */
export function standingPose(seat: number) {
  const s = seatPose(seat)
  return { x: s.x, y: standY(s.x, s.z), z: s.z, yaw: s.yaw }
}

/** 앞쪽 비스듬히 보는 시점 방향: 공동 대야가 앞을 가리지 않게 대야에서 먼 쪽 (물질 일지 사진과 같은 구도) */
export function bulteokFrontYaw(x: number, z: number, yaw: number, turn = 0.42) {
  const side = (y: number) => Math.hypot(x + Math.sin(y) * 2.6 - BULTEOK.basin.x, z + Math.cos(y) * 2.6 - BULTEOK.basin.z)
  return side(yaw - turn) > side(yaw + turn) ? yaw - turn : yaw + turn
}
