// Watering = reading the surah aloud (js/siram.js), with the REAL on-device model and Chrome's fake microphone.
// The fake mic plays Alafasy's An-Nas (made here with ffmpeg from audio/a, 10 s of silence at the end).
// Run from the repo root with the game served on BASE (default http://127.0.0.1:8765): node tests/siram-ladder.mjs
// Checks: one village event a day (Ibu first) · level 1 shows the full text, level 3 only first letters, level 4 the first
// word of each ayah + meanings, level 5 no text · a peek reveals one word · "Selesai menyiram" stays off until a reading was
// checked · a passing reading moves the ladder up one level · Siap after level 4 with 2 meaning answers · the plot is watered.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { BASE, INIT, SHORT_SILENCE, assert } from './lib.mjs';

const tmp = fs.mkdtempSync(path.join(process.cwd(), 'chrome-'));
const wav = path.join(tmp, 'annas.wav'), list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, [1, 2, 3, 4, 5, 6].map(n => `file '${path.resolve(`audio/a/11400${n}.mp3`)}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-af', 'adelay=500,apad=pad_dur=10', '-ar', '16000', '-ac', '1', wav]);
const errors = [];
const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
  channel: 'chrome', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'],
  permissions: ['microphone'],
});
const page = ctx.pages()[0] || await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(INIT); await page.addInitScript(SHORT_SILENCE);
try {
  await page.goto(BASE + '/');
  await page.click('#guest');
  await page.waitForSelector('#nm', { timeout: 240000 }); // the model downloads and builds on the start-up screen
  await page.fill('#nm', 'Tes');
  await page.click('button:has-text("Mulai berkebun")');
  await page.waitForSelector('#farm', { timeout: 20000 });
  await page.evaluate(async () => {
    const st = await import('./js/state.js'), dt = await import('./js/data.js'), S = st.S;
    S.solved[114] = true; dt.BY[114].ayat.forEach(a => S.ay[a.a] = true); S.plots[0] = { no: 114, days: 0, watered: false }; st.save();
  });
  const state = () => page.evaluate(async () => { const { S } = await import('./js/state.js'); return { lad: S.ladder && S.ladder[114], siap: S.siap && S.siap[114], watered: S.plots[0] && S.plots[0].watered, coins: S.coins }; });
  const greens = async () => { // click through talk pages / events until the reading page or the end
    for (let i = 0; i < 30; i++) {
      if (await page.$('.celebrate .btn')) { await page.click('.celebrate .btn'); await page.waitForTimeout(250); continue; }
      if (await page.$('.practice')) return 'practice';
      if (await page.$('.siram-goat')) { for (let k = 0; k < 3; k++) { await page.click('.siram-goat', { force: true }).catch(() => {}); await page.waitForTimeout(150); } continue; }
      if (await page.$('#layer .qh .opt')) { await page.click('#layer .qh .opt'); await page.waitForTimeout(200); await page.click('#nx'); continue; }
      if (await page.$('#layer .opts .opt.ar:not(.good):not(.bad)')) { await page.click('#layer .opts .opt'); await page.waitForTimeout(150); await page.click('#nx'); continue; }
      const b = await page.$('#layer .frame .btn.green, #layer .btn.green');
      if (!b) { if (await page.$('#farm') && !(await page.$('#layer .panel, #layer .frame, .celebrate'))) return 'farm'; await page.waitForTimeout(250); continue; }
      await b.click(); await page.waitForTimeout(250);
    }
    return 'stuck';
  };
  const day = async n => { await page.evaluate(async n => { const { S, save } = await import('./js/state.js'); S.day = n; S.plots[0].watered = false; save(); }, n); };
  const masks = () => page.$$eval('.practice .ayahbig span', s => ({ all: s.length, masked: s.filter(x => x.classList.contains('mask')).length, text: s.map(x => x.textContent).join(' ') }));
  const readNow = async () => {
    assert(await page.$eval('#next', b => b.disabled), '"Selesai menyiram" is off before reading');
    await page.click('#mic');
    await page.waitForFunction(() => /Ketepatan|belum bisa/.test(document.querySelector('.practice .acc')?.textContent || '') || /Gagal|Tidak ada suara|Mikrofon/.test(document.querySelector('.practice .fb')?.textContent || ''), null, { timeout: 120000 });
    const acc = await page.$eval('.practice .acc', e => e.textContent);
    console.log('       heard:', (await page.$eval('.practice', e => e.dataset.heard || '')).slice(0, 60), '|', acc);
    await page.click('#next');
    return acc;
  };
  const words = 6 + 0; // An-Nas: 6 ayat
  for (let lvl = 1; lvl <= 5; lvl++) {
    await day(10 + lvl);
    if (lvl === 4) await page.evaluate(async () => { const { S } = await import('./js/state.js'); S.ladder[114].mean = Math.max(2, S.ladder[114].mean); });
    await page.evaluate(async () => { const f = await import('./js/farm.js'); f.water(0); });
    if (lvl === 1) assert(await page.$eval('#layer .frame', e => e.textContent.includes('Ibu')), 'first event of the day: Ibu comes to the garden');
    assert(await greens() === 'practice', `level ${lvl}: the reading page opens`);
    const m = await masks();
    if (lvl <= 2) assert(m.masked === 0, `level ${lvl}: full text (${m.all} words)`);
    if (lvl === 3) { assert(m.masked === m.all && /ـ…|…/.test(m.text), `level 3: only first letters (${m.text.slice(0, 40)})`);
      await page.click('.practice .ayahbig span.mask'); assert((await masks()).masked === m.all - 1, 'level 3: a peek reveals one word'); }
    if (lvl === 4) { assert(m.masked === m.all - words && await page.$('.siram-arti'), `level 4: first word of each ayah + meanings (${m.all - m.masked} shown)`); }
    if (lvl === 5) assert(m.masked === m.all, 'level 5: no text');
    const acc = await readNow();
    assert(/Ketepatan: (\d+)%/.test(acc) && +acc.match(/(\d+)%/)[1] >= 50, `level ${lvl}: Alafasy's reading passes (${acc})`);
    const end = await greens();
    const s = await state();
    assert(s.watered, `level ${lvl}: the plot is watered (${end})`);
    assert(s.lad.lv === Math.min(5, lvl + 1), `ladder now at level ${s.lad.lv}`);
    if (lvl === 4) assert(!!s.siap, 'Siap after passing level 4 with 2 meaning answers');
  }
  assert(!errors.length, 'no page errors ' + errors.join(' | '));
} finally {
  await ctx.close(); fs.rmSync(tmp, { recursive: true, force: true });
}
