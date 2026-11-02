import { create } from 'zustand'
import { CONFIG } from '../config'
import { kstDateKey } from '../lib/today'

// 숨 고르기: 오늘 한 숨(들이쉬기+내쉬기) 수와 그만큼 늘어난 숨 최대치(초). 브라우저에만, 한국 자정에 초기화.

const KEY = 'sumbi.breathe'

interface Saved {
  date: string
  cycles: number
}

function load(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Saved
      if (s.date === kstDateKey()) return s.cycles
    }
  } catch {
    /* 무시 */
  }
  return 0
}

function save(cycles: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: kstDateKey(), cycles } satisfies Saved))
  } catch {
    /* 무시 */
  }
}

/** 오늘 숨 수 → 늘어난 숨 (breatheRewardCycles 번마다 +breatheBonus 초, 최대 breatheBonusMax) */
export function bonusFor(cycles: number) {
  return Math.min(CONFIG.breatheBonusMax, Math.floor(cycles / CONFIG.breatheRewardCycles) * CONFIG.breatheBonus)
}

interface BreatheState {
  /** 지금 숨 고르는 중 */
  active: boolean
  /** 이번에 고른 숨 수 */
  session: number
  /** 오늘 고른 숨 수 */
  cycles: number
  /** 오늘 늘어난 숨 최대치(초) */
  bonus: number
  setActive: (on: boolean) => void
  /** 숨 하나를 마침. 숨 최대치가 늘었으면 그 값(초), 아니면 0 */
  completeCycle: () => number
}

const initial = load()

export const useBreathe = create<BreatheState>((set, get) => ({
  active: false,
  session: 0,
  cycles: initial,
  bonus: bonusFor(initial),
  setActive: (on) => set(on ? { active: true, session: 0 } : { active: false }),
  completeCycle: () => {
    const s = get()
    const cycles = s.cycles + 1
    const bonus = bonusFor(cycles)
    save(cycles)
    set({ cycles, bonus, session: s.session + 1 })
    return bonus > s.bonus ? bonus : 0
  },
}))

/** 지금 잠수할 수 있는 최대 시간(초) */
export function breathMaxSeconds() {
  return CONFIG.breathMax + useBreathe.getState().bonus
}
