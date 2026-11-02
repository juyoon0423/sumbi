import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3, type Points } from 'three'
import { useGame } from '../../store/gameStore'
import { env } from '../time/env'
import { GALAXY_NORMAL } from './galaxy'

// 별: 한 번에 그리는 점 묶음 하나 (Points).
// 밝기 등급(1~6등성)을 실제처럼 어두운 별이 훨씬 많게, 아주 밝은 별 몇 개만 작은 빛 번짐.
// 색은 푸른 흰색 ~ 흰색 ~ 노르스름한 색, 반짝임은 아주 미세하게 (수평선 가까이만 조금 더).
// 별마다 나타나는 문턱값이 달라서 저녁엔 하나씩 돋아나고, 새벽엔 수평선 쪽부터 하나씩 사라짐.
// 은하수 띠 근처에는 별을 더 촘촘히.

const FIELD = 3000
const BAND = 1800
const COUNT = FIELD + BAND
const RADIUS = 3400

/** 별 색 (온도): [색, 비율] */
const TINTS: [[number, number, number], number][] = [
  [[0.72, 0.82, 1.0], 0.22], // 푸른 흰색
  [[0.9, 0.94, 1.0], 0.38], // 흰색
  [[1.0, 0.96, 0.86], 0.24], // 노르스름한 흰색
  [[1.0, 0.86, 0.66], 0.12], // 노란빛
  [[1.0, 0.76, 0.6], 0.04], // 주황빛
]

function makeGeometry() {
  const pos = new Float32Array(COUNT * 3)
  const size = new Float32Array(COUNT)
  const bright = new Float32Array(COUNT)
  const thresh = new Float32Array(COUNT)
  const phase = new Float32Array(COUNT)
  const color = new Float32Array(COUNT * 3)
  const glow = new Float32Array(COUNT)
  // 같은 하늘이 매번 나오게 고정 난수
  let seed = 20261103
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const d = new Vector3()
  const t1 = new Vector3(GALAXY_NORMAL.y, -GALAXY_NORMAL.x, 0).normalize()
  const t2 = new Vector3().crossVectors(GALAXY_NORMAL, t1)
  for (let i = 0; i < COUNT; i++) {
    if (i < FIELD) {
      // 위쪽 반구에 고르게 (지평선 바로 아래까지)
      const y = -0.04 + rnd() * 1.04
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      d.set(Math.cos(a) * r, y, Math.sin(a) * r)
    } else {
      // 은하수 띠 근처 (가우스 분포로 띠 가운데에 몰리게)
      const a = rnd() * Math.PI * 2
      const g = (rnd() + rnd() + rnd() - 1.5) * 0.09
      d.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a)).addScaledVector(GALAXY_NORMAL, g).normalize()
      if (d.y < -0.04) d.y = -d.y
    }
    pos.set([d.x * RADIUS, d.y * RADIUS, d.z * RADIUS], i * 3)

    // 등급: 어두운 별(6등성)이 대부분, 1등성급은 몇 개
    const u = rnd()
    const mag = i < FIELD ? 6.2 - 5.4 * Math.pow(u, 5) : 6.3 - 2.5 * Math.pow(u, 3)
    const flux = Math.pow(10, -0.4 * (mag - 1))
    bright[i] = 0.16 + 0.84 * Math.pow(flux, 0.5)
    size[i] = 0.9 + 2.4 * Math.pow(flux, 0.45)
    glow[i] = mag < 1.75 ? 1 : 0
    // 밝은 별일수록 일찍 나타나고 늦게 사라짐
    thresh[i] = Math.min(0.97, rnd() * 0.8 + Math.min(1, (mag - 1) / 5) * 0.2)
    phase[i] = rnd() * 100
    let c = rnd()
    let tint = TINTS[0][0]
    for (const [col, w] of TINTS) {
      tint = col
      if ((c -= w) <= 0) break
    }
    color.set(tint, i * 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aSize', new BufferAttribute(size, 1))
  g.setAttribute('aBright', new BufferAttribute(bright, 1))
  g.setAttribute('aThresh', new BufferAttribute(thresh, 1))
  g.setAttribute('aPhase', new BufferAttribute(phase, 1))
  g.setAttribute('aColor', new BufferAttribute(color, 3))
  g.setAttribute('aGlow', new BufferAttribute(glow, 1))
  return g
}

/** 빛 번짐이 있는 밝은 별의 점 크기 배율 */
const GLOW_SCALE = 7

export function Starfield() {
  const ref = useRef<Points>(null!)
  const geometry = useMemo(makeGeometry, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: { uStars: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 }, uMoonDir: { value: env.moonDir.clone() } },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aBright;
          attribute float aThresh;
          attribute float aPhase;
          attribute vec3 aColor;
          attribute float aGlow;
          uniform float uStars;
          uniform float uTime;
          uniform float uPx;
          uniform vec3 uMoonDir;
          varying float vA;
          varying vec3 vCol;
          varying float vCore;
          void main() {
            vec3 d = normalize(position);
            float alt = clamp(d.y, 0.0, 1.0);
            // 이 별의 차례가 오면 천천히 켜짐. 새벽(uStars 가 줄어듦)엔 수평선 가까운 별부터 꺼짐
            float eff = uStars * 1.15 - (1.0 - uStars) * (1.0 - smoothstep(0.0, 0.6, alt)) * 0.7;
            float on = smoothstep(aThresh, aThresh + 0.1, eff);
            // 반짝임: 아주 미세하게, 공기가 두꺼운 수평선 쪽만 조금 더
            float amp = 0.05 + 0.12 * (1.0 - smoothstep(0.05, 0.4, alt));
            float tw = 1.0 + amp * sin(uTime * (1.1 + fract(aPhase) * 2.3) + aPhase) * sin(uTime * 0.37 + aPhase * 3.1);
            float horizon = smoothstep(-0.02, 0.16, d.y) * (0.55 + 0.45 * smoothstep(0.0, 0.3, alt));
            float moon = 1.0 - 0.85 * smoothstep(0.975, 0.999, dot(d, uMoonDir));
            vA = on * aBright * tw * horizon * moon;
            vCol = aColor;
            float sz = aSize * uPx;
            float scale = mix(1.0, ${GLOW_SCALE.toFixed(1)}, aGlow);
            vCore = 1.0 / scale;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = sz * scale;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          varying vec3 vCol;
          varying float vCore;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c) * 2.0;
            // 별 알맹이 (vCore 안쪽) + 밝은 별만 둘레 빛 번짐
            float core = exp(-pow(r / vCore, 2.0) * 3.2);
            float halo = vCore < 0.99 ? exp(-r * 5.5) * 0.35 + exp(-r * 14.0) * 0.4 : 0.0;
            float a = (core + halo) * vA;
            if (a < 0.003) discard;
            gl_FragColor = vec4(vCol * a * 1.5, 1.0);
          }
        `,
      }),
    [],
  )

  useFrame(({ camera, clock, gl }) => {
    const u = material.uniforms
    u.uStars.value = env.stars
    u.uTime.value = clock.elapsedTime
    u.uPx.value = gl.getPixelRatio()
    u.uMoonDir.value.copy(env.moonDir)
    ref.current.visible = env.stars > 0.01 && !useGame.getState().cameraUnderwater
    ref.current.position.copy(camera.position)
  })

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={-9} />
}
