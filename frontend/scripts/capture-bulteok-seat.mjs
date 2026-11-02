// 불턱 자리 옮기기 확인: 브라우저 3개(+ 가짜 WebSocket 해녀들).
// - 빈자리 마우스 올리기(빛·커서) / 찬 자리는 반응 없음
// - A 가 빈자리를 눌러 일어나기 → 걷기 → 앉기 (A 옆 시점 · B 전체 시점, 0.1초 간격 연속 캡처 → 한 장 모음)
// - 다른 창(B·C)도 같은 길로 걷는 A 를 봄
// - B·C 가 같은 자리를 동시에 누름 → 한 명만 앉고 다른 한 명은 "앗"
// - 걷다가 다른 자리 누르면 방향 바꾸기, 걷는 중 연결이 끊기면 목적지 자리가 빔
// - 자리가 다 차면 담 밖에 서서 불 쬐기 → 자리가 나면 입구로 들어와 앉기
// - 정면 시점 자동 전환 (앉아서 2.5초 → 앞쪽), 끌기·자리 누르기로 바로 제어권
// 사용법: 백엔드 + 프론트 실행 중에  node scripts/capture-bulteok-seat.mjs <출력폴더> [원본프레임폴더]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const WS = process.env.SUMBI_WS ?? 'ws://localhost:8080/ws'
const out = process.argv[2] ?? 'captures/bulteok-seat'
const raw = process.argv[3] ?? join(out, 'raw')
mkdirSync(out, { recursive: true })
mkdirSync(raw, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}

const PEOPLE = {
  A: { adj: '작은', noun: '소라', towel: 'white', tewak: 'orange', cheek: 'pink' },
  B: { adj: '몽글몽글한', noun: '돌고래', towel: 'pink', tewak: 'yellow', cheek: 'rose' },
  C: { adj: '고요한', noun: '윤슬', towel: 'mint', tewak: 'scarlet', cheek: 'coral' },
  D: { adj: '따뜻한', noun: '돌담', towel: 'sky', tewak: 'amber', cheek: 'peach' },
}

async function open(name, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await ctx.addInitScript((custom) => localStorage.setItem('sumbi.custom', JSON.stringify(custom)), PEOPLE[name])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message))
  await page.goto(BASE + '/?time=sunset')
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus === 'online', null, { timeout: 10000 })
  return { name, ctx, page }
}
const jpeg = (who, file) => who.page.screenshot({ path: join(out, `${file}.jpg`), type: 'jpeg', quality: 82 }).then(() => console.log('saved', file))
const selfId = (who) => who.page.evaluate(() => window.__sumbi.game.getState().selfId)
const toBulteok = async (who) => {
  await who.page.evaluate(() => window.__sumbi.travel('bulteok'))
  await who.page.waitForFunction(() => window.__sumbi.bulteok.getState().zone === 'bulteok' && !window.__sumbi.bulteok.getState().traveling, null, { timeout: 8000 })
}
/** 카메라 고정 (자동 시점 끔): 해녀 기준 turn 만큼 돌아서 */
const fixCam = (who, turn, dist, pitch) =>
  who.page.evaluate(
    ([turn, dist, pitch]) => {
      const { player, cameraRig } = window.__sumbi
      cameraRig.yaw = player.yaw + turn
      cameraRig.distance = dist
      cameraRig.pitch = pitch
      cameraRig.lastDragAt = 1e15
      cameraRig.lastInputAt = 1e15
    },
    [turn, dist, pitch],
  )
const freeCam = (who) =>
  who.page.evaluate(() => {
    const r = window.__sumbi.cameraRig
    r.lastDragAt = -Infinity
    r.lastInputAt = performance.now()
  })
const mySeat = (who) => who.page.evaluate(() => window.__sumbi.player.seat)
const seatsSeenBy = (who) =>
  who.page.evaluate(() => {
    const { player, remotes } = window.__sumbi
    const all = [player.seat]
    for (const r of remotes.values()) if (r.zone === 'bulteok') all.push(r.seat)
    return all
  })
const seatScreen = (who, i) =>
  who.page.evaluate((i) => {
    const s = window.__sumbi.seatPose(i)
    return window.__sumbi.toScreen(s.x, s.stoneY + 0.1, s.z)
  }, i)
const waitSeated = (who, seat, timeout = 15000) =>
  who.page.waitForFunction((seat) => window.__sumbi.player.seat === seat && !window.__sumbi.player.walk && window.__sumbi.player.pose.state === 'sit', seat, { timeout })

