import { Html } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Vector3, type Group } from 'three'
import { CONFIG } from '../config'
import { Haenyeo } from '../haenyeo/Haenyeo'
import { lookFromNick } from '../haenyeo/look'
import { Tewak } from '../haenyeo/Tewak'
import { createPose, UNDERWATER_STATES, type HaenyeoPose, type HaenyeoState } from '../haenyeo/types'

// 개발용: 해녀의 동작·표정·외형 차이를 나란히 보는 페이지 (/dev/character)
// ?solo=<id> 를 붙이면 하나만 크게 (캡처용)

interface Slot {
  id: string
  label: string
  nick: string
  loop: number
  /** 몸 방향 (물속 동작은 옆모습이 잘 보이게) */
  rotY?: number
  drive: (pose: HaenyeoPose, lt: number) => void
}

/** 상태와 그 상태에 머문 시간을 직접 지정 */
function at(pose: HaenyeoPose, state: HaenyeoState, stateTime: number) {
  pose.state = state
  pose.stateTime = stateTime
}

const SLOTS: Slot[] = [
  // 1줄: 동작
  { id: 'idle', label: '대기 (몸짓)', nick: '느린 파도', loop: 1e9, drive: (p, t) => at(p, 'surfaceIdle', t) },
  { id: 'swim', label: '헤엄', nick: '작은 소라', loop: 1e9, drive: (p, t) => { at(p, 'surfaceSwim', t); p.move = 1 } },
  {
    id: 'dive', label: '잠수 (웅크림 → 쏙 → 하강 → 엎드림)', nick: '고요한 물결', loop: 4.2, rotY: 1.4,
    drive: (p, t) =>
      t < 0.8 ? at(p, 'surfaceIdle', t + 5)
      : t < 1.5 ? at(p, 'entering', t - 0.8)
      : t < 2.9 ? at(p, 'descending', t - 1.5)
      : at(p, 'underIdle', t - 2.9),
  },
  { id: 'under', label: '물속 개구리헤엄', nick: '따뜻한 돌담', loop: 1e9, rotY: 1.1, drive: (p, t) => { at(p, 'underSwim', t); p.move = 1 } },
  {
    id: 'pop', label: '상승 → 퐁', nick: '맑은 등대', loop: 2.4,
    drive: (p, t) => (t < 1 ? at(p, 'ascending', t) : at(p, 'surfaceIdle', t - 1)),
  },
  // 2줄: 표정
  {
    id: 'sumbi', label: '숨비소리 → 후련', nick: '포근한 윤슬', loop: 3.2,
    drive: (p, t) => (t < CONFIG.sumbiDuration ? at(p, 'sumbi', t) : at(p, 'surfaceIdle', t)),
  },
  {
    id: 'harvest', label: '채집 성공', nick: '수줍은 해초', loop: 2.4, rotY: 0.5,
    drive: (p, t) => {
      p.heldItem = 'abalone'
      if (t < CONFIG.harvestDuration) at(p, 'harvesting', t)
      else at(p, 'underIdle', t)
    },
  },
  {
    id: 'wave', label: '인사 (파닥파닥)', nick: '둥근 조약돌', loop: 2.2,
    drive: (p, t) => {
      at(p, 'surfaceIdle', 0.5)
      p.waveTime = t < CONFIG.waveDuration ? t : -1
    },
  },
  {
    id: 'low', label: '숨 부족 (땀)', nick: '졸린 갈매기', loop: 1e9, rotY: 0.7,
    drive: (p, t) => { at(p, 'underIdle', t); p.breath = 0.1 },
  },
  { id: 'blink', label: '대기 (눈 깜빡임)', nick: '말랑한 물거품', loop: 1e9, drive: (p) => at(p, 'surfaceIdle', 0.5) },
  // 3줄: 닉네임마다 다른 물수건·테왁·키
  ...['반짝이는 노을', '잔잔한 테왁', '푸른 현무암', '부드러운 바닷바람', '조용한 등대'].map(
    (nick): Slot => ({ id: `look-${nick}`, label: nick, nick, loop: 1e9, drive: (p, t) => at(p, 'surfaceIdle', t) }),
  ),
]

/** ?t=초 : 루프 시간을 그 순간에 고정 (캡처용) */
const FIXED_T = (() => {
  const v = new URLSearchParams(location.search).get('t')
  return v === null ? null : Number(v)
})()

function LabCharacter({ slot, position }: { slot: Slot; position: [number, number, number] }) {
  const pose = useMemo(createPose, [])
  const look = useMemo(() => lookFromNick(slot.nick), [slot.nick])
  const tewak = useMemo(() => ({ pos: new Vector3() }), [])
  const tewakGroup = useRef<Group>(null!)
  const start = useRef(-1)
  // drei Html 은 자기 React 루트를 만든다. Canvas 가 처음 그려지는 중에 만들면 StrictMode 의
  // 가짜 해제가 "렌더 중 루트 해제" 경고를 내므로, 첫 프레임이 지난 뒤에 붙인다.
  const [labelReady, setLabelReady] = useState(false)

  useFrame(({ clock }) => {
    if (!labelReady) setLabelReady(true)
    if (start.current < 0) start.current = clock.elapsedTime
    const lt = FIXED_T ?? (clock.elapsedTime - start.current) % slot.loop
    slot.drive(pose, lt)
    // 수면 위 동작일 때만 테왁을 품에 안고 있음
    tewakGroup.current.visible = !UNDERWATER_STATES.has(pose.state)
    tewak.pos.set(position[0], position[1] - 0.06, position[2] + 0.42)
  })

  return (
    <>
      <group position={position}>
        <group rotation={[0, slot.rotY ?? 0, 0]}>
          <Haenyeo pose={pose} look={look} />
        </group>
        {labelReady && (
          <Html position={[0, -0.7, 0]} center pointerEvents="none">
            <div className="lab-label">{slot.label}</div>
          </Html>
        )}
      </group>
      <group ref={tewakGroup}>
        <Tewak state={tewak} material={look.tewak} />
      </group>
    </>
  )
}

export function CharacterLab() {
  const solo = new URLSearchParams(location.search).get('solo')
  const slots = solo ? SLOTS.filter((s) => s.id === solo) : SLOTS
  const cols = 5
  return (
    <div className="lab">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={solo ? { fov: 28, position: [0, 0.55, 3.0] } : { fov: 32, position: [0, 1.45, 8.6] }}
        onCreated={({ camera }) => camera.lookAt(0, solo ? 0.3 : 1.3, 0)}
      >
        <color attach="background" args={['#cfe7ee']} />
        <hemisphereLight args={['#e4f3ff', '#d8c49e', 1.4]} />
        <ambientLight intensity={0.3} color="#fff4e6" />
        <directionalLight
          position={[-3, 6, 5]}
          color="#ffe2bd"
          intensity={2.0}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-radius={6}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        {slots.map((slot, i) => {
          const row = Math.floor(i / cols)
          const col = i % cols
          const pos: [number, number, number] = solo ? [0, 0, 0] : [(col - 2) * 1.4, 2.6 - row * 1.35, 0]
          return <LabCharacter key={slot.id} slot={slot} position={pos} />
        })}
      </Canvas>
      {!solo && <div className="lab-title">해녀 캐릭터 랩 · 동작 / 표정 / 닉네임별 외형</div>}
    </div>
  )
}
