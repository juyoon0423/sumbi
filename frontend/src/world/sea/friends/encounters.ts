import { audio } from '../../../audio/AudioEngine'
import { kstDateKey } from '../../../lib/today'
import { useBubbles } from '../../../store/bubbleStore'
import { useGame } from '../../../store/gameStore'
import { useSession } from '../../../store/sessionStore'

// 드문 만남 기록: 바다거북(내 화면에서만), 남방큰돌고래(같은 바다 모두) → 머리 위 "!" · 물질 일지

const DOLPHIN_DAY_KEY = 'sumbi.dolphinDay'

/** 바다거북 가까이: 머리 위 "!" + 일지 (이번 물질에 한 번) */
export function noteTurtle() {
  if (useGame.getState().phase !== 'playing') return
  useBubbles.getState().sayself('!', 1600)
  audio.playChime()
  useSession.setState({ turtle: true })
}

/** 돌고래가 지나감: 일지에는 그날 처음 봤을 때만 */
export function noteDolphins() {
  if (useGame.getState().phase !== 'playing' || useSession.getState().dolphin) return
  const today = kstDateKey()
  try {
    if (localStorage.getItem(DOLPHIN_DAY_KEY) === today) return
    localStorage.setItem(DOLPHIN_DAY_KEY, today)
  } catch {
    /* 저장소가 없으면 이번 물질 기준 */
  }
  useSession.setState({ dolphin: true })
}
