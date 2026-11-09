// Phase 2: the recitation gate with the REAL on-device model (downloads ~140 MB once into the test browser).
// Chrome's fake microphone plays a WAV file (make them with ffmpeg; see docs/PROGRESS.md):
//   recite.wav  = audio/a/114001.mp3 + 2.5 s silence, 16 kHz mono     silence.wav = 10 s of silence
// Steps: guest → An-Nas 1 lesson → gate asks for the model → grown-up downloads it → silence → "Tidak ada suara"
// → Alafasy recitation → pass. Then a test child (live backend) passes in the same browser profile and the
// recitation_pass row (with ms + profile) is checked. Env: KM_EMAIL, KM_PASS.
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
const parent = await parentClient();
let kidId;
try {
  // ---- silence first (separate fake mic) ----
  let ctx = await ctxWith('silence.wav');
  let page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.goto(BASE + '/beta/');
  await page.click('#guest'); await page.fill('#nm', 'Uji'); await page.click('#go');
  assert(await toGate(page), 'gate appears after the 4 lesson steps');
  assert(await page.locator('text=Pengenal bacaan belum diunduh').count() === 1, 'gate asks a grown-up to download the model (no silent skip)');
  await page.click('#dl'); await grownUp(page);
  const t0 = Date.now();
  await page.locator('.fb', { hasText: 'Siap!' }).waitFor({ timeout: 600000 });
  console.log(`  model download+load: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.click('#mic');
  await page.locator('.fb', { hasText: 'Tidak ada suara yang terdengar' }).waitFor({ timeout: 20000 });
  assert(true, 'silence → "Tidak ada suara yang terdengar"');
  await ctx.close();

  // ---- recitation (same profile → model cached) ----
  ctx = await ctxWith('recite.wav');
  page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.goto(BASE + '/beta/');
  await page.waitForSelector('#farm');
  assert(await toGate(page), 'gate appears again (model cached)');
  assert(await page.locator('#dl').count() === 0, 'no download prompt when the model is cached');
  await page.click('#mic');
  await page.locator('.fb.good, .fb.bad').filter({ hasNotText: 'Mendengarkan' }).first().waitFor({ timeout: 120000 });
  await page.waitForFunction(() => !/Sebentar|Mendengarkan/.test(document.querySelector('.fb').textContent), null, { timeout: 120000 });
  const fb = await page.locator('.fb').innerText();
  console.log('  verdict:', fb);
  assert(/MasyaAllah/.test(fb), 'Alafasy recitation of 114:1 passes');
  await page.screenshot({ path: 'shot-gate.png' });
  await page.click('#mic'); // Lanjut
  await page.locator('.celebrate').waitFor({ timeout: 5000 });
  assert(true, 'pass continues to the ayah celebration');
  await page.click('.celebrate button');

  // ---- signed-in child: activity row with timing ----
  const { data: fam } = await parent.from('families').select('code').single();
  const tag = Math.random().toString(36).slice(2, 6);
  const r = await familyFn(parent, { action: 'create', display_name: `Uji R ${tag}`, avatar: 1, pin: '5813' });
  kidId = r.body.child_id;
  await page.evaluate(() => { localStorage.removeItem('kebun-makna-mode'); location.hash = ''; });
  await page.goto(BASE + '/beta/?x=1');
  await page.click('#kid');
  if (await page.$('#fc')) { await page.fill('#fc', 'KM-' + fam.code); await page.click('#go'); }
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
  assert(acts && acts.length >= 1 && acts[0].detail.ms > 0 && acts[0].detail.profile === 'q4', 'recitation attempt logged with ms and profile');
  await ctx.close();
} catch (e) { console.log('  FAIL exception', e.message); process.exitCode = 1; }
finally {
  if (kidId) console.log('  cleanup', (await familyFn(parent, { action: 'delete', child_id: kidId })).status);
  fs.rmSync(tmp, { recursive: true, force: true });
}
assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
