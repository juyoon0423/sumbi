import { Vector3 } from 'three'
import { createPose } from '../haenyeo/types'

// 매 프레임 바뀌는 값은 React 상태가 아니라 이 객체에 둔다 (리렌더 없음).

export const player = {
  pos: new Vector3(0, 0, 8),
  /** 바라보는 방향. 0이면 +z(먼바다), π이면 -z(해안·한라산) */
  yaw: Math.PI,
  pose: createPose(),
  /** 남은 숨 0~1 */
  breath: 1,
  diveStartedAt: 0,
  /** 숨이 다 차서 자동 상승했으면, Space를 한 번 떼야 다시 잠수 */
  diveLock: false,
  forcedAscend: false,
  harvestItemId: -1,
  tewak: { pos: new Vector3(0, 0, 7.5), attached: true },
}

/** 카메라 리그 상태 (이동 방향 계산에 필요) */
export const cameraRig = {
  /** 카메라가 타깃을 바라보는 수평 각도. 카메라 위치 = 타깃 + (sin, cos) * 거리 */
  yaw: 0,
  pitch: 0.42,
  distance: 5.2,
  lastDragAt: -Infinity,
}

/** 이펙트 요청 큐 (LocalPlayer → 이펙트 컴포넌트) */
export const fx = {
  bubbles: [] as Vector3[],
  splashes: [] as Vector3[],
}
