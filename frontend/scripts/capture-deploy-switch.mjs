// 무중단 배포 확인: 브라우저 2개가 접속한 채로 blue ↔ green 을 바꿔 배포 → 1012 신호 → 몇 초 안에 새 서버로 다시 붙는지.
// 사용법:
//   cd deploy && ./local.sh up
//   cd frontend && VITE_WS_URL=ws://localhost:8090/ws npx vite --port 5174
//   SUMBI_URL=http://localhost:5174 node scripts/capture-deploy-switch.mjs <출력폴더>
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5174'
const API = process.env.SUMBI_API ?? 'http://localhost:8090'
const out = process.argv[2] ?? 'captures/deploy-switch'
mkdirSync(out, { recursive: true })
const LOCAL_SH = resolve(import.meta.dirname, '../../deploy/local.sh')

const failures = []
const check = (ok, what) => {
  console.log(ok ? '  ✓' : '  ✗', what)
  if (!ok) failures.push(what)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const health = async () => (await fetch(`${API}/health`)).json()

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })

async function join_(name, custom) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((c) => localStorage.setItem('sumbi.custom', JSON.stringify(c)), custom)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => failures.push(`${name} pageerror: ${e.message}`))
  await page.goto(BASE)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForFunction(() => window.__sumbi?.game.getState().netStatus === 'online', null, { timeout: 15000 })
  // 상태 변화 기록 (100ms 마다)
  await page.evaluate(() => {
    window.__statusLog = []
    let last = ''
    setInterval(() => {
      const s = window.__sumbi.game.getState().netStatus
      if (s !== last) window.__statusLog.push([Math.round(performance.now()), s])
      last = s
    }, 50)
  })
  return { name, ctx, page }
}

console.log('▶ 두 사람 접속')
const A = await join_('A', { adj: '반짝이는', noun: '윤슬', towel: 'white', tewak: 'orange', cheek: 'pink' })
const B = await join_('B', { adj: '느긋한', noun: '소라', towel: 'blue', tewak: 'orange', cheek: 'none' })
await wait(1500)
const before = await health()
check(before.players === 2, `서버 인원 2 (${before.players})`)
const seesOther = (p) => p.page.evaluate(() => window.__sumbi.remotes.size)
check((await seesOther(A)) === 1 && (await seesOther(B)) === 1, '서로 보임')

console.log('▶ 반대 색으로 배포 (./local.sh switch)')
const t0 = Date.now()
const deploy = spawn(LOCAL_SH, ['switch'], { stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
deploy.stdout.on('data', (d) => (log += d))
deploy.stderr.on('data', (d) => (log += d))
// 다시 붙는 동안 화면 캡처
let shotDone = false
const shooter = (async () => {
  while (!shotDone) {
    const s = await A.page.evaluate(() => window.__sumbi.game.getState().netStatus).catch(() => '')
    if (s === 'restarting') {
      await A.page.screenshot({ path: join(out, 'restarting.jpg'), type: 'jpeg', quality: 82 })
      console.log('saved restarting')
      return
    }
    await wait(60)
  }
})()
const code = await new Promise((r) => deploy.on('close', r))
const deployMs = Date.now() - t0
check(code === 0, `배포 스크립트 성공 (${(deployMs / 1000).toFixed(0)}초)`)
if (code !== 0) console.log(log.split('\n').slice(-30).join('\n'))
console.log(log.split('\n').filter((l) => l.startsWith('▶') || l.startsWith('✓')).join('\n'))

for (const p of [A, B]) {
  await p.page
    .waitForFunction(
      () => {
        const log = window.__statusLog
        const r = log.findIndex(([, s]) => s === 'restarting')
        return r >= 0 && log.slice(r).some(([, s]) => s === 'online')
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {})
  const st = await p.page.evaluate(() => window.__statusLog)
  const r = st.findIndex(([, s]) => s === 'restarting')
  const back = r >= 0 ? st.slice(r).find(([, s]) => s === 'online') : null
  check(r >= 0, `${p.name}: "새로 단장" 표시 (1012 받음)`)
  check(!!back, `${p.name}: 다시 online`)
  if (r >= 0 && back) {
    const gap = back[0] - st[r][0]
    check(gap < 6000, `${p.name}: ${gap}ms 만에 다시 이어짐 (6초 안)`)
  }
  check(!st.some(([, s]) => s === 'offline'), `${p.name}: 혼자 하는 바다로 떨어지지 않음`)
  console.log('   ', p.name, st.map(([t, s]) => `${s}@${t}`).join(' → '))
}
shotDone = true
await shooter
for (const p of [A, B]) {
  const d = await p.page.evaluate(() => {
    const n = window.__sumbi.net
    return { status: window.__sumbi.game.getState().netStatus, ws: n.ws?.ws?.readyState ?? null, welcomed: n.ws?.welcomed ?? null, game: n.game === n.ws ? 'ws' : 'other', waiting: n.waiting }
  })
  console.log('   ', p.name, JSON.stringify(d))
}
await wait(2500)
const after = await health()
check(after.players === 2, `새 서버 인원 2 (${after.players})`)
check((await seesOther(A)) === 1 && (await seesOther(B)) === 1, '새 서버에서도 서로 보임')
await A.page.screenshot({ path: join(out, 'after.jpg'), type: 'jpeg', quality: 82 })

await browser.close()
console.log(failures.length ? `실패 ${failures.length}개: ${failures.join(', ')}` : '모두 통과')
process.exit(failures.length ? 1 : 0)
