import {
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 해녀 한 명을 이루는 도형들. 모든 해녀가 공유한다 (50명이어도 지오메트리는 이 한 벌).
// 단위: m. 원점 = 몸 중심, 앞 = +z.

/** 머리: 살짝 가로로 넓고 위아래로 눌린 찹쌀떡 */
export const HEAD_R = 0.33
export const HEAD_SCALE = [1.1, 0.92, 1.0] as const
export const HEAD_Y = 0.4

/** 머리 타원체 표면의 z 좌표 (얼굴 부품을 표면에 붙이기 위함) */
export function headSurfaceZ(x: number, y: number) {
  const rx = HEAD_R * HEAD_SCALE[0]
  const ry = HEAD_R * HEAD_SCALE[1]
  const rz = HEAD_R * HEAD_SCALE[2]
  return rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2))
}

/** 몸통: 아래가 넓은 통통한 종 모양 (회전체) */
function bodyGeometry() {
  const pts: Vector2[] = []
  const bottom = -0.3
  const top = 0.17
  const n = 18
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const y = bottom + (top - bottom) * t
    // 아래는 둥글게 막고, 배는 통통하게, 목은 좁게
    const base = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.55
    const belly = 0.235 - 0.07 * t * t
    pts.push(new Vector2(Math.max(0.001, base * belly), y))
  }
  pts[0].x = 0.001
  pts[n].x = 0.001
  const g = new LatheGeometry(pts, 28)
  g.computeVertexNormals()
  return g
}

/** 오리발: 둥근 물방울 + 납작 */
function finGeometry() {
  const g = new SphereGeometry(0.09, 16, 10)
  g.scale(0.85, 0.28, 1.5)
  g.translate(0, 0, 0.05)
  return g
}

/** 땀방울 */
function sweatGeometry() {
  const drop = new SphereGeometry(0.026, 12, 10).toNonIndexed()
  const tip = new ConeGeometry(0.0225, 0.05, 12, 1, true)
  tip.translate(0, 0.03, 0)
  return mergeGeometries([drop, tip.toNonIndexed()])
}

/** 위가 볼록한 호 (^ 모양 웃는 눈 / 웃는 입) */
function arc(radius: number, tube: number, flip: boolean) {
  const g = new TorusGeometry(radius, tube, 6, 14, Math.PI)
  if (flip) g.rotateZ(Math.PI) // ∪ 모양
  return g
}

export const GEO = {
  head: (() => {
    const g = new SphereGeometry(HEAD_R, 36, 28)
    g.scale(...HEAD_SCALE)
    return g
  })(),
  towel: (() => {
    // 물수건: 머리 윗부분을 덮는 캡
    const g = new SphereGeometry(HEAD_R + 0.016, 36, 16, 0, Math.PI * 2, 0, 1.08)
    g.scale(...HEAD_SCALE)
    return g
  })(),
  knot: new SphereGeometry(0.075, 14, 10),
  /** 물수건 가장자리의 말린 단 */
  towelRim: new TorusGeometry(HEAD_R * Math.sin(1.08) + 0.01, 0.024, 8, 48),
  body: bodyGeometry(),
  collar: new TorusGeometry(0.1, 0.03, 8, 24),
  arm: new CapsuleGeometry(0.066, 0.07, 6, 12),
  hand: new SphereGeometry(0.072, 14, 12),
  leg: new CapsuleGeometry(0.078, 0.03, 6, 12),
  fin: finGeometry(),
  // 얼굴
  eyeDot: new SphereGeometry(0.029, 14, 12),
  eyeHappy: arc(0.026, 0.0085, false), // ^ ^
  eyeLine: new CapsuleGeometry(0.008, 0.036, 4, 8).rotateZ(Math.PI / 2), // ㅡ ㅡ
  cheek: new SphereGeometry(0.056, 16, 12),
  mouthDot: new SphereGeometry(0.014, 10, 8),
  mouthO: new TorusGeometry(0.022, 0.0085, 8, 18),
  mouthSmile: arc(0.02, 0.007, true),
  sweat: sweatGeometry(),
  // 물안경
  goggleRim: new TorusGeometry(0.066, 0.016, 10, 24),
  goggleGlass: new CircleGeometry(0.064, 22),
  goggleBridge: new CapsuleGeometry(0.012, 0.05, 4, 8).rotateZ(Math.PI / 2),
}
