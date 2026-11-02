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
  levelOffHeight: 1.3, // 바닥에서 이 높이 안쪽이면 머리-아래 하강 → 엎드린 개구리헤엄

  // 동작 시간(초)
  enterDuration: 0.7,
  enterCrouch: 0.22, // 입수 전 웅크리는 준비 동작
  sumbiMinDive: 3, // 이 시간 이상 잠수했다가 떠오르면 숨비소리
  sumbiDuration: 2.1,
  sumbiPuff: 1.15, // 볼 빵빵 "호오이~" 구간, 이후 후련한 표정
  harvestDuration: 1.35,
  harvestReach: 0.3, // 손 뻗기 → 들어 보이기 시작
  harvestShowEnd: 0.95, // 보여주기 끝 → 망사리에 넣기
  waveDuration: 1.3,

  // 채집
  harvestRadius: 1.0,
  seafoodCount: 48,
  respawnMin: 25,
  respawnMax: 45,

  // 활동 범위 (수평 원)
  playCenter: [0, 8] as const,
  playRadius: 55,

  // 캐릭터가 수면에 떠 있을 때 몸 중심이 수면보다 얼마나 아래인지
  surfaceSink: -0.06,
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
