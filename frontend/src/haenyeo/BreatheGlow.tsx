import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, CanvasTexture, SpriteMaterial, type Sprite } from 'three'
import { CONFIG } from '../config'
import { damp } from '../lib/math'
import { breatheAmount, type HaenyeoPose } from './types'

// 숨 고르는 다른 해녀 둘레의 은은한 빛 (숨에 맞춰 커졌다 작아짐)

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,246,220,0.9)')
  grad.addColorStop(0.35, 'rgba(255,236,196,0.45)')
  grad.addColorStop(1, 'rgba(255,230,190,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

let texture: CanvasTexture | null = null

export function BreatheGlow({ pose }: { pose: HaenyeoPose }) {
  const sprite = useRef<Sprite>(null!)
  const mat = useMemo(() => {
    texture ??= glowTexture()
    return new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 })
  }, [])
  const level = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const on = pose.breatheTime >= 0
    level.current += ((on ? 1 : 0) - level.current) * damp(1.5, dt)
    const m = mat
    const amt = on ? breatheAmount(pose.breatheTime, CONFIG.breatheIn, CONFIG.breatheOut) : 0
    m.opacity = level.current * (0.4 + 0.3 * amt)
    sprite.current.visible = level.current > 0.01
    sprite.current.scale.setScalar(1.9 + 0.7 * amt)
  })

  return <sprite ref={sprite} material={mat} position={[0, 0.3, 0]} visible={false} renderOrder={2} />
}
