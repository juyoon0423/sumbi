import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { audio } from '../../../audio/AudioEngine'
import { seededRandom } from '../../../lib/math'
import { player } from '../../../player/runtime'
import { terrainY } from '../../terrain'
import { FAR } from './friendsConfig'
import { friendsDebug, pickSpots, underView } from './lifeUtil'
import { denRockGeometry, octopusGeometry, squidArmGeometry, squidBodyGeometry } from './models'
import { lifeMaterial } from './shapes'

// 한치(오징어)와 문어.

const squidMat = lifeMaterial({ transparent: true, opacity: 0.88, roughness: 0.35 })
const squidArmMat = lifeMaterial({ transparent: true, opacity: 0.85, roughness: 0.4 })
const octoMat = lifeMaterial({ roughness: 0.55 })
const rockMat = lifeMaterial({ roughness: 0.95, flatShading: true })

let squidBody: ReturnType<typeof squidBodyGeometry> | null = null
let squidArm: ReturnType<typeof squidArmGeometry> | null = null
let squidTentacle: ReturnType<typeof squidArmGeometry> | null = null

const to = new Vector3()

// ── 한치: 몸을 오므렸다 펴며 쭉 나아가고, 다리는 뒤로 살랑 ──

interface SquidState {
  pos: Vector3
  yaw: number
  pitch: number
  speed: number
  /** 다음 오므리기까지 */
  pulseIn: number
  /** 오므린 뒤 지난 시간 */
  since: number
  target: Vector3
  home: Vector3
}

function Squid({ seed, home, index }: { seed: number; home: Vector3; index: number }) {
  squidBody ??= squidBodyGeometry()
  squidArm ??= squidArmGeometry(false)
  squidTentacle ??= squidArmGeometry(true)
  const group = useRef<Group>(null!)
  const mantle = useRef<Group>(null!)
  const arms = useRef<(Group | null)[]>([])
  const st = useMemo<SquidState>(() => {
    const rand = seededRandom(seed)
    return {
      pos: home.clone(),
      yaw: rand() * Math.PI * 2,
      pitch: 0,
      speed: 0.2,
      pulseIn: rand() * 2,
      since: 9,
      target: home.clone(),
      home,
    }
  }, [seed, home])
  // 다리 10개 (8 + 긴 촉완 2): 머리 뒤 둥글게
  const armLayout = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, long: i === 2 || i === 7 })),
    [],
  )

  useFrame(({ camera, clock }, rawDt) => {
    const g = group.current
    g.visible = underView() && camera.position.distanceTo(st.pos) < FAR
    if (!g.visible) return
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime

    // 해녀가 가까우면 반대쪽으로 쭉
    const away = to.copy(st.pos).sub(player.pos)
    const near = away.length() < 2.4
    if (near && st.since > 0.6) {
      st.target.copy(st.pos).addScaledVector(away.normalize(), 5)
      st.pulseIn = 0
    }
    // 목적지에 닿으면 집 둘레에서 새로
    if (st.pos.distanceTo(st.target) < 1) {
      const a = Math.random() * Math.PI * 2
      st.target.set(st.home.x + Math.cos(a) * 4, st.home.y + (Math.random() - 0.5) * 1.2, st.home.z + Math.sin(a) * 4)
    }
    st.pulseIn -= dt
    st.since += dt
    if (st.pulseIn <= 0) {
      st.since = 0
      st.speed = near ? 2.2 : 1.1
      st.pulseIn = 1.8 + Math.random() * 1.4
    }
    st.speed += (0.12 - st.speed) * Math.min(1, dt * 1.5)

    // 목적지 쪽으로 천천히 돌기
    to.copy(st.target).sub(st.pos)
    const wantYaw = Math.atan2(to.x, to.z)
    let dy = wantYaw - st.yaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    st.yaw += dy * Math.min(1, dt * 1.2)
    const wantPitch = Math.atan2(-to.y, Math.hypot(to.x, to.z)) * 0.6
    st.pitch += (wantPitch - st.pitch) * Math.min(1, dt)
    st.pos.x += Math.sin(st.yaw) * Math.cos(st.pitch) * st.speed * dt
    st.pos.z += Math.cos(st.yaw) * Math.cos(st.pitch) * st.speed * dt
    st.pos.y -= Math.sin(st.pitch) * st.speed * dt
    st.pos.y = Math.min(-0.9, Math.max(terrainY(st.pos.x, st.pos.z) + 0.8, st.pos.y))

    friendsDebug.squids[index] = st.pos
    g.position.copy(st.pos)
    g.rotation.set(st.pitch, st.yaw, 0, 'YXZ')
    // 오므리기: 처음 0.3초 동안 몸이 가늘고 길어짐
    const squeeze = st.since < 0.3 ? Math.sin((st.since / 0.3) * Math.PI) : 0
    mantle.current.scale.set(1 - 0.18 * squeeze, 1 - 0.18 * squeeze, 1 + 0.08 * squeeze)
    // 다리: 나아갈 때는 모이고, 미끄러질 때는 살짝 퍼져 살랑
    const spread = 0.12 + 0.22 * Math.min(1, st.since / 1.2)
    armLayout.forEach((arm, i) => {
      const el = arms.current[i]
      if (!el) return
      const sway = Math.sin(t * 3 + i * 0.9) * 0.12
      el.rotation.set(Math.cos(arm.a) * (spread + sway), Math.sin(arm.a) * (spread + sway), 0)
    })
  })

  return (
    <group ref={group} visible={false}>
      <group ref={mantle}>
        <mesh geometry={squidBody} material={squidMat} />
      </group>
      {armLayout.map((arm, i) => (
        <group
          key={i}
          ref={(el) => {
            arms.current[i] = el
          }}
          position={[Math.sin(arm.a) * 0.022, Math.cos(arm.a) * 0.022, -0.09]}
        >
          <mesh geometry={arm.long ? squidTentacle! : squidArm!} material={squidArmMat} />
        </group>
      ))}
    </group>
  )
}

