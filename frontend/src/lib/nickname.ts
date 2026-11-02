import { NICK_ADJECTIVES, NICK_NOUNS, nickOf } from '../haenyeo/customize'

/** 무작위 닉네임 (개발용 가짜 이웃 등). 내 닉네임은 store/customizeStore.ts */
export function generateNickname(rand: () => number = Math.random) {
  return nickOf({
    adj: NICK_ADJECTIVES[Math.floor(rand() * NICK_ADJECTIVES.length)],
    noun: NICK_NOUNS[Math.floor(rand() * NICK_NOUNS.length)],
  })
}
