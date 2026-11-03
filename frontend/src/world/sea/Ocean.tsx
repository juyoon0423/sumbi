import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BufferAttribute,
  Color,
  DoubleSide,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  Vector4,
} from 'three'
import { UNDERWATER_STATES } from '../../haenyeo/types'
import { QUALITY, useQuality } from '../../lib/quality'
import { remotes } from '../../net/remotes'
import { player } from '../../player/runtime'
import { SKY_GLSL, skyUniforms } from '../sky/skyGlsl'
import { terrainY } from '../terrain'
import { env } from '../time/env'
import { makeWaterNormals } from './waterNormals'
import { INNER_OCEAN_RADIUS, WAVE_GLSL } from './waves'

// 수면: 가운데(파도 있음, 촘촘한 격자) + 바깥 고리(평평, 수평선까지)
// 위에서 보면: 큰 파도(waves.ts, 캐릭터와 같은 식) + 크고 작은 잔물결 노멀맵 여러 겹,
//   보는 각도에 따라 하늘이 비침(프레넬, 하늘 색 식은 하늘 돔과 같음), 해·달 반짝임 길,
//   해안 가까이는 맑은 옥색 → 멀어질수록 깊은 파랑, 해안선의 흰 포말과 물러가는 물결, 멀리 가끔 흰 물결,
//   해녀·테왁 둘레의 작은 물결 고리.
// 아래에서 보면: 굴절된 하늘이 일렁이는 둥근 창(스넬의 창), 그 밖은 물속 색.

