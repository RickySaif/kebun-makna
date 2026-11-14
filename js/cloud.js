// cloud.js — cloud save for signed-in children (game_saves + farm_public), activity diffing.
// localStorage stays the offline cache. Saves are debounced (~3 s) and flushed on visibilitychange.
// Conflict rule: each successful write increments `version`; the higher version wins.
import { S, KEY, GUEST_KEY, loadState, setSaveKey, setSaveHook, save } from './state.js';
import { BY, ORDER, HOUSE_TIERS } from './data.js';
import { levelOf } from './progress.js';
import { sb, session, logActivity } from './api.js';
import { SAVE_DEBOUNCE_MS } from './config.js';
import { toast } from './ui.js';

const meta = { version: 0, dirty: false, timer: null, busy: false, again: false, uid: null };
const keyFor = uid => `${KEY}:${uid}`;
const metaKey = uid => `${KEY}:${uid}:meta`;
let lastSeen = null; // for activity diffing

function readLocal(uid) {
  try {
    const st = JSON.parse(localStorage.getItem(keyFor(uid)) || 'null');
    const m = JSON.parse(localStorage.getItem(metaKey(uid)) || '{}');
    return { st, version: m.version || 0, dirty: !!m.dirty };
  } catch (e) { return { st: null, version: 0, dirty: false }; }
}
function writeMeta() {
  try { localStorage.setItem(metaKey(meta.uid), JSON.stringify({ version: meta.version, dirty: meta.dirty })); } catch (e) {}
}

const progressMarks = s => ({
  ay: Object.keys(s.ay || {}).filter(k => s.ay[k]),
  solved: Object.keys(s.solved || {}).filter(k => s.solved[k]),
  trophies: Object.keys(s.trophies || {}).filter(k => s.trophies[k]),
  reviews: Object.assign({}, s.reviews || {}),
});

// Log new progress since the last save (non-intrusive: no edits inside the lesson code).
function diffAndLog() {
  const now = progressMarks(S);
  if (lastSeen) {
    for (const a of now.ay) if (!lastSeen.ay.includes(a)) logActivity('ayah_done', { ayah: a, surah: +a.slice(0, 3), stars: (S.stars || {})[a] || 0 });
    for (const n of now.solved) if (!lastSeen.solved.includes(n)) logActivity('surah_done', { surah: +n, name: BY[n] && BY[n].name });
    for (const b of now.trophies) if (!lastSeen.trophies.includes(b)) logActivity('boss_done', { boss: b, mode: 'solo' });
    for (const n in now.reviews) if ((now.reviews[n] || 0) > (lastSeen.reviews[n] || 0)) logActivity('review_done', { surah: +n });
  }
  lastSeen = now;
}

export function publicSnapshot() {
  return {
    v: 1,
    house: S.house || 0,
    houseName: (HOUSE_TIERS[S.house || 0] || {}).name || '',
    avatar: S.avatar || 0,
    plots: (S.plots || []).map(p => p ? { no: p.no, days: p.days || 0, watered: !!p.watered } : null),
    solved: Object.keys(S.solved || {}).filter(k => S.solved[k]).map(Number),
    trophies: Object.keys(S.trophies || {}).filter(k => S.trophies[k]),
    vh: S.vh || {},
    slv: S.slv || {},
    day: S.day || 1,
  };
}

