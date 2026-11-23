// Google Identity Services button: Google is the only sign-in shown, rendered at 390px. When the GIS script can't load,
// the button area is replaced by a "could not load" message and a reload button (the email form is hidden by design).
// BASE can point at GitHub Pages (authorized origin).
import { BASE, newPage, close, assert } from './lib.mjs';
try {
  const P = await newPage('gis');
  await P.goto(BASE + '/');
  // GIS draws its button either in an iframe or inline (a [role=button] div), depending on its version.
  const btn = P.locator('#gbtn iframe, #gbtn [role="button"]').first();
  await btn.waitFor({ timeout: 20000 });
  const box = await btn.boundingBox();
  assert(box && box.width >= 180 && box.x >= 0 && box.x + box.width <= 390, `Google button rendered inside 390px (x=${box && Math.round(box.x)}, w=${box && Math.round(box.width)})`);
  await P.screenshot({ path: 'shot-google.png' });
  assert(await P.locator('#em').count() === 0 && await P.locator('#pw').count() === 0, 'email form is hidden (Google only)');
  assert(await P.locator('#guest').count() === 1, 'trial without an account is still offered');
  assert(await P.locator('#reload').count() === 0 || !(await P.locator('#reload').isVisible()), 'fallback "Muat ulang" is not shown when Google works');
  assert(await P.locator('#ghelp').isVisible() === false, 'fallback help text is not shown when Google works');
  const Q = await newPage('nogis');
  await Q.route('https://accounts.google.com/**', r => r.abort());
  await Q.goto(BASE + '/');
  await Q.waitForTimeout(3000);
  assert(await Q.locator('#gbtn').count() === 0, 'without the GIS script the Google area is removed');
  assert(await Q.locator('#reload').count() === 1 && await Q.locator('#reload').isVisible(), 'a reload button is offered instead of a blank card');
  assert(await Q.locator('#em').count() === 0, 'email form stays hidden without GIS');
  const errs = Q.errors.filter(e => !/accounts\.google\.com|ERR_FAILED|net::/.test(e));
  assert(errs.length === 0, 'no unexpected errors ' + errs.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
