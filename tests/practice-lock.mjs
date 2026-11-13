// Reading page lock (Ricky): while listening only "Selesai" works; while checking every button is off and Pak Ustaz
// thinks; afterwards everything comes back. Needs word.wav (see phase2-recite.mjs) and the real model.
// screenshot the reading page while Pak Ustaz thinks, and check that every button is locked
import { chromium } from 'playwright';
import path from 'path';
import { BASE, INIT, driveLessonOnce, assert, startGuest } from './lib.mjs';
const ctx = await chromium.launchPersistentContext('./chrome-lock', { channel: 'chrome', viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve('word.wav')}`], permissions: ['microphone'] });
const page = ctx.pages()[0] || await ctx.newPage(); await page.addInitScript(INIT);
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/'); await page.waitForSelector('#guest, #farm');
if (await page.$('#guest')) { await page.click('#guest'); await page.waitForSelector('#nm', { timeout: 300000 }); await page.fill('#nm', 'Amtar'); await page.click('#go'); }
await page.waitForSelector('#farm', { timeout: 300000 });
await page.evaluate(async () => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/lesson.js')).lesson(114, 0, false); });
for (let i = 0; i < 30; i++) { const t = await page.$eval('#layer .panel h2', e => e.textContent).catch(() => ''); if (t === 'Ayo baca kata ini') break; await driveLessonOnce(page); await page.waitForTimeout(100); }
await page.click('.practice #next'); // word 2
await page.waitForFunction(() => !document.querySelector('.practice #mic').disabled, null, { timeout: 120000 });
await page.evaluate(() => { const t = document.querySelector('.practice'); new MutationObserver(() => { if (t.classList.contains('thinking') && !window.__think) window.__think = { hear: document.querySelector('#hear').disabled, next: document.querySelector('#next').disabled, back: document.querySelector('.ptop button').disabled, mic: document.querySelector('#mic').disabled }; }).observe(t, { attributes: true, attributeFilter: ['class'] }); });
await page.click('.practice #mic');
await page.waitForTimeout(300);
const listen = await page.evaluate(() => ({ hear: document.querySelector('#hear').disabled, next: document.querySelector('#next').disabled, back: document.querySelector('.ptop button').disabled, mic: document.querySelector('#mic').disabled }));
assert(listen.hear && listen.next && listen.back && !listen.mic, 'listening: only "Selesai" works ' + JSON.stringify(listen));
assert(await page.locator('.ustaz-think:not([hidden])').count() === 1 && /mendengarkan/.test(await page.locator('.ustaz-think .say').innerText()), 'listening: Pak Ustaz is there ("Silakan baca, Ustaz mendengarkan")');
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await page.waitForSelector('.practice.thinking', { timeout: 90000 });
const think = await page.evaluate(() => window.__think);
assert(think.hear && think.next && think.back && think.mic, 'checking: every button off, Pak Ustaz shown ' + JSON.stringify(think));
await page.waitForTimeout(400); await page.screenshot({ path: 'shot-think.png' }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.waitForFunction(() => /Ketepatan/.test(document.querySelector('.practice .acc').textContent), null, { timeout: 60000 });
const after = await page.evaluate(() => ({ hidden: document.querySelector('.ustaz-think').hidden, hear: document.querySelector('#hear').disabled, next: document.querySelector('#next').disabled, back: document.querySelector('.ptop button').disabled }));
assert(after.hidden && !after.hear && !after.next && !after.back, 'after the score: Pak Ustaz hides, buttons back ' + JSON.stringify(after));
assert(errs.length === 0, 'no page errors ' + errs.join('|'));
await ctx.close();
