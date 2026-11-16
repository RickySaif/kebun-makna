// Phase 7b: monthly badges. Active badge shows normally with "aktif sampai <date>";
// a lapsed badge stays visible but greyed out ("tidak aktif") and the support page explains how to reactivate it.
// Needs the test account's supporter_tier/supporter_until set by the caller (SQL), via env BADGE_STATE=active|lapsed.
// Env: KM_EMAIL, KM_PASS, BADGE_STATE.
import { BASE, newPage, close, login, openSupport, assert } from './lib.mjs';
const state = process.env.BADGE_STATE || 'active';
try {
  const P = await newPage('parent');
  await login(P, 1, '#dlg');
  const badge = P.locator('.hud .grow .badge').first(); // the badge sits next to the name in the game HUD
  await badge.waitFor({ timeout: 10000 });
  const off = await badge.evaluate(el => el.classList.contains('off'));
  if (state === 'active') assert(!off, 'active badge is not greyed');
  else assert(off, 'lapsed badge is greyed (class off)');
  await openSupport(P);
  const sup = await P.locator('.dash').innerText();
  assert(/Rp15\.000/.test(sup) && /Rp310\.000/.test(sup), 'new tier prices listed (15k ... 310k)');
  assert(/Per 30 hari/.test(sup), '30-day rule explained');
  if (state === 'active') assert(/aktif sampai/.test(sup), 'support page shows active-until date');
  else assert(/mengaktifkannya kembali/.test(sup), 'support page explains how to reactivate');
  await P.screenshot({ path: `shot-badge-${state}.png`, fullPage: true });
  assert(P.errors.length === 0, 'no console errors ' + P.errors.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
