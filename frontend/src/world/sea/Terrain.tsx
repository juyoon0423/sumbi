import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, Color, MeshStandardMaterial, PlaneGeometry, ShaderMaterial } from 'three'
import { smoothstep } from '../../lib/math'
import { terrainY } from '../terrain'
import { detailUniforms, patchBasalt } from './surfaceDetail'

// 해저 + 해안 + 육지를 한 장의 지형으로. 가운데는 촘촘하고 멀어질수록 듬성듬성한 격자.

const SEG = 220
const C = {
  sand: new Color('#9b8f6c'),
  seabed: new Color('#4c5650'),
  basalt: new Color('#2b2b2e'),
  grass: new Color('#6f8550'),
  field: new Color('#8a8f5a'),
}

/** u ∈ [-1, 1] → 가운데 촘촘(≈0.9m), 가장자리 아주 멀리 */
const spread = (u: number, near: number, far: number) => near * u + far * u * u * u * u * u

function buildGeometry() {
  const g = new PlaneGeometry(2, 2, SEG, SEG)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const col = new Color()
  for (let i = 0; i < pos.count; i++) {
    const x = spread(pos.getX(i), 100, 1400)
    const z = 10 + spread(pos.getZ(i), 100, 1400)
    const y = terrainY(x, z)
    pos.setXYZ(i, x, y, z)

    const n = Math.sin(x * 0.9) * Math.cos(z * 0.7) * 0.5 + 0.5
    if (y < -0.6) {
      // 물속: 모래와 현무암이 섞인 바닥
      col.copy(C.seabed).lerp(C.sand, smoothstep(0.35, 0.75, n) * 0.7)
    } else if (y < 1.6) {
      col.copy(C.basalt) // 해안 검은 현무암
    } else {
      col.copy(C.grass).lerp(C.field, n * 0.6).lerp(C.basalt, 1 - smoothstep(1.6, 2.1, y))
    }
    colors.set([col.r, col.g, col.b], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

// 물속 바닥에 일렁이는 빛 무늬 (커스틱)
const causticsMaterial = () =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      // 일렁이는 그물 무늬 (나눗셈 없이 계산해 값이 튀지 않게)
      float caustic(vec2 p, float t) {
        vec2 q = p;
        for (int i = 0; i < 3; i++) {
          q += 0.6 * vec2(sin(q.y * 1.3 + t), cos(q.x * 1.1 - t * 0.8));
        }
        float a = sin(q.x * 2.0) * sin(q.y * 2.0);
        return pow(1.0 - abs(a), 6.0);
      }
      void main() {
        if (vWorld.y > -0.4) discard;
        float dist = length(cameraPosition - vWorld);
        float fade = (1.0 - smoothstep(6.0, 24.0, dist)) * clamp(1.0 + vWorld.y / 14.0, 0.25, 1.0);
        float c = caustic(vWorld.xz * 0.55, uTime * 0.45);
        gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * c * 0.22 * fade, 1.0);
      }
    `,
  })

export function Terrain() {
  const geometry = useMemo(buildGeometry, [])
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1 })
    // 해안 현무암 띠(풀밭 아래)와 물속 모래에 무늬
    patchBasalt(m, { sand: true, maxY: 1.9, poreScale: 0.8 })
    return m
  }, [])
  const caustics = useMemo(causticsMaterial, [])

  useFrame(({ clock }) => {
    caustics.uniforms.uTime.value = clock.elapsedTime
    detailUniforms.uTime.value = clock.elapsedTime
  })

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow />
      <mesh geometry={geometry} material={caustics} />
    </>
  )
}
