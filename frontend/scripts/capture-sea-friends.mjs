// 바다 친구들 확인: 물속 생물(자리돔 떼·한치·문어·바닥 생물·해파리 낮/밤), 다가가면 흩어지는 물고기·숨는 문어 연속,
// 바다거북(! 와 일지), 남방큰돌고래(브라우저 3개가 같은 순간에 · 수면/둥둥/물속 시점), 일지 줄.
// 사용법: ./dev.sh 실행 중에 (백엔드는 SUMBI_DEV_EVENTS=true — dev.sh 기본)
//   node scripts/capture-sea-friends.mjs <출력폴더> [all|under|approach|turtle|dolphin]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/sea-friends'
const only = process.argv[3] ?? 'all'
const run = (m) => only === 'all' || only === m
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const CUSTOMS = [
  { adj: '반짝이는', noun: '윤슬', towel: 'white', tewak: 'orange', cheek: 'pink' },
  { adj: '느긋한', noun: '소라', towel: 'sky', tewak: 'yellow', cheek: 'rose' },
  { adj: '작은', noun: '물결', towel: 'pink', tewak: 'orange', cheek: 'peach' },
]

async function open(query = '', i = 0, ctxOpts = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }) {
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addInitScript((c) => {
    localStorage.setItem('sumbi.custom', JSON.stringify(c))
    localStorage.removeItem('sumbi.dolphinDay')
  }, CUSTOMS[i % CUSTOMS.length])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => failures.push('pageerror: ' + e.message))
  await page.goto(BASE + query)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus !== 'connecting' && window.__sumbi?.friends, null, { timeout: 15000 })
  await page.waitForTimeout(600)
  return { ctx, page }
}
const shot = async (page, file) => {
  await page.screenshot({ path: join(out, `${file}.jpg`), type: 'jpeg', quality: 82 })
  console.log('saved', file)
}

/** 물속으로 (계속 잠수) */
async function dive(page) {
  await page.evaluate(() => window.__sumbi.input.setDiveLatch(true))
  await page.waitForFunction(() => window.__sumbi.player.pos.y < -3, null, { timeout: 15000 })
}

/**
 * 대상(target)이 카메라와 해녀 사이에 오도록: 해녀는 대상 너머 beyond(m), 카메라는 해녀 뒤 camDist(m).
 * side: 카메라를 옆으로 돌리는 각도 (대상이 해녀와 겹치지 않게), height: 해녀 높이 (대상 기준)
 */
async function face(page, target, { beyond = 2.4, side = 0.32, camDist = 5, pitch = 0.15, heading = 0, height } = {}) {
  await page.evaluate(
    ({ target, beyond, side, camDist, pitch, heading, height }) => {
      const { player, cameraRig } = window.__sumbi
      player.pos.x = target.x + Math.sin(heading) * beyond
      player.pos.z = target.z + Math.cos(heading) * beyond
      if (height !== undefined) player.pos.y = target.y + height
      player.yaw = heading
      cameraRig.yaw = heading + Math.PI + side
      cameraRig.distance = camDist
      cameraRig.pitch = pitch
      cameraRig.lastDragAt = performance.now() + 1e9
      cameraRig.snap = true
    },
    { target, beyond, side, camDist, pitch, heading, height },
  )
}

