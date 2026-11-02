import type { Vector3 } from 'three'
import type { ItemType } from '../../config'

// 불턱 이펙트 요청 (해녀 → 불턱 장면): 손질한 해산물을 대야로 던지기, 대야 가득 참 반짝이
export const bulteokFx = {
  tosses: [] as { from: Vector3; item: ItemType; mine: boolean }[],
  /** 가득 참 연출 요청 */
  burst: false,
  /** 털썩 앉은 자리: 흙먼지 + 작은 반짝임 */
  puffs: [] as { x: number; y: number; z: number }[],
}
