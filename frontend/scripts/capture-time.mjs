// 시간대 확인: 새벽·낮·노을·밤 (?time=) 수면 풍경, 밤 물속 플랑크톤(가만히 / 헤엄칠 때), 밤 불턱, 낮→밤 부드러운 전환.
// 사용법: 프론트 실행 중에 (백엔드는 없어도 됨)  node scripts/capture-time.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/time'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const CUSTOM = { adj: '반짝이는', noun: '윤슬', towel: 'white', tewak: 'orange', cheek: 'pink' }

async function open(query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((c) => localStorage.setItem('sumbi.custom', JSON.stringify(c)), CUSTOM)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(BASE + query)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus !== 'connecting', null, { timeout: 10000 })
  await page.waitForTimeout(600)
  return { ctx, page }
}
const shot = async (page, file) => {
  await page.screenshot({ path: join(out, `${file}.png`) })
  console.log('saved', file)
}
/** 해안(불턱·오름) 쪽을 보는 수면 풍경 */
const coastView = (page) =>
  page.evaluate(() => {
    const { player, cameraRig } = window.__sumbi
    player.pos.set(8, 0, 2)
    player.yaw = Math.PI
    cameraRig.yaw = 0.15 // 카메라가 해녀 뒤(+z)에서 해안(-z) 쪽으로
    cameraRig.distance = 6.5
    cameraRig.pitch = 0.12
  })

// 1) 시간대 네 가지
for (const [t, label] of [['dawn', '새벽'], ['day', '낮'], ['sunset', '노을'], ['night', '밤']]) {
  const { ctx, page } = await open(`?time=${t}`)
  await coastView(page)
  await wait(1500)
  const e = await page.evaluate(() => ({ hour: window.__sumbi.env.hour, night: window.__sumbi.env.night, sunY: window.__sumbi.env.sunDir.y }))
  console.log(t, JSON.stringify(e))
  await shot(page, `tm-${t}-surface`)
  if (t === 'night') {
    check(e.night > 0.95, `${label}: 한밤 (night=${e.night.toFixed(2)})`)
    // 달빛 길: 달 쪽을 바라봄
    await page.evaluate(() => {
      const { player, cameraRig, env } = window.__sumbi
      cameraRig.yaw = Math.atan2(-env.moonDir.x, -env.moonDir.z)
      cameraRig.pitch = 0.05
      cameraRig.distance = 5.5
      player.yaw = cameraRig.yaw + Math.PI
    })
    await wait(900)
    await shot(page, 'tm-night-moonlight')
    // 물속 플랑크톤: 가만히 → 헤엄치며
    await page.keyboard.down('Space')
    await wait(4500)
    await page.evaluate(() => {
      window.__sumbi.cameraRig.pitch = 0.25
      window.__sumbi.cameraRig.distance = 4
    })
    await wait(800)
    const vis = await page.evaluate(() => window.__sumbi.game.getState().cameraUnderwater)
    check(vis, '밤: 물속으로 들어감')
    await shot(page, 'tm-night-plankton-still')
    await page.keyboard.down('KeyW')
    await wait(1600)
    await shot(page, 'tm-night-plankton-swim')
    await page.keyboard.up('KeyW')
    await page.keyboard.up('Space')
  }
  if (t === 'day') check(e.night < 0.05 && e.sunY > 0.4, `${label}: 해가 높이 (sunY=${e.sunY.toFixed(2)})`)
  if (t === 'sunset') check(e.sunY < 0.2 && e.sunY > -0.1, `${label}: 해가 수평선 가까이 (sunY=${e.sunY.toFixed(2)})`)
  if (t === 'dawn') check(e.sunY < 0.2 && e.sunY > -0.12, `${label}: 해가 막 뜨는 중 (sunY=${e.sunY.toFixed(2)})`)
  await ctx.close()
}

// 2) 밤 불턱 (모닥불이 더 밝게)
{
  const { ctx, page } = await open('?time=night')
  await page.evaluate(() => window.__sumbi.travel('bulteok'))
  await page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'bulteok', null, { timeout: 8000 })
  await page.evaluate(() => {
    const { player, cameraRig } = window.__sumbi
    cameraRig.yaw = player.yaw + 0.5
    cameraRig.distance = 4.2
    cameraRig.pitch = 0.25
  })
  await wait(1500)
  await shot(page, 'tm-night-bulteok')
  await ctx.close()
}

// 3) 부드러운 전환: 낮에서 밤으로 바꾸면 노을을 거쳐 몇 초에 걸쳐
{
  const { ctx, page } = await open('?time=day')
  await coastView(page)
  await wait(800)
  await page.evaluate(() => window.__sumbi.setTime('night'))
  const hours = []
  for (let i = 0; i < 8; i++) {
    await wait(250)
    hours.push(await page.evaluate(() => window.__sumbi.env.hour))
    if (i === 3) await shot(page, 'tm-transition-mid')
  }
  console.log('hours', hours.map((h) => h.toFixed(2)).join(' '))
  const increasing = hours.every((h, i) => i === 0 || h >= hours[i - 1] - 1e-6)
  check(increasing && hours[0] > 13 && hours[0] < 23 && hours.some((h) => h > 17 && h < 20), '낮→밤: 시각이 노을을 지나 조금씩 바뀜')
  await page.waitForFunction(() => Math.abs(window.__sumbi.env.hour - 23) < 0.01, null, { timeout: 10000 })
  check(true, '전환이 몇 초 안에 끝남')
  // 실제 시간으로 돌아가기
  await page.evaluate(() => window.__sumbi.setTime(null))
  await wait(6000)
  const real = await page.evaluate(() => ({ hour: window.__sumbi.env.hour, now: (Date.now() / 3600e3 + 9) % 24 }))
  check(Math.abs(((real.hour - real.now + 36) % 24) - 12) < 0.05, `setTime(null) → 실제 한국 시간 (${real.hour.toFixed(2)})`)
  await ctx.close()
}

await browser.close()
console.log(failures.length ? `실패 ${failures.length}개` : '모두 통과')
process.exit(failures.length ? 1 : 0)
