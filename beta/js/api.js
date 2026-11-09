// api.js — Supabase client and backend helpers (auth, family, child login, activity log).
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_ESM } from './config.js';

let _sb = null, _loading = null;
export const session = { user: null, profile: null, guest: false };

export async function sb() {
  if (_sb) return _sb;
  if (!_loading) _loading = import(SUPABASE_ESM).then(m => {
    _sb = m.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kebun-makna-auth', detectSessionInUrl: true },
    });
    return _sb;
  });
  return _loading;
}

// Family name: lowercase handle such as "saif" or "saif2" (3–20 chars, a-z0-9, starts with a letter).
// Legacy KM-XXXXXX codes are still accepted by the server; the UI never shows them.
export const normFamily = c => String(c || '').trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '');
export const isFamilyName = n => /^[a-z][a-z0-9]{2,19}$/.test(n) || /^(km-?)?[0-9a-f]{6}$/.test(n);

// Friendly Indonesian text for backend errors.
export function friendly(err) {
  const m = String((err && (err.message || err.error || err.msg)) || err || '');
  if (/Invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka email dari Kebun Makna dan ketuk tautannya dulu.';
  if (/rate limit|too many/i.test(m)) return 'Terlalu sering mencoba. Tunggu sebentar, ya.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Tidak ada koneksi internet. Coba lagi nanti.';
  if (/JWT|not authenticated|401/i.test(m)) return 'Sesi berakhir. Silakan masuk lagi.';
  return m || 'Terjadi kesalahan. Coba lagi.';
}

export async function loadProfile() {
  const c = await sb();
  const { data: { session: s } } = await c.auth.getSession();
  if (!s) { session.user = null; session.profile = null; return null; }
  session.user = s.user;
  const { data, error } = await c.from('profiles').select('id, role, display_name, avatar, supporter_tier').eq('id', s.user.id).maybeSingle();
  if (error) throw error;
  session.profile = data;
  return data;
}

export async function signOut() {
  const c = await sb();
  try { await c.auth.signOut(); } catch (e) { /* offline: local session cleared anyway */ }
  session.user = null; session.profile = null;
}

async function fn(name, body, auth) {
  const c = await sb();
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (auth) {
    const { data: { session: s } } = await c.auth.getSession();
    if (!s) throw new Error('Sesi berakhir. Silakan masuk lagi.');
    headers.Authorization = 'Bearer ' + s.access_token;
  } else headers.Authorization = 'Bearer ' + SUPABASE_KEY;
  let res;
  try { res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(friendly(e)); }
  let j = {};
  try { j = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) { const er = new Error(j.error || `Gagal (${res.status})`); er.status = res.status; throw er; }
  return j;
}

// ---- Google sign-in for parents via Google Identity Services (the chooser shows Kebun Makna, not supabase.co) ----
export const GOOGLE_CLIENT_ID = '1066063708944-g4o9rf0sirmi09oicpktq618phnl5vjv.apps.googleusercontent.com';
let _google = null;
export async function googleEnabled() {
  if (_google !== null) return _google;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    const j = await r.json();
    _google = !!(j.external && j.external.google);
  } catch (e) { _google = false; }
  return _google;
}
let _gis = null;
export function loadGIS() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve(window.google);
  if (_gis) return _gis;
  _gis = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => (window.google && window.google.accounts) ? res(window.google) : rej(new Error('GIS unavailable'));
    s.onerror = () => { _gis = null; rej(new Error('GIS unavailable')); };
    document.head.append(s);
    setTimeout(() => rej(new Error('GIS timeout')), 10000);
  });
  return _gis;
}
async function sha256hex(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
/** Render the official Google button into `el`. onDone(profile) after sign-in; onError(err). Resolves false if unavailable. */
export async function renderGoogleButton(el, onDone, onError) {
  if (!(await googleEnabled())) return false;
  let g; try { g = await loadGIS(); } catch (e) { return false; }
  const raw = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
  g.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID, nonce: await sha256hex(raw), ux_mode: 'popup', use_fedcm_for_prompt: true,
    callback: async resp => {
      try {
        const c = await sb();
        const { error } = await c.auth.signInWithIdToken({ provider: 'google', token: resp.credential, nonce: raw });
        if (error) throw error;
        onDone(await loadProfile());
      } catch (e) { onError(e); }
    },
  });
  g.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'id', width: Math.min(320, Math.max(200, el.clientWidth || 300)) });
  return true;
}

// ---- child login (no email) ----
export const childList = name => fn('child-login', { family_code: normFamily(name) });
export async function childSignIn(code, childId, pin) {
  const { token_hash } = await fn('child-login', { family_code: normFamily(code), child_id: childId, pin });
  const c = await sb();
  const { error } = await c.auth.verifyOtp({ token_hash, type: 'magiclink' });
  if (error) throw error;
  return loadProfile();
}

// ---- parent family management ----
export const familyCreate = (display_name, avatar, pin) => fn('family', { action: 'create', display_name, avatar, pin }, true);
export const familySetPin = (child_id, pin) => fn('family', { action: 'set_pin', child_id, pin }, true);
export const familyDelete = child_id => fn('family', { action: 'delete', child_id }, true);

// ---- activity log (silently skipped for guests / offline) ----
const pending = [];
export async function logActivity(kind, detail = {}) {
  if (!session.user) return;
  pending.push({ profile_id: session.user.id, kind, detail });
  try {
    const c = await sb();
    const rows = pending.splice(0);
    const { error } = await c.from('activity_log').insert(rows);
    if (error) { pending.unshift(...rows); }
  } catch (e) { /* keep queued */ }
}
