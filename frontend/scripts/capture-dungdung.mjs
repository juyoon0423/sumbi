// 둥둥(물 위에 누워 하늘 보기) 확인: 눕기 → 하늘 → 일어나기 연속, 시간대별 하늘(낮 구름·갈매기 / 노을 / 밤 별·달·별똥별 / 새벽),
// 다른 창에서 보이는 누운 해녀, 불턱에선 버튼 없음, 일지 줄, 모바일, 숨 고르기 흔적 없음.
// 사용법: 프론트 + 백엔드 실행 중에  node scripts/capture-dungdung.mjs <출력폴더>
import { chromium, devices } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/dungdung'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const CUSTOM = { adj: '반짝이는', noun: '윤슬', towel: 'white', tewak: 'orange', cheek: 'pink' }
const CUSTOM2 = { adj: '느긋한', noun: '물결', towel: 'blue', tewak: 'yellow', cheek: 'peach' }

async function open(query, custom = CUSTOM, ctxOpts = { viewport: { width: 1280, height: 800 } }) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts })
  await ctx.addInitScript((c) => localStorage.setItem('sumbi.custom', JSON.stringify(c)), custom)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    console.log('pageerror', e.message)
    failures.push('pageerror: ' + e.message)
  })
  await page.goto(BASE + query)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus !== 'connecting', null, { timeout: 10000 })
  await page.waitForTimeout(800)
  return { ctx, page }
}
const shot = async (page, file) => {
  await page.screenshot({ path: join(out, `${file}.jpg`), type: 'jpeg', quality: 80 })
  console.log('saved', file)
}
const st = (page) => page.evaluate(() => window.__sumbi.player.pose.state)
const noBreathe = async (page, where) => check(!(await page.evaluate(() => document.body.innerText.includes('숨 고르기'))), `${where}: "숨 고르기" 글자 없음`)

// ── 1) 낮: 눕기 → 하늘 → 일어나기, 다른 창에서 보기 ──
console.log('낮')
const A = await open('?time=day')
const B = await open('?time=day', CUSTOM2)
const a = A.page
const b = B.page
check((await a.evaluate(() => window.__sumbi.game.getState().netStatus)) === 'online', '백엔드에 연결됨')
await noBreathe(a, '시작 화면')
// 다른 창의 해녀를 내 곁(앞쪽)에 둠
const me = await a.evaluate(() => {
  const { player } = window.__sumbi
  player.pos.set(6, 0, 10)
  return { x: 6, z: 10 }
})
await b.evaluate(({ x, z }) => {
  const { player } = window.__sumbi
  player.pos.set(x - 3.2, 0, z + 2.2)
}, me)
await wait(1500)
check(await a.getByRole('button', { name: /둥둥/ }).isVisible(), '바다: 둥둥 버튼이 보임')
await shot(a, 'dd-day-0-before')
await a.keyboard.press('KeyF')
await wait(400)
check((await st(a)) === 'float', 'F 키: 누움 (state=float)')
await shot(a, 'dd-day-1-lying')
await wait(1600)
await shot(a, 'dd-day-2-settling')
// 잠수 안 됨
await a.keyboard.down('Space')
await wait(1200)
await a.keyboard.up('Space')
check(!(await a.evaluate(() => window.__sumbi.game.getState().diving)) && (await st(a)) === 'float', '누워 있는 동안 잠수 안 됨')
check(!(await a.locator('.breath-track').isVisible().catch(() => false)), '숨 게이지 안 보임')
await wait(5200)
const calm = await a.evaluate(() => ({ calm: !!document.querySelector('.hud.calm'), wake: !!document.querySelector('.float-wake') }))
check(calm.calm && calm.wake, '몇 초 뒤 UI 가 숨고 "일어나기"만 남음')
await shot(a, 'dd-day-3-calm-sky')
await a.evaluate(() => window.__sumbi.gulls())
await wait(7500)
await shot(a, 'dd-day-4-gulls')
// 하늘 둘러보기 (끌기) → 놓으면 천천히 기본 구도로
await a.mouse.move(640, 400)
await a.mouse.down()
await a.mouse.move(420, 520, { steps: 12 })
await a.mouse.up()
await wait(300)
const look = await a.evaluate(() => ({ ...window.__sumbi.float.cam }))
check(Math.abs(look.yaw) > 0.3 && look.pitch > 0.1, `끌어서 하늘을 둘러봄 (yaw ${look.yaw.toFixed(2)}, pitch ${look.pitch.toFixed(2)})`)
check(!(await a.evaluate(() => !!document.querySelector('.hud.calm'))), '마우스를 움직이면 UI 가 돌아옴')
await shot(a, 'dd-day-5-look-around')
await wait(9000)
const back = await a.evaluate(() => ({ ...window.__sumbi.float.cam }))
check(Math.abs(back.yaw) < Math.abs(look.yaw) * 0.5, '손을 떼면 기본 구도로 돌아감')

// 다른 창: 누운 해녀가 보임 (+ 가끔 ☁️)
const remote = await b.evaluate(() => [...window.__sumbi.remotes.values()].map((r) => r.pose.state))
check(remote.includes('float'), `다른 창에서 누운 해녀로 보임 (${remote.join(',')})`)
await b.evaluate(({ x, z }) => {
  const { cameraRig, player } = window.__sumbi
  cameraRig.yaw = Math.atan2(player.pos.x - x, player.pos.z - z) + 0.4
  cameraRig.pitch = 0.32
  cameraRig.distance = 4.5
}, me)
let mark = false
for (let i = 0; i < 30 && !mark; i++) {
  mark = await b.evaluate(() => [...document.querySelectorAll('.float-mark')].some((e) => getComputedStyle(e).opacity > 0.6))
  if (!mark) await wait(500)
}
check(mark, '다른 창: 누운 해녀 머리 위에 ☁️')
await shot(b, 'dd-day-6-other-window')

