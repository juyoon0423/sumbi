// 휴대폰 조작 확인: 터치 조이스틱으로 헤엄, 화면 끌어 둘러보기, 잠수 버튼 누르고 있기, 레이아웃 겹침, 불턱·둥둥·가로 화면.
// 실제 터치 이벤트(CDP Input.dispatchTouchEvent)로 손가락 두 개까지 흉내.
// 사용법: 프론트 실행 중에 (백엔드 있으면 불턱도) node scripts/capture-mobile.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/mobile'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }

async function open(opts = IPHONE, query = '?hour=13&debug=1') {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => failures.push('pageerror: ' + e.message))
  await page.goto(BASE + '/' + query)
  await page.waitForTimeout(1500)
  await page.getByText('바다로 들어가기').click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus !== 'connecting', null, { timeout: 10000 })
  await page.waitForTimeout(1200)
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, cdp }
}

/** 손가락들: [{id, x, y}] — 지금 화면에 닿아 있는 손가락 전체를 보냄 */
const touch = (cdp, type, points) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) })

/** 손가락 하나로 끌기 */
async function drag(cdp, from, to, steps = 12, holdMs = 0) {
  await touch(cdp, 'touchStart', [{ id: 1, ...from }])
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, 'touchMove', [{ id: 1, x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }])
    await wait(16)
  }
  if (holdMs) await wait(holdMs)
  await touch(cdp, 'touchEnd', [])
}

const shot = (page, f) => page.screenshot({ path: join(out, `${f}.jpg`), type: 'jpeg', quality: 72 })

/** 화면 요소끼리 겹치는지 (보이는 HUD 상자) */
const overlaps = (page) =>
  page.evaluate(() => {
    const sel = ['.basket', '.today', '.basin-card', '.top-right', '.bottom-right .actionbar', '.bulteok-bar .prep-panel', '.bulteok-bar .actionbar', '.joy-base', '.hint:not(.hidden)', '.toast', '.breath:not(.hidden)', 'div[style*="monospace"]']
    const boxes = []
    for (const s of sel)
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect()
        if (r.width && r.height && getComputedStyle(el).opacity !== '0') boxes.push({ s, r })
      }
    const hits = []
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r
        const b = boxes[j].r
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) hits.push(`${boxes[i].s} × ${boxes[j].s}`)
      }
    const offscreen = boxes.filter(({ r }) => r.left < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5).map((b) => b.s)
    return { hits, offscreen }
  })

