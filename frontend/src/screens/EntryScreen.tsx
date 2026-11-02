import { useState } from 'react'
import { audio } from '../audio/AudioEngine'
import { nickOf } from '../haenyeo/customize'
import { useCustomize } from '../store/customizeStore'
import { useGame } from '../store/gameStore'
import { CustomizeFields, CustomizeSheet, RandomAllButton } from '../ui/CustomizePanel'

// 입장 화면: 모든 값이 이미 랜덤으로 정해져 있어서 "바다로 들어가기"만 눌러도 된다.
// 전에 꾸민 해녀가 있으면 짧은 카드만 보여주고, "꾸미기"를 누르면 펼침.

export function EntryScreen() {
  const setPhase = useGame((s) => s.setPhase)
  const custom = useCustomize((s) => s.custom)
  const returning = useCustomize((s) => s.returning)
  const commit = useCustomize((s) => s.commit)
  const [open, setOpen] = useState(!returning)
  const [leaving, setLeaving] = useState(false)

  const enter = () => {
    // 브라우저 자동재생 정책 때문에 소리는 클릭 안에서 시작
    void audio.start()
    commit()
    setLeaving(true)
    window.setTimeout(() => setPhase('playing'), 450)
  }

  return (
    <div className={`entry ${leaving ? 'leaving' : ''}`}>
      <CustomizeSheet className={open ? 'open' : 'compact'}>
        <header className="cz-head">
          <div>
            <h1>숨비</h1>
            <p className="entry-sub">제주 바다에서 함께, 조용히 물질해요</p>
          </div>
          {open && <RandomAllButton />}
        </header>

        {open ? (
          <CustomizeFields />
        ) : (
          <div className="cz-returning">
            <span className="nametag self">
              <span className="me">나</span>
              {nickOf(custom)}
            </span>
            <span className="cz-welcome">다시 왔네요!</span>
          </div>
        )}

        <div className="cz-actions">
          {!open && (
            <button type="button" className="cz-secondary" onClick={() => setOpen(true)}>
              🎨 꾸미기
            </button>
          )}
          <button type="button" className="entry-button" onClick={enter}>
            바다로 들어가기
          </button>
        </div>
        <p className="entry-note">가입 없이 바로 · 고른 모습은 이 브라우저에 저장돼요 · 소리를 켜 주세요</p>
      </CustomizeSheet>
    </div>
  )
}
