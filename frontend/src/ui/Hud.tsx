import { useEffect, useRef, useState } from 'react'
import { touchUI } from '../lib/device'
import { CONFIG, ITEM_LABEL, withObjectParticle, type ItemType } from '../config'
import { net } from '../net'
import { lookInfo, nickParts } from '../net/hello'
import { useCustomize } from '../store/customizeStore'
import { CustomizeFields, CustomizeSheet, RandomAllButton } from './CustomizePanel'
import { JournalButton, JournalOverlay } from './JournalCard'
import { Joystick } from './Joystick'
import { startAct } from '../haenyeo/acts'
import { stopFloat, toggleFloat } from '../player/float'
import { input, setDiveLatch, useDiveLatch } from '../player/input'
import { player } from '../player/runtime'
import { travel } from '../player/zone'
import { useBubbles } from '../store/bubbleStore'
import { useBulteok } from '../store/bulteokStore'
import { useFloat } from '../store/floatStore'
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
      {touchUI ? (
        <>
          왼쪽 아래를 끌어 헤엄치고, <b>🤿</b>를 톡 누르면 잠수해요 · 화면을 끌어 둘러보고, 두 손가락으로 벌려 가까이
        </>
      ) : (
        <>
          WASD·방향키로 헤엄치고, <b>Space</b>를 누르고 있으면 잠수해요 · 마우스로 끌어 둘러봐요
        </>
      )}
    </div>
  )
}

