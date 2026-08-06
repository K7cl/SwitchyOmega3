// Verify the two bug fixes:
//  Bug 1: actionForUrl redraws the toolbar icon so it reflects the effective
//         result profile for a tab. After a per-domain temp rule, the icon's
//         outer ring must take the target profile's color.
//  Bug 2: clicking Apply shows the success toast (.alert-top-wrapper, no ng-hide).
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const BACKUP = '/root/proj/SwitchyOmega3/OmegaOptions (5).bak'
const PORT = 9560
const EXT = 'pjdeibnmolfgdfajlclaahhmhmlojgko'
const URLOPT = `chrome-extension://${EXT}/src/entries/options/index.html`
const udd = mkdtempSync(join(tmpdir(), 'so3-bugfix-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gj = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json()
const backupJson = readFileSync(BACKUP, 'utf8')

const chrome = spawn(CHROME, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] })
const killChrome = () => { try { chrome.kill('SIGKILL') } catch { /**/ } }
process.on('exit', killChrome)
process.on('SIGTERM', () => { killChrome(); process.exit(143) })

let id = 0
const mkcall = (sock) => (method, params = {}, t = 20000) => new Promise((res, rej) => {
  const mid = ++id
  const to = setTimeout(() => rej(new Error('timeout ' + method)), t)
  const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { clearTimeout(to); sock.removeEventListener('message', h); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result) } }
  sock.addEventListener('message', h); sock.send(JSON.stringify({ id: mid, method, params }))
})
async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r))
  const call = mkcall(ws)
  await call('Runtime.enable')
  const ev = async (e, t) => { const r = await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, t); return r.exceptionDetails ? '__ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result?.value }
  return { ws, call, ev }
}

try {
  for (let i = 0; i < 50; i++) { try { await gj('/json/version'); break } catch { await sleep(200) } }
  await sleep(4000)
  let page, hydrated = false
  for (let attempt = 0; attempt < 10 && !hydrated; attempt++) {
    const tab = await gj(`/json/new?${encodeURIComponent(URLOPT + '#/ui')}`, 'PUT')
    page = await attach(tab.webSocketDebuggerUrl)
    await page.call('Page.enable')
    await page.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 16; i++) {
      const v = await page.ev(`location.href.startsWith('chrome-error')?'B':(!!document.querySelector('.side-nav .nav-pills')&&!document.querySelector('.om-loading'))`)
      if (v === true) { hydrated = true; break }
      if (v === 'B') break
      await sleep(300)
    }
    if (!hydrated) { page.ws.close(); await gj(`/json/close/${tab.id}`).catch(() => {}); await sleep(700) }
  }
  if (!hydrated) throw new Error('not hydrated')

  let swUrl
  for (let i = 0; i < 30; i++) {
    const s = (await gj('/json')).find((t) => t.url.includes('/service-worker-loader.js'))
    if (s) { swUrl = s.webSocketDebuggerUrl; break }
    await sleep(300)
  }
  const sw = await attach(swUrl)
  console.log('reset:', await sw.ev(`globalThis.omega.options.reset(${backupJson}).then(()=>'ok').catch(e=>'ERR '+e.message)`, 30000))

  // ---- Bug 1: per-tab icon reflects the temp-rule result ----
  const probe = await sw.ev(`(async () => {
    const o = globalThis.omega.options
    await o.applyProfile('auto_moto')
    const url = 'http://www.nonexistent-switchy-test.com/'
    const px = (img, x, y) => { const i=(y*img.width+x)*4; const d=img.data; return [d[i],d[i+1],d[i+2]] }
    const sample = (act) => {
      if (!act || !act.icon || !act.icon[38]) return null
      return { center: px(act.icon[38], 19, 19), ring: px(act.icon[38], 19, 3) }
    }
    const before = sample(await o.actionForUrl(url))
    await o.addTempRule('nonexistent-switchy-test.com', 'v2ray')
    const after = sample(await o.actionForUrl(url))
    return JSON.stringify({
      before, after,
      currentColor: o.currentProfile().color,
      v2rayColor: o.profile('v2ray').color,
      tempRule: o.queryTempRule('nonexistent-switchy-test.com'),
    })
  })()`, 30000)
  console.log('BUG1 actionForUrl:', probe)

  // ---- Bug 2: Apply button shows the success toast ----
  // Toggle a setting to make the store dirty, then click Apply.
  await page.ev(`(() => { const cb=document.querySelector('#refresh-on-profile-change'); if(cb){cb.click()} })()`)
  await sleep(150)
  const dirty = await page.ev(`!!document.querySelector('.side-nav a .glyphicon-ok-circle')?.closest('a')?.classList.contains('btn-success')`)
  await page.ev(`document.querySelector('.side-nav .glyphicon-ok-circle').closest('a').click()`)
  await sleep(500)
  const toast = await page.ev(`(() => {
    const w = document.querySelector('.alert-top-wrapper')
    if (!w) return JSON.stringify({ present: false })
    const alert = w.querySelector('.alert')
    return JSON.stringify({
      present: true,
      hidden: w.classList.contains('ng-hide'),
      alertClass: alert ? alert.className : null,
      text: (w.textContent || '').trim(),
      displayed: getComputedStyle(w).display,
      opacity: getComputedStyle(w).opacity,
    })
  })()`)
  console.log('BUG2 dirtyBeforeApply:', dirty)
  console.log('BUG2 toast:', toast)
  const dirtyAfter = await page.ev(`!!document.querySelector('.side-nav a .glyphicon-ok-circle')?.closest('a')?.classList.contains('btn-success')`)
  console.log('BUG2 dirtyAfterApply:', dirtyAfter)
  const shot = await page.call('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, 10000).catch(() => null)
  if (shot) { writeFileSync('/tmp/so3-bugfix-toast.jpg', Buffer.from(shot.data, 'base64')); console.log('shot /tmp/so3-bugfix-toast.jpg') }
  sw.ws.close(); page.ws.close()
} finally { killChrome() }
process.exit(0)
