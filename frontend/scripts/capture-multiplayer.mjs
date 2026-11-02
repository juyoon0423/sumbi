// 멀티플레이 확인: 브라우저 3개(서로 다른 저장소)로 같은 바다에 들어가서
// 서로 보이는지, 움직임·잠수·테왁·숨비소리 토스트·퇴장이 실시간으로 반영되는지 캡처.
// 사용법: 백엔드(8080) + 프론트(5173) 실행 중에  node scripts/capture-multiplayer.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/multiplayer'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}

const PEOPLE = {
  A: { adj: '느린', noun: '파도', towel: 'white', tewak: 'orange', cheek: 'pink' },
  B: { adj: '몽글몽글한', noun: '돌고래', towel: 'pink', tewak: 'yellow', cheek: 'rose' },
  C: { adj: '고요한', noun: '윤슬', towel: 'mint', tewak: 'scarlet', cheek: 'coral' },
}

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  const c = PEOPLE[name]
  await ctx.addInitScript((custom) => {
    localStorage.setItem('sumbi.custom', JSON.stringify(custom))
  }, c)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus === 'online', null, { timeout: 10000 })
  return { name, ctx, page }
}

const shot = async (who, file) => {
  await who.page.screenshot({ path: join(out, `${file}.png`) })
  console.log('saved', file)
}
const remoteIds = (who) => who.page.evaluate(() => [...window.__sumbi.remotes.keys()])
const selfId = (who) => who.page.evaluate(() => window.__sumbi.game.getState().selfId)

// 셋이 같은 바다에 입장
const A = await open('A')
const B = await open('B')
const C = await open('C')
await wait(800)
const ids = { A: await selfId(A), B: await selfId(B), C: await selfId(C) }
console.log('ids', ids)
check((await remoteIds(A)).length === 2, 'A 화면에 다른 해녀 2명')
check((await remoteIds(B)).length === 2, 'B 화면에 다른 해녀 2명')
check((await remoteIds(C)).length === 2, 'C 화면에 다른 해녀 2명')

// 자리 잡기: A 는 (0, 8), B·C 는 A 앞 3m 에 나란히, 모두 카메라(+z) 쪽을 봄
const place = (who, x, z) =>
  who.page.evaluate(
    ([x, z]) => {
      const { player, cameraRig } = window.__sumbi
      player.pos.x = x
      player.pos.z = z
      player.yaw = 0
      player.tewak.pos.set(x, 0, z + 0.47)
      cameraRig.yaw = 0
      cameraRig.distance = 5.5
      cameraRig.pitch = 0.32
      cameraRig.lastDragAt = performance.now() + 120000
    },
    [x, z],
  )
await place(A, 0, 9)
await place(B, 1.3, 6)
await place(C, -1.3, 6)
await wait(2500)
await shot(A, 'mp-1-A-sees-B-and-C')
await shot(B, 'mp-1-B-view')

// B 의 실제 위치와 A 가 보는 B 의 위치 비교
const posOf = async (who) => who.page.evaluate(() => window.__sumbi.player.pos.toArray())
const seenBy = async (who, id) => who.page.evaluate((id) => window.__sumbi.remotes.get(id)?.pos.toArray(), id)
let bReal = await posOf(B)
let bSeen = await seenBy(A, ids.B)
console.log('B real', bReal.map((v) => v.toFixed(2)), 'A sees', bSeen?.map((v) => v.toFixed(2)))
check(bSeen && Math.hypot(bReal[0] - bSeen[0], bReal[2] - bSeen[2]) < 0.3, 'A 가 보는 B 위치가 B 실제 위치와 같음')

// B 가 옆으로 헤엄 (D 키) → A 화면에서 움직임
await B.page.keyboard.down('KeyD')
await wait(500)
await shot(A, 'mp-2-B-swimming-0.5s')
await wait(700)
await shot(A, 'mp-2-B-swimming-1.2s')
await B.page.keyboard.up('KeyD')
await wait(600)
bReal = await posOf(B)
bSeen = await seenBy(A, ids.B)
console.log('B real', bReal.map((v) => v.toFixed(2)), 'A sees', bSeen?.map((v) => v.toFixed(2)))
check(Math.hypot(bReal[0] - bSeen[0], bReal[2] - bSeen[2]) < 0.3, 'B 가 헤엄친 뒤 A 화면의 B 도 같은 곳')
check(bReal[0] > 2.5, 'B 가 실제로 옆으로 이동함')

