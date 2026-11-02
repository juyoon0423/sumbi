import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { seededRandom } from '../../lib/math'
import { QUALITY, useQuality } from '../../lib/quality'
import { player } from '../../player/runtime'
import { useGame } from '../../store/gameStore'
import { env } from '../time/env'
import { skyUniforms } from './skyGlsl'

// 부피감 있는 뭉게구름: 구름 한 덩이 = 부드러운 공 모양 조각(퍼프) 여러 개.
// 퍼프는 늘 카메라를 보는 사각형이지만, 셰이더에서 공처럼 법선을 만들어 해 쪽은 밝고 반대쪽·아랫면은 살짝 그늘.
// 가장자리는 노이즈로 몽글몽글 흐리게, 해를 마주 보면 가장자리가 은빛으로 빛남. 멀고 낮은 구름은 수평선 안개에 녹아듦.
// 내 해녀 둘레를 감싸며 돌아서 (멀어지면 반대편에서 다시 나옴) 어디서 올려다봐도 구름이 있음.

const MAX_CLOUDS = QUALITY.high.clouds
/** 내 둘레 이만큼 안에서 돌림 (가장자리에선 작아져서 사라짐) */
const SPAN = 1100
const WIND = new Vector3(3.2, 0, 1.1)

interface Cloud {
  base: Vector3
  scale: number
  flat: number
  mesh: Mesh | null
}

/** 구름 한 덩이 모양: 아래는 평평하고 가운데가 솟은 뭉게구름 (kind 마다 키·길이가 다름) */
function cloudGeometry(seed: number) {
  const rnd = seededRandom(seed)
  const tall = rnd() // 0 = 납작한 층적운, 1 = 높이 솟은 적운
  const n = 7 + Math.floor(rnd() * 8)
  const offsets: number[] = []
  const radii: number[] = []
  const seeds: number[] = []
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1 + (rnd() - 0.5) * 0.25
    const mid = 1 - Math.abs(x)
    const r = 0.3 + mid * (0.22 + tall * 0.18) + rnd() * 0.12
    const y = r * 0.35 + mid * tall * 0.45 * rnd()
    offsets.push(x, y, (rnd() - 0.5) * 0.5)
    radii.push(r)
    seeds.push(rnd())
  }
  // 아랫면을 채우는 납작한 퍼프 몇 개
  for (let i = 0; i < 3; i++) {
    offsets.push((rnd() - 0.5) * 1.3, 0.12, (rnd() - 0.5) * 0.3)
    radii.push(0.4 + rnd() * 0.15)
    seeds.push(rnd())
  }
  // 아래(먼저 그림) → 위 순서로 정렬해서 겹칠 때 윗부분이 앞에
  const idx = radii.map((_, i) => i).sort((a, b) => offsets[a * 3 + 1] - offsets[b * 3 + 1])
  const g = new InstancedBufferGeometry()
  const quad = new PlaneGeometry(2, 2)
  g.index = quad.index
  g.setAttribute('position', quad.getAttribute('position'))
  g.setAttribute('aOffset', new InstancedBufferAttribute(new Float32Array(idx.flatMap((i) => offsets.slice(i * 3, i * 3 + 3))), 3))
  g.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(idx.map((i) => radii[i])), 1))
  g.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(idx.map((i) => seeds[i])), 1))
  g.instanceCount = radii.length
  return g
}

function makeMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new Vector3() },
      uLit: { value: new Color() },
      uShade: { value: new Color() },
      uHorizon: { value: new Color() },
      uSilver: { value: 0 },
      uWarm: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute float aRadius;
      attribute float aSeed;
      varying vec2 vUv;
      varying vec3 vCenter;
      varying vec3 vOff;
      varying float vSeed;
      void main() {
        vec4 cw = modelMatrix * vec4(aOffset, 1.0);
        float scale = length(modelMatrix[0].xyz);
        vec4 cv = viewMatrix * cw;
        cv.xy += position.xy * aRadius * scale;
        gl_Position = projectionMatrix * cv;
        vUv = position.xy;
        vCenter = cw.xyz;
        vOff = aOffset;
        vSeed = aSeed;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uHorizon;
      uniform float uSilver;
      uniform float uWarm;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vCenter;
      varying vec3 vOff;
      varying float vSeed;

      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { return n2(p) * 0.55 + n2(p * 2.1) * 0.28 + n2(p * 4.3) * 0.17; }

      void main() {
        float r = length(vUv);
        vec2 q = vUv * 1.7 + vSeed * 17.0 + uTime * 0.012;
        // 둥근 원이 드러나지 않게 큰 노이즈로 윤곽을 비틀고, 작은 노이즈로 몽글몽글하게
        float edge = r + (fbm(q * 0.7) - 0.5) * 0.7 + (fbm(q * 2.3) - 0.5) * 0.25;
        // 사각형 가장자리가 보이지 않게 둥근 테두리 안에서만
        float a = smoothstep(0.92, 0.4, edge) * smoothstep(1.0, 0.8, r);
        if (a < 0.01) discard;

        // 공 모양 법선 (화면 공간 → 월드)
        float rr = min(r, 1.0);
        vec3 nv = vec3(vUv * 0.55, sqrt(max(0.08, 1.0 - rr * rr)));
        vec3 nw = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
        float wrap = clamp((dot(nw, uSunDir) + 0.5) / 1.5, 0.0, 1.0);
        // 덩이 안에서의 자리: 해 쪽·위쪽 조각이 밝고, 아랫면은 그늘
        float side = dot(normalize(vOff + vec3(0.0, 0.2, 0.0)), uSunDir) * 0.5 + 0.5;
        float height = smoothstep(0.0, 0.55, vOff.y);
        float light = clamp(wrap * 0.4 + side * 0.25 + height * 0.45 - 0.02, 0.0, 1.0);
        // 노을: 해가 낮아도 구름 전체가 물들게 (그늘이 탁해지지 않게)
        light = mix(light, 0.45 + 0.55 * light, uWarm);
        vec3 col = mix(uShade, uLit, light);

        // 해를 마주 보면 얇은 가장자리가 은빛
        vec3 vd = normalize(vCenter - cameraPosition);
        float toward = pow(max(dot(vd, uSunDir), 0.0), 5.0);
        col += uLit * toward * (1.0 - a) * 0.8 * uSilver;

        // 멀고 낮은 구름은 수평선 색에 녹아듦 (대기 원근감)
        float hz = 1.0 - smoothstep(0.02, 0.32, vd.y);
        col = mix(col, uHorizon, hz * 0.72);
        a *= (1.0 - hz * 0.3) * smoothstep(-0.01, 0.05, vd.y);
        gl_FragColor = vec4(col, a * 0.96);
        #include <colorspace_fragment>
      }
    `,
  })
}

const KINDS = 8
const p = new Vector3()

export function Clouds() {
  const level = useQuality((s) => s.level)
  const count = QUALITY[level].clouds
  const { material, clouds, geometries } = useMemo(() => {
    const rnd = seededRandom(7731)
    const geometries = Array.from({ length: KINDS }, (_, k) => cloudGeometry(100 + k * 17))
    const clouds: Cloud[] = Array.from({ length: MAX_CLOUDS }, () => ({
      base: new Vector3((rnd() * 2 - 1) * SPAN, 150 + rnd() * 170, (rnd() * 2 - 1) * SPAN),
      scale: 34 + rnd() * rnd() * 120,
      flat: 0.55 + rnd() * 0.3,
      mesh: null,
    }))
    return { material: makeMaterial(), clouds, geometries }
  }, [])

  const white = useMemo(() => new Color('#ffffff'), [])
  const nightLit = useMemo(() => new Color('#4a5677'), [])
  const tmpC = useMemo(() => new Color(), [])
  const sunsetShade = useMemo(() => new Color('#a87896'), [])
  const nightShade = useMemo(() => new Color('#121a2e'), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const n = env.night
    const warm = skyUniforms.uWarm.value
    const sunUp = Math.min(1, Math.max(0, (env.sunDir.y + 0.06) / 0.16))
    const u = material.uniforms
    u.uTime.value = t
    // 빛 받는 쪽: 낮엔 흰색, 노을엔 해 빛깔, 밤엔 푸르스름한 달빛
    u.uLit.value.copy(white).lerp(env.light, 0.15 + 0.65 * warm).multiplyScalar(0.92 + 0.12 * sunUp)
    u.uLit.value.lerp(nightLit, Math.min(1, Math.max(0, (n - 0.35) / 0.5)))
    // 그늘 쪽: 하늘빛이 섞인 회청색 → 노을엔 보랏빛 → 밤엔 어둡게
    tmpC.copy(env.skyTop).lerp(env.horizon, 0.55).lerp(white, 0.18).multiplyScalar(0.86)
    u.uShade.value.copy(tmpC).lerp(sunsetShade, warm * 0.6).lerp(nightShade, Math.min(1, Math.max(0, (n - 0.4) / 0.5)))
    u.uHorizon.value.copy(env.horizon)
    u.uSunDir.value.copy(env.sunDir.y > -0.05 || n < 0.5 ? env.sunDir : env.moonDir)
    u.uSilver.value = sunUp * (1 - n)
    u.uWarm.value = warm

    const under = useGame.getState().cameraUnderwater
    const cx = player.pos.x
    const cz = player.pos.z
    clouds.forEach((c, i) => {
      const mesh = c.mesh
      if (!mesh) return
      mesh.visible = !under && i < count
      if (!mesh.visible) return
      const wrap = (v: number, c0: number) => c0 + ((((v - c0 + SPAN) % (SPAN * 2)) + SPAN * 2) % (SPAN * 2)) - SPAN
      p.set(wrap(c.base.x + WIND.x * t, cx), c.base.y, wrap(c.base.z + WIND.z * t, cz))
      const edge = Math.max(Math.abs(p.x - cx), Math.abs(p.z - cz))
      const fade = Math.min(1, Math.max(0, (SPAN - edge) / 220))
      const sc = c.scale * (fade * fade * (3 - 2 * fade)) + 0.001
      mesh.position.copy(p)
      mesh.scale.set(sc, sc * c.flat, sc)
    })
  })

  return (
    <>
      {clouds.map((c, i) => (
        <mesh
          key={i}
          ref={(el) => {
            c.mesh = el
          }}
          geometry={geometries[i % KINDS]}
          material={material}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
