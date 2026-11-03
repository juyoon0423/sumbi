import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three'
import { counterShade, fin, merge, paint } from './shapes'

// 바다 친구들 모양. 모두 앞쪽이 +z, 위쪽이 +y. 크기는 실제 m 기준(해녀 키 약 1m)으로 조금 귀엽게.
// 색은 실제 제주 바다 생물에 가깝게, 형태는 단순하게.

const sphere = (r: number, w = 10, h = 8) => new SphereGeometry(r, w, h)

function at(g: BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  g.scale(sx, sy, sz)
  g.translate(x, y, z)
  return g
}

/** 동글동글 눈 (흰자 + 까만 눈동자), 옆을 봄 */
function eyes(x: number, y: number, z: number, r: number, outward = 1): BufferGeometry[] {
  const out: BufferGeometry[] = []
  for (const s of [-1, 1]) {
    out.push(paint(at(sphere(r, 8, 6), s * x, y, z), '#f4f6f2'))
    out.push(paint(at(sphere(r * 0.62, 8, 6), s * (x + r * 0.5 * outward), y + r * 0.08, z + r * 0.35), '#15181c'))
  }
  return out
}

/** 위치로 만든 작은 얼룩 (해시) */
function speckle(base: ColorRepresentation, spot: ColorRepresentation, density: number, scale: number) {
  const a = new Color(base)
  const b = new Color(spot)
  return (x: number, y: number, z: number) => {
    const h = Math.sin(x * 127.1 * scale + y * 311.7 * scale + z * 74.7 * scale) * 43758.5453
    return h - Math.floor(h) < density ? b.getHex() : a.getHex()
  }
}

// ── 물고기 (인스턴싱: 꼬리 흔들기는 셰이더에서) ──

/** 자리돔: 몸이 높고 짙은 청회색, 등 뒤쪽에 흰 점 하나 (길이 약 0.2m) */
export function damselGeometry() {
  const body = paint(at(sphere(1, 12, 9), 0, 0, 0, 0.045, 0.072, 0.1), counterShade('#36465c', '#7d8c9c', -0.06, 0.05))
  const spot = paint(at(sphere(0.016, 6, 5), 0, 0.05, -0.055, 1.6, 0.7, 1), '#eef3f6')
  const tail = fin([[0, 0, -0.085], [0, 0.058, -0.17], [0, 0.012, -0.138], [0, -0.012, -0.138], [0, -0.058, -0.17]], '#2c394b')
  const dorsal = fin([[0, 0.06, 0.04], [0, 0.1, 0.0], [0, 0.09, -0.06], [0, 0.055, -0.08]], '#33435a')
  const anal = fin([[0, -0.055, -0.02], [0, -0.085, -0.07], [0, -0.05, -0.08]], '#33435a')
  return merge([body, spot, tail, dorsal, anal, ...eyes(0.033, 0.018, 0.062, 0.015)])
}

/** 잠깐 따라오는 작은 물고기: 노란빛 (길이 약 0.14m) */
export function followerGeometry() {
  const body = paint(at(sphere(1, 10, 8), 0, 0, 0, 0.03, 0.04, 0.07), counterShade('#e49b2f', '#fde58f', -0.035, 0.035))
  const stripe = paint(at(sphere(1, 8, 6), 0, 0.005, 0.0, 0.032, 0.041, 0.012), '#3d6fb0')
  const tail = fin([[0, 0, -0.06], [0, 0.04, -0.115], [0, 0, -0.095], [0, -0.04, -0.115]], '#f0b13d')
  return merge([body, stripe, tail, ...eyes(0.022, 0.012, 0.042, 0.011)])
}

// ── 한치 (오징어) ──

/** 몸통(외투) + 지느러미 + 머리·눈. 앞(+z)이 지느러미 쪽 (꼬리 쪽으로 쭉 나아감) */
export function squidBodyGeometry() {
  const skin = speckle('#f2d6cb', '#c9675a', 0.16, 1.4)
  const mantle = paint(at(new ConeGeometry(0.062, 0.4, 12, 1).rotateX(Math.PI / 2), 0, 0, 0.2), skin)
  const round = paint(at(sphere(0.062, 12, 8), 0, 0, 0, 1, 1, 0.7), skin)
  const finL = fin([[0.02, 0, 0.26], [0.13, 0, 0.36], [0.02, 0, 0.42]], '#ecc6ba')
  const finR = fin([[-0.02, 0, 0.26], [-0.13, 0, 0.36], [-0.02, 0, 0.42]], '#ecc6ba')
  const head = paint(at(sphere(0.048, 10, 8), 0, 0, -0.06, 1, 0.9, 1.1), '#f0cfc3')
  return merge([mantle, round, finL, finR, head, ...eyes(0.045, 0.008, -0.055, 0.024)])
}

