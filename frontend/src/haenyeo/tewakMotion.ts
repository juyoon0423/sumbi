import type { Vector3 } from 'three'
import { damp } from '../lib/math'
import { waveHeight } from '../world/sea/waves'

/** 줄 길이: 잠수하면 테왁은 수면에 남고, 이보다 멀어지면 천천히 끌려옴 */
const TETHER = 2.2

/**
 * 테왁 움직임 (내 해녀·다른 해녀 공용).
 * attached: 품에 안고 다님(몸 앞쪽 수면), 아니면 수면에 둥둥 떠서 줄에 끌려옴.
 */
export function updateTewak(tw: { pos: Vector3; attached: boolean }, body: Vector3, yaw: number, t: number, dt: number) {
  if (tw.attached) {
    const tx = body.x + Math.sin(yaw) * 0.47
    const tz = body.z + Math.cos(yaw) * 0.47
    const k = damp(10, dt)
    tw.pos.x += (tx - tw.pos.x) * k
    tw.pos.z += (tz - tw.pos.z) * k
    // 품에 안은 테왁은 얼굴을 가리지 않게 수면에 조금 잠김
    tw.pos.y += (waveHeight(tw.pos.x, tw.pos.z, t) - 0.05 - tw.pos.y) * damp(12, dt)
  } else {
    const dx = body.x - tw.pos.x
    const dz = body.z - tw.pos.z
    const d = Math.hypot(dx, dz)
    if (d > TETHER) {
      const pull = Math.min(d - TETHER, (d - TETHER) * 1.5 * dt)
      tw.pos.x += (dx / d) * pull
      tw.pos.z += (dz / d) * pull
    }
    tw.pos.y = waveHeight(tw.pos.x, tw.pos.z, t) + 0.08
  }
}
