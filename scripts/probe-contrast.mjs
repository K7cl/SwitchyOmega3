// Probe "selected/active" element contrast: import backup, then report the
// computed text color vs background for sidebar-active, dropdown-active, and
// quick-switch items, and screenshot an open result-profile dropdown.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const BACKUP = '/root/proj/SwitchyOmega3/OmegaOptions (5).bak'
const PORT = 9580
const EXT = 'pjdeibnmolfgdfajlclaahhmhmlojgko'
const URLOPT = `chrome-extension://${EXT}/src/entries/options/index.html`
const udd = mkdtempSync(join(tmpdir(), 'so3-contrast-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gj = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json()
const backupJson = readFileSync(BACKUP, 'utf8')

const chrome = spawn(CHROME, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] })
const killChrome = () => { try { chrome.kill('SIGKILL') } catch { /**/ } }
process.on('exit', killChrome)
process.on('SIGTERM', () => { killChrome(); process.exit(143) })
let id = 0
const mkcall = (sock) => (method, params = {}, t = 20000) => new Promise((res, rej) => {
  const mid = ++id; const to = setTimeout(() => rej(new Error('timeout ' + method)), t)
  const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { clearTimeout(to); sock.removeEventListener('message', h); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result) } }
  sock.addEventListener('message', h); sock.send(JSON.stringify({ id: mid, method, params }))
})
async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r))
  const call = mkcall(ws); await call('Runtime.enable')
  const ev = async (e, t) => { const r = await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, t); return r.exceptionDetails ? '__ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result?.value }
  return { ws, call, ev }
}
try {
  for (let i = 0; i < 50; i++) { try { await gj('/json/version'); break } catch { await sleep(200) } }
  await sleep(4000)
  let page, hydrated = false
  for (let attempt = 0; attempt < 10 && !hydrated; attempt++) {
    const tab = await gj(`/json/new?${encodeURIComponent(URLOPT)}`, 'PUT')
    page = await attach(tab.webSocketDebuggerUrl)
    await page.call('Page.enable')
    await page.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 16; i++) { const v = await page.ev(`location.href.startsWith('chrome-error')?'B':(!!document.querySelector('.side-nav .nav-pills')&&!document.querySelector('.om-loading'))`); if (v === true) { hydrated = true; break } if (v === 'B') break; await sleep(300) }
    if (!hydrated) { page.ws.close(); await gj(`/json/close/${tab.id}`).catch(() => {}); await sleep(700) }
  }
  if (!hydrated) throw new Error('not hydrated')
  const sw = await attach((await gj('/json')).find((t) => t.url.includes('/service-worker-loader.js')).webSocketDebuggerUrl)
  await sw.ev(`globalThis.omega.options.reset(${backupJson}).then(()=>'ok')`, 30000)
  await page.call('Page.navigate', { url: URLOPT + '#/profile/auto_moto' })
  await page.call('Page.reload', { ignoreCache: true })
  await sleep(1500)
  for (let i = 0; i < 20; i++) { if (await page.ev(`!!document.querySelector('.switch-rules')`)) break; await sleep(300) }
  // open the first result-profile dropdown
  await page.ev(`(()=>{const b=document.querySelector('.switch-rule-row .omega-profile-select .dropdown-toggle'); if(b) b.click()})()`)
  await sleep(500)
  const probe = await page.ev(`(() => {
    const cs = (el) => { if(!el) return null; const s=getComputedStyle(el); return {color:s.color, bg:s.backgroundColor} }
    const out = {}
    // sidebar active profile link
    out.sidebarActiveA = cs(document.querySelector('.side-nav .nav-profile.active > a'))
    out.sidebarActiveName = cs(document.querySelector('.side-nav .nav-profile.active .profile-name'))
    // open dropdown: active item + its profile-name, and a non-active item
    out.ddActiveA = cs(document.querySelector('.omega-profile-select.open .dropdown-menu > li.active > a'))
    out.ddActiveName = cs(document.querySelector('.omega-profile-select.open .dropdown-menu > li.active .profile-name'))
    out.ddPlainName = cs(document.querySelector('.omega-profile-select.open .dropdown-menu > li:not(.active) .profile-name'))
    // toggle button selected name
    out.toggleName = cs(document.querySelector('.switch-rule-row .omega-profile-select .dropdown-toggle .profile-name'))
    return JSON.stringify(out, null, 1)
  })()`)
  console.log('CONTRAST (auto_moto dropdown):', probe)
  const s1 = await page.call('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, 10000).catch(() => null)
  if (s1) { writeFileSync('/tmp/so3-contrast-dd.jpg', Buffer.from(s1.data, 'base64')); console.log('shot /tmp/so3-contrast-dd.jpg') }
  sw.ws.close(); page.ws.close()
} finally { killChrome() }
process.exit(0)
