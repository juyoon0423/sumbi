import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, PointsMaterial, Vector3 } from 'three'
import { audio } from '../../../audio/AudioEngine'
import { seededRandom } from '../../../lib/math'
import { dolphinFlukeGeometry, dolphinBodyGeometry } from './models'
import { lifeMaterial, softDotTexture } from './shapes'
import { useDolphins, type DolphinPass } from './dolphinState'

// 남방큰돌고래 무리: 멀리 바다 위를 3~6마리가 포물선을 그리며 뛰어오르며 지나감.
// 길·마리 수·뛰는 박자는 서버가 보낸 seed 로 각 화면이 똑같이 계산 → 같은 바다의 모두가 같은 장면.
// 물에 잠겨 헤엄치는 동안은 수면 아래(물속에서 보면 그림자), 뛰어오르고 들어갈 때 물보라 + 소리.

const MAX = 6
const SPEED = 2.4
/** 무리 안에서 늦게 따라오는 돌고래의 최대 지연 (초) */
const MAX_LAG = 3
const SPLASH_N = 220

const mat = lifeMaterial({ roughness: 0.32 })
let geo: { body: ReturnType<typeof dolphinBodyGeometry>; fluke: ReturnType<typeof dolphinFlukeGeometry> } | null = null

interface Pod {
  seq: number
  dolphins: {
    side: number
    lag: number
    period: number
    phase: number
    jump: number
    height: number
    skip: number
    scale: number
    lastY: number
  }[]
}

/** seed → 무리 모양 (모든 화면이 같은 값) */
export function podOf(p: DolphinPass): Pod {
  const rand = seededRandom(p.seed)
  return {
    seq: p.seq,
    dolphins: Array.from({ length: Math.min(MAX, p.n) }, (_, i) => ({
      side: (rand() - 0.5) * 5,
      lag: i === 0 ? 0 : rand() * MAX_LAG,
      period: 3.2 + rand() * 1.5,
      phase: rand() * 3,
      jump: 1.0 + rand() * 0.35,
      height: 0.9 + rand() * 0.9,
      skip: rand(),
      scale: i === 0 ? 1.05 : 0.8 + rand() * 0.25,
      lastY: -1,
    })),
  }
}

/** 한 돌고래의 τ 초 뒤 높이와 기울기. 처음·끝 2초는 물속에서만 (갑자기 튀어나오지 않게) */
export function dolphinHeight(d: Pod['dolphins'][number], tau: number, total: number) {
  const k = tau + d.phase
  const cycle = Math.floor(k / d.period)
  const u = (k - cycle * d.period) / d.jump
  // 몇 번은 건너뛰고 물속으로만 (박자가 기계적이지 않게)
  const h = Math.sin(cycle * 12.9898 + d.skip * 78.233) * 43758.5453
  const jumps = h - Math.floor(h) > 0.22 && tau > 2 && tau < total - 2 - d.jump
  if (jumps && u < 1) {
    const amp = d.height + 0.65
    return { y: -0.65 + amp * 4 * u * (1 - u), slope: (amp * 4 * (1 - 2 * u)) / d.jump / SPEED }
  }
  return { y: -0.78 + Math.sin(tau * 2.2 + d.phase) * 0.06, slope: 0 }
}

const dir = new Vector3()
const side = new Vector3()
const tmp = new Vector3()
const camRight = new Vector3()

