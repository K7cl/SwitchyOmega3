// Verify temp-rule persistence: after addTempRule, the temp profile is written
// to chrome.storage.session (surviving an MV3 service-worker restart) but NOT to
// the persistent .local area (so it still clears on browser restart, matching the
// original's temporary-rule lifetime).
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const BACKUP = '/root/proj/SwitchyOmega3/OmegaOptions (5).bak'
const PORT = 9562
const udd = mkdtempSync(join(tmpdir(), 'so3-temp-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gj = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json()
const backupJson = readFileSync(BACKUP, 'utf8')

const chrome = spawn(CHROME, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] })
const killChrome = () => { try { chrome.kill('SIGKILL') } catch { /**/ } }
process.on('exit', killChrome)

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
  let swUrl
  for (let i = 0; i < 40; i++) {
    const s = (await gj('/json')).find((t) => t.url.includes('/service-worker-loader.js'))
    if (s) { swUrl = s.webSocketDebuggerUrl; break }
    await sleep(300)
  }
  const sw = await attach(swUrl)
  console.log('reset:', await sw.ev(`globalThis.omega.options.reset(${backupJson}).then(()=>'ok').catch(e=>'ERR '+e.message)`, 30000))

  const out = await sw.ev(`(async () => {
    const o = globalThis.omega.options
    await o.applyProfile('auto_moto')
    await o.addTempRule('nonexistent-switchy-test.com', 'v2ray')
    const inMem = o.queryTempRule('nonexistent-switchy-test.com')
    const local = await chrome.storage.local.get(null)
    const session = await chrome.storage.session.get(null)
    const hasTemp = (obj) => JSON.stringify(obj).includes('nonexistent-switchy-test') || JSON.stringify(obj).includes('isTempRule') || JSON.stringify(obj).includes('tempProfile')
    const sess = session['omega.state.tempProfile']
    return JSON.stringify({
      inMemory_queryTempRule: inMem,
      localKeys: Object.keys(local),
      sessionKeys: Object.keys(session),
      tempRuleInLocal: hasTemp(local),
      tempRuleInSession: hasTemp(session),
      sessionTempProfilePresent: sess != null,
      sessionTempProfileHasRule: !!(sess && Array.isArray(sess.rules) && sess.rules.some((r) => r.profileName === 'v2ray')),
      currentProfileNameInState: local['omega.state.currentProfileName'],
    }, null, 2)
  })()`, 30000)
  console.log('PROBE:', out)
  const parsed = JSON.parse(out)
  const ok =
    parsed.inMemory_queryTempRule === 'v2ray' &&
    parsed.tempRuleInLocal === false &&
    parsed.tempRuleInSession === true &&
    parsed.sessionTempProfilePresent === true &&
    parsed.sessionTempProfileHasRule === true
  console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL')
  if (!ok) process.exitCode = 1
  sw.ws.close()
} finally { killChrome() }
process.exit(0)
