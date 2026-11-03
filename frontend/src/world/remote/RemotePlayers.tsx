import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { advanceActs } from '../../haenyeo/acts'
import { Haenyeo } from '../../haenyeo/Haenyeo'
import { lookFromCustom } from '../../haenyeo/look'
import { Tewak } from '../../haenyeo/Tewak'
import { updateTewak } from '../../haenyeo/tewakMotion'
import { drivePose, interpolate, remotes, useRemotes, type RemoteInfo } from '../../net/remotes'
import { onActEvent } from '../../player/actEvents'
import { player } from '../../player/runtime'
import { NameTag } from '../../ui/NameTag'
import { env } from '../time/env'
import { driveSeat } from '../bulteok/seatMotion'
import { audio } from '../../audio/AudioEngine'
import { CONFIG } from '../../config'
import { waveHeight } from '../sea/waves'

/** 수면에 떠 있는 자세 (보이는 높이를 내 화면 파도에 맞춤) */
const SURFACE_STATES = new Set(['surfaceIdle', 'surfaceSwim', 'sumbi', 'float', 'floatUp'])

function RemoteHaenyeo({ info }: { info: RemoteInfo }) {
  const root = useRef<Group>(null!)
  const mark = useRef<HTMLDivElement>(null)
  /** 0 = 받은 높이 그대로, 1 = 내 화면 파도 높이 (떠오르고 잠길 때 부드럽게 오감) */
  const surfK = useRef(0)
  const shownPos = useMemo(() => new Vector3(), [])
  const rm = remotes.get(info.id)
  const [adj, ...rest] = info.nick.split(' ')
  const noun = rest.join(' ')
  // info 는 닉네임·꾸미기가 바뀔 때만 새 객체
  const look = useMemo(() => lookFromCustom({ ...info.look, adj, noun }), [info.look, adj, noun])

  useFrame(({ clock }, rawDt) => {
    if (!rm) return
    const dt = Math.min(rawDt, 0.05)
    if (rm.zone !== 'bulteok') interpolate(rm, dt)
    drivePose(rm, dt)
    // 수면에 떠 있으면 보이는 높이는 내 화면의 파도에 맞춤 (보낸 사람 화면과 시계가 달라 파도가 어긋나므로).
    // rm.pos 는 그대로 둠 (속도로 잠수·상승을 판단하므로)
    const shown = shownPos.copy(rm.pos)
    if (rm.zone === 'sea') {
      const onSurface = !rm.underwater && SURFACE_STATES.has(rm.pose.state)
      surfK.current += ((onSurface ? 1 : 0) - surfK.current) * Math.min(1, dt * 6)
      if (surfK.current > 0.001) {
        const surf = waveHeight(rm.pos.x, rm.pos.z, clock.elapsedTime) - CONFIG.surfaceSink
        shown.y += (surf - shown.y) * surfK.current
      }
    }
    if (rm.zone === 'bulteok') {
      // 불턱: 자리에 앉아 있거나, 서버가 알려 준 대로 자리를 옮겨 걸음 (위치는 받지 않음)
      rm.vel.set(0, 0, 0)
      if (driveSeat(rm, dt)) audio.playPlop(Math.max(0, 1 - player.pos.distanceTo(rm.pos) / 9) * 0.35)
    }
    // 손질 소리는 가까이(같은 불턱)에서만, 거리만큼 작게
    const events = advanceActs(rm.pose, dt)
    if (events.length) {
      const near = Math.max(0, 1 - player.pos.distanceTo(rm.pos) / 9) * 0.7
      for (const ev of events) onActEvent(ev, near, rm.pose.actItem, rm.pos, rm.yaw, false)
    }
    if (rm.zone === 'sea') updateTewak(rm.tewak, shown, rm.yaw, clock.elapsedTime, dt, rm.pose.state === 'float')
    // 둥둥 중이면 머리 위에 가끔 낮엔 ☁️, 밤엔 ✨ (방해되지 않게 잠깐씩)
    if (mark.current) {
      const floating = rm.pose.state === 'float' && rm.pose.stateTime > 2
      const on = floating && (clock.elapsedTime + info.id * 3.7) % 13 < 3.2
      mark.current.style.opacity = on ? '1' : '0'
      const icon = env.night > 0.5 ? '✨' : '☁️'
      if (mark.current.textContent !== icon) mark.current.textContent = icon
    }
    root.current.position.copy(rm.zone === 'sea' ? shown : rm.pos)
    root.current.rotation.y = rm.yaw
  })

  if (!rm) return null
  return (
    <>
      <group ref={root} position={rm.pos.toArray()}>
        <Haenyeo pose={rm.pose} look={look} />
        <NameTag nick={info.nick} />
        <group position={[0, 1.42, 0]}>
          <Html center zIndexRange={[9, 0]} pointerEvents="none">
            <div ref={mark} className="float-mark" />
          </Html>
        </group>
      </group>
      <Tewak state={rm.tewak} material={look.tewak} />
    </>
  )
}

/** 같은 바다의 다른 해녀들 */
export function RemotePlayers() {
  const list = useRemotes((s) => s.list)
  return (
    <>
      {list.map((info) => (
        <RemoteHaenyeo key={info.id} info={info} />
      ))}
    </>
  )
}
