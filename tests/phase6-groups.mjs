// Phase 6: groups. Account A creates a group in the UI, account B joins by code and plays (ayah_done logged), the group
// page shows the weekly goal and the leaderboard. Anyone can join with the code (no child/parent audience any more).
// Env: KM_EMAIL/KM_PASS and KM_EMAIL2/KM_PASS2. Cleanup: the group is deleted by its owner.
import { BASE, newPage, close, userClient, userId, login, assert } from './lib.mjs';

const ca = await userClient(1), cb = await userClient(2);
const idB = await userId(cb);
const { data: nameB } = await cb.from('profiles').select('display_name').eq('id', idB).single();
const tag = Math.random().toString(36).slice(2, 6);
let gid;
const errs = [];
try {
  const P = await newPage('A');
  await login(P, 1);
  await P.click('nav.tabbar a[data-t="grup"]');
  await P.waitForSelector('#gn', { timeout: 15000 });
  assert(await P.locator('#ga').count() === 0, 'no child/parent audience choice any more');
  await P.fill('#gn', `Kelas Uji ${tag}`);
  await P.click('#gm');
  await P.waitForSelector('.lb', { timeout: 15000 });
  gid = P.url().split('#/grup/')[1];
  const jc = (await P.locator('.code').first().innerText()).trim();
  assert(/^[0-9A-F]{6}$/.test(jc), 'group page shows the join code ' + jc);
  const j = await cb.rpc('join_group', { code: jc });
  assert(!j.error, 'account B joins by code' + (j.error ? ': ' + j.error.message : ''));
  await cb.from('activity_log').insert([{ profile_id: idB, kind: 'ayah_done', detail: { ayah: '114001' } }, { profile_id: idB, kind: 'ayah_done', detail: { ayah: '114002' } }]);
  await P.reload(); await P.waitForSelector('.lb li', { timeout: 15000 });
  const row = P.locator('.lb li', { hasText: nameB.display_name });
  assert(await row.count() >= 1 && /\d+ ayat/.test(await row.first().innerText()), 'leaderboard lists B with this week\'s ayat');
  assert(/\d+ dari 50 ayat/.test(await P.locator('.frame').first().innerText()), 'weekly goal progress is shown (x dari 50)');
  await P.fill('#wg', '20'); await P.click('#ws');
  await P.locator('text=Target minggu ini: 20 ayat').waitFor({ timeout: 10000 });
  assert(true, 'owner edits the weekly goal');
  await P.screenshot({ path: 'shot-group.png', fullPage: true });
  errs.push(...P.errors.filter(e => !/status of (400|500)/.test(e) && !/group_members|groups/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  if (gid) await ca.from('groups').delete().eq('id', gid);
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
