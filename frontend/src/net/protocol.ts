// WebSocket 메시지 타입 (docs/PLAN.md 7장과 1:1). 3단계에서 백엔드와 공유한다.
import type { ItemType } from '../config'

export type Vec3 = [number, number, number]
export type Zone = 'sea' | 'bulteok'
export type ActionType = 'dive' | 'surface' | 'sumbi' | 'wave' | 'harvest'
export type PlayerStatus = 'surface' | 'underwater' | 'sit'
export type ItemCounts = Record<ItemType, number>

export interface TodayStats {
  divers: number
  items: ItemCounts
}

export interface PlayerInfo {
  id: number
  nick: string
  zone: Zone
  p?: Vec3
  r?: number
  seat?: number
  st: PlayerStatus
}

// ── 클라이언트 → 서버 ──
export type ClientMessage =
  | { t: 'hello'; v: 1; token?: string; device: 'pc' | 'mobile' }
  | { t: 'move'; p: Vec3; r: number }
  | { t: 'act'; a: ActionType; item?: ItemType }
  | { t: 'zone'; to: Zone }
  | { t: 'ping'; ts: number }

// ── 서버 → 클라이언트 ──
export type ServerMessage =
  | { t: 'queue'; ahead: number }
  | {
      t: 'welcome'
      you: { id: number; nick: string; token: string }
      room: { id: string; capacity: number }
      players: PlayerInfo[]
      today: TodayStats
    }
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: number }
  | { t: 'snap'; ts: number; ps: [number, number, number, number, number][] }
  | { t: 'evt'; id: number; a: ActionType; item?: ItemType; nick?: string }
  | { t: 'zone'; id: number; zone: Zone; seat?: number; p?: Vec3 }
  | ({ t: 'today' } & TodayStats)
  | { t: 'pong'; ts: number }
  | { t: 'err'; code: string; msg: string }
