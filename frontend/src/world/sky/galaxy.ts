import { Vector3 } from 'three'

// 은하수 방향: 하늘 셰이더(띠·먼지)와 별 배치(띠 근처에 별을 더 촘촘히)가 같이 씀.
// 둥둥 밤 시점(달이 있는 남쪽 하늘, -z)에서 달 왼쪽 위로 비스듬히 지나가게 둠.

/** 은하면의 법선 */
export const GALAXY_NORMAL = new Vector3(0.9, 0.35, 0.26).normalize()

/** 은하 중심(밝고 볼록한 쪽) 방향: 원하는 방향을 은하면에 투영 */
export const GALAXY_CENTER = (() => {
  const want = new Vector3(-0.6, 0.2, -0.75).normalize()
  return want.sub(GALAXY_NORMAL.clone().multiplyScalar(want.dot(GALAXY_NORMAL))).normalize()
})()
