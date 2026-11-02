// WebSocket 메시지 타입 (docs/PLAN.md 7장과 1:1). 3단계에서 백엔드와 공유한다.
import type { ItemType } from '../config'

export type Vec3 = [number, number, number]
export type Zone = 'sea' | 'bulteok'
export type ActionType =
  | 'dive'
  | 'surface'
  | 'sumbi'
  | 'wave'
  | 'harvest'
  // 불턱에서 쉬기
  | 'tangerine'
  | 'doze'
  | 'wake'
export type PlayerStatus = 'surface' | 'underwater' | 'sit' | 'doze'
export type ItemCounts = Record<ItemType, number>

export interface TodayStats {
  divers: number
  items: ItemCounts
}

/** 꾸미기 색 (id는 haenyeo/customize.ts 팔레트의 id, 서버가 같은 목록으로 검증) */
export interface LookInfo {
  towel: string
  tewak: string
  cheek: string
}

/** 닉네임 조합 (앞말 + 뒷말, 각 단어 목록 안의 값만 허용. 같은 닉네임이 여럿이어도 됨: 서버는 id로 구분) */
export interface NickParts {
  adj: string
  noun: string
}

export interface PlayerInfo {
  id: number
  nick: string
  look: LookInfo
  zone: Zone
  p?: Vec3
  r?: number
  seat?: number
  st: PlayerStatus
}

// ── 클라이언트 → 서버 ──
export interface HelloMessage {
  t: 'hello'
  v: 1
  token?: string
  device: 'pc' | 'mobile'
  nick: NickParts
  look: LookInfo
}

export type ClientMessage =
  | HelloMessage
  | { t: 'look'; nick: NickParts; look: LookInfo }
  | { t: 'move'; p: Vec3; r: number }
  | { t: 'act'; a: ActionType; item?: ItemType }
  | { t: 'zone'; to: Zone }
  | { t: 'prep'; item: ItemType; how?: 'tap' }
  /** 불턱에서 이 자리로 옮겨 앉고 싶음 (서버가 승인하면 seat 방송) */
  | { t: 'seat'; seat: number }
  | { t: 'ping'; ts: number }

// ── 서버 → 클라이언트 ──
export type ServerMessage =
  | { t: 'queue'; ahead: number }
  | {
      t: 'welcome'
      /** p: 서버가 정해 준 시작 위치 (겹치지 않게) */
      you: { id: number; nick: string; token: string; look: LookInfo; p?: Vec3 }
      room: { id: string; capacity: number }
      players: PlayerInfo[]
      today: TodayStats
    }
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: number }
  | { t: 'look'; id: number; nick: string; look: LookInfo }
  | { t: 'snap'; ts: number; ps: [number, number, number, number, number][] }
  | { t: 'evt'; id: number; a: ActionType; item?: ItemType; nick?: string }
  /** left: 본인에게만, 앞으로 손질할 수 있는 개수 */
  | { t: 'zone'; id: number; zone: Zone; seat?: number; p?: Vec3; left?: ItemCounts }
  /** 누군가 손질 시작 (본인 포함). left: 그 사람이 앞으로 손질할 수 있는 그 종류 개수 */
  | { t: 'prep'; id: number; item: ItemType; how: 'tap'; left?: number }
  /** 공동 대야. full 이면 다 같이 만세 → 잠시 뒤 비운 대야(round + 1) */
  | { t: 'basin'; fill: number; capacity: number; round: number; full?: boolean }
  /** 누군가 자리를 옮기기 시작 (본인 포함): 각 화면이 from → to 같은 길을 걸음. from 이 24 이상이면 담 밖에서 */
  | { t: 'seat'; id: number; from: number; to: number }
  /** 그 자리는 이미 누가 있거나 가는 중 (본인에게만) */
  | { t: 'seat_no'; seat: number }
  | ({ t: 'today' } & TodayStats)
  | { t: 'pong'; ts: number }
  | { t: 'err'; code: string; msg: string }
