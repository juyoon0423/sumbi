// 개발 서버 화면 캡처 (Playwright + 설치된 Chrome)
// 사용법: npm run dev 실행 중에  node scripts/capture.mjs <출력폴더> [lab|game|all]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures'
const which = process.argv[3] ?? 'all'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('saved', name)
}

async function lab() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/dev/character`)
  await page.waitForTimeout(2500)
  await shot(page, 'lab-overview')
  // 하나씩 크게: 순간을 맞춰 찍기 위해 루프 시간 기준으로 대기
  // 하나씩 크게: ?t=초 로 동작의 한 순간을 고정해서 찍음 (pop은 실제 루프로)
  const solos = [
    ['idle', null, 'idle', 3500],
    ['dive', 0.12, 'dive-crouch'],
    ['dive', 1.15, 'dive-in'],
    ['under', 0.6, 'under'],
    ['pop', null, 'pop', 2650],
    ['sumbi', 0.6, 'sumbi'],
    ['sumbi', 1.7, 'sumbi-relieved'],
    ['harvest', 0.62, 'harvest'],
    ['wave', 0.42, 'wave'],
    ['low', 0.5, 'low'],
  ]
  for (const [id, t, name, wait = 1800] of solos) {
    const p = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 2 })
    await p.goto(`${BASE}/dev/character?solo=${id}${t === null ? '' : `&t=${t}`}`)
    await p.waitForTimeout(wait)
    await shot(p, `lab-${name}`)
    await p.close()
  }
  await page.close()
}

async function game() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.__sumbi.cameraRig.distance = 3.2
    window.__sumbi.cameraRig.pitch = 0.3
  })
  await page.waitForTimeout(1500)
  await shot(page, 'game-1-idle')

  // 인사
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(450)
  await shot(page, 'game-2-wave')
  await page.waitForTimeout(1500)

  // 해산물 근처로 옮겨 놓고 잠수
  await page.evaluate(() => {
    const s = window.__sumbi
    const it = s.seafood.find((i) => i.active && Math.hypot(i.pos.x, i.pos.z - 8) < 14) ?? s.seafood[0]
    s.player.pos.x = it.pos.x
    s.player.pos.z = it.pos.z + 1.6
    s.player.yaw = Math.PI
    s.player.tewak.pos.set(it.pos.x, 0, it.pos.z + 1.2)
    s.cameraRig.yaw = 0
  })
  await page.keyboard.down('Space')
  await page.waitForTimeout(1600)
  await shot(page, 'game-3-diving')
  // 바닥까지 내려가 해산물 쪽으로 조금 이동
  await page.waitForFunction(() => window.__sumbi.player.pos.y < -6.5, null, { timeout: 15000 }).catch(() => {})
  await page.keyboard.down('KeyW')
  await page
    .waitForFunction(() => window.__sumbi.player.pose.state === 'harvesting', null, { timeout: 8000 })
    .catch(() => console.log('채집 시작을 못 잡음'))
  await page.keyboard.up('KeyW')
  await page
    .waitForFunction(
      () => window.__sumbi.player.pose.state === 'harvesting' && window.__sumbi.player.pose.stateTime > 0.72,
      null,
      { timeout: 4000 },
    )
    .catch(() => {})
  await shot(page, 'game-4-harvest')

  // 떠올라 숨비소리
  await page.keyboard.up('Space')
  await page.waitForFunction(
    () => window.__sumbi.player.pose.state === 'sumbi' && window.__sumbi.player.pose.stateTime > 0.4,
    null,
    { timeout: 15000 },
  )
  await shot(page, 'game-5-sumbi')
  await page.close()
}

if (which === 'lab' || which === 'all') await lab()
if (which === 'game' || which === 'all') await game()
await browser.close()
