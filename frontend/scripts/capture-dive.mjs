// 잠수 동작 연속 캡처: Space를 누른 뒤 0.1초 간격으로 찍는다 (옆모습 / 뒷모습)
// 사용법: npm run dev 실행 중에  node scripts/capture-dive.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/dive'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })

async function sequence(view) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })
  await page.goto(BASE)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForTimeout(3500) // 가만히 있으면 카메라 쪽으로 돌아봄 → 방향이 안정됨
  // 카메라를 옆(또는 뒤)으로 옮기고 가까이
  await page.evaluate((view) => {
    const { player, cameraRig } = window.__sumbi
    cameraRig.yaw = player.yaw + (view === 'side' ? Math.PI / 2 : Math.PI)
    cameraRig.distance = 3.6
    cameraRig.pitch = 0.18
    cameraRig.lastDragAt = performance.now() + 60000 // 자동으로 등 뒤로 돌아가지 않게
  }, view)
  await page.waitForTimeout(1500)

  const info = () =>
    page.evaluate(() => {
      const p = window.__sumbi.player
      return `${p.pose.state}-${p.pose.stateTime.toFixed(2)}`
    })
  // 가만히 있으면 카메라 쪽으로 돌아보므로, 누르기 직전에 방향을 다시 맞춤
  await page.evaluate((view) => {
    const { player, cameraRig } = window.__sumbi
    player.yaw = cameraRig.yaw - (view === 'side' ? Math.PI / 2 : Math.PI)
    player.pose.stateTime = 0
  }, view)
  await page.keyboard.down('Space')
  const t0 = Date.now()
  let i = 0
  while (Date.now() - t0 < 1500) {
    const target = t0 + i * 100
    const wait = target - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    const label = await info()
    await page.screenshot({ path: join(out, `${view}-${String(i).padStart(2, '0')}-${label}.png`) })
    i++
  }
  // 하강 중
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, `${view}-${String(i++).padStart(2, '0')}-${await info()}.png`) })
  // 바닥 근처: 머리-아래 → 엎드린 자세로 눕는 과정
  await page
    .waitForFunction(() => ['underIdle', 'underSwim'].includes(window.__sumbi.player.pose.state), null, { timeout: 12000 })
    .catch(() => {})
  for (const ms of [0, 250, 250, 900]) {
    await page.waitForTimeout(ms)
    await page.screenshot({ path: join(out, `${view}-${String(i++).padStart(2, '0')}-${await info()}.png`) })
  }
  // 상승 → 퐁
  await page.keyboard.up('Space')
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(out, `${view}-${String(i++).padStart(2, '0')}-${await info()}.png`) })
  await page
    .waitForFunction(() => window.__sumbi.player.pose.state === 'sumbi', null, { timeout: 12000 })
    .catch(() => {})
  await page.waitForTimeout(80)
  await page.screenshot({ path: join(out, `${view}-${String(i++).padStart(2, '0')}-${await info()}.png`) })
  console.log(view, 'frames', i)
  await page.close()
}

await sequence('side')
await sequence('back')
await browser.close()
