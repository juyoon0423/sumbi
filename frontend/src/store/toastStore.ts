import { create } from 'zustand'

// 50명이 동시에 행동해도 화면이 시끄럽지 않도록:
// 최대 3개 표시, 새 토스트는 최소 1.2초 간격, 대기열이 넘치면 오래된 것부터 버림, 같은 문구는 합침

export interface Toast {
  id: number
  text: string
}

const MAX_VISIBLE = 3
const MAX_PENDING = 4
const SHOW_MS = 3800
const GAP_MS = 1200

interface ToastState {
  visible: Toast[]
  push: (text: string) => void
}

let nextId = 1
let pending: string[] = []
let lastShownAt = 0
let pumpTimer: number | undefined

export const useToasts = create<ToastState>((set, get) => {
  const show = (text: string) => {
    const toast = { id: nextId++, text }
    set({ visible: [...get().visible, toast].slice(-MAX_VISIBLE) })
    lastShownAt = Date.now()
    window.setTimeout(() => {
      set({ visible: get().visible.filter((t) => t.id !== toast.id) })
    }, SHOW_MS)
  }

  const pump = () => {
    pumpTimer = undefined
    if (pending.length === 0) return
    const wait = lastShownAt + GAP_MS - Date.now()
    if (wait > 0) {
      pumpTimer = window.setTimeout(pump, wait)
      return
    }
    show(pending.shift()!)
    if (pending.length > 0) pumpTimer = window.setTimeout(pump, GAP_MS)
  }

  return {
    visible: [],
    push: (text) => {
      if (get().visible.some((t) => t.text === text) || pending.includes(text)) return
      pending.push(text)
      if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING)
      if (pumpTimer === undefined) pump()
    },
  }
})