/** 다리 하나 (뒤로 뻗음, -z). long = 긴 촉완 */
export function squidArmGeometry(long: boolean) {
  const len = long ? 0.24 : 0.13
  return paint(at(new ConeGeometry(long ? 0.009 : 0.011, len, 5).rotateX(-Math.PI / 2), 0, 0, -len / 2), '#eec3b5')
}

// ── 문어 ──

/** 문어: 둥근 머리(외투) + 얼굴 + 큰 눈 + 바닥에 퍼진 다리 (붉은 갈색, 연한 점) */
export function octopusGeometry() {
  const skin = speckle('#a24e38', '#c98063', 0.22, 0.9)
  const parts: BufferGeometry[] = [
    paint(at(sphere(0.15, 14, 10), 0, 0.27, -0.06, 1, 1.18, 1.08), skin),
    paint(at(sphere(0.125, 12, 9), 0, 0.1, 0.03), skin),
  ]
  for (const s of [-1, 1]) {
    parts.push(paint(at(sphere(0.046, 10, 8), s * 0.068, 0.14, 0.1), '#f6efe0'))
    // 가로로 긴 눈동자
    parts.push(paint(at(sphere(0.026, 8, 6), s * 0.078, 0.145, 0.138, 1.35, 0.6, 0.6), '#1a1612'))
  }
  // 다리 8개: 구슬을 이어 바깥으로 퍼졌다 끝이 말림
  const p = new Vector3()
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.2
    for (let i = 0; i < 8; i++) {
      const t = i / 7
      const reach = 0.06 + t * 0.32
      const curl = t > 0.7 ? (t - 0.7) * 0.5 : 0
      p.set(Math.sin(ang) * reach, 0.02 + curl * 0.6 - t * 0.02, Math.cos(ang) * reach)
      parts.push(paint(at(sphere(0.042 - t * 0.03, 7, 5), p.x, p.y, p.z, 1, 0.75, 1), skin))
    }
  }
  return merge(parts)
}

/** 문어가 숨는 바위 (현무암 덩이 몇 개) */
export function denRockGeometry(seed: number) {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + seed
    // 앞쪽(+z) 한 곳은 비워 틈을 만듦
    if (i === 0) continue
    const r = 0.42 + 0.06 * Math.sin(seed * 3 + i)
    const g = new DodecahedronGeometry(0.28 + 0.06 * Math.cos(seed + i * 2), 0)
    parts.push(paint(at(g, Math.sin(a) * r, 0.12, Math.cos(a) * r, 1.1, 0.8 + 0.25 * Math.sin(i + seed), 1), speckle('#3a3734', '#55504a', 0.3, 2)))
  }
  return merge(parts)
}

// ── 바닥 생물 ──

/** 별불가사리: 납작한 별 (색은 인스턴스마다) */
export function starfishGeometry() {
  const s = new Shape()
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const r = i % 2 === 0 ? 0.13 : 0.055
    if (i === 0) s.moveTo(Math.sin(a) * r, Math.cos(a) * r)
    else s.lineTo(Math.sin(a) * r, Math.cos(a) * r)
  }
  const g = new ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 })
  g.rotateX(-Math.PI / 2)
  // 가운데가 조금 밝고, 오돌토돌한 점
  return paint(g, (x, y, z) => {
    const h = Math.sin(x * 431.3 + z * 197.1) * 9437.1
    if (y > 0.02 && h - Math.floor(h) < 0.18) return '#f6e6c8'
    return Math.hypot(x, z) < 0.04 ? '#fff2e0' : '#ffffff'
  })
}

/** 작은 게 몸통 (눈자루 포함). 다리·집게는 따로 (움직임) */
export function crabBodyGeometry() {
  const shell = '#c9502f'
  return merge([
    paint(at(sphere(0.07, 12, 8), 0, 0.045, 0, 1.3, 0.55, 1), counterShade(shell, '#e8a07d', 0.02, 0.07)),
    paint(at(new CylinderGeometry(0.006, 0.006, 0.05, 5), 0.025, 0.09, 0.05), shell),
    paint(at(new CylinderGeometry(0.006, 0.006, 0.05, 5), -0.025, 0.09, 0.05), shell),
    paint(at(sphere(0.013, 8, 6), 0.025, 0.118, 0.05), '#1b1a19'),
    paint(at(sphere(0.013, 8, 6), -0.025, 0.118, 0.05), '#1b1a19'),
  ])
}

