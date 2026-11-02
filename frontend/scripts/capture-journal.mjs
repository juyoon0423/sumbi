// 물질 일지 확인: 바다에서 지내다 "물질 마치기" → 카드(내 해녀 + 시간대 풍경 + 기록), 이미지로 저장(내려받기),
// 계속하기 / 바다 떠나기 → 다시 들어오기, 기록은 브라우저에만, 휴대폰 화면에서도 카드가 들어감.
// 사용법: 백엔드 + 프론트 실행 중에  node scripts/capture-journal.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/journal'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}

async function open(custom, query = '', opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true, ...opts })
  await ctx.addInitScript((c) => {
    localStorage.setItem('sumbi.custom', JSON.stringify(c))
    if (!sessionStorage.getItem('kept')) {
      localStorage.removeItem('sumbi.journal')
      sessionStorage.setItem('kept', '1')
    }
  }, custom)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(BASE + query)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus === 'online', null, { timeout: 10000 })
  await page.waitForTimeout(800)
  return { ctx, page }
}
const shot = async (page, file) => {
  await page.screenshot({ path: join(out, `${file}.png`) })
  console.log('saved', file)
}
/** 이번 물질을 23분째인 것처럼 + 딴 것·손질한 것·숨 고르기 */
const fakeSession = (page) =>
  page.evaluate(() => {
    const s = window.__sumbi.session
    s.setState({
      startedAt: Date.now() - 23 * 60_000 - 20_000,
      harvested: { conch: 3, abalone: 1, urchin: 2 },
      prepped: { conch: 1, abalone: 0, urchin: 1 },
      breaths: 3,
    })
  })

const ME = { adj: '작은', noun: '소라', towel: 'white', tewak: 'orange', cheek: 'pink' }
const A = await open(ME, '?time=day')
const B = await open({ adj: '고요한', noun: '윤슬', towel: 'mint', tewak: 'yellow', cheek: 'coral' }, '?time=day')
await wait(600)

// 1) 실제로 잠수 4초 → 떠오르며 숨비소리 → 기록 1
await A.page.keyboard.down('Space')
await wait(4200)
await A.page.keyboard.up('Space')
await A.page.waitForFunction(() => window.__sumbi.session.getState().sumbi >= 1, null, { timeout: 10000 }).catch(() => {})
await wait(1500)
const sess = await A.page.evaluate(() => ({ sumbi: window.__sumbi.session.getState().sumbi, met: window.__sumbi.session.getState().met.size }))
check(sess.sumbi === 1, `잠수하고 떠오르면 숨비소리 1번 기록 (${sess.sumbi})`)
check(sess.met === 1, `같은 바다의 해녀 1명을 만남 (${sess.met})`)

// 2) 물질 마치기 → 카드 (낮)
await fakeSession(A.page)
await A.page.getByRole('button', { name: /물질 마치기/ }).click()
await A.page.waitForSelector('.journal-image img', { timeout: 8000 })
await wait(500)
await shot(A.page, 'jn-1-day-overlay')
const alt = await A.page.getAttribute('.journal-image img', 'alt')
check(alt?.includes('23분 머물렀어요'), `카드: "오늘 바다에 23분 머물렀어요" (${alt})`)
const rec = await A.page.evaluate(() => JSON.parse(localStorage.getItem('sumbi.journal') ?? '[]'))
check(rec.length === 1 && rec[0].minutes === 23 && rec[0].sumbi === 1 && rec[0].met === 1 && rec[0].preset === 'day', `브라우저에 기록 저장 (${JSON.stringify(rec[0])})`)

// 이미지로 저장 → 내려받기 (카드 PNG 그대로 보관)
const [download] = await Promise.all([A.page.waitForEvent('download', { timeout: 5000 }), A.page.getByRole('button', { name: '이미지로 저장' }).click()])
check(/^sumbi-\d{4}-\d{2}-\d{2}\.png$/.test(download.suggestedFilename()), `이미지로 저장 → ${download.suggestedFilename()}`)
await download.saveAs(join(out, 'jn-2-day-card.png'))

// 계속 물질하기 → 창 닫힘, 계속 바다
await A.page.getByRole('button', { name: '계속 물질하기' }).click()
check(await A.page.evaluate(() => !document.querySelector('.journal-overlay') && window.__sumbi.game.getState().phase === 'playing'), '계속 물질하기 → 바다로 돌아옴')

// 3) 밤 카드 (시간대만 바꿔서), 불턱에 앉은 모습
await A.page.evaluate(() => window.__sumbi.setTime('night'))
await A.page.evaluate(() => window.__sumbi.travel('bulteok'))
await A.page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'bulteok', null, { timeout: 8000 })
await wait(5000)
await A.page.getByRole('button', { name: /물질 마치기/ }).click()
await A.page.waitForSelector('.journal-image img', { timeout: 8000 })
const [dl2] = await Promise.all([A.page.waitForEvent('download'), A.page.getByRole('button', { name: '이미지로 저장' }).click()])
await dl2.saveAs(join(out, 'jn-3-night-bulteok-card.png'))
const rec2 = await A.page.evaluate(() => JSON.parse(localStorage.getItem('sumbi.journal') ?? '[]'))
check(rec2.length === 1 && rec2[0].preset === 'night', `같은 물질은 기록 하나로 덮어씀 (${rec2.length}개, ${rec2[0].preset})`)

// 4) 바다 떠나기 → 입장 화면, 연결 끊김 (B 화면에서 A 가 사라짐) → 다시 들어오면 새 물질
const aId = await A.page.evaluate(() => window.__sumbi.game.getState().selfId)
await A.page.getByRole('button', { name: '바다 떠나기' }).click()
await A.page.waitForSelector('text=바다로 들어가기', { timeout: 5000 })
await wait(1200)
check(await B.page.evaluate((id) => !window.__sumbi.remotes.has(id), aId), '바다 떠나기 → 다른 사람 화면에서 사라짐')
await A.page.getByRole('button', { name: '바다로 들어가기' }).click()
await A.page.waitForFunction(() => window.__sumbi.game.getState().netStatus === 'online' && window.__sumbi.game.getState().selfId !== null, null, { timeout: 10000 })
await wait(800)
const fresh = await A.page.evaluate(() => ({ sumbi: window.__sumbi.session.getState().sumbi, age: Date.now() - window.__sumbi.session.getState().startedAt, zone: window.__sumbi.bulteok.getState().zone }))
check(fresh.sumbi === 0 && fresh.age < 5000 && fresh.zone === 'sea', `다시 들어오면 새 물질, 바다에서 시작 (${JSON.stringify(fresh)})`)
check(await B.page.evaluate(() => window.__sumbi.remotes.size === 1), 'B 화면에 다시 들어온 A 가 보임')

// 5) 휴대폰 화면 (390×844): 카드와 버튼이 화면 안에
const M = await open(ME, '?time=sunset', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await fakeSession(M.page)
await M.page.getByRole('button', { name: /물질 마치기/ }).click()
await M.page.waitForSelector('.journal-image img', { timeout: 8000 })
await wait(400)
const fit = await M.page.evaluate(() => {
  const r = document.querySelector('.journal-panel').getBoundingClientRect()
  return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
})
check(fit, '휴대폰 화면: 카드·버튼이 화면 안에')
await shot(M.page, 'jn-4-mobile-sunset-overlay')

for (const w of [A, B, M]) await w.ctx.close()
await browser.close()
console.log(failures.length ? `실패 ${failures.length}개` : '모두 통과')
process.exit(failures.length ? 1 : 0)
