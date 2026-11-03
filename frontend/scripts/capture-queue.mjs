// 대기열 확인: 동시접속 상한(Redis 키로 서버를 끄지 않고 바꿈) → 대기 중엔 혼자 하는 바다에서 놀기 + 구석에 순번
// → 자리가 나면 "바다에 자리가 났어요" + 들어가기 → 서버 바다로. 상한을 올리면 기다리던 사람에게 바로 자리.
// 사용법: 백엔드(+Redis)·프론트 실행 중에 node scripts/capture-queue.mjs <출력폴더>
//   (상한 키를 잠시 바꿨다가 끝나면 지움. SUMBI_REDIS_CLI 로 redis-cli 명령을 바꿀 수 있음: 예) "docker compose exec -T redis redis-cli")
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const API = process.env.SUMBI_API ?? 'http://localhost:8080'
const REDIS = process.env.SUMBI_REDIS_CLI ?? 'redis-cli'
const out = process.argv[2] ?? 'captures/queue'
mkdirSync(out, { recursive: true })
const KEY = 'sumbi:config:max-total'
const redis = (args) => execSync(`${REDIS} ${args}`).toString().trim()
const health = async () => (await fetch(API + '/health')).json()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
async function until(fn, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await fn()) return true
    await wait(250)
  }
  return false
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
async function open(name, opts = { viewport: { width: 1100, height: 720 } }) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => failures.push(`${name} pageerror: ${e.message}`))
  await page.goto(BASE + '/?hour=13')
  await page.waitForTimeout(1200)
  await page.getByText('바다로 들어가기').click()
  return { ctx, page }
}
const status = (page) => page.evaluate(() => window.__sumbi.game.getState().netStatus)

try {
  const base = (await health()).players
  console.log(`▶ 지금 ${base}명 → 상한 ${base + 1}명으로 (Redis ${KEY})`)
  redis(`SET ${KEY} ${base + 1}`)
  check(await until(async () => (await health()).maxTotal === base + 1, 12000), '서버가 몇 초 안에 새 상한을 읽음 (재시작 없이)')

  const A = await open('A')
  check(await until(async () => (await status(A.page)) === 'online'), 'A 는 바로 바다에')

  console.log('▶ B: 상한이 차서 대기 → 혼자 하는 바다')
  const B = await open('B', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  check(await until(async () => (await status(B.page)) === 'waiting'), 'B 는 대기 (netStatus waiting)')
  await B.page.waitForTimeout(1500)
  const corner = await B.page.locator('.queue-corner').innerText().catch(() => '')
  check(/대기 1번째/.test(corner), `구석에 순번 (${corner})`)
  check(!(await B.page.locator('.slot-card').count()), '아직 자리 카드 없음')
  // 기다리는 동안 혼자 바다에서 헤엄
  const p0 = await B.page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  await B.page.evaluate(() => (window.__sumbi.input.input.stick.y = 1))
  await B.page.waitForTimeout(1200)
  await B.page.evaluate(() => (window.__sumbi.input.input.stick.y = 0))
  const p1 = await B.page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  check(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, '대기 중에도 혼자 바다에서 헤엄')
  await B.page.screenshot({ path: join(out, 'waiting.jpg'), type: 'jpeg', quality: 72 })
  check((await health()).waiting === 1, '서버 대기 1명')

  console.log('▶ A 가 나감 → B 에게 "자리가 났어요"')
  await A.ctx.close()
  check(await until(async () => (await B.page.locator('.slot-card').count()) > 0), 'B 에게 자리 카드')
  await B.page.waitForTimeout(600)
  await B.page.screenshot({ path: join(out, 'slot.jpg'), type: 'jpeg', quality: 72 })
  check((await status(B.page)) === 'waiting', '누르기 전엔 아직 혼자 바다')
  await B.page.getByRole('button', { name: '바다에 들어가기' }).tap()
  check(await until(async () => (await status(B.page)) === 'online'), '들어가기 → 서버 바다 (online)')
  await B.page.waitForTimeout(1500)
  check(!(await B.page.locator('.queue-corner').count()) && !(await B.page.locator('.slot-card').count()), '순번·카드 사라짐')
  check((await B.page.evaluate(() => window.__sumbi.player.pose.state)) === 'surfaceIdle', '수면 시작 위치에서 새로 시작')
  await B.page.screenshot({ path: join(out, 'entered.jpg'), type: 'jpeg', quality: 72 })

  console.log('▶ C: 다시 꽉 참 → 상한을 올리면 바로 자리')
  const C = await open('C')
  check(await until(async () => (await status(C.page)) === 'waiting'), 'C 대기')
  redis(`SET ${KEY} ${base + 2}`)
  check(await until(async () => (await C.page.locator('.slot-card').count()) > 0, 12000), '상한을 올리자 C 에게 자리 카드 (재시작 없이)')
  await C.page.getByRole('button', { name: '바다에 들어가기' }).click()
  check(await until(async () => (await status(C.page)) === 'online'), 'C 입장')
  const h = await health()
  check(h.players === base + 2 && h.waiting === 0, `서버 인원 ${h.players} / 상한 ${h.maxTotal}, 대기 ${h.waiting}`)
  check(await until(async () => (await B.page.evaluate(() => window.__sumbi.remotes.size)) >= 1), 'B 화면에 C 가 보임')
  await C.ctx.close()
  await B.ctx.close()
} finally {
  redis(`DEL ${KEY}`)
  await browser.close()
}
console.log(failures.length ? `\n실패 ${failures.length}개:\n- ${failures.join('\n- ')}` : '\n모두 통과')
process.exit(failures.length ? 1 : 0)
