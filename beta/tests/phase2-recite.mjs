// Phase 2: the recitation gate with the REAL on-device model (downloads ~140 MB once into the test browser).
// Chrome's fake microphone plays a WAV file (make them with ffmpeg; see docs/PROGRESS.md):
//   recite.wav  = audio/a/114001.mp3 + 2.5 s silence, 16 kHz mono     silence.wav = 10 s of silence
//   wrong.wav   = 114:1 with أعوذ said as "a'uzu" (ذ→ز):  say -v Majed -r 120 -o w.aiff 'قُلْ أَعُوزُ بِرَبِّ النَّاسِ' &&
//                 ffmpeg -i w.aiff -af apad=pad_dur=2.5 -ar 16000 -ac 1 wrong.wav
// Steps: guest → the model starts downloading by itself (no prompt) → An-Nas 1 lesson → the gate shows progress and
// enables the mic when ready → silence → "Tidak ada suara" → a'uzu → word 2 red, fail → Alafasy → pass.
// Then (only with KM_EMAIL, KM_PASS) a test child passes and the recitation row (ms, profile, wrong) is checked.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { BASE, INIT, driveLessonOnce, assert, parentClient, familyFn } from './lib.mjs';

const tmp = fs.mkdtempSync(path.join(process.cwd(), 'chrome-'));
async function ctxWith(wav) {
  return chromium.launchPersistentContext(tmp, {
    channel: 'chrome', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(wav)}`],
    permissions: ['microphone'],
  });
}
async function toGate(page) {
  await page.evaluate(async () => { (await import('./js/lesson.js')).lessonStart(114); });
  for (let i = 0; i < 25; i++) {
    if (await page.$('h2:has-text("Sekarang kamu yang baca")')) return true;
    await driveLessonOnce(page); await page.waitForTimeout(150);
  }
  return false;
}
async function grownUp(page) {
  const q = await page.locator('.celebrate .field span').innerText();
  const m = q.match(/(\d+) × (\d+)/);
  await page.fill('#pp', String(+m[1] * +m[2]));
  await page.click('.celebrate #ok');
}
const errors = [];
const parent = process.env.KM_EMAIL ? await parentClient() : null;
let kidId;
try {
  // ---- silence first (separate fake mic); fresh profile → the model downloads in the background from boot ----
  let ctx = await ctxWith('silence.wav');
  let page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(BASE + '/beta/');
  await page.click('#guest'); await page.fill('#nm', 'Uji'); await page.click('#go');
  await page.waitForFunction(() => import('./js/recite.js').then(m => m.model.status === 'loading' || m.model.status === 'ready'), null, { timeout: 15000 });
  assert(true, 'the model starts downloading by itself once the game opens');
  assert(await toGate(page), 'gate appears after the 4 lesson steps');
  assert(await page.locator('#dl').count() === 0, 'no "grown-up, download" prompt any more');
  const prog = await page.locator('.fb').innerText();
  console.log('  gate while loading:', prog);
  await page.locator('.fb', { hasText: 'Siap!' }).waitFor({ timeout: 600000 });
  console.log(`  model download+load from boot: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  assert(!(await page.locator('#mic').isDisabled()), 'mic enabled once the model is ready');
  await page.click('#mic');
  await page.locator('.fb', { hasText: 'Tidak ada suara yang terdengar' }).waitFor({ timeout: 20000 });
  assert(true, 'silence → "Tidak ada suara yang terdengar"');
  await ctx.close();

  const verdict = async page => {
    await page.click('#mic');
    await page.waitForFunction(() => /MasyaAllah|Hampir|Gagal|Tidak ada/.test(document.querySelector('.fb').textContent), null, { timeout: 120000 });
    return page.locator('.fb').innerText();
  };
  // ---- a letter changed: ذ → ز (same profile → model cached) ----
  ctx = await ctxWith('wrong.wav');
  page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.goto(BASE + '/beta/');
  await page.waitForSelector('#farm');
  assert(await toGate(page), 'gate appears again (model cached)');
  await page.locator('.fb', { hasText: 'Siap!' }).waitFor({ timeout: 60000 });
  let fb = await verdict(page);
  console.log('  a\'uzu verdict:', fb);
  const reds = await page.$$eval('.ayahbig span', els => els.map(e => e.style.textDecoration.includes('wavy')));
  assert(/huruf yang berubah/.test(fb), 'a\'uzu (ذ→ز) fails with "huruf yang berubah"');
  assert(JSON.stringify(reds) === JSON.stringify([false, true, false, false]), 'only أَعُوۡذُ is marked red ' + JSON.stringify(reds));
  await page.screenshot({ path: 'shot-gate-wrong.png' });
  await ctx.close();

  // ---- Alafasy: every word right ----
  ctx = await ctxWith('recite.wav');
  page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.goto(BASE + '/beta/');
  await page.waitForSelector('#farm');
  assert(await toGate(page), 'gate appears');
  await page.locator('.fb', { hasText: 'Siap!' }).waitFor({ timeout: 60000 });
  fb = await verdict(page);
  console.log('  verdict:', fb);
  assert(/MasyaAllah/.test(fb), 'Alafasy recitation of 114:1 passes');
  await page.screenshot({ path: 'shot-gate.png' });
  await page.click('#mic'); // Lanjut
  await page.locator('.celebrate').waitFor({ timeout: 5000 });
  assert(true, 'pass continues to the ayah celebration');
  await page.click('.celebrate button');
  if (!process.env.KM_EMAIL) { console.log('  (no KM_EMAIL: skipping the signed-in child part)'); await ctx.close(); throw 'skip'; }

  // ---- signed-in child: activity row with timing ----
  const { data: fname } = await parent.rpc('my_family_name');
  const tag = Math.random().toString(36).slice(2, 6);
  const r = await familyFn(parent, { action: 'create', display_name: `Uji R ${tag}`, avatar: 1, pin: '5813' });
  kidId = r.body.child_id;
  await page.evaluate(() => { localStorage.removeItem('kebun-makna-mode'); location.hash = ''; });
  await page.goto(BASE + '/beta/?x=1');
  await page.click('#kid');
  if (await page.$('#fc')) { await page.fill('#fc', fname); await page.click('#go'); }
  await page.locator('.kidgrid .av', { hasText: `Uji R ${tag}` }).click();
  for (const d of '5813') await page.click(`.pinpad button[data-n="${d}"]`);
  await page.click('.pinpad button[data-f="ok"]');
  await page.waitForSelector('#dlg', { timeout: 20000 });
  assert(await toGate(page), 'child reaches the gate');
  await page.click('#mic');
  await page.waitForFunction(() => /MasyaAllah|Hampir|Gagal|Tidak ada/.test(document.querySelector('.fb').textContent), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const { data: acts } = await parent.from('activity_log').select('kind, detail').eq('profile_id', kidId).like('kind', 'recitation%');
  console.log('  activity:', JSON.stringify(acts));
  assert(acts && acts.length >= 1 && acts[0].detail.ms > 0 && acts[0].detail.profile === 'q4' && Array.isArray(acts[0].detail.wrong), 'recitation attempt logged with ms, profile and wrong words');
  await ctx.close();
} catch (e) { if (e !== 'skip') { console.log('  FAIL exception', e.message); process.exitCode = 1; } }
finally {
  if (kidId) console.log('  cleanup', (await familyFn(parent, { action: 'delete', child_id: kidId })).status);
  fs.rmSync(tmp, { recursive: true, force: true });
}
assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
