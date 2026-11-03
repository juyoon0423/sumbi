import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera, Vector2, Vector3 } from 'three'
import { UNDERWATER_STATES } from '../haenyeo/types'
import { clamp, damp, lerpAngle } from '../lib/math'
import { useGame } from '../store/gameStore'
import { terrainY } from '../world/terrain'
import { waveHeight } from '../world/sea/waves'
import { useFloat } from '../store/floatStore'
import { blockNativeTouch } from '../lib/device'
import { floatCam } from './float'
import { cameraRig, player, showcaseView, view } from './runtime'

// 3인칭 카메라: 내 해녀 뒤를 부드럽게 따라옴. 마우스로 끌어 둘러보기, 휠로 줌.
// 움직이기 시작하면 천천히 다시 등 뒤로 돌아온다.
// 둥둥(누워 하늘 보기): 수면 가까이 낮게 내려가 하늘을 올려다봄 — 아래쪽에 얼굴과 테왁, 나머지는 하늘.

const floatLook = new Vector3()

const PITCH_MIN = -0.35
const PITCH_MAX = 1.1
/** 입장 화면에서 해녀를 바라보는 방향: 해녀 뒤로 해안과 한라산이 보임 */
const ENTRY_YAW = 0.3
const BASE_FOV = 50

/**
 * 둥둥 구도 (누운 해녀 기준): 발 쪽 비스듬히 옆에서 수면 가까이, 머리 너머 하늘을 올려다봄.
 * back: 몸 중심에서 발 쪽으로, side: 옆으로, up: 수면 위, elev: 머리보다 더 올려다보는 각도, turn: 옆으로 비켜 보는 각도
 * 조금 멀리·옆에서 보면 테왁이 얼굴을 가리지 않고, 해녀는 아래쪽에 머리와 테왁 윗부분만, 나머지는 하늘
 */
export const FLOAT_VIEW = { back: 3.0, side: 1.2, up: 0.7, elev: 0.5, turn: 0.03 }

