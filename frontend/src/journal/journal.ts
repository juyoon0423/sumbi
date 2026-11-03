import { nickOf } from '../haenyeo/customize'
import { kstDateKey } from '../lib/today'
import { useCustomize } from '../store/customizeStore'
import { useGame } from '../store/gameStore'
import { useSession } from '../store/sessionStore'
import { env, presetOf } from '../world/time/env'
import { cardBlob, drawCard, type JournalEntry } from './card'
import { shootScene } from './capture'

// 물질 일지: 지금까지의 기록 → 카드 이미지, 브라우저에만 기록 보관

const KEY = 'sumbi.journal'
const MAX = 60

export function currentEntry(now = Date.now()): JournalEntry {
  const s = useSession.getState()
  return {
    at: now,
    startedAt: s.startedAt,
    minutes: Math.floor((now - s.startedAt) / 60000),
    sumbi: s.sumbi,
    harvested: { ...s.harvested },
    prepped: { ...s.prepped },
    met: s.met.size,
    floatMs: Math.round(s.floatMs),
    shootingStar: s.shootingStar,
    turtle: s.turtle,
    dolphin: s.dolphin,
    preset: presetOf(env.hour),
    nick: nickOf(useCustomize.getState().custom),
  }
}

export function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as JournalEntry[]) : []
  } catch {
    return []
  }
}

/** 이번 물질 기록 저장 (같은 물질이면 덮어씀) */
export function saveEntry(e: JournalEntry) {
  try {
    const list = loadJournal().filter((x) => x.startedAt !== e.startedAt)
    list.push(e)
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)))
  } catch {
    /* 저장 못 해도 카드는 보여 줌 */
  }
}

function pageFont() {
  return getComputedStyle(document.body).fontFamily || 'sans-serif'
}

/** 카드 만들기: 장면 사진 + 기록 */
export async function makeCard(entry: JournalEntry) {
  await document.fonts?.ready
  const photo = shootScene(984, 652)
  const card = drawCard(entry, photo, pageFont())
  const blob = await cardBlob(card)
  return { blob, url: URL.createObjectURL(blob) }
}

export function cardFileName(e: JournalEntry) {
  return `sumbi-${kstDateKey(e.at)}.png`
}

/**
 * 이미지 저장: 휴대폰은 공유 시트(사진 앱에 저장), 그 밖에는 파일 내려받기.
 * 'shared' | 'downloaded' | 'cancelled'
 */
export async function saveCardImage(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/png' })
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '숨비 물질 일지' })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      // 공유가 안 되면 내려받기로
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}

// 탭을 닫아도 오늘 기록은 남김 (카드는 없이)
window.addEventListener('pagehide', () => {
  if (useGame.getState().phase !== 'playing') return
  if (Date.now() - useSession.getState().startedAt > 20_000) saveEntry(currentEntry())
})
