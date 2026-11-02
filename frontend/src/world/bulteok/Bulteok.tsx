import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Group,
} from 'three'
import { audio } from '../../audio/AudioEngine'
import type { ItemType } from '../../config'
import { seededRandom } from '../../lib/math'
import { remotes } from '../../net/remotes'
import { player } from '../../player/runtime'
import { requestSeat, seatRequest } from '../../player/zone'
import { useBulteok } from '../../store/bulteokStore'
import { SEAFOOD_GEOMETRY, SEAFOOD_MATERIAL } from '../sea/seafood/models'
import { rockGeometry, ROCK_MAT } from '../sea/Coast'
import { terrainY } from '../terrain'
import { env } from '../time/env'
import { bulteokFx } from './bulteokFx'
import { BULTEOK, seatPose } from './layout'

// 불턱: 둥근 현무암 돌담(입구는 바다 쪽), 둘러앉는 돌, 가운데 모닥불, 모닥불 앞 공동 대야

const B = BULTEOK

/** 돌담: 돌 세 겹, 입구는 비움 */
function Wall() {
  const geo = useMemo(() => rockGeometry(9), [])
  const stones = useMemo(() => {
    const rand = seededRandom(42)
    const list: { x: number; y: number; z: number; s: number; ry: number }[] = []
    const n = 30
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + layer * 0.1 + B.entrance
        // 입구(바다 쪽) 비우기
        const d = Math.abs(Math.atan2(Math.sin(a - B.entrance), Math.cos(a - B.entrance)))
        if (d < 0.36) continue
        const r = B.wallRadius + (rand() - 0.5) * 0.15
        const x = B.x + Math.cos(a) * r
        const z = B.z + Math.sin(a) * r
        const ground = Math.min(terrainY(x, z), B.y)
        list.push({ x, z, y: ground + 0.22 + layer * 0.36, s: 0.33 + rand() * 0.1 - layer * 0.03, ry: rand() * 6 })
      }
    }
    return list
  }, [])
  const ref = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const o = new Object3D()
    stones.forEach((st, i) => {
      o.position.set(st.x, st.y, st.z)
      o.rotation.set(0, st.ry, 0)
      o.scale.set(st.s * 1.15, st.s, st.s)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [stones])
  return <instancedMesh ref={ref} args={[geo, ROCK_MAT, stones.length]} castShadow receiveShadow />
}

const FLOOR_MAT = new MeshStandardMaterial({ color: '#6f6151', roughness: 1 })
const SEAT_MAT = new MeshStandardMaterial({ color: '#4a4a4f', roughness: 0.95, flatShading: true })

const SEAT_GLOW = new MeshBasicMaterial({ color: '#ffb25e', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false })
const SEAT_RING = new MeshBasicMaterial({
  color: '#ffb766', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
})

/** 내 화면에서 이 자리가 비어 있나 (아무도 앉아 있지 않고, 아무도 가는 중이 아니고, 내가 요청 중도 아님) */
function seatFree(i: number) {
  if (player.zone !== 'bulteok' || i < 0 || i >= 24) return false
  if (player.seat === i || seatRequest.seat === i) return false
  for (const rm of remotes.values()) if (rm.zone === 'bulteok' && rm.seat === i) return false
  return true
}

