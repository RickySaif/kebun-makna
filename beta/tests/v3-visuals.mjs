// v3 visual pass: the avatar builder packs a look into S.avatar, the "tanpa mata" choice sticks and removes only
// the eyes, and the farm draw stays cheap under a 4× CPU throttle. No backend needed. Serve the repo root first.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => { HTMLMediaElement.prototype.play = function () { setTimeout(() => this.dispatchEvent(new Event('ended')), 30); return Promise.resolve(); }; });
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
await page.goto(BASE + '/beta/'); await page.waitForSelector('#guest');
await page.locator('.eyesframe input').check();
ok(await page.evaluate(() => localStorage.getItem('kebun-makna-noeyes')) === '1', 'start screen: tanpa mata is remembered on the device');
// eyes are the only pixels that change: mouth row stays, eye pixels become skin
const px = await page.evaluate(async () => { const A = await import('./js/art.js'); const L = A.lookOf(0);
  const read = () => { const s = A.charSprite(L, 0, 0), d = s.cv.getContext('2d').getImageData(0, 0, s.w, s.h).data, at = (x, y) => Array.from(d.slice((y * s.w + x) * 4, (y * s.w + x) * 4 + 3)).join(','); return { eye: at(9, 14), mouth: at(12, 17) }; };
  const off = read(); A.setEyesOff(false, false); const on = read(); A.setEyesOff(true, false); return { off, on }; });
ok(px.on.eye !== px.off.eye && px.on.mouth === px.off.mouth, `tanpa mata removes the eyes and keeps the mouth (${JSON.stringify(px)})`);
await page.click('#guest'); await page.waitForSelector('#nm'); await page.fill('#nm', 'Uji');
await page.click('.seg[data-k=girl] button[data-v="1"]'); await page.click('.sws[data-k=col] button[data-v="2"]'); await page.click('#go');
await page.waitForSelector('#farm'); await page.waitForTimeout(800);
const S = await page.evaluate(() => JSON.parse(localStorage.getItem('kebun-makna-v3:beta-guest')));
ok(S.avatar === (16384 | 1 | 1 << 1 | 2 << 5 | 0), `builder: girl + third jilbab colour packs into avatar (${S.avatar})`);
ok(S.noEyes === true, 'the eyes choice rides along in the save');
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const ms = await page.evaluate(async () => { const f = await import('./js/farm.js'); const t0 = performance.now(); for (let i = 0; i < 200; i++) f.draw(performance.now()); return (performance.now() - t0) / 200; });
ok(ms < 4, `farm draw at 4× CPU throttle: ${ms.toFixed(2)} ms per frame`);
ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
