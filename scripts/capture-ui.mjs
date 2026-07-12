// One-shot UI screenshot capture. Leak-proof: kills Chrome on exit/SIGTERM so
// timed-out runs don't leave orphan browsers behind.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const PORT = 9520
const EXT = 'pjdeibnmolfgdfajlclaahhmhmlojgko'
const URLOPT = `chrome-extension://${EXT}/src/entries/options/index.html`
const udd = mkdtempSync(join(tmpdir(), 'so3-cap-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gj = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json()

const chrome = spawn(CHROME, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] })
const killChrome = () => { try { chrome.kill('SIGKILL') } catch { /* already gone */ } }
process.on('exit', killChrome)
process.on('SIGTERM', () => { killChrome(); process.exit(143) })
process.on('SIGINT', () => { killChrome(); process.exit(130) })

let ws, id = 0, call
const mkcall = (sock) => (method, params = {}, t = 8000) => new Promise((res, rej) => {
  const mid = ++id
  const to = setTimeout(() => rej(new Error('timeout ' + method)), t)
  const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { clearTimeout(to); sock.removeEventListener('message', h); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result) } }
  sock.addEventListener('message', h)
  sock.send(JSON.stringify({ id: mid, method, params }))
})

try {
  for (let i = 0; i < 50; i++) { try { await gj('/json/version'); break } catch { await sleep(200) } }
  let hydrated = false
  for (let attempt = 0; attempt < 12 && !hydrated; attempt++) {
    const tab = await gj(`/json/new?${encodeURIComponent(URLOPT)}`, 'PUT')
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    call = mkcall(ws)
    await call('Page.enable'); await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 16; i++) {
      const r = await call('Runtime.evaluate', { expression: `location.href.startsWith('chrome-error')?'B':(!!document.querySelector('.side-nav .nav-pills')&&!document.querySelector('.om-loading'))`, returnByValue: true })
      const v = r.result?.value
      if (v === true) { hydrated = true; break }
      if (v === 'B') break
      await sleep(300)
    }
    if (!hydrated) { ws.close(); await gj(`/json/close/${tab.id}`).catch(() => {}); await sleep(700) }
  }
  console.log('hydrated:', hydrated, 'after retries')
  if (!hydrated) process.exit(1)
  const ev = async (e) => { try { const r = await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.value } catch { return null } }
  async function shoot(hash, file) {
    await ev(`location.hash='${hash}'`); await sleep(900)
    try { const s = await call('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, 8000); writeFileSync(file, Buffer.from(s.data, 'base64')); console.log('shot', file) }
    catch (e) { console.log('SHOTFAIL', file, e.message) }
  }
  for (const [hash, file] of [
    ['#/about', '/tmp/so3-about.jpg'],
    ['#/general', '/tmp/so3-general.jpg'],
    ['#/ui', '/tmp/so3-ui.jpg'],
    ['#/io', '/tmp/so3-io.jpg'],
    ['#/profile/' + encodeURIComponent('auto switch'), '/tmp/so3-switch.jpg'],
    ['#/profile/proxy', '/tmp/so3-fixed.jpg'],
  ]) await shoot(hash, file)
  ws.close()

  // Capture the popup in its own tab (small viewport, like the real popup).
  try {
    const ptab = await gj(`/json/new?${encodeURIComponent(`chrome-extension://${EXT}/src/entries/popup/index.html`)}`, 'PUT')
    const pws = new WebSocket(ptab.webSocketDebuggerUrl)
    await new Promise((r) => pws.addEventListener('open', r))
    const pcall = mkcall(pws)
    await pcall('Page.enable'); await pcall('Runtime.enable')
    await pcall('Emulation.setDeviceMetricsOverride', { width: 320, height: 500, deviceScaleFactor: 1, mobile: false })
    await sleep(1500)
    try {
      const s = await pcall('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, 8000)
      writeFileSync('/tmp/so3-popup.jpg', Buffer.from(s.data, 'base64'))
      console.log('shot /tmp/so3-popup.jpg')
    } catch (e) { console.log('SHOTFAIL popup', e.message) }
    pws.close()
  } catch (e) { console.log('popup capture error', e.message) }
} finally { killChrome() }
process.exit(0)