/** 바닥(평평한 흙) + 앉는 납작 돌 24개. 빈자리에 마우스를 올리면 은은하게 빛나고, 누르면 걸어가 앉음 */
function FloorAndSeats() {
  const seatGeo = useMemo(() => new DodecahedronGeometry(0.26, 0).scale(1.15, 0.45, 1), [])
  const ref = useRef<InstancedMesh>(null!)
  const glow = useRef<Group>(null!)
  const hover = useRef(-1)
  const gl = useThree((s) => s.gl)
  const setHover = (i: number) => {
    hover.current = i
    gl.domElement.style.cursor = i >= 0 ? 'pointer' : ''
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const i = e.instanceId ?? -1
    setHover(e.pointerType === 'mouse' && seatFree(i) ? i : -1)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // 시점을 끌다가 뗀 건 무시 (살짝 흔들린 탭은 허용)
    if (e.delta > 8) return
    const i = e.instanceId ?? -1
    if (!seatFree(i)) return
    e.stopPropagation()
    requestSeat(i)
    setHover(-1)
  }
  useFrame(({ clock }) => {
    // 올려 둔 사이 누가 앉으면 바로 꺼짐
    if (hover.current >= 0 && !seatFree(hover.current)) setHover(-1)
    const i = hover.current
    glow.current.visible = i >= 0
    if (i < 0) return
    const s = seatPose(i)
    glow.current.position.set(s.x, s.stoneY + 0.04, s.z)
    glow.current.rotation.y = i * 1.7
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.2)
    SEAT_GLOW.opacity = 0.32 + 0.2 * k
    SEAT_RING.opacity = 0.35 + 0.25 * k
  })
  useLayoutEffect(() => {
    const o = new Object3D()
    for (let i = 0; i < 24; i++) {
      const s = seatPose(i)
      o.position.set(s.x, s.stoneY + 0.04, s.z)
      o.rotation.set(0, i * 1.7, 0)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <>
      <mesh position={[B.x, B.y - 0.06, B.z]} material={FLOOR_MAT} receiveShadow>
        <cylinderGeometry args={[B.wallRadius + 0.3, B.wallRadius + 0.6, 0.16, 40]} />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[seatGeo, SEAT_MAT, 24]}
        castShadow
        receiveShadow
        onPointerMove={onMove}
        onPointerOut={() => setHover(-1)}
        onClick={onClick}
      />
      <group ref={glow} visible={false}>
        <mesh geometry={seatGeo} material={SEAT_GLOW} scale={1.14} />
        <mesh material={SEAT_RING} position={[0, -0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.46, 32]} />
        </mesh>
      </group>
    </>
  )
}

const LOG_MAT = new MeshStandardMaterial({ color: '#5a3a22', roughness: 1 })
const EMBER_LOG_MAT = new MeshStandardMaterial({ color: '#3a2216', emissive: '#ff5a1a', emissiveIntensity: 0.6, roughness: 1 })

/** 모닥불: 장작 + 돌 둘레 + 흔들리는 불꽃 + 깜빡이는 빛 + 불티 */
function Campfire() {
  const flames = useRef<(Mesh | null)[]>([])
  const light = useRef<PointLight>(null!)
  const core = useRef<Mesh>(null!)
  const flameGeo = useMemo(() => new ConeGeometry(0.2, 0.75, 10, 1, true).translate(0, 0.375, 0), [])
  const flameMats = useMemo(
    () =>
      ['#ff7a1f', '#ffa53a', '#ffd36a', '#ff6a2a'].map(
        (c) => new MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      ),
    [],
  )
  const coreMat = useMemo(() => new MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }), [])
  const ringStones = useMemo(() => {
    const rand = seededRandom(11)
    return Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2
      return { x: Math.cos(a) * 0.58, z: Math.sin(a) * 0.58, s: 0.13 + rand() * 0.05, ry: rand() * 6 }
    })
  }, [])
  const stoneGeo = useMemo(() => rockGeometry(4), [])

  // 불티
  const EMBERS = 40
  const emberGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(EMBERS * 3), 3))
    return g
  }, [])
  const embers = useMemo(() => Array.from({ length: EMBERS }, (_, i) => ({ life: (i / EMBERS) * 2, x: 0, y: 0, z: 0, vx: 0, vz: 0 })), [])
  const emberMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: /* glsl */ `
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 22.0 / -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          void main() {
            float r = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * smoothstep(0.5, 0.0, r), 1.0);
          }
        `,
      }),
    [],
  )
  const emberRef = useRef<Points>(null!)

  useFrame(({ clock, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    flames.current.forEach((m, i) => {
      if (!m) return
      const f = 0.8 + 0.25 * Math.sin(t * (7 + i * 1.7) + i) + 0.12 * Math.sin(t * 17 + i * 3)
      const a = (i / 4) * Math.PI * 2 + t * 0.6
      const off = i === 0 ? 0 : 0.11
      m.position.set(Math.cos(a) * off, 0.05, Math.sin(a) * off)
      m.scale.set(i === 0 ? 0.95 : 0.65, f * (i === 0 ? 0.95 : 0.7), i === 0 ? 0.95 : 0.65)
      m.rotation.set(Math.sin(t * 3 + i) * 0.08, t * (0.8 + i * 0.3), Math.cos(t * 2.5 + i) * 0.08)
    })
    core.current.scale.setScalar(1 + 0.08 * Math.sin(t * 9))
    // 깜빡이는 불빛: 밤에는 더 밝고 멀리
    const night = env.night
    light.current.intensity = (4 + 2.2 * night) * (0.88 + 0.12 * Math.sin(t * 11) * Math.sin(t * 7.3 + 1))
    light.current.distance = 9 + 5 * night

    // 불티
    const pos = emberGeo.attributes.position as BufferAttribute
    embers.forEach((e, i) => {
      e.life += dt
      if (e.life > 2) {
        e.life = 0
        e.x = (Math.random() - 0.5) * 0.3
        e.z = (Math.random() - 0.5) * 0.3
        e.y = 0.2
        e.vx = (Math.random() - 0.5) * 0.25
        e.vz = (Math.random() - 0.5) * 0.25
      }
      e.x += (e.vx + Math.sin(t * 2 + i) * 0.1) * dt
      e.z += e.vz * dt
      e.y += (0.7 + (i % 5) * 0.08) * dt
      pos.setXYZ(i, e.x, e.y, e.z)
    })
    pos.needsUpdate = true
    emberRef.current.visible = true

    // 모닥불 소리: 가까우면 크게
    const d = camera.position.distanceTo(firePos)
    const pd = player.pos.distanceTo(firePos)
    const level = Math.max(0, 1 - (Math.min(d, pd) - 2.5) / 22) ** 2
    audio.setFireLevel(level * 0.9)
  })

  return (
    <group position={[B.x, B.y, B.z]}>
      {/* 장작 */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          material={i % 2 ? LOG_MAT : EMBER_LOG_MAT}
          position={[0, 0.08, 0]}
          rotation={[Math.PI / 2 - 0.35, 0, (i / 4) * Math.PI * 2]}
          castShadow
        >
          <cylinderGeometry args={[0.055, 0.065, 0.75, 8]} />
        </mesh>
      ))}
      {ringStones.map((s, i) => (
        <mesh key={i} geometry={stoneGeo} material={ROCK_MAT} position={[s.x, 0.04, s.z]} scale={s.s} rotation={[0, s.ry, 0]} />
      ))}
      <group position={[0, 0.06, 0]}>
        {flameMats.map((m, i) => (
          <mesh
            key={i}
            ref={(el) => {
              flames.current[i] = el
            }}
            geometry={flameGeo}
            material={m}
          />
        ))}
        <mesh ref={core} material={coreMat} position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.24, 12, 10]} />
        </mesh>
      </group>
      <pointLight ref={light} color="#ff9a4a" intensity={4} distance={9} decay={1.6} position={[0, 0.75, 0]} />
      <points ref={emberRef} geometry={emberGeo} material={emberMat} frustumCulled={false} />
    </group>
  )
}

