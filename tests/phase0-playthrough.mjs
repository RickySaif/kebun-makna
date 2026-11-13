// Phase 0 acceptance: drive a full first-surah (An-Nas) playthrough on the classic game (/classic/) and the new game (/),
// with seeded Math.random and instant audio, and compare the screen trace + final save.
import { chromium } from 'playwright';
import { noModel, startGuest } from './lib.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const only = process.argv[2];

const INIT = () => {
  let seed = 12345; Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  // instant audio: play() resolves and fires 'ended' shortly after
  HTMLMediaElement.prototype.play = function () { setTimeout(() => this.dispatchEvent(new Event('ended')), 30); return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
};

async function run(url, label) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/huggingface|transformers|\/models\//.test(m.location().url || '')) errors.push(m.text()); });
  if (!url.includes('/classic/')) await noModel(page);
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.addInitScript(INIT);
  await page.goto(url);
  if (!url.includes('/classic/')) { await page.waitForSelector('#guest'); await page.evaluate(async () => { const { hooks } = await import('./js/hooks.js'); hooks.afterAyah = null; hooks.afterStep = null; }); await startGuest(page); } // classic flow has no reading practice
  await page.waitForSelector('#nm');
  await page.fill('#nm', 'Amtar');
  await page.click('#go');
  const isBeta = !url.includes('/classic/');
  const G = async expr => page.evaluate(async ([expr, isBeta]) => {
    if (isBeta) {
      const m = Object.assign({}, await import('./js/data.js'), await import('./js/state.js'), await import('./js/farm.js'), await import('./js/render.js'));
      return new Function('m', `with(m){return (${expr})}`)(m);
    }
    return eval(expr);
  }, [expr, isBeta]);
  const trace = [];
  const log = s => { if (trace[trace.length - 1] !== s) trace.push(s); };
  let done = false;
  for (let it = 0; it < 600 && !done; it++) {
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => {
      const vis = el => el && el.offsetParent !== null;
      const cel = document.querySelector('.celebrate');
      if (cel) return { k: 'cel', t: cel.querySelector('.big').textContent };
      const pn = document.querySelector('#layer .panel');
      if (pn) { const h2 = pn.querySelector('h2'); return { k: 'panel', title: (pn.querySelector('.ptitle,h1')||{}).textContent || '', h2: h2 ? h2.textContent : '', html: pn.innerText.slice(0, 80) }; }
      const d = document.querySelector('#dlg');
      if (d) { const bs = [...d.querySelectorAll('button')].map(b => b.textContent); return { k: 'dlg', who: (d.querySelector('.who')||{}).textContent, bs, txt: (d.querySelector('.txt')||{}).textContent }; }
      return { k: 'other', t: document.body.innerText.slice(0, 80) };
    });
    if (st.k === 'cel') { log('CEL ' + st.t.replace(/Amtar/g,'')); await page.click('.celebrate button'); continue; }
    if (st.k === 'panel') {
      log('PANEL ' + st.h2 + ' | ' + st.title);
      const h = st.h2;
      if (h.startsWith('Dengarkan')) { await page.click('#nx:not([disabled])', { timeout: 15000 }); }
      else if (h.startsWith('Kenali')) {
        const n = await page.locator('.card').count();
        for (let i = 0; i < n; i++) await page.locator('.card').nth(i).click();
        await page.click('#nx:not([disabled])');
      } else if (h.startsWith('Cocokkan')) {
        await page.evaluate(() => {
          const L = [...document.querySelectorAll('[data-c=ar] .chip2')], R = [...document.querySelectorAll('[data-c=mn] .chip2')];
          L.forEach(l => { l.click(); R.find(r => r._w === l._w).click(); });
        });
        await page.click('#nx:not([disabled])');
      } else if (h.startsWith('Susun ayatnya')) {
        const title = st.html; // "<Surah> · Ayat N dari M"
        const m = title.match(/^(.*?) · Ayat (\d+) dari/m);
        const words = await G(`DATA.find(s=>s.name===${JSON.stringify(m[1].trim())}).ayat[${+m[2] - 1}].w.map(w=>w.ar)`);
        await page.evaluate(words => {
          for (const w of words) { const t = [...document.querySelectorAll('.pool .tile:not(.used)')].find(t => t.textContent === w); t.click(); }
        }, words);
        await page.click('#nx:not([disabled])'); await page.waitForTimeout(50); await page.click('#nx');
      } else if (h.startsWith('Cerita Surat')) {
        const name = h.replace('Cerita Surat ', '');
        const q = await page.$('.qh .opt');
        if (q) {
          const n = await page.evaluate(() => +document.querySelector('.qh').innerText.match(/Ayat (\d+) yang/)[1]);
          const tr = await G(`DATA.find(s=>s.name===${JSON.stringify(name)}).ayat[${n - 1}].tr`);
          await page.evaluate(tr => { const o = [...document.querySelectorAll('.qh .opt')].find(b => b.textContent === tr); o.click(); }, tr);
          await page.waitForTimeout(1500);
        } else if (await page.$('#nx:not([hidden])')) await page.click('#nx');
      } else if (h.startsWith('Susun urutan')) {
        const name = st.html.match(/Surat Utuh · (.*)/)[1].trim();
        const ars = await G(`DATA.find(s=>s.name===${JSON.stringify(name)}).ayat.map(a=>a.ar)`);
        await page.evaluate(ars => { for (const a of ars) [...document.querySelectorAll('.pool2 .aytile:not(.used) .tx')].find(t => t.textContent === a).click(); }, ars);
        await page.click('#nx:not([disabled])'); await page.waitForTimeout(50); await page.click('#nx');
      } else if (h.startsWith('Jelaskan')) {
        const name = st.html.match(/Surat Utuh · (.*)/)[1].trim();
        const ar = await G(`(()=>{const s=DATA.find(s=>s.name===${JSON.stringify(name)});return s.ayat[EXPLAIN[s.no].ayah-1].ar})()`);
        await page.evaluate(ar => [...document.querySelectorAll('.opt')].find(b => b.querySelector('.ar').textContent === ar).click(), ar);
        await page.click('#nx:not([hidden])');
      } else { log('UNKNOWN PANEL ' + st.html); break; }
      continue;
    }
    if (st.k === 'dlg') {
      if (st.bs.includes('Ke Toko Benih')) { log('DONE dialog: ' + st.who); done = true; break; }
      if (st.bs.length) {
        log('DLG ' + st.who + ' [' + st.bs.join('/') + ']');
        // full text before advancing so the trace is stable
        await page.locator('#dlg button').first().click();
        continue;
      }
      // idle: tap the waiting NPC, if any
      const target = await G(`(()=>{const n=npcHere(); return n?{x:n.x,y:n.y,camX,camY}:null})()`);
      if (target) {
        const box = await page.locator('#farm').boundingBox();
        const px = ((target.x * 16 + 8) - target.camX) / (12 * 16) * box.width + box.x;
        const py = ((target.y * 16 + 8) - target.camY) / (11 * 16) * box.height + box.y;
        log('TAP NPC');
        await page.mouse.click(px, py);
        await page.waitForTimeout(1500);
      }
    }
  }
  const S = await page.evaluate(b => JSON.parse(localStorage.getItem(b ? 'kebun-makna-v3:beta-guest' : 'kebun-makna-v3')), isBeta);
  if (isBeta && await page.evaluate(() => localStorage.getItem('kebun-makna-v3') !== null)) errors.push('beta wrote the classic save key');
  await page.screenshot({ path: `shot-${label}.png` });
  await browser.close();
  for (const k of ['min', 'day', 'pos']) delete S[k];
  return { trace, S, errors, done };
}

const results = {};
for (const [label, url] of [['root', BASE + '/classic/index.html'], ['beta', BASE + '/index.html']]) { // 'root' = the classic game (now /classic/), 'beta' = the new game (now /)
  if (only && only !== label) continue;
  results[label] = await run(url, label);
  console.log(`== ${label}: done=${results[label].done} steps=${results[label].trace.length} errors=${results[label].errors.length}`);
  results[label].errors.forEach(e => console.log('  ERR', e));
}
if (results.root && results.beta) {
  const a = results.root.trace.join('\n'), b = results.beta.trace.join('\n');
  console.log('trace identical:', a === b);
  if (a !== b) { console.log('--- root\n' + a + '\n--- beta\n' + b); }
  const sa = JSON.stringify(results.root.S), sb = JSON.stringify(results.beta.S);
  console.log('save identical:', sa === sb);
  if (sa !== sb) console.log(sa, '\n', sb);
} else console.log(Object.values(results)[0].trace.join('\n'));
