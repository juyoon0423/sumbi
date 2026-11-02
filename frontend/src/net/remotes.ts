import { Vector3 } from 'three'
import { create } from 'zustand'
import { CONFIG, type ItemType } from '../config'
import { createPose, setState, type HaenyeoPose } from '../haenyeo/types'
import { fx } from '../player/runtime'
import type { LookInfo, PlayerInfo } from './protocol'

// 다른 해녀들. 렌더링할 목록(누가 있는지, 닉네임·꾸미기)은 zustand,
// 매 프레임 바뀌는 위치·포즈는 아래 remotes 맵에 둔다 (리렌더 없음).

/** 보간 지연: 받은 위치를 이만큼 늦게 재생해서 사이를 부드럽게 채움 */
export const INTERP_DELAY_MS = 100

interface Sample {
  t: number
  x: number
  y: number
  z: number
  r: number
}

export interface RemoteRuntime {
  id: number
  samples: Sample[]
  pos: Vector3
  yaw: number
  /** 보간 위치로 계산한 속도 (포즈 판단용) */
  vel: Vector3
  pose: HaenyeoPose
  underwater: boolean
  tewak: { pos: Vector3; attached: boolean }
}

export const remotes = new Map<number, RemoteRuntime>()

export interface RemoteInfo {
  id: number
  nick: string
  look: LookInfo
}

interface RemoteListState {
  list: RemoteInfo[]
  reset: (players: PlayerInfo[]) => void
  add: (p: PlayerInfo) => void
  remove: (id: number) => void
  setLook: (id: number, nick: string, look: LookInfo) => void
}

function makeRuntime(p: PlayerInfo): RemoteRuntime {
  const [x, y, z] = p.p ?? [0, 0, 8]
  const pose = createPose()
  const underwater = p.st === 'underwater'
  if (underwater) setState(pose, 'underIdle')
  const yaw = p.r ?? 0
  return {
    id: p.id,
    samples: [{ t: serverNow(), x, y, z, r: yaw }],
    pos: new Vector3(x, y, z),
    yaw,
    vel: new Vector3(),
    pose,
    underwater,
    tewak: { pos: new Vector3(x + Math.sin(yaw) * 0.47, 0, z + Math.cos(yaw) * 0.47), attached: !underwater },
  }
}

const info = (p: PlayerInfo): RemoteInfo => ({ id: p.id, nick: p.nick, look: p.look })

export const useRemotes = create<RemoteListState>((set, get) => ({
  list: [],
  reset: (players) => {
    remotes.clear()
    for (const p of players) remotes.set(p.id, makeRuntime(p))
    set({ list: players.map(info) })
  },
  add: (p) => {
    remotes.set(p.id, makeRuntime(p))
    set({ list: [...get().list.filter((r) => r.id !== p.id), info(p)] })
  },
  remove: (id) => {
    remotes.delete(id)
    set({ list: get().list.filter((r) => r.id !== id) })
  },
  setLook: (id, nick, look) => set({ list: get().list.map((r) => (r.id === id ? { ...r, nick, look } : r)) }),
}))

export const remoteNick = (id: number) => useRemotes.getState().list.find((r) => r.id === id)?.nick

// ── 서버 시계 맞추기: 스냅샷 ts(서버 ms)와 내 시계의 차이를 천천히 따라감 ──
let offset: number | null = null

export function serverNow() {
  return Date.now() + (offset ?? 0)
}

/** snap 수신: [id, x, y, z, yaw] 들을 각자의 버퍼에 쌓음 */
export function applySnap(ts: number, ps: [number, number, number, number, number][], selfId: number | null) {
  const diff = ts - Date.now()
  // 늦게 도착한 것보다 빨리 도착한 쪽(지연이 작은 쪽)을 더 믿음
  offset = offset === null ? diff : diff > offset ? offset + (diff - offset) * 0.5 : offset + (diff - offset) * 0.05
  for (const [id, x, y, z, r] of ps) {
    if (id === selfId) continue
    const rm = remotes.get(id)
    if (!rm) continue
    rm.samples.push({ t: ts, x, y, z, r })
    if (rm.samples.length > 20) rm.samples.splice(0, rm.samples.length - 20)
  }
}

const lerpAngle = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

const tmp = new Vector3()