// ── 물속 생물 ──
if (run('under')) {
  for (const [time, hour] of [
    ['day', 13],
    ['night', 23],
  ]) {
    console.log(`▶ 물속 생물 (${time})`)
    const { ctx, page } = await open(`?hour=${hour}&quality=high`)
    await dive(page)
    const where = await page.evaluate(() => JSON.parse(JSON.stringify(window.__sumbi.friends.where)))
    check(where.schools.length >= 2, `자리돔 떼 ${where.schools.length}개`)

    // 자리돔 떼
    await face(page, where.schools[0], { beyond: 1, side: 0.25, camDist: 9, pitch: 0.08, height: 0 })
    await wait(2500)
    const s0 = await page.evaluate(() => window.__sumbi.friends.where.schools[0])
    await face(page, s0, { beyond: 1, side: 0.25, camDist: 9, pitch: 0.08, height: 0 })
    await wait(1200)
    await shot(page, `${time}-damsel`)

    // 한치
    await face(page, where.squids[0], { beyond: 2.2, side: 0.12, camDist: 5, pitch: 0.05, height: 0 })
    await wait(600)
    const sq = await page.evaluate(() => window.__sumbi.friends.where.squids[0])
    await face(page, sq, { beyond: 2.2, side: 0.12, camDist: 5, pitch: 0.05, height: 0 })
    await wait(500)
    await shot(page, `${time}-squid`)

    // 문어 (빼꼼)
    const den = where.octopus ?? (await page.evaluate(() => window.__sumbi.friends.octopus.dens[0]))
    await face(page, den, { beyond: 5, side: 0.32, camDist: 7, pitch: 0.12, height: 0.9 })
    await page.evaluate(() => window.__sumbi.friends.octopus.peekNow())
    await wait(1600)
    await shot(page, `${time}-octopus`)

    // 바닥 생물: 게 · 소라게 · 불가사리
    await face(page, where.crabs[0], { beyond: 1.4, side: 0.35, camDist: 3.4, pitch: 0.35, height: 0.9 })
    await wait(1200)
    await shot(page, `${time}-crab`)
    await face(page, where.hermits[0], { beyond: 1.4, side: 0.35, camDist: 3.4, pitch: 0.35, height: 0.9 })
    await wait(1200)
    await shot(page, `${time}-hermit`)
    await face(page, where.starfish[0], { beyond: 2, side: 0.4, camDist: 4.2, pitch: 0.45, height: 0.9 })
    await wait(800)
    await shot(page, `${time}-starfish`)

    // 해파리
    await face(page, where.jellies[0], { beyond: 2.5, side: 0.3, camDist: 6, pitch: -0.05, height: 0 })
    await wait(1500)
    await shot(page, `${time}-jelly`)
    await page.evaluate(() => window.__sumbi.input.setDiveLatch(false))
    await ctx.close()
  }
}

// ── 다가가면: 자리돔 떼가 흩어졌다 다시 모이고, 문어가 쏙 ──
if (run('approach')) {
  console.log('▶ 다가가기 연속')
  const { ctx, page } = await open('?hour=13&quality=high')
  await dive(page)
  const where = await page.evaluate(() => JSON.parse(JSON.stringify(window.__sumbi.friends.where)))
  // 떼에서 9m 떨어져 보다가, 떼 한가운데로 헤엄쳐 들어감
  const s0 = where.schools[0]
  await face(page, s0, { beyond: -9, side: 0.25, camDist: 6, pitch: 0.06, height: 0 })
  await wait(2500)
  const spread0 = await page.evaluate(() => window.__sumbi.friends.where.spread[0])
  await shot(page, 'approach-1-school-calm')
  // 떼의 지금 자리를 따라가며 0.45초마다 3m씩 (같은 높이로)
  for (let k = 1; k <= 3; k++) {
    await page.evaluate((k) => {
      const { player, friends } = window.__sumbi
      const c = friends.where.schools[0]
      player.pos.set(c.x, c.y, c.z - 9 + 3 * k)
    }, k)
    await wait(450)
  }
  await wait(300)
  const spread1 = await page.evaluate(() => window.__sumbi.friends.where.spread[0])
  await shot(page, 'approach-2-school-scatter')
  check(spread1 > spread0 * 1.3, `다가가면 떼가 흩어짐 (퍼짐 ${spread0.toFixed(2)} → ${spread1.toFixed(2)})`)
  // 떼에서 멀어지면 다시 모임
  await page.evaluate((s0) => {
    window.__sumbi.player.pos.x = s0.x + 9
  }, s0)
  await wait(6000)
  const spread2 = await page.evaluate(() => window.__sumbi.friends.where.spread[0])
  await face(page, await page.evaluate(() => window.__sumbi.friends.where.schools[0]), { beyond: -9, side: 0.25, camDist: 6, pitch: 0.06, height: 0 })
  await wait(900)
  await shot(page, 'approach-3-school-regroup')
  check(spread2 < spread1, `멀어지면 다시 모임 (${spread1.toFixed(2)} → ${spread2.toFixed(2)})`)

  // 문어: 빼꼼 → 해녀가 다가감 → 쏙
  const den = await page.evaluate(() => window.__sumbi.friends.octopus.dens[0])
  await face(page, den, { beyond: -6, side: 0.3, camDist: 4, pitch: 0.2, height: 0.9 })
  await page.evaluate(() => window.__sumbi.friends.octopus.peekNow())
  await wait(1600)
  check((await page.evaluate(() => window.__sumbi.friends.octopus.modes[0])) === 'peeking', '문어 빼꼼')
  await shot(page, 'approach-4-octopus-peek')
  await face(page, den, { beyond: -2.6, side: 0.3, camDist: 4, pitch: 0.2, height: 0.9 })
  await wait(120)
  await shot(page, 'approach-5-octopus-duck')
  await wait(500)
  const mode = await page.evaluate(() => window.__sumbi.friends.octopus.modes[0])
  check(mode === 'hidden' || mode === 'ducking', `가까이 가면 문어가 숨음 (${mode})`)
  await shot(page, 'approach-6-octopus-hidden')
  await ctx.close()
}

