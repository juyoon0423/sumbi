// 불턱 확인: 브라우저 3개가 바다에서 해산물을 따고 불턱에 둘러앉아 손질 → 대야가 차고 가득 차면 다 같이 만세.
// 쉬기(귤·졸기), "내가 딴 것만" 손질, 바다로 돌아가기, 나중에 들어온 사람이 앉은 해녀를 보는지까지.
// 사용법: 백엔드(SUMBI_BASIN_CAPACITY=6 권장) + 프론트 실행 중에  node scripts/capture-bulteok.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/bulteok'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}

const PEOPLE = {
  A: { adj: '작은', noun: '소라', towel: 'white', tewak: 'orange', cheek: 'pink' },
  B: { adj: '몽글몽글한', noun: '돌고래', towel: 'pink', tewak: 'yellow', cheek: 'rose' },
  C: { adj: '고요한', noun: '윤슬', towel: 'mint', tewak: 'scarlet', cheek: 'coral' },
  D: { adj: '따뜻한', noun: '돌담', towel: 'sky', tewak: 'amber', cheek: 'peach' },
}

async function open(name, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((custom) => {
    localStorage.setItem('sumbi.custom', JSON.stringify(custom))
    // 매번 같은 결과가 나오게 오늘 기록은 비우고 시작
    localStorage.removeItem('sumbi.basket')
    localStorage.removeItem('sumbi.prepped')
  }, PEOPLE[name])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message))
  await page.goto(BASE + query)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus === 'online', null, { timeout: 10000 })
  return { name, ctx, page }
}
const shot = async (who, file) => {
  await who.page.screenshot({ path: join(out, `${file}.png`) })
  console.log('saved', file)
}
const selfId = (who) => who.page.evaluate(() => window.__sumbi.game.getState().selfId)

/** 바다에서 따 온 것처럼: 서버에 dive → harvest(1초 간격) → surface, 내 망사리에도 넣음 */
async function harvest(who, items) {
  await who.page.evaluate(async (items) => {
    const { net, game } = window.__sumbi
    net.send({ t: 'act', a: 'dive' })
    for (const it of items) {
      await new Promise((r) => setTimeout(r, 1100))
      net.send({ t: 'act', a: 'harvest', item: it })
      game.getState().addToBasket(it)
    }
    net.send({ t: 'act', a: 'surface' })
  }, items)
}

const toBulteok = async (who) => {
  await who.page.evaluate(() => window.__sumbi.travel('bulteok'))
  await who.page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'bulteok' && !window.__sumbi.bulteok.getState().traveling, null, { timeout: 8000 })
}

/** 카메라: 해녀 앞쪽에서 비스듬히 (얼굴과 옆 사람이 보이게) */
const frontCam = (who, turn = 0.5, dist = 3.2, pitch = 0.3) =>
  who.page.evaluate(
    ([turn, dist, pitch]) => {
      const { player, cameraRig } = window.__sumbi
      cameraRig.yaw = player.yaw + turn
      cameraRig.distance = dist
      cameraRig.pitch = pitch
    },
    [turn, dist, pitch],
  )

const A = await open('A')
const B = await open('B')
const C = await open('C')
const ids = { A: await selfId(A), B: await selfId(B), C: await selfId(C) }
console.log('ids', ids)

// 1) 바다에서 따기 (A: 소라 2·전복 1, B: 성게 2·소라 1, C: 전복 1·성게 1)
await Promise.all([harvest(A, ['conch', 'conch', 'abalone']), harvest(B, ['urchin', 'urchin', 'conch']), harvest(C, ['abalone', 'urchin'])])
await wait(400)

// 2) 불턱으로
await toBulteok(A)
await toBulteok(B)
await toBulteok(C)
await wait(800)
const seen = await A.page.evaluate(() => [...window.__sumbi.remotes.values()].map((r) => ({ id: r.id, zone: r.zone, seat: r.seat })))
console.log('A sees', seen)
check(seen.filter((r) => r.zone === 'bulteok').length === 2, 'A 화면: B·C 가 불턱에 앉아 있음')
const left = await A.page.evaluate(() => window.__sumbi.bulteok.getState().serverLeft)
check(left && left.conch === 2 && left.abalone === 1 && left.urchin === 0, `A 손질 가능 개수 = 서버가 센 딴 개수 (${JSON.stringify(left)})`)
check(await A.page.evaluate(() => window.__sumbi.player.pose.state === 'sit'), 'A 해녀가 앉아 있음')
await frontCam(A, Math.PI, 6.2, 0.38)
await wait(900)
await shot(A, 'bt-1-A-circle-from-behind')
await frontCam(A, 0.55, 3.0, 0.22)
await wait(900)
await shot(A, 'bt-2-A-warming-hands')

// 3) "내가 딴 것만": C 는 소라를 안 땄음
await C.page.evaluate(() => window.__sumbi.net.send({ t: 'prep', item: 'conch' }))
await C.page.waitForFunction(() => document.body.innerText.includes('따 온 것만'), null, { timeout: 3000 }).catch(() => {})
check(await C.page.evaluate(() => document.body.innerText.includes('따 온 것만')), 'C: 안 딴 소라는 손질 못 함 (안내 말풍선)')

