// Phase 7b: monthly badges. Active badge shows normally with "aktif sampai <date>";
// a lapsed badge stays visible but greyed out ("tidak aktif") and the dashboard nudges to support again.
// Needs the test account's supporter_tier/supporter_until set by the caller (SQL), via env BADGE_STATE=active|lapsed.
// Env: KM_EMAIL, KM_PASS, BADGE_STATE.
import { BASE, newPage, close, assert } from './lib.mjs';
const state = process.env.BADGE_STATE || 'active';
try {
  const P = await newPage('parent');
  await P.goto(BASE + '/');
  await P.fill('#em', process.env.KM_EMAIL); await P.fill('#pw', process.env.KM_PASS); await P.click('#go');
  await P.waitForSelector('#code', { timeout: 20000 });
  const dash = await P.locator('.dash').innerText();
  const badge = P.locator('.dash .badge').first();
  await badge.waitFor({ timeout: 10000 });
  const off = await badge.evaluate(el => el.classList.contains('off'));
  if (state === 'active') {
    assert(!off, 'active badge is not greyed');
    assert(!/tidak aktif/.test(dash), 'no lapsed message on dashboard');
  } else {
    assert(off, 'lapsed badge is greyed (class off)');
    assert(/sedang tidak aktif/.test(dash), 'dashboard nudges to support again');
  }
  await P.click('a[href="#/dukung"]');
  await P.locator('text=Sahabat Kebun Makna').first().waitFor({ timeout: 15000 });
  const sup = await P.locator('.dash').innerText();
  assert(/Rp15\.000/.test(sup) && /Rp310\.000/.test(sup), 'new tier prices listed (15k ... 310k)');
  assert(/Per 30 hari/.test(sup), '30-day rule explained');
  if (state === 'active') assert(/aktif sampai/.test(sup), 'support page shows active-until date');
  else assert(/mengaktifkannya kembali/.test(sup), 'support page explains how to reactivate');
  await P.screenshot({ path: `shot-badge-${state}.png`, fullPage: true });
  assert(P.errors.length === 0, 'no console errors ' + P.errors.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
