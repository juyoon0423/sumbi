// 꾸미기 화면 캡처: 데스크톱 / 모바일 세로, 처음 방문 / 다시 방문, 바다 속 꾸미기 메뉴
// 사용법: npm run dev 실행 중에  node scripts/capture-customize.mjs <출력폴더>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SUMBI_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'captures/customize'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] })
const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('saved', name)
}

const VIEWS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}

for (const [name, opts] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  // 처음 방문: 전부 랜덤으로 정해진 상태
  await page.goto(BASE)
  await page.waitForTimeout(3000)
  await shot(page, `${name}-1-first-visit`)

  // 색 바꾸기 → 기뻐하는 반응
  await page.getByRole('radio', { name: '물수건 민트' }).click()
  await page.getByRole('radio', { name: '테왁 노랑' }).click()
  await page.getByRole('radio', { name: '볼 장밋빛' }).click()
  await page.getByLabel('닉네임 앞말').selectOption('몽글몽글한')
  await page.getByLabel('닉네임 뒷말').selectOption('돌고래')
  await page.waitForTimeout(1500)
  await page.getByRole('radio', { name: '물수건 분홍' }).click()
  await page.waitForTimeout(280)
  await shot(page, `${name}-2-cheer`)
  await page.waitForTimeout(1500)
  await shot(page, `${name}-3-picked`)

  // 다시 방문: 저장된 해녀 + 짧은 카드
  await page.reload()
  await page.waitForTimeout(3000)
  const saved = await page.evaluate(() => localStorage.getItem('sumbi.custom'))
  console.log(name, 'saved', saved)
  await shot(page, `${name}-4-returning`)

  // 입장 → 바다 속 꾸미기 메뉴
  await page.getByRole('button', { name: '바다로 들어가기' }).click()
  await page.waitForTimeout(3000)
  await shot(page, `${name}-5-in-sea`)
  await page.getByRole('button', { name: '해녀 꾸미기' }).click()
  await page.waitForTimeout(2500)
  await shot(page, `${name}-6-sea-menu`)
  await page.getByRole('button', { name: '완료' }).click()
  await page.waitForTimeout(2000)
  await shot(page, `${name}-7-after-menu`)

  if (errors.length) console.log(name, 'page errors:', errors)
  await ctx.close()
}
await browser.close()
