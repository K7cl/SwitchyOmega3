// Reproduce the modal layering bug: open the options page, trigger the
// New-profile modal and the proxy-auth modal, screenshot, and report the
// computed stacking (what element is actually on top at the modal center).
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/opt/cft/chrome'
const DIST = new URL('../extension/dist', import.meta.url).pathname
const PORT = 9560
const EXT = 'pjdeibnmolfgdfajlclaahhmhmlojgko'
const URLOPT = `chrome-extension://${EXT}/src/entries/options/index.html`
const udd = mkdtempSync(join(tmpdir(), 'so3-modal-'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gj = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json()

const chrome = spawn(CHROME, [`--user-data-dir=${udd}`, `--remote-debugging-port=${PORT}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] })
const killChrome = () => { try { chrome.kill('SIGKILL') } catch { /**/ } }
process.on('exit', killChrome)
process.on('SIGTERM', () => { killChrome(); process.exit(143) })

let id = 0, ws, call
const mkcall = (sock) => (method, params = {}, t = 8000) => new Promise((res, rej) => {
  const mid = ++id
  const to = setTimeout(() => rej(new Error('timeout ' + method)), t)
  const h = (ev) => { const m = JSON.parse(ev.data); if (m.id === mid) { clearTimeout(to); sock.removeEventListener('message', h); if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result) } }
  sock.addEventListener('message', h)
  sock.send(JSON.stringify({ id: mid, method, params }))
})
const ev = async (e) => { const r = await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? '__ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result?.value }

try {
  for (let i = 0; i < 50; i++) { try { await gj('/json/version'); break } catch { await sleep(200) } }
  await sleep(4000)
  let hydrated = false
  for (let attempt = 0; attempt < 10 && !hydrated; attempt++) {
    const tab = await gj(`/json/new?${encodeURIComponent(URLOPT)}`, 'PUT')
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    call = mkcall(ws)
    await call('Page.enable'); await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 16; i++) {
      const v = await ev(`location.href.startsWith('chrome-error')?'B':(!!document.querySelector('.side-nav .nav-pills')&&!document.querySelector('.om-loading'))`)
      if (v === true) { hydrated = true; break }
      if (v === 'B') break
      await sleep(300)
    }
    if (!hydrated) { ws.close(); await gj(`/json/close/${tab.id}`).catch(() => {}); await sleep(700) }
  }
  if (!hydrated) throw new Error('not hydrated')

  // Trigger the New-profile modal via the sidebar link.
  await ev(`(() => { const a=[...document.querySelectorAll('.side-nav a')].find(x=>/new profile/i.test(x.textContent)); if(a) a.click() })()`)
  await sleep(600)
  const info = await ev(`(() => {
    const modal=document.querySelector('.modal')
    const backdrop=document.querySelector('.modal-backdrop')
    const cs=(el)=>el?getComputedStyle(el):null
    const rect=modal?modal.getBoundingClientRect():null
    // What is painted on top at the modal's visual center?
    let topEl=null
    if(rect){ const el=document.elementFromPoint(rect.left+rect.width/2, Math.min(rect.top+80, innerHeight-10)); topEl = el ? (el.tagName+'.'+([...el.classList].join('.'))) : null }
    const anc=[]
    let n = modal
    while(n && n!==document.body){ const s=getComputedStyle(n); if(s.transform!=='none'||s.filter!=='none'||s.perspective!=='none'||s.willChange!=='auto') anc.push(n.tagName+'.'+[...n.classList].join('.')+' {transform:'+s.transform+',filter:'+s.filter+'}'); n=n.parentElement }
    return JSON.stringify({
      hasModal:!!modal, hasBackdrop:!!backdrop,
      modalPos: cs(modal)?.position, modalZ: cs(modal)?.zIndex, modalDisplay: cs(modal)?.display,
      backdropPos: cs(backdrop)?.position, backdropZ: cs(backdrop)?.zIndex,
      appZ: cs(document.getElementById('app'))?.zIndex,
      topElementAtModalCenter: topEl,
      transformedAncestors: anc,
    }, null, 1)
  })()`)
  console.log('NEW-PROFILE MODAL:', info)
  const s1 = await call('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, 8000).catch(() => null)
  if (s1) { writeFileSync('/tmp/so3-modal-new.jpg', Buffer.from(s1.data, 'base64')); console.log('shot /tmp/so3-modal-new.jpg') }

  // Close it, go to the default proxy (Fixed) profile, open the auth modal.
  await ev(`(() => { const b=[...document.querySelectorAll('.modal-footer button, .modal .close')].find(x=>/cancel|close|×/i.test(x.textContent)); if(b) b.click() })()`)
  await sleep(300)
  await call('Page.navigate', { url: URLOPT + '#/profile/proxy' })
  await sleep(1000)
  await ev(`(() => { const b=document.querySelector('.proxy-auth-toggle, .glyphicon-lock'); if(b){ (b.closest('button')||b).click() } })()`)
  await sleep(600)
  const info2 = await ev(`(() => {
    const bd=document.querySelector('.omega-modal-backdrop')
    const dlg=bd?bd.querySelector('.modal-dialog'):null
    const cs=(el)=>el?getComputedStyle(el):null
    const rect=dlg?dlg.getBoundingClientRect():null
    let topEl=null
    if(rect){ const el=document.elementFromPoint(rect.left+rect.width/2, rect.top+40); topEl = el ? (el.tagName+'.'+[...el.classList].join('.')) : null }
    return JSON.stringify({ hasBackdrop:!!bd, backdropPos: cs(bd)?.position, backdropZ: cs(bd)?.zIndex, dialogRectTop: rect?Math.round(rect.top):null, topElementAtDialog: topEl })
  })()`)
  console.log('AUTH MODAL:', info2)
  const s2 = await call('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, 8000).catch(() => null)
  if (s2) { writeFileSync('/tmp/so3-modal-auth.jpg', Buffer.from(s2.data, 'base64')); console.log('shot /tmp/so3-modal-auth.jpg') }

  ws.close()
} finally { killChrome() }
process.exit(0)
