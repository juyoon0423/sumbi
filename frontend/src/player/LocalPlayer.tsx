import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { audio } from '../audio/AudioEngine'
import { CONFIG, ITEM_LABEL, withObjectParticle } from '../config'
import { Haenyeo } from '../haenyeo/Haenyeo'
import { Tewak } from '../haenyeo/Tewak'
import { setState, UNDERWATER_STATES } from '../haenyeo/types'
import { clamp, damp, lerpAngle } from '../lib/math'
import { net } from '../net'
import { useBubbles } from '../store/bubbleStore'
import { useGame } from '../store/gameStore'
import { NameTag } from '../ui/NameTag'
import { terrainY } from '../world/terrain'
import { waveHeight } from '../world/sea/waves'
import { collect, findHarvestable, seafood } from '../world/sea/seafood/seafoodState'
import { attachKeyboard, consumeWave, isDiveHeld, readMove } from './input'
import { cameraRig, fx, player } from './runtime'

const tmp = new Vector3()
const fwd = new Vector3()

/** 수면에서 몸 중심 높이 */
const surfaceY = (x: number, z: number, t: number) => waveHeight(x, z, t) - CONFIG.surfaceSink

/** 이 위치로 수평 이동할 수 있는지 (해안·바위에 막힘) */
function canStand(x: number, z: number, y: number, atSurface: boolean) {
  const [cx, cz] = CONFIG.playCenter
  if (Math.hypot(x - cx, z - cz) > CONFIG.playRadius) return false
  const floor = terrainY(x, z)
  return atSurface ? floor < -1.2 : floor < y - CONFIG.floorClearance + 0.15
}

