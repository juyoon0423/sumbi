import { create } from 'zustand'
import type { JournalEntry } from '../journal/card'

// 물질 일지 카드 창
interface JournalState {
  open: boolean
  entry: JournalEntry | null
  blob: Blob | null
  url: string | null
  show: (entry: JournalEntry) => void
  setCard: (blob: Blob, url: string) => void
  close: () => void
}

export const useJournal = create<JournalState>((set, get) => ({
  open: false,
  entry: null,
  blob: null,
  url: null,
  show: (entry) => set({ open: true, entry, blob: null, url: null }),
  setCard: (blob, url) => set({ blob, url }),
  close: () => {
    const url = get().url
    if (url) URL.revokeObjectURL(url)
    set({ open: false, entry: null, blob: null, url: null })
  },
}))
