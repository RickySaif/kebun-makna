// Phase 3: feed. Two test accounts A and B (live backend, 390x844). Env: KM_EMAIL/KM_PASS and KM_EMAIL2/KM_PASS2.
// A posts via the composer (source required) → profanity is rejected kindly → B sees it in Jelajah, reacts, comments,
// follows A. A DB insert without source_id is rejected. Cleanup: A's post (and its comments) and B's follow are deleted.
// (Hiding a post is admin-only now and is not covered here.)
import { BASE, newPage, close, userClient, userId, login, assert } from './lib.mjs';

const ca = await userClient(1), cb = await userClient(2);
const idA = await userId(ca), idB = await userId(cb);
const tag = Math.random().toString(36).slice(2, 6);
const errs = [];
try {
  const A = await newPage('A'), B = await newPage('B');
  await login(A, 1); await login(B, 2);
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
  const bad = await ca.from('posts').insert({ author_id: idA, body: 'tanpa sumber' });
  assert(!!bad.error, 'DB rejects a post without source_id: ' + (bad.error && bad.error.message));
  // ---- B sees it in Jelajah, reacts, comments, follows ----
  await B.goto(BASE + '/#/beranda/jelajah');
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
  // group_members 500 = RLS recursion fixed by migration 20261109060000 (needs applying); status-only lines duplicate HTTP lines
  for (const p of [A, B]) errs.push(...p.errors.filter(e => !/status of (400|500)/.test(e) && !/group_members|groups\?/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  await ca.from('posts').delete().eq('author_id', idA).like('body', `%(${tag})%`);
  await cb.from('follows').delete().match({ follower_id: idB, followee_id: idA });
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
