import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { player, view } from '../../../player/runtime'
import { useGame } from '../../../store/gameStore'
import { terrainY } from '../../terrain'
import { noteTurtle } from './encounters'
import { underView } from './lifeUtil'
import { turtleBodyGeometry, turtleFlipperGeometry } from './models'
import { lifeMaterial } from './shapes'

// 바다거북: 물속에서 아주 가끔 한 마리가 천천히 지나감 (내 화면에서만, 서버 동기화 없음).
// 바다에 머문 시간으로 4~10분에 한 번쯤, 내가 물속에 있을 때 눈앞을 가로질러 감 (내 깊이를 따라옴, 약 12초 뒤 가장 가까이).
// 가까이 오면 머리 위 "!" + 일지.

const mat = lifeMaterial({ roughness: 0.55 })
let geo: { body: ReturnType<typeof turtleBodyGeometry>; front: ReturnType<typeof turtleFlipperGeometry>; back: ReturnType<typeof turtleFlipperGeometry> } | null = null

const fwd = new Vector3()

/** 개발용: 다음 잠수(지금 물속이면 바로)에 바다거북 */
export const turtleControl = { soon: () => {}, active: () => false, pos: new Vector3() }

const nextGap = () => 240 + Math.random() * 360

export function Turtle() {
  geo ??= { body: turtleBodyGeometry(), front: turtleFlipperGeometry(true), back: turtleFlipperGeometry(false) }
  const root = useRef<Group>(null!)
  const fl = useRef<Group>(null!)
  const fr = useRef<Group>(null!)
  const bl = useRef<Group>(null!)
  const br = useRef<Group>(null!)
  const st = useMemo(
    () => ({ active: false, t: 0, dur: 1, from: new Vector3(), to: new Vector3(), pos: turtleControl.pos, depth: -2, met: false, nextIn: nextGap() }),
    [],
  )
  turtleControl.soon = () => {
    st.nextIn = 0
  }
  turtleControl.active = () => st.active

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const r = root.current
    const playing = useGame.getState().phase === 'playing' && player.zone === 'sea'
    if (!st.active) {
      r.visible = false
      if (playing) st.nextIn -= dt
      // 내가 물속에 있을 때만 나타남
      if (st.nextIn <= 0 && playing && player.pos.y < -1.2) {
        const cam = view.camera
        if (cam) cam.getWorldDirection(fwd)
        else fwd.set(Math.sin(player.yaw), 0, Math.cos(player.yaw))
        fwd.y = 0
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1)
        fwd.normalize()
        // 눈앞 4~5m 를 옆으로 가로지름
        const side = new Vector3(-fwd.z, 0, fwd.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1)
        const mid = player.pos.clone().addScaledVector(fwd, 4 + Math.random())
        mid.y = Math.min(-1.2, Math.max(terrainY(mid.x, mid.z) + 1.3, player.pos.y + 0.4))
        st.from.copy(mid).addScaledVector(side, -10)
        st.to.copy(mid).addScaledVector(side, 14)
        st.dur = 24 / 0.8
        st.depth = mid.y
        st.t = 0
        st.met = false
        st.active = true
        st.nextIn = nextGap()
      }
      return
    }
    st.t += dt
    const k = st.t / st.dur
    if (k >= 1) {
      st.active = false
      r.visible = false
      return
    }
    const t = clock.elapsedTime
    st.pos.lerpVectors(st.from, st.to, k)
    // 깊이는 해녀를 천천히 따라감 (잠수 중에 나타나도 같은 높이에서 만나게)
    const want = Math.min(-1.2, player.pos.y + 0.3)
    st.depth += Math.max(-dt * 0.9, Math.min(dt * 0.9, want - st.depth))
    st.pos.y = Math.max(st.depth + Math.sin(t * 0.5) * 0.25, terrainY(st.pos.x, st.pos.z) + 0.7)
    r.visible = underView()
    r.position.copy(st.pos)
    r.rotation.set(Math.sin(t * 0.5 + 1) * 0.06, Math.atan2(st.to.x - st.from.x, st.to.z - st.from.z), Math.sin(t * 0.8) * 0.05, 'YXZ')
    // 앞지느러미로 천천히 날갯짓, 뒷지느러미는 방향만
    const flap = Math.sin(t * 1.5)
    fl.current.rotation.set(0, -0.3 + flap * 0.25, flap * 0.55)
    fr.current.rotation.set(0, 0.3 - flap * 0.25, -flap * 0.55)
    bl.current.rotation.set(0, -0.6, Math.sin(t * 1.5 + 1) * 0.2)
    br.current.rotation.set(0, 0.6, -Math.sin(t * 1.5 + 1) * 0.2)
    // 가까이 만나면 한 번만
    if (!st.met && underView() && st.pos.distanceTo(player.pos) < 7) {
      st.met = true
      noteTurtle()
    }
  })

  return (
    <group ref={root} visible={false}>
      <mesh geometry={geo.body} material={mat} castShadow />
      <group ref={fl} position={[0.32, -0.02, 0.38]}>
        <mesh geometry={geo.front} material={mat} />
      </group>
      <group ref={fr} position={[-0.32, -0.02, 0.38]} scale={[-1, 1, 1]}>
        <mesh geometry={geo.front} material={mat} />
      </group>
      <group ref={bl} position={[0.25, -0.03, -0.45]}>
        <mesh geometry={geo.back} material={mat} />
      </group>
      <group ref={br} position={[-0.25, -0.03, -0.45]} scale={[-1, 1, 1]}>
        <mesh geometry={geo.back} material={mat} />
      </group>
    </group>
  )
}
