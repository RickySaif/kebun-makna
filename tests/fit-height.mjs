// Fit-to-height check: every gameplay screen must fit the visible height of a phone with NO vertical scroll.
// Heights are Safari's visible area with its bars: iPhone 13 (390×664) and iPhone SE (375×548).
// Long lists (Buku Kata, parent dashboard, Beranda) are allowed to scroll inside their own list box only.
// Run: serve the repo root on :8765, then  node fit-height.mjs   (prints one line per screen; FAIL when it overflows)
import { chromium } from 'playwright';
import { BASE, INIT, driveLessonOnce, assert } from './lib.mjs';

const SIZES = [{ name: 'iPhone 13', width: 390, height: 664 }, { name: 'iPhone SE', width: 375, height: 548 }];
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];

// how many px the page or the open panel would scroll (0 = fits). Inner list boxes (.scrollbox) are excluded on purpose.
const overflow = page => page.evaluate(() => {
  const doc = document.scrollingElement, page = Math.max(0, doc.scrollHeight - window.innerHeight);
  const panel = [...document.querySelectorAll('.panel')].pop();
  const p = panel ? Math.max(0, panel.scrollHeight - panel.clientHeight) : 0;
  const cel = document.querySelector('.celebrate');
  const c = cel ? Math.max(0, cel.scrollHeight - cel.clientHeight) : 0;
  const z = panel ? (panel.querySelector('.wrap').style.zoom || '1') : (document.querySelector('.celebrate .frame')?.style.zoom || document.getElementById('root').style.zoom || '1');
  return { o: Math.max(page, p, c), z, scrolly: !!document.querySelector('.panel.scrolly,.celebrate.scrolly') };
});
const title = page => page.$eval('#layer .panel h2', e => e.textContent).catch(() => '');

for (const sz of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.route(/huggingface\.co|@huggingface\/transformers|\/models\//, r => r.abort()); // keep the 140 MB model out of this test
  const rows = [];
  const check = async label => { await page.waitForTimeout(250); const r = await overflow(page); rows.push([label, r]); };

  await page.goto(BASE + '/');
  await page.waitForSelector('#guest'); await check('start screen');
  await page.click('#guest');
  await page.waitForSelector('.prep .act button', { timeout: 30000 }); await check('model prep screen (offline: buttons shown)');
  await page.click('.prep .act button:has-text("Main tanpa latihan baca")');
  await page.waitForSelector('#nm'); await page.waitForTimeout(300); await check('onboarding (name)');
  await page.fill('#nm', 'Amtar'); await page.click('#go'); await page.waitForTimeout(600); await check('first farm / intro');
  // give the player a finished game so every screen has its fullest content
  await page.evaluate(async () => {
    const st = await import('./js/state.js'); const { DATA } = await import('./js/data.js');
    DATA.forEach(s => s.ayat.forEach(a => { st.S.ay[a.a] = true; a.w.forEach(w => st.bump(w.a, 3)); }));
    st.S.coins = 999; st.save();
    document.querySelectorAll('.celebrate,.dialog').forEach(x => x.remove());
    (await import('./js/farm.js')).farm();
  });
  await check('farm');
  for (const [label, fn] of [['shop', 'shop'], ['house', 'house'], ['well (murajaah)', 'well']]) {
    await page.evaluate(async f => { (await import('./js/farm.js'))[f](); }, fn); await check(label);
  }
  // longest ayat: 105:1 (7 words) and 110:3 (7 words)
  for (const [no, j] of [[105, 0], [110, 2], [114, 0]]) {
    await page.evaluate(async ([no, j]) => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/lesson.js')).lesson(no, j, false); }, [no, j]);
    const seen = new Set();
    for (let i = 0; i < 60 && !(await page.$('.celebrate')); i++) {
      const t = await title(page), k = t + ' ' + (await page.locator('.practice .small').first().innerText({ timeout: 200 }).catch(() => ''));
      if (t && !seen.has(t)) { seen.add(t); await check(`${no}:${j + 1} ${t}`); }
      if (/^Kenali/.test(t) && !seen.has('kenali-open')) { // all cards open = fullest
        seen.add('kenali-open'); const n = await page.locator('.card').count(); for (let c = 0; c < n; c++) await page.locator('.card').nth(c).click();
        await check(`${no}:${j + 1} Kenali (all cards open)`); await page.click('#nx:not([disabled])'); continue;
      }
      if (/^(Ayo baca|Sekarang baca)/.test(t)) { await page.click('.practice #next'); await page.waitForTimeout(80); continue; }
      await driveLessonOnce(page); await page.waitForTimeout(100);
    }
    await check(`${no}:${j + 1} celebration`);
  }
  await page.evaluate(async () => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/lesson.js')).suratUtuh(105, false); });
  await check('Surat Utuh 105 (first page)');
  for (const b of ['chase', 'race', 'cartGame', 'pestGame']) {
    await page.evaluate(async b => { document.querySelectorAll('.celebrate').forEach(x => x.remove()); (await import('./js/bosses.js'))[b](); }, b);
    await page.waitForTimeout(400); await check('boss ' + b);
  }
  console.log(`== ${sz.name} ${sz.width}×${sz.height}`);
  for (const [l, r] of rows) {
    const list = /^(shop|house|well)/.test(l);
    if (r.scrolly) assert(list, `${l}: list scrolls inside its panel${list ? '' : ' (NOT a list!)'}`);
    else assert(r.o <= 1, `${l}${r.o > 1 ? ` scrolls ${r.o}px` : ''} · zoom ${r.z}`);
  }
  await ctx.close();
}
await browser.close();
assert(errors.length === 0, 'no page errors ' + errors.join(' | '));
