// Shared helpers for beta Playwright tests. Run from a folder where `playwright` and
// `@supabase/supabase-js@2.45.4` are installed. Credentials come from env (never commit them):
//   KM_EMAIL, KM_PASS   (test parent account)
//   BASE                (default http://127.0.0.1:8765, serve the repo root)
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

export const BASE = process.env.BASE || 'http://127.0.0.1:8765';
export const SUPABASE_URL = 'https://vnzmvmlvicyggylgukaz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5';

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
  page.on('console', m => { if (m.type() === 'error' && !/huggingface|transformers/.test(m.location().url || '')) page.errors.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', e => page.errors.push(`[${label}] PAGEERROR ${e.message}`));
  page.on('response', r => { if (r.status() >= 500) page.errors.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
  await page.addInitScript(INIT);
  return page;
}

export const client = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

export async function parentClient() {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email: process.env.KM_EMAIL, password: process.env.KM_PASS });
  if (error) throw error;
  return c;
}

export async function childClient(code, childId, pin) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/child-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    body: JSON.stringify({ family_code: code, child_id: childId, pin }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('child-login ' + r.status + ' ' + JSON.stringify(j));
  const c = client();
  const { error } = await c.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' });
  if (error) throw error;
  return c;
}

export async function familyFn(parent, body) {
  const { data: { session } } = await parent.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/family`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
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
  } else if (/^(Ayo baca|Sekarang baca)/.test(h2)) { await page.click('.practice #next'); return 'practice'; } // reading practice never blocks
  else return 'other:' + h2;
  return h2;
}

/** For tests that don't need speech recognition: block the model download (call before page.goto). */
export const noModel = page => page.route(/huggingface\.co|@huggingface\/transformers/, r => r.abort());
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
