import { useEffect, useRef, useState } from 'react'
import { blockNativeTouch } from '../lib/device'
import { input } from '../player/input'

// 터치 조이스틱: 화면 왼쪽 아래 영역 어디든 엄지를 대면 그 자리에 조이스틱이 생기고, 끌면 그 방향으로 헤엄.
// 손을 떼면 제자리(왼쪽 아래)로 돌아가 은은하게 기다림. 값은 input.stick (x: 오른쪽, y: 앞) 에 바로 씀.
// 다른 손가락은 따로라서 조이스틱을 쥔 채 잠수 버튼을 누르거나 화면을 끌어 둘러볼 수 있음.

/** 손잡이가 움직이는 반지름 (px) */
const RADIUS = 46
/** 이보다 조금 움직이면 무시 (엄지 떨림) */
const DEAD = 0.12

export function Joystick() {
  const zone = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const el = zone.current
    if (!el) return
    const unblock = blockNativeTouch(el)
    let id: number | null = null
    let cx = 0
    let cy = 0
    const place = (x: number, y: number) => {
      const r = el.getBoundingClientRect()
      if (base.current) {
        base.current.style.left = `${x - r.left}px`
        base.current.style.top = `${y - r.top}px`
      }
    }
    const home = () => {
      if (base.current) {
        base.current.style.left = ''
        base.current.style.top = ''
      }
      if (knob.current) knob.current.style.transform = ''
    }
    const down = (e: PointerEvent) => {
      if (id !== null) return
      id = e.pointerId
      el.setPointerCapture(e.pointerId)
      cx = e.clientX
      cy = e.clientY
      place(cx, cy)
      setActive(true)
      e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      let dx = e.clientX - cx
      let dy = e.clientY - cy
      const len = Math.hypot(dx, dy)
      if (len > RADIUS) {
        dx *= RADIUS / len
        dy *= RADIUS / len
      }
      if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`
      const k = Math.min(1, len / RADIUS)
      // 가운데 근처는 0, 바깥으로 갈수록 부드럽게 1까지
      const amt = k < DEAD ? 0 : (k - DEAD) / (1 - DEAD)
      const n = len > 0 ? amt / Math.min(len, RADIUS) : 0
      input.stick.x = dx * n
      input.stick.y = -dy * n
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      input.stick.x = 0
      input.stick.y = 0
      home()
      setActive(false)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      unblock()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      input.stick.x = 0
      input.stick.y = 0
    }
  }, [])

  return (
    <div ref={zone} className="joy-zone" onContextMenu={(e) => e.preventDefault()}>
      <div ref={base} className={`joy-base ${active ? 'on' : ''}`}>
        <div ref={knob} className="joy-knob" />
      </div>
    </div>
  )
}
