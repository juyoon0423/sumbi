import { create } from 'zustand'
import type { ItemCounts, Zone } from '../net/protocol'

// 불턱 화면 상태: 지금 구역, 공동 대야, 손질할 수 있는 개수(서버 값), 구역 이동 중 페이드

export interface BasinState {
  fill: number
  capacity: number
  round: number
  full: boolean
}

interface BulteokState {
  zone: Zone
  /** 바다 ↔ 불턱 이동 중(화면 페이드)이면 가는 곳 */
  traveling: Zone | null
  basin: BasinState
  /** 서버가 알려 준 "앞으로 손질할 수 있는 개수" (오프라인이면 null → 내 망사리로 계산) */
  serverLeft: ItemCounts | null
  /** 내 손질·귤 까먹기가 끝나는 시각 (performance.now ms) */
  busyUntil: number
  dozing: boolean

  setZone: (z: Zone) => void
  setTraveling: (z: Zone | null) => void
  setBasin: (b: BasinState) => void
  setServerLeft: (l: ItemCounts | null) => void
  setLeftOne: (item: keyof ItemCounts, n: number) => void
  setBusyUntil: (ms: number) => void
  setDozing: (v: boolean) => void
}

export const useBulteok = create<BulteokState>((set, get) => ({
  zone: 'sea',
  traveling: null,
  basin: { fill: 0, capacity: 20, round: 1, full: false },
  serverLeft: null,
  busyUntil: 0,
  dozing: false,

  setZone: (zone) => set({ zone }),
  setTraveling: (traveling) => set({ traveling }),
  setBasin: (basin) => set({ basin }),
  setServerLeft: (serverLeft) => set({ serverLeft }),
  setLeftOne: (item, n) => {
    const l = get().serverLeft
    if (l) set({ serverLeft: { ...l, [item]: n } })
  },
  setBusyUntil: (busyUntil) => set({ busyUntil }),
  setDozing: (dozing) => set({ dozing }),
}))
