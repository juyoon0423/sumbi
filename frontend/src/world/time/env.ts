import { Vector3 } from 'three'
import { emptyPalette, type Palette } from './palette'

// 지금 시간대 분위기 값 (TimeOfDay 가 매 프레임 갱신, 장면 곳곳에서 읽음)

export type TimePreset = 'dawn' | 'day' | 'sunset' | 'night'

/** 시간대 이름 → 대표 시각 (한국 시간) */
export const PRESET_HOUR: Record<TimePreset, number> = { dawn: 6.2, day: 13, sunset: 18.3, night: 23 }

export const PRESET_LABEL: Record<TimePreset, string> = { dawn: '새벽', day: '낮', sunset: '노을', night: '밤' }

export const env: Palette & {
  /** 지금 반영 중인 시각 (0~24, 한국 시간) */
  hour: number
  /** 해 방향 (지평선 아래면 y < 0) */
  sunDir: Vector3
  moonDir: Vector3
  /** 그림자·반짝임에 쓰는 빛 방향 (낮 = 해, 밤 = 달) */
  lightDir: Vector3
  /** 반짝임 날카로움 (밤 달빛 길은 넓게) */
  glintPow: number
} = {
  ...emptyPalette(),
  hour: 13,
  sunDir: new Vector3(-0.45, 0.42, -0.78).normalize(),
  moonDir: new Vector3(0.35, 0.36, -0.86).normalize(),
  lightDir: new Vector3(-0.45, 0.42, -0.78).normalize(),
  glintPow: 180,
}

/** 시각 → 대표 시간대 (물질 일지 카드 등) */
export function presetOf(hour: number): TimePreset {
  const h = ((hour % 24) + 24) % 24
  if (h >= 4.8 && h < 8) return 'dawn'
  if (h >= 8 && h < 17.2) return 'day'
  if (h >= 17.2 && h < 19.8) return 'sunset'
  return 'night'
}

// ── 시각 정하기: 실제 한국 시간, 또는 개발용 고정 (?time=dawn|day|sunset|night 또는 ?hour=21.5) ──

let forcedHour: number | null = readUrl()

function readUrl(): number | null {
  try {
    const q = new URLSearchParams(location.search)
    const t = q.get('time') as TimePreset | null
    if (t && t in PRESET_HOUR) return PRESET_HOUR[t]
    const h = q.get('hour')
    if (h !== null && h !== '' && Number.isFinite(Number(h))) return Number(h)
  } catch {
    /* 무시 */
  }
  return null
}

export function kstHour(now = Date.now()) {
  return (((now / 3_600_000 + 9) % 24) + 24) % 24
}

/** 지금 보여 줄 시각 */
export function targetHour() {
  return forcedHour ?? kstHour()
}

/** 개발용: 시간대 고정 (null 이면 실제 시간) */
export function setTimeOverride(t: TimePreset | number | null) {
  forcedHour = t === null ? null : typeof t === 'number' ? t : PRESET_HOUR[t]
}
