import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group } from 'three'
import { useBubbles } from '../store/bubbleStore'

const world = new Vector3()

/**
 * 머리 위 닉네임 알약 + 행동 말풍선. 내 것에는 "나" 배지.
 * 거리에 따라 크기를 줄이되, 멀어도 읽을 수 있고 가까워도 화면을 덮지 않게 0.85~1.15배로 제한.
 */
export function NameTag({ nick, self = false }: { nick: string; self?: boolean }) {
  const bubble = useBubbles((s) => (self ? s.self : null))
  const anchor = useRef<Group>(null!)
  const box = useRef<HTMLDivElement>(null)

  useFrame(({ camera }) => {
    if (!box.current) return
    anchor.current.getWorldPosition(world)
    const s = Math.min(1.15, Math.max(0.85, 6 / Math.max(0.1, camera.position.distanceTo(world))))
    box.current.style.transform = `translateY(-50%) scale(${s.toFixed(3)})`
  })

  return (
    <group ref={anchor} position={[0, 0.98, 0]}>
      <Html center zIndexRange={[10, 0]} pointerEvents="none">
        <div ref={box} className="tag-stack">
          {bubble && (
            <div key={bubble.id} className="speech">
              {bubble.text}
            </div>
          )}
          <div className={self ? 'nametag self' : 'nametag'}>
            {self && <span className="me">나</span>}
            {nick}
          </div>
        </div>
      </Html>
    </group>
  )
}
