// Phase 7: support page (tiers from supporter_tiers, Trakteer link, Cendol note, your #username + copy + editor rules) and
// the admin page gate (non-admin sees a refusal). Env: KM_EMAIL, KM_PASS. Reached through Profil → "Dukung Kebun Makna".
import { BASE, newPage, close, userClient, login, openSupport, assert } from './lib.mjs';
const c = await userClient(1);
const { data: uname } = await c.rpc('my_username');
try {
  assert(/^[a-z][a-z0-9]{2,19}$/.test(uname || ''), 'the account has a valid username: ' + uname);
  const P = await newPage('A');
  await login(P, 1);
  await openSupport(P);
  const t = await P.locator('.dash').innerText();
  assert(/Penanam/.test(t) && /Rp15\.000/.test(t), 'tiers listed with amounts');
  assert(/Cendol/.test(t) && t.includes('#' + uname), 'Cendol note and the #username to paste');
  assert(await P.locator('a[href="https://trakteer.id/nurul_bahirah"]').count() === 1, 'Trakteer button links to the live page');
  assert(await P.locator('a', { hasText: 'Saweria' }).count() === 0, 'Saweria hidden');
  await P.click('text=Ganti nama pengguna');
  await P.fill('.nn', 'ab');
  await P.locator('.st', { hasText: 'Belum sesuai aturan' }).waitFor({ timeout: 5000 });
  assert(true, 'username editor rejects a too-short name');
  assert(await c.rpc('username_available', { name: uname }).then(r => r.data === true), 'own username counts as available to its owner');
  await P.screenshot({ path: 'shot-support.png', fullPage: true });
  await P.goto(BASE + '/#/admin');
  await P.locator('text=hanya untuk admin').waitFor({ timeout: 15000 });
  assert(true, 'admin page refuses non-admins');
  assert(P.errors.length === 0, 'no console errors ' + P.errors.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