// ── 바다거북 ──
if (run('turtle')) {
  console.log('▶ 바다거북')
  const { ctx, page } = await open('?hour=10&quality=high')
  await page.evaluate(() => window.__sumbi.turtle())
  await dive(page)
  await page.waitForFunction(() => window.__sumbi.friends.turtle.active(), null, { timeout: 8000 })
  check(true, '잠수하면 바다거북이 나타남')
  // 거북이 가까이 오도록 기다렸다가, 거북 쪽을 봄
  await page.waitForFunction(() => window.__sumbi.session.getState().turtle, null, { timeout: 40000 })
  check(true, '가까이 오면 만남 기록 (session.turtle)')
  const bubble = await page.evaluate(() => document.querySelector('.speech')?.textContent ?? '')
  check(bubble.includes('!'), `머리 위 "!" (${bubble})`)
  await page.evaluate(() => {
    const { player, cameraRig, friends } = window.__sumbi
    const t = friends.turtle.pos
    cameraRig.yaw = Math.atan2(player.pos.x - t.x, player.pos.z - t.z) + 0.35
    cameraRig.pitch = 0.08
    cameraRig.distance = 4
    cameraRig.lastDragAt = performance.now() + 1e9
    cameraRig.snap = true
  })
  await wait(200)
  await shot(page, 'turtle-meet')
  await wait(2500)
  await page.evaluate(() => {
    const { player, cameraRig, friends } = window.__sumbi
    const t = friends.turtle.pos
    cameraRig.yaw = Math.atan2(player.pos.x - t.x, player.pos.z - t.z) + 0.2
    cameraRig.snap = true
  })
  await wait(200)
  await shot(page, 'turtle-pass')
  // 물 위로 → 물질 마치기 → 일지 줄
  await page.evaluate(() => window.__sumbi.input.setDiveLatch(false))
  await page.waitForFunction(() => window.__sumbi.player.pos.y > -0.3, null, { timeout: 30000 })
  await wait(1200)
  await page.getByRole('button', { name: /물질 마치기/ }).click()
  await page.waitForSelector('.journal-image img', { timeout: 8000 })
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('sumbi.journal') ?? '[]').at(-1))
  check(rec?.turtle === true, '일지 기록에 바다거북')
  await shot(page, 'turtle-journal')
  await ctx.close()
}

