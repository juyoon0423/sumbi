import { CONFIG, type ItemType } from '../config'
import type { HaenyeoPose, SitAct } from './types'

// 불턱 동작(손질·귤·졸기)·만세·숨 고르기 시간 진행. 내 해녀와 다른 해녀가 같이 쓴다.

/** 한 프레임 동안 일어난 순간 (소리·대야로 던지기) */
export type ActEvent = 'tap' | 'pop' | 'crack' | 'toss' | 'munch'

/** 소라 두드리는 순간들, 귤 먹는 순간들 */
const TAPS = [0.23, 0.68, 1.14, 1.59]
const MUNCH = [1.85, 2.6, 3.3]

export function startAct(pose: HaenyeoPose, act: SitAct, item: ItemType | null = null) {
  pose.act = act
  pose.actTime = 0
  pose.actItem = item
}

/** "앗" 반응 길이 (초) */
export const OOPS_DURATION = 1.1

const crossed = (prev: number, now: number, at: number) => prev < at && now >= at

/** 시간 진행 + 이번 프레임에 일어난 순간들 */
export function advanceActs(pose: HaenyeoPose, dt: number): ActEvent[] {
  const out: ActEvent[] = []
  if (pose.celebrateTime >= 0) {
    pose.celebrateTime += dt
    if (pose.celebrateTime > CONFIG.celebrateDuration) pose.celebrateTime = -1
  }
  if (pose.breatheTime >= 0) pose.breatheTime += dt
  if (pose.oopsTime >= 0) {
    pose.oopsTime += dt
    if (pose.oopsTime > OOPS_DURATION) pose.oopsTime = -1
  }
  if (!pose.act) return out
  const prev = pose.actTime
  pose.actTime += dt
  const now = pose.actTime
  switch (pose.act) {
    case 'prep':
      if (pose.actItem === 'conch') for (const at of TAPS) if (crossed(prev, now, at)) out.push('tap')
      if (pose.actItem === 'abalone' && crossed(prev, now, 1.3)) out.push('pop')
      if (pose.actItem === 'urchin' && crossed(prev, now, 0.6)) out.push('crack')
      if (crossed(prev, now, CONFIG.prepToss)) out.push('toss')
      if (now > CONFIG.prepDuration) pose.act = null
      break
    case 'tangerine':
      for (const at of MUNCH) if (crossed(prev, now, at)) out.push('munch')
      if (now > CONFIG.tangerineDuration) pose.act = null
      break
    case 'doze':
      break
  }
  return out
}