/** 한 장 모음 (원본 프레임을 격자로) */
async function contactSheet(frames, file, title) {
  const cols = 8
  const html = `<html><body style="margin:0;background:#1d1a17;font:13px sans-serif;color:#eee">
    <div style="padding:8px 10px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},240px);gap:3px;padding:0 6px 6px">
    ${frames.map((f) => `<div style="position:relative"><img src="data:image/jpeg;base64,${readFileSync(f.path).toString('base64')}" style="width:240px;display:block"><span style="position:absolute;left:4px;top:2px;text-shadow:0 0 3px #000">${f.t.toFixed(1)}s ${f.state ?? ''}</span></div>`).join('')}
    </div></body></html>`
  const ctx = await browser.newContext({ viewport: { width: cols * 243 + 12, height: 400 } })
  const page = await ctx.newPage()
  await page.setContent(html)
  await page.screenshot({ path: join(out, `${file}.jpg`), type: 'jpeg', quality: 78, fullPage: true })
  await ctx.close()
  console.log('saved', file, `(${frames.length}장)`)
}

/** 걷는 동안 0.1초 간격으로 찍기 (who 들 동시에) */
async function record(whos, prefix, seconds) {
  const frames = Object.fromEntries(whos.map((w) => [w.name, []]))
  const t0 = Date.now()
  let n = 0
  while (Date.now() - t0 < seconds * 1000) {
    const target = t0 + n * 100
    if (Date.now() < target) await wait(target - Date.now())
    const t = (Date.now() - t0) / 1000
    await Promise.all(
      whos.map(async (w) => {
        const path = join(raw, `${prefix}-${w.name}-${String(n).padStart(3, '0')}.jpg`)
        const state = await w.page.evaluate((who) => {
          const s = window.__sumbi
          return who === 'self' ? s.player.pose.state : [...s.remotes.values()].find((r) => r.walk)?.pose.state ?? ''
        }, w.watch ?? 'self')
        await w.page.screenshot({ path, type: 'jpeg', quality: 60 })
        frames[w.name].push({ path, t, state })
      }),
    )
    n++
  }
  return frames
}

// ── 가짜 해녀 (WebSocket 만): 불턱 자리를 채움 ──
function fakeDiver(i) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS)
    const me = { ws, id: -1, seat: -1 }
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 1, device: 'pc', nick: { adj: '작은', noun: '소라' }, look: { towel: 'white', tewak: 'orange', cheek: 'pink' } }))
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.t === 'welcome') {
        me.id = m.you.id
        setTimeout(() => ws.send(JSON.stringify({ t: 'zone', to: 'bulteok' })), 600)
      }
      if (m.t === 'zone' && m.id === me.id && m.zone === 'bulteok') {
        me.seat = m.seat
        resolve(me)
      }
    }
    ws.onerror = (e) => reject(e)
    setTimeout(() => reject(new Error('fake diver timeout ' + i)), 8000)
  })
}

/** 따로 띄운 프로세스의 가짜 해녀: 불턱 → 자리 요청 → 걷는 중에 프로세스를 죽여 비정상 끊김 */
function killableDiver(seat) {
  const code = `
    const ws = new WebSocket(${JSON.stringify(WS)}); let id = -1
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 1, device: 'pc', nick: { adj: '고요한', noun: '돌담' }, look: { towel: 'mint', tewak: 'amber', cheek: 'peach' } }))
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data)
      if (m.t === 'welcome') { id = m.you.id; setTimeout(() => ws.send(JSON.stringify({ t: 'zone', to: 'bulteok' })), 600) }
      if (m.t === 'zone' && m.id === id && m.zone === 'bulteok') setTimeout(() => ws.send(JSON.stringify({ t: 'seat', seat: ${seat} })), 400)
      if (m.t === 'seat' && m.id === id) console.log('WALKING ' + id)
    }`
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] })
  return new Promise((resolve) => {
    child.stdout.on('data', (d) => {
      const m = String(d).match(/WALKING (\d+)/)
      if (m) resolve({ child, id: Number(m[1]) })
    })
  })
}

const A = await open('A')
const B = await open('B')
const C = await open('C')
const ids = { A: await selfId(A), B: await selfId(B), C: await selfId(C) }
console.log('ids', ids)
await toBulteok(A)
await toBulteok(B)
await toBulteok(C)
await wait(800)
console.log('seats', await mySeat(A), await mySeat(B), await mySeat(C))
check((await seatsSeenBy(A)).sort().join() === '0,1,2', 'A·B·C 가 0·1·2번 자리')

