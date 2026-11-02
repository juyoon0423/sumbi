import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  CHEEK_PALETTE,
  NICK_ADJECTIVES,
  NICK_NOUNS,
  TEWAK_PALETTE,
  TOWEL_PALETTE,
  type Customization,
  type Swatch,
} from '../haenyeo/customize'
import { showcaseView } from '../player/runtime'
import { useCustomize } from '../store/customizeStore'

/** 색 고르기 한 줄 */
function SwatchRow({
  title,
  list,
  value,
  field,
}: {
  title: string
  list: Swatch[]
  value: string
  field: keyof Pick<Customization, 'towel' | 'tewak' | 'cheek'>
}) {
  const set = useCustomize((s) => s.set)
  return (
    <div className="cz-row">
      <div className="cz-label">{title}</div>
      <div className="cz-swatches" role="radiogroup" aria-label={title}>
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={value === s.id}
            aria-label={`${title} ${s.label}`}
            title={s.label}
            className={`cz-swatch ${value === s.id ? 'on' : ''}`}
            style={{ background: s.color }}
            onClick={() => set({ [field]: s.id })}
          />
        ))}
      </div>
    </div>
  )
}

/** 닉네임: 앞말 + 뒷말 고르기, 각각 🎲 */
function NickPicker() {
  const { adj, noun } = useCustomize((s) => s.custom)
  const set = useCustomize((s) => s.set)
  const rerollAdj = useCustomize((s) => s.rerollAdj)
  const rerollNoun = useCustomize((s) => s.rerollNoun)
  return (
    <div className="cz-row">
      <div className="cz-label">닉네임</div>
      <div className="cz-nick">
        <div className="cz-word">
          <select aria-label="닉네임 앞말" value={adj} onChange={(e) => set({ adj: e.target.value })}>
            {NICK_ADJECTIVES.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <button type="button" className="cz-dice" aria-label="앞말 다시 뽑기" onClick={rerollAdj}>
            🎲
          </button>
        </div>
        <div className="cz-word">
          <select aria-label="닉네임 뒷말" value={noun} onChange={(e) => set({ noun: e.target.value })}>
            {NICK_NOUNS.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <button type="button" className="cz-dice" aria-label="뒷말 다시 뽑기" onClick={rerollNoun}>
            🎲
          </button>
        </div>
      </div>
    </div>
  )
}

/** 꾸미기 항목 전체 (입장 화면과 바다 속 꾸미기 메뉴에서 같이 씀) */
export function CustomizeFields() {
  const c = useCustomize((s) => s.custom)
  return (
    <div className="cz-fields">
      <NickPicker />
      <SwatchRow title="물수건" list={TOWEL_PALETTE} value={c.towel} field="towel" />
      <SwatchRow title="테왁" list={TEWAK_PALETTE} value={c.tewak} field="tewak" />
      <SwatchRow title="볼" list={CHEEK_PALETTE} value={c.cheek} field="cheek" />
      <div className="cz-row cz-fixed">
        <div className="cz-label">잠수복</div>
        <span className="cz-swatch suit" aria-hidden /> <span>검정 (해녀복은 모두 같아요)</span>
      </div>
    </div>
  )
}

export function RandomAllButton() {
  const randomizeAll = useCustomize((s) => s.randomizeAll)
  return (
    <button type="button" className="cz-random" onClick={randomizeAll}>
      🎲 전부 랜덤
    </button>
  )
}

/**
 * 꾸미기 패널 틀. 데스크톱은 오른쪽 카드, 모바일 세로는 아래 시트.
 * 패널이 가리지 않는 영역을 재서 카메라가 해녀를 그 가운데에 크게 보여주게 함.
 */
export function CustomizeSheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const W = window.innerWidth
      const H = window.innerHeight
      if (r.width > W * 0.85) {
        // 아래 시트 → 위쪽 빈 곳
        Object.assign(showcaseView, { x: 0, y: 0, w: W, h: Math.max(80, r.top) })
      } else {
        // 오른쪽 카드 → 왼쪽 빈 곳
        Object.assign(showcaseView, { x: 0, y: 0, w: Math.max(80, r.left), h: H })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      Object.assign(showcaseView, { x: 0, y: 0, w: 0, h: 0 })
    }
  }, [])
  return (
    <div ref={ref} className={`cz-sheet ${className}`}>
      {children}
    </div>
  )
}
