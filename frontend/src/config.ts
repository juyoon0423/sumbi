// 게임 전반에서 쓰는 조절 가능한 상수

export const CONFIG = {
  // 숨
  breathMax: 30, // 잠수 가능한 최대 시간(초)
  breathRecoverTime: 3, // 수면에서 0 → 가득까지 걸리는 시간(초)
  lowBreath: 0.2, // 이 비율 이하이면 경고 연출

  // 이동 (m/s)
  surfaceSpeed: 2.4,
  underwaterSpeed: 2.1,
  diveSpeed: 1.7,
  ascendSpeed: 2.1,

  // 동작 시간(초)
  enterDuration: 0.55,
  sumbiMinDive: 3, // 이 시간 이상 잠수했다가 떠오르면 숨비소리
  sumbiDuration: 1.7,
  harvestDuration: 0.75,
  waveDuration: 1.6,

  // 채집
  harvestRadius: 1.0,
  seafoodCount: 48,
  respawnMin: 25,
  respawnMax: 45,

  // 활동 범위 (수평 원)
  playCenter: [0, 8] as const,
  playRadius: 55,

  // 캐릭터가 수면에 떠 있을 때 몸 중심이 수면보다 얼마나 아래인지
  surfaceSink: 0.1,
  // 바닥 위로 최소 이만큼 떨어져 있음
  floorClearance: 0.5,

  // 네트워크
  moveSendHz: 10,
} as const

export type ItemType = 'conch' | 'abalone' | 'urchin'

export const ITEM_LABEL: Record<ItemType, string> = {
  conch: '소라',
  abalone: '전복',
  urchin: '성게',
}

/** 받침 조사 판정: 소라를 / 전복을 / 성게를 */
export function withObjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}를`
  return code % 28 === 0 ? `${word}를` : `${word}을`
}