export function Dolphins() {
  geo ??= { body: dolphinBodyGeometry(), fluke: dolphinFlukeGeometry() }
  const bodies = useRef<(Group | null)[]>([])
  const flukes = useRef<(Group | null)[]>([])
  const pod = useRef<Pod | null>(null)
  const nextCall = useRef(0)

  // 물보라 알갱이
  const splash = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(SPLASH_N * 3).fill(-999)
    g.setAttribute('position', new BufferAttribute(pos, 3))
    const vel = new Float32Array(SPLASH_N * 3)
    const life = new Float32Array(SPLASH_N)
    const m = new PointsMaterial({ color: '#f4fbff', map: softDotTexture(), size: 0.45, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending })
    return { g, pos, vel, life, m, next: 0 }
  }, [])
  const points = useRef<Points>(null!)

  const burst = (x: number, z: number, big: boolean, camera: { position: Vector3 }) => {
    const n = big ? 26 : 16
    for (let k = 0; k < n; k++) {
      const i = splash.next
      splash.next = (splash.next + 1) % SPLASH_N
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 0.5
      splash.pos[i * 3] = x + Math.cos(a) * r
      splash.pos[i * 3 + 1] = 0.05
      splash.pos[i * 3 + 2] = z + Math.sin(a) * r
      splash.vel[i * 3] = Math.cos(a) * (0.6 + Math.random() * 1.2)
      splash.vel[i * 3 + 1] = 1.8 + Math.random() * (big ? 2.6 : 1.6)
      splash.vel[i * 3 + 2] = Math.sin(a) * (0.6 + Math.random() * 1.2)
      splash.life[i] = 0.7 + Math.random() * 0.5
    }
    // 소리: 멀수록 작게, 왼쪽·오른쪽
    const d = Math.hypot(camera.position.x - x, camera.position.z - z)
    tmp.set(x - camera.position.x, 0, z - camera.position.z).normalize()
    const pan = Math.max(-0.8, Math.min(0.8, tmp.dot(camRight)))
    audio.playSplashAt(pan, Math.max(0.06, Math.min(0.7, 9 / Math.max(1, d))) * (big ? 1 : 0.7))
  }

  useFrame(({ camera, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const pass = useDolphins.getState().pass
    const now = performance.now()
    camera.getWorldDirection(tmp)
    camRight.crossVectors(tmp, camera.up).normalize()

    // 물보라 알갱이 움직이기
    let anyLive = false
    for (let i = 0; i < SPLASH_N; i++) {
      if (splash.life[i] <= 0) continue
      anyLive = true
      splash.life[i] -= dt
      splash.vel[i * 3 + 1] -= 9 * dt
      splash.pos[i * 3] += splash.vel[i * 3] * dt
      splash.pos[i * 3 + 1] += splash.vel[i * 3 + 1] * dt
      splash.pos[i * 3 + 2] += splash.vel[i * 3 + 2] * dt
      if (splash.life[i] <= 0 || splash.pos[i * 3 + 1] < -0.2) {
        splash.life[i] = 0
        splash.pos[i * 3 + 1] = -999
      }
    }
    if (anyLive) splash.g.attributes.position.needsUpdate = true
    points.current.visible = anyLive

    const elapsed = pass ? (now - pass.start) / 1000 : -1
    const total = pass ? pass.dur / 1000 : 0
    if (!pass || elapsed > total + MAX_LAG + 1) {
      if (pass) useDolphins.getState().clear()
      pod.current = null
      bodies.current.forEach((b) => b && (b.visible = false))
      return
    }
    if (pod.current?.seq !== pass.seq) pod.current = podOf(pass)
    const p = pod.current
    dir.set(pass.to[0] - pass.from[0], 0, pass.to[1] - pass.from[1])
    const len = dir.length()
    dir.normalize()
    side.set(-dir.z, 0, dir.x)
    const yaw = Math.atan2(dir.x, dir.z)
    const t = clock.elapsedTime

    let cx = 0
    let cz = 0
    let shown = 0
    for (let i = 0; i < MAX; i++) {
      const g = bodies.current[i]
      const f = flukes.current[i]
      const d = p.dolphins[i]
      if (!g || !f) continue
      if (!d) {
        g.visible = false
        continue
      }
      const tau = elapsed - d.lag
      const s = tau * SPEED
      if (tau < 0 || s > len) {
        g.visible = false
        d.lastY = -1
        continue
      }
      const { y, slope } = dolphinHeight(d, tau, total)
      const x = pass.from[0] + dir.x * s + side.x * d.side
      const z = pass.from[1] + dir.z * s + side.z * d.side
      g.visible = true
      g.position.set(x, y, z)
      g.rotation.set(-Math.atan(slope) * 0.9, yaw, Math.sin(t * 0.9 + i) * 0.05, 'YXZ')
      g.scale.setScalar(d.scale)
      // 꼬리를 위아래로 (물속에선 빠르게, 공중에선 쉼)
      f.rotation.x = y > 0.1 ? 0.15 : Math.sin(t * 7 + i * 1.3) * 0.35
      // 수면을 지날 때 물보라 (오를 때 크게, 들어갈 때 작게)
      if (d.lastY < 0 && y >= 0) burst(x, z, true, camera)
      else if (d.lastY >= 0 && y < 0) burst(x + dir.x * 0.6, z + dir.z * 0.6, false, camera)
      d.lastY = y
      cx += x
      cz += z
      shown++
    }

    // 가끔 돌고래 소리 (무리 가운데에서)
    if (shown > 0 && now > nextCall.current) {
      nextCall.current = now + 3500 + Math.random() * 4000
      cx /= shown
      cz /= shown
      const dist = Math.hypot(camera.position.x - cx, camera.position.z - cz)
      tmp.set(cx - camera.position.x, 0, cz - camera.position.z).normalize()
      audio.playDolphin(Math.max(-0.8, Math.min(0.8, tmp.dot(camRight))), Math.max(0.15, Math.min(1, 14 / Math.max(1, dist))))
    }
  })

  return (
    <>
      {Array.from({ length: MAX }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            bodies.current[i] = el
          }}
          visible={false}
        >
          <mesh geometry={geo!.body} material={mat} castShadow />
          <group
            ref={(el) => {
              flukes.current[i] = el
            }}
            position={[0, 0.02, -1.24]}
          >
            <mesh geometry={geo!.fluke} material={mat} />
          </group>
        </group>
      ))}
      <points ref={points} geometry={splash.g} material={splash.m} frustumCulled={false} visible={false} />
    </>
  )
}
