import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { advanceActs } from '../../haenyeo/acts'
import { Haenyeo } from '../../haenyeo/Haenyeo'
import { lookFromCustom } from '../../haenyeo/look'
import { Tewak } from '../../haenyeo/Tewak'
import { updateTewak } from '../../haenyeo/tewakMotion'
import { drivePose, interpolate, remotes, useRemotes, type RemoteInfo } from '../../net/remotes'
import { onActEvent } from '../../player/actEvents'
import { player } from '../../player/runtime'
import { NameTag } from '../../ui/NameTag'
import { driveSeat } from '../bulteok/seatMotion'
import { audio } from '../../audio/AudioEngine'

function RemoteHaenyeo({ info }: { info: RemoteInfo }) {
  const root = useRef<Group>(null!)
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
    if (rm.zone === 'sea') updateTewak(rm.tewak, rm.pos, rm.yaw, clock.elapsedTime, dt)
    root.current.position.copy(rm.pos)
    root.current.rotation.y = rm.yaw
  })

  if (!rm) return null
  return (
    <>
      <group ref={root} position={rm.pos.toArray()}>
        <Haenyeo pose={rm.pose} look={look} />
        <NameTag nick={info.nick} />
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