const firePos = new Vector3(B.x, B.y + 0.5, B.z)

const TUB_MAT = new MeshStandardMaterial({ color: '#9a6a3c', roughness: 0.85 })
const TUB_BAND = new MeshStandardMaterial({ color: '#5d4127', roughness: 0.9 })
const WATER_MAT = new MeshStandardMaterial({ color: '#4fb3c0', roughness: 0.15, transparent: true, opacity: 0.8 })
const ITEMS: ItemType[] = ['conch', 'abalone', 'urchin']
const PILE = 36

/** 공동 대야: 손질한 해산물이 쌓이며 물이 차오름. 가득 차면 반짝이 */
function Basin() {
  const basin = useBulteok((s) => s.basin)
  const group = useRef<Group>(null!)
  const water = useRef<Mesh>(null!)
  const pile = useRef<(InstancedMesh | null)[]>([])
  const bump = useRef(0)
  const shown = useRef(0)
  const lastFill = useRef(basin.fill)

  // 대야 속 해산물 자리 (아래부터 나선형으로 쌓임)
  const slots = useMemo(() => {
    const rand = seededRandom(5)
    return Array.from({ length: PILE }, (_, i) => {
      const k = i / PILE
      const a = i * 2.4
      const r = 0.08 + 0.25 * Math.sqrt((i % 12) / 12)
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.05 + k * 0.24, item: ITEMS[i % 3], rx: rand() * 6, ry: rand() * 6 }
    })
  }, [])

  // 반짝이 (가득 참)
  const SPARKS = 28
  const sparks = useMemo(() => Array.from({ length: SPARKS }, () => ({ p: new Vector3(), v: new Vector3(), life: -1 })), [])
  const sparkRefs = useRef<(Mesh | null)[]>([])
  const sparkGeo = useMemo(() => new SphereGeometry(0.03, 6, 4), [])
  const sparkMats = useMemo(
    () => ['#fff6c8', '#bdf3ff', '#ffd1e8'].map((c) => new MeshBasicMaterial({ color: c, transparent: true, blending: AdditiveBlending, depthWrite: false })),
    [],
  )

  // 날아오는 해산물
  const TOSS = 8
  const tosses = useMemo(() => Array.from({ length: TOSS }, () => ({ from: new Vector3(), item: 'conch' as ItemType, life: -1, mine: false })), [])
  const tossRefs = useRef<(Mesh | null)[]>([])
  const cursor = useRef(0)
  const target = useMemo(() => new Vector3(B.basin.x, B.y + 0.35, B.basin.z), [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const { fill, capacity, full } = useBulteok.getState().basin
    // 손질이 하나 들어오면 출렁
    if (fill > lastFill.current) bump.current = 1
    lastFill.current = fill
    bump.current = Math.max(0, bump.current - dt * 2.5)
    const k = Math.min(1, fill / Math.max(1, capacity))
    shown.current += (k - shown.current) * Math.min(1, dt * 4)
    const n = Math.round(shown.current * PILE)
    const o = new Object3D()
    ITEMS.forEach((it, v) => {
      const mesh = pile.current[v]
      if (!mesh) return
      let c = 0
      slots.forEach((s, i) => {
        if (s.item !== it || i >= n) return
        o.position.set(s.x, s.y, s.z)
        o.rotation.set(s.rx, s.ry, 0)
        o.scale.setScalar(0.32)
        o.updateMatrix()
        mesh.setMatrixAt(c++, o.matrix)
      })
      mesh.count = c
      mesh.instanceMatrix.needsUpdate = true
    })
    water.current.position.y = 0.04 + shown.current * 0.22
    water.current.visible = shown.current > 0.02
    const b = bump.current
    group.current.scale.set(1 + 0.05 * b, 1 - 0.06 * b, 1 + 0.05 * b)
    group.current.rotation.y = full ? Math.sin(t * 9) * 0.05 : 0

    // 가득 참 → 반짝이 터뜨리기
    if (bulteokFx.burst) {
      bulteokFx.burst = false
      sparks.forEach((s) => {
        const a = Math.random() * Math.PI * 2
        const sp = 0.6 + Math.random() * 1.2
        s.p.set(B.basin.x, B.y + 0.4, B.basin.z)
        s.v.set(Math.cos(a) * sp, 2 + Math.random() * 2.2, Math.sin(a) * sp)
        s.life = 0
      })
    }
    sparks.forEach((s, i) => {
      const m = sparkRefs.current[i]
      if (!m) return
      if (s.life >= 0) {
        s.life += dt
        s.v.y -= 4 * dt
        s.p.addScaledVector(s.v, dt)
        if (s.life > 1.6) s.life = -1
      }
      m.visible = s.life >= 0
      if (m.visible) {
        m.position.copy(s.p)
        m.scale.setScalar(1.4 * (1 - s.life / 1.6) * (0.7 + 0.3 * Math.sin(t * 30 + i)))
      }
    })

    // 손질한 해산물이 포물선을 그리며 대야에 쏙
    while (bulteokFx.tosses.length) {
      const req = bulteokFx.tosses.shift()!
      const tt = tosses[cursor.current++ % TOSS]
      tt.from.copy(req.from)
      tt.item = req.item
      tt.mine = req.mine
      tt.life = 0
    }
    tosses.forEach((tt, i) => {
      const m = tossRefs.current[i]
      if (!m) return
      if (tt.life >= 0) {
        tt.life += dt
        const u = Math.min(1, tt.life / 0.6)
        m.position.lerpVectors(tt.from, target, u)
        m.position.y += Math.sin(Math.PI * u) * 0.9
        m.rotation.set(u * 8, u * 5, 0)
        m.geometry = SEAFOOD_GEOMETRY[tt.item]
        m.material = SEAFOOD_MATERIAL[tt.item]
        if (u >= 1) {
          tt.life = -1
          const near = Math.max(0, 1 - player.pos.distanceTo(target) / 12)
          audio.playPlop((tt.mine ? 1 : 0.6) * near)
        }
      }
      m.visible = tt.life >= 0
    })
  })

  return (
    <>
      <group ref={group} position={[B.basin.x, B.y, B.basin.z]}>
        {/* 나무 대야 */}
        <mesh material={TUB_MAT} position={[0, 0.17, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.46, 0.38, 0.34, 28, 1, true]} />
        </mesh>
        <mesh material={TUB_MAT} position={[0, 0.01, 0]} receiveShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.03, 28]} />
        </mesh>
        {[0.06, 0.29].map((y) => (
          <mesh key={y} material={TUB_BAND} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.39 + y * 0.27, 0.018, 6, 32]} />
          </mesh>
        ))}
        <mesh ref={water} material={WATER_MAT} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <circleGeometry args={[0.41, 28]} />
        </mesh>
        {ITEMS.map((it, v) => (
          <instancedMesh
            key={it}
            ref={(m) => {
              pile.current[v] = m
            }}
            args={[SEAFOOD_GEOMETRY[it], SEAFOOD_MATERIAL[it], PILE]}
            frustumCulled={false}
          />
        ))}
      </group>
      {sparks.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            sparkRefs.current[i] = m
          }}
          geometry={sparkGeo}
          material={sparkMats[i % 3]}
          visible={false}
        />
      ))}
      {tosses.map((_, i) => (
        <mesh
          key={`t${i}`}
          ref={(m) => {
            tossRefs.current[i] = m
          }}
          geometry={SEAFOOD_GEOMETRY.conch}
          material={SEAFOOD_MATERIAL.conch}
          scale={0.35}
          visible={false}
        />
      ))}
    </>
  )
}

