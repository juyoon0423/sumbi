import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { seededRandom } from '../../lib/math'
import { fx, player } from '../../player/runtime'
import { env } from '../time/env'
import { useGame } from '../../store/gameStore'
import { SUN_DIR } from './SkyAndLight'
import { waveHeight } from './waves'

// 물속 분위기: 빛줄기, 떠다니는 입자, 기포, 입수 물보라

/** 수면에서 비스듬히 내려오는 빛줄기 */
function LightRays() {
  const rays = useMemo(() => {
    const rand = seededRandom(3)
    return Array.from({ length: 16 }, () => {
      const a = rand() * Math.PI * 2
      const r = rand() * 55
      return { x: Math.cos(a) * r, z: 8 + Math.sin(a) * r, w: 0.8 + rand() * 1.4, seed: rand() * 10 }
    })
  }, [])
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(1, 1.8, 14, 16, 1, true)
    g.translate(0, -7, 0) // 윗면이 원점(수면)
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vSeed;
          void main() {
            vUv = uv;
            vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
            vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uStrength;
          varying vec2 vUv;
          varying vec3 vWorld;
          varying vec3 vNormal;
          varying float vSeed;
          void main() {
            vec3 v = normalize(cameraPosition - vWorld);
            float edge = pow(abs(dot(normalize(vNormal), v)), 1.5);
            float dist = length(cameraPosition - vWorld);
            float fade = 1.0 - smoothstep(8.0, 28.0, dist);
            float near = smoothstep(0.5, 2.5, dist);
            float flicker = 0.6 + 0.4 * sin(uTime * 0.6 + vSeed * 6.0);
            float a = pow(vUv.y, 1.6) * edge * fade * near * flicker * 0.16 * uStrength;
            gl_FragColor = vec4(vec3(0.75, 0.97, 1.0) * a, 1.0);
          }
        `,
      }),
    [],
  )
  const ref = useRef<InstancedMesh>(null!)
  const placed = useRef(false)

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uStrength.value = env.rays
    // 물 위에서는 파도 골 사이로 빛줄기 윗부분이 보이지 않도록 숨김
    ref.current.visible = useGame.getState().cameraUnderwater
    if (placed.current) return
    // 햇빛 방향으로 기울이기
    const tilt = Math.atan2(Math.hypot(SUN_DIR.x, SUN_DIR.z), SUN_DIR.y) * 0.5
    const yaw = Math.atan2(SUN_DIR.x, SUN_DIR.z)
    const o = new Object3D()
    rays.forEach((r, i) => {
      o.position.set(r.x, -0.4, r.z)
      o.rotation.set(-tilt, yaw, 0, 'YXZ')
      o.scale.set(r.w, 1, r.w)
      o.updateMatrix()
      ref.current.setMatrixAt(i, o.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    placed.current = true
  })

  return <instancedMesh ref={ref} args={[geometry, material, rays.length]} frustumCulled={false} />
}

/** 카메라 주변에 떠다니는 작은 입자 (마린 스노우) */
function MarineSnow() {
  const BOX = 22
  const geometry = useMemo(() => {
    const rand = seededRandom(5)
    const n = 700
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n * 3; i++) arr[i] = rand() * BOX
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(arr, 3))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uBox: { value: BOX }, uDim: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uBox;
          varying float vFade;
          void main() {
            vec3 p = position + vec3(sin(uTime * 0.1 + position.y) * 0.5, uTime * 0.08, cos(uTime * 0.12 + position.x) * 0.5);
            // 카메라를 중심으로 상자 안에서 순환
            p = mod(p - cameraPosition + uBox * 0.5, uBox) + cameraPosition - uBox * 0.5;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float d = -mv.z;
            vFade = (1.0 - smoothstep(4.0, uBox * 0.5, d)) * smoothstep(0.3, 1.0, d) * step(p.y, -0.3);
            gl_PointSize = 70.0 / d;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uDim;
          varying float vFade;
          void main() {
            float r = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, r) * vFade * 0.5 * uDim;
            gl_FragColor = vec4(vec3(0.8, 0.95, 1.0) * a, 1.0);
          }
        `,
      }),
    [],
  )
  const ref = useRef<Points>(null!)
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uDim.value = 1 - 0.65 * env.night
    ref.current.visible = useGame.getState().cameraUnderwater
  })
  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * 밤바다 플랑크톤: 물속 곳곳에서 푸르게 가물거리고, 해녀가 헤엄쳐 지나가면 밀려나며 환하게 빛남.
 * 상태 없이 셰이더에서 내 해녀 위치·속도만으로 계산.
 */
