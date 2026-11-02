import { create } from 'zustand'
import type { ItemType } from '../config'
import { kstDateKey } from '../lib/today'
import type { ItemCounts, TodayStats } from '../net/protocol'

export type Phase = 'entry' | 'playing'

const BASKET_KEY = 'sumbi.basket'

function loadBasket(): ItemCounts {
  try {
    const raw = localStorage.getItem(BASKET_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { date: string; items: ItemCounts }
      if (saved.date === kstDateKey()) return saved.items
    }
  } catch {
    /* 무시 */
  }
  return { conch: 0, abalone: 0, urchin: 0 }
}

interface GameState {
  phase: Phase
  selfId: number | null
  nickname: string
  basket: ItemCounts
  today: TodayStats | null
  /** 카메라가 물속인지 (안개·소리·화면 효과 전환용) */
  cameraUnderwater: boolean
  /** 내 해녀가 잠수 중인지 (행동 바 표시용) */
  diving: boolean

  setPhase: (p: Phase) => void
  setSelf: (id: number, nick: string) => void
  setToday: (t: TodayStats) => void
  addToBasket: (item: ItemType) => void
  setCameraUnderwater: (v: boolean) => void
  setDiving: (v: boolean) => void
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'entry',
  selfId: null,
  nickname: '',
  basket: loadBasket(),
  today: null,
  cameraUnderwater: false,
  diving: false,

  setPhase: (phase) => set({ phase }),
  setSelf: (selfId, nickname) => set({ selfId, nickname }),
  setToday: (today) => set({ today }),
  addToBasket: (item) => {
    const basket = { ...get().basket, [item]: get().basket[item] + 1 }
    set({ basket })
    try {
      localStorage.setItem(BASKET_KEY, JSON.stringify({ date: kstDateKey(), items: basket }))
    } catch {
      /* 무시 */
    }
  },
  setCameraUnderwater: (cameraUnderwater) => {
    if (get().cameraUnderwater !== cameraUnderwater) set({ cameraUnderwater })
  },
  setDiving: (diving) => {
    if (get().diving !== diving) set({ diving })
  },
}))
