import { audio } from '../audio/AudioEngine'
import { setState } from '../haenyeo/types'
import { net } from '../net'
import { useBulteok } from '../store/bulteokStore'
import { useFloat } from '../store/floatStore'
import { useGame } from '../store/gameStore'
import { env } from '../world/time/env'
import { cameraRig, fx, player } from './runtime'

// 둥둥: 바다 수면에서 테왁을 배 위에 안고 누워 하늘 보기. 아무것도 하지 않아도 되는 모드.
// 이동 키를 누르거나 버튼을 다시 누르면 몸을 뒤집어 일어남. 누워 있는 동안 잠수는 안 됨.

export { FLOAT_UP } from '../haenyeo/types'

/** 둥둥 카메라: 하늘 둘러보기 (끌기·휠) */
export const floatCam = {
  /** 누운 방향 기준 좌우로 둘러본 각도 */
  yaw: 0,
  /** 위아래로 둘러본 각도 (+ 더 높이) */
  pitch: 0,
  fov: 58,
  /** 마지막으로 둘러본 시각 (performance.now) — 멈추면 천천히 기본 구도로 */
  lastInput: -Infinity,
  /** 일어난 시각 — 이때부터 잠깐 카메라를 천천히 등 뒤로 */
  endedAt: -Infinity,
}

export function canFloat() {
  const s = player.pose.state
  return (
    player.zone === 'sea' &&
    !useGame.getState().diving &&
    !useBulteok.getState().traveling &&
    (s === 'surfaceIdle' || s === 'surfaceSwim' || s === 'sumbi')
  )
}

/**
 * 누울 방향 (yaw = 발끝 쪽). 카메라는 발 쪽에서 머리 너머 하늘을 보므로 머리를
 * 밤엔 달 쪽, 새벽·노을엔 해 쪽(물든 하늘)으로, 낮엔 해를 등지게(눈부시지 않게) 둠.
 */
function lieYaw() {
  const toward = (x: number, z: number) => Math.atan2(-x, -z)
  if (env.night > 0.55) return toward(env.moonDir.x, env.moonDir.z)
  const s = env.sunDir
  if (s.y < 0.3) return toward(s.x, s.z)
  return toward(-s.x, -s.z)
}

export const floatState = {
  /** 누워서 천천히 돌아갈 방향 */
  yaw: 0,
}

export function startFloat() {
  if (useFloat.getState().active || !canFloat()) return
  const pose = player.pose
  pose.waveTime = -1
  setState(pose, 'float')
  floatState.yaw = lieYaw()
  floatCam.yaw = 0
  floatCam.pitch = 0
  floatCam.fov = 58
  floatCam.lastInput = -Infinity
  useFloat.getState().setActive(true)
  audio.setFloating(true, env.night)
  net.send({ t: 'act', a: 'float' })
}

export function stopFloat() {
  if (!useFloat.getState().active) return
  setState(player.pose, 'floatUp')
  fx.splashes.push({ pos: player.pos.clone(), power: 0.5 })
  useFloat.getState().setActive(false)
  audio.setFloating(false, env.night)
  net.send({ t: 'act', a: 'float_end' })
  // 카메라는 등 뒤로 (천천히 옮겨 감)
  cameraRig.yaw = player.yaw + Math.PI
  cameraRig.pitch = 0.42
  cameraRig.distance = 5.2
  floatCam.endedAt = performance.now()
}

export function toggleFloat() {
  if (useFloat.getState().active) stopFloat()
  else startFloat()
}
