import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { join } from 'node:path'
const exe = join(homedir(), 'AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: exe })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.click('[data-open="conformance"]')
await page.click('button:has-text("Run all checks")')
await page.waitForTimeout(9000)
const rows = await page.locator('.check').evaluateAll(els => els.map(e => ({s: e.dataset.state, t: e.querySelector('.why')?.textContent})))
console.log(JSON.stringify(rows, null, 1))
await browser.close()
