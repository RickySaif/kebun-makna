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

export const fmtCode = c => 'KM-' + String(c || '').toUpperCase();
export const normCode = c => String(c || '').trim().toUpperCase().replace(/^KM-?/, '').replace(/[^0-9A-F]/g, '');

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

// ---- Google sign-in for parents (shown only when the provider is enabled in Supabase) ----
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
export async function signInGoogle() {
  const c = await sb();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) { if (/not enabled|unsupported provider/i.test(error.message)) _google = false; throw error; }
}

// ---- child login (no email) ----
export const childList = code => fn('child-login', { family_code: normCode(code) });
export async function childSignIn(code, childId, pin) {
  const { token_hash } = await fn('child-login', { family_code: normCode(code), child_id: childId, pin });
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