export function LocalPlayer() {
  const root = useRef<Group>(null)
  const timers = useRef({ send: 0, sent: new Vector3(Infinity, 0, 0), heartbeat: 0, bubbleSound: 1, bubbleFx: 0 })
  const phase = useGame((s) => s.phase)
  const nickname = useGame((s) => s.nickname)

  useEffect(() => attachKeyboard(), [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const p = player
    const pose = p.pose
    const playing = useGame.getState().phase === 'playing'
    pose.stateTime += dt

    // ── 입력 ──
    const mv = playing ? readMove() : { x: 0, y: 0 }
    const diveHeld = playing && isDiveHeld()
    if (!diveHeld) p.diveLock = false
    const sy = Math.sin(cameraRig.yaw)
    const cy = Math.cos(cameraRig.yaw)
    // 카메라 기준 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
    const dirX = -sy * mv.y + cy * mv.x
    const dirZ = -cy * mv.y - sy * mv.x
    const moveAmt = Math.hypot(mv.x, mv.y)
    pose.move += (moveAmt - pose.move) * damp(6, dt)

    const s = pose.state
    const underwater = UNDERWATER_STATES.has(s)
    let speed = 0

    // ── 상태 머신 ──
    switch (s) {
      case 'surfaceIdle':
      case 'surfaceSwim': {
        speed = CONFIG.surfaceSpeed
        setState(pose, moveAmt > 0.1 ? 'surfaceSwim' : 'surfaceIdle')
        if (diveHeld && !p.diveLock) startDive(t)
        break
      }
      case 'sumbi': {
        speed = CONFIG.surfaceSpeed * 0.4
        if (pose.stateTime > CONFIG.sumbiDuration) setState(pose, 'surfaceIdle')
        break
      }
      case 'entering': {
        speed = CONFIG.underwaterSpeed * 0.5
        if (pose.stateTime > CONFIG.enterDuration) setState(pose, 'underIdle')
        break
      }
      case 'underIdle':
      case 'underSwim': {
        speed = CONFIG.underwaterSpeed
        setState(pose, moveAmt > 0.1 ? 'underSwim' : 'underIdle')
        if (!diveHeld || p.forcedAscend) {
          setState(pose, 'ascending')
          break
        }
        const item = findHarvestable(p.pos, CONFIG.harvestRadius)
        if (item) {
          p.harvestItemId = item.id
          setState(pose, 'harvesting')
        }
        break
      }
      case 'harvesting': {
        speed = CONFIG.underwaterSpeed * 0.15
        if (pose.stateTime > CONFIG.harvestDuration) finishHarvest(t)
        break
      }
      case 'ascending': {
        speed = CONFIG.underwaterSpeed * 0.75
        // 숨이 남아 있으면 다시 Space를 눌러 내려갈 수 있음
        if (diveHeld && !p.forcedAscend && !p.diveLock && p.breath > 0) setState(pose, 'underSwim')
        break
      }
    }

    // ── 숨 ──
    if (underwater) {
      p.breath = Math.max(0, p.breath - dt / CONFIG.breathMax)
      if (p.breath <= 0 && !p.forcedAscend) {
        p.forcedAscend = true
        p.diveLock = true
        if (pose.state === 'harvesting') p.harvestItemId = -1
        if (pose.state !== 'ascending') setState(pose, 'ascending')
      }
      if (p.breath < CONFIG.lowBreath && t > timers.current.heartbeat) {
        audio.playHeartbeat()
        timers.current.heartbeat = t + 1.0
      }
    } else {
      p.breath = Math.min(1, p.breath + dt / CONFIG.breathRecoverTime)
    }

    // ── 수평 이동 ──
    if (speed > 0 && moveAmt > 0.01) {
      const atSurface = !UNDERWATER_STATES.has(pose.state)
      const nx = p.pos.x + dirX * speed * dt
      const nz = p.pos.z + dirZ * speed * dt
      if (canStand(nx, nz, p.pos.y, atSurface)) {
        p.pos.x = nx
        p.pos.z = nz
      } else if (canStand(nx, p.pos.z, p.pos.y, atSurface)) {
        p.pos.x = nx
      } else if (canStand(p.pos.x, nz, p.pos.y, atSurface)) {
        p.pos.z = nz
      }
      if (pose.state !== 'harvesting') {
        p.yaw = lerpAngle(p.yaw, Math.atan2(dirX, dirZ), damp(7, dt))
      }
    }

    // ── 수직 이동 ──
    const surf = surfaceY(p.pos.x, p.pos.z, t)
    const floor = terrainY(p.pos.x, p.pos.z) + CONFIG.floorClearance
    switch (pose.state) {
      case 'entering': {
        // 머리부터 쏙 들어감
        const k = Math.min(1, pose.stateTime / CONFIG.enterDuration)
        p.pos.y = Math.max(floor, surf - k * k * 1.1)
        break
      }
      case 'underIdle':
      case 'underSwim':
      case 'harvesting': {
        if (pose.state !== 'harvesting') p.pos.y -= CONFIG.diveSpeed * dt
        p.pos.y = clamp(p.pos.y, floor, surf - 0.6)
        break
      }
      case 'ascending': {
        p.pos.y = Math.max(floor, p.pos.y + CONFIG.ascendSpeed * dt)
        if (p.pos.y >= surf) arriveSurface(t)
        break
      }
      default:
        p.pos.y += (surf - p.pos.y) * damp(10, dt)
    }

    // ── 인사 (다른 동작 위에 겹쳐 재생) ──
    if (pose.waveTime >= 0) {
      pose.waveTime += dt
      if (pose.waveTime > CONFIG.waveDuration) pose.waveTime = -1
    }
    if (consumeWave() && pose.waveTime < 0 && pose.state !== 'entering' && pose.state !== 'ascending') {
      pose.waveTime = 0
      audio.playChime()
      useBubbles.getState().sayself('손 흔들어 인사했어요')
      net.send({ t: 'act', a: 'wave' })
    }

    // ── 물속 기포 ──
    if (UNDERWATER_STATES.has(pose.state)) {
      const rate = pose.state === 'ascending' ? 0.12 : 0.35
      if (t > timers.current.bubbleFx) {
        fwd.set(Math.sin(p.yaw), 0, Math.cos(p.yaw))
        fx.bubbles.push(tmp.copy(p.pos).addScaledVector(fwd, 0.25).setY(p.pos.y + 0.35).clone())
        timers.current.bubbleFx = t + rate * (0.6 + Math.random() * 0.8)
      }
      if (t > timers.current.bubbleSound) {
        audio.playBubble()
        timers.current.bubbleSound = t + 0.7 + Math.random() * 1.6
      }
    }

    // ── 테왁 ──
    updateTewak(t, dt)

    // ── 모델 반영 ──
    if (root.current) {
      root.current.position.copy(p.pos)
      root.current.rotation.y = p.yaw
    }

    // ── 위치 송신 (초당 최대 10회, 거의 안 움직이면 1초에 1회) ──
    if (playing && t > timers.current.send) {
      const moved = timers.current.sent.distanceToSquared(p.pos) > 0.0004
      if (moved || t > timers.current.send + 1) {
        net.send({ t: 'move', p: [round(p.pos.x), round(p.pos.y), round(p.pos.z)], r: round(p.yaw) })
        timers.current.sent.copy(p.pos)
        timers.current.send = t + 1 / CONFIG.moveSendHz
      }
    }
  }, -2)

  return (
    <>
      <group ref={root}>
        <Haenyeo pose={player.pose} />
        {phase === 'playing' && <NameTag nick={nickname} self />}
      </group>
      <Tewak state={player.tewak} />
    </>
  )
}

