// Phase 5: live race. A follows B; B waits on Beranda; A sees B online in the lobby and invites; B gets the banner,
// joins; both get the same questions; A answers everything right and wins; both log boss_done {mode:'pvp'}.
// Env: KM_EMAIL/KM_PASS and KM_EMAIL2/KM_PASS2. Cleanup: A's follow is deleted.
import { BASE, newPage, close, userClient, userId, login, assert } from './lib.mjs';

const ca = await userClient(1), cb = await userClient(2);
const idA = await userId(ca), idB = await userId(cb);
const t0 = new Date().toISOString();
async function answer(page, right) {
  const ar = await page.locator('#stage .ar').innerText();
  const ans = await page.evaluate(async ar => { const { DATA } = await import('./js/data.js'); for (const s of DATA) for (const a of s.ayat) for (const w of a.w) if (w.ar === ar) return w.id; }, ar);
  const btns = page.locator('#stage .opt');
  const n = await btns.count();
  for (let i = 0; i < n; i++) { const t = await btns.nth(i).innerText(); if ((t === ans) === right) { await btns.nth(i).click(); return; } }
}
const errs = [];
try {
  const A = await newPage('A'), B = await newPage('B');
  for (const [p, n] of [[A, 1], [B, 2]]) {
    await login(p, n, '#dlg');
    await p.evaluate(async () => { const s = await import('./js/state.js'); ['114001', '114002', '114003'].forEach(a => s.S.ay[a] = true); s.save(); });
  }
  await A.waitForTimeout(5000);
  await ca.from('follows').insert({ follower_id: idA, followee_id: idB });
  await B.goto(BASE + '/#/beranda'); await B.reload();
  await B.waitForSelector('.feed', { timeout: 15000 });
  await A.goto(BASE + '/#/lomba'); await A.reload();
  await A.locator('.onl button', { hasText: 'Ajak lomba' }).waitFor({ timeout: 20000 });
  assert(true, 'A sees B online in the lobby');
  await A.locator('.onl button').click();
  await B.locator('.invite-banner a').waitFor({ timeout: 15000 });
  assert(true, 'B receives the invite banner');
  await B.locator('.invite-banner a').click();
  await A.waitForSelector('#stage .opt', { timeout: 20000 });
  await B.waitForSelector('#stage .opt', { timeout: 20000 });
  const qa = await A.locator('#stage .ar').innerText(), qb = await B.locator('#stage .ar').innerText();
  assert(qa === qb, 'both players get the same first question: ' + qa);
  await answer(B, false);
  for (let i = 0; i < 10; i++) { await A.waitForSelector('#stage .opt:not([disabled])', { timeout: 5000 }); await answer(A, true); await A.waitForTimeout(450); }
  await A.locator('text=Kamu menang').waitFor({ timeout: 10000 });
  await B.locator('text=Temanmu menang').waitFor({ timeout: 10000 });
  assert(true, 'A wins, B sees the result');
  await A.screenshot({ path: 'shot-race.png' });
  await A.waitForTimeout(1500);
  const mine = async (c, id) => ((await c.from('activity_log').select('detail').eq('kind', 'boss_done').eq('profile_id', id).gte('created_at', t0)).data || []).filter(l => l.detail.mode === 'pvp').length;
  assert((await mine(ca, idA)) >= 1 && (await mine(cb, idB)) >= 1, 'both logged boss_done {mode:pvp}');
  for (const p of [A, B]) errs.push(...p.errors.filter(e => !/status of (400|409|500)/.test(e) && !/group_members|groups\?/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  await ca.from('follows').delete().match({ follower_id: idA, followee_id: idB });
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