export function Squids({ n }: { n: number }) {
  const homes = useMemo(
    () => pickSpots(51, n, { maxY: -5, radius: 24, gap: 8 }).map((s) => new Vector3(s.x, s.y + 2.4, s.z)),
    [n],
  )
  return (
    <>
      {homes.map((h, i) => (
        <Squid key={i} seed={70 + i} home={h} index={i} />
      ))}
    </>
  )
}

// ── 문어: 바위 틈에서 가끔 빼꼼, 해녀가 다가가면 쏙 ──

type OctoMode = 'hidden' | 'rising' | 'peeking' | 'lowering' | 'ducking'

let octoGeo: ReturnType<typeof octopusGeometry> | null = null

/** 개발·캡처용: 문어 자리·상태 보기, 모두 바로 빼꼼 */
export const octopusDebug = {
  dens: [] as { x: number; y: number; z: number }[],
  modes: [] as OctoMode[],
  peekers: [] as (() => void)[],
  peekNow: () => octopusDebug.peekers.forEach((f) => f?.()),
}

function Octopus({ den, index }: { den: { x: number; y: number; z: number; r: number }; index: number }) {
  octoGeo ??= octopusGeometry()
  const rocks = useMemo(() => denRockGeometry(den.r * 6), [den.r])
  const body = useRef<Group>(null!)
  const root = useRef<Group>(null!)
  const st = useRef({ mode: 'hidden' as OctoMode, t: 0, wait: 2 + den.r * 6, rise: 0, yaw: 0 })
  const center = useMemo(() => new Vector3(den.x, den.y, den.z), [den])
  const facing = den.r * Math.PI * 2

  useEffect(() => {
    octopusDebug.dens[index] = { x: den.x, y: den.y, z: den.z }
    octopusDebug.peekers[index] = () => {
      st.current.mode = 'rising'
      st.current.t = 0
    }
  }, [den, index])

  useFrame(({ camera, clock }, rawDt) => {
    const r = root.current
    r.visible = underView() && camera.position.distanceTo(center) < FAR
    if (!r.visible) return
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    s.t += dt
    const d = Math.hypot(player.pos.x - den.x, player.pos.y - den.y, player.pos.z - den.z)
    const close = d < 3.2
    switch (s.mode) {
      case 'hidden':
        // 해녀가 근처에 있으면 숨어 있음
        if (close || d < 4.5) s.t = Math.min(s.t, 0)
        if (s.t > s.wait) {
          s.mode = 'rising'
          s.t = 0
        }
        break
      case 'rising':
        s.rise = Math.min(1, s.t / 0.9)
        if (close) {
          s.mode = 'ducking'
          s.t = 0
        } else if (s.rise >= 1) {
          s.mode = 'peeking'
          s.t = 0
        }
        break
      case 'peeking':
        if (close) {
          s.mode = 'ducking'
          s.t = 0
          // "쏙"
          if (d < 7) audio.playPop(0.35)
        } else if (s.t > 3.5 + Math.random() * 0.02 + den.r * 3) {
          s.mode = 'lowering'
          s.t = 0
        }
        break
      case 'lowering':
        s.rise = Math.max(0, 1 - s.t / 0.9)
        if (close) {
          s.mode = 'ducking'
          s.t = 0
        } else if (s.rise <= 0) {
          s.mode = 'hidden'
          s.t = 0
          s.wait = 4 + Math.random() * 7
        }
        break
      case 'ducking':
        // 0.2초 만에 쏙
        s.rise = Math.max(0, s.rise - dt / 0.2)
        if (s.rise <= 0) {
          s.mode = 'hidden'
          s.t = 0
          s.wait = 5 + Math.random() * 6
        }
        break
    }
    octopusDebug.modes[index] = s.mode
    const ease = s.rise * s.rise * (3 - 2 * s.rise)
    const b = body.current
    // 숨으면 모래 밑(지형 아래)으로, 빼꼼은 눈까지만 바위 위로
    b.position.y = -0.62 + ease * 0.6 + Math.sin(clock.elapsedTime * 1.6 + index) * 0.015 * ease
    b.scale.setScalar(0.75 + 0.25 * ease)
    // 눈은 해녀 쪽으로 (조금만)
    const want = Math.atan2(player.pos.x - den.x, player.pos.z - den.z) - facing
    const lim = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(want), Math.cos(want))))
    s.yaw += (lim * ease - s.yaw) * Math.min(1, dt * 2)
    b.rotation.y = s.yaw
  })

  return (
    <group ref={root} position={[den.x, den.y, den.z]} rotation={[0, facing, 0]} visible={false}>
      <mesh geometry={rocks} material={rockMat} />
      <group ref={body}>
        <mesh geometry={octoGeo} material={octoMat} />
      </group>
    </group>
  )
}

export function Octopuses({ n }: { n: number }) {
  const dens = useMemo(() => {
    octopusDebug.dens = []
    octopusDebug.modes = []
    octopusDebug.peekers = []
    return pickSpots(33, n, { maxY: -4.5, radius: 18, gap: 9 })
  }, [n])
  return (
    <>
      {dens.map((d, i) => (
        <Octopus key={i} den={d} index={i} />
      ))}
    </>
  )
}
