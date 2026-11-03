import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, SpriteMaterial, Vector3 } from 'three'
import { seededRandom } from '../../../lib/math'
import { player } from '../../../player/runtime'
import { terrainY } from '../../terrain'
import { env } from '../../time/env'
import { FAR } from './friendsConfig'
import { friendsDebug, pickSpots, underView } from './lifeUtil'
import {
  crabBodyGeometry,
  crabClawGeometry,
  crabLegGeometry,
  hermitBodyGeometry,
  hermitShellGeometry,
  jellyBellGeometry,
  jellyTentacleGeometry,
  starfishGeometry,
} from './models'
import { lifeMaterial, softDotTexture } from './shapes'

// 바닥 생물(불가사리·게·소라게)과 깊은 곳 해파리.

const dummy = new Object3D()
const mat = lifeMaterial({ roughness: 0.6 })

// ── 별불가사리: 움직이지 않음 → 인스턴스 하나로 한 번만 배치 ──

const STAR_COLORS = ['#e2793b', '#d24f3a', '#f0a33c', '#5a62b0', '#c9563f', '#e8873f']

export function Starfish({ n }: { n: number }) {
  const ref = useRef<InstancedMesh>(null!)
  const geo = useMemo(() => starfishGeometry(), [])
  const spots = useMemo(() => pickSpots(91, n, { maxY: -3, radius: 30, gap: 1.6 }), [n])
  friendsDebug.starfish = spots
  useLayoutEffect(() => {
    const m = ref.current
    const c = new Color()
    spots.forEach((s, i) => {
      dummy.position.set(s.x, terrainY(s.x, s.z) + 0.015, s.z)
      dummy.rotation.set((s.r - 0.5) * 0.25, s.r * 9, (s.r - 0.5) * 0.2)
      dummy.scale.setScalar(0.8 + s.r * 0.6)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, c.set(STAR_COLORS[Math.floor(s.r * 997) % STAR_COLORS.length]))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [spots])
  useFrame(() => {
    ref.current.visible = underView()
  })
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} receiveShadow />
}

// ── 게: 옆으로 종종 걷다 멈췄다, 해녀가 오면 후다닥 + 집게 번쩍 ──

let crabGeo: { body: ReturnType<typeof crabBodyGeometry>; claw: ReturnType<typeof crabClawGeometry>; leg: ReturnType<typeof crabLegGeometry> } | null = null

function Crab({ home, seed }: { home: { x: number; z: number }; seed: number }) {
  crabGeo ??= { body: crabBodyGeometry(), claw: crabClawGeometry(), leg: crabLegGeometry() }
  const root = useRef<Group>(null!)
  const legsL = useRef<Group>(null!)
  const legsR = useRef<Group>(null!)
  const clawL = useRef<Group>(null!)
  const clawR = useRef<Group>(null!)
  const st = useMemo(() => {
    const rand = seededRandom(seed)
    return { axis: rand() * Math.PI, s: 0, goal: 0, pause: rand() * 2, fright: 0, speed: 0.22 }
  }, [seed])
  const pos = useMemo(() => new Vector3(home.x, 0, home.z), [home])

  useFrame(({ camera, clock }, rawDt) => {
    const r = root.current
    r.visible = underView() && camera.position.distanceTo(pos) < FAR * 0.7
    if (!r.visible) return
    const dt = Math.min(rawDt, 0.05)
    const dx = Math.cos(st.axis)
    const dz = -Math.sin(st.axis)
    const pd = Math.hypot(player.pos.x - pos.x, player.pos.y - pos.y, player.pos.z - pos.z)
    if (pd < 1.9 && st.fright <= 0) {
      // 해녀 반대쪽 끝으로 후다닥
      const side = (player.pos.x - pos.x) * dx + (player.pos.z - pos.z) * dz
      st.goal = side > 0 ? -1.4 : 1.4
      st.fright = 1.6
      st.pause = 0
    }
    st.fright -= dt
    const walking = st.pause <= 0 && Math.abs(st.goal - st.s) > 0.02
    if (st.pause > 0) st.pause -= dt
    else if (!walking) {
      st.goal = (Math.random() * 2 - 1) * 1.2
      st.pause = 1 + Math.random() * 2.5
    }
    const speed = st.fright > 0 ? 0.9 : st.speed
    if (walking) st.s += Math.sign(st.goal - st.s) * Math.min(Math.abs(st.goal - st.s), speed * dt)
    pos.x = home.x + dx * st.s
    pos.z = home.z + dz * st.s
    pos.y = terrainY(pos.x, pos.z)
    r.position.copy(pos)
    r.rotation.y = st.axis
    const t = clock.elapsedTime
    const step = walking ? Math.sin(t * (st.fright > 0 ? 26 : 14)) * 0.35 : 0
    legsL.current.rotation.z = step
    legsR.current.rotation.z = -step
    // 놀라면 집게를 번쩍
    const up = st.fright > 0 ? -0.9 : Math.sin(t * 0.8 + seed) * 0.08
    clawL.current.rotation.x = up
    clawR.current.rotation.x = up
  })

  const legs = (side: 1 | -1) =>
    [-0.03, 0, 0.03].map((z, i) => (
      <mesh key={i} geometry={crabGeo!.leg} material={mat} position={[side * 0.06, 0, z]} scale={[side, 1, 1]} rotation={[0, side * (i - 1) * 0.35, 0]} />
    ))

  return (
    <group ref={root} visible={false} scale={1.6}>
      <mesh geometry={crabGeo.body} material={mat} />
      <group ref={legsL}>{legs(1)}</group>
      <group ref={legsR}>{legs(-1)}</group>
      <group ref={clawL} position={[0.07, 0.04, 0.06]}>
        <mesh geometry={crabGeo.claw} material={mat} />
      </group>
      <group ref={clawR} position={[-0.07, 0.04, 0.06]}>
        <mesh geometry={crabGeo.claw} material={mat} />
      </group>
    </group>
  )
}

// ── 소라게: 아주 천천히 기어다니다, 해녀가 오면 껍데기 속으로 ──

let hermitGeo: { shell: ReturnType<typeof hermitShellGeometry>; body: ReturnType<typeof hermitBodyGeometry> } | null = null

function Hermit({ home, seed }: { home: { x: number; z: number }; seed: number }) {
  hermitGeo ??= { shell: hermitShellGeometry(), body: hermitBodyGeometry() }
  const root = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const st = useMemo(() => ({ yaw: seededRandom(seed)() * 6.28, hide: 0, out: 1 }), [seed])
  const pos = useMemo(() => new Vector3(home.x, 0, home.z), [home])

  useFrame(({ camera, clock }, rawDt) => {
    const r = root.current
    r.visible = underView() && camera.position.distanceTo(pos) < FAR * 0.6
    if (!r.visible) return
    const dt = Math.min(rawDt, 0.05)
    const pd = Math.hypot(player.pos.x - pos.x, player.pos.y - pos.y, player.pos.z - pos.z)
    if (pd < 1.7) st.hide = 3
    st.hide -= dt
    const hiding = st.hide > 0
    st.out += ((hiding ? 0 : 1) - st.out) * Math.min(1, dt * (hiding ? 12 : 1.5))
    if (!hiding && st.out > 0.9) {
      // 집에서 멀어지면 돌아섬
      const back = Math.atan2(home.x - pos.x, home.z - pos.z)
      const far = Math.hypot(home.x - pos.x, home.z - pos.z) > 1.3
      st.yaw += far ? Math.atan2(Math.sin(back - st.yaw), Math.cos(back - st.yaw)) * dt : Math.sin(clock.elapsedTime * 0.3 + seed) * 0.3 * dt
      pos.x += Math.sin(st.yaw) * 0.07 * dt
      pos.z += Math.cos(st.yaw) * 0.07 * dt
    }
    pos.y = terrainY(pos.x, pos.z)
    r.position.copy(pos)
    r.rotation.y = st.yaw
    // 걸을 때 껍데기가 뒤뚱
    r.rotation.z = st.out > 0.9 ? Math.sin(clock.elapsedTime * 7 + seed) * 0.06 : 0
    body.current.scale.setScalar(Math.max(0.05, st.out))
    body.current.position.z = -0.04 * (1 - st.out)
  })

  return (
    <group ref={root} visible={false} scale={1.6}>
      <mesh geometry={hermitGeo.shell} material={mat} />
      <group ref={body}>
        <mesh geometry={hermitGeo.body} material={mat} />
      </group>
    </group>
  )
}

export function BottomCritters({ crabs, hermits }: { crabs: number; hermits: number }) {
  const crabSpots = useMemo(() => pickSpots(61, crabs, { maxY: -3.5, radius: 20, gap: 4 }), [crabs])
  const hermitSpots = useMemo(() => pickSpots(67, hermits, { maxY: -3.5, radius: 18, gap: 5 }), [hermits])
  friendsDebug.crabs = crabSpots
  friendsDebug.hermits = hermitSpots
  return (
    <>
      {crabSpots.map((s, i) => (
        <Crab key={`c${i}`} home={s} seed={300 + i} />
      ))}
      {hermitSpots.map((s, i) => (
        <Hermit key={`h${i}`} home={s} seed={400 + i} />
      ))}
    </>
  )
}

// ── 해파리: 깊은 곳에 몇 마리, 천천히 둥둥 (밤엔 은은하게 빛남) ──

const jellyMat = lifeMaterial({ transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.2, emissive: new Color('#9fdcff'), emissiveIntensity: 0.1 })
const tentacleMat = new MeshStandardMaterial({ color: '#dff1ff', transparent: true, opacity: 0.45, depthWrite: false, emissive: '#bfe8ff', emissiveIntensity: 0.1 })
/** 밤에 해파리 둘레의 둥근 빛 */
const glowMat = new SpriteMaterial({ map: softDotTexture(), color: '#7fd0ff', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false })

let jellyGeo: { bell: ReturnType<typeof jellyBellGeometry>; tentacle: ReturnType<typeof jellyTentacleGeometry>; arm: ReturnType<typeof jellyTentacleGeometry> } | null = null

function Jelly({ home, seed }: { home: Vector3; seed: number }) {
  jellyGeo ??= { bell: jellyBellGeometry(), tentacle: jellyTentacleGeometry(0.7), arm: jellyTentacleGeometry(0.35) }
  const root = useRef<Group>(null!)
  const bell = useRef<Mesh>(null!)
  const tents = useRef<Group>(null!)
  const pos = useMemo(() => home.clone(), [home])
  const edge = useMemo(() => Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2), [])

  useFrame(({ camera, clock }) => {
    const r = root.current
    r.visible = underView() && camera.position.distanceTo(pos) < FAR
    if (!r.visible) return
    const t = clock.elapsedTime + seed * 1.7
    // 우산을 오므렸다 펴며 조금씩 떠오르고, 천천히 가라앉음
    const cycle = (t % 2.8) / 2.8
    const squeeze = cycle < 0.3 ? Math.sin((cycle / 0.3) * Math.PI) : 0
    pos.set(home.x + Math.sin(t * 0.05) * 1.4, home.y + Math.sin(t * 0.36) * 0.35, home.z + Math.cos(t * 0.043) * 1.4)
    r.position.copy(pos)
    r.rotation.z = Math.sin(t * 0.21) * 0.12
    bell.current.scale.set(1 + 0.1 * squeeze, 1 - 0.16 * squeeze, 1 + 0.1 * squeeze)
    tents.current.children.forEach((c, i) => {
      c.rotation.x = Math.sin(t * 1.3 + i) * 0.18 + squeeze * 0.2
      c.rotation.z = Math.cos(t * 1.1 + i * 0.7) * 0.15
    })
  })

  return (
    <group ref={root} visible={false} scale={1.1}>
      <mesh ref={bell} geometry={jellyGeo.bell} material={jellyMat} renderOrder={2} />
      <sprite material={glowMat} position={[0, 0.02, 0]} scale={0.85} renderOrder={3} />
      <group ref={tents} position={[0, 0.02, 0]}>
        {edge.map((a, i) => (
          <mesh key={i} geometry={jellyGeo!.tentacle} material={tentacleMat} position={[Math.sin(a) * 0.27, 0, Math.cos(a) * 0.27]} renderOrder={2} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={`a${i}`} geometry={jellyGeo!.arm} material={tentacleMat} position={[Math.sin(i * 1.57) * 0.05, 0.04, Math.cos(i * 1.57) * 0.05]} scale={[3, 1, 3]} renderOrder={2} />
        ))}
      </group>
    </group>
  )
}

export function Jellyfish({ n }: { n: number }) {
  const homes = useMemo(
    () => pickSpots(81, n, { maxY: -7.2, radius: 34, gap: 5 }).map((s) => new Vector3(s.x, s.y + 1.8 + s.r * 1.6, s.z)),
    [n],
  )
  friendsDebug.jellies = homes
  // 밤에는 은은하게 빛남 (블룸 문턱 바로 위까지만)
  useFrame(() => {
    const night = env.night
    jellyMat.emissiveIntensity = 0.08 + 1.05 * night
    tentacleMat.emissiveIntensity = 0.06 + 0.7 * night
    glowMat.opacity = 0.4 * night
    glowMat.visible = night > 0.02
  })
  return (
    <>
      {homes.map((h, i) => (
        <Jelly key={i} home={h} seed={i} />
      ))}
    </>
  )
}