function Plankton() {
  const BOX = 18
  const geometry = useMemo(() => {
    const rand = seededRandom(11)
    const n = 2200
    const arr = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = rand() * BOX
      arr[i * 3 + 1] = rand() * BOX
      arr[i * 3 + 2] = rand() * BOX
      seed[i] = rand()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(arr, 3))
    g.setAttribute('seed', new BufferAttribute(seed, 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uBox: { value: BOX },
          uLevel: { value: 0 },
          uPlayer: { value: new Vector3() },
          uStir: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uBox;
          uniform vec3 uPlayer;
          uniform float uStir;
          attribute float seed;
          varying float vGlow;
          varying float vFade;
          void main() {
            vec3 p = position + vec3(sin(uTime * 0.13 + seed * 9.0) * 0.6, sin(uTime * 0.09 + seed * 5.0) * 0.4, cos(uTime * 0.11 + seed * 7.0) * 0.6);
            // 카메라 주변 상자 안에서 순환 (내 주변 어디서나 보이게)
            p = mod(p - cameraPosition + uBox * 0.5, uBox) + cameraPosition - uBox * 0.5;
            // 해녀 가까이: 밀려나며 빛남
            vec3 away = p - uPlayer;
            float d = length(away);
            float near = exp(-d * d / 4.5);
            p += normalize(away + 1e-4) * near * uStir * 1.1;
            float twinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.6 + seed * 1.4) + seed * 30.0), 3.0);
            vGlow = twinkle * 0.5 + near * uStir * 3.2;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float z = -mv.z;
            vFade = (1.0 - smoothstep(5.0, uBox * 0.5, z)) * smoothstep(0.2, 0.8, z) * step(p.y, -0.4);
            gl_PointSize = (40.0 + near * uStir * 70.0) / z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uLevel;
          varying float vGlow;
          varying float vFade;
          void main() {
            float r = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, r) * vFade * vGlow * uLevel;
            gl_FragColor = vec4(vec3(0.35, 0.95, 1.0) * a, 1.0);
          }
        `,
      }),
    [],
  )
  const wake = useMemo(() => Array.from({ length: 160 }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: WAKE_LIFE })), [])
  const next = useRef(0)
  const spawnAcc = useRef(0)
  const wakeRef = useRef<Points>(null!)
  const wakeGeo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(160 * 3), 3))
    g.setAttribute('life', new BufferAttribute(new Float32Array(160).fill(1), 1))
    return g
  }, [])
  const wakeMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uLevel: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float life;
          varying float vA;
          void main() {
            vec4 mv = viewMatrix * vec4(position, 1.0);
            // 처음엔 확 밝았다가 천천히 사라짐
            vA = (1.0 - smoothstep(0.0, 1.0, life)) * smoothstep(0.0, 0.06, life) * step(life, 0.999);
            gl_PointSize = (55.0 + 40.0 * (1.0 - life)) / max(0.3, -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uLevel;
          varying float vA;
          void main() {
            float r = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, r) * vA * uLevel * 1.3;
            gl_FragColor = vec4(vec3(0.4, 1.0, 0.95) * a, 1.0);
          }
        `,
      }),
    [],
  )
  const ref = useRef<Points>(null!)
  const stir = useRef(0)
  const last = useRef(new Vector3())
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const u = material.uniforms
    u.uTime.value = clock.elapsedTime
    u.uLevel.value = env.plankton
    // 헤엄 속도만큼 휘저음 (부드럽게 오르내림)
    const speed = dt > 0 ? player.pos.distanceTo(last.current) / dt : 0
    last.current.copy(player.pos)
    const underwater = player.pos.y < -0.6
    const want = underwater ? Math.min(1, speed / 1.6) : 0
    stir.current += (want - stir.current) * Math.min(1, dt * (want > stir.current ? 6 : 1.2))
    u.uStir.value = stir.current
    u.uPlayer.value.copy(player.pos)
    const show = env.plankton > 0.02 && useGame.getState().cameraUnderwater
    ref.current.visible = show

    // 헤엄친 자리에 흩어지는 빛 (지나간 물길)
    const wp = wakeGeo.attributes.position as BufferAttribute
    const wl = wakeGeo.attributes.life as BufferAttribute
    if (show && underwater) spawnAcc.current += dt * 55 * stir.current
    while (spawnAcc.current >= 1) {
      spawnAcc.current -= 1
      const w = wake[next.current]
      next.current = (next.current + 1) % wake.length
      const a = Math.random() * Math.PI * 2
      const b = Math.random() * 2 - 1
      const r = Math.sqrt(1 - b * b)
      w.vx = Math.cos(a) * r * (0.35 + Math.random() * 0.6)
      w.vy = b * 0.5
      w.vz = Math.sin(a) * r * (0.35 + Math.random() * 0.6)
      w.x = player.pos.x + w.vx * 0.5
      w.y = player.pos.y + 0.2 + w.vy * 0.6
      w.z = player.pos.z + w.vz * 0.5
      w.life = 0
    }
    wake.forEach((w, i) => {
      if (w.life < WAKE_LIFE) {
        w.life += dt
        const slow = Math.exp(-dt * 1.6)
        w.vx *= slow
        w.vy *= slow
        w.vz *= slow
        w.x += w.vx * dt
        w.y += w.vy * dt
        w.z += w.vz * dt
      }
      wp.setXYZ(i, w.x, w.y, w.z)
      wl.setX(i, w.life / WAKE_LIFE)
    })
    wp.needsUpdate = true
    wl.needsUpdate = true
    wakeMat.uniforms.uLevel.value = env.plankton
    wakeRef.current.visible = show
  })

  return (
    <>
      <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />
      <points ref={wakeRef} geometry={wakeGeo} material={wakeMat} frustumCulled={false} />
    </>
  )
}

