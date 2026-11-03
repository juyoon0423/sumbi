import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { NeutralToneMapping } from 'three'
import { debugOn } from '../lib/debug'
import { QUALITY, useQuality } from '../lib/quality'
import { Effects, FrameGuard } from '../world/Effects'
import { JournalCamera } from '../journal/JournalCamera'
import { FollowCamera } from '../player/FollowCamera'
import { LocalPlayer } from '../player/LocalPlayer'
import { RemotePlayers } from '../world/remote/RemotePlayers'
import { useGame } from '../store/gameStore'
import { DebugOverlay } from '../ui/DebugOverlay'
import { Hud } from '../ui/Hud'
import { SeaScene } from '../world/sea/SeaScene'
import { EntryScreen } from './EntryScreen'

export function GameScreen() {
  const phase = useGame((s) => s.phase)
  const quality = useQuality((s) => s.level)
  return (
    <div className="game">
      <Canvas
        shadows
        dpr={[1, QUALITY[quality].dpr]}
        camera={{ fov: 50, near: 0.1, far: 6000, position: [8, 3.2, 16] }}
        gl={{ antialias: true, toneMapping: NeutralToneMapping }}
      >
        <Suspense fallback={null}>
          <SeaScene />
          <LocalPlayer />
          <RemotePlayers />
          <FollowCamera />
          <JournalCamera />
          <Effects />
          <FrameGuard />
        </Suspense>
      </Canvas>
      {phase === 'entry' ? <EntryScreen /> : <Hud />}
      {debugOn && <DebugOverlay />}
    </div>
  )
}
