import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { JournalCamera } from '../journal/JournalCamera'
import { FollowCamera } from '../player/FollowCamera'
import { LocalPlayer } from '../player/LocalPlayer'
import { RemotePlayers } from '../world/remote/RemotePlayers'
import { useGame } from '../store/gameStore'
import { Hud } from '../ui/Hud'
import { SeaScene } from '../world/sea/SeaScene'
import { EntryScreen } from './EntryScreen'

export function GameScreen() {
  const phase = useGame((s) => s.phase)
  return (
    <div className="game">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 50, near: 0.1, far: 6000, position: [8, 3.2, 16] }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <SeaScene />
          <LocalPlayer />
          <RemotePlayers />
          <FollowCamera />
          <JournalCamera />
        </Suspense>
      </Canvas>
      {phase === 'entry' ? <EntryScreen /> : <Hud />}
    </div>
  )
}
