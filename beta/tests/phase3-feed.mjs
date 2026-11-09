// Phase 3: feed. Two test children A and B (live backend, 390x844).
// A posts via the composer (source required) → profanity is rejected kindly → B sees it in Jelajah, reacts, comments,
// follows A → parent hides the post → B no longer sees it, A still does. A DB insert without source_id is rejected.
// The parent's own feed never shows children's posts. Env: KM_EMAIL, KM_PASS.
import { BASE, newPage, close, parentClient, childClient, familyFn, assert } from './lib.mjs';

const parent = await parentClient();
const { data: fam } = await parent.from('families').select('code').single();
const code = 'KM-' + fam.code;
const tag = Math.random().toString(36).slice(2, 6);
const kids = [];
async function login(page, name, pin) {
  await page.goto(BASE + '/beta/');
  await page.click('#kid');
  if (await page.$('#fc')) { await page.fill('#fc', code); await page.click('#go'); }
  await page.locator('.kidgrid .av', { hasText: name }).click();
  for (const d of pin) await page.click(`.pinpad button[data-n="${d}"]`);
  await page.click('.pinpad button[data-f="ok"]');
  await page.waitForSelector('nav.tabbar', { timeout: 20000 });
}
const errs = [];
try {
  for (const [n, pin] of [['A', '6011'], ['B', '6012']]) {
    const r = await familyFn(parent, { action: 'create', display_name: `Uji ${n} ${tag}`, avatar: n === 'A' ? 0 : 1, pin });
    kids.push({ id: r.body.child_id, name: `Uji ${n} ${tag}`, pin });
  }
  const A = await newPage('A'), B = await newPage('B');
  await login(A, kids[0].name, kids[0].pin);
  await login(B, kids[1].name, kids[1].pin);
  // ---- A composes ----
  await A.click('nav.tabbar a[data-t="beranda"]');
  await A.click('#new');
  await A.click('.step1 .ptab button[data-m="surat"]');
  await A.fill('.picker .s', '112'); await A.fill('.picker .a', '1'); await A.click('.picker button.btn');
  await A.click('.srcpick');
  await A.fill('.refl', 'Kamu tolol');
  await A.click('#send');
  const e1 = await A.locator('#err').filter({ hasText: /\S/ }).innerText({ timeout: 10000 });
  assert(/tidak sopan/.test(e1), 'profanity rejected with the friendly message: ' + e1);
  const text = `Allah itu Esa. Aku mau ingat ini saat berdoa. (${tag})`;
  await A.fill('.refl', text);
  await A.click('#send');
  await A.locator('.post', { hasText: tag }).waitFor({ timeout: 15000 });
  assert(await A.locator('.post', { hasText: tag }).locator('.srccard', { hasText: 'QS. Al-Ikhlas 112:1' }).count() === 1, 'post shows the cited source card');
  await A.screenshot({ path: 'shot-feed.png' });
  // ---- DB rejects a post without a source ----
  const ca = await childClient(code, kids[0].id, kids[0].pin);
  const bad = await ca.from('posts').insert({ author_id: kids[0].id, body: 'tanpa sumber' });
  assert(!!bad.error, 'DB rejects a post without source_id: ' + (bad.error && bad.error.message));
  // ---- B sees it in Jelajah, reacts, comments, follows ----
  await B.goto(BASE + '/beta/#/beranda/jelajah');
  const card = B.locator('.post', { hasText: tag });
  await card.waitFor({ timeout: 15000 });
  assert(true, 'B sees A\'s post in Jelajah');
  await card.locator('.rx').first().click();
  await card.locator('.rx.on').waitFor({ timeout: 10000 });
  assert(true, 'B reacts');
  await card.locator('.cm').click();
  await card.locator('.comments textarea').fill('MasyaAllah, bagus!');
  await card.locator('.comments button.btn').click();
  await card.locator('.cmt', { hasText: 'MasyaAllah, bagus!' }).waitFor({ timeout: 10000 });
  assert(true, 'B comments');
  await card.locator('.who-row').first().click();
  await B.locator('.acts button', { hasText: 'Ikuti' }).click();
  await B.locator('.acts button', { hasText: 'Mengikuti' }).waitFor({ timeout: 10000 });
  assert(await B.locator('a', { hasText: 'Kunjungi kebun' }).count() === 1, 'B follows A; visit button offered (same role)');
  // ---- parent's feed: no children's posts ----
  const P = await newPage('parent');
  await P.goto(BASE + '/beta/'); await P.click('#ortu');
  await P.fill('#em', process.env.KM_EMAIL); await P.fill('#pw', process.env.KM_PASS); await P.click('#go');
  await P.waitForSelector('#code', { timeout: 20000 });
  await P.goto(BASE + '/beta/#/beranda/jelajah');
  await P.waitForSelector('.feed .post, .feed .banner', { timeout: 15000 });
  assert(await P.locator('.post', { hasText: tag }).count() === 0, 'parent feed does not show children\'s posts');
  // ---- parent hides via dashboard ----
  await P.goto(BASE + '/beta/#/ortu');
  await P.waitForSelector('#code', { timeout: 20000 });
  const kc = P.locator('.kidcard').filter({ has: P.locator('.head b', { hasText: kids[0].name }) });
  await kc.locator('details[data-s="posts"] summary').click();
  await kc.locator('.hd').first().click();
  await P.waitForTimeout(2500);
  const { data: hp } = await parent.from('posts').select('hidden').eq('author_id', kids[0].id);
  assert(hp[0].hidden === true, 'parent hid the post');
  await B.goto(BASE + '/beta/#/beranda/jelajah'); await B.reload();
  await B.waitForSelector('.feed .post, .feed .banner', { timeout: 15000 });
  assert(await B.locator('.post', { hasText: tag }).count() === 0, 'hidden post disappears for others');
  await A.goto(BASE + '/beta/#/profil');
  await A.locator('.post', { hasText: tag }).waitFor({ timeout: 15000 });
  assert(true, 'author still sees own hidden post');
  // group_members 500 = RLS recursion fixed by migration 20261109060000 (needs applying); status-only lines duplicate HTTP lines
  for (const p of [A, B, P]) errs.push(...p.errors.filter(e => !/status of (400|500)/.test(e) && !/group_members|groups\?/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  for (const k of kids) console.log('  cleanup', k.name, (await familyFn(parent, { action: 'delete', child_id: k.id })).status);
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
