// 수면 파도: JS(캐릭터·테왁 높이)와 GLSL(수면 셰이더)이 같은 상수를 쓰도록 여기서 함께 만든다.

type Wave = { dx: number; dz: number; amp: number; k: number; w: number }

const RAW: [number, number, number, number, number][] = [
  // 방향 x, 방향 z, 진폭(m), 파장(m), 속도 배율
  [1.0, 0.3, 0.11, 9.0, 0.6],
  [-0.4, 1.0, 0.07, 6.0, 0.6],
  [0.7, -0.7, 0.04, 3.5, 0.55],
  [0.2, 0.9, 0.025, 2.1, 0.5],
]

const WAVES: Wave[] = RAW.map(([x, z, amp, len, speed]) => {
  const l = Math.hypot(x, z)
  const k = (Math.PI * 2) / len
  return { dx: x / l, dz: z / l, amp, k, w: Math.sqrt(9.8 * k) * speed }
})

/** 이 반경 밖에서는 파도가 잦아들어 평평해짐 (바깥 수면과 이어 붙이기 위해) */
export const WAVE_FADE_START = 85
export const WAVE_FADE_END = 108
export const INNER_OCEAN_RADIUS = 110

function fade(x: number, z: number) {
  const r = Math.hypot(x, z)
  const t = Math.min(1, Math.max(0, (r - WAVE_FADE_START) / (WAVE_FADE_END - WAVE_FADE_START)))
  return 1 - t * t * (3 - 2 * t)
}

export function waveHeight(x: number, z: number, t: number) {
  let h = 0
  for (const wv of WAVES) h += wv.amp * Math.sin(wv.k * (wv.dx * x + wv.dz * z) + wv.w * t)
  return h * fade(x, z)
}

const f = (n: number) => n.toFixed(5)

/** 셰이더용: vec3 waveData(vec2 p, float t) → (높이, dh/dx, dh/dz) */
export const WAVE_GLSL = /* glsl */ `
vec3 waveData(vec2 p, float t) {
  float h = 0.0; float dx = 0.0; float dz = 0.0;
  float ph; float c;
${WAVES.map(
  (w) => `  ph = ${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * p.y) + ${f(w.w)} * t;
  h += ${f(w.amp)} * sin(ph);
  c = ${f(w.amp * w.k)} * cos(ph);
  dx += c * ${f(w.dx)}; dz += c * ${f(w.dz)};`,
).join('\n')}
  float r = length(p);
  float fd = 1.0 - smoothstep(${f(WAVE_FADE_START)}, ${f(WAVE_FADE_END)}, r);
  return vec3(h, dx, dz) * fd;
}
`
