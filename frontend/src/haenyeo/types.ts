import type { ItemType } from '../config'

// 해녀 애니메이션 상태 (docs/PLAN.md 4.4 상태 다이어그램)
export type HaenyeoState =
  | 'surfaceIdle'
  | 'surfaceSwim'
  | 'entering'
  | 'descending'
  | 'underIdle'
  | 'underSwim'
  | 'harvesting'
  | 'ascending'
  | 'sumbi'
  | 'sit' // 불턱에 앉아 불 쬐기
  | 'rise' // 자리에서 일어나기
  | 'walk' // 불턱에서 뒤뚱뒤뚱 걷기 (제자리에서 돌기 포함)
  | 'settle' // 털썩 앉기
  | 'stand' // 담 밖에 서서 불 쬐기 (자리가 다 찼을 때)

/** 땅 위(불턱) 자세: 바다 위처럼 둥실거리지 않음 */
export const LAND_STATES: ReadonlySet<HaenyeoState> = new Set(['sit', 'rise', 'walk', 'settle', 'stand'])

export const UNDERWATER_STATES: ReadonlySet<HaenyeoState> = new Set([
  'entering',
  'descending',
  'underIdle',
  'underSwim',
  'harvesting',
  'ascending',
])

/** 해녀 모델이 매 프레임 읽는 포즈 정보 (로컬·원격 공용) */
export interface HaenyeoPose {
  state: HaenyeoState
  /** 현재 상태에 들어온 뒤 지난 시간(초) */
  stateTime: number
  /** 이동 세기 0~1 */
  move: number
  /** 인사 시작 후 지난 시간(초). 인사 중이 아니면 -1 */
  waveTime: number
  /** 남은 숨 0~1 (표정용) */
  breath: number
  /** 채집 중 손에 든 해산물 */
  heldItem: ItemType | null
  /** 꾸미기를 바꿨을 때 기뻐하는 반응 시작 후 지난 시간(초). 없으면 -1 */
  cheerTime: number
  /** 불턱에서 하는 동작 (앉은 자세 위에 겹침) */
  act: SitAct | null
  /** act 시작 후 지난 시간(초) */
  actTime: number
  /** 손질하는 해산물 */
  actItem: ItemType | null
  /** 숨 고르기 시작 후 지난 시간(초). 안 하면 -1 */
  breatheTime: number
  /** 대야가 가득 차서 만세 시작 후 지난 시간(초). 없으면 -1 */
  celebrateTime: number
  /** 원하는 자리를 다른 사람이 먼저 잡음: "앗" 반응 시작 후 지난 시간(초). 없으면 -1 */
  oopsTime: number
  /** "앗" 하며 돌아보는 쪽 (몸 기준 각도) */
  oopsYaw: number
}

export type SitAct = 'prep' | 'tangerine' | 'doze'

export function createPose(): HaenyeoPose {
  return {
    state: 'surfaceIdle', stateTime: 0, move: 0, waveTime: -1, breath: 1, heldItem: null, cheerTime: -1,
    act: null, actTime: 0, actItem: null, breatheTime: -1, celebrateTime: -1, oopsTime: -1, oopsYaw: 0,
  }
}

/** 숨 고르기 한 번(들이쉬기+내쉬기)에서 지금 몸이 부푼 정도 0~1 */
export function breatheAmount(time: number, inhale: number, exhale: number) {
  const c = time % (inhale + exhale)
  const e = (x: number) => x * x * (3 - 2 * x)
  return c < inhale ? e(c / inhale) : 1 - e((c - inhale) / exhale)
}

export function setState(pose: HaenyeoPose, next: HaenyeoState) {
  if (pose.state === next) return
  pose.state = next
  pose.stateTime = 0
}