/** 상단 가운데: 서버 연결이 잠깐 끊겼을 때 */
function NetStatusPill() {
  const status = useGame((s) => s.netStatus)
  if (status === 'restarting') return <div className="pill net-status">바다를 새로 단장하고 있어요 · 곧 다시 이어져요</div>
  if (status !== 'reconnecting') return null
  return <div className="pill net-status">연결이 잠깐 끊겼어요 · 다시 연결하는 중…</div>
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
  const prepped = useGame((s) => s.prepped)
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
            {prepped[it] > 0 && <em className="prepped">(손질 {prepped[it]})</em>}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 왼쪽 아래: 오늘의 바다 (접을 수 있는 카드, 레퍼런스 순례길) */
function TodaySea() {
  const today = useGame((s) => s.today)
  // 휴대폰은 화면이 좁아 접은 채로 시작 (눌러서 펼침)
  const [open, setOpen] = useState(!touchUI)
  // 휴대폰: 펼치면 위쪽 안내·알림 문구를 그만큼 아래로 (CSS body.today-open)
  useEffect(() => {
    document.body.classList.toggle('today-open', open)
    return () => document.body.classList.remove('today-open')
  }, [open])
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

/**
 * 둥둥: 손대지 않은 채 몇 초가 지나면 UI 를 천천히 숨겨 하늘만 (마우스·터치·키를 누르면 다시).
 * 숨겨도 "일어나기" 와 별똥별 한 줄은 은은하게 남김.
 */
function FloatCalm() {
  const active = useFloat((s) => s.active)
  const calm = useFloat((s) => s.calm)
  const note = useFloat((s) => s.note)
  useEffect(() => {
    const f = useFloat.getState()
    if (!active) {
      f.setCalm(false)
      return
    }
    let timer = 0
    const arm = () => {
      if (useFloat.getState().calm) useFloat.getState().setCalm(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => useFloat.getState().setCalm(true), CALM_AFTER_MS)
    }
    arm()
    const evs = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'] as const
    for (const e of evs) window.addEventListener(e, arm, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of evs) window.removeEventListener(e, arm)
    }
  }, [active])
  // 머리 위 이름표도 같이 숨김 (장면 위 HTML 이라 body 에 표시)
  useEffect(() => {
    document.body.classList.toggle('float-calm', calm)
    return () => document.body.classList.remove('float-calm')
  }, [calm])
  return (
    <>
      {note && (
        <div key={note.id} className="float-note">
          {note.text}
        </div>
      )}
      {active && calm && (
        <button className="float-wake" onClick={stopFloat}>
          일어나기
        </button>
      )}
    </>
  )
}

const CALM_AFTER_MS = 4500

/** 이보다 짧게 누르면 '톡' (계속 잠수) */
const TAP_MS = 280

/** 하단 가운데: 행동 바 (레퍼런스 산사) */
function ActionBar() {
  const diving = useGame((s) => s.diving)
  const floating = useFloat((s) => s.active)
  const latched = useDiveLatch((s) => s.on)
  // 톡 누르면 계속 잠수(다시 톡 → 올라가기), 누르고 있다 떼면 바로 올라감
  const press = useRef({ at: 0, release: false })
  const diveDown = () => {
    if (useDiveLatch.getState().on) {
      setDiveLatch(false)
      press.current.release = true
      return
    }
    press.current = { at: performance.now(), release: false }
    input.diveButton = true
  }
  const diveUp = () => {
    if (press.current.release) {
      press.current.release = false
      return
    }
    if (!input.diveButton) return
    input.diveButton = false
    const tap = performance.now() - press.current.at < TAP_MS
    if (tap && useGame.getState().diving && player.pose.state !== 'ascending') setDiveLatch(true)
  }
  const diveCancel = () => {
    input.diveButton = false
  }
  // F: 둥둥 눕기/일어나기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== 'KeyF' || (e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (useGame.getState().phase !== 'playing' || useGame.getState().customizing) return
      toggleFloat()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
  return (
    <div className="glass actionbar">
      <button
        className={`action ${diving ? 'active' : ''}`}
        title="톡 누르면 계속 잠수, 다시 누르면 올라가요 · 누르고 있다 떼도 돼요"
        onPointerDown={diveDown}
        onPointerUp={diveUp}
        onPointerLeave={diveUp}
        onPointerCancel={diveCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="icon">{latched ? '⬆️' : '🤿'}</span>
        <span>{latched ? '올라가기' : diving ? '잠수 중' : '잠수'}</span>
        <kbd>{latched ? '다시 톡' : 'Space 누르기'}</kbd>
      </button>
      <button className="action" onClick={() => (input.waveRequested = true)}>
        <span className="icon">👋</span>
        <span>인사</span>
        <kbd>1</kbd>
      </button>
      <button
        className={`action ${floating ? 'active' : ''}`}
        disabled={diving}
        title={floating ? '몸을 뒤집어 일어나요 (이동 키로도)' : '테왁을 안고 누워 하늘을 바라봐요 · 아무것도 안 해도 돼요'}
        onClick={toggleFloat}
      >
        <span className="icon">☁️</span>
        <span>{floating ? '일어나기' : '둥둥'}</span>
        <kbd>F</kbd>
      </button>
      <button
        className="action"
        disabled={diving || floating}
        title={diving ? '수면에서 갈 수 있어요' : '모닥불 곁에서 쉬며 해산물을 손질해요'}
        onClick={() => travel('bulteok')}
      >
        <span className="icon">🔥</span>
        <span>불턱으로</span>
        <kbd>{diving ? '수면에서' : '쉬러 가기'}</kbd>
      </button>
    </div>
  )
}

/** 지금 손질할 수 있는 개수: 서버에 붙어 있으면 서버 값, 아니면 내 망사리 − 손질한 것 */
function useLeft(): Record<ItemType, number> {
  const basket = useGame((s) => s.basket)
  const prepped = useGame((s) => s.prepped)
  const online = useGame((s) => s.netStatus === 'online')
  const serverLeft = useBulteok((s) => s.serverLeft)
  if (online && serverLeft) return serverLeft
  return {
    conch: Math.max(0, basket.conch - prepped.conch),
    abalone: Math.max(0, basket.abalone - prepped.abalone),
    urchin: Math.max(0, basket.urchin - prepped.urchin),
  }
}

/** 지금 손질·귤 까먹기 중이면 끝날 때까지 다시 그림 */
function useBusy() {
  const busyUntil = useBulteok((s) => s.busyUntil)
  const [, force] = useState(0)
  const busy = busyUntil > performance.now()
  useEffect(() => {
    if (!busy) return
    const id = window.setTimeout(() => force((n) => n + 1), busyUntil - performance.now() + 30)
    return () => window.clearTimeout(id)
  }, [busy, busyUntil])
  return busy
}

const PREP_LABEL: Record<ItemType, string> = { conch: '소라 두드리기', abalone: '전복 떼기', urchin: '성게 알 꺼내기' }

export function prepItem(item: ItemType, left: number) {
  if (useBulteok.getState().busyUntil > performance.now()) return
  if (left <= 0) {
    useBubbles.getState().sayself(`${withObjectParticle(ITEM_LABEL[item])} 바다에서 따 오세요`)
    return
  }
  net.send({ t: 'prep', item })
}

function eatTangerine() {
  const b = useBulteok.getState()
  if (b.busyUntil > performance.now()) return
  net.send({ t: 'act', a: 'tangerine' })
  startAct(player.pose, 'tangerine')
  b.setBusyUntil(performance.now() + CONFIG.tangerineDuration * 1000)
  b.setDozing(false)
  useBubbles.getState().sayself('귤을 까먹어요', CONFIG.tangerineDuration * 1000)
}

function toggleDoze() {
  const b = useBulteok.getState()
  if (b.dozing) {
    net.send({ t: 'act', a: 'wake' })
    if (player.pose.act === 'doze') player.pose.act = null
    b.setDozing(false)
    return
  }
  if (b.busyUntil > performance.now()) return
  net.send({ t: 'act', a: 'doze' })
  startAct(player.pose, 'doze')
  b.setDozing(true)
  useBubbles.getState().sayself('꾸벅꾸벅…')
}

/** 불턱 하단: 손질 패널(내가 딴 것만) + 쉬기 + 바다로 */
function BulteokBar() {
  const left = useLeft()
  const busy = useBusy()
  const dozing = useBulteok((s) => s.dozing)
  const traveling = useBulteok((s) => s.traveling)
  const leftRef = useRef(left)
  useEffect(() => {
    leftRef.current = left
  }, [left])

  // 단축키: 2 소라 · 3 전복 · 4 성게 · T 귤 · Z 졸기 (1 인사는 공통)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT') return
      const map: Record<string, ItemType> = { Digit2: 'conch', Digit3: 'abalone', Digit4: 'urchin' }
      if (map[e.code]) prepItem(map[e.code], leftRef.current[map[e.code]])
      if (e.code === 'KeyT') eatTangerine()
      if (e.code === 'KeyZ') toggleDoze()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  const none = ITEMS.every((it) => left[it] === 0)
  return (
    <div className="bulteok-bar">
      <div className="glass prep-panel">
        <div className="prep-title">손질하기 {none && <span className="prep-hint">바다에서 따 오세요</span>}</div>
        <div className="prep-items">
          {ITEMS.map((it, i) => (
            <button
              key={it}
              className={`prep ${left[it] === 0 ? 'empty' : ''}`}
              disabled={busy}
              title={left[it] === 0 ? '바다에서 따 오세요' : PREP_LABEL[it]}
              onClick={() => prepItem(it, left[it])}
            >
              <i className={`dot big ${it}`} />
              <span>{ITEM_LABEL[it]}</span>
              <b>{left[it]}</b>
              <kbd>{i + 2}</kbd>
            </button>
          ))}
        </div>
      </div>
      <div className="glass actionbar">
        <button className="action" disabled={busy} onClick={eatTangerine}>
          <span className="icon">🍊</span>
          <span>귤 까먹기</span>
          <kbd>T</kbd>
        </button>
        <button className={`action ${dozing ? 'active' : ''}`} disabled={busy && !dozing} onClick={toggleDoze}>
          <span className="icon">{dozing ? '☀️' : '😴'}</span>
          <span>{dozing ? '깨기' : '졸기'}</span>
          <kbd>Z</kbd>
        </button>
        <button className="action" onClick={() => (input.waveRequested = true)}>
          <span className="icon">👋</span>
          <span>인사</span>
          <kbd>1</kbd>
        </button>
        <button className="action" disabled={!!traveling} onClick={() => travel('sea')}>
          <span className="icon">🌊</span>
          <span>바다로</span>
          <kbd>물질하러</kbd>
        </button>
      </div>
    </div>
  )
}

/** 불턱 왼쪽 아래: 공동 대야가 얼마나 찼는지 */
function BasinCard() {
  const basin = useBulteok((s) => s.basin)
  const k = Math.min(1, basin.fill / Math.max(1, basin.capacity))
  return (
    <div className={`glass basin-card ${basin.full ? 'full' : ''}`}>
      <div className="today-head">
        <span className="chip">공동 대야</span>
        <span className="basin-round">{basin.round}번째 대야</span>
      </div>
      <div className="basin-track">
        <div className="basin-fill" style={{ transform: `scaleX(${k})` }} />
      </div>
      <div className="today-body">
        {basin.full ? (
          <b>가득 찼어요! 다 같이 만세 🙌</b>
        ) : (
          <>
            함께 손질한 해산물 <b>{basin.fill}</b> / {basin.capacity}
          </>
        )}
      </div>
    </div>
  )
}

/** 바다 ↔ 불턱 이동할 때 화면을 부드럽게 가림 */
function ZoneFade() {
  const traveling = useBulteok((s) => s.traveling)
  return (
    <div className={`zone-fade ${traveling ? 'on' : ''}`}>
      {traveling && <span>{traveling === 'bulteok' ? '불턱으로 가는 중…' : '바다로 나가는 중…'}</span>}
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

/** 오른쪽 위: 바다 속에서 다시 꾸미기 (수면에 있을 때만) */
function CustomizeButton() {
  const diving = useGame((s) => s.diving)
  const inBulteok = useBulteok((s) => s.zone === 'bulteok')
  const setCustomizing = useGame((s) => s.setCustomizing)
  return (
    <button
      className="glass round"
      onClick={() => setCustomizing(true)}
      disabled={diving || inBulteok}
      aria-label="해녀 꾸미기"
      title={diving ? '수면에서 꾸밀 수 있어요' : '해녀 꾸미기'}
    >
      🎨
    </button>
  )
}

/** 바다 속 꾸미기 메뉴: 바꾸면 바로 반영, 완료하면 다른 해녀들에게도 알림 */
function SeaCustomize() {
  const setCustomizing = useGame((s) => s.setCustomizing)
  const done = () => {
    const c = useCustomize.getState().custom
    useCustomize.getState().commit()
    net.send({ t: 'look', nick: nickParts(c), look: lookInfo(c) })
    ;(document.activeElement as HTMLElement | null)?.blur()
    setCustomizing(false)
  }
  return (
    <div className="sea-customize">
      <CustomizeSheet className="open">
        <header className="cz-head">
          <h2>해녀 꾸미기</h2>
          <RandomAllButton />
        </header>
        <CustomizeFields />
        <div className="cz-actions">
          <button type="button" className="entry-button" onClick={done}>
            완료
          </button>
        </div>
      </CustomizeSheet>
    </div>
  )
}

/** 대기 중: 화면 구석에 작게 순번·예상 대기 (그동안은 혼자 하는 바다에서 놀기) */
function QueueCorner() {
  const queue = useGame((s) => s.queue)
  const slot = useGame((s) => s.slotUntil)
  if (!queue || slot !== null) return null
  const eta = queue.eta === null ? '잠시 후' : queue.eta < 60 ? '1분 안' : `약 ${Math.round(queue.eta / 60)}분`
  return (
    <div className="glass queue-corner" title="자리가 나면 알려 드려요 · 그동안 혼자 바다에서 놀 수 있어요">
      ⏳ 대기 {queue.ahead + 1}번째 · {eta}
    </div>
  )
}

/** 자리가 났어요: 들어가기 버튼 + 남은 시간. 다른 탭에 있으면 탭 제목으로도 알림 */
function SlotCard() {
  const until = useGame((s) => s.slotUntil)
  const [left, setLeft] = useState(0)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (until === null) {
      setSent(false)
      return
    }
    const title = document.title
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(() => {
      tick()
      // 다른 탭에 있으면 제목을 번갈아 바꿔 눈에 띄게
      document.title = document.hidden && Math.floor(Date.now() / 1000) % 2 === 0 ? '🌊 자리가 났어요' : title
    }, 500)
    return () => {
      window.clearInterval(id)
      document.title = title
    }
  }, [until])
  if (until === null) return null
  const enter = () => {
    setSent(true)
    net.send({ t: 'enter' })
  }
  return (
    <div className="slot-wrap">
      <div className="glass slot-card" role="dialog" aria-label="바다에 자리가 났어요">
        <b>🌊 바다에 자리가 났어요</b>
        <span>다른 해녀들과 함께하는 바다로 들어갈까요?</span>
        <button className="entry-button" onClick={enter} disabled={sent}>
          {sent ? '들어가는 중…' : '바다에 들어가기'}
        </button>
        <small>{left}초 안에 누르지 않으면 다음 분께 자리가 넘어가요</small>
      </div>
    </div>
  )
}

/** 스크롤·슬라이더가 필요한 곳 (여기선 손가락 끌기를 브라우저에 맡김) */
const NATIVE_SCROLL = '.cz-sheet, .journal-overlay, .volume-panel, input'

/** 휴대폰: 게임 화면 어디서 끌어도 페이지가 스크롤·확대되지 않게 (iOS 는 끌기를 가져가면 조작이 끊김) */
function useBlockPageScroll() {
  useEffect(() => {
    if (!touchUI) return
    const stop = (e: TouchEvent) => {
      if ((e.target as Element | null)?.closest?.(NATIVE_SCROLL)) return
      if (e.cancelable) e.preventDefault()
    }
    const pinch = (e: Event) => e.preventDefault()
    document.addEventListener('touchmove', stop, { passive: false })
    document.addEventListener('gesturestart', pinch)
    return () => {
      document.removeEventListener('touchmove', stop)
      document.removeEventListener('gesturestart', pinch)
    }
  }, [])
}

export function Hud() {
  useBlockPageScroll()
  const under = useGame((s) => s.cameraUnderwater)
  const customizing = useGame((s) => s.customizing)
  const inBulteok = useBulteok((s) => s.zone === 'bulteok')
  const floating = useFloat((s) => s.active)
  const calm = useFloat((s) => s.calm)
  if (customizing) return <div className="hud"><SeaCustomize /></div>
  return (
    <div className={`hud ${touchUI ? 'touch' : ''} ${inBulteok ? 'in-bulteok' : ''} ${floating ? 'floating' : ''} ${calm ? 'calm' : ''}`}>
      {touchUI && !inBulteok && <Joystick />}
      {!inBulteok && <FloatCalm />}
      <div className={`vignette ${under ? 'on' : ''}`} />
      <ZoneFade />
      <JournalOverlay />
      <SlotCard />
      <div className="top-center">
        <NetStatusPill />
        <HintPill />
        <ActionToasts />
      </div>
      <div className="top-left">
        <Basket />
        <QueueCorner />
        {/* 휴대폰: 아래쪽은 조이스틱·버튼 자리라 카드를 망사리 밑으로 (불턱에선 공동 대야만) */}
        {touchUI && inBulteok && <BasinCard />}
        {touchUI && !inBulteok && <TodaySea />}
      </div>
      <div className="top-right">
        <JournalButton />
        <CustomizeButton />
        <VolumePanel />
      </div>
      {!touchUI && (
        <div className="bottom-left">
          {inBulteok && <BasinCard />}
          <TodaySea />
        </div>
      )}
      <div className="bottom-center">
        {inBulteok ? (
          <BulteokBar />
        ) : (
          <>
            {!floating && <BreathGauge />}
            {!touchUI && <ActionBar />}
          </>
        )}
      </div>
      {/* 휴대폰: 행동 버튼은 오른쪽 아래 세로로 (잠수가 엄지 가까이 맨 아래) */}
      {touchUI && !inBulteok && (
        <div className="bottom-right">
          <ActionBar />
        </div>
      )}
    </div>
  )
}
