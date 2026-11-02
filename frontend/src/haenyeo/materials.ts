import { Color, MeshStandardMaterial } from 'three'
import { CHEEK_PALETTE, TEWAK_PALETTE, TOWEL_PALETTE } from './customize'

// 레퍼런스처럼 광택 없는 소프트 비닐/점토 느낌 (roughness 높게, 금속성 0, 강한 반사 없음)
// 50명이 모여도 재질 수가 늘지 않도록 전부 모듈 단위로 공유한다.

const matte = (color: string, roughness = 0.9) => new MeshStandardMaterial({ color, roughness, metalness: 0 })

export const MAT = {
  skin: (() => {
    // 그늘이 갈색으로 지지 않도록 은은한 자체 발광
    const m = matte('#fcd7ba', 0.88)
    m.emissive = new Color('#f2b48a')
    m.emissiveIntensity = 0.12
    return m
  })(),
  suit: matte('#2c3038', 0.8),
  suitTrim: matte('#3d4652', 0.85),
  eye: matte('#1d1c20', 0.5),
  mouth: matte('#9a514c', 0.9),
  goggleFrame: matte('#3a5266', 0.7),
  goggleGlass: new MeshStandardMaterial({
    color: '#cdeff8',
    roughness: 0.3,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  }),
  fin: matte('#35596c', 0.8),
  sweat: new MeshStandardMaterial({ color: '#bfe9fb', roughness: 0.3, transparent: true, opacity: 0.85 }),
  tewakBand: matte('#7a3f1c'),
  net: new MeshStandardMaterial({ color: '#46663f', roughness: 1, wireframe: true, transparent: true, opacity: 0.55 }),
}

// ── 꾸미기 색: 파스텔 물수건, 주황 계열 테왁, 볼 (haenyeo/customize.ts) ──
export const TOWEL_COLORS = TOWEL_PALETTE.map((s) => s.color)
export const TEWAK_COLORS = TEWAK_PALETTE.map((s) => s.color)
export const CHEEK_COLORS = CHEEK_PALETTE.map((s) => s.color)

const cache = new Map<string, MeshStandardMaterial>()

export function towelMaterial(color: string) {
  const key = `towel:${color}`
  if (!cache.has(key)) cache.set(key, matte(color, 0.95))
  return cache.get(key)!
}

export function tewakMaterial(color: string) {
  const key = `tewak:${color}`
  if (!cache.has(key)) {
    const m = matte(color, 0.65)
    // 살짝 따뜻한 자체 발광으로 물 위에서 잘 보이게
    m.emissive = new Color(color).multiplyScalar(0.12)
    cache.set(key, m)
  }
  return cache.get(key)!
}

export function cheekMaterial(color: string) {
  const key = `cheek:${color}`
  if (!cache.has(key)) cache.set(key, new MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.75 }))
  return cache.get(key)!
}
