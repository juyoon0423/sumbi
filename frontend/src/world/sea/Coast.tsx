import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  MeshStandardMaterial,
  Object3D,
  Vector2,
} from 'three'
import { seededRandom } from '../../lib/math'
import { shoreZ, terrainY } from '../terrain'

// 검은 현무암 바위, 멀리 한라산과 오름, 해안의 불턱 돌담(4단계에서 실제 공간이 됨)

function rockGeometry(seed: number) {
  const g = new IcosahedronGeometry(1, 1)
  const rand = seededRandom(seed)
  const pos = g.attributes.position
  // 같은 꼭짓점이 같은 방향으로 움직이도록 방향별로 값을 기억
  const offsets = new Map<string, number>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let k = offsets.get(key)
    if (k === undefined) {
      k = 0.75 + rand() * 0.45
      offsets.set(key, k)
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

const ROCK_MAT = new MeshStandardMaterial({ color: '#36363a', roughness: 0.95, flatShading: true })
const ROCK_VARIANTS = 3

interface RockPlacement {
  x: number
  y: number
  z: number
  s: number
  ry: number
  tint: number
}

function placeRocks(): RockPlacement[][] {
  const rand = seededRandom(7)
  const groups: RockPlacement[][] = Array.from({ length: ROCK_VARIANTS }, () => [])
  const add = (x: number, z: number, s: number, sink: number) => {
    groups[Math.floor(rand() * ROCK_VARIANTS)].push({
      x, z, s, y: terrainY(x, z) - s * sink, ry: rand() * Math.PI * 2, tint: 0.8 + rand() * 0.3,
    })
  }
  // 해안선을 따라 물 밖으로 드러난 바위
  for (let i = 0; i < 140; i++) {
    const x = -110 + rand() * 220
    const z = shoreZ(x) + (rand() - 0.6) * 9
    add(x, z, 0.8 + rand() * 2.6, 0.25)
  }
  // 물속 바위
  for (let i = 0; i < 50; i++) {
    const a = rand() * Math.PI * 2
    const r = 6 + rand() * 60
    add(Math.cos(a) * r, 8 + Math.sin(a) * r, 0.6 + rand() * 2.2, 0.35)
  }
  return groups
}

function Rocks() {
  const geos = useMemo(() => Array.from({ length: ROCK_VARIANTS }, (_, i) => rockGeometry(i + 1)), [])
  const placements = useMemo(placeRocks, [])
  const refs = useRef<(InstancedMesh | null)[]>([])

  useLayoutEffect(() => {
    const o = new Object3D()
    const c = new Color()
    placements.forEach((list, v) => {
      const mesh = refs.current[v]
      if (!mesh) return
      list.forEach((r, i) => {
        o.position.set(r.x, r.y, r.z)
        o.rotation.set(0, r.ry, 0)
        o.scale.setScalar(r.s)
        o.updateMatrix()
        mesh.setMatrixAt(i, o.matrix)
        mesh.setColorAt(i, c.setScalar(r.tint))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  }, [placements])

  return (
    <>
      {geos.map((g, v) => (
        <instancedMesh
          key={v}
          ref={(m) => {
            refs.current[v] = m
          }}
          args={[g, ROCK_MAT, placements[v].length]}
          castShadow
          receiveShadow
        />
      ))}
    </>
  )
}

/** 해안에 보이는 둥근 돌담 (불턱 자리) */
function BulteokPreview() {
  const stones = useMemo(() => {
    const rand = seededRandom(42)
    const cx = 16
    const cz = shoreZ(cx) - 9
    const list: [number, number, number, number][] = []
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 18; i++) {
        if (i === 0) continue // 입구
        const a = (i / 18) * Math.PI * 2 + layer * 0.17
        const x = cx + Math.cos(a) * 3.4
        const z = cz + Math.sin(a) * 3.4
        list.push([x, terrainY(x, z) + 0.25 + layer * 0.42, z, 0.36 + rand() * 0.12])
      }
    }
    return list
  }, [])
  const geo = useMemo(() => rockGeometry(9), [])
  return (
    <>
      {stones.map(([x, y, z, s], i) => (
        <mesh key={i} geometry={geo} material={ROCK_MAT} position={[x, y, z]} scale={s} castShadow />
      ))}
    </>
  )
}

/** 한라산 + 오름: 회전체(Lathe)로 완만한 순상화산 실루엣 */
function Mountains() {
  const hallasan = useMemo(
    () =>
      new LatheGeometry(
        [
          new Vector2(0, 230),
          new Vector2(70, 222),
          new Vector2(90, 214),
          new Vector2(200, 165),
          new Vector2(420, 80),
          new Vector2(700, 10),
          new Vector2(820, -20),
        ],
        48,
      ),
    [],
  )
  const oreum = useMemo(
    () =>
      new LatheGeometry(
        [new Vector2(0, 26), new Vector2(18, 25), new Vector2(40, 12), new Vector2(65, -4)],
        24,
      ),
    [],
  )
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#5f7d6c', roughness: 1 }), [])
  const oreums: [number, number, number][] = [
    [-260, -330, 1.0],
    [190, -420, 1.3],
    [420, -260, 0.8],
    [-480, -520, 1.5],
  ]
  return (
    <>
      <mesh geometry={hallasan} material={mat} position={[60, terrainY(60, -1050), -1050]} />
      {oreums.map(([x, z, s], i) => (
        <mesh key={i} geometry={oreum} material={mat} position={[x, terrainY(x, z), z]} scale={[s, s * 0.9, s]} />
      ))}
    </>
  )
}

export function Coast() {
  return (
    <>
      <Rocks />
      <BulteokPreview />
      <Mountains />
    </>
  )
}