async function push() {
  if (!meta.uid || !session.user) return;
  if (meta.busy) { meta.again = true; return; }
  meta.busy = true;
  try {
    const c = await sb();
    const state = JSON.parse(JSON.stringify(S));
    const next = meta.version + 1;
    let ok = false;
    if (meta.version === 0) {
      const { error } = await c.from('game_saves').insert({ profile_id: meta.uid, state, version: next });
      ok = !error;
      if (error && error.code !== '23505') throw error; // 23505 = row exists → treat as conflict
    } else {
      const { data, error } = await c.from('game_saves').update({ state, version: next, updated_at: new Date().toISOString() })
        .eq('profile_id', meta.uid).eq('version', meta.version).select('version');
      if (error) throw error;
      ok = data && data.length === 1;
    }
    if (ok) {
      meta.version = next; meta.dirty = false; writeMeta();
      const snap = publicSnapshot();
      await c.from('farm_public').upsert({
        profile_id: meta.uid, snapshot: snap, level: levelOf(S.xp || 0),
        surahs_done: snap.solved.length, updated_at: new Date().toISOString(),
      });
    } else {
      // someone else (another device) wrote a newer version
      const { data: row } = await c.from('game_saves').select('state, version').eq('profile_id', meta.uid).maybeSingle();
      if (row && row.version > meta.version) {
        meta.version = row.version; meta.dirty = false; writeMeta();
        loadState(row.state); lastSeen = progressMarks(S);
        try { localStorage.setItem(keyFor(meta.uid), JSON.stringify(S)); } catch (e) {}
        toast('Progres dari perangkat lain dipakai (lebih baru).');
        onRemoteReplace && onRemoteReplace();
      }
    }
  } catch (e) {
    // offline or error: stay dirty, retry on next save
    meta.dirty = true; writeMeta();
  } finally {
    meta.busy = false;
    if (meta.again) { meta.again = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(meta.timer);
  meta.timer = setTimeout(push, SAVE_DEBOUNCE_MS);
}
let lastJSON = '';
function onSave() {
  const j = JSON.stringify(S);
  if (j === lastJSON) return; // the 10 s autosave with no change is not a new version
  lastJSON = j;
  meta.dirty = true; writeMeta();
  diffAndLog();
  schedule();
}

let onRemoteReplace = null;
export function flushNow() { if (meta.dirty) { clearTimeout(meta.timer); push(); } }

/**
 * Load the signed-in child's save. Returns { hadCloud, legacy } where legacy is the classic
 * device save (kebun-makna-v3) when the cloud save is empty, so the caller can offer an import.
 */
export async function startCloud(uid, { onReplace } = {}) {
  meta.uid = uid; onRemoteReplace = onReplace || null;
  setSaveKey(keyFor(uid));
  const local = readLocal(uid);
  let row = null, offline = false;
  try {
    const c = await sb();
    const { data, error } = await c.from('game_saves').select('state, version').eq('profile_id', uid).maybeSingle();
    if (error) throw error;
    row = data;
  } catch (e) { offline = true; }

  let hadCloud = !!(row && row.state && row.state.name);
  if (row && (!local.st || row.version > local.version || (row.version === local.version && !local.dirty))) {
    if (local.dirty && row.version > local.version) toast('Progres dari perangkat lain dipakai (lebih baru).');
    loadState(row.state); meta.version = row.version; meta.dirty = false;
  } else if (local.st) {
    loadState(local.st); meta.version = row ? row.version : local.version; meta.dirty = local.dirty || (!offline && !row);
  } else {
    loadState({}); meta.version = row ? row.version : 0;
  }
  if (offline && local.st) hadCloud = true; // don't offer import while offline with a cache
  writeMeta();
  lastSeen = progressMarks(S);
  lastJSON = JSON.stringify(S);
  setSaveHook(onSave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  window.addEventListener('pagehide', flushNow);
  if (meta.dirty && !offline) schedule();

  let legacy = null;
  if (!hadCloud && !local.st) {
    for (const k of [GUEST_KEY, KEY]) { try { const r = JSON.parse(localStorage.getItem(k) || 'null'); if (r && r.name) { legacy = r; break; } } catch (e) {} }
  }
  return { hadCloud, legacy, offline };
}

export function importLegacy(legacy) {
  loadState(legacy);
  lastSeen = progressMarks(S); // imported progress is not "new" activity
  save();
  logActivity('import_device_progress', { ayat: Object.keys(S.ay || {}).length, surahs: Object.keys(S.solved || {}).length });
}
