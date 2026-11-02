import { useEffect, useRef, useState } from 'react'
import { CONFIG, ITEM_LABEL, type ItemType } from '../config'
import { input } from '../player/input'
import { player } from '../player/runtime'
import { useGame } from '../store/gameStore'
import { useSettings, type Channel } from '../store/settingsStore'
import { useToasts } from '../store/toastStore'

const ITEMS: ItemType[] = ['conch', 'abalone', 'urchin']

/** 상단 가운데: 처음 들어왔을 때 조작 안내 (레퍼런스 순례길) */
function HintPill() {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setShow(false), 10000)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div className={`pill hint ${show ? '' : 'hidden'}`}>
      WASD·방향키로 헤엄치고, <b>Space</b>를 누르고 있으면 잠수해요 · 마우스로 끌어 둘러봐요
    </div>
  )
}

/** 상단 가운데: 다른 해녀들의 행동 알림 */
function ActionToasts() {
  const toasts = useToasts((s) => s.visible)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="pill toast">
          {t.text}
        </div>
      ))}
    </div>
  )
}

/** 왼쪽 위: 내 채집 바구니 (망사리) */
function Basket() {
  const basket = useGame((s) => s.basket)
  const [bump, setBump] = useState(0)
  const total = basket.conch + basket.abalone + basket.urchin
  const prev = useRef(total)
  useEffect(() => {
    if (total > prev.current) setBump((b) => b + 1)
    prev.current = total
  }, [total])
  return (
    <div className="glass basket" key={bump} data-bump={bump > 0}>
      <div className="basket-title">내 망사리</div>
      <div className="basket-items">
        {ITEMS.map((it) => (
          <span key={it} title={ITEM_LABEL[it]}>
            <i className={`dot ${it}`} />
            {ITEM_LABEL[it]} <b>{basket[it]}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** 왼쪽 아래: 오늘의 바다 (접을 수 있는 카드, 레퍼런스 순례길) */
function TodaySea() {
  const today = useGame((s) => s.today)
  const [open, setOpen] = useState(true)
  if (!today) return null
  const { divers, items } = today
  return (
    <button className="glass today" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      <div className="today-head">
        <span className="chip">오늘의 바다</span>
        <span className="caret">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="today-body">
          해녀 <b>{divers.toLocaleString()}</b>명이 소라 <b>{items.conch.toLocaleString()}</b>개 · 전복{' '}
          <b>{items.abalone.toLocaleString()}</b>개 · 성게 <b>{items.urchin.toLocaleString()}</b>개를 땄어요
        </div>
      )}
    </button>
  )
}

/** 숨 게이지: 잠수 중에만 보임. 매 프레임 값은 DOM에 직접 반영 (리렌더 없음) */
function BreathGauge() {
  const diving = useGame((s) => s.diving)
  const fill = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const b = player.breath
      if (fill.current) fill.current.style.transform = `scaleX(${b})`
      if (wrap.current) wrap.current.classList.toggle('low', b < CONFIG.lowBreath)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div ref={wrap} className={`breath ${diving ? '' : 'hidden'}`}>
      <span>숨</span>
      <div className="breath-track">
        <div ref={fill} className="breath-fill" />
      </div>
    </div>
  )
}

/** 하단 가운데: 행동 바 (레퍼런스 산사) */
function ActionBar() {
  const diving = useGame((s) => s.diving)
  const holdDive = (v: boolean) => () => {
    input.diveButton = v
  }
  return (
    <div className="glass actionbar">
      <button
        className={`action ${diving ? 'active' : ''}`}
        onPointerDown={holdDive(true)}
        onPointerUp={holdDive(false)}
        onPointerLeave={holdDive(false)}
        onPointerCancel={holdDive(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="icon">🤿</span>
        <span>{diving ? '잠수 중' : '잠수'}</span>
        <kbd>Space 누르기</kbd>
      </button>
      <button className="action" onClick={() => (input.waveRequested = true)}>
        <span className="icon">👋</span>
        <span>인사</span>
        <kbd>1</kbd>
      </button>
      <button className="action" disabled title="4단계에서 열려요">
        <span className="icon">🔥</span>
        <span>불턱으로</span>
        <kbd>준비 중</kbd>
      </button>
    </div>
  )
}

const CHANNELS: [Channel, string][] = [
  ['waves', '파도'],
  ['sumbi', '숨비소리'],
  ['sfx', '효과음'],
]

/** 오른쪽 위: 소리 조절 */
function VolumePanel() {
  const [open, setOpen] = useState(false)
  const volumes = useSettings((s) => s.volumes)
  const setVolume = useSettings((s) => s.setVolume)
  return (
    <div className="volume">
      <button className="glass round" onClick={() => setOpen((o) => !o)} aria-label="소리 조절">
        {volumes.waves + volumes.sumbi + volumes.sfx === 0 ? '🔇' : '🔊'}
      </button>
      {open && (
        <div className="glass volume-panel">
          {CHANNELS.map(([ch, label]) => (
            <label key={ch}>
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volumes[ch]}
                onChange={(e) => setVolume(ch, Number(e.target.value))}
                // 키보드 방향키가 슬라이더 대신 이동에 쓰이도록 조작 후 포커스 해제
                onPointerUp={(e) => e.currentTarget.blur()}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function Hud() {
  const under = useGame((s) => s.cameraUnderwater)
  return (
    <div className="hud">
      <div className={`vignette ${under ? 'on' : ''}`} />
      <div className="top-center">
        <HintPill />
        <ActionToasts />
      </div>
      <div className="top-left">
        <Basket />
      </div>
      <div className="top-right">
        <VolumePanel />
      </div>
      <div className="bottom-left">
        <TodaySea />
      </div>
      <div className="bottom-center">
        <BreathGauge />
        <ActionBar />
      </div>
    </div>
  )
}
