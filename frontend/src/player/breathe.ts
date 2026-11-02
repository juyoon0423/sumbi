import { CONFIG } from '../config'
import { setState, type HaenyeoPose } from '../haenyeo/types'
import { net } from '../net'
import { useBreathe } from '../store/breatheStore'
import { useBubbles } from '../store/bubbleStore'
import { player } from './runtime'

// 숨 고르기: 수면에서 테왁을 안고 4초 들이쉬고 6초 내쉬기. 움직이거나 잠수하면 멈춤.

const CYCLE = CONFIG.breatheIn + CONFIG.breatheOut

export function canBreathe() {
  const s = player.pose.state
  return player.zone === 'sea' && (s === 'surfaceIdle' || s === 'surfaceSwim')
}

export function startBreathe() {
  if (useBreathe.getState().active || !canBreathe()) return
  player.pose.breatheTime = 0
  setState(player.pose, 'surfaceIdle')
  useBreathe.getState().setActive(true)
  net.send({ t: 'act', a: 'breathe' })
}

export function stopBreathe() {
  if (!useBreathe.getState().active) return
  player.pose.breatheTime = -1
  useBreathe.getState().setActive(false)
  net.send({ t: 'act', a: 'breathe_end' })
}

export function toggleBreathe() {
  if (useBreathe.getState().active) stopBreathe()
  else startBreathe()
}

/** 매 프레임 (LocalPlayer): 움직이거나 잠수하면 멈추고, 숨 하나를 마칠 때마다 셈 */
export function tickBreathe(pose: HaenyeoPose, prevTime: number, moveAmt: number, diveHeld: boolean) {
  if (!useBreathe.getState().active) return
  if (moveAmt > 0.2 || diveHeld || pose.state !== 'surfaceIdle' || pose.breatheTime < 0) {
    stopBreathe()
    return
  }
  if (Math.floor(pose.breatheTime / CYCLE) > Math.floor(prevTime / CYCLE)) {
    const grown = useBreathe.getState().completeCycle()
    if (grown) useBubbles.getState().sayself(`숨이 조금 길어졌어요 · 오늘 +${grown}초`, 3500)
  }
}