export function crabClawGeometry() {
  return merge([
    paint(at(sphere(0.026, 8, 6), 0, 0, 0.02, 1, 0.8, 1.3), '#d45a35'),
    paint(at(new ConeGeometry(0.012, 0.04, 5).rotateX(Math.PI / 2), 0.008, 0.008, 0.06), '#e7c3a8'),
    paint(at(new ConeGeometry(0.01, 0.035, 5).rotateX(Math.PI / 2), -0.008, -0.006, 0.058), '#e7c3a8'),
  ])
}

/** 다리 하나: 바깥(+x)으로 뻗어 바닥을 짚음 */
export function crabLegGeometry() {
  const up = paint(at(new CylinderGeometry(0.006, 0.007, 0.07, 4).rotateZ(Math.PI / 2.6), 0.03, 0.045, 0), '#c24a2c')
  const down = paint(at(new CylinderGeometry(0.004, 0.006, 0.06, 4).rotateZ(-Math.PI / 7), 0.07, 0.02, 0), '#c24a2c')
  return merge([up, down])
}

/** 소라게 껍데기 (작은 소라) */
export function hermitShellGeometry() {
  const parts: BufferGeometry[] = []
  const rings = [
    [0.07, 0.035, 0.0],
    [0.052, 0.028, 0.05],
    [0.034, 0.02, 0.09],
  ]
  rings.forEach(([r, tube, y], i) => {
    const t = new TorusGeometry(r, tube, 7, 14)
    t.rotateX(Math.PI / 2)
    t.translate(0, y, 0)
    parts.push(paint(t, i % 2 === 0 ? '#c49a6c' : '#a87b52'))
  })
  parts.push(paint(at(new ConeGeometry(0.025, 0.06, 8), 0, 0.13, 0), '#d8b48a'))
  const g = merge(parts)
  // 꼭지가 뒤 위쪽을 향하게
  g.rotateX(-1.0)
  g.translate(0, 0.06, -0.03)
  return g
}

export function hermitBodyGeometry() {
  return merge([
    paint(at(sphere(0.03, 8, 6), 0, 0.03, 0.05, 1.2, 0.8, 1), '#d2633d'),
    paint(at(sphere(0.011, 6, 5), 0.018, 0.065, 0.075), '#1b1a19'),
    paint(at(sphere(0.011, 6, 5), -0.018, 0.065, 0.075), '#1b1a19'),
    paint(at(new CylinderGeometry(0.004, 0.005, 0.05, 4).rotateZ(1.1), 0.04, 0.012, 0.06), '#c95a36'),
    paint(at(new CylinderGeometry(0.004, 0.005, 0.05, 4).rotateZ(-1.1), -0.04, 0.012, 0.06), '#c95a36'),
    paint(at(new CylinderGeometry(0.004, 0.005, 0.05, 4).rotateZ(1.1), 0.042, 0.012, 0.03), '#c95a36'),
    paint(at(new CylinderGeometry(0.004, 0.005, 0.05, 4).rotateZ(-1.1), -0.042, 0.012, 0.03), '#c95a36'),
  ])
}

// ── 해파리 (보름달물해파리: 반투명 우산 + 분홍 고리 네 개) ──

export function jellyBellGeometry() {
  const bell = new SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)
  bell.scale(1, 0.62, 1)
  const rings: BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const t = new TorusGeometry(0.055, 0.014, 6, 14)
    t.rotateX(Math.PI / 2)
    t.translate(Math.sin(a) * 0.09, 0.08, Math.cos(a) * 0.09)
    rings.push(paint(t, '#f2a6c8'))
  }
  return merge([paint(bell, counterShade('#eaf6ff', '#b9dcf2', 0, 0.18)), ...rings])
}

/** 늘어진 촉수 한 가닥 (위가 원점) */
export function jellyTentacleGeometry(len: number) {
  const g = new CylinderGeometry(0.004, 0.0025, len, 4, 6)
  g.translate(0, -len / 2, 0)
  return paint(g, '#dff1ff')
}

