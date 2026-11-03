import { create } from 'zustand'
import type { ItemType } from '../config'
import { kstDateKey } from '../lib/today'
import type { ItemCounts, TodayStats } from '../net/protocol'
import type { NetStatus } from '../net/WsNetClient'

export type Phase = 'entry' | 'playing'

const BASKET_KEY = 'sumbi.basket'
const PREPPED_KEY = 'sumbi.prepped'

function loadBasket(key = BASKET_KEY): ItemCounts {
  try {
    const raw = localStorage.getItem(key)
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
  /** 바다 속에서 꾸미기 메뉴를 연 상태 (이동·잠수 입력 막음) */
  customizing: boolean
  /** 서버 연결 상태 (offline = 혼자 하는 바다) */
  netStatus: NetStatus
  /** 전체 상한 초과로 대기 중이면 앞사람 수·예상 대기(초), 아니면 null. 기다리는 동안은 혼자 하는 바다 */
  queue: { ahead: number; eta: number | null } | null
  /** 자리가 났어요: 이 시각(Date.now 기준)까지 들어가기를 누르면 입장 */
  slotUntil: number | null
  basket: ItemCounts
  /** 오늘 불턱에서 손질한 개수 (망사리에서 빠지지 않고 따로 셈) */
  prepped: ItemCounts
  today: TodayStats | null
  /** 카메라가 물속인지 (안개·소리·화면 효과 전환용) */
  cameraUnderwater: boolean
  /** 내 해녀가 잠수 중인지 (행동 바 표시용) */
  diving: boolean

  setPhase: (p: Phase) => void
  setSelf: (id: number) => void
  setCustomizing: (v: boolean) => void
  setNetStatus: (s: NetStatus) => void
  setQueue: (q: { ahead: number; eta: number | null } | null) => void
  setSlotUntil: (t: number | null) => void
  setToday: (t: TodayStats) => void
  addToBasket: (item: ItemType) => void
  addPrepped: (item: ItemType) => void
  setCameraUnderwater: (v: boolean) => void
  setDiving: (v: boolean) => void
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'entry',
  selfId: null,
  customizing: false,
  netStatus: 'connecting',
  queue: null,
  slotUntil: null,
  basket: loadBasket(),
  prepped: loadBasket(PREPPED_KEY),
  today: null,
  cameraUnderwater: false,
  diving: false,

  setPhase: (phase) => set({ phase }),
  setSelf: (selfId) => set({ selfId }),
  setCustomizing: (customizing) => set({ customizing }),
  setNetStatus: (netStatus) => {
    if (get().netStatus !== netStatus) set({ netStatus })
  },
  setQueue: (queue) => set({ queue }),
  setSlotUntil: (slotUntil) => set({ slotUntil }),
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
  addPrepped: (item) => {
    const prepped = { ...get().prepped, [item]: get().prepped[item] + 1 }
    set({ prepped })
    try {
      localStorage.setItem(PREPPED_KEY, JSON.stringify({ date: kstDateKey(), items: prepped }))
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
