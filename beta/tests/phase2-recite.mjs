// Reading practice with the REAL on-device model (downloads ~140 MB once into the test browser).
// Chrome's fake microphone plays a WAV file. Make them in the test folder:
//   recite.wav  = ffmpeg -i audio/a/114001.mp3 -af apad=pad_dur=2.5 -ar 16000 -ac 1 recite.wav
//   word.wav    = ffmpeg -i beta/audio/w/114001002.mp3 -af adelay=300,apad=pad_dur=2.5 -ar 16000 -ac 1 word.wav
//   silence.wav = ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 10 silence.wav
//   wrong.wav   = 114:1 with أعوذ said "a'uzu" (ذ→ز): say -v Majed -r 120 -o w.aiff 'قُلْ أَعُوزُ بِرَبِّ النَّاسِ' &&
//                 ffmpeg -i w.aiff -af apad=pad_dur=2.5 -ar 16000 -ac 1 wrong.wav
// Checks: the model is downloaded and built on the start-up screen · after Kenali one page per word, after Cocokkan the parts, after
// Susun the whole ayah · "Lanjut" always works (never a requirement) · silence → "Tidak ada suara" · Alafasy's word
// → 100% · a'uzu → below 100% with only أعوذ red · Alafasy's ayah → 100%. With KM_EMAIL/KM_PASS a signed-in child's
// recitation_try row (part, score, ms, wrong) is checked too.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { BASE, INIT, driveLessonOnce, assert, parentClient, familyFn } from './lib.mjs';

