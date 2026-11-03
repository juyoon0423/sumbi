// 전후 비교 이미지: 두 장(또는 여러 장)을 나란히 붙여 JPEG 하나로.
// 사용법: node scripts/compare.mjs <출력.jpg> <제목> <왼쪽.jpg> <왼쪽이름> <오른쪽.jpg> <오른쪽이름> [...]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const [outPath, title, ...rest] = process.argv.slice(2)
const items = []
for (let i = 0; i < rest.length; i += 2) items.push({ src: readFileSync(rest[i]).toString('base64'), label: rest[i + 1] })
const W = 640
const html = `<html><body style="margin:0;background:#16202a;font-family:-apple-system,sans-serif;color:#eef">
<div style="padding:10px 14px;font-size:20px;font-weight:600">${title}</div>
<div style="display:flex;gap:8px;padding:0 8px 8px">${items
  .map((it) => `<div><div style="font-size:15px;padding:4px 2px">${it.label}</div><img style="width:${W}px;display:block;border-radius:4px" src="data:image/jpeg;base64,${it.src}"></div>`)
  .join('')}</div></body></html>`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: items.length * (W + 8) + 8, height: 100 }, deviceScaleFactor: 1 })
await page.setContent(html)
await page.waitForLoadState('load')
await page.screenshot({ path: outPath, type: 'jpeg', quality: 74, fullPage: true })
await browser.close()
console.log('saved', outPath)