const WAKE_LIFE = 2.2

/** 해녀에게서 올라오는 기포 */
function Bubbles() {
  const POOL = 40
  const items = useMemo(
    () => Array.from({ length: POOL }, () => ({ pos: new Vector3(), life: -1, size: 0.05, wobble: 0 })),
    [],
  )
  const refs = useRef<(Mesh | null)[]>([])
  const geo = useMemo(() => new SphereGeometry(1, 10, 8), [])
  const mat = useMemo(
    () => new MeshBasicMaterial({ color: '#dff9ff', transparent: true, opacity: 0.55, depthWrite: false }),
    [],
  )
  const cursor = useRef(0)

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    while (fx.bubbles.length) {
      const src = fx.bubbles.shift()!
      // 한 번에 작은 기포 몇 개
      for (let k = 0; k < 3; k++) {
        const b = items[cursor.current++ % POOL]
        b.pos.copy(src).add(new Vector3((Math.random() - 0.5) * 0.15, k * 0.08, (Math.random() - 0.5) * 0.15))
        b.life = 0
        b.size = 0.015 + Math.random() * 0.025
        b.wobble = Math.random() * 10
      }
    }
    items.forEach((b, i) => {
      const m = refs.current[i]
      if (!m) return
      if (b.life < 0) {
        m.visible = false
        return
      }
      b.life += dt
      b.pos.y += dt * (0.9 + b.size * 8)
      b.pos.x += Math.sin(t * 6 + b.wobble) * dt * 0.15
      if (b.pos.y > waveHeight(b.pos.x, b.pos.z, t) - 0.05 || b.life > 8) b.life = -1
      m.visible = b.life >= 0
      m.position.copy(b.pos)
      m.scale.setScalar(b.size * (1 + Math.min(1, b.life) * 0.4))
    })
  })

  return (
    <>
      {items.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          geometry={geo}
          material={mat}
          visible={false}
        />
      ))}
    </>
  )
}

