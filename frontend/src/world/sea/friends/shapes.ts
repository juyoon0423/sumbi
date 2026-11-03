import { BufferAttribute, BufferGeometry, CanvasTexture, Color, MeshStandardMaterial, type ColorRepresentation } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 바다 친구들 모양: 기본 도형에 꼭짓점 색을 칠해 하나로 합침 (생물 하나 = 메시 하나 → 그리기 호출이 적음).
// 해녀처럼 둥글고 단순한 로우폴리. 재질은 Standard 라 물속 안개·빛 색을 그대로 받음.

type Painter = (x: number, y: number, z: number) => ColorRepresentation

const tmp = new Color()

/** 지오메트리에 꼭짓점 색 칠하기 (단색 또는 위치별 색) */
export function paint(g: BufferGeometry, color: ColorRepresentation | Painter): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  const pos = geo.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    tmp.set(typeof color === 'function' ? color(pos.getX(i), pos.getY(i), pos.getZ(i)) : color)
    col[i * 3] = tmp.r
    col[i * 3 + 1] = tmp.g
    col[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new BufferAttribute(col, 3))
  // uv 가 없는 도형과 합칠 수 있게 위치·법선·색만 남김
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k)
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  return geo
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts)
  if (!g) throw new Error('merge failed')
  return g
}

/** 위아래 색 섞기 (등은 진하고 배는 밝게) */
export function counterShade(top: ColorRepresentation, belly: ColorRepresentation, y0: number, y1: number): Painter {
  const a = new Color(top)
  const b = new Color(belly)
  const c = new Color()
  return (_x, y) => {
    const k = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)))
    return c.copy(b).lerp(a, k).getHex()
  }
}

/** 꼭짓점 색을 쓰는 기본 재질 */
export function lifeMaterial(opts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, ...opts })
}

/** 삼각형 여러 개로 된 얇은 지느러미 (양면) */
export function fin(points: number[][], color: ColorRepresentation) {
  const v: number[] = []
  for (let i = 1; i + 1 < points.length; i++) {
    v.push(...points[0], ...points[i], ...points[i + 1])
    v.push(...points[0], ...points[i + 1], ...points[i]) // 뒷면
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  g.computeVertexNormals()
  return paint(g, color)
}

let dot: CanvasTexture | null = null
/** 가운데가 밝고 가장자리가 부드럽게 사라지는 둥근 점 (해파리 빛 · 물보라 알갱이) */
export function softDotTexture() {
  if (dot) return dot
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  dot = new CanvasTexture(c)
  return dot
}
