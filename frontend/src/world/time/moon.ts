// 실제 날짜의 달 모양 (삭망월 29.53일). 0 = 삭(그믐), 0.25 = 상현, 0.5 = 보름, 0.75 = 하현

const SYNODIC_DAYS = 29.530588853
/** 기준 삭: 2000-01-06 18:14 UTC */
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14)

export function moonPhase(now = Date.now()) {
  const age = ((((now - NEW_MOON_REF) / 86_400_000) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS
  return age / SYNODIC_DAYS
}

/** 밝은 부분 비율 (0 ~ 1) */
export function moonIllumination(phase: number) {
  return (1 - Math.cos(phase * Math.PI * 2)) / 2
}

/**
 * 화면에 그릴 달 모양: 실제 날짜를 따르되 삭 근처에서도 가는 초승달·그믐달은 보이게
 * (달이 항상 보여야 둥둥 밤하늘이 비지 않음). 개발용 ?moon=0.5 로 고정
 */
export function displayMoonPhase(now = Date.now()) {
  let p = moonPhase(now)
  try {
    const q = new URLSearchParams(location.search).get('moon')
    if (q !== null && q !== '' && Number.isFinite(Number(q))) p = ((Number(q) % 1) + 1) % 1
  } catch {
    /* 무시 */
  }
  return Math.min(0.93, Math.max(0.07, p))
}
