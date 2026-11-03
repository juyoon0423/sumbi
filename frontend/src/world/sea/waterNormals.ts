import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three'
import { seededRandom } from '../../lib/math'

// 수면 잔물결 노멀맵: 이음매 없이 반복되는 그림을 처음 한 번 만들어 씀 (외부 이미지 없음).
// 정수 파수(wave number)를 가진 사인파를 여럿 겹쳐 반복 경계가 자연스럽게 이어짐.
// RGB = 기울기(노멀 xy, 0.5 중심), A = 높이 (포말 무늬에 씀)

const SIZE = 256

export function makeWaterNormals() {
  const rand = seededRandom(424242)
  const waves: { kx: number; ky: number; amp: number; ph: number }[] = []
  for (let i = 0; i < 56; i++) {
    const k = 2 + Math.floor(Math.pow(rand(), 1.6) * 26)
    const a = rand() * Math.PI * 2
    // 바람 방향(대각선)으로 조금 치우치게
    const bias = 0.75 + 0.25 * Math.cos(a - 0.6) ** 2
    const kx = Math.round(Math.cos(a) * k)
    const ky = Math.round(Math.sin(a) * k)
    if (kx === 0 && ky === 0) continue
    waves.push({ kx, ky, amp: (bias * 1.0) / Math.pow(Math.hypot(kx, ky), 1.35), ph: rand() * Math.PI * 2 })
  }
  const data = new Uint8Array(SIZE * SIZE * 4)
  const hs = new Float32Array(SIZE * SIZE)
  const gx = new Float32Array(SIZE * SIZE)
  const gy = new Float32Array(SIZE * SIZE)
  let hMin = Infinity
  let hMax = -Infinity
  let gMax = 0
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE
      const v = y / SIZE
      let h = 0
      let dx = 0
      let dy = 0
      for (const w of waves) {
        const ph = Math.PI * 2 * (w.kx * u + w.ky * v) + w.ph
        // 봉우리는 뾰족하고 골은 넓게 (물결다운 모양)
        const s = Math.sin(ph)
        const c = Math.cos(ph)
        h += w.amp * (s - 0.25 * s * s)
        const dd = w.amp * (c - 0.5 * s * c) * Math.PI * 2
        dx += dd * w.kx
        dy += dd * w.ky
      }
      const i = y * SIZE + x
      hs[i] = h
      gx[i] = dx
      gy[i] = dy
      hMin = Math.min(hMin, h)
      hMax = Math.max(hMax, h)
      gMax = Math.max(gMax, Math.abs(dx), Math.abs(dy))
    }
  }
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = Math.round((0.5 + (0.5 * gx[i]) / gMax) * 255)
    data[i * 4 + 1] = Math.round((0.5 + (0.5 * gy[i]) / gMax) * 255)
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = Math.round(((hs[i] - hMin) / (hMax - hMin)) * 255)
  }
  const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}
