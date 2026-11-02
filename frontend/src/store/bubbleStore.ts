import { create } from 'zustand'

// 캐릭터 머리 위 말풍선 ("호오이~", "전복을 땄어요"). 레퍼런스 산사의 "합장으로 인사했어요" 방식.
// 3단계에서 원격 플레이어별로 확장한다 (지금은 내 것만).

interface BubbleState {
  self: { id: number; text: string } | null
  sayself: (text: string, ms?: number) => void
}

let nextId = 1

export const useBubbles = create<BubbleState>((set, get) => ({
  self: null,
  sayself: (text, ms = 2200) => {
    const id = nextId++
    set({ self: { id, text } })
    window.setTimeout(() => {
      if (get().self?.id === id) set({ self: null })
    }, ms)
  },
}))