// ── 남방큰돌고래: 같은 바다의 브라우저 3개가 같은 순간에 ──
if (run('dolphin')) {
  console.log('▶ 남방큰돌고래 (브라우저 3개)')
  const A = await open('?hour=16.5&quality=high', 0)
  const B = await open('?hour=16.5&quality=high', 1)
  await wait(800)
  // B 는 둥둥
  await B.page.evaluate(() => window.__sumbi.float.start())
  await A.page.evaluate(() => window.__sumbi.dolphin())
  const startOf = (page) =>
    page.waitForFunction(() => window.__sumbi.friends.dolphins.getState().pass, null, { timeout: 8000 }).then(() =>
      page.evaluate(() => {
        const p = window.__sumbi.friends.dolphins.getState().pass
        return { seq: p.seq, seed: p.seed, wall: performance.timeOrigin + p.start, from: p.from, to: p.to, dur: p.dur, n: p.n }
      }),
    )
  const [pa, pb] = await Promise.all([startOf(A.page), startOf(B.page)])
  check(pa.seq === pb.seq && pa.seed === pb.seed, `A·B 같은 무리 (seq ${pa.seq}, ${pa.n}마리)`)
  check(Math.abs(pa.wall - pb.wall) < 250, `A·B 같은 순간 (차이 ${Math.abs(pa.wall - pb.wall).toFixed(0)}ms)`)
  const toasts = await Promise.all([A, B].map((x) => x.page.evaluate(() => document.querySelector('.toasts')?.textContent ?? '')))
  check(toasts.every((t) => t.includes('돌고래')), '토스트 "돌고래가 지나가요!" (A·B)')

  // C 는 6초 늦게 들어와서 물속에서 봄
  await wait(4000)
  const C = await open('?hour=16.5&quality=high', 2)
  const pc = await startOf(C.page)
  check(pc.seq === pa.seq && Math.abs(pc.wall - pa.wall) < 400, `늦게 들어온 C 도 같은 장면 (차이 ${Math.abs(pc.wall - pa.wall).toFixed(0)}ms)`)

  /** 무리 가운데 (지금) */
  const podAt = (page) =>
    page.evaluate(() => {
      const p = window.__sumbi.friends.dolphins.getState().pass
      const k = Math.min(1, ((performance.now() - p.start) / 1000) * 2.4 / Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]))
      return { x: p.from[0] + (p.to[0] - p.from[0]) * k, y: 0, z: p.from[1] + (p.to[1] - p.from[1]) * k }
    })
  const lookAtPod = (page, { camDist = 5, pitch = 0.1, side = 0.12 } = {}) =>
    page.evaluate(
      ({ camDist, pitch, side }) => {
        const { player, cameraRig, friends } = window.__sumbi
        const p = friends.dolphins.getState().pass
        const k = Math.min(1, (((performance.now() - p.start) / 1000) * 2.4) / Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]))
        const x = p.from[0] + (p.to[0] - p.from[0]) * k
        const z = p.from[1] + (p.to[1] - p.from[1]) * k
        cameraRig.yaw = Math.atan2(player.pos.x - x, player.pos.z - z) + side
        cameraRig.pitch = pitch
        cameraRig.distance = camDist
        cameraRig.lastDragAt = performance.now() + 1e9
        cameraRig.snap = true
      },
      { camDist, pitch, side },
    )
  // 둥둥(B): 끌어 둘러보듯 고개를 돌려 무리가 화면 가운데 오는 각도를 찾음
  const aimFloat = () =>
    B.page.evaluate(() => {
      const { float, friends, toScreen } = window.__sumbi
      const p = friends.dolphins.getState().pass
      const k = Math.min(1, (((performance.now() - p.start) / 1000) * 2.4) / Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]))
      const x = p.from[0] + (p.to[0] - p.from[0]) * k
      const z = p.from[1] + (p.to[1] - p.from[1]) * k
      float.cam.pitch = -0.35
      float.cam.lastInput = performance.now() + 1e9
      // 각도마다 한 프레임씩 그려 봐야 해서 여기선 지금 각도 기준으로 조금씩 보정
      const s = toScreen(x, 0.5, z)
      if (!s) return
      if (s.behind) float.cam.yaw += Math.PI
      else float.cam.yaw -= ((s.x - innerWidth / 2) / innerWidth) * 1.1
    })
  for (let i = 0; i < 12; i++) {
    await aimFloat()
    await wait(120)
  }
  await dive(C.page)
  // 뛰어오르는 장면을 몇 장 (같은 순간에 세 창)
  for (let k = 1; k <= 4; k++) {
    await Promise.all([lookAtPod(A.page), lookAtPod(C.page, { camDist: 4, pitch: -0.35, side: 0.1 }), aimFloat()])
    await wait(250)
    await Promise.all([shot(A.page, `dolphin-${k}-surface`), shot(B.page, `dolphin-${k}-float`), shot(C.page, `dolphin-${k}-under`)])
    await wait(1600)
  }
  const pod = await podAt(A.page)
  console.log('  무리 위치', JSON.stringify(pod))
  // 오늘 통계 · 일지
  await wait(800)
  const today = await A.page.evaluate(() => document.querySelector('.today-dolphin')?.textContent ?? '')
  check(/돌고래가 \d+번/.test(today), `오늘의 바다: ${today}`)
  const sess = await Promise.all([A, B, C].map((x) => x.page.evaluate(() => window.__sumbi.session.getState().dolphin)))
  check(sess.every(Boolean), `세 창 모두 "남방큰돌고래를 봤어요" 기록 (${sess.join(', ')})`)
  // 두 번째로 부르면 오늘은 일지에 다시 쓰지 않음 (하루 한 번)
  const day = await A.page.evaluate(() => localStorage.getItem('sumbi.dolphinDay'))
  check(!!day, `하루 한 번 표시 (${day})`)
  await A.page.getByRole('button', { name: /물질 마치기/ }).click()
  await A.page.waitForSelector('.journal-image img', { timeout: 8000 })
  await shot(A.page, 'dolphin-journal')
  await Promise.all([A, B, C].map((x) => x.ctx.close()))
}

await browser.close()
console.log(failures.length ? `실패 ${failures.length}개: ${failures.join(', ')}` : '모두 통과')
process.exit(failures.length ? 1 : 0)
