// Phase 5: live race. A follows B; B waits on Beranda; A sees B online in the lobby and invites; B gets the banner,
// joins; both get the same questions; A answers everything right and wins; both log boss_done {mode:'pvp'}.
// Env: KM_EMAIL, KM_PASS.
import { BASE, newPage, close, parentClient, childClient, familyFn, assert } from './lib.mjs';

const parent = await parentClient();
const { data: code } = await parent.rpc('my_family_name'); // family name, e.g. "penguji"
const tag = Math.random().toString(36).slice(2, 6);
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
async function answer(page, right) {
  const ar = await page.locator('#stage .ar').innerText();
  const ans = await page.evaluate(async ar => { const { DATA } = await import('./js/data.js'); for (const s of DATA) for (const a of s.ayat) for (const w of a.w) if (w.ar === ar) return w.id; }, ar);
  const btns = page.locator('#stage .opt');
  const n = await btns.count();
  for (let i = 0; i < n; i++) { const t = await btns.nth(i).innerText(); if ((t === ans) === right) { await btns.nth(i).click(); return; } }
}
const errs = [];
try {
  for (const [n, pin] of [['A', '8011'], ['B', '8012']]) {
    const r = await familyFn(parent, { action: 'create', display_name: `Uji ${n} ${tag}`, avatar: n === 'A' ? 0 : 1, pin });
    kids.push({ id: r.body.child_id, name: `Uji ${n} ${tag}`, pin });
  }
  const A = await newPage('A'), B = await newPage('B');
  for (const [p, k] of [[A, kids[0]], [B, kids[1]]]) {
    await login(p, k);
    await p.evaluate(async () => { const s = await import('./js/state.js'); ['114001', '114002', '114003'].forEach(a => s.S.ay[a] = true); s.save(); });
  }
  await A.waitForTimeout(5000);
  const ca = await childClient(code, kids[0].id, kids[0].pin);
  await ca.from('follows').insert({ follower_id: kids[0].id, followee_id: kids[1].id });
  await B.goto(BASE + '/beta/#/beranda'); await B.reload();
  await B.waitForSelector('.feed', { timeout: 15000 });
  await A.goto(BASE + '/beta/#/lomba'); await A.reload();
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
  const { data: logs } = await parent.from('activity_log').select('profile_id, detail').eq('kind', 'boss_done').in('profile_id', kids.map(k => k.id));
  assert(logs.filter(l => l.detail.mode === 'pvp').length === 2, 'both logged boss_done {mode:pvp}');
  for (const p of [A, B]) errs.push(...p.errors.filter(e => !/status of (400|409|500)/.test(e) && !/group_members|groups\?/.test(e)));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 400)); process.exitCode = 1; }
finally {
  for (const k of kids) console.log('  cleanup', k.name, (await familyFn(parent, { action: 'delete', child_id: k.id })).status);
  await close();
}
assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
