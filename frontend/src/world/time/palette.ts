import { Color } from 'three'

// 한국 시간(시)별 바다 분위기. 사이 시간은 두 키프레임을 섞는다.

export interface Palette {
  skyTop: Color
  /** 수평선 = 물 위 안개 색 (지형·바다가 하늘에 녹아들게) */
  horizon: Color
  /** 해(낮) 또는 달(밤) 빛 색·세기 */
  light: Color
  lightI: number
  hemiSky: Color
  hemiGround: Color
  hemiI: number
  ambientI: number
  deep: Color
  shallow: Color
  /** 수면에 비친 하늘 */
  reflect: Color
  /** 해·달 반짝임 */
  glint: Color
  glintI: number
  /** 물속 안개·배경 */
  underFog: Color
  underDark: Color
  underBright: Color
  /** 물속 빛줄기 세기 */
  rays: number
  stars: number
  /** 밤 플랑크톤 */
  plankton: number
  /** 0 = 낮, 1 = 한밤 (모닥불 밝기 등) */
  night: number
}

type Raw = { [K in keyof Palette]: Palette[K] extends Color ? string : number }

const NIGHT: Raw = {
  skyTop: '#050b1c', horizon: '#18263d', light: '#9fb4e0', lightI: 0.55,
  hemiSky: '#6d82b0', hemiGround: '#2a2f3a', hemiI: 0.62, ambientI: 0.14,
  deep: '#04121f', shallow: '#0a2c3c', reflect: '#1a2a44', glint: '#c8d6f5', glintI: 0.45,
  underFog: '#041824', underDark: '#05161f', underBright: '#2c5a70',
  rays: 0.1, stars: 1, plankton: 1, night: 1,
}
const PREDAWN: Raw = {
  skyTop: '#1d2550', horizon: '#b58aa8', light: '#ffb38a', lightI: 0.6,
  hemiSky: '#9a9cc8', hemiGround: '#4a4048', hemiI: 0.8, ambientI: 0.16,
  deep: '#0b2c44', shallow: '#1f5d72', reflect: '#8a7fa6', glint: '#ffc6a0', glintI: 0.6,
  underFog: '#0f3a52', underDark: '#0e3a4c', underBright: '#7aa6c0',
  rays: 0.3, stars: 0.35, plankton: 0.45, night: 0.6,
}
const SUNRISE: Raw = {
  skyTop: '#5583bb', horizon: '#f2b892', light: '#ffb070', lightI: 1.5,
  hemiSky: '#c8d4f0', hemiGround: '#a08a74', hemiI: 1.05, ambientI: 0.2,
  deep: '#0d4460', shallow: '#2a8a96', reflect: '#e8b9a0', glint: '#ffd0a0', glintI: 1.0,
  underFog: '#18607a', underDark: '#125468', underBright: '#b0e4ef',
  rays: 0.7, stars: 0, plankton: 0, night: 0.15,
}
const DAY: Raw = {
  skyTop: '#6fa9d6', horizon: '#cfe0e8', light: '#ffe2bd', lightI: 2.1,
  hemiSky: '#dcefff', hemiGround: '#c9b48f', hemiI: 1.35, ambientI: 0.25,
  deep: '#0e4c66', shallow: '#2a9aa3', reflect: '#bfdcea', glint: '#fff1d6', glintI: 0.9,
  underFog: '#1d6a80', underDark: '#145d70', underBright: '#bff3fb',
  rays: 1, stars: 0, plankton: 0, night: 0,
}
const GOLDEN: Raw = {
  skyTop: '#5d8cc4', horizon: '#f2c98f', light: '#ffbf7a', lightI: 1.85,
  hemiSky: '#e9d8c0', hemiGround: '#b0906c', hemiI: 1.15, ambientI: 0.22,
  deep: '#0f4660', shallow: '#2f8f92', reflect: '#f0caa0', glint: '#ffd39a', glintI: 1.25,
  underFog: '#1d6070', underDark: '#13505f', underBright: '#e0e8c8',
  rays: 0.8, stars: 0, plankton: 0, night: 0.05,
}
const SUNSET: Raw = {
  skyTop: '#3a4f86', horizon: '#f08a68', light: '#ff8a5a', lightI: 1.2,
  hemiSky: '#c49ab0', hemiGround: '#7a5a58', hemiI: 0.9, ambientI: 0.18,
  deep: '#0c2f48', shallow: '#245e70', reflect: '#e0907a', glint: '#ffa070', glintI: 1.2,
  underFog: '#123c52', underDark: '#0f3546', underBright: '#8aa8b8',
  rays: 0.4, stars: 0.08, plankton: 0.2, night: 0.35,
}
const DUSK: Raw = {
  skyTop: '#141c3c', horizon: '#6a4a70', light: '#a8a8d8', lightI: 0.55,
  hemiSky: '#6c6c9c', hemiGround: '#3a3440', hemiI: 0.62, ambientI: 0.14,
  deep: '#071a2c', shallow: '#10303f', reflect: '#4a3e60', glint: '#c8c8f0', glintI: 0.5,
  underFog: '#08202e', underDark: '#081d28', underBright: '#3a5a70',
  rays: 0.15, stars: 0.6, plankton: 0.8, night: 0.8,
}

/** [시, 분위기] — 0시와 24시는 같게 */
const KEYS: [number, Raw][] = [
  [0, NIGHT],
  [4.6, NIGHT],
  [5.5, PREDAWN],
  [6.5, SUNRISE],
  [8.5, DAY],
  [16.2, DAY],
  [17.6, GOLDEN],
  [18.6, SUNSET],
  [19.5, DUSK],
  [20.4, NIGHT],
  [24, NIGHT],
]

const parsed: [number, Palette][] = KEYS.map(([h, raw]) => [h, toPalette(raw)])

function toPalette(raw: Raw): Palette {
  const out = {} as Record<string, Color | number>
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'string' ? new Color(v) : v
  return out as unknown as Palette
}

export function emptyPalette(): Palette {
  return toPalette(DAY)
}

/** 두 분위기 섞기: out = a + (b - a) * t */
export function mixPalette(out: Palette, a: Palette, b: Palette, t: number) {
  for (const k of Object.keys(a) as (keyof Palette)[]) {
    const av = a[k]
    const bv = b[k]
    if (av instanceof Color) (out[k] as Color).copy(av).lerp(bv as Color, t)
    else (out[k] as number) = av + ((bv as number) - av) * t
  }
}

/** hour(0~24) 의 분위기를 out 에 */
export function samplePalette(out: Palette, hour: number) {
  const h = ((hour % 24) + 24) % 24
  for (let i = 0; i < parsed.length - 1; i++) {
    const [h0, p0] = parsed[i]
    const [h1, p1] = parsed[i + 1]
    if (h >= h0 && h <= h1) {
      const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0)
      mixPalette(out, p0, p1, t * t * (3 - 2 * t))
      return
    }
  }
}
