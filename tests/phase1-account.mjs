// Phase 1: one login for everyone. Google is the only sign-in on the start screen (the email form is hidden), plus a
// no-save trial. account 1 signs in (tests sign in through the app's Supabase client, see lib.mjs), sees the tabs and the
// farm, opens Profil and logs out with one tap (confirm accepted), and is back on the start screen.
import { BASE, newPage, close, login, assert } from './lib.mjs';
try {
  const P = await newPage('A');
  await P.goto(BASE + '/');
  await P.waitForSelector('#gbtn', { timeout: 20000 });
  assert(await P.locator('#em').count() === 0 && await P.locator('#pw').count() === 0, 'no email form on the start screen (Google only)');
  assert(await P.locator('#kid').count() === 0 && await P.locator('text=Akun anak lama').count() === 0, 'no old child sign-in on the start screen');
  assert(await P.locator('#guest').count() === 1, 'trial without an account is offered');
  await login(P, 1, '#dlg');
  assert(await P.locator('nav.tabbar a').count() === 4, 'tab bar: Kebun, Beranda, Grup, Profil');
  await P.click('nav.tabbar a[data-t="profil"]');
  await P.waitForSelector('#logout', { timeout: 20000 });
  assert(await P.locator('a[href="#/dukung"]').count() === 1, 'Profil links to the support page');
  P.once('dialog', d => d.accept());
  await P.click('#logout');
  await P.waitForSelector('#gbtn', { timeout: 20000 });
  assert(await P.locator('nav.tabbar').count() === 0, 'logged out: back on the start screen without tabs');
  assert(P.errors.length === 0, 'no console errors ' + P.errors.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
