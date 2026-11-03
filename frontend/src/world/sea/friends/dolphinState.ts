import { create } from 'zustand'

// 남방큰돌고래: 서버가 정한 한 번의 지나감 (오프라인이면 브라우저가 같은 방식으로 정함).
// 시작 시각은 내 시계(performance.now) 기준으로 바꿔 둠 → 서버·브라우저 시계가 달라도 같은 장면.

export interface DolphinPass {
  seq: number
  /** performance.now() 기준 시작 시각 (ms) */
  start: number
  dur: number
  from: [number, number]
  to: [number, number]
  n: number
  seed: number
}

interface DolphinState {
  pass: DolphinPass | null
  begin: (p: Omit<DolphinPass, 'start'> & { el: number }) => void
  clear: () => void
}

export const useDolphins = create<DolphinState>((set) => ({
  pass: null,
  begin: ({ el, ...p }) => set({ pass: { ...p, start: performance.now() - el } }),
  clear: () => set({ pass: null }),
}))

/** 0~1 진행. 없거나 끝났으면 null */
export function dolphinProgress(now = performance.now()) {
  const p = useDolphins.getState().pass
  if (!p) return null
  const k = (now - p.start) / p.dur
  return k >= 0 && k <= 1 ? k : null
}

// ── 서버 없이 (혼자 하는 바다) 같은 방식으로 정하기: 백엔드 DolphinSchedule 과 같은 길 ──

const PLAY: [number, number] = [0, 8]
const NEAR = 15
const FAR = 22
const HALF = 27
const SPREAD = 1.1
const SPEED = 2.4

export function localPass(seq: number, rand = Math.random) {
  // 물질하는 곳에서 바다 쪽으로 15~22m 떨어진 곳을 스치는 54m 직선
  const a = Math.PI / 2 + (rand() * 2 - 1) * SPREAD
  const dist = NEAR + rand() * (FAR - NEAR)
  const px = PLAY[0] + Math.cos(a) * dist
  const pz = PLAY[1] + Math.sin(a) * dist
  const sign = rand() < 0.5 ? 1 : -1
  const dx = -Math.sin(a) * sign
  const dz = Math.cos(a) * sign
  return {
    seq,
    el: 0,
    dur: Math.round(((2 * HALF) / SPEED) * 1000),
    from: [px - dx * HALF, pz - dz * HALF] as [number, number],
    to: [px + dx * HALF, pz + dz * HALF] as [number, number],
    n: 3 + Math.floor(rand() * 4),
    seed: 1 + Math.floor(rand() * 999_999),
  }
}

/** 오프라인 등장 간격: 평균 30분 지수 분포를 8~90분으로 (서버와 같게) */
export function localGapMs(rand = Math.random) {
  const g = -Math.log(Math.max(1e-9, 1 - rand())) * 30 * 60_000
  return Math.max(8 * 60_000, Math.min(90 * 60_000, g))
}
