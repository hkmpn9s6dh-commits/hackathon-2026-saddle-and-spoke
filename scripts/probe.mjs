import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { join } from 'node:path'
const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.fill('#say', 'My rear derailleur skips under load. Can you fix it before Friday?')
await page.press('#say', 'Enter')
await page.waitForTimeout(1500)
console.log('--- after question ---')
console.log(await page.locator('.transcript').innerText())
await page.screenshot({ path: 'proof/shots/run1.png' })
// consent card
if (await page.locator('.card .btn-primary').count()) {
  await page.locator('.card .btn-primary').first().click()
  await page.waitForTimeout(1200)
}
console.log('--- after consent ---')
console.log(await page.locator('.transcript').innerText())
await page.screenshot({ path: 'proof/shots/run2.png' })
console.log('--- logs ---')
console.log(logs.join('\n'))
await browser.close()
