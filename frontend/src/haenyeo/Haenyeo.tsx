import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Quaternion, Vector3, type Group, type Mesh } from 'three'
import { CONFIG, type ItemType } from '../config'
import { damp, smoothstep } from '../lib/math'
import { SEAFOOD_GEOMETRY, SEAFOOD_MATERIAL } from '../world/sea/seafood/models'
import { GEO, HEAD_R, HEAD_SCALE, HEAD_Y, headSurfaceZ } from './geometries'
import type { HaenyeoLook } from './look'
import { MAT } from './materials'
import { TOOL_GEO, TOOL_MAT } from './tools'
import { WALK } from '../world/bulteok/seatWalk'
import { OOPS_DURATION } from './acts'
import { LAND_STATES, type HaenyeoPose } from './types'

// 기본 도형으로 조합한 2~2.5등신 해녀 + 절차적 애니메이션.
// 원점 = 몸 중심, 앞 = +z. 전체 키 ≈ 1.15, 머리 높이 ≈ 0.6 (약 절반)

type Eyes = 'dot' | 'round' | 'happy' | 'line'
type Mouth = 'dot' | 'o' | 'smile'

interface Target {
  pitch: number
  roll: number
  headTilt: number
  headYaw: number
  headRoll: number
  armX: number
  /** 팔 벌림 (+ 바깥, - 안쪽으로 테왁 안기) */
  armZ: number
  kickAmp: number
  kickFreq: number
  frog: number // 0 = 파닥파닥 발차기, 1 = 개구리헤엄
  goggles: number // 0 = 이마 위, 1 = 눈 위
  stretch: number // 1 = 기본, >1 늘어남, <1 눌림
  cheeks: number // 0 = 평소, 1 = 빵빵
  sit: number // 1 = 다리를 앞으로 뻗고 앉음
}

/** 양팔을 따로 움직이는 동작(손질·만세 등)의 팔 각도. l = 왼팔(+x), r = 오른팔(-x) */
interface Arms {
  lx: number
  lz: number
  rx: number
  rz: number
}

interface Face {
  eyes: Eyes
  mouth: Mouth
  sweat: boolean
}

const BASE: Target = {
  pitch: 0.12, roll: 0, headTilt: 0, headYaw: 0, headRoll: 0,
  armX: -1.15, armZ: -0.35, kickAmp: 0.22, kickFreq: 1.8, frog: 0,
  goggles: 0, stretch: 1, cheeks: 0, sit: 0,
}

const ease = (x: number) => smoothstep(0, 1, x)
/** 0→1→0 부드러운 봉우리 */
const hump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2)

type Gesture = 'tilt' | 'look' | 'hug'

interface Anim extends Target {
  kickPhase: number
  prevState: HaenyeoPose['state']
  popT: number
  happyT: number
  gesture: Gesture | null
  gestureT: number
  nextGesture: number
  nextBlink: number
  /** 양팔 따로 움직이기: 현재 각도와 섞는 비율 */
  arms: Arms
  armsW: number
}

/** 불턱에서 앉아서 하는 동작 (손질 3종·귤 까먹기·졸기). 양팔을 따로 쓰면 그 각도를 돌려줌 */
function sitAct(pose: HaenyeoPose, tg: Target, face: Face, t: number): Arms | null {
  const st = pose.actTime
  switch (pose.act) {
    case 'prep': {
      tg.headTilt = 0.35
      face.eyes = 'round'
      if (st >= CONFIG.prepToss) {
        // 대야로 휙
        const fl = hump(Math.min(1, (st - CONFIG.prepToss) / 0.45))
        tg.headTilt = 0.05
        face.eyes = 'happy'
        face.mouth = 'smile'
        return { lx: -1.25 - 0.6 * fl, lz: -0.2, rx: -1.25 - 0.6 * fl, rz: 0.2 }
      }
      if (pose.actItem === 'conch') {
        if (st < 1.9) {
          // 무릎 위 소라를 작은 돌로 톡톡톡
          const up = Math.max(0, Math.sin(st * Math.PI * 2 * 2.2)) ** 0.7
          return { lx: -0.95, lz: -0.45, rx: -1.2 - 0.55 * up, rz: 0.32 }
        }
        // 속살 쏙 꺼내 들어 보이기
        tg.headTilt = -0.05
        face.eyes = 'happy'
        face.mouth = 'smile'
        return { lx: -2.0, lz: -0.32, rx: -2.0, rz: 0.32 }
      }
      if (pose.actItem === 'abalone') {
        if (st < 1.3) {
          // 껍데기 밑으로 빗창을 쓱쓱
          if (st > 1.12) face.mouth = 'o'
          return { lx: -1.0, lz: -0.38, rx: -1.12 - 0.16 * Math.sin(st * 15), rz: 0.36 }
        }
        // "뽁" 떼어내서 반짝이는 껍데기를 불빛에 비춰 봄
        tg.headTilt = -0.38
        face.eyes = st < 1.55 ? 'round' : 'happy'
        face.mouth = st < 1.55 ? 'o' : 'smile'
        return { lx: -2.45, lz: -0.22, rx: -2.45, rz: 0.22 }
      }
      // 성게: 반으로 쩍 → 숟가락으로 알을 살살 → 한 입, 볼 빵빵 + 초승달 눈
      if (st < 0.65) {
        const open = smoothstep(0.5, 0.65, st)
        return { lx: -0.92, lz: -0.42 + 0.25 * open, rx: -0.92, rz: 0.42 - 0.25 * open }
      }
      if (st < 1.6) return { lx: -0.95, lz: -0.4, rx: -1.05 - 0.18 * Math.sin(st * 10), rz: 0.42 }
      const k = smoothstep(1.6, 1.8, st)
      tg.headTilt = 0.05
      tg.cheeks = smoothstep(1.75, 1.9, st) * (1 - smoothstep(2.3, 2.5, st))
      face.eyes = 'happy'
      face.mouth = st < 2.2 ? 'o' : 'smile'
      return { lx: -0.95, lz: -0.4, rx: -1.05 - 1.3 * k, rz: 0.42 + 0.33 * k }
    }
    case 'tangerine': {
      if (st < 1.5) {
        // 껍질 까기
        const wig = Math.sin(st * 13) * 0.09
        tg.headTilt = 0.3
        face.eyes = 'round'
        return { lx: -1.35 + wig, lz: -0.52, rx: -1.35 - wig, rz: 0.52 }
      }
      face.eyes = 'happy'
      face.mouth = 'smile'
      if (st < 3.4) {
        // 한 조각씩 냠
        const h = hump(((st - 1.5) % 0.75) / 0.75)
        tg.cheeks = 0.5 * h
        return { lx: -1.2, lz: -0.45, rx: -1.2 - 1.15 * h, rz: 0.45 + 0.3 * h }
      }
      return { lx: -0.6, lz: -0.55, rx: -0.6, rz: 0.55 }
    }
    case 'doze': {
      // 꾸벅꾸벅: 천천히 고개가 떨어지다가 가끔 퍼뜩
      const nod = (Math.sin((t * Math.PI * 2) / 3.2) + 1) / 2
      const jerk = t % 7.3 < 0.35 ? hump((t % 7.3) / 0.35) : 0
      tg.headTilt = 0.22 + 0.28 * nod - 0.35 * jerk
      tg.pitch = 0.04 + 0.05 * nod
      tg.armX = -0.55
      tg.armZ = -0.32
      tg.stretch = 1 - 0.03 * nod
      face.eyes = jerk > 0.3 ? 'round' : 'line'
      return null
    }
  }
  return null
}

