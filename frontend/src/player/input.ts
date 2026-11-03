import { create } from 'zustand'

// 키보드·화면 버튼·터치 조이스틱 입력을 한곳에 모은다.

/**
 * 잠수 버튼을 한 번 톡 누르면 계속 잠수 (다시 누르면 올라감). 휴대폰에서 엄지 하나로 조이스틱만 쥐어도 되게.
 * 누르고 있다가 떼는 방식(Space 와 같음)도 그대로 됨. 숨이 다하거나 수면에 오르면 풀림.
 */
export const useDiveLatch = create<{ on: boolean }>(() => ({ on: false }))
export const setDiveLatch = (on: boolean) => {
  if (useDiveLatch.getState().on !== on) useDiveLatch.setState({ on })
}

/** 지금 눌려 있는 키 (event.code) */
export const keys = new Set<string>()

export const input = {
  /** 화면 잠수 버튼을 누르고 있는지 */
  diveButton: false,
  /** 조이스틱 값 (x: 오른쪽, y: 앞) */
  stick: { x: 0, y: 0 },
  /** 인사 요청 (한 번 읽으면 소비) */
  waveRequested: false,
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

/** 이동 입력 (길이 최대 1) */
export function readMove(): { x: number; y: number } {
  let x = input.stick.x
  let y = input.stick.y
  for (const code of keys) {
    const m = MOVE_KEYS[code]
    if (m) {
      x += m[0]
      y += m[1]
    }
  }
  const len = Math.hypot(x, y)
  if (len > 1) {
    x /= len
    y /= len
  }
  return { x, y }
}

export function isDiveHeld() {
  return keys.has('Space') || input.diveButton || useDiveLatch.getState().on
}

export function consumeWave() {
  const w = input.waveRequested
  input.waveRequested = false
  return w
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** 키보드 이벤트 연결. 해제 함수를 돌려준다 */
export function attachKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    if (e.code in MOVE_KEYS || e.code === 'Space') e.preventDefault()
    if (e.code === 'Digit1' && !e.repeat) input.waveRequested = true
    keys.add(e.code)
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code)
  const clear = () => {
    keys.clear()
    input.diveButton = false
    input.stick.x = 0
    input.stick.y = 0
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', clear)
  }
}
