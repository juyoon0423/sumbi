import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { UNDERWATER_STATES } from '../haenyeo/types'
import { clamp, damp, lerpAngle } from '../lib/math'
import { useGame } from '../store/gameStore'
import { terrainY } from '../world/terrain'
import { waveHeight } from '../world/sea/waves'
import { cameraRig, player } from './runtime'

// 3인칭 카메라: 내 해녀 뒤를 부드럽게 따라옴. 마우스로 끌어 둘러보기, 휠로 줌.
// 움직이기 시작하면 천천히 다시 등 뒤로 돌아온다.

const PITCH_MIN = -0.35
const PITCH_MAX = 1.1

export function FollowCamera() {
  const { camera, gl } = useThree()
  const target = useRef(new Vector3().copy(player.pos))
  const desired = useRef(new Vector3())
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
    }
    const up = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) drag.current = null
    }
    const wheel = (e: WheelEvent) => {
      cameraRig.distance = clamp(cameraRig.distance + e.deltaY * 0.004, 3, 10)
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
    // 입수(entering) 동안은 카메라를 물 위에 두어 웅크림·물보라가 보이게 함
    const state = player.pose.state
    const under = UNDERWATER_STATES.has(state) && state !== 'entering'

    target.current.x += (p.x - target.current.x) * damp(8, dt)
    target.current.z += (p.z - target.current.z) * damp(8, dt)
    // 머리를 아래로 하고 내려갈 땐 몸 중심이 낮아지고 계속 내려가므로 조금 아래를, 더 빠르게 따라감
    const headDown = state === 'descending'
    target.current.y += (p.y + (headDown ? -0.15 : 0.55) - target.current.y) * damp(headDown ? 9 : under ? 5 : 3, dt)

    if (useGame.getState().phase === 'entry') {
      // 입장 전: 내 해녀 주변을 천천히 도는 풍경
      const a = t * 0.05 + 2.4
      desired.current.set(p.x + Math.sin(a) * 11, 3.2, p.z + Math.cos(a) * 11)
      camera.position.lerp(desired.current, damp(1.5, dt))
      camera.lookAt(p.x, 0.8, p.z)
      // 입장하면 카메라가 등 뒤로 내려오도록 미리 맞춰 둠
      cameraRig.yaw = player.yaw + Math.PI
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

    camera.position.lerp(d, damp(7, dt))
    camera.lookAt(target.current)
  }, -1)

  return null
}
