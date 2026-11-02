/** 한국 시간 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
export function kstDateKey(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
