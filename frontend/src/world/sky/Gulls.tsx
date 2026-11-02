import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Group, MeshLambertMaterial, Vector3 } from 'three'
import { audio } from '../../audio/AudioEngine'
import { player, view } from '../../player/runtime'
import { useFloat } from '../../store/floatStore'
import { env } from '../time/env'

// 둥둥 중 낮 하늘: 가끔 갈매기 한두 마리가 날갯짓하며 하늘을 가로지름 (멀리서 끼룩).
// 새는 두 마리를 만들어 두고 돌려 씀.

const MAX = 2

interface Gull {
  active: boolean
  t: number
  dur: number
  from: Vector3
  to: Vector3
  phase: number
  called: boolean
}

/** 한쪽 날개: 어깨 → 꺾이는 곳 → 날개 끝 (끝은 회색) */
function wingGeometry(side: 1 | -1) {
  const v = [
    // 안쪽 날개
    0, 0, 0.16, 0, 0, -0.12, 0.55 * side, 0.04, -0.02,
    0, 0, 0.16, 0.55 * side, 0.04, -0.02, 0.5 * side, 0.04, 0.18,
  ]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  g.computeVertexNormals()
  return g
}
function tipGeometry(side: 1 | -1) {
  const v = [0, 0, 0.18, 0, 0, -0.02, 0.62 * side, -0.05, -0.16]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  g.computeVertexNormals()
  return g
}
function bodyGeometry() {
  // 납작한 마름모 몸통 (머리 +z)
  const P = [
    [0, 0, 0.55], [0.09, 0, 0.1], [0, 0.08, 0.05], [-0.09, 0, 0.1], [0, -0.07, 0.05], [0, 0.01, -0.42],
  ]
  const F = [
    [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4],
  ]
  const v: number[] = []
  for (const f of F) for (const i of f) v.push(...P[i])
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  g.computeVertexNormals()
  return g
}

const tmp = new Vector3()
const fwd = new Vector3()

/** 개발용: 바로 날려 보내기 */
export const gullControl = { spawn: () => {} }

export function Gulls() {
  const groups = useRef<(Group | null)[]>([])
  const wings = useRef<(Group | null)[]>([])
  const gulls = useMemo<Gull[]>(
    () =>
      Array.from({ length: MAX }, () => ({
        active: false,
        t: 0,
        dur: 1,
        from: new Vector3(),
        to: new Vector3(),
        phase: 0,
        called: false,
      })),
    [],
  )
  const geo = useMemo(
    () => ({ body: bodyGeometry(), wl: wingGeometry(-1), wr: wingGeometry(1), tl: tipGeometry(-1), tr: tipGeometry(1) }),
    [],
  )
  const white = useMemo(() => new MeshLambertMaterial({ color: '#f4f6f8', side: 2 }), [])
  const grey = useMemo(() => new MeshLambertMaterial({ color: '#6f7884', side: 2 }), [])
  const next = useRef(8)

  const spawn = () => {
    const cam = view.camera
    // 내가 보는 쪽 하늘을 지나가게: 시선 앞 15~30m, 높이 14~24m
    if (cam) cam.getWorldDirection(fwd)
    else fwd.set(0, 0, -1)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1)
    fwd.normalize()
    const n = Math.random() < 0.45 ? 2 : 1
    const ang = Math.random() * Math.PI * 2
    const dir = new Vector3(Math.cos(ang), 0, Math.sin(ang))
    const mid = player.pos.clone().addScaledVector(fwd, 12 + Math.random() * 14)
    mid.y = 15 + Math.random() * 9
    for (let i = 0; i < n; i++) {
      const g = gulls[i]
      const off = new Vector3(-dir.z, 0, dir.x).multiplyScalar(i * 3.5)
      g.active = true
      g.t = -i * 0.7
      g.dur = 15 + Math.random() * 5
      g.from.copy(mid).addScaledVector(dir, -70).add(off)
      g.to.copy(mid).addScaledVector(dir, 70).add(off)
      g.to.y += (Math.random() - 0.5) * 6
      g.phase = Math.random() * 10
      g.called = i > 0 && Math.random() < 0.5
    }
  }
  gullControl.spawn = spawn

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const day = env.night < 0.45 && env.sunDir.y > -0.02
    if (useFloat.getState().active && day) {
      next.current -= dt
      if (next.current <= 0 && !gulls.some((g) => g.active)) {
        spawn()
        next.current = 22 + Math.random() * 26
      }
    } else next.current = Math.max(next.current, 6 + Math.random() * 6)

    gulls.forEach((g, i) => {
      const grp = groups.current[i]
      const w = wings.current[i]
      if (!grp || !w) return
      if (!g.active) {
        grp.visible = false
        return
      }
      g.t += dt
      const k = g.t / g.dur
      if (k >= 1) {
        g.active = false
        grp.visible = false
        return
      }
      grp.visible = k >= 0
      if (k < 0) return
      tmp.lerpVectors(g.from, g.to, k)
      tmp.y += Math.sin(k * Math.PI * 2 + g.phase) * 1.2
      grp.position.copy(tmp)
      grp.lookAt(tmp.x + (g.to.x - g.from.x), tmp.y + (g.to.y - g.from.y) * 0.3, tmp.z + (g.to.z - g.from.z))
      grp.rotateZ(Math.sin(g.t * 0.6 + g.phase) * 0.18)
      // 날갯짓 몇 번 하고 미끄러지듯 활공
      const flapping = Math.sin(g.t * 0.5 + g.phase) > -0.2
      const flap = flapping ? Math.sin(g.t * 9 + g.phase) * 0.55 : 0.12
      const [l, r] = w.children
      l.rotation.z = -flap
      r.rotation.z = flap
      // 가까이 지나갈 때 한 번 끼룩
      if (!g.called && k > 0.38) {
        g.called = true
        const cam = view.camera
        let pan = 0
        if (cam) {
          cam.getWorldDirection(fwd)
          const right = new Vector3().crossVectors(fwd, cam.up).normalize()
          pan = Math.max(-0.8, Math.min(0.8, tmp.clone().sub(cam.position).normalize().dot(right)))
        }
        audio.playGull(pan, 0.55)
      }
    })
  })

  return (
    <>
      {gulls.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el
          }}
          visible={false}
          scale={1.5}
        >
          <mesh geometry={geo.body} material={white} />
          <group
            ref={(el) => {
              wings.current[i] = el
            }}
          >
            <group position={[-0.06, 0, 0.12]}>
              <mesh geometry={geo.wl} material={white} />
              <mesh geometry={geo.tl} material={grey} position={[-0.53, 0.04, 0]} />
            </group>
            <group position={[0.06, 0, 0.12]}>
              <mesh geometry={geo.wr} material={white} />
              <mesh geometry={geo.tr} material={grey} position={[0.53, 0.04, 0]} />
            </group>
          </group>
        </group>
      ))}
    </>
  )
}
