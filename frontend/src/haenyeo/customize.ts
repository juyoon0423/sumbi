// 해녀 꾸미기: 고를 수 있는 색과 닉네임 단어 목록.
// 서버(3단계)도 같은 목록으로 hello/look 메시지를 검증한다 → 목록을 바꾸면 백엔드 목록도 같이 바꿀 것.

export interface Swatch {
  id: string
  color: string
  label: string
}

/** 물수건: 파스텔 8색 */
export const TOWEL_PALETTE: Swatch[] = [
  { id: 'white', color: '#f6f1e7', label: '하양' },
  { id: 'sky', color: '#cfe6f6', label: '하늘' },
  { id: 'pink', color: '#f8d5dd', label: '분홍' },
  { id: 'yellow', color: '#f8ecbd', label: '노랑' },
  { id: 'mint', color: '#d5ecd3', label: '민트' },
  { id: 'lilac', color: '#e4daf3', label: '연보라' },
  { id: 'peach', color: '#fbdcc8', label: '살구' },
  { id: 'gray', color: '#e3e5e8', label: '연회색' },
]

/** 테왁: 따뜻한 주황 위주 6색 */
export const TEWAK_PALETTE: Swatch[] = [
  { id: 'orange', color: '#f5862b', label: '주황' },
  { id: 'tangerine', color: '#f89a2f', label: '귤빛' },
  { id: 'scarlet', color: '#ef6a3a', label: '다홍' },
  { id: 'sunset', color: '#f27d55', label: '노을' },
  { id: 'amber', color: '#f6ac3c', label: '호박' },
  { id: 'yellow', color: '#f5c242', label: '노랑' },
]

/** 볼: 4색 */
export const CHEEK_PALETTE: Swatch[] = [
  { id: 'pink', color: '#f5a8a2', label: '분홍' },
  { id: 'peach', color: '#f7b48f', label: '복숭아' },
  { id: 'rose', color: '#ee8fa0', label: '장밋빛' },
  { id: 'coral', color: '#f39a7e', label: '산호' },
]

/** 닉네임 앞 단어: 따뜻하고 차분한 말만 (어느 뒷말과 붙어도 어색하지 않게) */
export const NICK_ADJECTIVES = [
  '느린', '작은', '고요한', '따뜻한', '포근한', '잔잔한', '말랑한', '둥근',
  '수줍은', '졸린', '맑은', '느긋한', '반짝이는', '부드러운', '조용한', '푸른',
  '다정한', '상냥한', '해맑은', '보송한', '동그란', '몽글몽글한', '산뜻한', '싱그러운',
  '아늑한', '순한', '차분한', '은은한', '향긋한', '설레는', '꿈꾸는', '노래하는',
  '웃는', '사뿐한', '너그러운', '소박한',
]

/** 닉네임 뒷 단어: 바다와 제주 */
export const NICK_NOUNS = [
  '파도', '소라', '물결', '돌담', '전복', '성게', '해초', '갈매기',
  '조약돌', '물거품', '바닷바람', '윤슬', '테왁', '현무암', '노을', '등대',
  '감귤', '동백', '오름', '수평선', '모래알', '미역', '돌고래', '바당',
  '올레', '유채꽃', '수선화', '한라봉', '숨비소리', '달빛', '별빛', '조개',
  '몽돌', '물빛', '해님', '산호',
]

export interface Customization {
  towel: string
  tewak: string
  cheek: string
  adj: string
  noun: string
}

const pick = <T,>(list: readonly T[], rand = Math.random) => list[Math.floor(rand() * list.length)]

/** 다른 값이 나올 때까지 다시 뽑기 (🎲 눌렀는데 그대로면 심심하니까) */
export function reroll<T>(list: readonly T[], current: T): T {
  if (list.length < 2) return current
  let next = current
  while (next === current) next = pick(list)
  return next
}

export function randomCustomization(): Customization {
  return {
    towel: pick(TOWEL_PALETTE).id,
    tewak: pick(TEWAK_PALETTE).id,
    cheek: pick(CHEEK_PALETTE).id,
    adj: pick(NICK_ADJECTIVES),
    noun: pick(NICK_NOUNS),
  }
}

/** 저장된 값/받은 값 검증: 목록에 없는 값은 버리고 랜덤으로 채움 */
export function sanitizeCustomization(raw: Partial<Customization> | null | undefined): Customization {
  const fallback = randomCustomization()
  const has = (list: Swatch[], id?: string) => !!id && list.some((s) => s.id === id)
  return {
    towel: has(TOWEL_PALETTE, raw?.towel) ? raw!.towel! : fallback.towel,
    tewak: has(TEWAK_PALETTE, raw?.tewak) ? raw!.tewak! : fallback.tewak,
    cheek: has(CHEEK_PALETTE, raw?.cheek) ? raw!.cheek! : fallback.cheek,
    adj: raw?.adj && NICK_ADJECTIVES.includes(raw.adj) ? raw.adj : fallback.adj,
    noun: raw?.noun && NICK_NOUNS.includes(raw.noun) ? raw.noun : fallback.noun,
  }
}

export const nickOf = (c: Pick<Customization, 'adj' | 'noun'>) => `${c.adj} ${c.noun}`

export const swatchColor = (list: Swatch[], id: string) => (list.find((s) => s.id === id) ?? list[0]).color
