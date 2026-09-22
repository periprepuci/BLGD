/**
 * Responsive audit.
 *
 * Drives a headless Chromium/Edge over the DevTools Protocol, sets an exact
 * mobile viewport with Emulation.setDeviceMetricsOverride (rather than trusting
 * --window-size, which the OS can clamp to a minimum width), and reports every
 * element that sticks out past the right edge.
 *
 * Usage: node scripts/responsive/check.mjs <browser-exe> <base-url> [widths...]
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Finds a Chromium-family browser. Any of these speak the DevTools Protocol,
 * so the audit does not need a bundled browser download.
 */
function findBrowser() {
  const candidates = [
    process.env.BLGD_BROWSER,
    process.env.CHROME_PATH,
    // Windows
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ]
  return candidates.find((path) => path && existsSync(path)) ?? null
}

const args = process.argv.slice(2)
const baseUrl = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4173'
const widthArgs = args.filter((a) => /^\d+$/.test(a)).map(Number)
const exe = args.find((a) => !a.startsWith('http') && !/^\d+$/.test(a)) ?? findBrowser()

if (!exe) {
  console.error('No Chromium-family browser found. Set BLGD_BROWSER to its path.')
  process.exit(2)
}

const WIDTHS = widthArgs.length ? widthArgs : [390, 768, 1024, 1440, 1920]
const ROUTES = ['', '#/aredl', '#/leaderboard', '#/levels', '#/login', '#/register']
const PORT = 9333

const profile = mkdtempSync(join(tmpdir(), 'blgd-cdp-'))
const browser = spawn(
  exe,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targetUrl() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const info = await res.json()
      return info.webSocketDebuggerUrl
    } catch {
      await sleep(250)
    }
  }
  throw new Error('browser never exposed a debugging endpoint')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.onopen = () => resolve(ws)
    ws.onerror = (e) => reject(new Error(`ws error: ${e.message ?? 'unknown'}`))
  })
}

let nextId = 1
function makeSender(ws) {
  const pending = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
  }
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
}

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') continue;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        cls: String(el.className || '').slice(0, 110),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 38),
      });
    }
  }
  return JSON.stringify({
    vw,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 12),
  });
})()`

async function main() {
  const ws = await connect(await targetUrl())
  const send = makeSender(ws)

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })

  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)

  let failures = 0

  for (const width of WIDTHS) {
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 },
      sessionId,
    )

    for (const route of ROUTES) {
      await send('Page.navigate', { url: `${baseUrl}/${route}` }, sessionId)
      await sleep(width === WIDTHS[0] && route === '' ? 2500 : 1800)

      const { result } = await send(
        'Runtime.evaluate',
        { expression: PROBE, returnByValue: true, awaitPromise: false },
        sessionId,
      )
      const report = JSON.parse(result.value)
      const overflow = report.scrollWidth - report.vw
      const label = `${String(width).padStart(4)}px ${(route || '/').padEnd(14)}`

      if (overflow > 1 || report.offenders.length > 0) {
        failures += 1
        console.log(`${label} OVERFLOW  viewport=${report.vw} scrollWidth=${report.scrollWidth} (+${overflow})`)
        for (const o of report.offenders) {
          console.log(`            <${o.tag}> L=${o.left} R=${o.right} W=${o.width}`)
          console.log(`              class: ${o.cls}`)
          if (o.text) console.log(`              text:  ${o.text}`)
        }
      } else {
        console.log(`${label} ok        viewport=${report.vw} scrollWidth=${report.scrollWidth}`)
      }
    }
  }

  ws.close()
  browser.kill()
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* windows file locks */ }

  console.log(failures === 0 ? '\nNO HORIZONTAL OVERFLOW' : `\n${failures} PAGE/WIDTH COMBINATION(S) OVERFLOW`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  browser.kill()
  process.exit(1)
})
