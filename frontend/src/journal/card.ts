import { ITEM_LABEL, type ItemType } from '../config'
import type { ItemCounts } from '../net/protocol'
import type { TimePreset } from '../world/time/env'

// 물질 일지 카드 (1080×1350, 휴대폰 사진 비율 4:5). 위에 오늘 장면, 아래에 따뜻한 한 줄과 기록.

export interface JournalEntry {
  /** 끝난 시각 (ms) */
  at: number
  startedAt: number
  minutes: number
  sumbi: number
  harvested: ItemCounts
  prepped: ItemCounts
  met: number
  preset: TimePreset
  nick: string
}

const W = 1080
const H = 1350
const PHOTO_H = 700

interface Theme {
  paper: string
  ink: string
  soft: string
  accent: string
  chip: string
  closing: string
  label: string
}

const THEMES: Record<TimePreset, Theme> = {
  dawn: { paper: '#fbf1ec', ink: '#3d2f3a', soft: '#8a7280', accent: '#d9806f', chip: '#f4dcd5', closing: '새벽 바다의 첫 숨을 함께했어요', label: '새벽 바다' },
  day: { paper: '#f2f8f7', ink: '#1f3a40', soft: '#62807f', accent: '#25858f', chip: '#d7ecea', closing: '햇살 아래 바다가 반짝였어요', label: '한낮 바다' },
  sunset: { paper: '#fcefe6', ink: '#3e2a26', soft: '#8f6d60', accent: '#d9714a', chip: '#f6dccd', closing: '노을빛 바다에서 하루를 닫았어요', label: '노을 바다' },
  night: { paper: '#18202f', ink: '#eef2fb', soft: '#9aa7c2', accent: '#8fd3ff', chip: '#26324a', closing: '달빛 아래 조용히 숨을 골랐어요', label: '밤바다' },
}

const ITEMS: ItemType[] = ['conch', 'abalone', 'urchin']

const total = (c: ItemCounts) => c.conch + c.abalone + c.urchin
const list = (c: ItemCounts) =>
  ITEMS.filter((it) => c[it] > 0)
    .map((it) => `${ITEM_LABEL[it]} ${c[it]}`)
    .join(' · ')

export function stayLine(minutes: number) {
  if (minutes < 1) return '오늘 바다에 잠깐 머물렀어요'
  if (minutes < 60) return `오늘 바다에 ${minutes}분 머물렀어요`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `오늘 바다에 ${h}시간${m ? ` ${m}분` : ''} 머물렀어요`
}

function dateLine(at: number) {
  const d = new Date(at + 9 * 3600e3) // 한국 시간
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** 카드 그리기. photo 가 없으면 시간대 색 그라데이션 */
export function drawCard(entry: JournalEntry, photo: HTMLCanvasElement | null, font: string): HTMLCanvasElement {
  const t = THEMES[entry.preset]
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = t.paper
  g.fillRect(0, 0, W, H)

  // ── 사진 (아래쪽은 종이색으로 스며듦) ──
  const pad = 48
  g.save()
  roundRect(g, pad, pad, W - pad * 2, PHOTO_H - pad, 36)
  g.clip()
  if (photo) g.drawImage(photo, pad, pad, W - pad * 2, PHOTO_H - pad)
  else {
    const grad = g.createLinearGradient(0, pad, 0, PHOTO_H)
    grad.addColorStop(0, t.accent)
    grad.addColorStop(1, t.chip)
    g.fillStyle = grad
    g.fillRect(pad, pad, W - pad * 2, PHOTO_H - pad)
  }
  const fade = g.createLinearGradient(0, PHOTO_H - 160, 0, PHOTO_H)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,0.28)')
  g.fillStyle = fade
  g.fillRect(pad, PHOTO_H - 160, W - pad * 2, 160)
  g.restore()

  // 사진 위 작은 이름표
  g.font = `600 30px ${font}`
  const tag = `${t.label} · ${entry.nick}`
  const tw = g.measureText(tag).width
  g.fillStyle = 'rgba(255,255,255,0.88)'
  roundRect(g, pad + 28, PHOTO_H - 84, tw + 44, 54, 27)
  g.fill()
  g.fillStyle = '#29343a'
  g.textBaseline = 'middle'
  g.fillText(tag, pad + 50, PHOTO_H - 57)

  // ── 글 ──
  const x = pad + 16
  let y = PHOTO_H + 70
  g.textBaseline = 'alphabetic'
  g.fillStyle = t.soft
  g.font = `600 30px ${font}`
  g.fillText(`물질 일지 · ${dateLine(entry.at)}`, x, y)

  y += 78
  g.fillStyle = t.ink
  g.font = `800 60px ${font}`
  g.fillText(stayLine(entry.minutes), x, y)

  // 기록 줄
  const rows: [string, string][] = [
    ['숨비소리', entry.sumbi > 0 ? `${entry.sumbi}번` : '조용히'],
    ['딴 해산물', total(entry.harvested) > 0 ? list(entry.harvested) : '바다 구경만 했어요'],
    ['손질한 것', total(entry.prepped) > 0 ? list(entry.prepped) : '—'],
    ['함께한 해녀', entry.met > 0 ? `${entry.met}명` : '혼자 조용히'],
  ]
  y += 34
  const rowH = rows.length > 4 ? 66 : 76
  for (const [k, v] of rows) {
    y += rowH
    g.fillStyle = t.chip
    roundRect(g, x - 4, y - 46, W - (x - 4) * 2, 60, 18)
    g.fill()
    g.fillStyle = t.soft
    g.font = `600 30px ${font}`
    g.fillText(k, x + 22, y - 5)
    g.fillStyle = t.ink
    g.font = `700 32px ${font}`
    const vw = g.measureText(v).width
    g.fillText(v, W - x - 22 - vw, y - 5)
  }

  // 마무리 한 줄
  g.fillStyle = t.accent
  g.font = `700 34px ${font}`
  g.fillText(t.closing, x, H - 58)
  g.fillStyle = t.soft
  g.font = `600 26px ${font}`
  const brand = '숨비 · 제주 해녀 바다'
  g.fillText(brand, W - x - g.measureText(brand).width, H - 58)
  return c
}

export function cardBlob(card: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => card.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
}
