import { create } from 'zustand'
import type { ItemType } from '../config'
import type { ItemCounts } from '../net/protocol'
import { useRemotes } from '../net/remotes'
import { useGame } from './gameStore'

// 이번 물질(바다에 들어와서 나갈 때까지) 기록 → 물질 일지 카드

const zero = (): ItemCounts => ({ conch: 0, abalone: 0, urchin: 0 })

interface SessionState {
  startedAt: number
  sumbi: number
  harvested: ItemCounts
  prepped: ItemCounts
  /** 같은 바다에서 만난 해녀 (번호:닉네임) */
  met: Set<string>
  /** 둥둥(하늘 보기) 한 시간 (ms) */
  floatMs: number
  /** 별똥별을 봤는지 */
  shootingStar: boolean
  /** 바다거북을 만났는지 */
  turtle: boolean
  /** 남방큰돌고래를 봤는지 (그날 처음 봤을 때만 true → 일지) */
  dolphin: boolean
  start: () => void
  addSumbi: () => void
  addHarvest: (item: ItemType) => void
  addPrepped: (item: ItemType) => void
}

export const useSession = create<SessionState>((set, get) => ({
  startedAt: Date.now(),
  sumbi: 0,
  harvested: zero(),
  prepped: zero(),
  met: new Set(),
  floatMs: 0,
  shootingStar: false,
  turtle: false,
  dolphin: false,
  start: () =>
    set({ startedAt: Date.now(), sumbi: 0, harvested: zero(), prepped: zero(), met: new Set(), floatMs: 0, shootingStar: false, turtle: false, dolphin: false }),
  addSumbi: () => set({ sumbi: get().sumbi + 1 }),
  addHarvest: (item) => set({ harvested: { ...get().harvested, [item]: get().harvested[item] + 1 } }),
  addPrepped: (item) => set({ prepped: { ...get().prepped, [item]: get().prepped[item] + 1 } }),
}))

// 바다에 들어올 때마다 새로 시작
useGame.subscribe((s, prev) => {
  if (s.phase === 'playing' && prev.phase !== 'playing') useSession.getState().start()
})

// 같은 바다에 보인 해녀를 셈
useRemotes.subscribe((s) => {
  if (useGame.getState().phase !== 'playing') return
  const met = useSession.getState().met
  for (const r of s.list) met.add(`${r.id}:${r.nick}`)
})
