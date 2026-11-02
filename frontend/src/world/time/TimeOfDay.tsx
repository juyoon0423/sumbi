import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from 'three'
import { damp } from '../../lib/math'
import { env, targetHour } from './env'
import { displayMoonPhase } from './moon'
import { samplePalette } from './palette'
import { SKY_GLSL, skyUniforms } from '../sky/skyGlsl'
import { GALAXY_CENTER, GALAXY_NORMAL } from '../sky/galaxy'

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
          ...skyUniforms,
          uStars: { value: 0 },
          uTime: { value: 0 },
          uGalN: { value: GALAXY_NORMAL },
          uGalC: { value: GALAXY_CENTER },
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
          ${SKY_GLSL}
          uniform float uStars;
          uniform float uTime;
          uniform vec3 uGalN;
          uniform vec3 uGalC;
          varying vec3 vDir;

          float fbm(vec3 p) {
            return skyNoise(p) * 0.5 + skyNoise(p * 2.03) * 0.25 + skyNoise(p * 4.1) * 0.15 + skyNoise(p * 8.3) * 0.1;
          }

          // 은하수: 별이 촘촘한 띠 + 가운데(궁수자리 쪽) 볼록하고 따뜻한 빛 + 어두운 먼지 줄무늬 + 아주 작은 별 알갱이
          vec3 milkyWay(vec3 d) {
            float b = dot(d, uGalN); // 은하 위도 (sin)
            vec3 inPlane = normalize(d - uGalN * b + 1e-5);
            float l = dot(inPlane, uGalC); // 1 = 은하 중심 쪽
            float core = smoothstep(-0.2, 1.0, l);
            float width = 0.07 + 0.09 * core * core;
            float band = exp(-pow(b / width, 2.0));
            float clump = fbm(d * 9.0);
            float star = smoothstep(0.35, 0.85, clump) * 0.8 + 0.2;
            // 먼지 줄무늬: 띠 가운데를 따라 구불구불하게 어둡게
            float lane = exp(-pow((b - 0.018 * (fbm(d * 5.0) - 0.5) * 4.0) / (0.022 + 0.02 * core), 2.0));
            float dust = lane * smoothstep(0.35, 0.7, fbm(d * 14.0 + 3.1)) * (0.45 + 0.55 * core);
            float bright = band * star * (0.35 + 0.9 * core * core) * (1.0 - dust * 0.85);
            // 띠 바깥으로 아주 옅게 번짐
            bright += exp(-pow(b / (width * 2.6), 2.0)) * 0.08 * (0.5 + core);
            vec3 tint = mix(vec3(0.58, 0.66, 0.95), vec3(0.95, 0.86, 0.72), core * core * 0.75);
            vec3 col = tint * bright;
            // 아주 작은 별 알갱이 (띠 안에서 더 많이)
            vec3 g = d * 520.0;
            vec3 cell = floor(g);
            float h = skyHash(cell);
            float density = 0.06 + 0.5 * band * star;
            vec3 f = fract(g) - 0.5;
            float grain = step(1.0 - density * 0.35, h) * smoothstep(0.32, 0.0, length(f.xy + f.z * 0.3));
            col += vec3(0.85, 0.88, 1.0) * grain * (0.25 + 0.5 * fract(h * 37.0)) * (0.4 + band);
            return col;
          }

          // 달: 실제 모양(위상) + 바다(어두운 무늬) + 어두운 쪽은 지구빛으로 아주 희미하게
          vec3 moonDisc(vec3 d, out float cover) {
            vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
            vec3 upv = cross(right, uMoonDir);
            float R = 0.027;
            vec2 q = vec2(dot(d, right), dot(d, upv)) / R;
            float r = length(q);
            cover = smoothstep(1.0, 0.94, r) * step(0.0, dot(d, uMoonDir));
            if (cover <= 0.0) return vec3(0.0);
            vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r * r)));
            float th = uMoonPhase * 6.2831853;
            // 차오르는 달은 오른쪽부터 (북반구)
            vec3 L = vec3(sin(th), 0.0, -cos(th));
            float lit = smoothstep(-0.04, 0.1, dot(n, L));
            float maria = 0.78 + 0.22 * smoothstep(0.35, 0.65, skyNoise(vec3(q * 2.6, 1.7))) - 0.12 * smoothstep(0.55, 0.75, skyNoise(vec3(q * 5.0, 4.2)));
            float limb = 0.82 + 0.18 * n.z;
            return vec3(1.0, 0.98, 0.92) * (lit * maria * limb * 1.15 + 0.05);
          }

          void main() {
            vec3 d = normalize(vDir);
            vec3 col = skyColor(d);

            // 은하수와 작은 별 알갱이 (밤에만, 수평선 가까이·달 근처는 옅게)
            float md = max(dot(d, uMoonDir), 0.0);
            float vis = uStars * smoothstep(0.02, 0.3, d.y) * (1.0 - 0.7 * smoothstep(0.9, 0.995, md));
            if (vis > 0.001) col += milkyWay(d) * 0.115 * vis;

            // 해 원반
            float sd = max(dot(d, uSunDir), 0.0);
            col = mix(col, uSunColor * 1.3 + 0.25, smoothstep(0.9993, 0.9996, sd) * uSunVis);

            // 달 원반 (구름은 그 앞에 그려짐)
            float cover;
            vec3 moon = moonDisc(d, cover);
            col = mix(col, moon, cover * uMoonVis);

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

    const u = skyUniforms
    u.uSkyTop.value.copy(env.skyTop)
    u.uSkyHorizon.value.copy(env.horizon)
    u.uSunDir.value.copy(env.sunDir)
    u.uSunColor.value.copy(env.light).lerp(env.glint, 0.4)
    u.uSunVis.value = Math.min(1, Math.max(0, (env.sunDir.y + 0.04) / 0.08))
    u.uMoonDir.value.copy(env.moonDir)
    u.uMoonVis.value = moonW
    // 달 모양은 가끔만 다시 계산 (하루에 조금씩 바뀜)
    if (clock.elapsedTime - lastPhaseAt > 60 || lastPhaseAt < 0) {
      u.uMoonPhase.value = displayMoonPhase()
      lastPhaseAt = clock.elapsedTime
    }
    // 해가 지평선 언저리이고 아직 밤이 아닐 때 = 노을빛
    u.uWarm.value = Math.max(0, 1 - Math.abs(env.sunDir.y - 0.03) / 0.2) * Math.max(0, 1 - env.night * 1.1)
    u.uNight.value = env.night
    material.uniforms.uStars.value = env.stars
    material.uniforms.uTime.value = clock.elapsedTime
    sky.current.position.copy(camera.position)
  }, -1)

  return <mesh ref={sky} geometry={geometry} material={material} frustumCulled={false} renderOrder={-10} />
}

let lastPhaseAt = -1