/** 앉거나 서서 쉬는 동안 가끔: 고개 갸웃 / 두리번 / 눈웃음 */
function idleGesture(a: Anim, tg: Target, face: Face) {
  const g = a.gesture ? Math.min(1, a.gestureT / 1.6) : 0
  if (a.gesture === 'tilt') tg.headRoll = 0.3 * hump(g)
  if (a.gesture === 'look') tg.headYaw = Math.sin(g * Math.PI * 2) * 0.55 * Math.sin(Math.PI * g)
  if (a.gesture === 'hug') face.eyes = hump(g) > 0.3 ? 'happy' : 'dot'
}

function computeTarget(pose: HaenyeoPose, a: Anim, t: number): { tg: Target; face: Face; arms: Arms | null } {
  const st = pose.stateTime
  const lowBreath = pose.breath < CONFIG.lowBreath
  const face: Face = { eyes: 'dot', mouth: 'dot', sweat: false }
  let tg: Target = { ...BASE }
  let arms: Arms | null = null

  switch (pose.state) {
    case 'surfaceIdle': {
      // 둥실거리며 가끔 고개 갸웃 / 두리번 / 테왁 다시 끌어안기
      const g = a.gesture ? Math.min(1, a.gestureT / 1.6) : 0
      const env = hump(g)
      if (a.gesture === 'tilt') tg.headRoll = 0.3 * env
      if (a.gesture === 'look') tg.headYaw = Math.sin(g * Math.PI * 2) * 0.65 * Math.sin(Math.PI * g)
      if (a.gesture === 'hug') {
        tg.armX = -1.3
        tg.armZ = -0.55 * env - 0.35 * (1 - env)
        tg.stretch = 1 - 0.06 * env
        face.eyes = env > 0.3 ? 'happy' : 'dot'
      }
      break
    }
    case 'surfaceSwim':
      tg = { ...tg, pitch: 0.38, roll: Math.sin(a.kickPhase * Math.PI * 2) * 0.1, kickAmp: 0.5, kickFreq: 6.5, armX: -1.25 }
      break
    case 'entering': {
      if (st < CONFIG.enterCrouch) {
        // 준비: 살짝 웅크리고 팔을 머리 위로
        tg = { ...tg, pitch: -0.2, headTilt: 0.25, armX: -2.9, armZ: 0.1, stretch: 0.8, kickAmp: 0.05, goggles: 1 }
      } else {
        // 몸 전체를 앞으로 돌려 머리부터 쏙 (머리가 아래로 약 75°)
        tg = { ...tg, pitch: 2.9, armX: -3.05, armZ: 0.05, stretch: 1.14, kickAmp: 0.5, kickFreq: 6, goggles: 1 }
      }
      face.eyes = 'line'
      break
    }
    case 'descending':
      // 머리를 아래로, 팔은 머리 위로 모으고 다리로 파닥파닥 차며 내려감
      tg = {
        ...tg, pitch: 2.82 + Math.sin(t * 1.4) * 0.04, roll: Math.sin(a.kickPhase * Math.PI * 2) * 0.06,
        armX: -3.05, armZ: 0.1, kickAmp: 0.9, kickFreq: 4.2, stretch: 1.06, goggles: 1,
      }
      face.eyes = 'round'
      break
    case 'underIdle':
      // 바닥 위에 엎드려 떠 있기: 팔로 살살 물을 저으며 개구리발
      tg = { ...tg, pitch: 1.3, headTilt: -0.35, armX: -1.5 + Math.sin(t * 2) * 0.3, armZ: 0.7, kickAmp: 0.8, kickFreq: 0.9, frog: 1, goggles: 1 }
      face.eyes = 'round'
      break
    case 'underSwim': {
      // 개구리헤엄: 다리를 모았다 차는 박자에 맞춰 팔도 젓기
      const s = (Math.sin(a.kickPhase * Math.PI * 2) + 1) / 2
      tg = {
        ...tg, pitch: 1.45, headTilt: -0.3, armX: -2.7 + 1.0 * s, armZ: 0.15 + 0.75 * s, kickAmp: 1, kickFreq: 1.5,
        frog: 1, goggles: 1, stretch: 1 + 0.06 * (1 - s),
      }
      face.eyes = 'round'
      break
    }
    case 'harvesting': {
      tg.goggles = 1
      tg.frog = 1
      tg.kickAmp = 0.5
      tg.kickFreq = 0.8
      if (st < CONFIG.harvestReach) {
        // 손 뻗기
        tg = { ...tg, pitch: 1.5, armX: -2.3, armZ: -0.1 }
        face.eyes = 'round'
      } else if (st < CONFIG.harvestShowEnd) {
        // 두 손으로 들어 올려 보여주기 (^^)
        const k = (st - CONFIG.harvestReach) / (CONFIG.harvestShowEnd - CONFIG.harvestReach)
        tg = { ...tg, pitch: 0.2, headTilt: -0.12, armX: -2.15 + Math.sin(k * Math.PI * 4) * 0.08, armZ: -0.3, stretch: 1.04 }
        face.eyes = 'happy'
        face.mouth = 'smile'
      } else {
        // 망사리에 넣기
        tg = { ...tg, pitch: 0.5, armX: -0.4, armZ: 0.5 }
        face.eyes = 'happy'
        face.mouth = 'smile'
      }
      break
    }
    case 'ascending':
      tg = {
        ...tg, pitch: -0.15, headTilt: -0.35, armX: 0.25, armZ: 0.3, kickAmp: 0.65, kickFreq: 6.5,
        goggles: 1, stretch: 1.12,
      }
      face.eyes = 'round'
      break
    case 'sit': {
      // 불턱: 다리를 앞으로 뻗고 앉아 모닥불에 손 쬐기 (살살 비빔)
      tg = {
        ...tg, pitch: -0.06, headTilt: 0.06, armX: -1.25 + Math.sin(t * 2.6) * 0.05, armZ: -0.18 + Math.sin(t * 5.2) * 0.04,
        kickAmp: 0, sit: 1,
      }
      idleGesture(a, tg, face)
      if (pose.act) arms = sitAct(pose, tg, face, t)
      break
    }
    case 'stand': {
      // 담 밖에 서서 모닥불 쪽으로 손 쬐기 (자리가 다 찼을 때)
      tg = {
        ...tg, pitch: -0.04, headTilt: 0.05, armX: -1.3 + Math.sin(t * 2.6) * 0.05, armZ: -0.2 + Math.sin(t * 5.2) * 0.04,
        kickAmp: 0, sit: 0,
      }
      idleGesture(a, tg, face)
      break
    }
    case 'rise': {
      // 엉덩이를 들며 일어남: 앞으로 살짝 숙였다가 두 팔을 들고 작은 기지개
      const k = Math.min(1, st / WALK.rise)
      tg = {
        ...tg, sit: 1 - smoothstep(0.05, 0.7, k), pitch: 0.3 * hump(Math.min(1, k * 1.6)) - 0.1 * hump((k - 0.5) / 0.5),
        armX: -0.5, armZ: 0.1 + 1.1 * hump((k - 0.35) / 0.65), kickAmp: 0, stretch: 1 + 0.09 * hump((k - 0.4) / 0.6),
      }
      if (k > 0.45) {
        face.eyes = 'line'
        face.mouth = 'o'
      }
      break
    }
    case 'walk': {
      // 짧은 다리로 뒤뚱뒤뚱: 몸을 좌우로 흔들고, 왼팔은 흔들고 오른팔로는 테왁을 끼고
      const ph = a.kickPhase * Math.PI * 2
      const m = pose.move
      tg = {
        ...tg, pitch: 0.07 * m, roll: Math.sin(ph) * (0.07 + 0.08 * m), headRoll: -Math.sin(ph) * 0.05, headTilt: 0.02,
        armX: -0.3, armZ: 0.4, kickAmp: 0.32 + 0.3 * m, kickFreq: 1.9, frog: 0, sit: 0,
      }
      arms = { lx: -0.25 + Math.sin(ph) * 0.4 * m, lz: 0.42, rx: -0.45, rz: -0.62 }
      if (m > 0.6) face.mouth = 'smile'
      break
    }
    case 'settle': {
      // 콩 뛰었다 털썩 앉기
      const landed = st >= WALK.land
      tg = { ...tg, sit: landed ? 1 : smoothstep(0, WALK.land, st) * 0.7, pitch: landed ? -0.1 : 0.05, armX: -0.7, armZ: 0.55, kickAmp: 0 }
      face.eyes = landed ? 'happy' : 'round'
      face.mouth = 'smile'
      break
    }
    case 'sumbi': {
      if (st < CONFIG.sumbiPuff) {
        // 고개를 젖히고 볼 빵빵, 입 동그랗게 "호오이~"
        const k = smoothstep(0, 0.2, st)
        tg = { ...tg, headTilt: -0.55 * k, cheeks: k, pitch: -0.05 }
        face.eyes = 'line'
        face.mouth = 'o'
      } else {
        // 후련한 표정
        tg = { ...tg, headTilt: 0.08, pitch: 0.15 }
        face.eyes = 'happy'
        face.mouth = 'smile'
      }
      break
    }
  }

  // 대야가 가득 참: 다 같이 두 팔 번쩍 만세
  if (pose.celebrateTime >= 0) {
    const ct = pose.celebrateTime
    const wig = Math.sin(ct * 14) * 0.15
    arms = { lx: -0.2, lz: 2.55 + wig, rx: -0.2, rz: -2.55 + wig }
    tg.headTilt = -0.15
    face.eyes = 'happy'
    face.mouth = Math.sin(ct * 5) > 0 ? 'o' : 'smile'
  }

  // "앗": 원하던 자리를 다른 사람이 먼저. 그 자리 쪽으로 고개를 돌리고 동그란 눈
  if (pose.oopsTime >= 0) {
    const o = pose.oopsTime / OOPS_DURATION
    const w = smoothstep(0, 0.12, o) * (1 - smoothstep(0.75, 1, o))
    tg.headYaw = tg.headYaw * (1 - w) + pose.oopsYaw * 0.85 * w
    tg.headTilt -= 0.12 * w
    if (o < 0.75) {
      face.eyes = 'round'
      face.mouth = 'o'
    }
  }

  // 숨이 부족하면 볼이 살짝 부풀고 땀 한 방울
  if (lowBreath && pose.state !== 'sumbi' && pose.state !== 'surfaceIdle' && pose.state !== 'surfaceSwim') {
    tg.cheeks = Math.max(tg.cheeks, 0.4)
    face.sweat = true
  }
  // 채집 직후 잠깐 눈웃음
  if (a.happyT > 0 && face.eyes !== 'line') {
    face.eyes = 'happy'
    face.mouth = 'smile'
  }
  // 인사하는 동안 눈웃음
  if (pose.waveTime >= 0 && face.eyes === 'dot') face.eyes = 'happy'
  // 꾸미기 반응: 활짝 웃기
  if (pose.cheerTime >= 0) {
    face.eyes = 'happy'
    face.mouth = 'smile'
  }

  return { tg, face, arms }
}

