// Phase 7: support page (tiers from supporter_tiers, Trakteer link, Cendol note, the parent's code + copy) and
// admin page gate (non-admin sees a refusal). Env: KM_EMAIL, KM_PASS.
import { BASE, newPage, close, parentClient, assert } from './lib.mjs';
const parent = await parentClient();
const { data: fname } = await parent.rpc('my_family_name');
try {
  const P = await newPage('parent');
  await P.goto(BASE + '/beta/'); await P.click('#ortu');
  await P.fill('#em', process.env.KM_EMAIL); await P.fill('#pw', process.env.KM_PASS); await P.click('#go');
  await P.waitForSelector('#code', { timeout: 20000 });
  await P.click('a[href="#/dukung"]');
  await P.locator('text=Sahabat Kebun Makna').waitFor({ timeout: 15000 });
  const t = await P.locator('.dash').innerText();
  assert(/Penanam/.test(t) && /Rp15\.000/.test(t), 'tiers listed with amounts');
  assert(/Cendol/.test(t) && t.includes('#' + fname), 'Cendol note and the #familyname to paste');
  assert(await P.locator('a[href="https://trakteer.id/nurul_bahirah"]').count() === 1, 'Trakteer button links to the live page');
  assert(await P.locator('a', { hasText: 'Saweria' }).count() === 0, 'Saweria hidden');
  await P.screenshot({ path: 'shot-support.png', fullPage: true });
  await P.goto(BASE + '/beta/#/admin');
  await P.locator('text=hanya untuk admin').waitFor({ timeout: 15000 });
  assert(true, 'admin page refuses non-admins');
  assert(P.errors.length === 0, 'no console errors ' + P.errors.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
