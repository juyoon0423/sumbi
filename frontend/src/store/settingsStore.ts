import { create } from 'zustand'

export type Channel = 'waves' | 'sumbi' | 'sfx'
export type Volumes = Record<Channel, number>

const KEY = 'sumbi.volumes'
const DEFAULTS: Volumes = { waves: 0.7, sumbi: 0.8, sfx: 0.7 }

function load(): Volumes {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Volumes>) }
  } catch {
    /* 무시 */
  }
  return DEFAULTS
}

interface SettingsState {
  volumes: Volumes
  setVolume: (ch: Channel, v: number) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  volumes: load(),
  setVolume: (ch, v) => {
    const volumes = { ...get().volumes, [ch]: v }
    set({ volumes })
    try {
      localStorage.setItem(KEY, JSON.stringify(volumes))
    } catch {
      /* 무시 */
    }
  },
}))
