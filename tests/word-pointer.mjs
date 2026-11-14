// Word pointer on the reading page (Ricky): Dengar moves it with the reciter; while reading, each tap moves it on.
// Needs recite.wav (see phase2-recite.mjs) and the real model.
import { chromium } from 'playwright';
import path from 'path';
import { BASE, driveLessonOnce, assert } from './lib.mjs';
const ctx = await chromium.launchPersistentContext('./chrome-ptr', { channel: 'chrome', viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve('recite.wav')}`], permissions: ['microphone'] });
const page = ctx.pages()[0] || await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/'); await page.waitForSelector('#guest, #farm');
if (await page.$('#guest')) { await page.click('#guest'); await page.waitForSelector('#nm', { timeout: 300000 }); await page.fill('#nm', 'Amtar'); await page.click('#go'); }
await page.waitForSelector('#farm');
await page.evaluate(async () => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/lesson.js')).lesson(114, 0, false); });
// real audio for Dengar here (no INIT stub): wait for the page
for (let i = 0; i < 40; i++) { const t = await page.$eval('#layer .panel h2', e => e.textContent).catch(() => ''); if (t === 'Sekarang baca satu ayat') break; await driveLessonOnce(page); await page.waitForTimeout(150); }
// Dengar: the pointer follows the reciter
await page.click('.practice #hear');
const seen = new Set();
for (let i = 0; i < 40; i++) { const k = await page.evaluate(() => [...document.querySelectorAll('.practice .ayahbig span')].findIndex(s => s.classList.contains('now'))); if (k >= 0) seen.add(k); await page.waitForTimeout(150); }
assert(seen.size >= 3, 'Dengar: the pointer moves word by word with the reciter (' + [...seen].join(',') + ')');
await page.waitForFunction(() => !document.querySelector('.practice #mic').disabled, null, { timeout: 120000 });
await page.click('.practice #mic'); await page.waitForTimeout(300);
const at = () => page.evaluate(() => [...document.querySelectorAll('.practice .ayahbig span')].findIndex(s => s.classList.contains('now')));
const p0 = await at(); await page.click('.practice .ayahbig'); const p1 = await at(); await page.click('.practice .ayahbig span >> nth=0'); const p2 = await at();
assert(p0 === 0 && p1 === 1 && p2 === 2, `reading: starts on word 1, each tap moves on (${p0} → ${p1} → ${p2})`);
await page.screenshot({ path: 'shot-pointer.png' });
await page.waitForFunction(() => /Ketepatan/.test(document.querySelector('.practice .acc').textContent), null, { timeout: 120000 });
assert(await at() === -1, 'after the score the pointer is gone');
assert(errs.length === 0, 'no page errors ' + errs.join('|'));
await ctx.close();
