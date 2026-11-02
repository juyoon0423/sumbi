import type { MeshStandardMaterial } from 'three'
import { CHEEK_PALETTE, nickOf, swatchColor, TEWAK_PALETTE, TOWEL_PALETTE, type Customization } from './customize'
import { cheekMaterial, CHEEK_COLORS, tewakMaterial, TEWAK_COLORS, towelMaterial, TOWEL_COLORS } from './materials'

/** 해녀 한 명의 외형 */
export interface HaenyeoLook {
  towel: MeshStandardMaterial
  tewak: MeshStandardMaterial
  cheek: MeshStandardMaterial
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

/** 닉네임만 알 때: 닉네임으로 색을 정함 (캐릭터 랩, 꾸미기 정보가 없는 해녀) */
export function lookFromNick(nick: string): HaenyeoLook {
  const h = hash(nick || '해녀')
  return {
    towel: towelMaterial(TOWEL_COLORS[h % TOWEL_COLORS.length]),
    tewak: tewakMaterial(TEWAK_COLORS[(h >>> 4) % TEWAK_COLORS.length]),
    cheek: cheekMaterial(CHEEK_COLORS[(h >>> 24) % CHEEK_COLORS.length]),
    height: 0.96 + (((h >>> 8) % 100) / 100) * 0.08,
    phase: ((h >>> 16) % 1000) / 1000,
  }
}

/** 직접 꾸민 해녀: 고른 색 + 닉네임으로 정해지는 키·동작 박자 */
export function lookFromCustom(c: Customization): HaenyeoLook {
  const base = lookFromNick(nickOf(c))
  return {
    ...base,
    towel: towelMaterial(swatchColor(TOWEL_PALETTE, c.towel)),
    tewak: tewakMaterial(swatchColor(TEWAK_PALETTE, c.tewak)),
    cheek: cheekMaterial(swatchColor(CHEEK_PALETTE, c.cheek)),
  }
}
