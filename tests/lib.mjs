// Shared helpers for beta Playwright tests. Run from a folder where `playwright` and
// `@supabase/supabase-js@2.45.4` are installed. Credentials come from env (never commit them):
//   KM_EMAIL,  KM_PASS    test account 1 ("A")
//   KM_EMAIL2, KM_PASS2   test account 2 ("B"), only for the two-player tests (feed, visit, race, groups)
// Both are normal email accounts, created and confirmed once by hand (never sign them up from a test: email limits).
// They are dedicated to tests: the tests change their saves and clean up what they can (posts, follows, groups).
//   BASE                (default http://127.0.0.1:8765, serve the repo root)
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

export const BASE = process.env.BASE || 'http://127.0.0.1:8765';
export const SUPABASE_URL = 'https://vnzmvmlvicyggylgukaz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5';

/** Tests: the fake mic loops its file; a short silence ends a reading at the file's quiet tail (the game waits 6–8 s). */
export const SHORT_SILENCE = () => { import('./js/config.js').then(c => { c.RECITE.ayahSilenceMs = c.RECITE.surahSilenceMs = 1500; }).catch(() => {}); };
export const INIT = () => {
  HTMLMediaElement.prototype.play = function () { setTimeout(() => this.dispatchEvent(new Event('ended')), 30); return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
};

let browser;
export async function launch() { browser = browser || await chromium.launch({ channel: 'chrome' }); return browser; }
export async function close() { if (browser) await browser.close(); browser = null; }

export async function newPage(label) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/huggingface|transformers|\/models\//.test(m.location().url || '')) page.errors.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', e => page.errors.push(`[${label}] PAGEERROR ${e.message}`));
  page.on('response', r => { if (r.status() >= 500) page.errors.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
  await page.addInitScript(INIT);
  return page;
}

export const client = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const CRED = n => n === 2 ? [process.env.KM_EMAIL2, process.env.KM_PASS2] : [process.env.KM_EMAIL, process.env.KM_PASS];
/** A signed-in Supabase client for test account n (1 or 2). */
export async function userClient(n = 1) {
  const [email, password] = CRED(n);
  if (!email || !password) throw new Error(n === 2 ? 'Set KM_EMAIL2 and KM_PASS2' : 'Set KM_EMAIL and KM_PASS');
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
export const userId = async c => (await c.auth.getUser()).data.user.id;

/** Sign test account n in through the login form. `ready` is what to wait for: 'nav.tabbar' (tabs) or '#dlg' (the farm). */
export async function login(page, n = 1, ready = 'nav.tabbar') {
  const [email, password] = CRED(n);
  await page.goto(BASE + '/');
  await page.fill('#em', email); await page.fill('#pw', password); await page.click('#go');
  // beta: an account without a WhatsApp number gets the number screen once (KM_WA = a test number, default a dummy one)
  await page.waitForSelector(`${ready}, #wa`, { timeout: 30000 });
  if (await page.$('#wa')) { await page.fill('#wa', process.env.KM_WA || '0812 0000 0001'); await page.click('#go'); await page.waitForSelector(ready, { timeout: 30000 }); }
}

/** Signed in: open the support page through the Profil tab (also checks the "Dukung" link is reachable). */
export async function openSupport(page) {
  await page.click('nav.tabbar a[data-t="profil"]');
  await page.waitForSelector('#logout', { timeout: 20000 });
  await page.click('a[href="#/dukung"]');
  await page.locator('text=Sahabat Kebun Makna').first().waitFor({ timeout: 15000 });
}

/** Drive one lesson panel step (Dengar/Kenali/Cocokkan/Susun) or a celebration. Returns a label or null. */
export async function driveLessonOnce(page) {
  if (await page.$('.celebrate:not(.askparent) button')) { await page.click('.celebrate:not(.askparent) button'); return 'cel'; }
  const h2 = await page.$eval('#layer .panel h2', e => e.textContent).catch(() => null);
  if (!h2) return null;
  if (h2.startsWith('Dengarkan')) await page.click('#nx:not([disabled])', { timeout: 15000 });
  else if (h2.startsWith('Kenali')) { const n = await page.locator('.card').count(); for (let i = 0; i < n; i++) await page.locator('.card').nth(i).click(); await page.click('#nx:not([disabled])'); }
  else if (h2.startsWith('Cocokkan')) {
    await page.evaluate(() => { const L = [...document.querySelectorAll('[data-c=ar] .chip2')], R = [...document.querySelectorAll('[data-c=mn] .chip2')]; L.forEach(l => { l.click(); R.find(r => r._w === l._w).click(); }); });
    await page.click('#nx:not([disabled])');
  } else if (h2.startsWith('Susun ayatnya')) {
    const t = await page.$eval('#layer .panel', e => e.innerText.slice(0, 80));
    const m = t.match(/^(.*?) · Ayat (\d+) dari/m);
    await page.evaluate(async ([name, n]) => {
      const { DATA } = await import('./js/data.js');
      const words = DATA.find(s => s.name === name).ayat[n - 1].w.map(w => w.ar);
      for (const w of words) [...document.querySelectorAll('.pool .tile:not(.used)')].find(t => t.textContent === w).click();
    }, [m[1].trim(), +m[2]]);
    await page.click('#nx:not([disabled])'); await page.waitForTimeout(50); await page.click('#nx');
  } else if (/^(Ayo baca|Sekarang baca|Baca Surat)/.test(h2)) { await page.click('.practice #next'); return 'practice'; } // reading practice never blocks
  else return 'other:' + h2;
  return h2;
}

/** For tests that don't need speech recognition: block the model download (call before page.goto). */
export const noModel = page => page.route(/huggingface\.co|@huggingface\/transformers|\/models\//, r => r.abort());
/** Tap "Main sebagai tamu" and get past the model start-up screen ("Main tanpa latihan baca") to onboarding. */
export async function startGuest(page) {
  await page.click('#guest');
  await page.waitForSelector('#nm, .prep .act button', { timeout: 30000 });
  if (await page.$('.prep .act button')) await page.click('.prep .act button:has-text("Main tanpa latihan baca")');
  await page.waitForSelector('#nm', { timeout: 10000 });
}

/** After a (re)load with the model blocked: tap "Main tanpa latihan baca" on the start-up screen, then wait for the farm. */
export async function skipPrep(page) {
  await page.waitForSelector('#farm, .prep .act button', { timeout: 30000 });
  if (await page.$('.prep .act button')) await page.click('.prep .act button:has-text("Main tanpa latihan baca")');
  await page.waitForSelector('#farm', { timeout: 10000 });
}

export function assert(cond, msg) { if (!cond) { console.log('  FAIL', msg); process.exitCode = 1; } else console.log('  ok  ', msg); }
