import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { InstancedMesh, Object3D, Vector3 } from 'three'
import { seededRandom } from '../../../lib/math'
import { player } from '../../../player/runtime'
import { terrainY } from '../../terrain'
import { fishMaterial, fishTime } from './fishMaterial'
import { FAR } from './friendsConfig'
import { friendsDebug, underView } from './lifeUtil'
import { damselGeometry, followerGeometry } from './models'

// 자리돔 떼: 수십 마리가 무리 지어 천천히 돌아다님 (간단한 무리 행동: 모이기·같은 방향·서로 비키기).
// 해녀가 다가가면 확 흩어졌다가 몇 초 뒤 다시 모임. 한 떼 = InstancedMesh 하나.

let damselGeo: ReturnType<typeof damselGeometry> | null = null
let damselMat: ReturnType<typeof fishMaterial> | null = null
const shared = () => {
  damselGeo ??= damselGeometry()
  damselMat ??= fishMaterial(1.6, 13)
  return { geo: damselGeo, mat: damselMat }
}

const dummy = new Object3D()
const look = new Vector3()

interface Props {
  anchor: { x: number; y: number; z: number }
  n: number
  seed: number
}

export function DamselSchool({ anchor, n, seed }: Props) {
  const ref = useRef<InstancedMesh>(null!)
  const { geo, mat } = shared()
  const sim = useMemo(() => {
    const rand = seededRandom(1000 + seed)
    const pos = new Float32Array(n * 3)
    const vel = new Float32Array(n * 3)
    const size = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = anchor.x + (rand() - 0.5) * 2.4
      pos[i * 3 + 1] = anchor.y + (rand() - 0.5) * 0.8
      pos[i * 3 + 2] = anchor.z + (rand() - 0.5) * 2.4
      vel[i * 3 + 2] = 0.4
      size[i] = 0.82 + rand() * 0.36
    }
    return { pos, vel, size, scatter: 0, center: new Vector3(anchor.x, anchor.y, anchor.z) }
  }, [anchor, n, seed])

  useFrame(({ camera, clock }, rawDt) => {
    const mesh = ref.current
    fishTime.value = clock.elapsedTime
    const { pos, vel, size, center } = sim
    const far = camera.position.distanceTo(center) > FAR
    mesh.visible = underView() && !far
    if (!mesh.visible) return
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime

    // 떼가 가고 싶은 곳: 자기 자리 둘레를 천천히 맴돎
    const gx = anchor.x + Math.sin(t * 0.045 + seed * 2.1) * 5
    const gy = anchor.y + Math.sin(t * 0.11 + seed) * 0.6
    const gz = anchor.z + Math.cos(t * 0.037 + seed * 1.3) * 5

    // 떼 가운데·평균 방향
    let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0
    for (let i = 0; i < n; i++) {
      cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]
      ax += vel[i * 3]; ay += vel[i * 3 + 1]; az += vel[i * 3 + 2]
    }
    cx /= n; cy /= n; cz /= n; ax /= n; ay /= n; az /= n
    center.set(cx, cy, cz)
    friendsDebug.schools[seed] = center
    if (import.meta.env.DEV) {
      let spread = 0
      for (let i = 0; i < n; i++) spread += Math.hypot(pos[i * 3] - cx, pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz)
      friendsDebug.spread[seed] = spread / n
    }

    // 해녀가 떼 가까이 오면 흩어짐
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z
    if (Math.hypot(px - cx, py - cy, pz - cz) < 3.2) sim.scatter = 2.2
    sim.scatter = Math.max(0, sim.scatter - dt)
    const scattering = sim.scatter > 0
    const cohesion = scattering ? 0.08 : 0.7
    const maxSpeed = scattering ? 2.6 : 0.95

    for (let i = 0; i < n; i++) {
      const ix = i * 3
      const x = pos[ix], y = pos[ix + 1], z = pos[ix + 2]
      let fx = (gx - x) * 0.18 + (cx - x) * cohesion
      let fy = (gy - y) * 0.25 + (cy - y) * cohesion
      let fz = (gz - z) * 0.18 + (cz - z) * cohesion
      fx += (ax - vel[ix]) * 0.8
      fy += (ay - vel[ix + 1]) * 0.8
      fz += (az - vel[ix + 2]) * 0.8
      // 서로 비키기
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const dx = x - pos[j * 3], dy = y - pos[j * 3 + 1], dz = z - pos[j * 3 + 2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 0.09 && d2 > 1e-6) {
          const k = 0.012 / d2
          fx += dx * k; fy += dy * k; fz += dz * k
        }
      }
      // 해녀한테서 멀어지기
      const hx = x - px, hy = y - py, hz = z - pz
      const hd = Math.hypot(hx, hy, hz)
      const fleeR = scattering ? 4.2 : 2.6
      if (hd < fleeR && hd > 1e-3) {
        const k = ((fleeR - hd) / fleeR) * 9 / hd
        fx += hx * k; fy += hy * k * 0.5; fz += hz * k
      }
      let vx = vel[ix] + fx * dt, vy = vel[ix + 1] + fy * dt, vz = vel[ix + 2] + fz * dt
      vy *= 0.96
      const sp = Math.hypot(vx, vy, vz)
      const lim = sp > maxSpeed ? maxSpeed / sp : sp < 0.3 ? 0.3 / Math.max(sp, 1e-3) : 1
      vx *= lim; vy *= lim; vz *= lim
      let nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt
      // 바닥 위·수면 아래
      const floor = terrainY(nx, nz) + 0.45
      if (ny < floor) { ny = floor; vy = Math.abs(vy) * 0.5 }
      if (ny > -0.7) { ny = -0.7; vy = -Math.abs(vy) * 0.5 }
      vel[ix] = vx; vel[ix + 1] = vy; vel[ix + 2] = vz
      pos[ix] = nx; pos[ix + 1] = ny; pos[ix + 2] = nz

      dummy.position.set(nx, ny, nz)
      look.set(nx + vx, ny + vy * 0.5, nz + vz)
      dummy.lookAt(look)
      dummy.scale.setScalar(size[i])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geo, mat, n]} frustumCulled={false} />
}

