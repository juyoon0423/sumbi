import { create } from 'zustand'

// 그래픽 품질 단계. 처음엔 기기로 짐작하고, 실제로 프레임이 낮으면 한 단계씩 낮춤 (올리지는 않음).
// 개발용: ?quality=high|medium|low 로 고정, 콘솔 __sumbi.quality

export type QualityLevel = 'high' | 'medium' | 'low'

export interface QualitySettings {
  /** 화면 해상도 배율 상한 */
  dpr: number
  /** 구름 덩이 수 */
  clouds: number
  /** 수면 잔물결 노멀맵 겹 수 (1 ~ 3) */
  waterLayers: number
  /** 빛 번짐(블룸) */
  bloom: boolean
  /** 블룸 계산 해상도 배율 */
  bloomScale: number
  /** 그림자 맵 크기 */
  shadowMap: number
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { dpr: 1.75, clouds: 30, waterLayers: 3, bloom: true, bloomScale: 0.5, shadowMap: 2048 },
  medium: { dpr: 1.5, clouds: 20, waterLayers: 2, bloom: true, bloomScale: 0.35, shadowMap: 1024 },
  low: { dpr: 1, clouds: 12, waterLayers: 1, bloom: false, bloomScale: 0.25, shadowMap: 1024 },
}

const ORDER: QualityLevel[] = ['high', 'medium', 'low']

function forced(): QualityLevel | null {
  try {
    const q = new URLSearchParams(location.search).get('quality')
    if (q === 'high' || q === 'medium' || q === 'low') return q
  } catch {
    /* 무시 */
  }
  return null
}

function guess(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const small = Math.min(screen.width, screen.height) < 600
  const mobile = coarse || small
  const cores = nav.hardwareConcurrency ?? 4
  const mem = nav.deviceMemory ?? 4
  if (mobile && (mem <= 3 || cores <= 4)) return 'low'
  if (mobile) return 'medium'
  if (mem <= 2 || cores <= 2) return 'medium'
  return 'high'
}

const fixed = forced()

interface QualityState {
  level: QualityLevel
  /** 처음 값이 고정(?quality=)이면 자동으로 낮추지 않음 */
  locked: boolean
  set: (level: QualityLevel) => void
  /** 한 단계 낮추기. 더 낮출 수 없으면 false */
  lower: () => boolean
}

export const useQuality = create<QualityState>((set, get) => ({
  level: fixed ?? guess(),
  locked: fixed !== null,
  set: (level) => set({ level }),
  lower: () => {
    const i = ORDER.indexOf(get().level)
    if (get().locked || i >= ORDER.length - 1) return false
    set({ level: ORDER[i + 1] })
    return true
  },
}))

export const qualitySettings = () => QUALITY[useQuality.getState().level]
