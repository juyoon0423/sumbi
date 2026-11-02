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
}

export function createPose(): HaenyeoPose {
  return { state: 'surfaceIdle', stateTime: 0, move: 0, waveTime: -1, breath: 1, heldItem: null }
}

export function setState(pose: HaenyeoPose, next: HaenyeoState) {
  if (pose.state === next) return
  pose.state = next
  pose.stateTime = 0
}