// ── 1) 마우스 올리기: 빈자리는 빛·손가락 커서, 찬 자리는 반응 없음 ──
await fixCam(A, Math.PI, 5.6, 0.62)
await wait(900)
const p6 = await seatScreen(A, 6)
await A.page.mouse.move(p6.x, p6.y)
await wait(450)
const cur6 = await A.page.evaluate(() => document.querySelector('canvas').style.cursor)
check(cur6 === 'pointer', `빈자리(6) 위: 손가락 커서 (${cur6})`)
await jpeg(A, 'seat-1-hover-empty')
const p1 = await seatScreen(A, 1)
await A.page.mouse.move(p1.x, p1.y)
await wait(300)
const cur1 = await A.page.evaluate(() => document.querySelector('canvas').style.cursor)
check(cur1 === '', `B 가 앉은 자리(1) 위: 반응 없음 (${cur1 || '기본'})`)
await jpeg(A, 'seat-2-hover-taken')

// ── 2) A 가 빈자리(3)를 눌러 걸어가 앉기: 0.1초 간격 ──
await fixCam(B, Math.PI + 0.4, 7.2, 0.95) // B 위쪽에서 불턱 전체
const p3 = await seatScreen(A, 3)
await A.page.mouse.move(p3.x, p3.y)
await wait(300)
await jpeg(A, 'seat-2b-hover-before-click')
await A.page.mouse.click(p3.x, p3.y)
await fixCam(A, Math.PI / 2 + 0.25, 3.3, 0.28) // 누르자마자 A 옆에서 따라가는 시점으로
await A.page.mouse.move(10, 10)
const recP = record([A, { ...B, watch: 'remote' }], 'walk', 7.6)
await wait(400)
const minR = await A.page.evaluate(() => {
  const w = window.__sumbi.player.walk
  const c = window.__sumbi.seatPose(0)
  // 모닥불 중심 = 자리 0 에서 모닥불 쪽으로 2.05
  const cx = c.x + Math.sin(c.yaw) * 2.05
  const cz = c.z + Math.cos(c.yaw) * 2.05
  return w ? Math.min(...w.pts.map((p) => Math.hypot(p.x - cx, p.z - cz))) : -1
})
check(minR > 1.9, `걷는 길이 모닥불을 가로지르지 않음 (불에서 가장 가까울 때 ${minR.toFixed(2)}m)`)
const bSees = await B.page.evaluate((id) => {
  const r = window.__sumbi.remotes.get(id)
  return { seat: r?.seat, walking: !!r?.walk }
}, ids.A)
const cSees = await C.page.evaluate((id) => {
  const r = window.__sumbi.remotes.get(id)
  return { seat: r?.seat, walking: !!r?.walk }
}, ids.A)
check(bSees.seat === 3 && bSees.walking, `B 화면: A 가 3번으로 걷는 중 (${JSON.stringify(bSees)})`)
check(cSees.seat === 3 && cSees.walking, `C 화면: A 가 3번으로 걷는 중 (${JSON.stringify(cSees)})`)
const frames = await recP
await contactSheet(frames.A, 'seat-3-sequence-A-side', 'A 화면 (옆에서 따라감): 0.1초 간격 — 일어나기 → 돌기 → 걷기 → 돌기 → 털썩 앉기')
await contactSheet(frames.B, 'seat-4-sequence-B-overview', 'B 화면 (위에서 불턱 전체): 같은 시각 A 의 이동 — 모닥불을 가로지르지 않고 둘레로')
const statesA = [...new Set(frames.A.map((f) => f.state))]
const statesB = [...new Set(frames.B.map((f) => f.state).filter(Boolean))]
check(['rise', 'walk', 'settle', 'sit'].every((s) => statesA.includes(s)), `A 동작 순서: ${statesA.join(' → ')}`)
check(['rise', 'walk', 'settle'].every((s) => statesB.includes(s)), `B 화면의 A 동작: ${statesB.join(' → ')}`)
await waitSeated(A, 3)
// 같은 위치에 앉았나 (B 화면의 A ↔ A 자신)
const posA = await A.page.evaluate(() => window.__sumbi.player.pos.toArray())
const posAonB = await B.page.evaluate((id) => window.__sumbi.remotes.get(id).pos.toArray(), ids.A)
check(Math.hypot(posA[0] - posAonB[0], posA[2] - posAonB[2]) < 0.05, 'A 자리 위치가 A·B 화면에서 같음')

