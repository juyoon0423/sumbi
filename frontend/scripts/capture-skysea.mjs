// 하늘·바다 사실감 확인: 시간대(?hour=) 4개 × 둥둥 시점 · 바다 · 해안 · 물속 · 불턱 · 테왁 가까이, 모바일 프레임 수.
// 사용법: 프론트 실행 중에 (백엔드는 없어도 됨)
//   node scripts/capture-skysea.mjs <출력폴더> [접두어]        전체 캡처 + 프레임 수
//   node scripts/capture-skysea.mjs <출력폴더> [접두어] fps    프레임 수만
//   node scripts/capture-skysea.mjs <출력폴더> [접두어] float  둥둥 시점만
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/skysea'
const tag = process.argv[3] ?? 'cur'
const only = process.argv[4] ?? 'all'
/** 품질 고정 (프레임 수 비교용): SUMBI_QUALITY=high|medium|low */
const Q = process.env.SUMBI_QUALITY ? `&quality=${process.env.SUMBI_QUALITY}` : ''
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', ...(only === 'fps' ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const CUSTOM = { adj: '반짝이는', noun: '윤슬', towel: 'white', tewak: 'orange', cheek: 'pink' }
const HOURS = [
  ['dawn', 6.0],
  ['day', 13],
  ['sunset', 18.3],
  ['night', 23],
]

async function open(query, ctxOpts = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }) {
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addInitScript((c) => localStorage.setItem('sumbi.custom', JSON.stringify(c)), CUSTOM)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    console.log('pageerror', e.message)
    failures.push('pageerror: ' + e.message)
  })
  await page.goto(BASE + query)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus !== 'connecting', null, { timeout: 10000 })
  await page.waitForTimeout(800)
  return { ctx, page }
}
const shot = async (page, file) => {
  await page.screenshot({ path: join(out, `${tag}-${file}.jpg`), type: 'jpeg', quality: 82 })
  console.log('saved', `${tag}-${file}`)
}
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

const setView = (page, v) =>
  page.evaluate((v) => {
    const { player, cameraRig } = window.__sumbi
    player.pos.set(v.x, player.pos.y, v.z)
    player.yaw = v.pyaw
    cameraRig.yaw = v.yaw
    cameraRig.distance = v.dist
    cameraRig.pitch = v.pitch
    cameraRig.lastDragAt = performance.now() + 1e9
  }, v)

/** 해안(불턱·오름·한라산) 쪽을 보는 수면 풍경 */
const COAST = { x: 8, z: 2, pyaw: Math.PI, yaw: 0.15, dist: 6.5, pitch: 0.12 }
/** 탁 트인 바다(수평선) 쪽 */
const OPEN = { x: 6, z: 14, pyaw: 0, yaw: Math.PI + 0.4, dist: 5.5, pitch: 0.18 }
/** 해안선 가까이: 바위·포말 */
const SHORE = { x: 2, z: -3, pyaw: Math.PI, yaw: 0.5, dist: 7, pitch: 0.3 }
/** 테왁·해녀 가까이 (물에 뜬 높이 확인) */
const CLOSE = { x: 6, z: 12, pyaw: 0.6, yaw: 0.6 + Math.PI / 2, dist: 3, pitch: 0.02 }

async function floatShots(page, name) {
  await setView(page, OPEN)
  await wait(500)
  await page.evaluate(() => window.__sumbi.float.start())
  await wait(7000) // UI 가 사라지고 구도가 자리 잡을 때까지
  await shot(page, `${name}-float`)
}

if (only === 'all' || only === 'float') {
  for (const [name, hour] of HOURS) {
    console.log(name)
    const { ctx, page } = await open(`?hour=${hour}`)
    if (only === 'all') {
      await setView(page, OPEN)
      await wait(1800)
      await shot(page, `${name}-sea`)
      await setView(page, COAST)
      await wait(1800)
      await shot(page, `${name}-coast`)
      await setView(page, SHORE)
      await wait(1800)
      await shot(page, `${name}-shore`)
      if (name === 'day' || name === 'night') {
        await setView(page, CLOSE)
        await wait(1500)
        await shot(page, `${name}-close`)
      }
    }
    await floatShots(page, name)
    if (only === 'all') {
      await page.evaluate(() => window.__sumbi.float.stop())
      await wait(1500)
      // 물속: 내려가서 바닥 근처
      await setView(page, OPEN)
      await page.keyboard.down('Space')
      await wait(4500)
      await page.evaluate(() => {
        window.__sumbi.cameraRig.pitch = 0.3
        window.__sumbi.cameraRig.distance = 4.5
      })
      await wait(900)
      check(await page.evaluate(() => window.__sumbi.game.getState().cameraUnderwater), `${name}: 물속`)
      await shot(page, `${name}-under`)
      // 물속에서 수면 올려다보기
      await page.evaluate(() => {
        window.__sumbi.cameraRig.pitch = -0.3
      })
      await wait(900)
      await shot(page, `${name}-under-up`)
      await page.keyboard.up('Space')
      await page.waitForFunction(() => window.__sumbi.player.pose.state === 'surfaceIdle', null, { timeout: 15000 })
      // 불턱
      await page.evaluate(() => window.__sumbi.travel('bulteok'))
      await page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'bulteok', null, { timeout: 10000 })
      await page.evaluate(() => {
        const { player, cameraRig } = window.__sumbi
        cameraRig.yaw = player.yaw + Math.PI + 0.4
        cameraRig.distance = 5
        cameraRig.pitch = 0.22
      })
      await wait(2500)
      await shot(page, `${name}-bulteok`)
    }
    await ctx.close()
  }
}

// 프레임 수: 휴대폰 크기 (390×844, 화면 배율 3 → dpr 상한 1.75), 바다 · 둥둥
if (only === 'all' || only === 'fps') {
  const rows = []
  for (const [name, hour] of [
    ['day', 13],
    ['night', 23],
  ]) {
    const { ctx, page } = await open(`?hour=${hour}${Q}`, {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    })
    await setView(page, OPEN)
    await wait(2000)
    const sea = await fps(page)
    await page.evaluate(() => window.__sumbi.float.start())
    await wait(3000)
    const fl = await fps(page)
    await shot(page, `${name}-mobile-float`)
    rows.push({ name, sea: +sea.toFixed(1), float: +fl.toFixed(1) })
    console.log('fps', name, sea.toFixed(1), fl.toFixed(1))
    await ctx.close()
  }
  writeFileSync(join(out, `${tag}-fps.json`), JSON.stringify(rows, null, 2))
}

await browser.close()
console.log(failures.length ? `실패 ${failures.length}개` : '모두 통과')
process.exit(failures.length ? 1 : 0)
