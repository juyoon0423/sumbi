// 터치 화면인지 (휴대폰·태블릿). 조이스틱·세로 버튼·안내 문구를 고를 때 씀.
// 개발용: ?touch=1 / ?touch=0 으로 강제

function detect(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('touch')
    if (q === '1') return true
    if (q === '0') return false
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

export const touchUI = detect()

/**
 * 이 요소 위에서 손가락을 끌 때 브라우저가 페이지를 스크롤·확대하지 않게 함 (iOS).
 * iOS WebKit 은 끌기를 스크롤로 가져가면 pointercancel 을 보내 끌기(둘러보기·조이스틱)가 끊김.
 * touchstart 는 막지 않음 (막으면 탭 → click 이 사라져 불턱 자리 누르기가 안 됨).
 * 해제 함수를 돌려준다
 */
export function blockNativeTouch(el: HTMLElement) {
  const stop = (e: Event) => {
    if (e.cancelable) e.preventDefault()
  }
  el.addEventListener('touchmove', stop, { passive: false })
  // iOS 두 손가락 확대 제스처
  el.addEventListener('gesturestart', stop)
  return () => {
    el.removeEventListener('touchmove', stop)
    el.removeEventListener('gesturestart', stop)
  }
}