const MAX_RIPPLES = 12

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  attribute float aDepth;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vDepth;
  ${WAVE_GLSL}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 w = waveData(world.xz, uTime);
    world.y += w.x;
    vHeight = w.x;
    vNormal = normalize(vec3(-w.y, 1.0, -w.z));
    vWorld = world.xyz;
    vDepth = aDepth;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <fog_pars_fragment>
  ${SKY_GLSL}
  uniform float uTime;
  uniform float uClipRadius;
  uniform sampler2D uNormals;
  uniform float uLayers;
  uniform vec3 uLightDir;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uJade;
  uniform vec3 uGlint;
  uniform float uGlintPow;
  uniform vec3 uFoam;
  uniform float uDay;
  uniform vec3 uUnderDark;
  uniform vec3 uUnderBright;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vDepth;

  float n2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
    float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
    float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
    float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    if (uClipRadius > 0.0 && length(vWorld.xz) > uClipRadius) discard;
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 v = toCam / dist;
    vec2 p = vWorld.xz;

    // 잔물결 노멀맵 여러 겹 (크기·방향·속도가 서로 다르게 흐름)
    vec4 s1 = texture2D(uNormals, p / 9.0 + vec2(0.012, 0.007) * uTime);
    vec2 d = (s1.xy - 0.5) * 1.0;
    float hDetail = s1.a;
    if (uLayers > 1.5) {
      vec4 s2 = texture2D(uNormals, p / 3.3 + vec2(-0.021, 0.016) * uTime);
      d += (s2.xy - 0.5) * 0.7;
      hDetail = hDetail * 0.6 + s2.a * 0.4;
    }
    if (uLayers > 2.5) {
      vec4 s3 = texture2D(uNormals, p / 1.25 + vec2(0.03, -0.034) * uTime);
      d += (s3.xy - 0.5) * 0.45;
    }
    // 멀리는 잔물결을 줄여 반짝거림이 지글거리지 않게
    float detail = mix(0.2, 0.06, smoothstep(8.0, 140.0, dist));

    // 해녀·테왁 둘레 물결 고리
    float ringFoam = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      if (r.z <= 0.0) continue;
      vec2 dv = p - r.xy;
      float rd = length(dv);
      if (rd > 3.5) continue;
      float wv = sin(rd * 13.0 - uTime * 3.6 - r.w) * exp(-rd * 1.25) * smoothstep(0.22, 0.5, rd) * r.z;
      d += dv / max(rd, 1e-3) * wv * 0.5;
      ringFoam += max(wv, 0.0) * exp(-rd * 2.2) * 0.5;
    }

    vec3 n = normalize(vNormal + vec3(d.x, 0.0, d.y) * detail);

    vec3 col;
    if (gl_FrontFacing) {
      float ndv = max(dot(n, v), 0.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      // 비친 하늘 (지평선 아래로 꺾인 반사는 위로 접음)
      vec3 r = reflect(-v, n);
      r.y = abs(r.y);
      vec3 sky = skyColor(normalize(r));

      // 물빛: 얕은 곳은 맑은 옥색, 깊을수록 진한 파랑. 파도 마루는 빛이 비쳐 조금 밝은 청록
      float shallow = exp(-vDepth / 3.2);
      float mid = exp(-vDepth / 14.0);
      vec3 body = mix(uDeep, uShallow, mid * 0.7);
      body = mix(body, uJade, shallow * 0.7);
      vec3 vh = normalize(vec3(v.x, 0.0, v.z) + 1e-4);
      vec3 lh = normalize(vec3(uLightDir.x, 0.0, uLightDir.z) + 1e-4);
      float crest = smoothstep(-0.02, 0.2, vHeight + (hDetail - 0.5) * 0.08);
      body += uShallow * crest * (0.08 + 0.16 * max(dot(vh, -lh), 0.0)) * uDay;

      col = mix(body, sky, clamp(fresnel, 0.0, 1.0));

      // 해(밤엔 달) 반짝임: 넓은 빛 길 + 잔물결마다 반짝이는 점
      vec3 rl = reflect(-uLightDir, n);
      float sp = max(dot(rl, v), 0.0);
      col += uGlint * (pow(sp, uGlintPow * 1.6) * mix(0.9, 0.45, uDay) + pow(sp, uGlintPow * 9.0) * 3.0);

      // 포말: 해안선의 흰 물거품과 밀려왔다 물러가는 물결, 멀리 가끔 이는 흰 물결, 물결 고리
      float breakup = smoothstep(0.35, 0.75, hDetail);
      float shoreLine = smoothstep(0.9, 0.05, vDepth);
      float wash = sin(vDepth * 4.2 - uTime * 1.25 + n2(p * 0.15) * 4.0);
      float bands = smoothstep(0.72, 1.0, wash) * smoothstep(2.6, 0.3, vDepth);
      float shore = clamp(shoreLine * (0.55 + 0.45 * breakup) + bands * breakup * 0.75, 0.0, 1.0);
      float capNoise = n2(p * 0.045 + vec2(uTime * 0.02, uTime * 0.013));
      float capPulse = 0.5 + 0.5 * sin(uTime * 0.45 + n2(p * 0.11) * 12.0);
      float caps = smoothstep(0.7, 0.86, capNoise) * smoothstep(0.65, 0.9, capPulse) * smoothstep(0.06, 0.16, vHeight + (hDetail - 0.5) * 0.12)
        * smoothstep(0.55, 0.85, hDetail) * smoothstep(18.0, 45.0, dist) * 0.55;
      float foam = clamp(shore + caps + ringFoam * breakup, 0.0, 1.0);
      col = mix(col, uFoam, foam);
    } else {
      // 물속에서 올려다본 수면: 굴절된 하늘이 보이는 둥근 창, 바깥은 물속 색이 비침
      vec3 i = normalize(vWorld - cameraPosition);
      vec3 t = refract(i, -n, 1.333);
      float ripple = 0.5 + 0.5 * sin(vWorld.x * 2.3 + uTime * 1.7) * sin(vWorld.z * 2.1 - uTime * 1.3);
      if (dot(t, t) < 1e-4) {
        col = mix(uUnderDark, uUnderBright, 0.18 + 0.1 * ripple);
      } else {
        vec3 sky = skyColor(normalize(t));
        float edge = smoothstep(0.0, 0.35, t.y);
        col = mix(uUnderBright * 0.8, mix(uUnderBright, sky * 1.15, 0.55), edge) * (0.9 + 0.2 * ripple);
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function makeMaterial(clipRadius: number, normals: ReturnType<typeof makeWaterNormals>) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    fog: true,
    uniforms: {
      ...UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uClipRadius: { value: clipRadius },
          uLayers: { value: 3 },
          uLightDir: { value: new Vector3() },
          uDeep: { value: new Color() },
          uShallow: { value: new Color() },
          uJade: { value: new Color() },
          uGlint: { value: new Color() },
          uGlintPow: { value: 180 },
          uFoam: { value: new Color() },
          uDay: { value: 1 },
          uUnderDark: { value: new Color() },
          uUnderBright: { value: new Color() },
          uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new Vector4()) },
        },
      ]),
      // 하늘 값은 하늘 돔과 같은 객체 (복사하지 않음)
      ...skyUniforms,
      uNormals: { value: normals },
    },
  })
}

