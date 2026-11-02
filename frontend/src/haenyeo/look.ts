import type { MeshStandardMaterial } from 'three'
import { tewakMaterial, TEWAK_COLORS, towelMaterial, TOWEL_COLORS } from './materials'

/** 닉네임으로 정해지는 고정 외형 (같은 닉네임이면 어느 화면에서나 같은 모습) */
export interface HaenyeoLook {
  towel: MeshStandardMaterial
  tewak: MeshStandardMaterial
  /** 키 배율 (아주 미세한 차이) */
  height: number
  /** 동작 타이밍을 사람마다 어긋나게 하는 값 (0~1) */
  phase: number
}

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function lookFromNick(nick: string): HaenyeoLook {
  const h = hash(nick || '해녀')
  return {
    towel: towelMaterial(TOWEL_COLORS[h % TOWEL_COLORS.length]),
    tewak: tewakMaterial(TEWAK_COLORS[(h >>> 4) % TEWAK_COLORS.length]),
    height: 0.96 + (((h >>> 8) % 100) / 100) * 0.08,
    phase: ((h >>> 16) % 1000) / 1000,
  }
}
