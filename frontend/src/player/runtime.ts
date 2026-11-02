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
  /** rest: 불턱에서 바닥에 내려놓음 (파도에 기울지 않음) */
  tewak: { pos: new Vector3(0, 0, 7.5), attached: true, rest: false },
  /** sea | bulteok */
  zone: 'sea' as 'sea' | 'bulteok',
  /** 불턱 자리 (바다면 -1) */
  seat: -1,
}

/** 카메라 리그 상태 (이동 방향 계산에 필요) */
export const cameraRig = {
  /** 카메라가 타깃을 바라보는 수평 각도. 카메라 위치 = 타깃 + (sin, cos) * 거리 */
  yaw: 0,
  pitch: 0.42,
  distance: 5.2,
  lastDragAt: -Infinity,
  /** 다음 프레임에 카메라를 보간 없이 바로 옮김 (구역 이동) */
  snap: false,
}

/** 이펙트 요청 큐 (LocalPlayer → 이펙트 컴포넌트) */
export const fx = {
  bubbles: [] as Vector3[],
  /** 수면 물보라. power 1 = 보통, 클수록 물방울이 많고 높이 튐 */
  splashes: [] as { pos: Vector3; power: number }[],
}

/**
 * 꾸미기(입장 화면·바다 속 꾸미기 메뉴) 동안 해녀를 크게 보여줄 화면 영역 (CSS px).
 * 꾸미기 패널이 차지하지 않은 빈 곳의 가운데에 해녀가 오도록 카메라가 맞춘다.
 */
export const showcaseView = { x: 0, y: 0, w: 0, h: 0 }