// ── 바다거북 (푸른바다거북) ──

/** 등딱지: 육각 비늘판 무늬 + 배딱지 + 머리 (길이 약 1.1m) */
export function turtleBodyGeometry() {
  const plate = new Color('#6e5c3a')
  const light = new Color('#9a8656')
  const line = new Color('#3d321f')
  const c = new Color()
  const shell = new SphereGeometry(0.5, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  shell.scale(0.9, 0.36, 1.18)
  const painted = paint(shell, (x, _y, z) => {
    // 가운데 줄 5칸 + 양옆 4칸: 판 가운데는 밝고 판 사이 선은 어둡게
    const row = z / 0.24
    const side = Math.abs(x) < 0.16 ? 0 : 1
    const fx = side === 0 ? x / 0.16 : (Math.abs(x) - 0.16) / 0.28 - 0.5
    const fz = row + (side ? 0.5 : 0) - Math.round(row + (side ? 0.5 : 0))
    const edge = Math.max(Math.abs(fz) * 2, Math.abs(fx) * (side ? 2 : 1))
    if (edge > 0.86 || Math.abs(Math.abs(x) - 0.16) < 0.018) return line.getHex()
    return c.copy(plate).lerp(light, Math.max(0, 0.7 - edge)).getHex()
  })
  const belly = paint(at(new CylinderGeometry(0.44, 0.4, 0.06, 18), 0, -0.02, 0, 1, 1, 1.3), '#d9cfa4')
  const skin = speckle('#93a184', '#5f6c52', 0.25, 1.2)
  const head = paint(at(sphere(0.13, 12, 9), 0, 0.02, 0.68, 0.9, 0.8, 1.15), skin)
  const neck = paint(at(new CylinderGeometry(0.09, 0.11, 0.16, 10).rotateX(Math.PI / 2), 0, 0, 0.55), skin)
  return merge([painted, belly, neck, head, ...eyes(0.075, 0.05, 0.74, 0.026, 0.4)])
}

/** 앞지느러미 (길고 납작). 원점이 어깨, +x 쪽으로 뻗음 → 왼쪽은 scale.x = -1 */
export function turtleFlipperGeometry(front: boolean) {
  const len = front ? 0.62 : 0.3
  return paint(at(sphere(1, 12, 6), len * 0.5, 0, front ? -0.06 : -0.02, len * 0.5, 0.035, front ? 0.12 : 0.1), speckle('#8f9c7f', '#5c6850', 0.25, 1.5))
}

// ── 남방큰돌고래 (길이 약 2.2m, 등은 회색·배는 밝게) ──

export function dolphinBodyGeometry() {
  const shade = counterShade('#56626e', '#dfe5e8', -0.22, 0.2)
  const body = paint(at(sphere(1, 18, 12), 0, 0, 0.05, 0.32, 0.34, 1.0), shade)
  const melon = paint(at(sphere(0.24, 14, 10), 0, 0.03, 0.78, 1, 0.95, 1.2), shade)
  const beak = paint(at(new CylinderGeometry(0.05, 0.075, 0.26, 10).rotateX(Math.PI / 2), 0, -0.05, 1.05), shade)
  const stock = paint(at(new CylinderGeometry(0.2, 0.06, 0.6, 12).rotateX(Math.PI / 2), 0, 0.02, -0.95), shade)
  const dorsal = fin([[0, 0.3, 0.2], [0, 0.56, -0.18], [0, 0.42, -0.12], [0, 0.3, -0.25]], '#4d5965')
  const pecL = fin([[0.25, -0.1, 0.42], [0.55, -0.26, 0.16], [0.26, -0.14, 0.24]], '#5a6672')
  const pecR = fin([[-0.25, -0.1, 0.42], [-0.55, -0.26, 0.16], [-0.26, -0.14, 0.24]], '#5a6672')
  const eye = [-1, 1].map((s) => paint(at(sphere(0.028, 8, 6), s * 0.215, 0.06, 0.72), '#16191c'))
  return merge([body, melon, beak, stock, dorsal, pecL, pecR, ...eye])
}

/** 꼬리지느러미 (원점이 꼬리자루 끝, 위아래로 침) */
export function dolphinFlukeGeometry() {
  return fin([[0, 0, 0.05], [0.42, 0, -0.22], [0.12, 0, -0.14], [0, 0, -0.08], [-0.12, 0, -0.14], [-0.42, 0, -0.22]], '#56626e')
}
