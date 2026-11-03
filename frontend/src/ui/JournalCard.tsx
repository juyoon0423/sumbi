import { useState } from 'react'
import { cardFileName, saveCardImage } from '../journal/journal'
import { openJournal } from '../journal/open'
import { stayLine } from '../journal/card'
import { player } from '../player/runtime'
import { returnToSeaLocal } from '../player/zone'
import { useGame } from '../store/gameStore'
import { useJournal } from '../store/journalStore'
import { useToasts } from '../store/toastStore'

/** 상단 오른쪽: 물질 마치기 */
export function JournalButton() {
  const diving = useGame((s) => s.diving)
  return (
    <button
      className="glass journal-btn"
      aria-label="물질 마치기"
      onClick={() => void openJournal()}
      disabled={diving}
      title={diving ? '수면에서 마칠 수 있어요' : '오늘 물질을 마치고 일지를 봐요'}
    >
      <span>📔</span>
      <span className="journal-label">물질 마치기</span>
    </button>
  )
}

export function JournalOverlay() {
  const { open, entry, blob, url, close } = useJournal()
  const [saving, setSaving] = useState(false)
  if (!open || !entry) return null

  const save = async () => {
    if (!blob) return
    setSaving(true)
    const r = await saveCardImage(blob, cardFileName(entry))
    setSaving(false)
    if (r === 'downloaded') useToasts.getState().push('물질 일지를 이미지로 저장했어요')
    if (r === 'shared') useToasts.getState().push('물질 일지를 보냈어요')
  }

  const leave = () => {
    close()
    if (player.zone === 'bulteok') returnToSeaLocal(undefined)
    useGame.getState().setPhase('entry')
  }

  return (
    <div className="journal-overlay" role="dialog" aria-label="물질 일지">
      <div className="journal-panel glass">
        <div className="journal-image">
          {url ? (
            <img src={url} alt={`물질 일지: ${stayLine(entry.minutes)}`} />
          ) : (
            <div className="journal-loading">일지를 쓰는 중…</div>
          )}
        </div>
        <div className="journal-actions">
          <button className="primary" disabled={!blob || saving} onClick={() => void save()}>
            {saving ? '저장하는 중…' : '이미지로 저장'}
          </button>
          <button onClick={close}>계속 물질하기</button>
          <button className="quiet" onClick={leave}>
            바다 떠나기
          </button>
        </div>
        <p className="journal-note">기록은 이 브라우저에만 남아요</p>
      </div>
    </div>
  )
}
