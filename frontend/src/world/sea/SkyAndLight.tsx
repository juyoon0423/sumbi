import { Sky } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Color, DirectionalLight, Fog, Group, Object3D, Vector3 } from 'three'
import { audio } from '../../audio/AudioEngine'
import { player } from '../../player/runtime'
import { useGame } from '../../store/gameStore'
import { waveHeight } from './waves'

// 따뜻한 오후 햇빛. 레퍼런스처럼 환경광 비중을 크게, 그림자는 부드럽고 연하게.
export const SUN_DIR = new Vector3(-0.45, 0.42, -0.78).normalize()

const ABOVE = { color: new Color('#cfe0e8'), near: 70, far: 1300 }
const BELOW = { color: new Color('#1d6a80'), near: 0.5, far: 26 }

export function SkyAndLight() {
  const { scene, camera } = useThree()
  const sun = useRef<DirectionalLight>(null!)
  const target = useRef(new Object3D())
  const sky = useRef<Group>(null!)
  const fog = useRef(new Fog(ABOVE.color.clone(), ABOVE.near, ABOVE.far))
  const background = useRef(ABOVE.color.clone())

  useEffect(() => {
    scene.fog = fog.current
    scene.add(target.current)
    sun.current.target = target.current
    return () => {
      scene.fog = null
      scene.remove(target.current)
    }
  }, [scene])

  useFrame(({ clock }) => {
    // 카메라가 물속인지 판정 → 안개·하늘·소리 전환
    const under = camera.position.y < waveHeight(camera.position.x, camera.position.z, clock.elapsedTime) - 0.05
    const f = fog.current
    const mode = under ? BELOW : ABOVE
    f.color.copy(mode.color)
    f.near = mode.near
    f.far = mode.far
    background.current.copy(mode.color)
    scene.background = background.current
    sky.current.visible = !under

    const game = useGame.getState()
    if (game.cameraUnderwater !== under) {
      game.setCameraUnderwater(under)
      audio.setUnderwater(under)
    }

    // 그림자 영역이 내 해녀를 따라다니게
    const p = player.pos
    sun.current.position.set(p.x + SUN_DIR.x * 40, SUN_DIR.y * 40, p.z + SUN_DIR.z * 40)
    target.current.position.set(p.x, 0, p.z)
  })

  return (
    <>
      <group ref={sky}>
        <Sky
          distance={4500}
          sunPosition={SUN_DIR.clone().multiplyScalar(100).toArray()}
          turbidity={5}
          rayleigh={1.1}
          mieCoefficient={0.004}
          mieDirectionalG={0.82}
        />
      </group>
      <hemisphereLight args={['#dcefff', '#c9b48f', 1.35]} />
      <ambientLight intensity={0.25} color="#fff4e6" />
      <directionalLight
        ref={sun}
        color="#ffe2bd"
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={6}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
    </>
  )
}
