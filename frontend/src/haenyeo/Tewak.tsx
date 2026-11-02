import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { SphereGeometry, TorusGeometry, CylinderGeometry, type Group, type Material, type Vector3 } from 'three'
import { waveHeight } from '../world/sea/waves'
import { MAT } from './materials'

// 공유 지오메트리 (모든 테왁이 같은 것을 씀)
const GEO = {
  ball: new SphereGeometry(0.24, 28, 20).scale(1, 0.78, 1),
  band: new TorusGeometry(0.24, 0.013, 6, 32).rotateX(Math.PI / 2),
  cap: new CylinderGeometry(0.025, 0.035, 0.05, 10),
  net: new SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 1.3, 1),
}

/** 주황 테왁 + 아래 망사리. 위치는 소유자(LocalPlayer, 원격 플레이어)가 계산해 넣는다 */
export function Tewak({ state, material }: { state: { pos: Vector3; rest?: boolean }; material: Material }) {
  const ref = useRef<Group>(null!)

  useFrame(({ clock }) => {
    const { pos } = state
    const t = clock.elapsedTime
    ref.current.position.copy(pos)
    if (state.rest) {
      // 불턱 바닥에 내려놓은 테왁
      ref.current.rotation.set(0.12, 0.6, 0.05)
      return
    }
    // 파도 기울기에 맞춰 살짝 기울어짐
    const e = 0.4
    const sx = (waveHeight(pos.x + e, pos.z, t) - waveHeight(pos.x - e, pos.z, t)) / (2 * e)
    const sz = (waveHeight(pos.x, pos.z + e, t) - waveHeight(pos.x, pos.z - e, t)) / (2 * e)
    ref.current.rotation.set(sz * 1.2, t * 0.15, -sx * 1.2)
  })

  return (
    <group ref={ref}>
      <mesh geometry={GEO.ball} material={material} castShadow />
      <mesh geometry={GEO.band} material={MAT.tewakBand} />
      <mesh geometry={GEO.cap} material={MAT.tewakBand} position={[0, 0.19, 0]} />
      <mesh geometry={GEO.net} material={MAT.net} position={[0, -0.12, 0]} />
    </group>
  )
}
