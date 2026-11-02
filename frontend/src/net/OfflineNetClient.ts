import { CONFIG, type ItemType } from '../config'
import { nickOf } from '../haenyeo/customize'
import { generateNickname } from '../lib/nickname'
import { kstDateKey } from '../lib/today'
import { nextBasinCapacity, seaReturn } from '../world/bulteok/layout'
import { planWalk, walkDuration } from '../world/bulteok/seatWalk'
import { Emitter, type NetClient } from './NetClient'
import type { ClientMessage, HelloMessage, ItemCounts, TodayStats } from './protocol'

const SELF_ID = 1
const TODAY_KEY = 'sumbi.offlineToday'

interface Options {
  /**
   * 개발용: 다른 해녀들이 있는 것처럼 행동 알림·멀리서 들리는 숨비소리를 흉내낸다.
   * 실제 오프라인 모드(서버 연결 실패)에서는 꺼서 없는 사람을 지어내지 않는다.
   */
  simulateOthers: boolean
}

function emptyItems(): ItemCounts {
  return { conch: 0, abalone: 0, urchin: 0 }
}

/** 서버 없이 혼자 하는 바다. 서버가 하는 일을 브라우저 안에서 흉내낸다. */
export class OfflineNetClient implements NetClient {
  private emitter = new Emitter()
  private timer: number | undefined
  private today: TodayStats
  private opts: Options
  // 불턱 흉내: 혼자 쓰는 대야
  private basin = { fill: 0, capacity: nextBasinCapacity(1), round: 1, full: false }
  private prepUntil = 0
  private restUntil = 0
  private seat = -1
  private walkUntil = 0

  constructor(opts: Options) {
    this.opts = opts
    this.today = this.loadToday()
  }

  connect(hello: HelloMessage) {
    // 실제 서버처럼 비동기로 응답
    this.disconnect()
    this.timer = window.setTimeout(() => {
      this.emitter.emit({
        t: 'welcome',
        you: { id: SELF_ID, nick: nickOf(hello.nick), token: 'offline', look: hello.look },
        room: { id: 'offline', capacity: 1 },
        players: [],
        today: this.today,
      })
      if (this.opts.simulateOthers) this.scheduleFakeEvent()
    }, 0)
  }

  disconnect() {
    window.clearTimeout(this.timer)
  }

  onMessage(handler: Parameters<NetClient['onMessage']>[0]) {
    return this.emitter.on(handler)
  }

  send(msg: ClientMessage) {
    if (msg.t === 'zone') {
      window.setTimeout(() => {
        if (msg.to === 'bulteok') {
          this.seat = 0
          this.emitter.emit({ t: 'zone', id: SELF_ID, zone: 'bulteok', seat: 0 })
          this.emitBasin()
        } else {
          this.seat = -1
          this.emitter.emit({ t: 'zone', id: SELF_ID, zone: 'sea', p: seaReturn(SELF_ID) })
        }
      }, 60)
      return
    }
    if (msg.t === 'seat') {
      // 혼자라 빈자리는 다 비어 있음 (서버 Room.requestSeat 흉내)
      const now = Date.now()
      if (this.seat < 0 || msg.seat === this.seat) return
      if (msg.seat < 0 || msg.seat >= 24 || now < this.prepUntil || now < this.restUntil) {
        window.setTimeout(() => this.emitter.emit({ t: 'seat_no', seat: msg.seat }), 40)
        return
      }
      const from = this.seat
      this.seat = msg.seat
      this.walkUntil = now + walkDuration(planWalk(from, msg.seat)) * 1000
      window.setTimeout(() => this.emitter.emit({ t: 'seat', id: SELF_ID, from, to: msg.seat }), 40)
      return
    }
    if (msg.t === 'prep') {
      const now = Date.now()
      if (now < this.prepUntil || now < this.restUntil || now < this.walkUntil) return
      this.prepUntil = now + CONFIG.prepDuration * 1000
      this.emitter.emit({ t: 'prep', id: SELF_ID, item: msg.item, how: 'tap' })
      window.setTimeout(() => this.fillBasin(), CONFIG.prepDuration * 1000)
      return
    }
    if (msg.t === 'act' && msg.a === 'tangerine') this.restUntil = Date.now() + CONFIG.tangerineDuration * 1000
    if (msg.t === 'look') {
      this.emitter.emit({ t: 'look', id: SELF_ID, nick: nickOf(msg.nick), look: msg.look })
      return
    }
    if (msg.t !== 'act') return
    this.emitter.emit({ t: 'evt', id: SELF_ID, a: msg.a, item: msg.item })
    if (msg.a === 'harvest' && msg.item) this.addHarvest(msg.item)
  }

  private emitBasin() {
    const b = this.basin
    this.emitter.emit({ t: 'basin', fill: b.fill, capacity: b.capacity, round: b.round, full: b.full || undefined })
  }

  /** 손질 하나가 대야에 들어감. 가득 차면 잠깐 축하하고 비움 (서버 Basin 과 같은 흐름) */
  private fillBasin() {
    const b = this.basin
    if (b.full) return
    b.fill += 1
    if (b.fill >= b.capacity) {
      b.full = true
      this.emitBasin()
      window.setTimeout(() => {
        this.basin = { fill: 0, capacity: nextBasinCapacity(1), round: b.round + 1, full: false }
        this.emitBasin()
      }, 4000)
      return
    }
    this.emitBasin()
  }

  private addHarvest(item: ItemType) {
    this.today.items[item] += 1
    this.saveToday()
    this.emitter.emit({ t: 'today', ...this.today, items: { ...this.today.items } })
  }

  // ── 오늘 집계 (브라우저 저장) ──
  private loadToday(): TodayStats {
    const fallback: TodayStats = this.opts.simulateOthers
      ? { divers: 37, items: { conch: 112, abalone: 31, urchin: 74 } }
      : { divers: 1, items: emptyItems() }
    try {
      const raw = localStorage.getItem(TODAY_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { date: string; today: TodayStats }
        if (saved.date === kstDateKey()) return saved.today
      }
    } catch {
      /* 저장소 없음 → 기본값 */
    }
    return fallback
  }

  private saveToday() {
    try {
      localStorage.setItem(TODAY_KEY, JSON.stringify({ date: kstDateKey(), today: this.today }))
    } catch {
      /* 무시 */
    }
  }

  // ── 가짜 이웃 (개발용) ──
  private fakeNicks = Array.from({ length: 8 }, () => generateNickname())

  private scheduleFakeEvent() {
    const delay = 5000 + Math.random() * 8000
    this.timer = window.setTimeout(() => {
      const id = 100 + Math.floor(Math.random() * this.fakeNicks.length)
      const nick = this.fakeNicks[id - 100]
      const r = Math.random()
      if (r < 0.5) {
        const items: ItemType[] = ['conch', 'conch', 'urchin', 'abalone']
        const item = items[Math.floor(Math.random() * items.length)]
        this.emitter.emit({ t: 'evt', id, nick, a: 'harvest', item })
        this.addHarvest(item)
      } else if (r < 0.85) {
        this.emitter.emit({ t: 'evt', id, nick, a: 'sumbi' })
      } else {
        this.emitter.emit({ t: 'evt', id, nick, a: 'wave' })
      }
      this.scheduleFakeEvent()
    }, delay)
  }
}