const handTmp = new Vector3()
const handTmp2 = new Vector3()
const qParent = new Quaternion()

/** 어깨(shoulderX)에서 팔 회전(x, z)으로 손끝 위치 (몸 기준) */
function handPos(shoulderX: number, rx: number, rz: number, out: Vector3) {
  const L = 0.2
  return out.set(shoulderX + L * Math.sin(rz), 0.05 - L * Math.cos(rz) * Math.cos(rx), -L * Math.cos(rz) * Math.sin(rx))
}

export const CHEER_DURATION = 0.75
const EYE_X = 0.1
const EYE_Y = -0.07
const CHEEK_X = 0.205
const CHEEK_Y = -0.135
const MOUTH_Y = -0.155

export function Haenyeo({ pose, look }: { pose: HaenyeoPose; look: HaenyeoLook }) {
  const pop = useRef<Group>(null!)
  const squash = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const head = useRef<Group>(null!)
  const goggles = useRef<Group>(null!)
  const armL = useRef<Group>(null!)
  const armR = useRef<Group>(null!)
  const legL = useRef<Group>(null!)
  const legR = useRef<Group>(null!)
  const cheekL = useRef<Mesh>(null!)
  const cheekR = useRef<Mesh>(null!)
  const held = useRef<Group>(null!)
  const sweat = useRef<Mesh>(null!)
  const eyeSets = useRef<Record<Eyes, Group | null>>({ dot: null, round: null, happy: null, line: null })
  const mouths = useRef<Record<Mouth, Mesh | null>>({ dot: null, o: null, smile: null })
  const heldMeshes = useRef<Record<ItemType, Mesh | null>>({ conch: null, abalone: null, urchin: null })
  // 불턱 소품
  const lapItem = useRef<Group>(null!)
  const lapMeshes = useRef<Record<ItemType, Mesh | null>>({ conch: null, abalone: null, urchin: null })
  const stone = useRef<Mesh>(null!)
  const knife = useRef<Mesh>(null!)
  const spoon = useRef<Group>(null!)
  const meat = useRef<Mesh>(null!)
  const halfA = useRef<Group>(null!)
  const halfB = useRef<Group>(null!)
  const tangerine = useRef<Mesh>(null!)
  const segment = useRef<Mesh>(null!)
  const sparkle = useRef<Mesh>(null!)
  const zzz = useRef<Group>(null!)
  const zs = useRef<(Mesh | null)[]>([])

  const anim = useRef<Anim>({
    ...BASE,
    kickPhase: look.phase * 10,
    prevState: pose.state,
    popT: -1,
    happyT: 0,
    gesture: null,
    gestureT: 0,
    nextGesture: 2 + look.phase * 3,
    nextBlink: 1 + look.phase * 3,
    arms: { lx: -1.15, lz: -0.35, rx: -1.15, rz: 0.35 },
    armsW: 0,
  })

  /** 불턱 소품: 손 위치(팔 각도)에 맞춰 보이기·움직이기 */
  const updateProps = (pose: HaenyeoPose, t: number) => {
    const prep = pose.state === 'sit' && pose.act === 'prep' ? pose.actItem : null
    const tang = pose.state === 'sit' && pose.act === 'tangerine'
    const st = pose.actTime
    const before = st < CONFIG.prepToss
    const lH = handPos(0.185, armL.current.rotation.x, armL.current.rotation.z, handTmp)
    const rH = handPos(-0.185, armR.current.rotation.x, armR.current.rotation.z, handTmp2)

    // 무릎 위·손에 든 해산물
    const showLap =
      before && ((prep === 'conch' && st < 1.9) || (prep === 'abalone') || (prep === 'urchin' && st < 0.6))
    lapItem.current.visible = !!showLap
    if (showLap && prep) {
      for (const key of Object.keys(lapMeshes.current) as ItemType[]) {
        const m = lapMeshes.current[key]
        if (m) m.visible = key === prep
      }
      if (prep === 'abalone' && st >= 1.3) {
        // 떼어낸 껍데기를 두 손으로 들고 빙글
        lapItem.current.position.set((lH.x + rH.x) / 2, (lH.y + rH.y) / 2 + 0.05, (lH.z + rH.z) / 2 + 0.02)
        lapItem.current.rotation.set(-0.9, t * 2.5, 0)
      } else if (prep === 'urchin') {
        lapItem.current.position.set((lH.x + rH.x) / 2, (lH.y + rH.y) / 2 - 0.02, (lH.z + rH.z) / 2 + 0.03)
        lapItem.current.rotation.set(0, 0, 0)
      } else {
        lapItem.current.position.set(lH.x - 0.06, lH.y - 0.03, lH.z + 0.04)
        lapItem.current.rotation.set(prep === 'abalone' ? 0.2 : 0, 0, 0)
      }
    }

    // 소라 두드리는 돌
    stone.current.visible = prep === 'conch' && st < 1.9
    if (stone.current.visible) stone.current.position.set(rH.x + 0.02, rH.y - 0.01, rH.z + 0.02)
    // 소라 속살
    meat.current.visible = prep === 'conch' && st >= 1.9 && before
    if (meat.current.visible) {
      meat.current.position.set((lH.x + rH.x) / 2, (lH.y + rH.y) / 2 + 0.04, (lH.z + rH.z) / 2 + 0.02)
      meat.current.rotation.set(0, t * 1.5, Math.sin(t * 6) * 0.2)
    }

    // 빗창
    knife.current.visible = prep === 'abalone' && st < 1.3
    if (knife.current.visible) {
      knife.current.position.set(rH.x, rH.y, rH.z)
      knife.current.rotation.set(1.25, 0, -0.9)
    }
    // 반짝
    sparkle.current.visible = prep === 'abalone' && st > 1.4 && before
    if (sparkle.current.visible) {
      const sp = ((st - 1.4) * 2.4) % 1
      sparkle.current.position.set((lH.x + rH.x) / 2 + 0.07, (lH.y + rH.y) / 2 + 0.11, (lH.z + rH.z) / 2 + 0.05)
      sparkle.current.scale.setScalar(hump(sp) * 1.3)
      sparkle.current.rotation.set(0, t * 4, 0.4)
    }

    // 성게: 반으로 가른 두 쪽 + 숟가락
    const halves = prep === 'urchin' && st >= 0.6 && before
    halfA.current.visible = halves
    halfB.current.visible = halves
    if (halves) {
      const apart = smoothstep(0.6, 0.75, st)
      halfA.current.position.set(lH.x - 0.02, lH.y - 0.02, lH.z + 0.04)
      halfA.current.rotation.set(-0.25 * apart, 0, 0.3 * apart)
      // 다른 반쪽은 무릎 위에
      halfB.current.position.set(-0.05, -0.17, 0.3)
      halfB.current.rotation.set(-0.15, 0, -0.2)
    }
    spoon.current.visible = prep === 'urchin' && st >= 0.65 && before
    if (spoon.current.visible) {
      spoon.current.position.set(rH.x, rH.y, rH.z)
      spoon.current.rotation.set(st < 1.6 ? 1.0 : 2.1, 0, st < 1.6 ? -0.6 : -1.1)
      // 숟가락 위 성게 알은 맛보기 전까지
      spoon.current.children[1].visible = st > 0.9 && st < 2.1
    }

    // 귤
    tangerine.current.visible = tang && st < 3.4
    if (tangerine.current.visible) {
      const peeled = st >= 1.5
      tangerine.current.material = peeled ? TOOL_MAT.tangerinePeeled : TOOL_MAT.tangerine
      const at = peeled ? lH : handTmp.set((lH.x + rH.x) / 2, (lH.y + rH.y) / 2, (lH.z + rH.z) / 2)
      tangerine.current.position.set(at.x - (peeled ? 0.03 : 0), at.y + 0.01, at.z + 0.04)
      tangerine.current.scale.setScalar(peeled ? 1 - 0.55 * smoothstep(1.5, 3.4, st) : 1)
      tangerine.current.rotation.y = peeled ? 0 : Math.sin(st * 13) * 0.4
    }
    segment.current.visible = tang && st > 1.6 && st < 3.4 && ((st - 1.5) % 0.75) / 0.75 < 0.5
    if (segment.current.visible) segment.current.position.set(rH.x, rH.y + 0.02, rH.z + 0.02)
  }
  useFrame(({ clock, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime + look.phase * 7
    const a = anim.current

    // ── 상태 전환 감지 ──
    if (pose.state !== a.prevState) {
      if (a.prevState === 'ascending') a.popT = 0 // 수면 위로 퐁
      if (a.prevState === 'harvesting') a.happyT = 0.7
      a.prevState = pose.state
      a.gesture = null
    }
    if (a.popT >= 0) a.popT = a.popT > 0.7 ? -1 : a.popT + dt
    a.happyT = Math.max(0, a.happyT - dt)

    // 대기 몸짓 스케줄
    if (pose.state === 'surfaceIdle' || (pose.state === 'sit' && !pose.act) || pose.state === 'stand') {
      if (a.gesture) {
        a.gestureT += dt
        if (a.gestureT > 1.6) a.gesture = null
      } else if (pose.stateTime > 1.5 && t > a.nextGesture) {
        const all: Gesture[] = ['tilt', 'look', 'hug']
        a.gesture = all[Math.floor(Math.random() * all.length)]
        a.gestureT = 0
        a.nextGesture = t + 3.5 + Math.random() * 4
      }
    }

    const { tg, face, arms } = computeTarget(pose, a, t)
    const k = damp(8, dt)
    const lerpKeys: (keyof Target)[] = [
      'roll', 'headTilt', 'headYaw', 'headRoll', 'armX', 'armZ', 'kickAmp', 'kickFreq', 'frog', 'stretch', 'sit',
    ]
    for (const key of lerpKeys) a[key] += (tg[key] - a[key]) * k
    // 입수 회전은 빠르게, 하강 → 엎드림 전환은 천천히 부드럽게
    const pitchRate = pose.state === 'entering' ? 9 : pose.state === 'underIdle' || pose.state === 'underSwim' ? 3.2 : 5
    a.pitch += (tg.pitch - a.pitch) * damp(pitchRate, dt)
    a.goggles += (tg.goggles - a.goggles) * damp(9, dt)
    a.cheeks += (tg.cheeks - a.cheeks) * damp(10, dt)
    a.kickPhase += dt * a.kickFreq * (0.6 + pose.move * 0.6)
    // 양팔 따로: 목표 각도로 빠르게, 끝나면 평소 자세로 부드럽게 돌아옴
    if (arms) {
      const ka = damp(14, dt)
      a.arms.lx += (arms.lx - a.arms.lx) * ka
      a.arms.lz += (arms.lz - a.arms.lz) * ka
      a.arms.rx += (arms.rx - a.arms.rx) * ka
      a.arms.rz += (arms.rz - a.arms.rz) * ka
    }
    a.armsW += ((arms ? 1 : 0) - a.armsW) * damp(arms ? 12 : 6, dt)

    // ── 몸 전체: 퐁 튀어오름 + 늘어남/눌림 ──
    let popY = 0
    let stretch = a.stretch
    if (a.popT >= 0) {
      const p = a.popT
      popY = 0.22 * hump(Math.min(1, p / 0.45))
      if (p < 0.22) stretch = 1.14 - 0.14 * (p / 0.22)
      else stretch = 1 - 0.18 * hump((p - 0.22) / 0.42)
    }
    // 꾸미기 반응: 살짝 웅크렸다 콩 뛰기
    const cheer = pose.cheerTime
    if (cheer >= 0) {
      if (cheer < 0.12) stretch *= 1 - 0.12 * hump(cheer / 0.12)
      else if (cheer < 0.46) {
        popY += 0.11 * hump((cheer - 0.12) / 0.34)
        stretch *= 1 + 0.07 * hump((cheer - 0.12) / 0.34)
      }
    }
    // 만세: 콩콩 뛰기
    if (pose.celebrateTime >= 0) {
      const ct = pose.celebrateTime
      const w = smoothstep(0, 0.15, ct) * (1 - smoothstep(CONFIG.celebrateDuration - 0.3, CONFIG.celebrateDuration, ct))
      popY += 0.13 * Math.abs(Math.sin(ct * Math.PI * 2.4)) * w
    }
    // 전복을 "뽁" 떼어낸 순간 살짝 들썩
    if (pose.act === 'prep' && pose.actItem === 'abalone') popY += 0.04 * hump((pose.actTime - 1.3) / 0.25)
    // 털썩 앉기: 닿는 순간 납작 눌렸다가 살짝 되튐
    if (pose.state === 'settle') {
      const u = pose.stateTime - WALK.land
      if (u < 0) stretch *= 1 + 0.05 * hump(pose.stateTime / WALK.land)
      else stretch *= 1 - 0.2 * hump(Math.min(1, u / 0.2)) + 0.06 * hump((u - 0.16) / 0.14)
    }
    // 걸음마다 통통
    if (pose.state === 'walk') popY += Math.abs(Math.sin(a.kickPhase * Math.PI * 2)) * 0.03 * pose.move
    // "앗": 움찔
    if (pose.oopsTime >= 0) {
      const o = Math.min(1, pose.oopsTime / 0.3)
      popY += 0.04 * hump(o)
      stretch *= 1 + 0.05 * hump(o)
    }
    pop.current.position.y = popY + (LAND_STATES.has(pose.state) ? 0 : Math.sin(t * 2.2) * 0.012)
    const side = 1 / Math.sqrt(stretch)
    squash.current.scale.set(side, stretch, side)

    body.current.rotation.set(a.pitch, 0, a.roll)
    head.current.rotation.set(a.headTilt, a.headYaw, a.headRoll)

    // 물안경: 이마 위 ↔ 눈 위
    goggles.current.rotation.x = -0.8 * (1 - a.goggles)

    // ── 팔 ──
    armL.current.rotation.set(a.armX, 0, a.armZ)
    armR.current.rotation.set(a.armX, 0, -a.armZ)
    if (a.armsW > 0.001) {
      const w = a.armsW
      armL.current.rotation.x += (a.arms.lx - armL.current.rotation.x) * w
      armL.current.rotation.z += (a.arms.lz - armL.current.rotation.z) * w
      armR.current.rotation.x += (a.arms.rx - armR.current.rotation.x) * w
      armR.current.rotation.z += (a.arms.rz - armR.current.rotation.z) * w
    }
    if (pose.waveTime >= 0) {
      // 짧은 팔로 파닥파닥
      const w = smoothstep(0, 0.18, pose.waveTime) * (1 - smoothstep(CONFIG.waveDuration - 0.25, CONFIG.waveDuration, pose.waveTime))
      const flap = Math.sin(pose.waveTime * 22) * 0.45
      armR.current.rotation.x = armR.current.rotation.x * (1 - w) - 0.25 * w
      armR.current.rotation.z = armR.current.rotation.z * (1 - w) + (-2.45 + flap) * w
      body.current.rotation.z += Math.sin(pose.waveTime * 11) * 0.05 * w
    }

    if (cheer >= 0) {
      // 두 팔 번쩍 + 살랑살랑
      const w = smoothstep(0, 0.1, cheer) * (1 - smoothstep(CHEER_DURATION - 0.22, CHEER_DURATION, cheer))
      const wig = Math.sin(cheer * 26) * 0.18
      armL.current.rotation.x = armL.current.rotation.x * (1 - w) - 0.2 * w
      armR.current.rotation.x = armR.current.rotation.x * (1 - w) - 0.2 * w
      armL.current.rotation.z = armL.current.rotation.z * (1 - w) + (2.2 + wig) * w
      armR.current.rotation.z = armR.current.rotation.z * (1 - w) - (2.2 - wig) * w
      head.current.rotation.z += Math.sin(cheer * 13) * 0.08 * w
    }

    // ── 다리: 파닥파닥 ↔ 개구리헤엄 ──
    const ph = a.kickPhase * Math.PI * 2
    const flutter = Math.sin(ph) * a.kickAmp * (1 - a.frog)
    const s = (Math.sin(ph) + 1) / 2
    const frogZ = (0.15 + 0.55 * s) * a.frog * a.kickAmp
    const frogX = (0.55 * s - 0.15) * a.frog * a.kickAmp
    // 앉으면 다리를 앞으로 쭉 (살짝 벌려서)
    const sitK = a.sit
    legL.current.rotation.set((flutter + frogX) * (1 - sitK) - 1.45 * sitK, 0, frogZ + 0.14 * sitK)
    legR.current.rotation.set((-flutter + frogX) * (1 - sitK) - 1.45 * sitK, 0, -frogZ - 0.14 * sitK)

    // ── 얼굴 ──
    if (t > a.nextBlink + 0.13) a.nextBlink = t + 2 + Math.random() * 3
    const blinking = t > a.nextBlink
    for (const key of Object.keys(eyeSets.current) as Eyes[]) {
      const g = eyeSets.current[key]
      if (!g) continue
      g.visible = key === face.eyes
      if (g.visible && (key === 'dot' || key === 'round')) g.scale.y = blinking ? 0.12 : 1
    }
    for (const key of Object.keys(mouths.current) as Mouth[]) {
      const m = mouths.current[key]
      if (m) m.visible = key === face.mouth
    }
    const puff = 1 + a.cheeks * 0.85
    cheekL.current.scale.set(puff, 0.62 * puff, 0.32 * puff)
    cheekR.current.scale.set(puff, 0.62 * puff, 0.32 * puff)
    sweat.current.visible = face.sweat
    if (face.sweat) sweat.current.position.y = 0.06 - ((t * 0.12) % 0.06)

    // ── 손에 든 해산물 ──
    const st = pose.stateTime
    const showing = pose.state === 'harvesting' && pose.heldItem && st > CONFIG.harvestReach
    held.current.visible = !!showing
    if (showing) {
      const tuck = smoothstep(CONFIG.harvestShowEnd, CONFIG.harvestDuration, st)
      const rise = ease(Math.min(1, (st - CONFIG.harvestReach) / 0.25))
      held.current.position.set(0.12 * tuck, 0.0 + 0.1 * rise - 0.25 * tuck, 0.3 + 0.08 * rise - 0.15 * tuck)
      held.current.scale.setScalar(0.85 * (1 - tuck * 0.7))
      held.current.rotation.y = st * 2
      for (const key of Object.keys(heldMeshes.current) as ItemType[]) {
        const m = heldMeshes.current[key]
        if (m) m.visible = key === pose.heldItem
      }
    }

    updateProps(pose, t)

    // ── 졸 때 Z Z Z (카메라를 향해 떠오름) ──
    const dozing = pose.state === 'sit' && pose.act === 'doze'
    zzz.current.visible = dozing
    if (dozing) {
      zzz.current.parent!.getWorldQuaternion(qParent).invert()
      zzz.current.quaternion.copy(qParent).multiply(camera.quaternion)
      zs.current.forEach((m, i) => {
        if (!m) return
        const c = ((t * 0.42 + i / 3) % 1 + 1) % 1
        m.position.set(0.05 + c * 0.16, c * 0.38, 0)
        m.scale.setScalar((0.55 + c * 0.7) * hump(Math.min(1, c * 1.15)))
        m.rotation.z = Math.sin(t * 2 + i) * 0.15
      })
    }
  })



  const ez = headSurfaceZ(EYE_X, EYE_Y)
  const cz = headSurfaceZ(CHEEK_X, CHEEK_Y) - 0.012
  const mz = headSurfaceZ(0, MOUTH_Y)

  /** 눈 한 쌍 (표정마다 한 세트, 하나만 보임) */
  const eyePair = (kind: Eyes) => (
    <group
      key={kind}
      ref={(g) => {
        eyeSets.current[kind] = g
      }}
      position={[0, EYE_Y, 0]}
      visible={kind === 'dot'}
    >
      {[EYE_X, -EYE_X].map((x) => (
        <mesh
          key={x}
          geometry={kind === 'happy' ? GEO.eyeHappy : kind === 'line' ? GEO.eyeLine : GEO.eyeDot}
          material={MAT.eye}
          position={[x, kind === 'happy' ? -0.012 : 0, ez - 0.004]}
          rotation={[0, x * 1.2, 0]}
          scale={kind === 'round' ? [1.3, 1.3, 0.55] : kind === 'dot' ? [1, 1.05, 0.5] : 1}
        />
      ))}
    </group>
  )

  return (
    <group scale={look.height}>
      <group ref={pop}>
        <group ref={squash}>
          <group ref={body}>
            {/* 몸통: 통통한 종 모양 잠수복 */}
            <mesh geometry={GEO.body} material={MAT.suit} castShadow />
            <mesh geometry={GEO.collar} material={MAT.suitTrim} position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]} />

            {/* 머리 */}
            <group ref={head} position={[0, HEAD_Y, 0]}>
              <mesh geometry={GEO.head} material={MAT.skin} castShadow />
              <mesh geometry={GEO.towel} material={look.towel} />
              <mesh
                geometry={GEO.towelRim}
                material={look.towel}
                position={[0, HEAD_R * HEAD_SCALE[1] * Math.cos(1.08), 0]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={[HEAD_SCALE[0], HEAD_SCALE[2], 1]}
              />
              <mesh geometry={GEO.knot} material={look.towel} position={[0, 0.17, -0.27]} scale={[1.25, 0.8, 0.85]} />

              {/* 얼굴: 눈은 얼굴 아래쪽에 작게 */}
              {(['dot', 'round', 'happy', 'line'] as Eyes[]).map(eyePair)}
              <mesh ref={cheekL} geometry={GEO.cheek} material={look.cheek} position={[CHEEK_X, CHEEK_Y, cz]} rotation={[0, 0.6, 0]} />
              <mesh ref={cheekR} geometry={GEO.cheek} material={look.cheek} position={[-CHEEK_X, CHEEK_Y, cz]} rotation={[0, -0.6, 0]} />
              <mesh
                ref={(m) => {
                  mouths.current.dot = m
                }}
                geometry={GEO.mouthDot}
                material={MAT.mouth}
                position={[0, MOUTH_Y, mz]}
                scale={[1.2, 0.8, 0.5]}
              />
              <mesh
                ref={(m) => {
                  mouths.current.o = m
                }}
                geometry={GEO.mouthO}
                material={MAT.mouth}
                position={[0, MOUTH_Y - 0.01, mz]}
                visible={false}
              />
              <mesh
                ref={(m) => {
                  mouths.current.smile = m
                }}
                geometry={GEO.mouthSmile}
                material={MAT.mouth}
                position={[0, MOUTH_Y + 0.008, mz]}
                visible={false}
              />
              <mesh ref={sweat} geometry={GEO.sweat} material={MAT.sweat} position={[-0.31, 0.06, 0.15]} visible={false} />

              {/* 물안경 (머리 중심 기준으로 회전해 이마 ↔ 눈) */}
              <group ref={goggles}>
                {[EYE_X, -EYE_X].map((x) => (
                  <group key={x} position={[x, EYE_Y, ez + 0.012]} rotation={[0, x * 2.4, 0]}>
                    <mesh geometry={GEO.goggleRim} material={MAT.goggleFrame} />
                    <mesh geometry={GEO.goggleGlass} material={MAT.goggleGlass} position={[0, 0, 0.004]} />
                  </group>
                ))}
                <mesh geometry={GEO.goggleBridge} material={MAT.goggleFrame} position={[0, EYE_Y + 0.01, ez + 0.02]} />
              </group>
            </group>

            {/* 팔 (어깨 피벗) — 짧고 끝이 둥글게 */}
            {(
              [
                [armL, 0.185],
                [armR, -0.185],
              ] as const
            ).map(([ref, x]) => (
              <group key={x} ref={ref} position={[x, 0.05, 0]}>
                <mesh geometry={GEO.arm} material={MAT.suit} position={[0, -0.09, 0]} />
                <mesh geometry={GEO.hand} material={MAT.skin} position={[0, -0.18, 0]} />
              </group>
            ))}

            {/* 들어 보이는 해산물 */}
            <group ref={held} visible={false}>
              {(['conch', 'abalone', 'urchin'] as ItemType[]).map((it) => (
                <mesh
                  key={it}
                  ref={(m) => {
                    heldMeshes.current[it] = m
                  }}
                  geometry={SEAFOOD_GEOMETRY[it]}
                  material={SEAFOOD_MATERIAL[it]}
                />
              ))}
            </group>

            {/* 불턱 소품: 무릎 위 해산물, 돌, 빗창, 숟가락, 속살, 성게 반쪽, 귤 */}
            <group ref={lapItem} visible={false}>
              {(['conch', 'abalone', 'urchin'] as ItemType[]).map((it) => (
                <mesh
                  key={it}
                  ref={(m) => {
                    lapMeshes.current[it] = m
                  }}
                  geometry={SEAFOOD_GEOMETRY[it]}
                  material={SEAFOOD_MATERIAL[it]}
                  scale={0.42}
                />
              ))}
            </group>
            <mesh ref={stone} geometry={TOOL_GEO.stone} material={TOOL_MAT.stone} visible={false} />
            <mesh ref={knife} geometry={TOOL_GEO.knife} material={TOOL_MAT.knife} visible={false} />
            <group ref={spoon} visible={false}>
              <mesh geometry={TOOL_GEO.spoon} material={TOOL_MAT.spoon} />
              <mesh geometry={TOOL_GEO.roe} material={TOOL_MAT.roe} position={[0, 0.13, 0]} scale={0.32} />
            </group>
            <mesh ref={meat} geometry={TOOL_GEO.meat} material={TOOL_MAT.meat} visible={false} />
            <group ref={halfA} visible={false}>
              <mesh geometry={TOOL_GEO.urchinHalf} material={TOOL_MAT.urchinHalf} />
              <mesh geometry={TOOL_GEO.roe} material={TOOL_MAT.roe} position={[0, -0.012, 0]} />
            </group>
            <group ref={halfB} visible={false}>
              <mesh geometry={TOOL_GEO.urchinHalf} material={TOOL_MAT.urchinHalf} />
              <mesh geometry={TOOL_GEO.roe} material={TOOL_MAT.roe} position={[0, -0.012, 0]} />
            </group>
            <mesh ref={sparkle} geometry={TOOL_GEO.sparkle} material={TOOL_MAT.sparkle} visible={false} />
            <mesh ref={tangerine} geometry={TOOL_GEO.tangerine} material={TOOL_MAT.tangerine} visible={false} />
            <mesh ref={segment} geometry={TOOL_GEO.meat} material={TOOL_MAT.tangerinePeeled} scale={0.45} visible={false} />

            {/* 다리 + 둥근 오리발 */}
            {(
              [
                [legL, 0.09],
                [legR, -0.09],
              ] as const
            ).map(([ref, x]) => (
              <group key={x} ref={ref} position={[x, -0.25, 0]}>
                <mesh geometry={GEO.leg} material={MAT.suit} position={[0, -0.05, 0]} />
                <mesh geometry={GEO.fin} material={MAT.fin} position={[0, -0.12, 0]} />
              </group>
            ))}
          </group>
        </group>
      </group>
      {/* 졸 때 머리 위 Z Z Z */}
      <group ref={zzz} position={[0.12, 0.88, 0]} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              zs.current[i] = m
            }}
            geometry={TOOL_GEO.z}
            material={TOOL_MAT.z}
          />
        ))}
      </group>
    </group>
  )
}