// 일어나기 (이동 키)
await a.mouse.move(600, 380)
await a.keyboard.down('KeyW')
await wait(250)
await a.keyboard.up('KeyW')
check((await st(a)) === 'floatUp', '이동 키: 몸을 뒤집어 일어남')
await shot(a, 'dd-day-7-getting-up')
await wait(1000)
await shot(a, 'dd-day-8-up')
await wait(1800)
check((await st(a)).startsWith('surface'), '일어난 뒤 다시 떠 있는 자세')
await shot(a, 'dd-day-9-behind-again')
await wait(600)
const remote2 = await b.evaluate(() => [...window.__sumbi.remotes.values()].map((r) => r.pose.state))
check(!remote2.includes('float'), '다른 창에서도 일어남')

// 버튼으로도
await a.getByRole('button', { name: /둥둥/ }).click()
await wait(500)
check((await st(a)) === 'float', '버튼: 누움')
await a.mouse.move(700, 420)
await a.getByRole('button', { name: /일어나기/ }).first().click()
await wait(300)
check((await st(a)) === 'floatUp', '버튼: 일어남')
await wait(1500)

// 일지: 둥둥 줄
const entry = await a.evaluate(async () => {
  const j = await import('/src/journal/journal.ts')
  const c = await import('/src/journal/card.ts')
  window.__sumbi.session.setState({ floatMs: 12 * 60000 + 8000, shootingStar: true })
  const e = j.currentEntry()
  const card = c.drawCard(e, null, 'Pretendard, sans-serif')
  return { floatMs: e.floatMs, star: e.shootingStar, line: c.skyLine(e.floatMs), url: card.toDataURL('image/jpeg', 0.8) }
})
check(entry.line === '하늘을 12분 바라봤어요' && entry.star, `일지: "${entry.line}" · 별똥별`)
writeFileSync(join(out, 'dd-journal-card.jpg'), Buffer.from(entry.url.split(',')[1], 'base64'))
console.log('saved dd-journal-card')
await A.ctx.close()

// 불턱: 둥둥 버튼 없음
await b.evaluate(() => window.__sumbi.travel('bulteok'))
await wait(4500)
check((await b.evaluate(() => window.__sumbi.bulteok.getState().zone)) === 'bulteok', '불턱 도착')
check(!(await b.getByRole('button', { name: /둥둥/ }).isVisible().catch(() => false)), '불턱: 둥둥 버튼 안 보임')
await b.keyboard.press('KeyF')
await wait(300)
check((await st(b)) !== 'float', '불턱: F 키로 눕지 않음')
await noBreathe(b, '불턱')
await B.ctx.close()

// ── 2) 시간대별 하늘 ──
for (const t of ['sunset', 'night', 'dawn']) {
  console.log(t)
  // 새벽은 별이 아직 남은 이른 시각부터
  const { ctx, page } = await open(t === 'dawn' ? '?hour=5.6' : `?time=${t}`)
  await page.keyboard.press('KeyF')
  await wait(7500)
  await shot(page, `dd-${t}-sky`)
  if (t === 'night') {
    const stars = await page.evaluate(() => window.__sumbi.env.stars)
    check(stars > 0.9, `밤: 별 (stars=${stars.toFixed(2)})`)
    await page.evaluate(() => window.__sumbi.shootingStar())
    await wait(650)
    await shot(page, 'dd-night-shooting-star')
    await wait(400)
    const note = await page.evaluate(() => document.querySelector('.float-note')?.textContent ?? '')
    check(note.includes('별똥별이 떨어졌어요'), '밤: 별똥별을 보면 한 줄 알림')
    check(await page.evaluate(() => window.__sumbi.session.getState().shootingStar), '밤: 일지에 별똥별 기록')
    // 하늘 올려다보기 (은하수)
    await page.evaluate(() => {
      const c = window.__sumbi.float.cam
      c.pitch = 0.9
      c.lastInput = performance.now() + 6000
    })
    await wait(2500)
    await shot(page, 'dd-night-milkyway')
  }
  if (t === 'dawn') {
    // 시간이 흐르면 별이 하나씩 사라지고 하늘이 밝아짐
    const s0 = await page.evaluate(() => window.__sumbi.env.stars)
    await page.evaluate(() => window.__sumbi.setTime(7.2))
    await wait(4000)
    const s1 = await page.evaluate(() => window.__sumbi.env.stars)
    await shot(page, 'dd-dawn-later')
    check(s1 < s0, `새벽: 시간이 흐르면 별이 사라짐 (${s0.toFixed(2)} → ${s1.toFixed(2)})`)
  }
  await noBreathe(page, t)
  await ctx.close()
}

// ── 3) 모바일 ──
console.log('모바일')
{
  const { ctx, page } = await open('?time=day', CUSTOM, { ...devices['iPhone 13'], deviceScaleFactor: 2 })
  await shot(page, 'dd-mobile-0')
  await page.getByRole('button', { name: /둥둥/ }).tap()
  await wait(7000)
  check((await st(page)) === 'float', '모바일: 버튼을 눌러 누움')
  await shot(page, 'dd-mobile-1-sky')
  await page.touchscreen.tap(200, 300)
  await wait(400)
  await shot(page, 'dd-mobile-2-ui-back')
  await ctx.close()
}

await browser.close()
console.log(failures.length ? `\n실패 ${failures.length}개:\n- ${failures.join('\n- ')}` : '\n모두 통과')
process.exit(failures.length ? 1 : 0)
