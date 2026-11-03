import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, Object3D, Vector3 } from 'three'
import { audio } from '../../audio/AudioEngine'
import { player } from '../../player/runtime'
import { useGame } from '../../store/gameStore'
import { QUALITY, useQuality } from '../../lib/quality'
import { env } from '../time/env'
import { Clouds } from '../sky/Clouds'
import { Gulls } from '../sky/Gulls'
import { ShootingStar } from '../sky/ShootingStar'
import { Starfield } from '../sky/Starfield'
import { TimeOfDay } from '../time/TimeOfDay'
import { mountainHaze } from './Coast'
import { detailUniforms } from './surfaceDetail'
import { waveHeight } from './waves'

const hazeBlue = new Color('#9ab6d6')

// 하늘·빛·안개. 색과 방향은 시간대(env)를 따름. 환경광 비중을 크게, 그림자는 부드럽고 연하게.

/** 낮 기준 해 방향 (물속 빛줄기 기울기용 고정값) */
export const SUN_DIR = new Vector3(-0.45, 0.42, -0.78).normalize()

const ABOVE = { near: 70, far: 1300 }
const BELOW = { near: 0.5, far: 26 }

export function SkyAndLight() {
  const shadowMap = useQuality((s) => QUALITY[s.level].shadowMap)
  const { scene, camera } = useThree()
  const sun = useRef<DirectionalLight>(null!)
  const hemi = useRef<HemisphereLight>(null!)
  const ambient = useRef<AmbientLight>(null!)
  const target = useRef(new Object3D())
  const fog = useRef(new Fog(env.horizon.clone(), ABOVE.near, ABOVE.far))
  const background = useRef(new Color())

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
    // 카메라가 물속인지 판정 → 안개·배경·소리 전환
    const under = camera.position.y < waveHeight(camera.position.x, camera.position.z, clock.elapsedTime) - 0.05
    const f = fog.current
    // 물속: 얕은 곳은 밝은 청록, 깊을수록 진한 남색 (붉은 기가 먼저 빠짐)
    const depthK = under ? Math.min(1, Math.max(0, -camera.position.y / 10)) : 0
    if (under) {
      f.color.copy(env.underFog).multiplyScalar(1.18 - 0.5 * depthK)
      f.color.r *= 1 - 0.55 * depthK
      f.color.g *= 1 - 0.18 * depthK
    } else f.color.copy(env.horizon)
    f.near = under ? BELOW.near : ABOVE.near
    // 밤에는 물속이 더 어둡고 가까이만 보임, 깊을수록 조금 더 가까이만
    f.far = under ? BELOW.far * (1 - 0.3 * env.night) * (1 - 0.2 * depthK) : ABOVE.far
    background.current.copy(f.color)
    scene.background = background.current

    const game = useGame.getState()
    if (game.cameraUnderwater !== under) {
      game.setCameraUnderwater(under)
      audio.setUnderwater(under)
    }

    // 시간대 빛 (물속에선 깊을수록 붉은빛부터 줄어듦)
    sun.current.color.copy(env.light)
    sun.current.intensity = env.lightI
    hemi.current.color.copy(env.hemiSky)
    hemi.current.groundColor.copy(env.hemiGround)
    hemi.current.intensity = env.hemiI
    ambient.current.intensity = env.ambientI
    if (under) {
      for (const c of [sun.current.color, hemi.current.color, hemi.current.groundColor]) {
        c.r *= 0.8 - 0.4 * depthK
        c.g *= 0.95 - 0.12 * depthK
      }
    }

    // 멀리 있는 산: 하늘빛이 섞인 푸르스름한 안개
    mountainHaze.color.value.copy(env.horizon).lerp(env.skyTop, 0.42).lerp(hazeBlue, 0.25 * (1 - env.night))
    mountainHaze.amount.value = 0.8 - 0.25 * env.night
    detailUniforms.uWetTop.value = 0.32

    // 그림자 영역이 내 해녀를 따라다니게
    const p = player.pos
    const d = env.lightDir
    sun.current.position.set(p.x + d.x * 40, d.y * 40, p.z + d.z * 40)
    target.current.position.set(p.x, 0, p.z)
  })

  return (
    <>
      <TimeOfDay />
      <Starfield />
      <Clouds />
      <Gulls />
      <ShootingStar />
      <hemisphereLight ref={hemi} args={['#dcefff', '#c9b48f', 1.35]} />
      <ambientLight ref={ambient} intensity={0.25} color="#fff4e6" />
      <directionalLight
        ref={sun}
        color="#ffe2bd"
        intensity={2.1}
        castShadow
        shadow-mapSize={[shadowMap, shadowMap]}
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
