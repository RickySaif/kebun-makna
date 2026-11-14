// Start-up screen + iPhone crash guard for the recitation model (REAL model download, ~1 min the first time).
// 1. fresh device: the prep screen downloads (progress shown) and builds the recognizer BEFORE the game; the first
//    reading page has the mic ready at once · 2. second visit: everything comes from storage, no download
// 3. a crash while building (simulated: the marker is left behind, as when iOS kills the tab) → after the reload the game
//    does NOT build again by itself (no reload loop); "Coba lagi" / "Main tanpa latihan baca" are offered and work
// 4. offline on a fresh device → error + "Coba lagi"; "Main tanpa latihan baca" starts the game.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { BASE, INIT, driveLessonOnce, assert } from './lib.mjs';

const dir = fs.mkdtempSync(path.join(process.cwd(), 'chrome-boot-'));
const errors = [];
const open = async () => {
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  const page = ctx.pages()[0] || await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.addInitScript(INIT);
  return { ctx, page };
};
const hfRequests = page => { const seen = []; page.on('request', r => { if (/huggingface\.co|hf\.co|xethub|\/models\//.test(r.url())) seen.push(r.url()); }); return seen; };
try {
  // ---- 1. fresh device ----
  let { ctx, page } = await open();
  await page.goto(BASE + '/'); await page.click('#guest');
  await page.waitForSelector('.prep', { timeout: 10000 });
  assert(true, 'guest → the prep screen comes first');
  await page.waitForFunction(() => /Mengunduh pengenal bacaan… \d+ \/ \d+ MB/.test(document.querySelector('.prep .st')?.textContent || ''), null, { timeout: 30000 });
  assert(true, 'download progress in MB is shown');
  const t0 = Date.now();
  await page.waitForSelector('#nm', { timeout: 600000 }); // onboarding appears only after the model is ready
  console.log(`  prep screen → game in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  assert(await page.evaluate(async () => (await import('./js/recite.js')).model.status === 'ready'), 'the recognizer is ready before the game starts');
  await page.fill('#nm', 'Uji'); await page.click('#go'); await page.waitForTimeout(500);
  await page.evaluate(async () => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/lesson.js')).lesson(114, 0, false); });
  for (let i = 0; i < 30; i++) { const t = await page.$eval('#layer .panel h2', e => e.textContent).catch(() => ''); if (t === 'Sekarang baca satu ayat') break; await driveLessonOnce(page); await page.waitForTimeout(100); }
  assert(!(await page.locator('.practice #mic').isDisabled()), 'first reading page: mic ready at once (no waiting)');
  await ctx.close();

  // ---- 2. second visit: from storage ----
  ({ ctx, page } = await open());
  const reqs = hfRequests(page);
  await page.goto(BASE + '/'); await page.waitForSelector('#farm', { timeout: 60000 });
  const big = reqs.filter(u => /\.onnx/.test(u));
  assert(big.length === 0, 'second visit downloads no model file ' + big.join(' '));
  assert(await page.evaluate(async () => (await import('./js/recite.js')).model.status === 'ready'), 'ready again on the second visit');
  await ctx.close();

  // ---- 3. simulated crash while building ----
  ({ ctx, page } = await open());
  await page.goto(BASE + '/'); await page.waitForSelector('#farm', { timeout: 60000 });
  await page.evaluate(() => localStorage.setItem('kebun-makna-recite-loading', String(Date.now()))); // as if iOS killed the tab mid-build
  await ctx.close();
  ({ ctx, page } = await open());
  await page.goto(BASE + '/');
  await page.waitForSelector('.prep .act button', { timeout: 30000 });
  const st = await page.locator('.prep .st').innerText();
  console.log('  after the crash:', st);
  assert(/memori HP penuh/.test(st), 'after a crash: explains the memory problem');
  assert(await page.evaluate(async () => (await import('./js/recite.js')).model.status === 'blocked'), 'after a crash: does NOT build again by itself (no reload loop)');
  await page.click('.prep .act button:has-text("Main tanpa latihan baca")');
  await page.waitForSelector('#farm', { timeout: 10000 });
  assert(true, '"Main tanpa latihan baca" starts the game');
  await page.evaluate(async () => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/lesson.js')).lesson(114, 0, false); });
  for (let i = 0; i < 30; i++) { const t = await page.$eval('#layer .panel h2', e => e.textContent).catch(() => ''); if (t === 'Sekarang baca satu ayat') break; await driveLessonOnce(page); await page.waitForTimeout(100); }
  assert(await page.locator('.practice #retry').count() === 1 && /memori HP penuh/.test(await page.locator('.practice .fb').innerText()), 'reading page: memory message + Coba lagi');
  await page.click('.practice #retry');
  await page.waitForFunction(() => !document.querySelector('.practice #mic').disabled, null, { timeout: 120000 });
  assert(await page.evaluate(() => localStorage.getItem('kebun-makna-recite-crash') === null), '"Coba lagi" builds it and clears the crash mark');
  await ctx.close();

  // ---- 4. offline on a fresh device ----
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  ({ ctx, page } = await open());
  await page.route(/huggingface\.co|hf\.co|xethub|\/models\//, r => r.abort());
  await page.goto(BASE + '/'); await page.click('#guest');
  await page.waitForSelector('.prep .act button', { timeout: 60000 });
  assert(/internet/.test(await page.locator('.prep .st').innerText()), 'offline: asks for internet, with Coba lagi');
  await page.click('.prep .act button:has-text("Main tanpa latihan baca")');
  await page.waitForSelector('#nm', { timeout: 10000 });
  assert(true, 'offline: the game can still start');
  await ctx.close();
} catch (e) { console.log('  FAIL exception', e.message); process.exitCode = 1; }
finally { fs.rmSync(dir, { recursive: true, force: true }); }
assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
