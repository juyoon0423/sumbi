import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, type Points } from 'three'
import { useGame } from '../../store/gameStore'
import { env } from '../time/env'

// 별: 한 번에 그리는 점 묶음 하나 (Points). 밝기·크기를 저마다 다르게, 천천히 반짝임.
// 별마다 나타나는 문턱값이 달라서 새벽엔 하나씩 사라지고 저녁엔 하나씩 돋아남.

const COUNT = 2400
const RADIUS = 3400

function makeGeometry() {
  const pos = new Float32Array(COUNT * 3)
  const size = new Float32Array(COUNT)
  const bright = new Float32Array(COUNT)
  const thresh = new Float32Array(COUNT)
  const phase = new Float32Array(COUNT)
  const tint = new Float32Array(COUNT)
  // 같은 하늘이 매번 나오게 고정 난수
  let seed = 20261103
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < COUNT; i++) {
    // 위쪽 반구에 고르게 (지평선 바로 아래까지)
    const y = -0.04 + rnd() * 1.04
    const a = rnd() * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    pos.set([Math.cos(a) * r * RADIUS, y * RADIUS, Math.sin(a) * r * RADIUS], i * 3)
    const k = rnd()
    // 대부분 작고 흐리게, 몇 개만 크고 밝게
    size[i] = 1.1 + Math.pow(k, 6) * 3.4
    bright[i] = 0.35 + Math.pow(k, 2.5) * 0.65
    // 밝은 별일수록 일찍 나타나고 늦게 사라짐
    thresh[i] = Math.min(0.98, rnd() * 0.85 + (1 - k) * 0.15)
    phase[i] = rnd() * 100
    tint[i] = rnd()
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aSize', new BufferAttribute(size, 1))
  g.setAttribute('aBright', new BufferAttribute(bright, 1))
  g.setAttribute('aThresh', new BufferAttribute(thresh, 1))
  g.setAttribute('aPhase', new BufferAttribute(phase, 1))
  g.setAttribute('aTint', new BufferAttribute(tint, 1))
  return g
}

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
          attribute float aTint;
          uniform float uStars;
          uniform float uTime;
          uniform float uPx;
          uniform vec3 uMoonDir;
          varying float vA;
          varying vec3 vCol;
          void main() {
            vec3 d = normalize(position);
            // 이 별의 차례가 오면 천천히 켜짐
            float on = smoothstep(aThresh, aThresh + 0.12, uStars * 1.1);
            float tw = 0.72 + 0.28 * sin(uTime * (0.5 + fract(aPhase) * 1.3) + aPhase);
            float horizon = smoothstep(-0.02, 0.18, d.y);
            float moon = 1.0 - 0.8 * smoothstep(0.985, 0.999, dot(d, uMoonDir));
            vA = on * aBright * tw * horizon * moon;
            vCol = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.9, 0.78), aTint);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPx * (0.85 + 0.15 * tw);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          varying vec3 vCol;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c);
            float a = smoothstep(0.5, 0.0, r);
            a *= a;
            if (vA * a < 0.003) discard;
            gl_FragColor = vec4(vCol * vA * a * 1.4, 1.0);
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