/** 입수·떠오를 때 수면에 퍼지는 물결 고리 */
function Splashes() {
  const POOL = 6
  const items = useMemo(() => Array.from({ length: POOL }, () => ({ pos: new Vector3(), life: -1 })), [])
  const refs = useRef<(Mesh | null)[]>([])
  const geo = useMemo(() => new TorusGeometry(1, 0.04, 6, 40).rotateX(Math.PI / 2), [])
  const mats = useMemo(
    () => items.map(() => new MeshBasicMaterial({ color: '#f4fdff', transparent: true, depthWrite: false })),
    [items],
  )
  const cursor = useRef(0)
  // 물방울 입자
  const DROPS = 48
  const drops = useMemo(() => Array.from({ length: DROPS }, () => ({ pos: new Vector3(), vel: new Vector3(), life: -1 })), [])
  const dropRefs = useRef<(Mesh | null)[]>([])
  const dropGeo = useMemo(() => new SphereGeometry(0.035, 8, 6), [])
  const dropMat = useMemo(() => new MeshBasicMaterial({ color: '#f2fcff', transparent: true, opacity: 0.85 }), [])
  const dropCursor = useRef(0)

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    while (fx.splashes.length) {
      const it = items[cursor.current++ % POOL]
      const { pos, power } = fx.splashes.shift()!
      it.pos.copy(pos)
      it.life = 0
      const n = Math.round(12 * power)
      for (let k = 0; k < n; k++) {
        const d = drops[dropCursor.current++ % DROPS]
        const a = Math.random() * Math.PI * 2
        const sp = (0.5 + Math.random() * 1.1) * Math.sqrt(power)
        d.pos.set(it.pos.x, waveHeight(it.pos.x, it.pos.z, clock.elapsedTime) + 0.05, it.pos.z)
        d.vel.set(Math.cos(a) * sp, (1.8 + Math.random() * 1.8) * Math.sqrt(power), Math.sin(a) * sp)
        d.life = 0
      }
    }
    drops.forEach((d, i) => {
      const m = dropRefs.current[i]
      if (!m) return
      if (d.life >= 0) {
        d.life += dt
        d.vel.y -= 9.8 * dt
        d.pos.addScaledVector(d.vel, dt)
        if (d.pos.y < waveHeight(d.pos.x, d.pos.z, clock.elapsedTime) - 0.05) d.life = -1
      }
      m.visible = d.life >= 0
      if (m.visible) {
        m.position.copy(d.pos)
        m.scale.setScalar(1 - Math.min(1, d.life) * 0.5)
      }
    })
    items.forEach((it, i) => {
      const m = refs.current[i]
      if (!m) return
      if (it.life < 0) {
        m.visible = false
        return
      }
      it.life += dt
      const k = it.life / 1.6
      if (k >= 1) it.life = -1
      m.visible = k < 1
      m.position.set(it.pos.x, waveHeight(it.pos.x, it.pos.z, clock.elapsedTime) + 0.03, it.pos.z)
      m.scale.setScalar(0.3 + k * 1.6)
      mats[i].opacity = (1 - k) * 0.7
    })
  })

  return (
    <>
      {items.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          geometry={geo}
          material={mats[i]}
          visible={false}
        />
      ))}
      {drops.map((_, i) => (
        <mesh
          key={`d${i}`}
          ref={(m) => {
            dropRefs.current[i] = m
          }}
          geometry={dropGeo}
          material={dropMat}
          visible={false}
        />
      ))}
    </>
  )
}

export function Underwater() {
  return (
    <>
      <LightRays />
      <MarineSnow />
      <Plankton />
      <Bubbles />
      <Splashes />
    </>
  )
}