const tmp = fs.mkdtempSync(path.join(process.cwd(), 'chrome-'));
const errors = [];
async function open(wav) {
  const ctx = await chromium.launchPersistentContext(tmp, {
    channel: 'chrome', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(wav)}`],
    permissions: ['microphone'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  return { ctx, page };
}
const h2 = page => page.$eval('#layer .panel h2', e => e.textContent).catch(() => '');
const sub = page => page.locator('.practice .small').first().innerText({ timeout: 300 }).catch(() => '');
const isPractice = t => /^(Ayo baca|Sekarang baca)/.test(t);
/** Drive the lesson until the panel title matches re (practice pages are skipped with "Lanjut" on the way). */
async function until(page, re) {
  for (let i = 0; i < 80; i++) {
    const t = await h2(page); if (re.test(t)) return t;
    if (isPractice(t)) await page.click('.practice #next'); else await driveLessonOnce(page);
    await page.waitForTimeout(120);
  }
  return null;
}
const start = page => page.evaluate(async () => { (await import('./js/lesson.js')).lesson(114, 0, false); }); // always An-Nas 1 (lessonStart would move on to ayah 2)
const ready = page => page.waitForFunction(() => !document.querySelector('.practice #mic').disabled, null, { timeout: 600000 });
async function read(page) {
  await page.click('.practice #mic');
  await page.waitForFunction(() => /Ketepatan|Tidak ada suara|Gagal/.test(document.querySelector('.practice').innerText), null, { timeout: 120000 });
  return { acc: await page.locator('.practice .acc').innerText(), fb: await page.locator('.practice .fb').innerText(),
    red: await page.$$eval('.practice .ayahbig span', els => els.map(e => e.style.textDecoration.includes('wavy'))) };
}

const parent = process.env.KM_EMAIL ? await parentClient() : null;
let kidId;
try {
  // ---- 1. fresh profile: page order, never blocking, silence ----
  let { ctx, page } = await open('silence.wav');
  const t0 = Date.now();
  await page.goto(BASE + '/beta/');
  await page.click('#guest');
  await page.waitForSelector('.prep', { timeout: 15000 });
  assert(true, 'the model is prepared on a start-up screen before the game');
  await page.waitForSelector('#nm', { timeout: 600000 });
  console.log(`  model download+build before the game: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.fill('#nm', 'Uji'); await page.click('#go');
  await start(page);
  const seen = []; let silenceDone = false;
  for (let i = 0; i < 80 && !(await page.$('.celebrate')); i++) {
    const t = await h2(page), key = t + (isPractice(t) ? ' ' + await sub(page) : '');
    if (t && seen[seen.length - 1] !== key) seen.push(key);
    if (t === 'Ayo baca kata ini' && !silenceDone) {
      silenceDone = true;
      assert(!(await page.locator('.practice #mic').isDisabled()), 'first word page: mic ready at once');
      const r = await read(page);
      assert(/Tidak ada suara/.test(r.fb), 'silence → "Tidak ada suara yang terdengar"');
    }
    if (isPractice(t)) await page.click('.practice #next'); else await driveLessonOnce(page);
    await page.waitForTimeout(120);
  }
  console.log('  pages:', seen.join(' → '));
  const code = s => s.startsWith('Dengarkan') ? 'D' : s.startsWith('Kenali') ? 'K' : s.startsWith('Cocokkan') ? 'C' : s.startsWith('Susun') ? 'S'
    : s.startsWith('Ayo baca kata') ? 'w' : s.startsWith('Ayo baca bagian') ? 'p' : s.startsWith('Sekarang baca') ? 'A' : '?';
  const order = seen.map(code).join('');
  assert(order === 'DKwwwwCppSA', 'order: Dengar, Kenali, 4 words, Cocokkan, 2 parts, Susun, whole ayah (' + order + ')');
  assert(await page.$('.celebrate'), 'skipping every reading still finishes the ayah (never a requirement)');
  await ctx.close();

  // ---- 2. one word: Alafasy's أَعُوۡذُ on its word page → 100% ----
  ({ ctx, page } = await open('word.wav'));
  await page.goto(BASE + '/beta/'); await page.waitForSelector('#farm');
  await start(page);
  assert(await until(page, /^Ayo baca kata ini$/), 'word page appears');
  await page.click('.practice #next'); // word 2
  assert((await page.locator('.practice .ayahbig').innerText()).trim() === 'اَعُوۡذُ', 'second word page shows اَعُوۡذُ');
  await ready(page);
  let r = await read(page);
  console.log('  word:', r.acc, '|', r.fb);
  assert(r.acc === 'Ketepatan: 100%', 'Alafasy\'s اَعُوۡذُ scores 100%');
  await page.screenshot({ path: 'shot-practice-word.png' });
  await ctx.close();

  // ---- 3. whole ayah with ذ→ز: red word, a score, still free to continue ----
  ({ ctx, page } = await open('wrong.wav'));
  await page.goto(BASE + '/beta/'); await page.waitForSelector('#farm');
  await start(page);
  assert(await until(page, /^Sekarang baca satu ayat$/), 'whole-ayah page appears after Susun');
  await ready(page);
  r = await read(page);
  console.log('  a\'uzu:', r.acc, '|', r.fb, JSON.stringify(r.red));
  assert(/Ketepatan: [5-9]\d%/.test(r.acc), 'a\'uzu scores below 100% but most letters right');
  assert(JSON.stringify(r.red) === '[false,true,false,false]', 'only اَعُوۡذُ is marked red');
  await page.screenshot({ path: 'shot-practice-wrong.png' });
  await page.click('.practice #next');
  await page.locator('.celebrate').waitFor({ timeout: 5000 });
  assert(true, '"Lanjut" after a wrong reading still continues');
  await ctx.close();

  // ---- 4. whole ayah, Alafasy → 100% ----
  ({ ctx, page } = await open('recite.wav'));
  await page.goto(BASE + '/beta/'); await page.waitForSelector('#farm');
  await start(page);
  assert(await until(page, /^Sekarang baca satu ayat$/), 'whole-ayah page appears');
  await ready(page);
  r = await read(page);
  console.log('  ayah:', r.acc, '|', r.fb);
  assert(r.acc === 'Ketepatan: 100%', 'Alafasy\'s 114:1 scores 100%');
  await page.screenshot({ path: 'shot-practice-ayah.png' });

  // ---- 5. signed-in child: the try is logged ----
  if (parent) {
    const { data: fname } = await parent.rpc('my_family_name');
    const tag = Math.random().toString(36).slice(2, 6);
    const c = await familyFn(parent, { action: 'create', display_name: `Uji R ${tag}`, avatar: 1, pin: '5813' });
    kidId = c.body.child_id;
    await page.evaluate(() => { localStorage.removeItem('kebun-makna-mode'); location.hash = ''; });
    await page.goto(BASE + '/beta/?x=1');
    await page.click('#kid');
    if (await page.$('#fc')) { await page.fill('#fc', fname); await page.click('#go'); }
    await page.locator('.kidgrid .av', { hasText: `Uji R ${tag}` }).click();
    for (const d of '5813') await page.click(`.pinpad button[data-n="${d}"]`);
    await page.click('.pinpad button[data-f="ok"]');
    await page.waitForSelector('#dlg', { timeout: 20000 });
    await start(page);
    assert(await until(page, /^Sekarang baca satu ayat$/), 'child reaches the whole-ayah page');
    await ready(page); await read(page); await page.waitForTimeout(1500);
    const { data: acts } = await parent.from('activity_log').select('kind, detail').eq('profile_id', kidId).eq('kind', 'recitation_try');
    console.log('  activity:', JSON.stringify(acts));
    assert(acts && acts.length >= 1 && acts[0].detail.part === 'ayat' && acts[0].detail.ms > 0 && Array.isArray(acts[0].detail.wrong), 'recitation_try logged with part, ms and wrong words');
  } else console.log('  (no KM_EMAIL: skipping the signed-in child part)');
  await ctx.close();
} catch (e) { console.log('  FAIL exception', e.message); process.exitCode = 1; }
finally {
  if (kidId) console.log('  cleanup', (await familyFn(parent, { action: 'delete', child_id: kidId })).status);
  fs.rmSync(tmp, { recursive: true, force: true });
}
assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
