// E2E: import the user's real backup via the SW, then verify the Switch editor
// renders the attached rule list correctly (default resolved, rule-list shown).
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const BACKUP = '/root/proj/SwitchyOmega3/OmegaOptions (5).bak'
const PORT = 9540
const EXT = 'pjdeibnmolfgdfajlclaahhmhmlojgko'
const URLOPT = `chrome-extension://${EXT}/src/entries/options/index.html`
const udd = mkdtempSync(join(tmpdir(), 'so3-imp-'))
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
  sock.addEventListener('message', h)
  sock.send(JSON.stringify({ id: mid, method, params }))
})
async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  const call = mkcall(ws)
  await call('Runtime.enable')
  const ev = async (e, t) => { const r = await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, t); if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text }; return r.result?.value }
  return { ws, call, ev }
}

try {
  for (let i = 0; i < 50; i++) { try { await gj('/json/version'); break } catch { await sleep(200) } }
  await sleep(4000) // let the extension register

  // Open the options page (also wakes the service worker).
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
  if (!hydrated) throw new Error('options page never hydrated')

  // Find the (now-awake) service worker and import the backup through it.
  let swUrl
  for (let i = 0; i < 30; i++) {
    const targets = await gj('/json')
    const sw = targets.find((t) => t.url.includes('/service-worker-loader.js'))
    if (sw) { swUrl = sw.webSocketDebuggerUrl; break }
    await sleep(300)
  }
  if (!swUrl) throw new Error('service worker target not found')
  const sw = await attach(swUrl)
  console.log('omega exposed:', await sw.ev(`typeof globalThis.omega`))
  const resetRes = await sw.ev(`globalThis.omega.options.reset(${backupJson}).then(()=>'ok').catch(e=>'ERR '+e.message)`, 30000)
  console.log('reset result:', JSON.stringify(resetRes))

  const check = await sw.ev(`Promise.resolve(globalThis.omega.options.getAll()).then(o=>JSON.stringify({
    hasAttached: !!o['+__ruleListOf_auto_moto'],
    listLen: (o['+__ruleListOf_auto_moto']||{}).ruleList ? o['+__ruleListOf_auto_moto'].ruleList.length : 0,
    match: (o['+__ruleListOf_auto_moto']||{}).matchProfileName,
    attachedDefault: (o['+__ruleListOf_auto_moto']||{}).defaultProfileName,
    autoMotoDefault: (o['+auto_moto']||{}).defaultProfileName,
    autoMotoRules: (o['+auto_moto']||{}).rules ? o['+auto_moto'].rules.length : 0,
  }))`, 20000)
  console.log('imported options:', check)

  // Reload the options page so the Pinia store re-fetches the imported options.
  await page.call('Page.navigate', { url: URLOPT + '#/profile/' + encodeURIComponent('auto_moto') })
  await page.call('Page.reload', { ignoreCache: true })
  await sleep(1500)
  for (let i = 0; i < 25; i++) {
    const ok = await page.ev(`!!document.querySelector('.switch-rules')`)
    if (ok) break
    await sleep(300)
  }
  const dom = await page.ev(`(() => {
    const qa=(s)=>Array.from(document.querySelectorAll(s))
    const ruleRows = qa('.switch-rule-row').length
    const defSel = document.querySelector('.switch-default-row select')
    const attachedRow = document.querySelector('.switch-attached')
    const matchSel = attachedRow ? attachedRow.querySelector('select') : null
    const textarea = document.querySelector('textarea.monospace')
    const val = (s)=> s ? (s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : '('+s.value+')') : null
    return JSON.stringify({
      ruleRows,
      defaultShown: val(defSel),
      hasAttachedRow: !!attachedRow,
      matchShown: val(matchSel),
      ruleListTextLen: textarea ? textarea.value.length : 0,
      sectionHeadings: qa('.settings-group h3').map(h=>h.textContent.trim()),
    })
  })()`)
  console.log('auto_moto editor DOM:', dom)

  const shot = await page.call('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, 10000).catch(() => null)
  if (shot) { writeFileSync('/tmp/so3-import-switch.jpg', Buffer.from(shot.data, 'base64')); console.log('shot /tmp/so3-import-switch.jpg') }

  // Also screenshot a rules=0 attached profile (auto_v2ray) and the sidebar icons.
  await page.call('Page.navigate', { url: URLOPT + '#/profile/' + encodeURIComponent('auto_v2ray') })
  await sleep(1200)
  const shot2 = await page.call('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, 10000).catch(() => null)
  if (shot2) { writeFileSync('/tmp/so3-import-v2ray.jpg', Buffer.from(shot2.data, 'base64')); console.log('shot /tmp/so3-import-v2ray.jpg') }

  sw.ws.close(); page.ws.close()
} finally { killChrome() }
process.exit(0)
