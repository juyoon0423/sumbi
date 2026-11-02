import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'
import { CONFIG, type ItemType } from '../config'
import { damp, smoothstep } from '../lib/math'
import { SEAFOOD_GEOMETRY, SEAFOOD_MATERIAL } from '../world/sea/seafood/models'
import { GEO, HEAD_R, HEAD_SCALE, HEAD_Y, headSurfaceZ } from './geometries'
import type { HaenyeoLook } from './look'
import { MAT } from './materials'
import type { HaenyeoPose } from './types'

// 기본 도형으로 조합한 2~2.5등신 해녀 + 절차적 애니메이션.
// 원점 = 몸 중심, 앞 = +z. 전체 키 ≈ 1.15, 머리 높이 ≈ 0.6 (약 절반)

type Eyes = 'dot' | 'round' | 'happy' | 'line'
type Mouth = 'dot' | 'o' | 'smile'

interface Target {
  pitch: number
  roll: number
  headTilt: number
  headYaw: number
  headRoll: number
  armX: number
  /** 팔 벌림 (+ 바깥, - 안쪽으로 테왁 안기) */
  armZ: number
  kickAmp: number
  kickFreq: number
  frog: number // 0 = 파닥파닥 발차기, 1 = 개구리헤엄
  goggles: number // 0 = 이마 위, 1 = 눈 위
  stretch: number // 1 = 기본, >1 늘어남, <1 눌림
  cheeks: number // 0 = 평소, 1 = 빵빵
}

interface Face {
  eyes: Eyes
  mouth: Mouth
  sweat: boolean
}

const BASE: Target = {
  pitch: 0.12, roll: 0, headTilt: 0, headYaw: 0, headRoll: 0,
  armX: -1.15, armZ: -0.35, kickAmp: 0.22, kickFreq: 1.8, frog: 0,
  goggles: 0, stretch: 1, cheeks: 0,
}

const ease = (x: number) => smoothstep(0, 1, x)
/** 0→1→0 부드러운 봉우리 */
const hump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2)

type Gesture = 'tilt' | 'look' | 'hug'

interface Anim extends Target {
  kickPhase: number
  prevState: HaenyeoPose['state']
  popT: number
  happyT: number
  gesture: Gesture | null
  gestureT: number
  nextGesture: number
  nextBlink: number
}

