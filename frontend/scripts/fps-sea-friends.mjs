// 바다 친구들 전후 프레임 수: 휴대폰 크기(390×844, 배율 3)에서 수면 · 물속(바닥 근처) · 둥둥, 낮·밤.
// 사용법: 프론트 실행 중에  node scripts/fps-sea-friends.mjs <출력폴더> <접두어>   (SUMBI_QUALITY=medium 처럼 품질 고정 가능)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/sea-friends'
const tag = process.argv[3] ?? 'cur'
const Q = process.env.SUMBI_QUALITY ? `&quality=${process.env.SUMBI_QUALITY}` : ''
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const fps = (page, ms = 5000) =>
  page.evaluate(
    (ms) =>
      new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const step = () => {
          n++
          if (performance.now() - t0 < ms) requestAnimationFrame(step)
          else res((n * 1000) / (performance.now() - t0))
        }
        requestAnimationFrame(step)
      }),
    ms,
  )

const rows = []
for (const [name, hour] of [
  ['day', 13],
  ['night', 23],
]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => localStorage.setItem('sumbi.custom', JSON.stringify({ adj: '반짝이는', noun: '윤슬', towel: 'white', tewak: 'orange', cheek: 'pink' })))
  const page = await ctx.newPage()
  await page.goto(`${BASE}?hour=${hour}${Q}`)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus !== 'connecting', null, { timeout: 10000 })
  await page.evaluate(() => {
    const { player, cameraRig } = window.__sumbi
    player.pos.set(2, player.pos.y, 14)
    cameraRig.lastDragAt = performance.now() + 1e9
  })
  await wait(2000)
  const surface = await fps(page)
  // 물속: 계속 잠수(톡) → 바닥 근처
  await page.evaluate(() => window.__sumbi.input.setDiveLatch(true))
  await wait(5000)
  const under = await fps(page)
  await page.screenshot({ path: join(out, `${tag}-${name}-mobile-under.jpg`), type: 'jpeg', quality: 80 })
  await page.evaluate(() => window.__sumbi.input.setDiveLatch(false))
  await page.waitForFunction(() => window.__sumbi.player.pose.state === 'surfaceIdle', null, { timeout: 20000 })
  await page.evaluate(() => window.__sumbi.float.start())
  await wait(3000)
  const float = await fps(page)
  const level = await page.evaluate(() => window.__sumbi.quality.getState().level)
  rows.push({ name, level, surface: +surface.toFixed(1), under: +under.toFixed(1), float: +float.toFixed(1) })
  console.log(name, level, 'surface', surface.toFixed(1), 'under', under.toFixed(1), 'float', float.toFixed(1))
  await ctx.close()
}
writeFileSync(join(out, `${tag}-fps.json`), JSON.stringify(rows, null, 2))
await browser.close()
