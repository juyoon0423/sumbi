import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { CONFIG } from '../../../config'
import { player } from '../../../player/runtime'
import { SEAFOOD_GEOMETRY, SEAFOOD_MATERIAL } from './models'
import { seafood } from './seafoodState'

const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2)

export function SeafoodField() {
  const refs = useRef<(Group | null)[]>([])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    // 물속에서 찾기 쉽도록 은은하게 빛남
    const glow = 0.35 + 0.25 * Math.sin(t * 2.2)
    for (const m of Object.values(SEAFOOD_MATERIAL)) m.emissiveIntensity = glow

    for (const it of seafood) {
      const g = refs.current[it.id]
      if (!g) continue
      if (!it.active && t > it.respawnAt) it.active = true
      if (it.active && it.appear < 1) it.appear = Math.min(1, it.appear + dt)
      g.visible = it.active
      if (!it.active) continue
      let s = it.scale * easeOutBack(it.appear)
      // 따는 중이면 손으로 쏙 들어가듯 작아짐
      if (player.harvestItemId === it.id && player.pose.state === 'harvesting') {
        s *= 1 - Math.min(1, player.pose.stateTime / CONFIG.harvestDuration) * 0.9
      }
      g.scale.setScalar(Math.max(0.001, s))
    }
  })

  return (
    <>
      {seafood.map((it) => (
        <group
          key={it.id}
          ref={(g) => {
            refs.current[it.id] = g
          }}
          position={[it.pos.x, it.pos.y + (it.type === 'urchin' ? 0.07 : 0), it.pos.z]}
          rotation={[0, it.rotY, 0]}
        >
          <mesh geometry={SEAFOOD_GEOMETRY[it.type]} material={SEAFOOD_MATERIAL[it.type]} castShadow />
        </group>
      ))}
    </>
  )
}