/** 100ms 늦은 시점의 위치를 앞뒤 샘플 사이에서 보간 */
export function interpolate(rm: RemoteRuntime, dt: number) {
  const s = rm.samples
  const rt = serverNow() - INTERP_DELAY_MS
  while (s.length >= 2 && s[1].t <= rt) s.shift()
  tmp.copy(rm.pos)
  if (s.length >= 2 && s[0].t <= rt) {
    const a = s[0]
    const b = s[1]
    const k = Math.min(1, (rt - a.t) / Math.max(1, b.t - a.t))
    rm.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)
    rm.yaw = lerpAngle(a.r, b.r, k)
  } else if (s.length) {
    // 새 샘플이 아직 없으면 마지막 위치로 부드럽게
    const last = s[s.length - 1]
    const k = Math.min(1, dt * 10)
    rm.pos.x += (last.x - rm.pos.x) * k
    rm.pos.y += (last.y - rm.pos.y) * k
    rm.pos.z += (last.z - rm.pos.z) * k
    rm.yaw = lerpAngle(rm.yaw, last.r, k)
  }
  if (dt > 0) {
    tmp.subVectors(rm.pos, tmp).divideScalar(dt)
    rm.vel.lerp(tmp, Math.min(1, dt * 8))
  }
}

// ── 행동 이벤트 → 포즈 ──
export function applyEvent(id: number, a: string, item?: ItemType) {
  const rm = remotes.get(id)
  if (!rm) return
  const pose = rm.pose
  switch (a) {
    case 'dive':
      rm.underwater = true
      rm.tewak.attached = false // 테왁은 수면에 남김
      setState(pose, 'entering')
      fx.splashes.push({ pos: rm.pos.clone(), power: 1.6 })
      break
    case 'surface':
      rm.underwater = false
      rm.tewak.attached = true
      // 한 프레임 'ascending'을 거쳐야 수면에서 퐁 튀어오름이 재생됨 (drivePose 에서 수면 대기로)
      setState(pose, 'ascending')
      fx.splashes.push({ pos: rm.pos.clone(), power: 1 })
      break
    case 'sumbi':
      setState(pose, 'sumbi')
      break
    case 'harvest':
      pose.heldItem = item ?? null
      setState(pose, 'harvesting')
      break
    case 'wave':
      pose.waveTime = 0
      break
  }
}

/** 매 프레임: 이벤트로 정한 상태 + 움직임(속도)으로 세부 포즈를 정함 */
export function drivePose(rm: RemoteRuntime, dt: number) {
  const pose = rm.pose
  pose.stateTime += dt
  if (pose.waveTime >= 0) pose.waveTime = pose.waveTime > CONFIG.waveDuration ? -1 : pose.waveTime + dt
  const hs = Math.hypot(rm.vel.x, rm.vel.z)
  const vy = rm.vel.y
  pose.move += (Math.min(1, hs / 2) - pose.move) * Math.min(1, dt * 6)
  const st = pose.stateTime
  switch (pose.state) {
    case 'entering':
      if (st > CONFIG.enterDuration) setState(pose, 'descending')
      break
    case 'descending':
      if (vy > 0.6) setState(pose, 'ascending')
      else if (st > 0.4 && vy > -0.35) setState(pose, hs > 0.3 ? 'underSwim' : 'underIdle')
      break
    case 'underIdle':
    case 'underSwim':
      if (vy > 0.6) setState(pose, 'ascending')
      else if (vy < -1.0) setState(pose, 'descending')
      else setState(pose, hs > 0.3 ? 'underSwim' : 'underIdle')
      break
    case 'ascending':
      if (!rm.underwater && st > 0.05) setState(pose, 'surfaceIdle')
      else if (rm.underwater && st > 0.5 && vy < -0.6) setState(pose, 'descending')
      break
    case 'harvesting':
      if (st > CONFIG.harvestDuration) {
        pose.heldItem = null
        setState(pose, 'underIdle')
      }
      break
    case 'sumbi':
      if (st > CONFIG.sumbiDuration) setState(pose, 'surfaceIdle')
      break
    case 'surfaceIdle':
    case 'surfaceSwim':
      if (rm.underwater) setState(pose, 'underIdle')
      else setState(pose, hs > 0.3 ? 'surfaceSwim' : 'surfaceIdle')
      break
  }
}