/** 가운데 수면: 꼭짓점마다 물 깊이(해안 쪽 옥색·포말용) */
function innerGeometry() {
  const size = INNER_OCEAN_RADIUS * 2 + 2
  const g = new PlaneGeometry(size, size, 300, 300)
  const pos = g.attributes.position
  const depth = new Float32Array(pos.count)
  // 평면을 -90° 눕히므로 월드 z = -로컬 y
  for (let i = 0; i < pos.count; i++) depth[i] = Math.max(0, -terrainY(pos.getX(i), -pos.getY(i)))
  g.setAttribute('aDepth', new BufferAttribute(depth, 1))
  return g
}

/** 바깥 고리: 늘 깊은 바다 */
function outerGeometry() {
  const g = new RingGeometry(INNER_OCEAN_RADIUS - 0.5, 3000, 128, 1)
  g.setAttribute('aDepth', new BufferAttribute(new Float32Array(g.attributes.position.count).fill(60), 1))
  return g
}

const jadeTone = new Color('#4fc4b4')
const white = new Color('#ffffff')
const tmp = new Color()

/** 물결 고리를 만드는 것들 (내 해녀·테왁·다른 해녀·테왁) */
function collectRipples(out: Vector4[]) {
  let n = 0
  const push = (x: number, z: number, s: number, ph: number) => {
    if (n < out.length) out[n++].set(x, z, s, ph)
  }
  const surfaceStates = (s: string) => !UNDERWATER_STATES.has(s as never)
  if (player.zone === 'sea') {
    if (surfaceStates(player.pose.state)) push(player.pos.x, player.pos.z, 0.55 + player.pose.move * 0.6, 0)
    push(player.tewak.pos.x, player.tewak.pos.z, 0.4, 1.7)
  }
  for (const rm of remotes.values()) {
    if (rm.zone !== 'sea') continue
    if (!rm.underwater) push(rm.pos.x, rm.pos.z, 0.55 + rm.pose.move * 0.6, (rm.id % 7) * 0.9)
    push(rm.tewak.pos.x, rm.tewak.pos.z, 0.4, (rm.id % 5) * 1.3 + 0.5)
  }
  for (; n < out.length; n++) out[n].set(0, 0, 0, 0)
}

export function Ocean() {
  const level = useQuality((s) => s.level)
  const { inner, outer, innerGeo, outerGeo } = useMemo(() => {
    const normals = makeWaterNormals()
    const inner = makeMaterial(INNER_OCEAN_RADIUS, normals)
    const outer = makeMaterial(0, normals)
    return { inner, outer, innerGeo: innerGeometry(), outerGeo: outerGeometry() }
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const day = Math.max(0, 1 - env.night * 1.2)
    collectRipples(inner.uniforms.uRipples.value as Vector4[])
    for (const m of [inner, outer]) {
      const u = m.uniforms
      u.uTime.value = t
      u.uLayers.value = QUALITY[level].waterLayers
      u.uLightDir.value.copy(env.lightDir)
      u.uDeep.value.copy(env.deep)
      u.uShallow.value.copy(env.shallow)
      u.uJade.value.copy(env.shallow).lerp(jadeTone, 0.55 * day).multiplyScalar(0.75 + 0.35 * day)
      u.uGlint.value.copy(env.glint).multiplyScalar(env.glintI)
      u.uGlintPow.value = env.glintPow
      // 포말 색: 빛 받은 흰색 (밤엔 어둡게)
      tmp.copy(env.hemiSky).lerp(white, 0.5).multiplyScalar(0.25 + 0.7 * day)
      u.uFoam.value.copy(tmp)
      u.uDay.value = day
      u.uUnderDark.value.copy(env.underDark)
      u.uUnderBright.value.copy(env.underBright)
    }
  })

  return (
    <>
      <mesh geometry={innerGeo} material={inner} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} />
      <mesh geometry={outerGeo} material={outer} rotation={[-Math.PI / 2, 0, 0]} />
    </>
  )
}
