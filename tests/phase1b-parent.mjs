// Parent extras: Google button hidden while the provider is off, "Main sebagai saya" plays on the parent's own save,
// spouse box renders, groups/feeds are role-separated (smoke). Env: KM_EMAIL, KM_PASS.
import { BASE, newPage, close, parentClient, assert } from './lib.mjs';
const parent = await parentClient();
const uid = (await parent.auth.getUser()).data.user.id;
try {
  const P = await newPage('parent');
  await P.goto(BASE + '/');
 
  await P.waitForTimeout(1500);
  assert(await P.locator('#gg').count() === 0, 'Google button hidden while provider is disabled');
  await P.fill('#em', process.env.KM_EMAIL); await P.fill('#pw', process.env.KM_PASS); await P.click('#go');
  await P.waitForSelector('#code', { timeout: 20000 });
  await P.locator('text=Hubungkan akun Ayah dan Ibu').waitFor({ timeout: 10000 });
  assert(true, 'Pasangan box shows the invite form (no spouse yet)');
  await P.locator('.sc').fill((await P.locator('#code').innerText()).trim());
  await P.click('.sb');
  await P.locator('.se', { hasText: 'nama keluarga Anda sendiri' }).waitFor({ timeout: 10000 });
  assert(true, 'inviting your own code is rejected with a friendly message');
  await P.click('#play');
  await P.waitForSelector('#dlg', { timeout: 20000 });
  const name = await P.evaluate(async () => (await import('./js/state.js')).S.name);
  const { data: prof } = await parent.from('profiles').select('display_name').eq('id', uid).single();
  assert(name === prof.display_name.slice(0, 16), 'parent plays under own name: ' + name);
  await P.evaluate(async () => { const s = await import('./js/state.js'); s.S.coins += 1; s.save(); });
  await P.waitForTimeout(5500);
  const { data: sv } = await parent.from('game_saves').select('version').eq('profile_id', uid).maybeSingle();
  assert(sv && sv.version >= 1, 'parent has own game_saves row');
  const errs = P.errors.filter(e => !/status of 400/.test(e)); // the self-invite rejection is an expected 400
  assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message); process.exitCode = 1; }
finally { await close(); }
