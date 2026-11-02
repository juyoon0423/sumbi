import { useState } from 'react'
import { audio } from '../audio/AudioEngine'
import { useGame } from '../store/gameStore'

export function EntryScreen() {
  const nickname = useGame((s) => s.nickname)
  const setPhase = useGame((s) => s.setPhase)
  const [leaving, setLeaving] = useState(false)

  const enter = () => {
    // 브라우저 자동재생 정책 때문에 소리는 클릭 안에서 시작
    void audio.start()
    setLeaving(true)
    window.setTimeout(() => setPhase('playing'), 450)
  }

  return (
    <div className={`entry ${leaving ? 'leaving' : ''}`}>
      <div className="entry-card">
        <h1>숨비</h1>
        <p className="entry-sub">제주 바다에서 함께, 조용히 물질해요</p>
        {nickname && (
          <p className="entry-nick">
            오늘 당신은 <span className="nametag self"><span className="me">나</span>{nickname}</span>
          </p>
        )}
        <button className="entry-button" onClick={enter} disabled={!nickname}>
          바다로 들어가기
        </button>
        <p className="entry-note">가입 없이 바로 들어가요 · 소리를 켜 주세요</p>
      </div>
    </div>
  )
}
