// Verify the Quick Switch two-list drag UI: import the backup with quick-switch
// enabled and two cycled profiles, then screenshot the Interface page.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const BACKUP = '/root/proj/SwitchyOmega3/OmegaOptions (5).bak'
const PORT = 9570
const EXT = 'pjdeibnmolfgdfajlclaahhmhmlojgko'
const URLOPT = `chrome-extension://${EXT}/src/entries/options/index.html`
const udd = mkdtempSync(join(tmpdir(), 'so3-qs-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gj = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json()

// Backup with quick-switch enabled + two cycled profiles (ordered).
const backup = JSON.parse(readFileSync(BACKUP, 'utf8'))
backup['-enableQuickSwitch'] = true
backup['-quickSwitchProfiles'] = ['v2ray', 'direct']
const backupJson = JSON.stringify(backup)

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
    const tab = await gj(`/json/new?${encodeURIComponent(URLOPT)}`, 'PUT')
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
    const sw = (await gj('/json')).find((t) => t.url.includes('/service-worker-loader.js'))
    if (sw) { swUrl = sw.webSocketDebuggerUrl; break }
    await sleep(300)
  }
  const sw = await attach(swUrl)
  console.log('reset:', await sw.ev(`globalThis.omega.options.reset(${backupJson}).then(()=>'ok').catch(e=>'ERR '+e.message)`, 30000))

  await page.call('Page.navigate', { url: URLOPT + '#/ui' })
  await page.call('Page.reload', { ignoreCache: true })
  await sleep(1500)
  for (let i = 0; i < 20; i++) { if (await page.ev(`!!document.querySelector('.cycle-profile-container')`)) break; await sleep(300) }
  const info = await page.ev(`(() => {
    const lists = document.querySelectorAll('.cycle-profile-container')
    const read = (ul) => ul ? Array.from(ul.querySelectorAll('li .profile-name')).map(e=>e.textContent.trim()) : null
    return JSON.stringify({
      count: lists.length,
      cycled: read(document.querySelector('.cycle-profile-container.cycle-enabled')),
      notCycled: read(lists[1]),
    })
  })()`)
  console.log('QUICK SWITCH:', info)
  const s = await page.call('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, 10000).catch(() => null)
  if (s) { writeFileSync('/tmp/so3-quickswitch.jpg', Buffer.from(s.data, 'base64')); console.log('shot /tmp/so3-quickswitch.jpg') }
  sw.ws.close(); page.ws.close()
} finally { killChrome() }
process.exit(0)
