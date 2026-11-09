// Phase 4: farm visits. A has a growing plant; B visits A's farm (read-only render), waters once (second time refused),
// sends a salam; A reloads and sees the notification and the watered plant. Env: KM_EMAIL, KM_PASS.
import { BASE, newPage, close, parentClient, familyFn, assert } from './lib.mjs';

const parent = await parentClient();
const { data: fam } = await parent.from('families').select('code').single();
const code = 'KM-' + fam.code, tag = Math.random().toString(36).slice(2, 6);
const kids = [];
async function login(page, k) {
  await page.goto(BASE + '/beta/');
  await page.click('#kid');
  if (await page.$('#fc')) { await page.fill('#fc', code); await page.click('#go'); }
  await page.locator('.kidgrid .av', { hasText: k.name }).click();
  for (const d of k.pin) await page.click(`.pinpad button[data-n="${d}"]`);
  await page.click('.pinpad button[data-f="ok"]');
  await page.waitForSelector('#dlg', { timeout: 20000 });
}
const errs = [];
try {
  for (const [n, pin] of [['A', '7011'], ['B', '7012']]) {
    const r = await familyFn(parent, { action: 'create', display_name: `Uji ${n} ${tag}`, avatar: n === 'A' ? 0 : 1, pin });
    kids.push({ id: r.body.child_id, name: `Uji ${n} ${tag}`, pin });
  }
  const A = await newPage('A'), B = await newPage('B');
  await login(A, kids[0]);
  await A.evaluate(async () => { const s = await import('./js/state.js'); s.S.plots[0] = { no: 114, days: 1, watered: false }; s.S.plots[1] = { no: 114, days: 0, watered: false }; s.save(); });
  await A.waitForTimeout(5500);
  const { data: fp } = await parent.from('farm_public').select('snapshot').eq('profile_id', kids[0].id).single();
  assert(fp.snapshot.plots[0] && fp.snapshot.plots[0].no === 114, 'A\'s public snapshot has the plant');
  await login(B, kids[1]);
  await B.goto(BASE + '/beta/#/kunjungi/' + kids[0].id);
  await B.waitForSelector('#water', { timeout: 20000 });
  await B.waitForTimeout(800);
  const box = await B.locator('#farm').boundingBox();
  await B.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await B.waitForTimeout(800);
  await B.screenshot({ path: 'shot-visit.png' });
  const lit = await B.evaluate(() => { const c = document.getElementById('farm'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 0) n++; return n / (d.length / 4); });
  assert(lit > 0.9, 'farm is rendered on the canvas');
  await B.click('#water');
  await B.locator('#fb', { hasText: 'Kamu menyiram kebun' }).waitFor({ timeout: 10000 });
  assert(true, 'B waters A\'s farm');
  await B.evaluate(() => { document.getElementById('water').disabled = false; });
  await B.click('#water');
  await B.locator('#fb', { hasText: 'sudah menyiram' }).waitFor({ timeout: 10000 });
  assert(true, 'second watering the same day is refused kindly');
  await B.locator('.salam .rx').first().click();
  await B.locator('#fb', { hasText: 'Salam terkirim' }).waitFor({ timeout: 10000 });
  assert(true, 'B sends a salam');
  // A reloads: notification + watered plant
  await A.reload();
  await A.waitForSelector('.celebrate', { timeout: 20000 });
  const t = await A.locator('.celebrate').innerText();
  assert(/menyiram kebunmu/.test(t) && /Assalamu/.test(t), 'A sees "… menyiram kebunmu" and the salam');
  const watered = await A.evaluate(async () => (await import('./js/state.js')).S.plots[0].watered);
  assert(watered === true, 'friend\'s watering counts as today\'s watering for one plant');
  for (const p of [A, B]) errs.push(...p.errors.filter(e => !/status of (409|400|500)/.test(e) && !/group_members|groups\?/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  for (const k of kids) console.log('  cleanup', k.name, (await familyFn(parent, { action: 'delete', child_id: k.id })).status);
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
