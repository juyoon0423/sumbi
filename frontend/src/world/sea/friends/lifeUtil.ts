import { CONFIG } from '../../../config'
import { seededRandom } from '../../../lib/math'
import { useGame } from '../../../store/gameStore'
import { terrainY } from '../../terrain'

/** 지금 물속에서 보고 있는지 (물 위에서는 물속 생물을 감추고 계산도 쉼) */
export const underView = () => useGame.getState().cameraUnderwater

/** 해녀가 노는 바다 안에서 깊이 조건에 맞는 자리 여러 개 (같은 seed 면 늘 같은 자리) */
export function pickSpots(seed: number, count: number, opts: { maxY: number; minY?: number; radius?: number; gap?: number }) {
  const rand = seededRandom(seed)
  const [cx, cz] = CONFIG.playCenter
  const radius = opts.radius ?? 26
  const out: { x: number; z: number; y: number; r: number }[] = []
  for (let tries = 0; out.length < count && tries < 4000; tries++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * radius
    const x = cx + Math.cos(a) * d
    const z = cz + Math.sin(a) * d
    const y = terrainY(x, z)
    if (y > opts.maxY || (opts.minY !== undefined && y < opts.minY)) continue
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (opts.gap ?? 3))) continue
    out.push({ x, z, y, r: rand() })
  }
  return out
}

/** 개발·캡처용: 생물 자리 (window.__sumbi.friends.where) */
export const friendsDebug = {
  /** 자리돔 떼 가운데와 퍼진 정도(평균 거리 m) */
  schools: [] as { x: number; y: number; z: number }[],
  spread: [] as number[],
  squids: [] as { x: number; y: number; z: number }[],
  jellies: [] as { x: number; y: number; z: number }[],
  crabs: [] as { x: number; y: number; z: number }[],
  hermits: [] as { x: number; y: number; z: number }[],
  starfish: [] as { x: number; y: number; z: number }[],
}
