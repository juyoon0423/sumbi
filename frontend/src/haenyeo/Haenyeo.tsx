import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'
import { CONFIG } from '../config'
import { damp, smoothstep } from '../lib/math'
import { MAT } from './materials'
import type { HaenyeoPose } from './types'

// 기본 도형으로 조합한 2~2.5등신 해녀.
// 원점 = 몸 중심, 앞 = +z. 전체 키 ≈ 1.2, 머리 지름 0.64 (≈ 52%)

const HEAD_R = 0.32

interface Target {
  pitch: number
  headTilt: number
  armX: number
  /** 팔 벌림 (+ 바깥, - 안쪽으로 테왁 안기) */
  armZ: number
  armSwing: number
  kickAmp: number
  kickFreq: number
  goggles: number // 0 = 이마 위, 1 = 눈 위
  cheeks: number // 0 = 평소, 1 = 빵빵
}

function targetFor(pose: HaenyeoPose, t: number): Target {
  const base: Target = {
    pitch: 0.15, headTilt: 0, armX: -1.1, armZ: -0.3, armSwing: 0,
    kickAmp: 0.25, kickFreq: 2, goggles: 0, cheeks: 0,
  }
  const st = pose.stateTime
  switch (pose.state) {
    case 'surfaceIdle':
      return base
    case 'surfaceSwim':
      return { ...base, pitch: 0.4, armX: -1.25, kickAmp: 0.55, kickFreq: 5 }
    case 'entering':
      return { ...base, pitch: 2.4, armX: -2.9, armZ: 0.15, kickAmp: 0.1, kickFreq: 3, goggles: 1 }
    case 'underIdle':
      return { ...base, pitch: 0.9, armX: -0.7 + Math.sin(t * 2) * 0.3, armZ: 0.55, kickAmp: 0.3, kickFreq: 2, goggles: 1 }
    case 'underSwim':
      // 평영: 팔을 앞으로 뻗었다가 옆으로 젓기
      return { ...base, pitch: 1.35, armX: -2.3, armZ: 0.5, armSwing: 1, kickAmp: 0.6, kickFreq: 3.5, goggles: 1 }
    case 'harvesting': {
      const reach = Math.sin(Math.min(1, st / CONFIG.harvestDuration) * Math.PI)
      return { ...base, pitch: 1.55, armX: -1.6 - reach * 1.1, armZ: 0.25, kickAmp: 0.15, kickFreq: 2, goggles: 1 }
    }
    case 'ascending':
      return { ...base, pitch: -0.2, headTilt: -0.45, armX: 0.15, armZ: 0.25, kickAmp: 0.75, kickFreq: 6, goggles: 1 }
    case 'sumbi': {
      // 고개를 젖히고 볼을 빵빵하게 → 천천히 원래대로
      const puff = smoothstep(0, 0.15, st) * (1 - smoothstep(1.1, 1.6, st))
      return { ...base, pitch: -0.05, headTilt: -0.5 * puff, cheeks: puff, kickAmp: 0.2 }
    }
  }
}

