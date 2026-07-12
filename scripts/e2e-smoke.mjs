// CDP smoke test: load the built extension in Chrome for Testing (headless),
// open the options page, wait for the store to hydrate, and assert the faithful
// Bootstrap-3 shell renders (sidebar + nav + a profile editor). Uses Node 22's
// built-in WebSocket — no external deps.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const PORT = 9333
const userDataDir = mkdtempSync(join(tmpdir(), 'so3-e2e-'))

// Chrome derives an unpacked extension's ID from a hash of its absolute path.
function unpackedId(absPath) {
  const h = createHash('sha256').update(absPath, 'utf8').digest()
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (h[i] >> 4))
    id += String.fromCharCode(97 + (h[i] & 0xf))
  }
  return id
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJSON(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method })
  return res.json()
}

// Minimal CDP client over one target's WebSocket.
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.id = 0
    this.pending = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve())
      this.ws.addEventListener('error', (e) => reject(e))
    })
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('CDP timeout: ' + method))
      }, 15000)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(to); resolve(v) },
        reject: (e) => { clearTimeout(to); reject(e) },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  close() {
    this.ws.close()
  }
}

let chrome
try {
  chrome = spawn(CHROME, [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  chrome.stderr.on('data', (d) => {
    const s = d.toString()
    if (/error|fail|cannot|denied/i.test(s)) process.stderr.write('[chrome] ' + s)
  })

  // Wait for the DevTools endpoint.
  let version
  for (let i = 0; i < 50; i++) {
    try { version = await getJSON('/json/version'); break } catch { await sleep(200) }
  }
  if (!version) throw new Error('DevTools endpoint never came up')
  console.log('Browser:', version.Browser)

  // Identify OUR extension. Prefer a live service-worker-loader.js target;
  // otherwise fall back to the deterministic unpacked-path ID (the MV3 SW may
  // be dormant and thus absent from the target list).
  let extId
  for (let i = 0; i < 25; i++) {
    const targets = await getJSON('/json')
    const sw = targets.find((t) => t.url.includes('/service-worker-loader.js'))
    if (sw) { extId = sw.url.split('/')[2]; break }
    await sleep(200)
  }
  if (!extId) extId = unpackedId(DIST)
  console.log('Extension ID:', extId)

  // Open the options page, retrying with fresh tabs until it isn't blocked.
  // Headless intermittently returns ERR_BLOCKED_BY_CLIENT until the unpacked
  // extension is fully enabled; a fresh tab after a short wait clears it.
  const optionsUrl = `chrome-extension://${extId}/src/entries/options/index.html`
  let cdp, hydrated = false
  const logs = []
  for (let attempt = 0; attempt < 10 && !hydrated; attempt++) {
    const newTab = await getJSON(`/json/new?${encodeURIComponent(optionsUrl)}`, 'PUT')
    cdp = new CDP(newTab.webSocketDebuggerUrl)
    await cdp.ready
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    })
    await cdp.send('Log.enable')
    cdp.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.method === 'Runtime.consoleAPICalled') {
        logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails
        logs.push('[exception] ' + (d.exception?.description || d.text))
      }
    })
    let blocked = false
    for (let i = 0; i < 16; i++) {
      blocked = await cdp.evaluate(`location.href.startsWith('chrome-error')`)
      if (blocked) break
      const hasNav = await cdp.evaluate(`!!document.querySelector('.side-nav .nav-pills')`)
      const loading = await cdp.evaluate(`!!document.querySelector('.om-loading')`)
      if (hasNav && !loading) { hydrated = true; break }
      await sleep(250)
    }
    if (!hydrated) {
      cdp.close()
      await getJSON(`/json/close/${newTab.id}`).catch(() => {})
      await sleep(700)
    }
  }
  if (!hydrated) throw new Error('options page never hydrated (blocked/loading)')

  const report = await cdp.evaluate(`(() => {
    const q = (s) => document.querySelector(s)
    const qa = (s) => Array.from(document.querySelectorAll(s))
    return {
      title: document.title,
      hasContainer: !!q('.container-fluid'),
      hasSideNav: !!q('.side-nav'),
      navHeaders: qa('.side-nav .nav-header').map(e => e.textContent.trim()),
      settingTabs: qa('.side-nav .nav-pills > li > a').map(e => e.textContent.trim()).slice(0,6),
      profileItems: qa('.side-nav .nav-profile').length,
      hasApply: !!qa('.side-nav a').find(a => /apply/i.test(a.textContent)),
      bodyLen: document.body.innerHTML.length,
      // Confirm Bootstrap 3 CSS actually applied (pull rules): pills should be block.
      pillDisplay: (() => { const a = q('.side-nav .nav-pills > li > a'); return a ? getComputedStyle(a).display : null })(),
    }
  })()`)
  console.log('HYDRATED:', hydrated)
  console.log('OPTIONS REPORT:', JSON.stringify(report, null, 2))

  if (!hydrated) {
    const appHtml = await cdp.evaluate(`(document.getElementById('app')||document.body).innerHTML.slice(0,1200)`)
    console.log('--- #app innerHTML (first 1200) ---\n' + appHtml)
    console.log('--- console/errors ---\n' + logs.join('\n'))
  }

  // Navigate to the General settings screen and confirm it renders headings.
  await cdp.evaluate(`location.hash = '#/general'`)
  await sleep(600)
  const general = await cdp.evaluate(`(() => {
    const h = document.querySelector('.om-main h2, .om-main .page-header h2')
    const groups = Array.from(document.querySelectorAll('.om-main .settings-group h3')).map(e=>e.textContent.trim())
    return { heading: h ? h.textContent.trim() : null, groups }
  })()`)
  console.log('GENERAL SCREEN:', JSON.stringify(general, null, 2))

  // Screenshot several screens for a visual sanity check.
  async function shoot(hash, file) {
    await cdp.evaluate(`location.hash = '${hash}'`)
    await sleep(600)
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(file, Buffer.from(s.data, 'base64'))
    console.log('screenshot ->', file)
  }
  await shoot('#/about', '/tmp/so3-about.png')
  await shoot('#/general', '/tmp/so3-general.png')
  await shoot('#/ui', '/tmp/so3-ui.png')
  await shoot('#/io', '/tmp/so3-io.png')
  // The "auto switch" profile is a SwitchProfile — the most complex editor.
  await shoot('#/profile/' + encodeURIComponent('auto switch'), '/tmp/so3-switch.png')
  await shoot('#/profile/proxy', '/tmp/so3-fixed.png')

  // Report what the switch-profile editor rendered.
  const switchEditor = await cdp.evaluate(`(() => {
    const q=(s)=>document.querySelector(s), qa=(s)=>Array.from(document.querySelectorAll(s))
    return {
      heading: (q('.om-main .page-header h2, .om-main h2')||{}).textContent?.trim() || null,
      ruleRows: qa('.om-main table tbody tr').length,
      hasConditionSelects: qa('.om-main select').length,
      hasAddRule: !!qa('.om-main button, .om-main a').find(e=>/add|condition|rule/i.test(e.textContent||'')),
    }
  })()`)
  console.log('SWITCH EDITOR:', JSON.stringify(switchEditor, null, 2))

  cdp.close()

  const ok = hydrated && report.hasSideNav && report.navHeaders.length >= 2 &&
    general.heading && general.groups.length >= 1
  console.log(ok ? 'SMOKE: PASS' : 'SMOKE: FAIL')
  process.exitCode = ok ? 0 : 2
} finally {
  if (chrome) chrome.kill('SIGKILL')
}
