import { Vector3 } from 'three'
import { CONFIG, type ItemType } from '../../../config'
import { seededRandom } from '../../../lib/math'
import { terrainY } from '../../terrain'

// 해산물은 사람마다 따로 (결정 #1): 내 화면에만 있고, 딴 자리는 잠시 뒤 다시 생긴다.

export interface SeafoodItem {
  id: number
  type: ItemType
  pos: Vector3
  rotY: number
  scale: number
  active: boolean
  respawnAt: number
  /** 다시 생겨날 때 커지는 연출용 (0~1) */
  appear: number
}

function pickType(r: number): ItemType {
  if (r < 0.45) return 'conch'
  if (r < 0.8) return 'urchin'
  return 'abalone'
}

function createItems(): SeafoodItem[] {
  const rand = seededRandom(20261102)
  const items: SeafoodItem[] = []
  const [cx, cz] = CONFIG.playCenter
  let tries = 0
  while (items.length < CONFIG.seafoodCount && tries++ < 5000) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * (CONFIG.playRadius - 3)
    const x = cx + Math.cos(a) * r
    const z = cz + Math.sin(a) * r
    const y = terrainY(x, z)
    if (y > -2.5) continue // 너무 얕은 곳 제외
    if (items.some((it) => Math.hypot(it.pos.x - x, it.pos.z - z) < 2.2)) continue
    items.push({
      id: items.length,
      type: pickType(rand()),
      pos: new Vector3(x, y + 0.02, z),
      rotY: rand() * Math.PI * 2,
      scale: 0.9 + rand() * 0.3,
      active: true,
      respawnAt: 0,
      appear: 1,
    })
  }
  return items
}

export const seafood = createItems()

/** 위치에서 가장 가까운, 딸 수 있는 해산물 */
export function findHarvestable(pos: Vector3, radius: number) {
  let best: SeafoodItem | null = null
  let bestD = Infinity
  for (const it of seafood) {
    if (!it.active || it.appear < 0.9) continue
    const dh = Math.hypot(it.pos.x - pos.x, it.pos.z - pos.z)
    const dv = pos.y - it.pos.y
    if (dh < radius && dv < 1.5 && dv > -0.5 && dh < bestD) {
      best = it
      bestD = dh
    }
  }
  return best
}

export function collect(item: SeafoodItem, now: number) {
  item.active = false
  item.appear = 0
  item.respawnAt = now + CONFIG.respawnMin + Math.random() * (CONFIG.respawnMax - CONFIG.respawnMin)
}
