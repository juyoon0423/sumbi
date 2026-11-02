// 해저 + 해안 + 육지를 하나의 높이 함수로 정의한다.
// 북쪽(-z)이 제주 해안·한라산, 남쪽(+z)이 먼바다.

/** x 위치의 해안선 z 좌표 (구불구불) */
export function shoreZ(x: number) {
  return -36 + 4 * Math.sin(x * 0.07) + 2 * Math.sin(x * 0.19 + 1.3)
}

function bumps(x: number, z: number) {
  return (
    0.6 * Math.sin(x * 0.15) * Math.cos(z * 0.13) +
    0.3 * Math.sin(x * 0.41 + z * 0.29) +
    0.15 * Math.sin(x * 1.1 - z * 0.7)
  )
}

/** 지형 높이 (수면 = 0) */
export function terrainY(x: number, z: number) {
  const d = z - shoreZ(x) // 양수면 바다 쪽
  if (d < -6) {
    // 육지: 완만한 들판 + 내륙으로 갈수록 조금씩 높아짐
    const inland = Math.max(0, -d - 30) * 0.02
    return 1.8 + inland + 0.35 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 0.15 * bumps(x, z)
  }
  const u = d + 6
  const base = 1.8 - 11 * (1 - Math.exp(-u / 18))
  const rough = bumps(x, z) * Math.min(1, u / 10)
  return base + rough
}
