import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from 'three'
import { damp } from '../../lib/math'
import { env, targetHour } from './env'
import { samplePalette } from './palette'

// 시간대 진행: 한국 시간(또는 개발용 고정 시각)을 따라 env 를 매 프레임 갱신하고 하늘을 그린다.
// 고정 시각을 바꾸면 그 사이 시간을 몇 초에 걸쳐 지나가며 부드럽게 바뀜 (낮 → 밤이면 노을을 거침).

/** 시각 → 해 방향. 6시쯤 동쪽(+x)에서 떠서 남쪽 하늘(-z)을 지나 18시 반쯤 서쪽(-x)으로 */
function sunDirAt(hour: number, out = new Vector3()) {
  const s = (hour - 6.1) / 12.6
  const theta = Math.PI * s
  const elev = Math.sin(theta) * 0.95 - 0.06
  out.set(Math.cos(theta), Math.sin(elev), -Math.sin(theta) * 0.85 - 0.3)
  return out.normalize()
}

/** 달: 밤 동안 바다 쪽 하늘(-z)에 낮게 떠서 천천히 움직임 → 수면에 달빛 길 */
function moonDirAt(hour: number, out = new Vector3()) {
  const h = ((hour - 12 + 24) % 24) - 12 // 자정 = 0
  const a = h * 0.06
  return out.set(0.32 + a, 0.34 - Math.abs(a) * 0.3, -0.88).normalize()
}

const circDiff = (from: number, to: number) => ((to - from + 36) % 24) - 12

const tmp = new Vector3()

export function TimeOfDay() {
  const sky = useRef<Mesh>(null!)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uSunDir: { value: new Vector3() },
          uSunColor: { value: new Color() },
          uSunVis: { value: 1 },
          uMoonDir: { value: new Vector3() },
          uMoonVis: { value: 0 },
          uStars: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunVis;
          uniform vec3 uMoonDir;
          uniform float uMoonVis;
          uniform float uStars;
          uniform float uTime;
          varying vec3 vDir;

          float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }

          void main() {
            vec3 d = normalize(vDir);
            float up = max(d.y, 0.0);
            vec3 col = mix(uHorizon, uTop, pow(up, 0.55));

            // 해: 둥근 원 + 둘레 빛 (지평선 근처에선 하늘 아래쪽까지 물듦)
            float sd = max(dot(d, uSunDir), 0.0);
            col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 64.0) * 0.35) * uSunVis;
            col = mix(col, uSunColor * 1.3 + 0.25, smoothstep(0.9993, 0.9996, sd) * uSunVis);

            // 달 + 은은한 무리
            float md = max(dot(d, uMoonDir), 0.0);
            col += vec3(0.55, 0.62, 0.8) * pow(md, 200.0) * 0.35 * uMoonVis;
            col = mix(col, vec3(0.95, 0.96, 1.0), smoothstep(0.99955, 0.99975, md) * uMoonVis);

            // 별: 방향을 격자로 나눠 드문드문, 반짝임
            vec3 g = floor(d * 260.0);
            float h = hash(g);
            float star = step(0.9975, h) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
            vec3 f = fract(d * 260.0) - 0.5;
            star *= smoothstep(0.5, 0.1, length(f));
            col += vec3(0.9, 0.93, 1.0) * star * uStars * smoothstep(0.02, 0.25, d.y) * (1.0 - md);

            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )
  const geometry = useMemo(() => new SphereGeometry(4000, 48, 24), [])

  // 처음 한 번은 바로 맞춤
  const started = useRef(false)

  useFrame(({ camera, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const target = targetHour()
    if (!started.current) {
      env.hour = target
      started.current = true
    } else {
      const diff = circDiff(env.hour, target)
      env.hour = Math.abs(diff) < 0.002 ? target : (env.hour + diff * damp(1.1, dt) + 24) % 24
    }
    samplePalette(env, env.hour)
    sunDirAt(env.hour, env.sunDir)
    moonDirAt(env.hour, env.moonDir)

    // 그림자·반짝임 빛: 낮엔 해(너무 낮지 않게), 밤엔 달
    tmp.copy(env.sunDir)
    tmp.y = Math.max(tmp.y, 0.14)
    tmp.normalize()
    const moonW = Math.min(1, Math.max(0, (env.night - 0.3) / 0.4))
    env.lightDir.copy(tmp).lerp(env.moonDir, moonW).normalize()
    env.glintPow = 180 - 60 * moonW

    const u = material.uniforms
    u.uTop.value.copy(env.skyTop)
    u.uHorizon.value.copy(env.horizon)
    u.uSunDir.value.copy(env.sunDir)
    u.uSunColor.value.copy(env.light).lerp(env.glint, 0.4)
    u.uSunVis.value = Math.min(1, Math.max(0, (env.sunDir.y + 0.04) / 0.08))
    u.uMoonDir.value.copy(env.moonDir)
    u.uMoonVis.value = moonW
    u.uStars.value = env.stars
    u.uTime.value = clock.elapsedTime
    sky.current.position.copy(camera.position)
  }, -1)

  return <mesh ref={sky} geometry={geometry} material={material} frustumCulled={false} renderOrder={-10} />
}
