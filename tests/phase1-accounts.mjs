// Phase 1 acceptance against the LIVE backend, at 390x844:
// parent logs in → creates 2 children in the dashboard → each child logs in (own browser) and plays one ayah →
// progress shows on the dashboard → survives clearing localStorage → child A cannot read child B's save.
// Test children are deleted at the end. Needs env KM_EMAIL / KM_PASS (test parent; never commit).
import { BASE, newPage, close, parentClient, childClient, familyFn, driveLessonOnce, assert } from './lib.mjs';

const tag = Math.random().toString(36).slice(2, 6);
const KIDS = [{ name: `Uji A ${tag}`, pin: '4821' }, { name: `Uji B ${tag}`, pin: '4822' }];
const parent = await parentClient();
const allErrors = [];
let code;

async function childPlay(kid, label) {
  const page = await newPage(label);
  await page.goto(BASE + '/');
  await page.click('#kid');
  await page.fill('#fc', code);
  await page.click('#go');
  await page.locator('.kidgrid .av', { hasText: kid.name }).click();
  for (const d of kid.pin) await page.click(`.pinpad button[data-n="${d}"]`);
  await page.click('.pinpad button[data-f="ok"]');
  await page.waitForSelector('#farm', { timeout: 20000 });
  assert(await page.locator('.hud .grow').innerText() === kid.name.slice(0, 16), `${label}: game uses the child's name`);
  // play the first ayah of An-Nas
  await page.evaluate(async () => { const m = await import('./js/farm.js'); const l = await import('./js/lesson.js'); l.lessonStart(114); });
  let overrode = false;
  for (let i = 0; i < 60; i++) {
    const r = await driveLessonOnce(page); if (r === 'cel') break;
    if (r === 'gate' && !overrode) { await page.click('#par'); await page.fill('#pp', '1357'); await page.click('.celebrate #ok'); overrode = true; }
    await page.waitForTimeout(250);
  }
  assert(overrode, `${label}: recitation gate shown; parent override PIN accepted`);
  const ay = await page.evaluate(async () => Object.keys((await import('./js/state.js')).S.ay));
  assert(ay.includes('114001'), `${label}: ayah 114:1 done in game state`);
  await page.waitForTimeout(5000); // debounce 3 s + push
  return page;
}

try {
  // ---- parent dashboard: login + create 2 kids ----
  const P = await newPage('parent');
  await P.goto(BASE + '/');
  await P.click('#ortu');
  await P.fill('#em', process.env.KM_EMAIL);
  await P.fill('#pw', process.env.KM_PASS);
  await P.click('#go');
  await P.waitForSelector('#code', { timeout: 20000 });
  code = (await P.locator('#code').innerText()).trim();
  assert(/^[a-z][a-z0-9]{2,19}$/.test(code), `dashboard shows the family name ${code}`);
  for (const k of KIDS) {
    await P.fill('#kn', k.name);
    await P.fill('#kp', k.pin);
    await P.click('#add');
    await P.locator('.kidcard', { hasText: k.name }).waitFor({ timeout: 20000 });
  }
  assert(await P.locator('.kidcard').count() >= 2, 'two child cards on the dashboard');
  await P.fill('#pp', '1357'); await P.click('#sv');
  await P.locator('text=PIN orang tua disimpan').waitFor({ timeout: 10000 });
  assert(true, 'parent override PIN set');
  await P.screenshot({ path: 'shot-dashboard.png', fullPage: true });

  // ---- each child logs in on its own browser and plays an ayah ----
  const A = await childPlay(KIDS[0], 'childA');
  const B = await childPlay(KIDS[1], 'childB');
  await A.screenshot({ path: 'shot-childA.png' });

  // ---- dashboard shows progress ----
  await P.reload();
  await P.waitForSelector('#code', { timeout: 20000 });
  for (const k of KIDS) {
    const txt = await P.locator('.kidcard', { hasText: k.name }).evaluate(e => e.textContent);
    assert(/(^|\D)1\/\d+ ayat/.test(txt), `dashboard shows 1 ayat for ${k.name}`);
    assert(/Ayat selesai/.test(txt), `dashboard timeline shows ayah_done for ${k.name}`);
  }
  await P.screenshot({ path: 'shot-dashboard2.png', fullPage: true });

  // ---- survives clearing localStorage: fresh browser, log in again ----
  const A2 = await newPage('childA-fresh');
  await A2.goto(BASE + '/');
  await A2.click('#kid'); await A2.fill('#fc', code); await A2.click('#go');
  await A2.locator('.kidgrid .av', { hasText: KIDS[0].name }).click();
  for (const d of KIDS[0].pin) await A2.click(`.pinpad button[data-n="${d}"]`);
  await A2.click('.pinpad button[data-f="ok"]');
  await A2.waitForSelector('#farm', { timeout: 20000 });
  const ay2 = await A2.evaluate(async () => Object.keys((await import('./js/state.js')).S.ay));
  assert(ay2.includes('114001'), 'progress restored from cloud on a fresh browser');

  // ---- RLS: child A cannot read child B's save ----
  const { data: kids } = await parent.from('profiles').select('id, display_name').in('display_name', KIDS.map(k => k.name));
  const idA = kids.find(k => k.display_name === KIDS[0].name).id, idB = kids.find(k => k.display_name === KIDS[1].name).id;
  const ca = await childClient(code, idA, KIDS[0].pin);
  const own = await ca.from('game_saves').select('profile_id').eq('profile_id', idA);
  const other = await ca.from('game_saves').select('profile_id, state').eq('profile_id', idB);
  assert(own.data && own.data.length === 1, 'child A reads own save');
  assert(other.data && other.data.length === 0, 'child A cannot read child B save (RLS)');
  const pubB = await ca.from('farm_public').select('profile_id, snapshot').eq('profile_id', idB);
  assert(pubB.data && pubB.data.length === 1 && !('ay' in pubB.data[0].snapshot), 'child B public farm snapshot is visible and has no private progress');
  const fam = await ca.from('families').select('code');
  assert(fam.data && fam.data.length === 0, 'child cannot read family codes');

  for (const p of [P, A, B, A2]) allErrors.push(...p.errors);
} catch (e) {
  console.log('  FAIL exception', e.message); process.exitCode = 1;
} finally {
  // ---- cleanup test children ----
  const { data: links } = await parent.from('family_members').select('child_id');
  const { data: kids } = await parent.from('profiles').select('id, display_name').in('id', (links || []).map(l => l.child_id));
  for (const k of kids || []) if (k.display_name.startsWith('Uji ')) {
    const r = await familyFn(parent, { action: 'delete', child_id: k.id });
    console.log('  cleanup', k.display_name, r.status);
  }
  await close();
}
const realErrors = allErrors.filter(e => !/favicon/.test(e));
assert(realErrors.length === 0, 'no console errors' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
