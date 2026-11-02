// 물질 일지 사진: 내 해녀를 앞에서 찍은 장면. 메인 캔버스에 한 번 그리고 같은 순간 2D 캔버스로 옮겨 담는다
// (preserveDrawingBuffer 없이도 같은 작업 안에서 읽으면 그대로 남아 있음). 찍는 함수는 JournalCamera 가 등록.

type Shooter = (out: HTMLCanvasElement) => void
let shooter: Shooter | null = null

export function setShooter(fn: Shooter | null) {
  shooter = fn
}

/** 지금 장면 사진 (Canvas 가 없으면 null) */
export function shootScene(width: number, height: number): HTMLCanvasElement | null {
  if (!shooter) return null
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  shooter(c)
  return c
}
