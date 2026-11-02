import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { Color, DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three'
import { INNER_OCEAN_RADIUS, WAVE_GLSL } from './waves'
import { env } from '../time/env'

// 수면: 가운데(파도 있음, 촘촘한 격자) + 바깥 고리(평평, 수평선까지)
// 위에서 보면 푸른 바다 + 하늘 반사 + 햇빛 반짝임, 아래에서 보면 밝게 빛나는 수면(스넬의 창)

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  ${WAVE_GLSL}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 w = waveData(world.xz, uTime);
    world.y += w.x;
    vHeight = w.x;
    vNormal = normalize(vec3(-w.y, 1.0, -w.z));
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uClipRadius;
  uniform vec3 uSunDir;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSun;
  uniform float uGlintPow;
  uniform vec3 uUnderDark;
  uniform vec3 uUnderBright;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    if (uClipRadius > 0.0 && length(vWorld.xz) > uClipRadius) discard;
    vec3 v = normalize(cameraPosition - vWorld);
    // 잔물결
    vec2 q = vWorld.xz * 1.7;
    vec3 n = normalize(vNormal + 0.05 * vec3(sin(q.x + uTime * 1.3) * cos(q.y * 0.8 - uTime), 0.0,
                                             cos(q.y + uTime * 1.1) * sin(q.x * 0.7 + uTime * 0.9)));
    vec3 col;
    if (gl_FrontFacing) {
      float ndv = max(dot(n, v), 0.0);
      float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
      vec3 water = mix(uDeep, uShallow, smoothstep(-0.05, 0.22, vHeight) * 0.6 + 0.15);
      col = mix(water, uSky, clamp(fresnel * 0.9, 0.0, 1.0));
      vec3 r = reflect(-uSunDir, n);
      float spec = pow(max(dot(r, v), 0.0), uGlintPow);
      col += uSun * spec;
    } else {
      // 물속에서 올려다본 수면
      vec3 nn = -n;
      float ndv = abs(dot(nn, v));
      float window = smoothstep(0.55, 0.85, ndv);
      float ripple = 0.5 + 0.5 * sin(vWorld.x * 2.3 + uTime * 1.7) * sin(vWorld.z * 2.1 - uTime * 1.3);
      col = mix(uUnderDark, uUnderBright, window * (0.75 + 0.25 * ripple));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function makeMaterial(clipRadius: number) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uClipRadius: { value: clipRadius },
        uSunDir: { value: new Vector3() },
        uDeep: { value: new Color('#0e4c66') },
        uShallow: { value: new Color('#2a9aa3') },
        uSky: { value: new Color('#bfdcea') },
        uSun: { value: new Color('#fff1d6') },
        uGlintPow: { value: 180 },
        uUnderDark: { value: new Color('#145d70') },
        uUnderBright: { value: new Color('#bff3fb') },
      },
    ]),
  })
}

export function Ocean() {
  const [inner, outer] = useMemo(() => {
    const a = makeMaterial(INNER_OCEAN_RADIUS)
    const b = makeMaterial(0)
    return [a, b]
  }, [])

  useFrame(({ clock }) => {
    for (const m of [inner, outer]) {
      const u = m.uniforms
      u.uTime.value = clock.elapsedTime
      // 시간대: 물빛·하늘 반사·해(밤엔 달) 반짝임
      u.uSunDir.value.copy(env.lightDir)
      u.uDeep.value.copy(env.deep)
      u.uShallow.value.copy(env.shallow)
      u.uSky.value.copy(env.reflect)
      u.uSun.value.copy(env.glint).multiplyScalar(env.glintI)
      u.uGlintPow.value = env.glintPow
      u.uUnderDark.value.copy(env.underDark)
      u.uUnderBright.value.copy(env.underBright)
    }
  })

  return (
    <>
      <mesh material={inner} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <planeGeometry args={[INNER_OCEAN_RADIUS * 2 + 2, INNER_OCEAN_RADIUS * 2 + 2, 300, 300]} />
      </mesh>
      <mesh material={outer} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[INNER_OCEAN_RADIUS - 0.5, 3000, 128, 1]} />
      </mesh>
    </>
  )
}