// B 잠수 → A 화면: B 는 물속, 테왁은 수면에 남아 둥둥
await B.page.keyboard.down('Space')
await wait(350)
await shot(A, 'mp-3-B-dive-splash')
await wait(1500)
await shot(A, 'mp-3-B-underwater-tewak-floats')
const bState = await A.page.evaluate((id) => {
  const r = window.__sumbi.remotes.get(id)
  return { state: r.pose.state, tewakAttached: r.tewak.attached, y: r.pos.y, tewakY: r.tewak.pos.y }
}, ids.B)
console.log('A sees B', bState)
check(bState.y < -1 && !bState.tewakAttached && bState.tewakY > -0.3, 'A 화면: B 는 물속, 테왁은 수면에')
check(['descending', 'underIdle', 'underSwim', 'entering'].includes(bState.state), `A 화면의 B 자세가 잠수 중 (${bState.state})`)

// A 도 따라 들어가서 물속의 B 보기
await A.page.keyboard.down('Space')
await wait(2600)
await shot(A, 'mp-4-A-sees-B-underwater')
await A.page.keyboard.up('Space')

// B 가 3초 넘게 있다가 떠오름 → 숨비소리 토스트 (A, C 화면)
await wait(1200)
await B.page.keyboard.up('Space')
await A.page
  .waitForFunction(() => document.body.innerText.includes('숨비소리를 냈어요'), null, { timeout: 15000 })
  .catch(() => {})
const toastA = await A.page.evaluate(() => [...document.querySelectorAll('.toast')].map((e) => e.textContent))
const toastC = await C.page
  .waitForFunction(() => document.body.innerText.includes('숨비소리를 냈어요'), null, { timeout: 5000 })
  .then(() => true)
  .catch(() => false)
console.log('A toasts', toastA)
check(toastA.some((t) => t.includes('몽글몽글한 돌고래님이 숨비소리를 냈어요')), 'A 화면에 B 숨비소리 토스트')
check(toastC, 'C 화면에도 B 숨비소리 토스트')
await wait(300)
await shot(C, 'mp-5-C-sumbi-toast')
await wait(1200)
await shot(A, 'mp-5-A-sumbi-toast')

// C 인사 → A 화면 토스트
await C.page.keyboard.press('Digit1')
await A.page.waitForFunction(() => document.body.innerText.includes('손 흔들어 인사했어요'), null, { timeout: 5000 }).catch(() => {})
await wait(400)
await shot(A, 'mp-6-C-waves')
check(await A.page.evaluate(() => document.body.innerText.includes('고요한 윤슬님이 손 흔들어 인사했어요')), 'A 화면에 C 인사 토스트')

// 오늘의 바다 숫자: 실제 서버 값 (3명)
const today = await A.page.evaluate(() => window.__sumbi.game.getState().today)
console.log('today', today)
check(today && today.divers >= 3, '오늘의 바다 해녀 수가 서버 집계 (3명 이상)')

// C 가 탭(브라우저)을 닫음 → A·B 화면에서 사라짐
await C.page.close()
await C.ctx.close()
await A.page.waitForFunction((id) => !window.__sumbi.remotes.has(id), ids.C, { timeout: 5000 }).catch(() => {})
check(!(await remoteIds(A)).includes(ids.C), 'C 를 닫으면 A 화면에서 사라짐')
check(!(await remoteIds(B)).includes(ids.C), 'C 를 닫으면 B 화면에서 사라짐')
await wait(500)
await shot(A, 'mp-7-after-C-left')

await A.ctx.close()
await B.ctx.close()
await browser.close()
console.log(failures.length ? `실패 ${failures.length}개` : '모두 통과')
process.exit(failures.length ? 1 : 0)
