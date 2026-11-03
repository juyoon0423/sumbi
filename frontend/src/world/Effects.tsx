import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useRef } from 'react'
import { QUALITY, useQuality } from '../lib/quality'

// 화면 마무리: 톤 매핑 + 은은한 빛 번짐(블룸). 아주 밝은 것(해·달·반짝임·모닥불)만 번지고 캐릭터는 번지지 않게 문턱을 높게.
// 톤 매핑은 중립(Khronos PBR Neutral): 중간 밝기까지는 색을 그대로 두고 아주 밝은 부분만 부드럽게 눌러서
// 하늘·노을 색이 탁해지지 않음 (ACES 는 하늘을 회색빛으로 바꿈). 품질 '낮음'에선 블룸 없이 렌더러가 같은 톤 매핑.

export function Effects() {
  const level = useQuality((s) => s.level)
  const q = QUALITY[level]
  if (!q.bloom) return null
  return (
    <EffectComposer multisampling={level === 'high' ? 4 : 0}>
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={0.55} radius={0.62} resolutionScale={q.bloomScale} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}

/**
 * 프레임 지킴이: 처음 몇 초가 지난 뒤 4초마다 평균 프레임을 재서, 계속 낮으면 품질을 한 단계 낮춤.
 * 탭이 가려져 있던 구간은 세지 않음.
 */
export function FrameGuard() {
  const acc = useRef({ t: 0, n: 0, warm: 0, low: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    if (document.hidden || dt > 0.5) return
    if (a.warm < 6) {
      a.warm += dt
      return
    }
    a.t += dt
    a.n++
    if (a.t < 4) return
    const fps = a.n / a.t
    a.t = 0
    a.n = 0
    a.low = fps < 40 ? a.low + 1 : 0
    if (a.low >= 2 && useQuality.getState().lower()) {
      console.info(`[sumbi] 프레임이 낮아(${fps.toFixed(0)}fps) 그래픽 품질을 ${useQuality.getState().level} 로 낮춤`)
      a.low = 0
      a.warm = 3
    }
  })
  return null
}