// ── 잠수하면 잠깐 따라오는 작은 물고기 ──

let followGeo: ReturnType<typeof followerGeometry> | null = null
let followMat: ReturnType<typeof fishMaterial> | null = null

interface Follower {
  life: number
  max: number
  angle: number
  radius: number
  spin: number
  pos: Vector3
  vel: Vector3
  leaving: number
}

export function Followers({ n }: { n: number }) {
  const ref = useRef<InstancedMesh>(null!)
  followGeo ??= followerGeometry()
  followMat ??= fishMaterial(2.2, 18)
  const fish = useMemo<Follower[]>(
    () =>
      Array.from({ length: n }, () => ({
        life: 0, max: 0, angle: 0, radius: 1, spin: 1, pos: new Vector3(), vel: new Vector3(), leaving: 0,
      })),
    [n],
  )
  const state = useRef({ wasUnder: false, cooldown: 4, active: false })

  useFrame((_, rawDt) => {
    const mesh = ref.current
    const dt = Math.min(rawDt, 0.05)
    const s = state.current
    const under = player.pos.y < -1.1 && player.zone === 'sea'
    s.cooldown -= dt
    // 잠수를 시작한 순간, 가끔 (매번이면 특별하지 않음)
    if (under && !s.wasUnder && !s.active && s.cooldown <= 0 && Math.random() < 0.7) {
      s.active = true
      s.cooldown = 22
      const count = 2 + Math.floor(Math.random() * (n - 1))
      fish.forEach((f, i) => {
        f.life = i < count ? 0.001 : 0
        f.max = 8 + Math.random() * 5
        f.angle = Math.random() * Math.PI * 2
        f.radius = 0.7 + Math.random() * 0.7
        f.spin = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5)
        f.leaving = 0
        // 앞쪽 조금 멀리서 다가옴
        f.pos.set(player.pos.x + Math.sin(player.yaw) * 3 + (Math.random() - 0.5) * 2, player.pos.y - 0.5 + Math.random(), player.pos.z + Math.cos(player.yaw) * 3 + (Math.random() - 0.5) * 2)
        f.vel.set(0, 0, 0)
      })
    }
    s.wasUnder = under

    let alive = 0
    fish.forEach((f, i) => {
      if (f.life <= 0) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        return
      }
      alive++
      f.life += dt
      if (f.life > f.max && f.leaving === 0) {
        f.leaving = 0.001
        f.vel.set(Math.sin(f.angle) * 1.4, -0.2, Math.cos(f.angle) * 1.4)
      }
      if (f.leaving > 0) {
        // 제 갈 길로 떠남
        f.leaving += dt
        f.pos.addScaledVector(f.vel, dt)
        if (f.leaving > 2.5) f.life = 0
      } else {
        f.angle += f.spin * dt
        const tx = player.pos.x + Math.cos(f.angle) * f.radius
        const ty = player.pos.y + 0.25 + Math.sin(f.life * 1.3 + i) * 0.25
        const tz = player.pos.z + Math.sin(f.angle) * f.radius
        look.set(tx - f.pos.x, ty - f.pos.y, tz - f.pos.z)
        f.vel.lerp(look.multiplyScalar(2.2), Math.min(1, dt * 2.5))
        if (f.vel.length() > 2.2) f.vel.setLength(2.2)
        f.pos.addScaledVector(f.vel, dt)
      }
      const fade = f.leaving > 0 ? Math.max(0, 1 - f.leaving / 2.5) : Math.min(1, f.life * 2)
      dummy.position.copy(f.pos)
      look.copy(f.pos).add(f.vel)
      if (f.vel.lengthSq() > 1e-5) dummy.lookAt(look)
      dummy.scale.setScalar(fade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    if (alive === 0) s.active = false
    mesh.visible = alive > 0 && underView()
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[followGeo, followMat, n]} frustumCulled={false} />
}