function computeTarget(pose: HaenyeoPose, a: Anim, t: number): { tg: Target; face: Face } {
  const st = pose.stateTime
  const lowBreath = pose.breath < CONFIG.lowBreath
  const face: Face = { eyes: 'dot', mouth: 'dot', sweat: false }
  let tg: Target = { ...BASE }

  switch (pose.state) {
    case 'surfaceIdle': {
      // 둥실거리며 가끔 고개 갸웃 / 두리번 / 테왁 다시 끌어안기
      const g = a.gesture ? Math.min(1, a.gestureT / 1.6) : 0
      const env = hump(g)
      if (a.gesture === 'tilt') tg.headRoll = 0.3 * env
      if (a.gesture === 'look') tg.headYaw = Math.sin(g * Math.PI * 2) * 0.65 * Math.sin(Math.PI * g)
      if (a.gesture === 'hug') {
        tg.armX = -1.3
        tg.armZ = -0.55 * env - 0.35 * (1 - env)
        tg.stretch = 1 - 0.06 * env
        face.eyes = env > 0.3 ? 'happy' : 'dot'
      }
      break
    }
    case 'surfaceSwim':
      tg = { ...tg, pitch: 0.38, roll: Math.sin(a.kickPhase * Math.PI * 2) * 0.1, kickAmp: 0.5, kickFreq: 6.5, armX: -1.25 }
      break
    case 'entering': {
      if (st < CONFIG.enterCrouch) {
        // 준비: 살짝 웅크리고 팔을 머리 위로
        tg = { ...tg, pitch: -0.2, headTilt: 0.25, armX: -2.9, armZ: 0.1, stretch: 0.8, kickAmp: 0.05, goggles: 1 }
      } else {
        // 몸 전체를 앞으로 돌려 머리부터 쏙 (머리가 아래로 약 75°)
        tg = { ...tg, pitch: 2.9, armX: -3.05, armZ: 0.05, stretch: 1.14, kickAmp: 0.5, kickFreq: 6, goggles: 1 }
      }
      face.eyes = 'line'
      break
    }
    case 'descending':
      // 머리를 아래로, 팔은 머리 위로 모으고 다리로 파닥파닥 차며 내려감
      tg = {
        ...tg, pitch: 2.82 + Math.sin(t * 1.4) * 0.04, roll: Math.sin(a.kickPhase * Math.PI * 2) * 0.06,
        armX: -3.05, armZ: 0.1, kickAmp: 0.9, kickFreq: 4.2, stretch: 1.06, goggles: 1,
      }
      face.eyes = 'round'
      break
    case 'underIdle':
      // 바닥 위에 엎드려 떠 있기: 팔로 살살 물을 저으며 개구리발
      tg = { ...tg, pitch: 1.3, headTilt: -0.35, armX: -1.5 + Math.sin(t * 2) * 0.3, armZ: 0.7, kickAmp: 0.8, kickFreq: 0.9, frog: 1, goggles: 1 }
      face.eyes = 'round'
      break
    case 'underSwim': {
      // 개구리헤엄: 다리를 모았다 차는 박자에 맞춰 팔도 젓기
      const s = (Math.sin(a.kickPhase * Math.PI * 2) + 1) / 2
      tg = {
        ...tg, pitch: 1.45, headTilt: -0.3, armX: -2.7 + 1.0 * s, armZ: 0.15 + 0.75 * s, kickAmp: 1, kickFreq: 1.5,
        frog: 1, goggles: 1, stretch: 1 + 0.06 * (1 - s),
      }
      face.eyes = 'round'
      break
    }
    case 'harvesting': {
      tg.goggles = 1
      tg.frog = 1
      tg.kickAmp = 0.5
      tg.kickFreq = 0.8
      if (st < CONFIG.harvestReach) {
        // 손 뻗기
        tg = { ...tg, pitch: 1.5, armX: -2.3, armZ: -0.1 }
        face.eyes = 'round'
      } else if (st < CONFIG.harvestShowEnd) {
        // 두 손으로 들어 올려 보여주기 (^^)
        const k = (st - CONFIG.harvestReach) / (CONFIG.harvestShowEnd - CONFIG.harvestReach)
        tg = { ...tg, pitch: 0.2, headTilt: -0.12, armX: -2.15 + Math.sin(k * Math.PI * 4) * 0.08, armZ: -0.3, stretch: 1.04 }
        face.eyes = 'happy'
        face.mouth = 'smile'
      } else {
        // 망사리에 넣기
        tg = { ...tg, pitch: 0.5, armX: -0.4, armZ: 0.5 }
        face.eyes = 'happy'
        face.mouth = 'smile'
      }
      break
    }
    case 'ascending':
      tg = {
        ...tg, pitch: -0.15, headTilt: -0.35, armX: 0.25, armZ: 0.3, kickAmp: 0.65, kickFreq: 6.5,
        goggles: 1, stretch: 1.12,
      }
      face.eyes = 'round'
      break
    case 'sumbi': {
      if (st < CONFIG.sumbiPuff) {
        // 고개를 젖히고 볼 빵빵, 입 동그랗게 "호오이~"
        const k = smoothstep(0, 0.2, st)
        tg = { ...tg, headTilt: -0.55 * k, cheeks: k, pitch: -0.05 }
        face.eyes = 'line'
        face.mouth = 'o'
      } else {
        // 후련한 표정
        tg = { ...tg, headTilt: 0.08, pitch: 0.15 }
        face.eyes = 'happy'
        face.mouth = 'smile'
      }
      break
    }
  }

  // 숨이 부족하면 볼이 살짝 부풀고 땀 한 방울
  if (lowBreath && pose.state !== 'sumbi' && pose.state !== 'surfaceIdle' && pose.state !== 'surfaceSwim') {
    tg.cheeks = Math.max(tg.cheeks, 0.4)
    face.sweat = true
  }
  // 채집 직후 잠깐 눈웃음
  if (a.happyT > 0 && face.eyes !== 'line') {
    face.eyes = 'happy'
    face.mouth = 'smile'
  }
  // 인사하는 동안 눈웃음
  if (pose.waveTime >= 0 && face.eyes === 'dot') face.eyes = 'happy'

  return { tg, face }
}

const EYE_X = 0.1
const EYE_Y = -0.07
const CHEEK_X = 0.205
const CHEEK_Y = -0.135
const MOUTH_Y = -0.155