// 4) 손질: B 성게, A 소라, C 전복 — 서로 화면에서 같은 모션 + 토스트
await frontCam(B, 0.5, 3.5, 0.1)
await B.page.locator('.prep', { hasText: '성게' }).click()
await A.page.waitForFunction(() => document.body.innerText.includes('성게 알을 꺼냈어요'), null, { timeout: 3000 }).catch(() => {})
check(await A.page.evaluate(() => document.body.innerText.includes('몽글몽글한 돌고래님이 성게 알을 꺼냈어요')), 'A 화면: B 성게 손질 토스트')
const bOnA = await A.page.evaluate((id) => window.__sumbi.remotes.get(id)?.pose.act, ids.B)
check(bOnA === 'prep', `A 화면의 B 가 손질 모션 중 (${bOnA})`)
await wait(1100)
await shot(B, 'bt-3-B-urchin-scoop')
await wait(800)
await shot(B, 'bt-4-B-urchin-taste')
await wait(1400)

await frontCam(A, 0.5, 3.5, 0.1)
await A.page.keyboard.press('Digit2') // 소라 단축키
await wait(700)
await shot(A, 'bt-5-A-conch-tap')
await wait(1400)
await shot(A, 'bt-6-A-conch-meat')
await wait(1200)

await frontCam(C, 0.5, 3.5, 0.1)
await C.page.locator('.prep', { hasText: '전복' }).click()
await wait(1900)
await shot(C, 'bt-7-C-abalone-shine')
await wait(1500)

// 5) 대야 채우기 → 가득 차면 셋 다 만세 (SUMBI_BASIN_CAPACITY=6: 위에서 3개 + 3개 더)
const fillBefore = await A.page.evaluate(() => window.__sumbi.bulteok.getState().basin)
console.log('basin', fillBefore)
check(fillBefore.fill === 3, `손질 3개 → 대야 3 (${fillBefore.fill}/${fillBefore.capacity})`)
await shot(A, 'bt-8-basin-filling')
await B.page.locator('.prep', { hasText: '성게' }).click()
await A.page.locator('.prep', { hasText: '소라' }).click()
await C.page.locator('.prep', { hasText: '성게' }).click()
await A.page.waitForFunction(() => window.__sumbi.bulteok.getState().basin.full, null, { timeout: 8000 }).catch(() => {})
check(await A.page.evaluate(() => window.__sumbi.bulteok.getState().basin.full), '대야가 가득 참')
await frontCam(A, 0, 6.2, 0.4)
await wait(350)
const cel = await A.page.evaluate(() => ({
  me: window.__sumbi.player.pose.celebrateTime >= 0,
  others: [...window.__sumbi.remotes.values()].filter((r) => r.zone === 'bulteok').every((r) => r.pose.celebrateTime >= 0),
}))
check(cel.me && cel.others, 'A 화면: 불턱의 해녀 모두 만세')
check(await A.page.evaluate(() => document.body.innerText.includes('대야가 가득 찼어요')), '가득 참 토스트')
await shot(A, 'bt-9-basin-full-celebrate')
await C.page.waitForTimeout(200)
await shot(C, 'bt-9-C-celebrate')
await A.page.waitForFunction(() => window.__sumbi.bulteok.getState().basin.round === 2, null, { timeout: 8000 }).catch(() => {})
const next = await A.page.evaluate(() => window.__sumbi.bulteok.getState().basin)
check(next.round === 2 && !next.full && next.capacity === 12, `비운 뒤 다음 대야 (${JSON.stringify(next)})`)

// 6) 쉬기: A 귤 까먹기, B 졸기 (zzz)
await frontCam(A, 0.5, 3.5, 0.1)
await A.page.keyboard.press('KeyT')
await wait(2300)
await shot(A, 'bt-10-A-tangerine')
await B.page.locator('.action', { hasText: '졸기' }).click()
await frontCam(B, 0.45, 3.5, 0.1)
await A.page.waitForFunction(() => document.body.innerText.includes('꾸벅꾸벅 졸아요'), null, { timeout: 3000 }).catch(() => {})
check(await A.page.evaluate(() => document.body.innerText.includes('꾸벅꾸벅 졸아요')), 'A 화면: B 졸기 토스트')
check(await A.page.evaluate((id) => window.__sumbi.remotes.get(id)?.pose.act === 'doze', ids.B), 'A 화면의 B 가 졸고 있음')
await wait(1500)
await shot(B, 'bt-11-B-dozing-zzz')

// 7) 나중에 들어온 D 도 앉아 있는 해녀를 봄 (B 는 조는 중)
const D = await open('D')
await wait(800)
const dSees = await D.page.evaluate(() => [...window.__sumbi.remotes.values()].map((r) => ({ zone: r.zone, act: r.pose.act })))
check(dSees.filter((r) => r.zone === 'bulteok').length === 3, 'D(나중에 들어옴): 불턱의 3명이 앉아 보임')
check(dSees.some((r) => r.act === 'doze'), 'D: 조는 해녀도 졸고 있음')

// 8) C 바다로 → A·D 화면에서 C 가 바다로
await C.page.locator('.action', { hasText: '바다로' }).click()
await C.page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'sea', null, { timeout: 8000 })
await wait(600)
check(await A.page.evaluate((id) => window.__sumbi.remotes.get(id)?.zone === 'sea', ids.C), 'C 가 바다로 → A 화면에서도 바다에')
check(await C.page.evaluate(() => window.__sumbi.player.pose.state.startsWith('surface') && window.__sumbi.player.pos.z > -30), 'C 는 불턱 아래 바닷가 수면에')
await shot(C, 'bt-12-C-back-to-sea')

for (const w of [A, B, C, D]) await w.ctx.close()
await browser.close()
console.log(failures.length ? `실패 ${failures.length}개` : '모두 통과')
process.exit(failures.length ? 1 : 0)
