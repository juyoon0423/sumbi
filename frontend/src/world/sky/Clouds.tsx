import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { player } from '../../player/runtime'
import { useGame } from '../../store/gameStore'
import { env } from '../time/env'

// 낮은 폴리곤의 몽글한 구름. 모양 4가지를 인스턴싱으로 돌려 쓰고, 바람 따라 천천히 흘러감.
// 내 해녀 둘레를 감싸며 돌아서 (멀어지면 반대편에서 다시 나옴) 어디서 올려다봐도 구름이 있음.

const KINDS = 4
const PER_KIND = 8
/** 내 둘레 이만큼 안에서 돌림 (가장자리에선 작아져서 사라짐) */
const SPAN = 700
const WIND = new Vector3(3.2, 0, 1.1)

let seed = 7731
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

/** 구름 한 덩이 모양: 납작한 이십면체 몇 개를 겹침 (면마다 평평한 그늘) */
function cloudShape(puffs: number): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < puffs; i++) {
    const r = 0.45 + rnd() * 0.4 - (Math.abs(i - (puffs - 1) / 2) / puffs) * 0.3
    const g = new IcosahedronGeometry(r, 1)
    const x = (i - (puffs - 1) / 2) * 0.62 + (rnd() - 0.5) * 0.2
    g.scale(1, 0.62, 0.85)
    g.translate(x, r * 0.25 + (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.4)
    parts.push(g.toNonIndexed())
  }
  const merged = mergeGeometries(parts)
  // 바닥은 납작하게
  const pos = merged.getAttribute('position')
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.35)
  merged.computeVertexNormals()
  return merged
}

interface Cloud {
  base: Vector3
  scale: number
  yaw: number
}

const m = new Matrix4()
const q = new Quaternion()
const s = new Vector3()
const p = new Vector3()
const UP = new Vector3(0, 1, 0)

export function Clouds() {
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const { geometries, clouds, material } = useMemo(() => {
    const geometries = [3, 4, 5, 7].map(cloudShape)
    const clouds: Cloud[][] = geometries.map(() =>
      Array.from({ length: PER_KIND }, () => ({
        base: new Vector3((rnd() * 2 - 1) * SPAN, 110 + rnd() * 120, (rnd() * 2 - 1) * SPAN),
        scale: 22 + rnd() * rnd() * 60,
        yaw: rnd() * Math.PI * 2,
      })),
    )
    const material = new ShaderMaterial({
      fog: false,
      uniforms: {
        uTop: { value: new Color() },
        uBottom: { value: new Color() },
        uLit: { value: new Color() },
        uHorizon: { value: new Color() },
        uSunDir: { value: new Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          mat4 im = instanceMatrix;
          vN = normalize(mat3(modelMatrix * im) * normal);
          vec4 w = modelMatrix * im * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uLit;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vec3 n = normalize(vN);
          float k = smoothstep(-0.6, 0.8, n.y);
          vec3 col = mix(uBottom, uTop, k);
          // 해를 향한 면은 그 빛으로 살짝 물듦 (노을엔 아랫면까지 주황으로)
          col += uLit * max(dot(n, uSunDir), 0.0) * 0.35;
          // 멀고 낮은 구름은 수평선 색에 녹아듦
          vec3 d = normalize(vW - cameraPosition);
          col = mix(col, uHorizon, (1.0 - smoothstep(0.04, 0.35, d.y)) * 0.75);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    return { geometries, clouds, material }
  }, [])

  const white = useMemo(() => new Color('#ffffff'), [])
  const nightTop = useMemo(() => new Color('#2a3352'), [])
  const nightBottom = useMemo(() => new Color('#121a2c'), [])
  const tmpC = useMemo(() => new Color(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const n = env.night
    const u = material.uniforms
    // 윗면: 낮엔 하얗게, 노을엔 분홍보라, 밤엔 어둡게
    u.uTop.value.copy(white).lerp(env.hemiSky, 0.35 + 0.3 * n).lerp(nightTop, Math.max(0, n - 0.4) / 0.6)
    // 아랫면: 수평선 색(노을이면 주황)과 하늘 색 사이
    tmpC.copy(env.horizon).lerp(env.skyTop, 0.3).multiplyScalar(0.92)
    u.uBottom.value.copy(tmpC).lerp(nightBottom, Math.max(0, n - 0.5) / 0.5)
    u.uLit.value.copy(env.light).multiplyScalar(Math.max(0, Math.min(1, (env.sunDir.y + 0.05) / 0.15)))
    u.uHorizon.value.copy(env.horizon)
    u.uSunDir.value.copy(env.sunDir)

    const under = useGame.getState().cameraUnderwater
    for (const mesh of meshes.current) if (mesh) mesh.visible = !under
    if (under) return
    const cx = player.pos.x
    const cz = player.pos.z
    for (let k = 0; k < KINDS; k++) {
      const mesh = meshes.current[k]
      if (!mesh) continue
      clouds[k].forEach((c, i) => {
        const wrap = (v: number, c0: number) => c0 + ((((v - c0 + SPAN) % (SPAN * 2)) + SPAN * 2) % (SPAN * 2)) - SPAN
        p.set(wrap(c.base.x + WIND.x * t, cx), c.base.y, wrap(c.base.z + WIND.z * t, cz))
        const edge = Math.max(Math.abs(p.x - cx), Math.abs(p.z - cz))
        const fade = Math.min(1, Math.max(0, (SPAN - edge) / 140))
        const sc = c.scale * (fade * fade * (3 - 2 * fade)) + 0.001
        q.setFromAxisAngle(UP, c.yaw)
        s.set(sc, sc * 0.9, sc)
        m.compose(p, q, s)
        mesh.setMatrixAt(i, m)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {geometries.map((g, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            meshes.current[k] = el
          }}
          args={[g, material, PER_KIND]}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
