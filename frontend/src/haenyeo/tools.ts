import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 불턱에서 쓰는 작은 도구와 손질한 해산물 (기본 도형 조합, 모든 해녀가 공유)

const matte = (color: string, roughness = 0.85) => new MeshStandardMaterial({ color, roughness, metalness: 0 })

function knife(): BufferGeometry {
  // 빗창: 나무 손잡이 + 납작하고 끝이 둥근 쇠날 (손에 쥐는 쪽이 원점, 날은 +y)
  const handle = new CylinderGeometry(0.011, 0.013, 0.07, 8).translate(0, 0.035, 0)
  const blade = new BoxGeometry(0.024, 0.11, 0.006).translate(0, 0.125, 0)
  return mergeGeometries([handle.toNonIndexed(), blade.toNonIndexed()], true)
}

function spoon(): BufferGeometry {
  const handle = new CylinderGeometry(0.006, 0.008, 0.11, 6).translate(0, 0.055, 0)
  const bowl = new SphereGeometry(0.022, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.45, 1.35).translate(0, 0.125, 0)
  return mergeGeometries([handle.toNonIndexed(), bowl.toNonIndexed()])
}

function zLetter(): BufferGeometry {
  // 졸 때 머리 위에 떠오르는 Z (글꼴 없이 막대 셋)
  const top = new BoxGeometry(0.1, 0.022, 0.01).translate(0, 0.055, 0)
  const bottom = new BoxGeometry(0.1, 0.022, 0.01).translate(0, -0.055, 0)
  const diag = new BoxGeometry(0.135, 0.02, 0.01).rotateZ(Math.atan2(0.11, 0.1))
  return mergeGeometries([top, bottom, diag])
}

export const TOOL_GEO = {
  stone: new DodecahedronGeometry(0.042, 0).scale(1, 0.8, 1),
  knife: knife(),
  spoon: spoon(),
  /** 소라 속살 */
  meat: new SphereGeometry(0.04, 12, 8).scale(1.25, 0.8, 0.9),
  /** 반으로 가른 성게 껍데기 (위가 열린 반구) */
  urchinHalf: new SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  /** 성게 알 */
  roe: new SphereGeometry(0.055, 12, 6).scale(1, 0.38, 1),
  tangerine: new SphereGeometry(0.062, 16, 12).scale(1, 0.88, 1),
  sparkle: new OctahedronGeometry(0.03, 0).scale(0.5, 1.4, 0.5),
  z: zLetter(),
}

export const TOOL_MAT = {
  stone: matte('#3b3b40', 0.95),
  knife: (() => {
    // 손잡이(나무)와 날(쇠) 두 그룹
    return [matte('#8a5a32'), new MeshStandardMaterial({ color: '#c9d2d8', roughness: 0.35, metalness: 0.6 })]
  })(),
  spoon: new MeshStandardMaterial({ color: '#d7dde2', roughness: 0.3, metalness: 0.65 }),
  meat: (() => {
    const m = matte('#f3dcae', 0.6)
    m.emissive.set('#5a4024')
    m.emissiveIntensity = 0.25
    return m
  })(),
  urchinHalf: (() => {
    const m = matte('#4b2f5c', 0.7)
    m.side = 2 // 안쪽도 보이게
    return m
  })(),
  roe: (() => {
    const m = matte('#f7b434', 0.5)
    m.emissive.set('#a8560c')
    m.emissiveIntensity = 0.35
    return m
  })(),
  tangerine: (() => {
    const m = matte('#f5922a', 0.7)
    m.emissive.set('#7a3a06')
    m.emissiveIntensity = 0.25
    return m
  })(),
  tangerinePeeled: (() => {
    const m = matte('#ffc35c', 0.6)
    m.emissive.set('#8a5410')
    m.emissiveIntensity = 0.25
    return m
  })(),
  sparkle: new MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6d8', emissiveIntensity: 1.6 }),
  z: new MeshStandardMaterial({ color: '#f4f7ff', emissive: '#c9d6ff', emissiveIntensity: 0.6, roughness: 1 }),
}
