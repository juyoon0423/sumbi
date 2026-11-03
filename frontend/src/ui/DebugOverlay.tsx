import { useEffect, useState } from 'react'
import { QUALITY, useQuality } from '../lib/quality'

// 개발용 표시: 화면 오른쪽 가장자리에 fps·품질 단계. 개발 서버에서 ?debug=1 일 때만 (배포 빌드엔 아예 안 들어감).

interface Stat {
  fps: number
  /** 지난 1초에서 가장 길었던 프레임 (ms) */
  worst: number
}

export function DebugOverlay() {
  const level = useQuality((s) => s.level)
  const locked = useQuality((s) => s.locked)
  const [stat, setStat] = useState<Stat>({ fps: 0, worst: 0 })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let start = last
    let frames = 0
    let worst = 0
    const tick = (now: number) => {
      worst = Math.max(worst, now - last)
      last = now
      frames++
      if (now - start >= 1000) {
        setStat({ fps: (frames * 1000) / (now - start), worst })
        start = now
        frames = 0
        worst = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const color = stat.fps >= 50 ? '#7dffa8' : stat.fps >= 40 ? '#ffe27d' : '#ff8a7d'
  const dpr = Math.min(window.devicePixelRatio, QUALITY[level].dpr)
  return (
    <div
      style={{
        position: 'fixed',
        // 위쪽 안내 문구 아래, 이름표보다 위 (오른쪽)
        right: 'calc(env(safe-area-inset-right, 0px) + 6px)',
        top: '17%',
        textAlign: 'right',
        zIndex: 1000,
        pointerEvents: 'none',
        padding: '4px 7px',
        borderRadius: 6,
        background: 'rgba(0, 0, 0, 0.55)',
        color: '#fff',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        whiteSpace: 'pre',
      }}
    >
      <span style={{ color }}>{stat.fps.toFixed(0)} fps</span>
      {`  최악 ${stat.worst.toFixed(0)}ms\n품질 ${level}${locked ? ' (고정)' : ''}  dpr ${dpr.toFixed(2)}`}
    </div>
  )
}
