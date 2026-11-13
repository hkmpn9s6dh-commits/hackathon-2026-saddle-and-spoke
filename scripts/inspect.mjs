import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { join } from 'node:path'
const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
const info = await page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)} }
  const cs = (s, props) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return Object.fromEntries(props.map(p => [p, c[p]])) }
  return {
    wall: r('.wall'), foot: r('.wall-foot'), job: r('.jobcard'), dl: r('.jobcard dl'), row: r('.jobcard dl div'),
    dt: r('.jobcard dt'), dd: r('.jobcard dd'), price: r('.pricecard'), wrap: r('.bike-wrap'), svg: r('#bike'),
    group: r('.part[data-part="rear_derailleur"]'),
    footCols: cs('.wall-foot', ['gridTemplateColumns','width']),
    ddStyle: cs('.jobcard dd', ['minWidth','flex','textAlign','whiteSpace']),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
