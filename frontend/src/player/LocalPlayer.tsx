import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { audio } from '../audio/AudioEngine'
import { CONFIG, ITEM_LABEL, withObjectParticle } from '../config'
import { CHEER_DURATION, Haenyeo } from '../haenyeo/Haenyeo'
import { nickOf } from '../haenyeo/customize'
import { lookFromCustom } from '../haenyeo/look'
import { Tewak } from '../haenyeo/Tewak'
import { updateTewak } from '../haenyeo/tewakMotion'
import { advanceActs } from '../haenyeo/acts'
import { setState, UNDERWATER_STATES } from '../haenyeo/types'
import { clamp, damp, lerpAngle } from '../lib/math'
import { net } from '../net'
import { useBubbles } from '../store/bubbleStore'
import { useCustomize } from '../store/customizeStore'
import { useGame } from '../store/gameStore'
import { NameTag } from '../ui/NameTag'
import { seatPose } from '../world/bulteok/layout'
import { terrainY } from '../world/terrain'
import { waveHeight } from '../world/sea/waves'
import { collect, findHarvestable, seafood } from '../world/sea/seafood/seafoodState'
import { onActEvent } from './actEvents'
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
  const customizing = useGame((s) => s.customizing)
  const custom = useCustomize((s) => s.custom)
  const look = useMemo(() => lookFromCustom(custom), [custom])
  const nickname = nickOf(custom)

  useEffect(() => attachKeyboard(), [])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const p = player
    const pose = p.pose
    const game = useGame.getState()
    // 꾸미는 중(입장 화면 / 바다 속 꾸미기 메뉴): 조작 없이 카메라 쪽을 보며 천천히 몸을 돌림
    const showcase = game.phase === 'entry' || game.customizing
    const playing = game.phase === 'playing' && !game.customizing
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
    pose.breath = p.breath

    // ── 불턱 동작·만세·숨 고르기 시간 ──
    for (const ev of advanceActs(pose, dt)) onActEvent(ev, 1, pose.actItem, p.pos, p.yaw, true)

    if (p.zone === 'bulteok') {
      // 불턱: 자리에 앉아 있음 (이동·잠수 없음)
      const seat = seatPose(p.seat)
      p.pos.set(seat.x, seat.y, seat.z)
      p.yaw = seat.yaw
      setState(pose, 'sit')
      p.breath = Math.min(1, p.breath + dt / CONFIG.breathRecoverTime)
    } else {
    const s = pose.state
    const underwater = UNDERWATER_STATES.has(s)
    const floor = terrainY(p.pos.x, p.pos.z) + CONFIG.floorClearance
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
        // 웅크림(enterCrouch) → 머리부터 입수. 머리가 물에 닿는 순간 물보라 + 첨벙
        speed = CONFIG.underwaterSpeed * 0.3
        if (pose.stateTime >= CONFIG.enterCrouch && pose.stateTime - dt < CONFIG.enterCrouch) {
          fx.splashes.push({ pos: p.pos.clone(), power: 2.2 })
          audio.playSplash()
        }
        if (pose.stateTime > CONFIG.enterDuration) setState(pose, 'descending')
        break
      }
      case 'descending':
      case 'underIdle':
      case 'underSwim': {
        speed = CONFIG.underwaterSpeed * (s === 'descending' ? 0.6 : 1)
        if (!diveHeld || p.forcedAscend) {
          setState(pose, 'ascending')
          break
        }
        // 머리를 아래로 하고 내려가다가, 바닥 가까이에서 몸을 눕혀 개구리헤엄
        if (s !== 'descending' || p.pos.y - floor < CONFIG.levelOffHeight) {
          setState(pose, moveAmt > 0.1 ? 'underSwim' : 'underIdle')
        }
        const item = findHarvestable(p.pos, CONFIG.harvestRadius)
        if (item) {
          p.harvestItemId = item.id
          pose.heldItem = item.type
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
        if (diveHeld && !p.forcedAscend && !p.diveLock && p.breath > 0) setState(pose, 'descending')
        break
      }
    }

    // ── 숨 ──
    if (underwater) {
      p.breath = Math.max(0, p.breath - dt / CONFIG.breathMax)
      if (p.breath <= 0 && !p.forcedAscend) {
        p.forcedAscend = true
        p.diveLock = true
        if (pose.state === 'harvesting') {
          p.harvestItemId = -1
          pose.heldItem = null
        }
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

    // ── 카메라 쪽으로 뒤돌아보기: 표정이 보여야 하는 순간과 한동안 가만히 있을 때 ──
    if (showcase) {
      p.yaw = lerpAngle(p.yaw, cameraRig.yaw + Math.sin(t * 0.45) * 0.55, damp(2.5, dt))
    } else if (moveAmt < 0.01) {
      const st = pose.stateTime
      const showOff =
        pose.waveTime >= 0 ||
        pose.state === 'sumbi' ||
        (pose.state === 'harvesting' && st > CONFIG.harvestReach * 0.5)
      const idleLong = (pose.state === 'surfaceIdle' || pose.state === 'underIdle') && st > 2.5
      if (showOff || idleLong) {
        p.yaw = lerpAngle(p.yaw, cameraRig.yaw, damp(showOff ? 5 : 1.4, dt))
      }
    }

    // ── 수직 이동 ──
    const surf = surfaceY(p.pos.x, p.pos.z, t)
    const floorHere = terrainY(p.pos.x, p.pos.z) + CONFIG.floorClearance
    switch (pose.state) {
      case 'entering': {
        if (pose.stateTime < CONFIG.enterCrouch) {
          // 웅크림: 수면에서 살짝 가라앉으며 몸을 움츠림
          p.pos.y += (surf - 0.05 - p.pos.y) * damp(10, dt)
        } else {
          // 머리부터 들어가며 하강 속도를 하강 단계 속도까지 올림
          const k = clamp((pose.stateTime - CONFIG.enterCrouch) / (CONFIG.enterDuration - CONFIG.enterCrouch), 0, 1)
          p.pos.y = Math.max(floorHere, p.pos.y - CONFIG.diveSpeed * Math.min(1, 0.1 + k * 1.2) * dt)
        }
        break
      }
      case 'descending':
      case 'underIdle':
      case 'underSwim':
      case 'harvesting': {
        // 하강 중엔 빠르게, 바닥 근처에선 비탈을 따라 천천히 가라앉음
        if (pose.state === 'descending') p.pos.y -= CONFIG.diveSpeed * dt
        else if (pose.state !== 'harvesting') p.pos.y -= CONFIG.diveSpeed * 0.5 * dt
        p.pos.y = clamp(p.pos.y, floorHere, surf - 0.6)
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
    }

    // ── 꾸미기 반응 (콩 뛰며 기뻐하기) ──
    if (pose.cheerTime >= 0) pose.cheerTime = pose.cheerTime > CHEER_DURATION ? -1 : pose.cheerTime + dt

    // ── 인사 (다른 동작 위에 겹쳐 재생) ──
    if (pose.waveTime >= 0) {
      pose.waveTime += dt
      if (pose.waveTime > CONFIG.waveDuration) pose.waveTime = -1
    }
    if (consumeWave() && playing && pose.waveTime < 0 && pose.state !== 'entering' && pose.state !== 'descending' && pose.state !== 'ascending') {
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
        // 입 근처에서 기포: 머리가 아래인 하강 중엔 몸 아래쪽
        const mouthY = pose.state === 'descending' || pose.state === 'entering' ? -0.3 : 0.35
        fx.bubbles.push(tmp.copy(p.pos).addScaledVector(fwd, 0.25).setY(p.pos.y + mouthY).clone())
        timers.current.bubbleFx = t + rate * (0.6 + Math.random() * 0.8)
      }
      if (t > timers.current.bubbleSound) {
        audio.playBubble()
        timers.current.bubbleSound = t + 0.7 + Math.random() * 1.6
      }
    }

    // ── 테왁 (불턱에서는 옆에 내려놓음) ──
    if (p.zone === 'sea') updateTewakLocal(t, dt)

    // ── 모델 반영 ──
    if (root.current) {
      root.current.position.copy(p.pos)
      root.current.rotation.y = p.yaw
    }

    // ── 위치 송신 (초당 최대 10회, 거의 안 움직이면 1초에 1회) ──
    if (game.phase === 'playing' && p.zone === 'sea' && t > timers.current.send) {
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
        <Haenyeo pose={player.pose} look={look} />
        {phase === 'playing' && !customizing && <NameTag nick={nickname} self />}
      </group>
      <Tewak state={player.tewak} material={look.tewak} />
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
  // 물보라·첨벙 소리는 웅크림이 끝나고 머리가 물에 닿을 때 (상태 머신 'entering')
  useGame.getState().setDiving(true)
  net.send({ t: 'act', a: 'dive' })
}

function finishHarvest(t: number) {
  const p = player
  const item = seafood[p.harvestItemId]
  p.harvestItemId = -1
  p.pose.heldItem = null
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
  fx.splashes.push({ pos: p.pos.clone(), power: 1.2 })
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

function updateTewakLocal(t: number, dt: number) {
  updateTewak(player.tewak, player.pos, player.yaw, t, dt)
}
