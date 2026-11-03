import type { Color, MeshStandardMaterial } from 'three'

// 바위·지형 재질에 덧입히는 사실적인 무늬 (onBeforeCompile 로 three 기본 재질에 끼워 넣음).
// - 현무암: 구멍이 송송 뚫린 무늬(작은 구멍은 어둡게, 표면은 오톨도톨하게 법선을 흔듦)
// - 물에 닿는 부분: 젖어서 더 어둡고 매끈하게 반짝임 (파도 높이만큼 오르내리는 띠)
// - 물속 모래: 물결 무늬 (모래 연흔)
// - 멀리 있는 산: 대기 원근감 (푸르스름하게 뿌옇게)

const NOISE = /* glsl */ `
  float sdHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float sdNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(sdHash(i), sdHash(i + vec3(1, 0, 0)), f.x), mix(sdHash(i + vec3(0, 1, 0)), sdHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(sdHash(i + vec3(0, 0, 1)), sdHash(i + vec3(1, 0, 1)), f.x), mix(sdHash(i + vec3(0, 1, 1)), sdHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // 현무암 구멍: 노이즈가 아주 낮은 곳만 작은 구멍 (0 = 구멍 안, 1 = 표면). 반복문 없이 가볍게
  float sdPores(vec3 p) {
    return smoothstep(0.1, 0.2, sdNoise(p)) * smoothstep(0.08, 0.17, sdNoise(p * 2.3 + 7.1));
  }
`

export interface DetailUniforms {
  uTime: { value: number }
  /** 젖은 띠 위쪽 (수면 기준 높이) */
  uWetTop: { value: number }
}

export const detailUniforms: DetailUniforms = {
  uTime: { value: 0 },
  uWetTop: { value: 0.32 },
}

/**
 * 현무암·지형 무늬 덧입히기.
 * sand: 물속 모래 물결 무늬도 (지형만), pores: 구멍 크기 배율
 */
export function patchBasalt(material: MeshStandardMaterial, opts: { sand?: boolean; poreScale?: number; maxY?: number } = {}) {
  const poreScale = (opts.poreScale ?? 1).toFixed(3)
  const maxY = (opts.maxY ?? 1e4).toFixed(2)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = detailUniforms.uTime
    shader.uniforms.uWetTop = detailUniforms.uWetTop
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSdWorld;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 sdW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            sdW = instanceMatrix * sdW;
          #endif
          vSdWorld = (modelMatrix * sdW).xyz;
        }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSdWorld;\nuniform float uTime;\nuniform float uWetTop;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sdY = vSdWorld.y;
        // 물에 닿는 높이: 파도처럼 천천히 오르내림
        float sdWater = 0.06 * sin(uTime * 0.9 + vSdWorld.x * 0.3) + 0.04 * sin(uTime * 1.7 + vSdWorld.z * 0.5);
        float sdWet = 1.0 - smoothstep(sdWater - 0.05, uWetTop + sdWater, sdY);
        // 현무암 무늬가 들어가는 높이 (지형은 해안 띠만, 풀밭엔 안 넣음)
        float sdLand = smoothstep(-0.7, -0.3, sdY) * (1.0 - smoothstep(${maxY} - 0.4, ${maxY}, sdY));
        float sdPore = sdPores(vSdWorld * ${poreScale} * 3.2);
        float sdGrain = sdNoise(vSdWorld * 9.0) * 0.6 + sdNoise(vSdWorld * 23.0) * 0.4;
        // 구멍은 어둡게, 표면은 오톨도톨 얼룩
        diffuseColor.rgb *= mix(1.0, mix(0.45, 1.0, sdPore) * (0.82 + 0.3 * sdGrain), sdLand);
        diffuseColor.rgb *= 1.0 - 0.45 * sdWet * sdLand;
        ${
          opts.sand
            ? `// 물속 모래: 결이 진 물결 무늬 (얕을수록 또렷)
        float sdUnder = 1.0 - smoothstep(-1.2, -0.6, sdY);
        float sdWarp = sdNoise(vSdWorld * 0.35) * 3.0;
        float sdRipple = sin(dot(vSdWorld.xz, vec2(0.83, 0.55)) * 3.4 + sdWarp);
        diffuseColor.rgb *= mix(1.0, 0.9 + 0.12 * sdRipple + 0.08 * (sdGrain - 0.5), sdUnder);`
            : ''
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // 젖은 바위는 매끈하게 반짝임
        roughnessFactor = mix(roughnessFactor, 0.28, sdWet * sdLand);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // 오톨도톨한 표면: 노이즈 기울기로 법선을 살짝 흔듦 (구멍 가장자리는 더)
          vec3 sp = vSdWorld * ${poreScale} * 3.2;
          float h0 = sdPores(sp) * 0.5 + sdNoise(vSdWorld * 9.0) * 0.5;
          float hx = sdPores(sp + vec3(0.12, 0.0, 0.0)) * 0.5 + sdNoise((vSdWorld + vec3(0.04, 0.0, 0.0)) * 9.0) * 0.5;
          float hy = sdPores(sp + vec3(0.0, 0.12, 0.0)) * 0.5 + sdNoise((vSdWorld + vec3(0.0, 0.04, 0.0)) * 9.0) * 0.5;
          float hz = sdPores(sp + vec3(0.0, 0.0, 0.12)) * 0.5 + sdNoise((vSdWorld + vec3(0.0, 0.0, 0.04)) * 9.0) * 0.5;
          vec3 gv = (viewMatrix * vec4(hx - h0, hy - h0, hz - h0, 0.0)).xyz / 0.04;
          normal = normalize(normal - gv * 0.03 * sdLand);
        }
        `,
      )
  }
  material.customProgramCacheKey = () => `basalt-${poreScale}-${maxY}-${opts.sand ? 1 : 0}`
  material.needsUpdate = true
}

/** 멀리 있는 산·오름: 거리만큼 푸르스름한 하늘빛으로 뿌옇게 (대기 원근감) */
export function patchAerial(material: MeshStandardMaterial, haze: { value: Color }, amount: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHaze = haze
    shader.uniforms.uHazeAmt = amount
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAeWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvAeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAeWorld;\nuniform vec3 uHaze;\nuniform float uHazeAmt;')
      .replace(
        '#include <fog_fragment>',
        `{
          float d = length(vAeWorld - cameraPosition);
          // 멀수록, 낮을수록(공기가 두꺼움) 더 뿌옇게
          float k = (1.0 - exp(-d / 650.0)) * mix(1.0, 0.75, smoothstep(40.0, 220.0, vAeWorld.y));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(k * uHazeAmt, 0.0, 0.92));
        }
        #include <fog_fragment>`,
      )
  }
  material.customProgramCacheKey = () => 'aerial'
  material.needsUpdate = true
}
