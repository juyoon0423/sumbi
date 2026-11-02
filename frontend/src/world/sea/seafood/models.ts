import {
  BufferGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ItemType } from '../../../config'

// 해산물 모양 (기본 도형 합치기). 같은 종류는 지오메트리·재질을 공유한다.

function conch(): BufferGeometry {
  // 소라: 쌓인 고리 + 뾰족한 꼭지 + 돌기
  const parts: BufferGeometry[] = []
  const rings = [
    [0.16, 0.07, 0.06],
    [0.12, 0.06, 0.15],
    [0.08, 0.045, 0.23],
  ]
  for (const [r, tube, y] of rings) {
    const t = new TorusGeometry(r, tube, 8, 18)
    t.rotateX(Math.PI / 2)
    t.translate(0, y, 0)
    parts.push(t)
  }
  const tip = new ConeGeometry(0.06, 0.14, 10)
  tip.translate(0, 0.33, 0)
  parts.push(tip)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const s = new ConeGeometry(0.025, 0.08, 5)
    s.rotateZ(-Math.PI / 2)
    s.rotateY(-a)
    s.translate(Math.cos(a) * 0.22, 0.07, Math.sin(a) * 0.22)
    parts.push(s)
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))
}

function abalone(): BufferGeometry {
  const g = new SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  g.scale(1, 0.4, 0.72)
  return g
}

function urchin(): BufferGeometry {
  const parts: BufferGeometry[] = [new SphereGeometry(0.12, 14, 10).toNonIndexed()]
  const dir = new Vector3()
  const up = new Vector3(0, 1, 0)
  const q = new Quaternion()
  const n = 46
  for (let i = 0; i < n; i++) {
    // 피보나치 구면 분포 (아랫면은 생략)
    const y = 1 - (i / (n - 1)) * 1.3
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = i * 2.39996
    dir.set(Math.cos(a) * r, y, Math.sin(a) * r).normalize()
    const spike = new ConeGeometry(0.012, 0.16, 4)
    spike.translate(0, 0.16, 0)
    spike.applyQuaternion(q.setFromUnitVectors(up, dir))
    parts.push(spike.toNonIndexed())
  }
  return mergeGeometries(parts)
}

export const SEAFOOD_GEOMETRY: Record<ItemType, BufferGeometry> = {
  conch: conch(),
  abalone: abalone(),
  urchin: urchin(),
}

export const SEAFOOD_MATERIAL: Record<ItemType, MeshStandardMaterial> = {
  conch: new MeshStandardMaterial({ color: '#b98a5e', roughness: 0.7, emissive: '#3a2a18', emissiveIntensity: 0.4 }),
  abalone: new MeshStandardMaterial({ color: '#7d9c8f', roughness: 0.35, metalness: 0.2, emissive: '#2a4a48', emissiveIntensity: 0.5 }),
  urchin: new MeshStandardMaterial({ color: '#4b2f5c', roughness: 0.6, emissive: '#2a1838', emissiveIntensity: 0.5 }),
}