export function FollowCamera() {
  const { camera, gl, size } = useThree()
  const target = useRef(new Vector3().copy(player.pos))
  const desired = useRef(new Vector3())
  /** 화면 중심을 옮기는 양 (꾸미기 패널을 피해 해녀를 빈 곳 가운데에 둠) */
  const viewShift = useRef(new Vector2())
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  /** 실제로 바라보는 점 (둥둥 ↔ 평소 구도를 부드럽게 오감) */
  const look = useRef(new Vector3().copy(player.pos))

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const unblock = blockNativeTouch(el)
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      if (useFloat.getState().active) {
        // 둥둥: 하늘 둘러보기
        floatCam.yaw -= (e.clientX - d.x) * 0.004
        floatCam.pitch = clamp(floatCam.pitch + (e.clientY - d.y) * 0.003, -0.35, 0.95)
        floatCam.lastInput = performance.now()
        d.x = e.clientX
        d.y = e.clientY
        return
      }
      cameraRig.yaw -= (e.clientX - d.x) * 0.006
      cameraRig.pitch = clamp(cameraRig.pitch + (e.clientY - d.y) * 0.004, PITCH_MIN, PITCH_MAX)
      d.x = e.clientX
      d.y = e.clientY
      cameraRig.lastDragAt = performance.now()
    }
    const up = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) drag.current = null
    }
    const wheel = (e: WheelEvent) => {
      if (useFloat.getState().active) {
        floatCam.fov = clamp(floatCam.fov + e.deltaY * 0.03, 36, 78)
        floatCam.lastInput = performance.now()
        return
      }
      cameraRig.distance = clamp(cameraRig.distance + e.deltaY * 0.004, 3, 10)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
      unblock()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const p = player.pos
    view.camera = camera // 개발용 좌표 변환 (__sumbi.toScreen)
    // 구역 이동(불턱 ↔ 바다): 보간 없이 바로 옮김 (화면이 가려진 동안)
    const snap = cameraRig.snap
    if (snap) target.current.set(p.x, p.y + 0.55, p.z)
    // 입수(entering) 동안은 카메라를 물 위에 두어 웅크림·물보라가 보이게 함
    const state = player.pose.state
    const under = UNDERWATER_STATES.has(state) && state !== 'entering'

    target.current.x += (p.x - target.current.x) * damp(8, dt)
    target.current.z += (p.z - target.current.z) * damp(8, dt)
    // 머리를 아래로 하고 내려갈 땐 몸 중심이 낮아지고 계속 내려가므로 조금 아래를, 더 빠르게 따라감
    const headDown = state === 'descending'
    // 불턱에 앉으면 머리 높이쯤을 봄
    const lift = player.zone === 'bulteok' ? 0.35 : headDown ? -0.15 : 0.55
    target.current.y += (p.y + lift - target.current.y) * damp(headDown ? 9 : under ? 5 : 3, dt)

    const game = useGame.getState()
    const showcase = game.phase === 'entry' || game.customizing
    applyViewShift(camera as PerspectiveCamera, size.width, size.height, viewShift.current, showcase, dt)

    if (showcase) {
      // 꾸미기: 해녀 앞에서 크게. 패널이 가리지 않은 영역에 몸 전체가 들어오도록 거리 조절
      if (game.phase === 'entry') cameraRig.yaw = ENTRY_YAW
      const cam = camera as PerspectiveCamera
      const tanHalf = Math.tan((cam.fov * Math.PI) / 360)
      const fh = Math.max(0.2, (showcaseView.h || size.height) / size.height)
      const fw = Math.max(0.2, (showcaseView.w || size.width) / size.width)
      const dist = clamp(Math.max(1.3 / (0.58 * fh * 2 * tanHalf), 1.0 / (0.6 * fw * 2 * tanHalf * cam.aspect), 2.3), 2.3, 9)
      const pitch = 0.14
      const focusY = p.y + 0.38
      desired.current.set(
        p.x + Math.sin(cameraRig.yaw) * Math.cos(pitch) * dist,
        Math.max(focusY + Math.sin(pitch) * dist, waveHeight(p.x, p.z, t) + 0.35),
        p.z + Math.cos(cameraRig.yaw) * Math.cos(pitch) * dist,
      )
      camera.position.lerp(desired.current, damp(4, dt))
      target.current.set(p.x, focusY, p.z)
      camera.lookAt(target.current)
      look.current.copy(target.current)
      return
    }

    // 둥둥: 하늘을 올려다보는 구도 (시야도 조금 넓게)
    const cam = camera as PerspectiveCamera
    const floating = state === 'float'
    const wantFov = floating ? floatCam.fov : BASE_FOV
    if (Math.abs(cam.fov - wantFov) > 0.01) {
      cam.fov += (wantFov - cam.fov) * damp(floating ? 1.2 : 2, dt)
      cam.updateProjectionMatrix()
    }
    const now = performance.now()
    if (floating) {
      // 둘러보다 멈추면 천천히 기본 구도로
      if (now - floatCam.lastInput > 2500) {
        const k = damp(0.5, dt)
        floatCam.yaw += (0 - floatCam.yaw) * k
        floatCam.pitch += (0 - floatCam.pitch) * k
        floatCam.fov += (58 - floatCam.fov) * k
      }
      const V = FLOAT_VIEW
      // 세로 화면(휴대폰)은 좌우가 좁아서 옆으로 덜 비켜 서고, 머리 쪽(밤엔 달 쪽)으로 시선을 더 돌림 → 달이 화면 안에
      const portrait = clamp((1 - cam.aspect) / 0.5, 0, 1)
      const side = V.side * (1 - 0.55 * portrait)
      const fx = Math.sin(player.yaw)
      const fz = Math.cos(player.yaw)
      // 해녀 오른쪽 = (cos, -sin)
      const rx = Math.cos(player.yaw)
      const rz = -Math.sin(player.yaw)
      const d = desired.current.set(p.x + fx * V.back + rx * side, 0, p.z + fz * V.back + rz * side)
      d.y = waveHeight(d.x, d.z, t) + V.up
      // 머리·테왁 쪽을 기준으로 시선을 잡고 그보다 elev 만큼 올려다봄 → 해녀는 늘 화면 아래, 나머지는 하늘
      const hx = p.x - fx * 0.2 - d.x
      const hz = p.z - fz * 0.2 - d.z
      const hy = waveHeight(p.x, p.z, t) + 0.12 - d.y
      const azHead = Math.atan2(hx, hz)
      // 발 → 머리 방향 (누울 때 머리를 달·해 쪽으로 둠)
      const azAxis = Math.atan2(-fx, -fz)
      const az = lerpAngle(azHead, azAxis, 0.5 * portrait) + V.turn + floatCam.yaw
      const el = Math.atan2(hy, Math.hypot(hx, hz)) + V.elev + floatCam.pitch
      floatLook.set(d.x + Math.sin(az) * Math.cos(el) * 10, d.y + Math.sin(el) * 10, d.z + Math.cos(az) * Math.cos(el) * 10)
      // 처음엔 천천히 내려감
      const k = damp(snap ? 100 : 1.3, dt)
      camera.position.lerp(d, k)
      look.current.lerp(floatLook, k)
      camera.lookAt(look.current)
      cameraRig.snap = false
      return
    }

    // 움직이는 중이고 한동안 끌지 않았으면 등 뒤로 천천히 복귀
    const sinceDrag = (performance.now() - cameraRig.lastDragAt) / 1000
    if (player.pose.move > 0.2 && sinceDrag > 1.2) {
      cameraRig.yaw = lerpAngle(cameraRig.yaw, player.yaw + Math.PI, damp(0.9 * player.pose.move, dt))
    }

    const dist = cameraRig.distance * (under ? 0.82 : 1)
    const pitch = under ? Math.min(cameraRig.pitch, 0.6) : cameraRig.pitch
    const cp = Math.cos(pitch)
    const d = desired.current.set(
      target.current.x + Math.sin(cameraRig.yaw) * cp * dist,
      target.current.y + Math.sin(pitch) * dist,
      target.current.z + Math.cos(cameraRig.yaw) * cp * dist,
    )

    // 카메라가 수면 경계에 걸치지 않도록: 해녀가 물속이면 카메라도 물속, 수면이면 물 위
    const surf = waveHeight(d.x, d.z, t)
    if (under) d.y = Math.min(d.y, surf - 0.25)
    else d.y = Math.max(d.y, surf + 0.35)
    d.y = Math.max(d.y, terrainY(d.x, d.z) + 0.35)

    // 둥둥에서 일어난 직후엔 천천히 등 뒤로
    const easing = (now - floatCam.endedAt) / 1000 < 2.2
    if (snap) {
      camera.position.copy(d)
      look.current.copy(target.current)
      cameraRig.snap = false
    } else {
      camera.position.lerp(d, damp(easing ? 2.2 : 7, dt))
      look.current.lerp(target.current, damp(easing ? 2.6 : 40, dt))
    }
    camera.lookAt(look.current)
  }, -1)

  return null
}

/** 꾸미기 패널을 피해 화면 중심을 옆(데스크톱)·위(모바일 세로)로 옮김. 평소엔 부드럽게 0으로 */
function applyViewShift(cam: PerspectiveCamera, w: number, h: number, shift: Vector2, on: boolean, dt: number) {
  const v = showcaseView
  const tx = on && v.w > 0 ? w / 2 - (v.x + v.w / 2) : 0
  const ty = on && v.h > 0 ? h / 2 - (v.y + v.h / 2) : 0
  const k = damp(5, dt)
  shift.x += (tx - shift.x) * k
  shift.y += (ty - shift.y) * k
  if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5 && !on) {
    if (cam.view?.enabled) cam.clearViewOffset()
    return
  }
  cam.setViewOffset(w, h, shift.x, shift.y, w, h)
}
