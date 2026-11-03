import { lifeMaterial } from './shapes'

// 물고기 떼 재질: 꼬리 쪽(-z)일수록 좌우로 살랑 (인스턴스마다 박자가 다름). 계산은 GPU 에서.

export const fishTime = { value: 0 }

export function fishMaterial(wag: number, speed: number) {
  const m = lifeMaterial({ roughness: 0.45 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = fishTime
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.731;
        float back = max(0.0, -position.z + 0.02);
        transformed.x += sin(uTime * ${speed.toFixed(2)} + ph) * back * back * ${wag.toFixed(2)};`,
      )
  }
  m.customProgramCacheKey = () => `fish-${wag}-${speed}`
  return m
}
