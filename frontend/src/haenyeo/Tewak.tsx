import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Vector3 } from 'three'
import { waveHeight } from '../world/sea/waves'
import { MAT } from './materials'

/** 주황 테왁 + 아래 망사리. 위치는 소유자(LocalPlayer, 원격 플레이어)가 계산해 넣는다 */
export function Tewak({ state }: { state: { pos: Vector3 } }) {
  const ref = useRef<Group>(null!)

  useFrame(({ clock }) => {
    const { pos } = state
    const t = clock.elapsedTime
    ref.current.position.copy(pos)
    // 파도 기울기에 맞춰 살짝 기울어짐
    const e = 0.4
    const sx = (waveHeight(pos.x + e, pos.z, t) - waveHeight(pos.x - e, pos.z, t)) / (2 * e)
    const sz = (waveHeight(pos.x, pos.z + e, t) - waveHeight(pos.x, pos.z - e, t)) / (2 * e)
    ref.current.rotation.set(sz * 1.2, t * 0.15, -sx * 1.2)
  })

  return (
    <group ref={ref}>
      <mesh material={MAT.tewak} scale={[1, 0.78, 1]} castShadow>
        <sphereGeometry args={[0.24, 28, 20]} />
      </mesh>
      <mesh material={MAT.tewakBand} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.014, 6, 32]} />
      </mesh>
      <mesh material={MAT.tewakBand} position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.05, 10]} />
      </mesh>
      {/* 망사리 (그물 주머니) */}
      <mesh material={MAT.net} position={[0, -0.12, 0]} scale={[1, 1.3, 1]}>
        <sphereGeometry args={[0.2, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
    </group>
  )
}
