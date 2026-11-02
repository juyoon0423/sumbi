// 형용사 + 자연 단어 닉네임 (오프라인용. 3단계부터는 서버가 생성)

const ADJECTIVES = [
  '느린', '작은', '고요한', '따뜻한', '포근한', '잔잔한', '말랑한', '둥근',
  '수줍은', '졸린', '맑은', '느긋한', '반짝이는', '부드러운', '조용한', '푸른',
]

const NATURE_WORDS = [
  '파도', '소라', '물결', '돌담', '전복', '성게', '해초', '갈매기',
  '조약돌', '물거품', '바닷바람', '윤슬', '테왁', '현무암', '노을', '등대',
]

export function generateNickname(rand: () => number = Math.random) {
  const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]
  const n = NATURE_WORDS[Math.floor(rand() * NATURE_WORDS.length)]
  return `${a} ${n}`
}

const NICK_KEY = 'sumbi.nickname'

/** 브라우저에 기억된 닉네임. 없으면 새로 만들어 저장 */
export function loadOrCreateNickname(): string {
  try {
    const saved = localStorage.getItem(NICK_KEY)
    if (saved) return saved
    const nick = generateNickname()
    localStorage.setItem(NICK_KEY, nick)
    return nick
  } catch {
    return generateNickname()
  }
}