/** 털썩 앉은 자리: 흙먼지가 동그랗게 퍼지고 작은 반짝임 몇 개 */
const DUST_MAT = new MeshBasicMaterial({ color: '#c9b79a', transparent: true, opacity: 0.5, depthWrite: false })
const PUFF_SPARK_MAT = new MeshBasicMaterial({ color: '#fff1c4', transparent: true, blending: AdditiveBlending, depthWrite: false })

function SeatPuffs() {
  const POOL = 4
  const DUST = 10
  const SPARK = 4
  const puffs = useMemo(
    () =>
      Array.from({ length: POOL }, () => ({
        life: -1,
        o: new Vector3(),
        parts: Array.from({ length: DUST + SPARK }, () => ({ a: 0, sp: 0, up: 0 })),
      })),
    [],
  )
  const refs = useRef<(Mesh | null)[]>([])
  const dustGeo = useMemo(() => new SphereGeometry(0.05, 7, 5), [])
  const sparkGeo = useMemo(() => new SphereGeometry(0.018, 6, 4), [])
  const cursor = useRef(0)
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    while (bulteokFx.puffs.length) {
      const req = bulteokFx.puffs.shift()!
      const p = puffs[cursor.current++ % POOL]
      p.life = 0
      p.o.set(req.x, req.y, req.z)
      p.parts.forEach((q, i) => {
        q.a = (i / DUST) * Math.PI * 2 + Math.random() * 0.5
        q.sp = i < DUST ? 0.5 + Math.random() * 0.35 : 0.25 + Math.random() * 0.3
        q.up = i < DUST ? 0.05 + Math.random() * 0.08 : 0.35 + Math.random() * 0.3
      })
    }
    const t = clock.elapsedTime
    puffs.forEach((p, pi) => {
      if (p.life >= 0) p.life += dt
      if (p.life > 0.9) p.life = -1
      const u = Math.max(0, p.life) / 0.9
      const out = 1 - (1 - u) ** 3
      p.parts.forEach((q, i) => {
        const m = refs.current[pi * (DUST + SPARK) + i]
        if (!m) return
        m.visible = p.life >= 0
        if (!m.visible) return
        const dust = i < DUST
        const r = 0.28 + q.sp * out * (dust ? 0.75 : 1)
        m.position.set(p.o.x + Math.cos(q.a) * r, p.o.y + q.up * out * (dust ? 1 : 1.6) - (dust ? 0 : 0.25 * u * u), p.o.z + Math.sin(q.a) * r)
        m.scale.setScalar(dust ? (0.6 + 1.1 * out) * (1 - u * 0.5) : (1 - u) * (0.7 + 0.3 * Math.sin(t * 30 + i)))
      })
    })
    // 먼지는 같이 옅어짐 (한 번에 하나쯤 터지므로 재질 하나로)
    const newest = Math.max(...puffs.map((p) => (p.life >= 0 ? 1 - p.life / 0.9 : 0)))
    DUST_MAT.opacity = 0.5 * newest
  })
  return (
    <>
      {puffs.map((p, pi) =>
        p.parts.map((_, i) => (
          <mesh
            key={`${pi}-${i}`}
            ref={(m) => {
              refs.current[pi * (DUST + SPARK) + i] = m
            }}
            geometry={i < DUST ? dustGeo : sparkGeo}
            material={i < DUST ? DUST_MAT : PUFF_SPARK_MAT}
            visible={false}
          />
        )),
      )}
    </>
  )
}

export function Bulteok() {
  return (
    <>
      <FloorAndSeats />
      <SeatPuffs />
      <Wall />
      <Campfire />
      <Basin />
    </>
  )
}
