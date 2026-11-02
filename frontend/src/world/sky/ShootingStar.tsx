import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3, type Points } from 'three'
import { view } from '../../player/runtime'
import { useFloat } from '../../store/floatStore'
import { useSession } from '../../store/sessionStore'
import { env } from '../time/env'

// 둥둥 중 밤하늘: 아주 가끔 별똥별이 긴 꼬리를 끌며 떨어짐.
// 화면 안에서 떨어졌으면 "별똥별이 떨어졌어요" 를 잠깐 띄우고 물질 일지에 남김.

const TRAIL = 26
const R = 3000

const tmp = new Vector3()
const ndc = new Vector3()

/** 개발용: 바로 떨어뜨리기 */
export const shootingStarControl = { fire: () => {} }

export function ShootingStar() {
  const ref = useRef<Points>(null!)
  const state = useMemo(
    () => ({ active: false, t: 0, dur: 1, from: new Vector3(), to: new Vector3(), seen: false, next: 30 }),
    [],
  )
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL * 3), 3))
    const a = new Float32Array(TRAIL)
    for (let i = 0; i < TRAIL; i++) a[i] = Math.pow(1 - i / TRAIL, 1.6)
    g.setAttribute('aFade', new BufferAttribute(a, 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
        uniforms: { uAlpha: { value: 0 }, uPx: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aFade;
          uniform float uPx;
          varying float vF;
          void main() {
            vF = aFade;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = (1.2 + 3.0 * aFade) * uPx;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAlpha;
          varying float vF;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
            gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a * vF * uAlpha * 1.3, 1.0);
          }
        `,
      }),
    [],
  )

  const fire = () => {
    const cam = view.camera
    if (!cam) return
    // 지금 보는 하늘 언저리에서 시작해 비스듬히 아래로
    cam.getWorldDirection(tmp)
    const yaw = Math.atan2(tmp.x, tmp.z) + (Math.random() - 0.5) * 0.7
    const elev = Math.max(0.35, Math.min(1.1, Math.asin(Math.max(-1, Math.min(1, tmp.y))) + 0.15 + (Math.random() - 0.5) * 0.3))
    const dirAt = (y: number, e: number, out: Vector3) => out.set(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e))
    const side = Math.random() < 0.5 ? -1 : 1
    dirAt(yaw - side * 0.18, elev + 0.12, state.from)
    dirAt(yaw + side * 0.22, elev - 0.2, state.to)
    state.active = true
    state.t = 0
    state.dur = 0.9 + Math.random() * 0.5
    state.seen = false
  }
  shootingStarControl.fire = fire

  useFrame(({ camera, gl }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const floating = useFloat.getState().active
    if (floating && env.night > 0.6) {
      state.next -= dt
      if (state.next <= 0 && !state.active) {
        fire()
        state.next = 45 + Math.random() * 70
      }
    } else state.next = Math.max(state.next, 20 + Math.random() * 25)

    const pts = ref.current
    if (!state.active) {
      pts.visible = false
      return
    }
    state.t += dt
    const k = state.t / state.dur
    if (k > 1.25) {
      state.active = false
      pts.visible = false
      return
    }
    pts.visible = true
    pts.position.copy(camera.position)
    const pos = geometry.getAttribute('position') as BufferAttribute
    const head = Math.min(1, k)
    for (let i = 0; i < TRAIL; i++) {
      const u = Math.max(0, head - (i / TRAIL) * 0.32)
      tmp.lerpVectors(state.from, state.to, u).normalize().multiplyScalar(R)
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z)
    }
    pos.needsUpdate = true
    // 켜졌다가 끝에서 스르르
    material.uniforms.uAlpha.value = Math.min(1, k * 6) * (k > 1 ? Math.max(0, 1 - (k - 1) / 0.25) : 1)
    material.uniforms.uPx.value = gl.getPixelRatio()

    // 화면 안에서 떨어졌으면 알려 줌 (둥둥 중에만)
    if (!state.seen && k > 0.4 && floating) {
      tmp.lerpVectors(state.from, state.to, 0.5).normalize().multiplyScalar(R).add(camera.position)
      ndc.copy(tmp).project(camera)
      if (Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95 && ndc.z < 1) {
        state.seen = true
        useFloat.getState().showNote('별똥별이 떨어졌어요')
        useSession.setState({ shootingStar: true })
      }
    }
  })

  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={-8} />
}
