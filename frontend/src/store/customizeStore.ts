import { create } from 'zustand'
import {
  CHEEK_PALETTE,
  NICK_ADJECTIVES,
  NICK_NOUNS,
  randomCustomization,
  reroll,
  sanitizeCustomization,
  TEWAK_PALETTE,
  TOWEL_PALETTE,
  type Customization,
} from '../haenyeo/customize'
import { player } from '../player/runtime'

// 내 해녀 꾸미기. 처음엔 전부 랜덤으로 정해져 있어서 바로 입장할 수 있고,
// 고른 값은 브라우저에 저장되어 다음 방문 때 그대로 쓴다.

const KEY = 'sumbi.custom'
const OLD_NICK_KEY = 'sumbi.nickname' // 1~2단계에서 쓰던 닉네임 저장

function load(): { custom: Customization; returning: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { custom: sanitizeCustomization(JSON.parse(raw)), returning: true }
    // 예전에 저장된 닉네임이 있으면 이어서 씀
    const old = localStorage.getItem(OLD_NICK_KEY)
    if (old) {
      const [adj, noun] = old.split(' ')
      return { custom: sanitizeCustomization({ ...randomCustomization(), adj, noun }), returning: false }
    }
  } catch {
    /* 저장소를 못 쓰면 매번 랜덤 */
  }
  return { custom: randomCustomization(), returning: false }
}

function save(custom: Customization) {
  try {
    localStorage.setItem(KEY, JSON.stringify(custom))
  } catch {
    /* 무시 */
  }
}

/** 바꿀 때마다 해녀가 살짝 기뻐하는 반응 */
function cheer() {
  player.pose.cheerTime = 0
}

interface CustomizeState {
  custom: Customization
  /** 전에 저장한 해녀로 들어온 사람인지 (입장 화면을 짧게 보여줌) */
  returning: boolean
  set: (patch: Partial<Customization>) => void
  rerollAdj: () => void
  rerollNoun: () => void
  randomizeAll: () => void
  /** 입장할 때 지금 모습을 저장 */
  commit: () => void
  /** 서버가 고쳐 준 값 받아들이기 (반응 없이) */
  adopt: (c: Customization) => void
}

const initial = load()

export const useCustomize = create<CustomizeState>((setState, get) => {
  const update = (patch: Partial<Customization>) => {
    const custom = { ...get().custom, ...patch }
    setState({ custom })
    save(custom)
    cheer()
  }
  return {
    custom: initial.custom,
    returning: initial.returning,
    set: update,
    rerollAdj: () => update({ adj: reroll(NICK_ADJECTIVES, get().custom.adj) }),
    rerollNoun: () => update({ noun: reroll(NICK_NOUNS, get().custom.noun) }),
    randomizeAll: () => {
      const c = get().custom
      update({
        towel: reroll(TOWEL_PALETTE.map((s) => s.id), c.towel),
        tewak: reroll(TEWAK_PALETTE.map((s) => s.id), c.tewak),
        cheek: reroll(CHEEK_PALETTE.map((s) => s.id), c.cheek),
        adj: reroll(NICK_ADJECTIVES, c.adj),
        noun: reroll(NICK_NOUNS, c.noun),
      })
    },
    commit: () => save(get().custom),
    adopt: (custom) => {
      setState({ custom })
      save(custom)
    },
  }
})