export function Haenyeo({ pose, look }: { pose: HaenyeoPose; look: HaenyeoLook }) {
  const pop = useRef<Group>(null!)
  const squash = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const head = useRef<Group>(null!)
  const goggles = useRef<Group>(null!)
  const armL = useRef<Group>(null!)
  const armR = useRef<Group>(null!)
  const legL = useRef<Group>(null!)
  const legR = useRef<Group>(null!)
  const cheekL = useRef<Mesh>(null!)
  const cheekR = useRef<Mesh>(null!)
  const held = useRef<Group>(null!)
  const sweat = useRef<Mesh>(null!)
  const eyeSets = useRef<Record<Eyes, Group | null>>({ dot: null, round: null, happy: null, line: null })
  const mouths = useRef<Record<Mouth, Mesh | null>>({ dot: null, o: null, smile: null })
  const heldMeshes = useRef<Record<ItemType, Mesh | null>>({ conch: null, abalone: null, urchin: null })

  const anim = useRef<Anim>({
    ...BASE,
    kickPhase: look.phase * 10,
    prevState: pose.state,
    popT: -1,
    happyT: 0,
    gesture: null,
    gestureT: 0,
    nextGesture: 2 + look.phase * 3,
    nextBlink: 1 + look.phase * 3,
  })

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime + look.phase * 7
    const a = anim.current

    // ── 상태 전환 감지 ──
    if (pose.state !== a.prevState) {
      if (a.prevState === 'ascending') a.popT = 0 // 수면 위로 퐁
      if (a.prevState === 'harvesting') a.happyT = 0.7
      a.prevState = pose.state
      a.gesture = null
    }
    if (a.popT >= 0) a.popT = a.popT > 0.7 ? -1 : a.popT + dt
    a.happyT = Math.max(0, a.happyT - dt)

    // 대기 몸짓 스케줄
    if (pose.state === 'surfaceIdle') {
      if (a.gesture) {
        a.gestureT += dt
        if (a.gestureT > 1.6) a.gesture = null
      } else if (pose.stateTime > 1.5 && t > a.nextGesture) {
        const all: Gesture[] = ['tilt', 'look', 'hug']
        a.gesture = all[Math.floor(Math.random() * all.length)]
        a.gestureT = 0
        a.nextGesture = t + 3.5 + Math.random() * 4
      }
    }

    const { tg, face } = computeTarget(pose, a, t)
    const k = damp(8, dt)
    const lerpKeys: (keyof Target)[] = [
      'roll', 'headTilt', 'headYaw', 'headRoll', 'armX', 'armZ', 'kickAmp', 'kickFreq', 'frog', 'stretch',
    ]
    for (const key of lerpKeys) a[key] += (tg[key] - a[key]) * k
    // 입수 회전은 빠르게, 하강 → 엎드림 전환은 천천히 부드럽게
    const pitchRate = pose.state === 'entering' ? 9 : pose.state === 'underIdle' || pose.state === 'underSwim' ? 3.2 : 5
    a.pitch += (tg.pitch - a.pitch) * damp(pitchRate, dt)
    a.goggles += (tg.goggles - a.goggles) * damp(9, dt)
    a.cheeks += (tg.cheeks - a.cheeks) * damp(10, dt)
    a.kickPhase += dt * a.kickFreq * (0.6 + pose.move * 0.6)

    // ── 몸 전체: 퐁 튀어오름 + 늘어남/눌림 ──
    let popY = 0
    let stretch = a.stretch
    if (a.popT >= 0) {
      const p = a.popT
      popY = 0.22 * hump(Math.min(1, p / 0.45))
      if (p < 0.22) stretch = 1.14 - 0.14 * (p / 0.22)
      else stretch = 1 - 0.18 * hump((p - 0.22) / 0.42)
    }
    pop.current.position.y = popY + Math.sin(t * 2.2) * 0.012
    const side = 1 / Math.sqrt(stretch)
    squash.current.scale.set(side, stretch, side)

    body.current.rotation.set(a.pitch, 0, a.roll)
    head.current.rotation.set(a.headTilt, a.headYaw, a.headRoll)

    // 물안경: 이마 위 ↔ 눈 위
    goggles.current.rotation.x = -0.8 * (1 - a.goggles)

    // ── 팔 ──
    armL.current.rotation.set(a.armX, 0, a.armZ)
    armR.current.rotation.set(a.armX, 0, -a.armZ)
    if (pose.waveTime >= 0) {
      // 짧은 팔로 파닥파닥
      const w = smoothstep(0, 0.18, pose.waveTime) * (1 - smoothstep(CONFIG.waveDuration - 0.25, CONFIG.waveDuration, pose.waveTime))
      const flap = Math.sin(pose.waveTime * 22) * 0.45
      armR.current.rotation.x = armR.current.rotation.x * (1 - w) - 0.25 * w
      armR.current.rotation.z = armR.current.rotation.z * (1 - w) + (-2.45 + flap) * w
      body.current.rotation.z += Math.sin(pose.waveTime * 11) * 0.05 * w
    }

    // ── 다리: 파닥파닥 ↔ 개구리헤엄 ──
    const ph = a.kickPhase * Math.PI * 2
    const flutter = Math.sin(ph) * a.kickAmp * (1 - a.frog)
    const s = (Math.sin(ph) + 1) / 2
    const frogZ = (0.15 + 0.55 * s) * a.frog * a.kickAmp
    const frogX = (0.55 * s - 0.15) * a.frog * a.kickAmp
    legL.current.rotation.set(flutter + frogX, 0, frogZ)
    legR.current.rotation.set(-flutter + frogX, 0, -frogZ)

    // ── 얼굴 ──
    if (t > a.nextBlink + 0.13) a.nextBlink = t + 2 + Math.random() * 3
    const blinking = t > a.nextBlink
    for (const key of Object.keys(eyeSets.current) as Eyes[]) {
      const g = eyeSets.current[key]
      if (!g) continue
      g.visible = key === face.eyes
      if (g.visible && (key === 'dot' || key === 'round')) g.scale.y = blinking ? 0.12 : 1
    }
    for (const key of Object.keys(mouths.current) as Mouth[]) {
      const m = mouths.current[key]
      if (m) m.visible = key === face.mouth
    }
    const puff = 1 + a.cheeks * 0.85
    cheekL.current.scale.set(puff, 0.62 * puff, 0.32 * puff)
    cheekR.current.scale.set(puff, 0.62 * puff, 0.32 * puff)
    sweat.current.visible = face.sweat
    if (face.sweat) sweat.current.position.y = 0.06 - ((t * 0.12) % 0.06)

    // ── 손에 든 해산물 ──
    const st = pose.stateTime
    const showing = pose.state === 'harvesting' && pose.heldItem && st > CONFIG.harvestReach
    held.current.visible = !!showing
    if (showing) {
      const tuck = smoothstep(CONFIG.harvestShowEnd, CONFIG.harvestDuration, st)
      const rise = ease(Math.min(1, (st - CONFIG.harvestReach) / 0.25))
      held.current.position.set(0.12 * tuck, 0.0 + 0.1 * rise - 0.25 * tuck, 0.3 + 0.08 * rise - 0.15 * tuck)
      held.current.scale.setScalar(0.85 * (1 - tuck * 0.7))
      held.current.rotation.y = st * 2
      for (const key of Object.keys(heldMeshes.current) as ItemType[]) {
        const m = heldMeshes.current[key]
        if (m) m.visible = key === pose.heldItem
      }
    }
  })

  const ez = headSurfaceZ(EYE_X, EYE_Y)
  const cz = headSurfaceZ(CHEEK_X, CHEEK_Y) - 0.012
  const mz = headSurfaceZ(0, MOUTH_Y)

  /** 눈 한 쌍 (표정마다 한 세트, 하나만 보임) */
  const eyePair = (kind: Eyes) => (
    <group
      key={kind}
      ref={(g) => {
        eyeSets.current[kind] = g
      }}
      position={[0, EYE_Y, 0]}
      visible={kind === 'dot'}
    >
      {[EYE_X, -EYE_X].map((x) => (
        <mesh
          key={x}
          geometry={kind === 'happy' ? GEO.eyeHappy : kind === 'line' ? GEO.eyeLine : GEO.eyeDot}
          material={MAT.eye}
          position={[x, kind === 'happy' ? -0.012 : 0, ez - 0.004]}
          rotation={[0, x * 1.2, 0]}
          scale={kind === 'round' ? [1.3, 1.3, 0.55] : kind === 'dot' ? [1, 1.05, 0.5] : 1}
        />
      ))}
    </group>
  )

  return (
    <group scale={look.height}>
      <group ref={pop}>
        <group ref={squash}>
          <group ref={body}>
            {/* 몸통: 통통한 종 모양 잠수복 */}
            <mesh geometry={GEO.body} material={MAT.suit} castShadow />
            <mesh geometry={GEO.collar} material={MAT.suitTrim} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} />

            {/* 머리 */}
            <group ref={head} position={[0, HEAD_Y, 0]}>
              <mesh geometry={GEO.head} material={MAT.skin} castShadow />
              <mesh geometry={GEO.towel} material={look.towel} />
              <mesh
                geometry={GEO.towelRim}
                material={look.towel}
                position={[0, HEAD_R * HEAD_SCALE[1] * Math.cos(1.08), 0]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={[HEAD_SCALE[0], HEAD_SCALE[2], 1]}
              />
              <mesh geometry={GEO.knot} material={look.towel} position={[0, 0.17, -0.27]} scale={[1.25, 0.8, 0.85]} />

              {/* 얼굴: 눈은 얼굴 아래쪽에 작게 */}
              {(['dot', 'round', 'happy', 'line'] as Eyes[]).map(eyePair)}
              <mesh ref={cheekL} geometry={GEO.cheek} material={MAT.cheek} position={[CHEEK_X, CHEEK_Y, cz]} rotation={[0, 0.6, 0]} />
              <mesh ref={cheekR} geometry={GEO.cheek} material={MAT.cheek} position={[-CHEEK_X, CHEEK_Y, cz]} rotation={[0, -0.6, 0]} />
              <mesh
                ref={(m) => {
                  mouths.current.dot = m
                }}
                geometry={GEO.mouthDot}
                material={MAT.mouth}
                position={[0, MOUTH_Y, mz]}
                scale={[1.2, 0.8, 0.5]}
              />
              <mesh
                ref={(m) => {
                  mouths.current.o = m
                }}
                geometry={GEO.mouthO}
                material={MAT.mouth}
                position={[0, MOUTH_Y - 0.01, mz]}
                visible={false}
              />
              <mesh
                ref={(m) => {
                  mouths.current.smile = m
                }}
                geometry={GEO.mouthSmile}
                material={MAT.mouth}
                position={[0, MOUTH_Y + 0.008, mz]}
                visible={false}
              />
              <mesh ref={sweat} geometry={GEO.sweat} material={MAT.sweat} position={[-0.31, 0.06, 0.15]} visible={false} />

              {/* 물안경 (머리 중심 기준으로 회전해 이마 ↔ 눈) */}
              <group ref={goggles}>
                {[EYE_X, -EYE_X].map((x) => (
                  <group key={x} position={[x, EYE_Y, ez + 0.012]} rotation={[0, x * 2.4, 0]}>
                    <mesh geometry={GEO.goggleRim} material={MAT.goggleFrame} />
                    <mesh geometry={GEO.goggleGlass} material={MAT.goggleGlass} position={[0, 0, 0.004]} />
                  </group>
                ))}
                <mesh geometry={GEO.goggleBridge} material={MAT.goggleFrame} position={[0, EYE_Y + 0.01, ez + 0.02]} />
              </group>
            </group>

            {/* 팔 (어깨 피벗) — 짧고 끝이 둥글게 */}
            {(
              [
                [armL, 0.185],
                [armR, -0.185],
              ] as const
            ).map(([ref, x]) => (
              <group key={x} ref={ref} position={[x, 0.05, 0]}>
                <mesh geometry={GEO.arm} material={MAT.suit} position={[0, -0.09, 0]} />
                <mesh geometry={GEO.hand} material={MAT.skin} position={[0, -0.18, 0]} />
              </group>
            ))}

            {/* 들어 보이는 해산물 */}
            <group ref={held} visible={false}>
              {(['conch', 'abalone', 'urchin'] as ItemType[]).map((it) => (
                <mesh
                  key={it}
                  ref={(m) => {
                    heldMeshes.current[it] = m
                  }}
                  geometry={SEAFOOD_GEOMETRY[it]}
                  material={SEAFOOD_MATERIAL[it]}
                />
              ))}
            </group>

            {/* 다리 + 둥근 오리발 */}
            {(
              [
                [legL, 0.09],
                [legR, -0.09],
              ] as const
            ).map(([ref, x]) => (
              <group key={x} ref={ref} position={[x, -0.25, 0]}>
                <mesh geometry={GEO.leg} material={MAT.suit} position={[0, -0.05, 0]} />
                <mesh geometry={GEO.fin} material={MAT.fin} position={[0, -0.12, 0]} />
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  )
}
