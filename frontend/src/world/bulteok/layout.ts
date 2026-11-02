import { shoreZ, terrainY } from '../terrain'

// 불턱 배치: 해안 위 둥근 돌담(지름 약 8.4m), 입구는 바다 쪽(+z), 가운데 모닥불, 모닥불 앞에 공동 대야.
// 자리 번호는 서버(Room.freeSeat)가 정함: 0~11 안쪽 원, 12~23 바깥 원, 그 뒤는 담 밖.

const CX = 16
const CZ = shoreZ(CX) - 9

/** 바닥 높이: 돌담 안을 평평하게 (지형 중 가장 높은 곳에 맞춤) */
function floorHeight() {
  let max = -Infinity
  for (let x = -5; x <= 5; x += 0.5) {
    for (let z = -5; z <= 5; z += 0.5) {
      if (x * x + z * z <= 26) max = Math.max(max, terrainY(CX + x, CZ + z))
    }
  }
  return max + 0.02
}

export const BULTEOK = {
  x: CX,
  z: CZ,
  y: floorHeight(),
  wallRadius: 4.2,
  /** 입구 방향 (각도: x = cos, z = sin) → 바다 쪽 */
  entrance: Math.PI / 2,
  /** 공동 대야: 모닥불에서 입구 쪽으로 */
  basin: { x: CX, z: CZ + 1.32 },
  /** 앉는 돌 높이 */
  seatHeight: 0.13,
} as const

export interface SeatPose {
  x: number
  /** 몸 중심 높이 */
  y: number
  z: number
  /** 모닥불을 바라보는 방향 */
  yaw: number
  /** 앉은 돌 위치 */
  stoneY: number
}

/** 몸 중심이 앉은 돌 위로 이만큼 */
const SIT_BODY = 0.31

export function seatPose(seat: number): SeatPose {
  let r: number
  let a: number
  if (seat < 12) {
    r = 2.05
    a = (seat / 12) * Math.PI * 2 + Math.PI / 12 + BULTEOK.entrance
  } else if (seat < 24) {
    r = 3.15
    a = ((seat - 12) / 12) * Math.PI * 2 + BULTEOK.entrance
  } else {
    // 담 밖: 입구 반대편부터 둘러섬
    const k = seat - 24
    r = 5.0 + Math.floor(k / 20) * 0.8
    a = ((k % 20) / 20) * Math.PI * 2 + BULTEOK.entrance + Math.PI / 20
  }
  const x = BULTEOK.x + Math.cos(a) * r
  const z = BULTEOK.z + Math.sin(a) * r
  const stoneY = BULTEOK.y + (seat < 24 ? 0 : terrainY(x, z) - BULTEOK.y)
  return {
    x,
    z,
    stoneY,
    y: stoneY + BULTEOK.seatHeight + SIT_BODY,
    yaw: Math.atan2(BULTEOK.x - x, BULTEOK.z - z),
  }
}

/** 앉은 해녀 오른쪽 옆에 내려놓은 테왁 자리 */
export function restingTewak(seat: number) {
  const s = seatPose(seat)
  // 오른쪽 = (cos yaw, -sin yaw) 의 반대 (해녀 앞 = +z 로컬)
  const rx = -Math.cos(s.yaw)
  const rz = Math.sin(s.yaw)
  return { x: s.x + rx * 0.5, y: s.stoneY + 0.17, z: s.z + rz * 0.5 }
}

/** 불턱에서 바다로 돌아갈 때 서버가 정해 주는 자리 근처 (오프라인용) */
export function seaReturn(id: number): [number, number, number] {
  return [16 + (((id * 37) % 7) - 3) * 0.9, 0, -24 + (((id * 13) % 5) - 2) * 0.9]
}

/** 다음 대야 크기 (서버 Room.tickBasin 과 같게) */
export function nextBasinCapacity(peopleInBulteok: number) {
  return Math.max(12, Math.min(40, peopleInBulteok * 4))
}
