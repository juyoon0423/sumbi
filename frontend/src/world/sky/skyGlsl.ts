import { Color, Vector3 } from 'three'

// 하늘 색 함수: 하늘 돔(TimeOfDay)과 수면 반사(Ocean)가 같은 식을 써서 물에 비친 하늘이 실제 하늘과 맞음.
// 값은 TimeOfDay 가 매 프레임 skyUniforms 에 넣고, 두 재질이 같은 uniform 객체를 나눠 씀.

export const skyUniforms = {
  uSkyTop: { value: new Color() },
  uSkyHorizon: { value: new Color() },
  uSunDir: { value: new Vector3(0, 1, 0) },
  uSunColor: { value: new Color() },
  /** 해가 지평선 위에 있는 정도 (0 ~ 1) */
  uSunVis: { value: 1 },
  uMoonDir: { value: new Vector3(0, 1, 0) },
  /** 밤 정도에 따른 달 보임 (0 ~ 1) */
  uMoonVis: { value: 0 },
  /** 달 모양 (0 삭 · 0.5 보름) */
  uMoonPhase: { value: 0.5 },
  /** 노을빛 (해가 지평선 언저리) */
  uWarm: { value: 0 },
  /** 0 낮 ~ 1 한밤 */
  uNight: { value: 0 },
}

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunVis;
uniform vec3 uMoonDir;
uniform float uMoonVis;
uniform float uMoonPhase;
uniform float uWarm;
uniform float uNight;

float skyHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float skyNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(skyHash(i), skyHash(i + vec3(1, 0, 0)), f.x), mix(skyHash(i + vec3(0, 1, 0)), skyHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(skyHash(i + vec3(0, 0, 1)), skyHash(i + vec3(1, 0, 1)), f.x), mix(skyHash(i + vec3(0, 1, 1)), skyHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

/** 해 쪽 방위일수록 1 (수평 방향만 비교) */
float skySunSide(vec3 d) {
  vec2 a = d.xz;
  vec2 b = uSunDir.xz;
  float la = length(a);
  float lb = length(b);
  if (la < 1e-4 || lb < 1e-4) return 0.5;
  return dot(a / la, b / lb) * 0.5 + 0.5;
}

/**
 * 하늘 색 (해·달 원반 제외, 빛 번짐 포함). d 는 단위 방향.
 * 대기 산란 흉내: 머리 위는 짙은 파랑, 수평선 쪽은 두꺼운 공기를 지나 옅고 뿌연 색, 해 둘레는 미 산란 빛 번짐.
 */
vec3 skyColor(vec3 d) {
  float up = max(d.y, 0.0);
  float sunSide = skySunSide(d);

  // 노을·새벽: 해 쪽 수평선은 따뜻하게, 반대쪽은 푸르스름하게 (낮엔 그대로)
  vec3 coolHorizon = mix(uSkyHorizon, uSkyTop * 1.6 + vec3(0.05, 0.06, 0.1), 0.55);
  vec3 horizon = mix(uSkyHorizon, mix(coolHorizon, uSkyHorizon, smoothstep(0.15, 0.85, sunSide)), uWarm * 0.75);

  // 공기 두께에 따른 그라데이션 (수평선 근처에서 빨리 옅어짐)
  float t = 1.0 - exp(-up * 2.8);
  vec3 col = mix(horizon, uSkyTop, t);
  // 수평선 바로 위 뿌연 띠 (대기 원근감). 밤엔 살짝 밝은 남색
  float haze = exp(-up * 16.0);
  col = mix(col, horizon * (1.06 + 0.12 * uNight) + vec3(0.012, 0.016, 0.03) * uNight, haze * 0.55);

  // 노을: 주황 지평선과 남색 하늘 사이를 보랏빛 띠로 (해 쪽이 더 진하게)
  float band = exp(-pow((up - 0.2) / 0.16, 2.0));
  col = mix(col, vec3(0.55, 0.36, 0.62), band * uWarm * 0.55 * (0.6 + 0.4 * sunSide));

  // 해 둘레 빛 번짐: 넓고 옅은 번짐 + 가까운 밝은 번짐 (미 산란). 해가 낮으면 수평선을 따라 퍼짐
  float sd = max(dot(d, uSunDir), 0.0);
  float glow = pow(sd, 5.0) * 0.16 + pow(sd, 48.0) * 0.32 + pow(sd, 600.0) * 0.6;
  glow += pow(sunSide, 6.0) * exp(-up * 6.0) * 0.22 * uWarm;
  col += uSunColor * glow * uSunVis;

  // 달 둘레 은은한 빛 + 아주 옅은 달무리 고리(22°)
  float md = max(dot(d, uMoonDir), 0.0);
  float lit = 0.35 + 0.65 * (1.0 - cos(uMoonPhase * 6.2831853)) * 0.5;
  float ring = exp(-pow((acos(clamp(md, -1.0, 1.0)) - 0.384) / 0.035, 2.0));
  col += vec3(0.55, 0.62, 0.82) * (pow(md, 1600.0) * 0.32 + pow(md, 160.0) * 0.1 + pow(md, 14.0) * 0.035 + ring * 0.018) * uMoonVis * lit;

  // 지평선 아래 (수면 반사에서 씀): 수평선 색이 조금 어두워짐
  if (d.y < 0.0) col = mix(col, horizon * 0.85, smoothstep(0.0, -0.3, d.y));
  return col;
}
`
