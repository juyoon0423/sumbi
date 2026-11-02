import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { CapsuleGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { seededRandom } from '../../lib/math'
import { terrainY } from '../terrain'

// 바닥에서 흔들리는 해초 (인스턴싱 + 정점 셰이더로 흔들기)

const COUNT = 260

export function Seaweed() {
  const ref = useRef<InstancedMesh>(null!)
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  const geometry = useMemo(() => {
    const g = new CapsuleGeometry(0.05, 1.1, 3, 6)
    g.translate(0, 0.6, 0) // 밑동이 원점
    return g
  }, [])

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vec3 base = instanceMatrix[3].xyz;
          float h = max(position.y, 0.0);
          float sway = sin(uTime * 1.1 + base.x * 0.6 + base.z * 0.4);
          transformed.x += sway * h * h * 0.18;
          transformed.z += cos(uTime * 0.8 + base.x * 0.3) * h * h * 0.1;`,
        )
    }
    return m
  }, [uniforms])

  useLayoutEffect(() => {
    const rand = seededRandom(99)
    const o = new Object3D()
    const c = new Color()
    const greens = ['#4d6b2c', '#5d7a33', '#6b5a2a', '#3f5e33']
    let i = 0
    // 몇 그루씩 모여 자람
    while (i < COUNT) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 60
      const cx = Math.cos(a) * r
      const cz = 8 + Math.sin(a) * r
      if (terrainY(cx, cz) > -2) continue
      const clump = 4 + Math.floor(rand() * 6)
      for (let j = 0; j < clump && i < COUNT; j++, i++) {
        const x = cx + (rand() - 0.5) * 1.4
        const z = cz + (rand() - 0.5) * 1.4
        o.position.set(x, terrainY(x, z) - 0.05, z)
        o.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3)
        const s = 0.6 + rand() * 1.2
        o.scale.set(1 + rand() * 0.8, s, 1)
        o.updateMatrix()
        ref.current.setMatrixAt(i, o.matrix)
        ref.current.setColorAt(i, c.set(greens[Math.floor(rand() * greens.length)]))
      }
    }
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [])

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime
  })

  return <instancedMesh ref={ref} args={[geometry, material, COUNT]} frustumCulled={false} />
}