// ── 3) 같은 자리를 동시에: B·C 가 9번을 거의 같이 누름 ──
await Promise.all([B.page.evaluate(() => window.__sumbi.seat(9)), C.page.evaluate(() => window.__sumbi.seat(9))])
await wait(500)
const sB = await mySeat(B)
const sC = await mySeat(C)
check((sB === 9) !== (sC === 9), `9번은 한 명만 (B=${sB}, C=${sC})`)
const loser = sB === 9 ? C : B
const oops = await loser.page.evaluate(() => ({ oops: window.__sumbi.player.pose.oopsTime, text: document.body.innerText.includes('앗') }))
check(oops.oops >= 0 && oops.text, `진 쪽(${loser.name}) "앗" 반응 + 그대로 (${JSON.stringify(oops)})`)
await fixCam(loser, 0.45, 3.0, 0.22)
await wait(250)
await jpeg(loser, 'seat-5-race-loser-oops')
for (const w of [A, B, C]) {
  const seats = await seatsSeenBy(w)
  check(new Set(seats).size === seats.length, `${w.name} 화면: 한 자리에 두 명 없음 (${seats.join(',')})`)
}
// 여러 번 반복: 둘이 같은 빈자리를 동시에
let doubles = 0
for (const target of [10, 11, 5, 7]) {
  await B.page.waitForFunction(() => !window.__sumbi.player.walk, null, { timeout: 20000 })
  await C.page.waitForFunction(() => !window.__sumbi.player.walk, null, { timeout: 20000 })
  await Promise.all([B.page.evaluate((t) => window.__sumbi.seat(t), target), C.page.evaluate((t) => window.__sumbi.seat(t), target)])
  await wait(400)
  const both = [await mySeat(B), await mySeat(C)].filter((s) => s === target).length
  if (both !== 1) doubles++
}
check(doubles === 0, `같은 자리 동시 요청 4번 더: 매번 한 명만 (${doubles}번 어긋남)`)

// ── 4) 걷다가 다른 자리로 방향 바꾸기 (A: 3 → 8, 도중에 → 6) ──
await A.page.waitForFunction(() => !window.__sumbi.player.walk)
await A.page.evaluate(() => window.__sumbi.seat(8))
await wait(1800)
const occupied = await seatsSeenBy(A)
const redirect = [6, 4, 0, 1, 2].find((s) => !occupied.includes(s))
await A.page.evaluate((s) => window.__sumbi.seat(s), redirect)
await wait(300)
await jpeg(B, 'seat-6-redirect-B-view')
await waitSeated(A, redirect, 20000)
check((await mySeat(A)) === redirect, `걷다가 ${redirect}번으로 방향 바꿔 앉음`)
check((await B.page.evaluate((id) => window.__sumbi.remotes.get(id).seat, ids.A)) === redirect, 'B 화면에서도 같은 자리')

// ── 5) 정면 시점 자동 전환 ──
await freeCam(A)
await A.page.evaluate(() => {
  const r = window.__sumbi.cameraRig
  r.yaw = window.__sumbi.player.yaw + Math.PI
  r.pitch = 0.4
  r.distance = 4.4
})
await wait(500)
await jpeg(A, 'seat-7-camera-before-behind')
const yawDiff = () =>
  A.page.evaluate(() => {
    const { player, cameraRig } = window.__sumbi
    return Math.abs(Math.atan2(Math.sin(cameraRig.yaw - player.yaw), Math.cos(cameraRig.yaw - player.yaw)))
  })
const before = await yawDiff()
await wait(1500)
check(Math.abs((await yawDiff()) - before) < 0.02, '조작 직후 2.5초 전에는 시점이 그대로')
await wait(4500)
const after = await yawDiff()
check(after < 1.0, `조작이 없으면 해녀 앞쪽으로 (해녀 정면과 ${after.toFixed(2)} rad)`)
await jpeg(A, 'seat-8-camera-after-front')
// 끌면 바로 멈춤
const cx = 640
await A.page.mouse.move(cx, 400)
await A.page.mouse.down()
await A.page.mouse.move(cx + 120, 410, { steps: 6 })
await A.page.mouse.up()
const dragged = await yawDiff()
await wait(1500)
check(Math.abs((await yawDiff()) - dragged) < 0.02, '끌고 난 뒤 바로는 자동으로 움직이지 않음 (제어권)')
// 걸을 땐 등 뒤에서
const occ2 = await seatsSeenBy(A)
const far = [9, 10, 11, 8, 7].find((s) => !occ2.includes(s))
await A.page.evaluate((s) => window.__sumbi.seat(s), far)
await wait(3500)
const behind = await yawDiff()
check(Math.abs(behind - Math.PI) < 0.8, `걷는 동안 카메라는 등 뒤 (${behind.toFixed(2)} rad)`)
await jpeg(A, 'seat-9-camera-walking-behind')
await waitSeated(A, far, 20000)
await wait(5500)
check((await yawDiff()) < 1.0, '앉고 2.5초 뒤 다시 앞쪽으로')
await jpeg(A, 'seat-10-camera-front-again')

