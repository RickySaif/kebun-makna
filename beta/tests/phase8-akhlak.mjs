// Phase 8: akhlak chapter. Locked before the original game is finished; after all 10 surahs + boss4 the 📗 button
// appears with a note; story 1 plays through (pick the right hadith, verbatim source card, reward); story 2 opens,
// story 3 stays locked. Also checks every content file's source_rows match the live `sources` table exactly.
import fs from 'fs';
import { BASE, newPage, close, client, assert } from './lib.mjs';

const errs = [];
try {
  // ---- content integrity against the live library ----
  const dir = process.env.CONTENT || '../../content/akhlak';
  const idx = JSON.parse(fs.readFileSync(`${dir}/index.json`, 'utf8'));
  const c = client();
  for (const id of idx.stories) {
    const s = JSON.parse(fs.readFileSync(`${dir}/${id}.json`, 'utf8'));
    const { data } = await c.from('sources').select('id, ref_label, arabic, indonesian, attribution').in('id', s.sources);
    const same = s.source_rows.length === s.sources.length && s.source_rows.every(r => { const d = data.find(x => x.id === r.id); return d && d.arabic === r.arabic && d.indonesian === r.indonesian && d.ref_label === r.ref_label && d.attribution === r.attribution; });
    assert(same, `${id}: source_rows identical to sources (${s.sources.join(', ')})`);
  }
  // ---- locked on a fresh game ----
  const P = await newPage('guest');
  await P.goto(BASE + '/beta/');
  await P.click('#guest'); await P.fill('#nm', 'Uji'); await P.click('#go');
  await P.waitForSelector('#farm'); await P.waitForTimeout(1500);
  assert(await P.locator('#akh').count() === 0, 'no 📗 before the original game is finished');
  // ---- finished game ----
  await P.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('kebun-makna-v3:beta-guest'));
    [114, 113, 112, 111, 110, 109, 108, 107, 106, 105].forEach(n => st.solved[n] = true);
    st.trophies = { boss1: true, boss2: true, boss3: true, boss4: true };
    localStorage.setItem('kebun-makna-v3:beta-guest', JSON.stringify(st));
  });
  await P.reload();
  await P.waitForSelector('#akh', { timeout: 15000 });
  assert(true, '📗 appears after 10 surahs + boss4');
  if (await P.$('.celebrate')) { assert(/Akhlak Seorang Muslim/.test(await P.locator('.celebrate').innerText()), 'chapter note shown'); await P.click('.celebrate button'); }
  while (await P.$('.celebrate')) { await P.click('.celebrate button'); await P.waitForTimeout(200); }
  await P.click('#akh');
  await P.waitForSelector('#layer .panel .opt');
  assert(await P.locator('#layer .opt[disabled]').count() === 7, 'only the first story is open');
  await P.locator('#layer .opt').first().click();
  for (let i = 0; i < 5 && !(await P.$('h2:has-text("Buka kitab")')); i++) { await P.locator('#layer .frame button.green').click(); await P.waitForTimeout(150); }
  const coins0 = await P.evaluate(async () => (await import('./js/state.js')).S.coins);
  // wrong answer first, then the right one
  const opts = P.locator('#layer .opts .opt');
  for (let i = 0; i < await opts.count(); i++) if (!/Muslim no\. 4719/.test(await opts.nth(i).innerText())) { await opts.nth(i).click(); break; }
  await P.locator('.fb.bad').waitFor();
  await P.locator('#layer .opts .opt', { hasText: 'HR. Muslim no. 4719' }).click();
  await P.locator('#layer .srccard').waitFor({ timeout: 5000 });
  const card = await P.locator('#layer .srccard').innerText();
  assert(/Sesungguhnya kejujuran itu akan membimbing pada kebaikan/.test(card) && /Lidwa/.test(card), 'verbatim hadith card with attribution');
  await P.screenshot({ path: 'shot-akhlak.png' });
  await P.locator('#layer .frame button.green').click();
  for (let i = 0; i < 5 && !(await P.$('.celebrate')); i++) { await P.locator('#layer .frame button.green').click(); await P.waitForTimeout(150); }
  await P.waitForSelector('.celebrate');
  const st = await P.evaluate(async () => { const s = (await import('./js/state.js')).S; return { a: s.akhlak, coins: s.coins }; });
  assert(st.a.jujur === true && st.coins === coins0 + 15, 'story done, +15 coins');
  await P.click('.celebrate button');
  await P.waitForSelector('#layer .panel .opt');
  assert(await P.locator('#layer .opt[disabled]').count() === 6, 'story 2 opens, the rest stay locked');
  errs.push(...P.errors);
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally { await close(); }
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