export function Haenyeo({ pose }: { pose: HaenyeoPose }) {
  const body = useRef<Group>(null!)
  const head = useRef<Group>(null!)
  const goggles = useRef<Group>(null!)
  const armL = useRef<Group>(null!)
  const armR = useRef<Group>(null!)
  const legL = useRef<Group>(null!)
  const legR = useRef<Group>(null!)
  const cheekL = useRef<Mesh>(null!)
  const cheekR = useRef<Mesh>(null!)
  const mouth = useRef<Mesh>(null!)
  const eyes = useRef<Group>(null!)
  const cur = useRef({ ...targetFor(pose, 0), kickPhase: 0, nextBlink: 2 })

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const tg = targetFor(pose, t)
    const c = cur.current
    const k = damp(8, dt)
    c.pitch += (tg.pitch - c.pitch) * damp(pose.state === 'entering' ? 9 : 5, dt)
    c.headTilt += (tg.headTilt - c.headTilt) * k
    c.armX += (tg.armX - c.armX) * k
    c.armZ += (tg.armZ - c.armZ) * k
    c.armSwing += (tg.armSwing - c.armSwing) * k
    c.kickAmp += (tg.kickAmp - c.kickAmp) * k
    c.kickFreq += (tg.kickFreq - c.kickFreq) * k
    c.goggles += (tg.goggles - c.goggles) * damp(10, dt)
    c.cheeks += (tg.cheeks - c.cheeks) * damp(12, dt)
    c.kickPhase += dt * c.kickFreq * (0.6 + pose.move * 0.6)

    // 몸통 기울기 + 숨 쉬듯 살짝 오르내림
    body.current.rotation.x = c.pitch
    body.current.position.y = Math.sin(t * 2.2) * 0.012
    head.current.rotation.x = c.headTilt
    head.current.rotation.y = Math.sin(t * 0.5) * 0.08

    // 물안경: 이마 위(-0.85) ↔ 눈 위(0)
    goggles.current.rotation.x = -0.85 * (1 - c.goggles)

    // 팔
    const stroke = Math.sin(c.kickPhase * 0.9)
    const swingX = c.armSwing * stroke * 0.9
    const swingZ = c.armSwing * Math.max(0, -stroke) * 0.9
    armL.current.rotation.set(c.armX + swingX, 0, c.armZ + swingZ)
    armR.current.rotation.set(c.armX + swingX, 0, -(c.armZ + swingZ))

    // 인사: 오른팔을 들어 흔들기 (다른 동작 위에 겹침)
    if (pose.waveTime >= 0) {
      const w = smoothstep(0, 0.2, pose.waveTime) * (1 - smoothstep(CONFIG.waveDuration - 0.3, CONFIG.waveDuration, pose.waveTime))
      armR.current.rotation.x = armR.current.rotation.x * (1 - w) - 0.15 * w
      armR.current.rotation.z = armR.current.rotation.z * (1 - w) + (-2.6 + Math.sin(pose.waveTime * 13) * 0.35) * w
    }

    // 다리 발차기
    const kick = Math.sin(c.kickPhase * Math.PI * 2) * c.kickAmp
    legL.current.rotation.x = kick
    legR.current.rotation.x = -kick

    // 볼 빵빵 + 입 "오"
    const puff = 1 + c.cheeks * 0.9
    cheekL.current.scale.set(puff, 0.7 * puff, 0.45 * puff)
    cheekR.current.scale.set(puff, 0.7 * puff, 0.45 * puff)
    mouth.current.scale.setScalar(1 + c.cheeks * 0.8)

    // 눈 깜빡임
    if (t > c.nextBlink) c.nextBlink = t + 2.5 + Math.random() * 3
    const blinking = t > c.nextBlink - 0.12
    eyes.current.scale.y = blinking || c.cheeks > 0.5 ? 0.15 : 1
  })

  return (
    <group ref={body}>
      {/* 몸통: 짧은 캡슐 잠수복 */}
      <mesh material={MAT.suit} castShadow>
        <capsuleGeometry args={[0.2, 0.14, 6, 16]} />
      </mesh>

      {/* 머리 */}
      <group ref={head} position={[0, 0.43, 0]}>
        <mesh material={MAT.skin} castShadow>
          <sphereGeometry args={[HEAD_R, 32, 24]} />
        </mesh>
        {/* 물수건 */}
        <mesh material={MAT.towel} castShadow>
          <sphereGeometry args={[HEAD_R + 0.014, 32, 16, 0, Math.PI * 2, 0, 1.15]} />
        </mesh>
        <mesh material={MAT.towel} position={[0, 0.2, -0.24]} scale={[1.2, 0.8, 0.8]}>
          <sphereGeometry args={[0.07, 12, 10]} />
        </mesh>

        {/* 얼굴 */}
        <group ref={eyes} position={[0, 0.02, 0]}>
          <mesh material={MAT.eye} position={[0.105, 0, 0.297]}>
            <sphereGeometry args={[0.03, 12, 10]} />
          </mesh>
          <mesh material={MAT.eye} position={[-0.105, 0, 0.297]}>
            <sphereGeometry args={[0.03, 12, 10]} />
          </mesh>
        </group>
        <mesh ref={cheekL} material={MAT.cheek} position={[0.185, -0.07, 0.245]}>
          <sphereGeometry args={[0.058, 14, 10]} />
        </mesh>
        <mesh ref={cheekR} material={MAT.cheek} position={[-0.185, -0.07, 0.245]}>
          <sphereGeometry args={[0.058, 14, 10]} />
        </mesh>
        <mesh ref={mouth} material={MAT.mouth} position={[0, -0.1, 0.305]} scale={[1, 0.8, 0.5]}>
          <sphereGeometry args={[0.022, 10, 8]} />
        </mesh>

        {/* 물안경 (머리 중심 기준으로 회전해 이마 ↔ 눈) */}
        <group ref={goggles}>
          {[0.1, -0.1].map((x) => (
            <group key={x} position={[x, 0.025, 0.3]} rotation={[0, x * 1.6, 0]}>
              <mesh material={MAT.goggleFrame}>
                <torusGeometry args={[0.07, 0.02, 8, 20]} />
              </mesh>
              <mesh material={MAT.goggleGlass} position={[0, 0, -0.005]}>
                <circleGeometry args={[0.07, 20]} />
              </mesh>
            </group>
          ))}
          <mesh material={MAT.goggleFrame} position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[HEAD_R + 0.008, 0.012, 6, 40]} />
          </mesh>
        </group>
      </group>

      {/* 팔 (어깨 피벗) */}
      {(
        [
          [armL, 0.2],
          [armR, -0.2],
        ] as const
      ).map(([ref, x]) => (
        <group key={x} ref={ref} position={[x, 0.12, 0]}>
          <mesh material={MAT.suit} position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.062, 0.12, 4, 10]} />
          </mesh>
          <mesh material={MAT.skin} position={[0, -0.23, 0]}>
            <sphereGeometry args={[0.065, 12, 10]} />
          </mesh>
        </group>
      ))}

      {/* 다리 (엉덩이 피벗) + 오리발 */}
      {(
        [
          [legL, 0.09],
          [legR, -0.09],
        ] as const
      ).map(([ref, x]) => (
        <group key={x} ref={ref} position={[x, -0.2, 0]}>
          <mesh material={MAT.suit} position={[0, -0.09, 0]} castShadow>
            <capsuleGeometry args={[0.072, 0.08, 4, 10]} />
          </mesh>
          <mesh material={MAT.fin} position={[0, -0.2, 0.04]} scale={[0.9, 0.25, 1.7]}>
            <sphereGeometry args={[0.095, 14, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
