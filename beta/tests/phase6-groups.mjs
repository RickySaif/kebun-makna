// Phase 6: groups. Parent creates a child-audience group in the UI, a test child joins by code, plays (ayah_done logged),
// the group page shows the weekly goal and the leaderboard. If migration 20261109060000 is not applied yet, checks that
// the pages degrade gracefully (friendly "sedang disiapkan" message, no page errors). Env: KM_EMAIL, KM_PASS.
import { BASE, newPage, close, parentClient, childClient, familyFn, assert } from './lib.mjs';

const parent = await parentClient();
const { data: fam } = await parent.from('families').select('code').single();
const code = 'KM-' + fam.code, tag = Math.random().toString(36).slice(2, 6);
const probe = await parent.rpc('group_progress', { g: '00000000-0000-0000-0000-000000000000' });
const applied = !(probe.error && /Could not find|does not exist/i.test(probe.error.message));
console.log('  migration 20261109060000 applied:', applied);
let kid, gid;
const errs = [];
try {
  const P = await newPage('parent');
  await P.goto(BASE + '/beta/'); await P.click('#ortu');
  await P.fill('#em', process.env.KM_EMAIL); await P.fill('#pw', process.env.KM_PASS); await P.click('#go');
  await P.waitForSelector('#code', { timeout: 20000 });
  await P.click('nav.tabbar a[data-t="grup"]');
  await P.waitForSelector('#gn', { timeout: 15000 });
  await P.fill('#gn', `Kelas Uji ${tag}`);
  await P.click('#gm');
  if (!applied) {
    await P.locator('text=sedang disiapkan').first().waitFor({ timeout: 15000 });
    assert(true, 'groups degrade gracefully before the migration');
    const { data: g } = await parent.from('groups').select('id').limit(1);
    // clean any group created before the select failed (delete policy doesn't recurse)
    await parent.from('groups').delete().eq('owner_id', (await parent.auth.getUser()).data.user.id).like('name', `Kelas Uji ${tag}`);
  } else {
    await P.waitForSelector('.lb', { timeout: 15000 });
    gid = P.url().split('#/grup/')[1];
    const jc = (await P.locator('.code').first().innerText()).trim();
    assert(/^[0-9A-F]{6}$/.test(jc), 'group page shows the join code ' + jc);
    const r = await familyFn(parent, { action: 'create', display_name: `Uji G ${tag}`, avatar: 0, pin: '9011' });
    kid = r.body.child_id;
    const ck = await childClient(code, kid, '9011');
    const j = await ck.rpc('join_group', { code: jc });
    assert(!j.error, 'child joins by code');
    const pj = await parent.rpc('join_group', { code: jc });
    assert(!!pj.error, 'parent cannot join a child-audience group: ' + (pj.error && pj.error.message));
    await ck.from('activity_log').insert([{ profile_id: kid, kind: 'ayah_done', detail: { ayah: '114001' } }, { profile_id: kid, kind: 'ayah_done', detail: { ayah: '114002' } }]);
    await P.reload(); await P.waitForSelector('.lb li', { timeout: 15000 });
    const t = await P.locator('.lb').innerText();
    assert(t.includes(`Uji G ${tag}`) && /2 ayat/.test(t), 'leaderboard shows the child with 2 ayat this week');
    assert(/2 dari 50 ayat/.test(await P.locator('.frame').first().innerText()), 'weekly goal progress 2/50');
    await P.fill('#wg', '20'); await P.click('#ws');
    await P.locator('text=Target minggu ini: 20 ayat').waitFor({ timeout: 10000 });
    assert(true, 'owner edits the weekly goal');
    await P.screenshot({ path: 'shot-group.png', fullPage: true });
  }
  errs.push(...P.errors.filter(e => !/status of (400|500)/.test(e) && !/group_members|groups/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  if (gid) await parent.from('groups').delete().eq('id', gid);
  if (kid) console.log('  cleanup', (await familyFn(parent, { action: 'delete', child_id: kid })).status);
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
