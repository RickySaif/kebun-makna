// Google Identity Services button: renders at 390px on the parent login screen; when the GIS script can't load,
// the button area disappears and email login still works. BASE can point at GitHub Pages (authorized origin).
import { BASE, newPage, close, assert } from './lib.mjs';
try {
  const P = await newPage('gis');
  await P.goto(BASE + '/');
  await P.waitForSelector('#gbtn iframe', { timeout: 20000 });
  const box = await P.locator('#gbtn iframe').boundingBox();
  assert(box && box.width >= 180 && box.x >= 0 && box.x + box.width <= 390, `Google button rendered inside 390px (x=${box && Math.round(box.x)}, w=${box && Math.round(box.width)})`);
  await P.screenshot({ path: 'shot-google.png' });
  assert(await P.locator('#em').count() === 1 && await P.locator('#pw').count() === 1, 'email login still present');
  const Q = await newPage('nogis');
  await Q.route('https://accounts.google.com/**', r => r.abort());
  await Q.goto(BASE + '/'); 
  await Q.waitForTimeout(3000);
  assert(await Q.locator('#gbtn').count() === 0, 'without the GIS script the Google area is removed');
  assert(await Q.locator('#em').count() === 1, 'email login works without GIS');
  const errs = Q.errors.filter(e => !/accounts\.google\.com|ERR_FAILED|net::/.test(e));
  assert(errs.length === 0, 'no unexpected errors ' + errs.join(' | '));
} catch (e) { console.log('  FAIL exception', e.message.slice(0, 300)); process.exitCode = 1; }
finally { await close(); }
