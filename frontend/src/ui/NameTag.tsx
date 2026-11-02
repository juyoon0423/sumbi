import { Html } from '@react-three/drei'
import { useBubbles } from '../store/bubbleStore'

/** 머리 위 닉네임 알약 + 행동 말풍선. 내 것에는 "나" 배지 */
export function NameTag({ nick, self = false }: { nick: string; self?: boolean }) {
  const bubble = useBubbles((s) => (self ? s.self : null))
  return (
    <Html position={[0, 0.98, 0]} center distanceFactor={7} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="tag-stack">
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
  )
}
