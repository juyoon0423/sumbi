import { stopBreathe } from '../player/breathe'
import { useJournal } from '../store/journalStore'
import { currentEntry, makeCard, saveEntry } from './journal'

/** 물질을 마치고 일지 보기 */
export async function openJournal() {
  const j = useJournal.getState()
  if (j.open) return
  stopBreathe()
  const entry = currentEntry()
  saveEntry(entry)
  j.show(entry)
  // 창이 화면을 덮은 다음 장면을 찍음 (찍는 순간 화면이 바뀌어 보이지 않게)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  try {
    const { blob, url } = await makeCard(entry)
    if (useJournal.getState().entry === entry) useJournal.getState().setCard(blob, url)
    else URL.revokeObjectURL(url)
  } catch (e) {
    console.warn('journal card failed', e)
  }
}
