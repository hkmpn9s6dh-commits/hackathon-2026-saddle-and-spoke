import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { join } from 'node:path'
const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.evaluate(() => { void window.__shop.ask('My rear derailleur skips under load. Can you fix it before Friday?') })
await page.waitForTimeout(900)
const info = await page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)} }
  const rows = [...document.querySelectorAll('.jobcard dl div')].map(d => {
    const dd = d.querySelector('dd'); const dt = d.querySelector('dt');
    return { dt: dt.textContent, dd: dd.textContent, ddx: Math.round(dd.getBoundingClientRect().x), ddw: Math.round(dd.getBoundingClientRect().width), roww: Math.round(d.getBoundingClientRect().width) }
  })
  return { job: r('.jobcard'), dl: r('.jobcard dl'), price: r('.pricecard'), rows, scrollW: document.querySelector('.jobcard').scrollWidth, clientW: document.querySelector('.jobcard').clientWidth }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
