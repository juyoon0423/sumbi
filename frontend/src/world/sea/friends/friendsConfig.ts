import type { QualityLevel } from '../../../lib/quality'

// 바다 친구들 수: 품질 단계에 따라 (저사양 휴대폰은 적게). 물고기 떼는 인스턴싱이라 수가 늘어도 그리기 호출은 그대로.

export interface FriendCounts {
  /** 자리돔 떼 수 × 떼마다 마리 수 */
  schools: number
  damsel: number
  /** 잠수하면 잠깐 따라오는 작은 물고기 (최대) */
  followers: number
  squid: number
  octopus: number
  crabs: number
  hermits: number
  starfish: number
  jelly: number
}

export const FRIENDS: Record<QualityLevel, FriendCounts> = {
  high: { schools: 3, damsel: 36, followers: 5, squid: 3, octopus: 3, crabs: 6, hermits: 4, starfish: 22, jelly: 6 },
  medium: { schools: 3, damsel: 24, followers: 4, squid: 2, octopus: 3, crabs: 5, hermits: 3, starfish: 16, jelly: 5 },
  low: { schools: 2, damsel: 14, followers: 3, squid: 1, octopus: 2, crabs: 3, hermits: 2, starfish: 10, jelly: 3 },
}

/** 이보다 멀면 움직임 계산을 쉬고 감춤 (물속 안개 26m 바깥은 어차피 안 보임) */
export const FAR = 30