// ── 6) 걷는 중에 연결이 끊기면 목적지 자리가 빔 ──
const occ3 = await seatsSeenBy(B)
const dropSeat = [4, 6, 0, 1, 2, 5, 7].find((s) => !occ3.includes(s))
const k = await killableDiver(dropSeat)
await wait(300)
const walkingOnB = await B.page.evaluate((id) => window.__sumbi.remotes.get(id)?.seat, k.id)
check(walkingOnB === dropSeat, `가짜 해녀가 ${dropSeat}번으로 걷는 중 (B 화면 ${walkingOnB})`)
k.child.kill('SIGKILL')
await B.page.waitForFunction((id) => window.__sumbi.remotes.get(id)?.zone === 'sea', k.id, { timeout: 8000 }).catch(() => {})
const gone = await B.page.evaluate((id) => window.__sumbi.remotes.get(id)?.zone, k.id)
check(gone === 'sea', `끊기자 B 화면에서 그 해녀가 불턱을 떠나 자리가 빔 (${gone})`)
await B.page.evaluate((s) => window.__sumbi.seat(s), dropSeat)
await wait(400)
check((await mySeat(B)) === dropSeat, `비워진 ${dropSeat}번에 B 가 앉으러 감`)

// ── 7) 자리가 다 차면 담 밖에 서서 불 쬐기 → 자리가 나면 입구로 들어와 앉기 ──
await Promise.all([A, B, C].map((w) => w.page.waitForFunction(() => !window.__sumbi.player.walk, null, { timeout: 20000 })))
const fakes = []
for (let i = 0; i < 21; i++) fakes.push(await fakeDiver(i))
const D = await open('D')
await toBulteok(D)
await wait(800)
const dSeat = await mySeat(D)
const dState = await D.page.evaluate(() => window.__sumbi.player.pose.state)
check(dSeat >= 24 && dState === 'stand', `자리가 다 차서 D 는 담 밖에 서서 불 쬐기 (자리 ${dSeat}, ${dState})`)
await fixCam(D, Math.PI + 0.3, 4.6, 0.42)
await wait(800)
await jpeg(D, 'seat-11-full-standing-outside')
// 빈자리 없음: 마우스 올려도 반응 없음 / 하나 비면 누를 수 있음
const leaving = fakes.pop()
leaving.ws.close(1000)
await D.page.waitForFunction((id) => !window.__sumbi.remotes.get(id) || window.__sumbi.remotes.get(id).zone !== 'bulteok', leaving.id, { timeout: 5000 })
await fixCam(D, Math.PI + 0.3, 7.5, 0.85)
await wait(600)
const pf = await seatScreen(D, leaving.seat)
await D.page.mouse.move(pf.x, pf.y)
await wait(300)
check((await D.page.evaluate(() => document.querySelector('canvas').style.cursor)) === 'pointer', `비워진 ${leaving.seat}번에 마우스를 올리면 빛남`)
await jpeg(D, 'seat-12-freed-seat-glow')
await D.page.mouse.click(pf.x, pf.y)
await wait(3600)
await jpeg(D, 'seat-13-entering-through-gap')
const dPath = await D.page.evaluate(() => {
  const w = window.__sumbi.player.walk
  return w ? w.pts.map((p) => [p.x, p.z]) : null
})
await waitSeated(D, leaving.seat, 30000)
check((await mySeat(D)) === leaving.seat, `D 가 입구로 들어와 ${leaving.seat}번에 앉음`)
check(!!dPath && dPath.length > 3, `D 가 담 밖에서 입구를 돌아 들어오는 길 (${dPath?.length}점)`)
for (const w of [A, B, C, D]) {
  const seats = (await seatsSeenBy(w)).filter((s) => s < 24)
  check(new Set(seats).size === seats.length, `${w.name} 화면: 마지막에도 자리 겹침 없음 (${seats.length}명)`)
}

for (const f of fakes) f.ws.close(1000)
await browser.close()
console.log(failures.length ? `\n실패 ${failures.length}개:\n- ${failures.join('\n- ')}` : '\n모두 통과')
process.exit(failures.length ? 1 : 0)