const round = (n: number) => Math.round(n * 100) / 100

function startDive(t: number) {
  const p = player
  setState(p.pose, 'entering')
  p.diveStartedAt = t
  p.forcedAscend = false
  p.tewak.attached = false
  fx.splashes.push(p.pos.clone())
  audio.playSplash()
  useGame.getState().setDiving(true)
  net.send({ t: 'act', a: 'dive' })
}

function finishHarvest(t: number) {
  const p = player
  const item = seafood[p.harvestItemId]
  p.harvestItemId = -1
  setState(p.pose, 'underIdle')
  if (!item || !item.active) return
  collect(item, t)
  audio.playHarvest()
  useGame.getState().addToBasket(item.type)
  useBubbles.getState().sayself(`${withObjectParticle(ITEM_LABEL[item.type])} 땄어요`)
  net.send({ t: 'act', a: 'harvest', item: item.type })
}

function arriveSurface(t: number) {
  const p = player
  const dived = t - p.diveStartedAt
  p.forcedAscend = false
  p.tewak.attached = true
  useGame.getState().setDiving(false)
  fx.splashes.push(p.pos.clone())
  net.send({ t: 'act', a: 'surface' })
  if (dived >= CONFIG.sumbiMinDive) {
    setState(p.pose, 'sumbi')
    audio.playSumbi()
    useBubbles.getState().sayself('호오이~')
    net.send({ t: 'act', a: 'sumbi' })
  } else {
    setState(p.pose, 'surfaceIdle')
  }
}

const TETHER = 2.2

function updateTewak(t: number, dt: number) {
  const p = player
  const tw = p.tewak
  if (tw.attached) {
    // 품에 안고 다님: 몸 앞쪽 수면 위
    const tx = p.pos.x + Math.sin(p.yaw) * 0.42
    const tz = p.pos.z + Math.cos(p.yaw) * 0.42
    const k = damp(10, dt)
    tw.pos.x += (tx - tw.pos.x) * k
    tw.pos.z += (tz - tw.pos.z) * k
    tw.pos.y += (waveHeight(tw.pos.x, tw.pos.z, t) + 0.04 - tw.pos.y) * damp(12, dt)
  } else {
    // 수면에 두고 들어감. 줄에 매인 것처럼 멀어지면 천천히 끌려옴
    const dx = p.pos.x - tw.pos.x
    const dz = p.pos.z - tw.pos.z
    const d = Math.hypot(dx, dz)
    if (d > TETHER) {
      const pull = Math.min(d - TETHER, (d - TETHER) * 1.5 * dt)
      tw.pos.x += (dx / d) * pull
      tw.pos.z += (dz / d) * pull
    }
    tw.pos.y = waveHeight(tw.pos.x, tw.pos.z, t) + 0.08
  }
}