console.log('▶ 세로 휴대폰 · 바다')
{
  const { ctx, page, cdp } = await open()
  await shot(page, 'sea-portrait')
  const o = await overlaps(page)
  check(o.hits.length === 0, `바다 HUD 겹침 없음 ${o.hits.join(', ')}`)
  check(o.offscreen.length === 0, `바다 HUD 화면 안 ${o.offscreen.join(', ')}`)
  check(await page.locator('.joy-base').isVisible(), '조이스틱 보임')

  // 조이스틱: 왼쪽 아래를 위로 끌고 1.5초 유지 → 앞으로 헤엄
  const p0 = await page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  const from = { x: 90, y: 740 }
  const run = drag(cdp, from, { x: 90, y: 680 }, 8, 1500)
  await wait(700)
  const st = await page.evaluate(() => [window.__sumbi.player.pose.state, window.__sumbi.input.input.stick.y])
  await shot(page, 'sea-joystick')
  await run
  const p1 = await page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z)
  check(moved > 1, `조이스틱으로 헤엄 (${moved.toFixed(2)}m, 상태 ${st[0]}, stick.y ${st[1].toFixed(2)})`)
  check(await page.evaluate(() => window.__sumbi.input.input.stick.y === 0), '손 떼면 멈춤')

  // 화면 끌어 둘러보기 (조이스틱 영역 밖, 오른쪽 위쪽)
  const yaw0 = await page.evaluate(() => window.__sumbi.cameraRig.yaw)
  await drag(cdp, { x: 300, y: 400 }, { x: 160, y: 420 }, 12)
  const yaw1 = await page.evaluate(() => window.__sumbi.cameraRig.yaw)
  check(Math.abs(yaw1 - yaw0) > 0.3, `화면 끌어 둘러보기 (yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)})`)

  // 두 손가락: 조이스틱 쥔 채 다른 손가락으로 둘러보기
  const yaw2 = yaw1
  await touch(cdp, 'touchStart', [{ id: 1, x: 90, y: 740 }])
  await touch(cdp, 'touchMove', [{ id: 1, x: 90, y: 690 }])
  await touch(cdp, 'touchStart', [{ id: 1, x: 90, y: 690 }, { id: 2, x: 300, y: 380 }])
  for (let i = 1; i <= 10; i++) {
    await touch(cdp, 'touchMove', [{ id: 1, x: 90, y: 690 }, { id: 2, x: 300 - i * 12, y: 380 }])
    await wait(16)
  }
  const both = await page.evaluate(() => [window.__sumbi.input.input.stick.y, window.__sumbi.cameraRig.yaw])
  await touch(cdp, 'touchEnd', [])
  check(both[0] > 0.5 && Math.abs(both[1] - yaw2) > 0.2, `헤엄치며 둘러보기 (stick.y ${both[0].toFixed(2)}, yaw 변화 ${(both[1] - yaw2).toFixed(2)})`)

  // 잠수 버튼 누르고 있기
  const dive = await page.locator('.bottom-right .action').first().boundingBox()
  const c = { x: dive.x + dive.width / 2, y: dive.y + dive.height / 2 }
  await touch(cdp, 'touchStart', [{ id: 3, ...c }])
  await wait(2200)
  const under = await page.evaluate(() => [window.__sumbi.player.pose.state, window.__sumbi.player.pos.y])
  await shot(page, 'sea-diving')
  // 물속에서 조이스틱도
  const q0 = await page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  await touch(cdp, 'touchStart', [{ id: 3, ...c }, { id: 4, x: 90, y: 740 }])
  for (let i = 1; i <= 6; i++) {
    await touch(cdp, 'touchMove', [{ id: 3, ...c }, { id: 4, x: 90 + i * 8, y: 740 - i * 8 }])
    await wait(16)
  }
  await wait(1200)
  const q1 = await page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  await touch(cdp, 'touchEnd', [])
  check(under[1] < -0.8, `잠수 버튼으로 잠수 (${under[0]}, y ${under[1].toFixed(2)})`)
  check(Math.hypot(q1.x - q0.x, q1.z - q0.z) > 0.5, '물속에서 잠수 버튼 + 조이스틱 함께')
  await page.waitForFunction(() => window.__sumbi.player.pose.state === 'surfaceIdle', null, { timeout: 20000 }).catch(() => {})

  // 톡 누르면 계속 잠수 → 손을 떼도 내려가 있음 → 다시 톡 하면 올라감
  await page.waitForFunction(() => window.__sumbi.player.pose.state === 'surfaceIdle', null, { timeout: 20000 }).catch(() => {})
  await wait(400)
  await touch(cdp, 'touchStart', [{ id: 5, ...c }])
  await wait(120)
  await touch(cdp, 'touchEnd', [])
  await wait(3000)
  const latched = await page.evaluate(() => [window.__sumbi.player.pose.state, window.__sumbi.player.pos.y])
  const label = await page.locator('.bottom-right .action').first().innerText()
  await shot(page, 'sea-dive-latched')
  const od = await overlaps(page)
  check(od.hits.length === 0, `잠수 중 숨 게이지 겹침 없음 ${od.hits.join(', ')}`)
  check(latched[1] < -1 && latched[0] !== 'ascending', `톡 → 손 떼도 계속 잠수 (${latched[0]}, y ${latched[1].toFixed(2)})`)
  check(label.includes('올라가기'), `잠수 버튼이 "올라가기"로 (${label.replace(/\n/g, ' ')})`)
  // 엄지 하나로 조이스틱만 쥐고 물속 헤엄
  const l0 = await page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  await drag(cdp, { x: 90, y: 740 }, { x: 90, y: 690 }, 6, 1000)
  const l1 = await page.evaluate(() => ({ ...window.__sumbi.player.pos }))
  check(Math.hypot(l1.x - l0.x, l1.z - l0.z) > 0.5, '잠수한 채 조이스틱만으로 헤엄')
  await touch(cdp, 'touchStart', [{ id: 6, ...c }])
  await wait(100)
  await touch(cdp, 'touchEnd', [])
  await wait(500)
  check(await page.evaluate(() => window.__sumbi.player.pose.state === 'ascending'), '다시 톡 → 올라가기')
  await page.waitForFunction(() => window.__sumbi.player.pose.state === 'surfaceIdle', null, { timeout: 20000 }).catch(() => {})
  check(!(await page.locator('.bottom-right .action').first().innerText()).includes('올라가기'), '수면에 오르면 잠수 버튼 원래대로')

  // 두 손가락으로 벌리기 → 가까이, 좁히기 → 멀리
  const pinchTo = async (from, to) => {
    await touch(cdp, 'touchStart', [{ id: 7, x: 195 - from, y: 420 }])
    await touch(cdp, 'touchStart', [{ id: 7, x: 195 - from, y: 420 }, { id: 8, x: 195 + from, y: 440 }])
    for (let i = 1; i <= 10; i++) {
      const d = from + ((to - from) * i) / 10
      await touch(cdp, 'touchMove', [{ id: 7, x: 195 - d, y: 420 }, { id: 8, x: 195 + d, y: 440 }])
      await wait(16)
    }
    await touch(cdp, 'touchEnd', [])
  }
  const z0 = await page.evaluate(() => [window.__sumbi.cameraRig.distance, window.__sumbi.cameraRig.yaw])
  await pinchTo(40, 110)
  const z1 = await page.evaluate(() => [window.__sumbi.cameraRig.distance, window.__sumbi.cameraRig.yaw])
  await shot(page, 'sea-pinch-in')
  await pinchTo(110, 30)
  const z2 = await page.evaluate(() => window.__sumbi.cameraRig.distance)
  check(z1[0] < z0[0] - 0.8, `벌리면 가까이 (거리 ${z0[0].toFixed(2)} → ${z1[0].toFixed(2)})`)
  check(z2 > z1[0] + 0.8, `좁히면 멀리 (거리 → ${z2.toFixed(2)})`)
  check(Math.abs(z1[1] - z0[1]) < 0.05, '줌하는 동안 시점은 안 돌아감')

  // 오늘의 바다 펼치기
  await page.locator('.today').tap()
  await wait(300)
  const o2 = await overlaps(page)
  check(o2.hits.length === 0, `오늘의 바다 펼쳐도 겹침 없음 ${o2.hits.join(', ')}`)
  await shot(page, 'sea-today-open')

  // 둥둥 → 조이스틱으로 일어나기
  await page.locator('.bottom-right .action', { hasText: '둥둥' }).tap()
  await wait(2500)
  await shot(page, 'float')
  const f0 = await page.evaluate(() => window.__sumbi.float.cam.fov)
  await pinchTo(40, 100)
  const f1 = await page.evaluate(() => window.__sumbi.float.cam.fov)
  check(f1 < f0 - 4, `둥둥에서 벌리면 하늘을 가까이 (fov ${f0.toFixed(0)} → ${f1.toFixed(0)})`)
  await drag(cdp, { x: 90, y: 740 }, { x: 90, y: 690 }, 6, 600)
  await wait(400)
  check(await page.evaluate(() => !window.__sumbi.float.cam || window.__sumbi.player.pose.state !== 'float'), '둥둥 중 조이스틱으로 일어나기')

  // 불턱 (백엔드 없으면 혼자 바다에서도 이동함)
  await page.waitForFunction(() => window.__sumbi.player.pose.state === 'surfaceIdle', null, { timeout: 10000 }).catch(() => {})
  await page.locator('.bottom-right .action', { hasText: '불턱' }).tap()
  await page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'bulteok' && !window.__sumbi.bulteok.getState().traveling, null, { timeout: 15000 })
  await wait(2500)
  await shot(page, 'bulteok-portrait')
  const o3 = await overlaps(page)
  check(o3.hits.length === 0, `불턱 HUD 겹침 없음 ${o3.hits.join(', ')}`)
  check(o3.offscreen.length === 0, `불턱 HUD 화면 안 ${o3.offscreen.join(', ')}`)
  check(!(await page.locator('.joy-base').isVisible()), '불턱엔 조이스틱 없음')
  const yb0 = await page.evaluate(() => window.__sumbi.cameraRig.yaw)
  await drag(cdp, { x: 300, y: 300 }, { x: 180, y: 320 }, 12)
  check(Math.abs((await page.evaluate(() => window.__sumbi.cameraRig.yaw)) - yb0) > 0.3, '불턱에서도 끌어 둘러보기')
  await ctx.close()
}

console.log('▶ 가로 휴대폰 · 바다')
{
  const { ctx, page } = await open({ ...IPHONE, viewport: { width: 844, height: 390 } })
  await shot(page, 'sea-landscape')
  const o = await overlaps(page)
  check(o.hits.length === 0, `가로 HUD 겹침 없음 ${o.hits.join(', ')}`)
  check(o.offscreen.length === 0, `가로 HUD 화면 안 ${o.offscreen.join(', ')}`)
  await ctx.close()
}

console.log('▶ 데스크톱은 그대로')
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } })
  check(!(await page.locator('.joy-base').count()), '데스크톱엔 조이스틱 없음')
  check(await page.locator('.bottom-center .actionbar').isVisible(), '데스크톱 행동 바는 가운데 아래')
  await shot(page, 'desktop')
  await ctx.close()
}

await browser.close()
console.log(failures.length ? `\n실패 ${failures.length}개:\n- ${failures.join('\n- ')}` : '\n모두 통과')
process.exit(failures.length ? 1 : 0)
