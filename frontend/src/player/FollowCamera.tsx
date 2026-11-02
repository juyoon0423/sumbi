import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera, Vector2, Vector3 } from 'three'
import { UNDERWATER_STATES } from '../haenyeo/types'
import { clamp, damp, lerpAngle, smoothstep } from '../lib/math'
import { useGame } from '../store/gameStore'
import { bulteokFrontYaw } from '../world/bulteok/seatWalk'
import { terrainY } from '../world/terrain'
import { waveHeight } from '../world/sea/waves'
import { cameraRig, player, showcaseView, view } from './runtime'

// 3인칭 카메라: 내 해녀 뒤를 부드럽게 따라옴. 마우스로 끌어 둘러보기, 휠로 줌.
// 움직이기 시작하면 천천히 다시 등 뒤로 돌아온다.
// 불턱: 2.5초 동안 손대지 않으면 천천히 내 해녀 앞쪽 비스듬히로 (얼굴에 불빛, 옆 이웃·모닥불이 같이). 걸을 땐 등 뒤에서.

const PITCH_MIN = -0.35
const PITCH_MAX = 1.1
/** 입장 화면에서 해녀를 바라보는 방향: 해녀 뒤로 해안과 한라산이 보임 */
const ENTRY_YAW = 0.3
/** 불턱 정면 시점: 조작이 없으면 이만큼(초) 뒤에 */
const AUTO_FRONT_DELAY = 2.5
/** 정면에서 이만큼 비켜서 (모닥불이 화면 옆에 같이 들어오게) */
const FRONT = { turn: 0.72, pitch: 0.3, distance: 3.6 }
const BEHIND = { pitch: 0.4, distance: 4.4 }

export function FollowCamera() {
  const { camera, gl, size } = useThree()
  const target = useRef(new Vector3().copy(player.pos))
  const desired = useRef(new Vector3())
  /** 화면 중심을 옮기는 양 (꾸미기 패널을 피해 해녀를 빈 곳 가운데에 둠) */
  const viewShift = useRef(new Vector2())
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      cameraRig.yaw -= (e.clientX - d.x) * 0.006
      cameraRig.pitch = clamp(cameraRig.pitch + (e.clientY - d.y) * 0.004, PITCH_MIN, PITCH_MAX)
      d.x = e.clientX
      d.y = e.clientY
      cameraRig.lastDragAt = performance.now()
      cameraRig.lastInputAt = cameraRig.lastDragAt
    }
    const up = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) drag.current = null
    }
    const wheel = (e: WheelEvent) => {
      cameraRig.distance = clamp(cameraRig.distance + e.deltaY * 0.004, 3, 10)
      cameraRig.lastInputAt = performance.now()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
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
    view.camera = camera
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
      return
    }

    // 움직이는 중이고 한동안 끌지 않았으면 등 뒤로 천천히 복귀
    const sinceDrag = (performance.now() - cameraRig.lastDragAt) / 1000
    if (player.zone === 'bulteok') bulteokAuto(dt, sinceDrag)
    else if (player.pose.move > 0.2 && sinceDrag > 1.2) {
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

    if (snap) {
      camera.position.copy(d)
      cameraRig.snap = false
    } else {
      camera.position.lerp(d, damp(7, dt))
    }
    camera.lookAt(target.current)
  }, -1)

  return null
}

/** 불턱 시점 자동: 걸을 땐 등 뒤, 앉아서 한동안 조작이 없으면 앞쪽 비스듬히 */
function bulteokAuto(dt: number, sinceDrag: number) {
  const r = cameraRig
  const ease = (to: { pitch: number; distance: number }, rate: number) => {
    r.pitch += (to.pitch - r.pitch) * damp(rate, dt)
    r.distance += (to.distance - r.distance) * damp(rate, dt)
  }
  if (player.walk) {
    if (sinceDrag < 1.2) return
    r.yaw = lerpAngle(r.yaw, player.yaw + Math.PI, damp(2.4, dt))
    ease(BEHIND, 1.8)
    return
  }
  const idle = (performance.now() - Math.max(r.lastInputAt, player.settledAt)) / 1000
  // 담 밖에 서 있으면 앞쪽이 돌담이라 등 뒤 그대로
  if (idle < AUTO_FRONT_DELAY || player.seat >= 24) return
  // 처음 1초는 아주 천천히 출발해서 스르르
  const k = smoothstep(AUTO_FRONT_DELAY, AUTO_FRONT_DELAY + 1.2, idle)
  r.yaw = lerpAngle(r.yaw, bulteokFrontYaw(player.pos.x, player.pos.z, player.yaw, FRONT.turn), damp(1.1 * k, dt))
  ease(FRONT, 1.1 * k)
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
