import { create } from 'zustand'

// 둥둥(물 위에 누워 하늘 보기) 화면 상태

interface FloatState {
  /** 지금 누워 있음 */
  active: boolean
  /** 한동안 손대지 않아 화면 UI 를 숨김 (하늘만) */
  calm: boolean
  /** 화면에 잠깐 띄우는 한 줄 ("별똥별이 떨어졌어요") */
  note: { id: number; text: string } | null
  setActive: (on: boolean) => void
  setCalm: (on: boolean) => void
  showNote: (text: string) => void
}

let noteId = 0

export const useFloat = create<FloatState>((set) => ({
  active: false,
  calm: false,
  note: null,
  setActive: (active) => set(active ? { active } : { active, calm: false }),
  setCalm: (calm) => set({ calm }),
  showNote: (text) => {
    const id = ++noteId
    set({ note: { id, text } })
    window.setTimeout(() => {
      if (useFloat.getState().note?.id === id) set({ note: null })
    }, 4200)
  },
}))
