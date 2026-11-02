// 숨 고르기 확인: A 가 수면에서 숨을 고르면 테왁을 안고 부풀었다 줄고, 가운데 둥근 빛이 커졌다 작아짐.
// B 화면에서는 A 둘레에 은은한 빛. 세 번째 숨을 마치면 오늘 숨 +2초, 움직이면 멈춤.
// 사용법: 백엔드 + 프론트 실행 중에  node scripts/capture-breathe.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/breathe'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

async function open(custom, breatheCycles) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(
    ([custom, cycles, day]) => {
      localStorage.setItem('sumbi.custom', JSON.stringify(custom))
      localStorage.setItem('sumbi.breathe', JSON.stringify({ date: day, cycles }))
    },
    [custom, breatheCycles, kstToday],
  )
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus === 'online', null, { timeout: 10000 })
  await page.waitForTimeout(800)
  return { ctx, page }
}
const shot = async (who, file) => {
  await who.page.screenshot({ path: join(out, `${file}.png`) })
  console.log('saved', file)
}

// A: 오늘 이미 두 번 숨을 골랐음 → 이번 첫 숨을 마치면 +2초
const A = await open({ adj: '고요한', noun: '물결', towel: 'white', tewak: 'orange', cheek: 'pink' }, 2)
const B = await open({ adj: '느긋한', noun: '돌고래', towel: 'pink', tewak: 'yellow', cheek: 'rose' }, 0)
const aId = await A.page.evaluate(() => window.__sumbi.game.getState().selfId)

// B 를 A 옆 3m 로 옮기고 A 쪽을 보게
const aPos = await A.page.evaluate(() => window.__sumbi.player.pos.toArray())
await B.page.evaluate(([x, , z]) => {
  const { player, cameraRig } = window.__sumbi
  player.pos.set(x + 2.6, player.pos.y, z + 1.6)
  cameraRig.yaw = Math.atan2(2.6, 1.6) + 0.55 // B 뒤 비스듬히에서 A 쪽으로
  cameraRig.distance = 4.2
  cameraRig.pitch = 0.22
}, aPos)

// A 카메라: 앞쪽 비스듬히
await A.page.evaluate(() => {
  const { player, cameraRig } = window.__sumbi
  cameraRig.yaw = player.yaw + 0.5
  cameraRig.distance = 4.6
  cameraRig.pitch = 0.18
})
await wait(1500)

await A.page.keyboard.press('KeyB')
await wait(300)
check(await A.page.evaluate(() => window.__sumbi.player.pose.breatheTime >= 0), 'B 키로 숨 고르기 시작')
check(await A.page.evaluate(() => document.querySelector('.breathe-guide') !== null), '가운데 둥근 빛 안내가 보임')
await wait(3500) // 들이쉬기 끝 무렵 (약 3.8초)
check(await A.page.evaluate(() => document.querySelector('.breathe-word')?.textContent === '들이쉬고…'), '"들이쉬고…" 안내')
await shot(A, 'br-1-A-inhale')
const onB = await B.page.evaluate((id) => window.__sumbi.remotes.get(id)?.pose.breatheTime ?? -1, aId)
check(onB >= 0, `B 화면: A 가 숨 고르는 중 (${onB.toFixed(1)}초)`)
await shot(B, 'br-2-B-sees-A-glow')
await wait(3300) // 내쉬는 중 (약 7초)
check(await A.page.evaluate(() => document.querySelector('.breathe-word')?.textContent === '내쉬고…'), '"내쉬고…" 안내')
await shot(A, 'br-3-A-exhale')

// 첫 숨을 마침 (10초) → 오늘 3번째 → +2초
await A.page.waitForFunction(() => window.__sumbi.player.pose.breatheTime > 10.3, null, { timeout: 8000 })
const st = await A.page.evaluate(() => ({ text: document.body.innerText }))
check(st.text.includes('숨이 조금 길어졌어요'), '세 번째 숨 → "숨이 조금 길어졌어요" 말풍선')
check(st.text.includes('오늘 숨 +2초'), '안내에 "오늘 숨 +2초"')
await wait(400)
await shot(A, 'br-4-A-bonus')
const saved = await A.page.evaluate(() => JSON.parse(localStorage.getItem('sumbi.breathe')))
check(saved.cycles === 3, `브라우저에 오늘 숨 수 저장 (${saved.cycles})`)

// 움직이면 멈춤 → B 화면에서도 멈춤
await A.page.keyboard.down('KeyW')
await wait(500)
await A.page.keyboard.up('KeyW')
check(await A.page.evaluate(() => window.__sumbi.player.pose.breatheTime < 0 && !document.querySelector('.breathe-guide')), '움직이면 숨 고르기 멈춤')
await wait(500)
check(await B.page.evaluate((id) => window.__sumbi.remotes.get(id)?.pose.breatheTime ?? 0, aId) < 0, 'B 화면에서도 멈춤')

// 잠수하면 숨 게이지 옆에 +2초
await A.page.keyboard.down('Space')
await wait(1500)
check(await A.page.evaluate(() => document.querySelector('.breath-bonus')?.textContent === '+2초'), '잠수할 때 숨 게이지에 +2초')
await shot(A, 'br-5-A-dive-bonus')
await A.page.keyboard.up('Space')

for (const w of [A, B]) await w.ctx.close()
await browser.close()
console.log(failures.length ? `실패 ${failures.length}개` : '모두 통과')
process.exit(failures.length ? 1 : 0)
