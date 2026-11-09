// recite.js — on-device recitation recognition (Whisper, transformers.js) and the "Sekarang kamu yang baca" gate.
// Model: tarteel-ai whisper-base-ar-quran (ONNX). Profiles and session options come from tes-whisper.html.
import { $, esc, toast } from './ui.js';
import { S, save } from './state.js';
import { sfx, voice, play, stopAudio } from './audio.js';
import { AA } from './data.js';
import { RECITE, TRANSFORMERS_ESM, FLAGS } from './config.js';
import { sb, session, logActivity } from './api.js';
import { hooks } from './hooks.js';

export const PROFILES = [
  { id: 'q4', label: 'Kecil (q4) · sekitar 140 MB · disarankan', size: '≈140 MB', dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' }, device: 'wasm' },
  { id: 'mix', label: 'Kualitas (encoder penuh + decoder q4) · sekitar 205 MB', size: '≈205 MB', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, device: 'wasm' },
];
const SO = { graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false };
const LS_PROFILE = 'kebun-makna-recite-profile', LS_READY = 'kebun-makna-recite-ready';
const CACHE = 'transformers-cache';

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
export const currentProfile = () => PROFILES.find(p => p.id === lsGet(LS_PROFILE)) || PROFILES[0];
export const isReady = () => lsGet(LS_READY) === currentProfile().id;

// ---------------- text matching (from tes-whisper.html: word alignment without tajwid) ----------------
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g;
export function norm(s) {
  return String(s).replace(MARKS, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ئ/g, 'ي').replace(/ؤ/g, 'و').replace(/ة/g, 'ه').replace(/ء/g, '')
    .replace(/[^ء-ي\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[n];
}
const sim = (a, b) => (!a || !b) ? 0 : 1 - lev(a, b) / Math.max(a.length, b.length);
function grade(e, h) {
  const d = lev(e, h), L = e.length;
  if (d === 0 || (L >= 4 && d === 1) || (L >= 7 && d === 2)) return 'ok';
  if (d === 1 || (L >= 5 && sim(e, h) >= 0.6)) return 'near';
  return 'bad';
}
/** Align expected ayah words with the transcript (in order). Returns per-word status and a score 0..1. */
export function check(expected, heard) {
  const E = expected.map(norm), R = norm(heard).split(' ').filter(Boolean);
  const n = E.length, m = R.length, NEG = -1e9;
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(NEG)), B = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  D[0][0] = 0;
  const upd = (i, j, v, bk) => { if (v > D[i][j]) { D[i][j] = v; B[i][j] = bk; } };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const v = D[i][j]; if (v === NEG) continue;
    if (i < n) upd(i + 1, j, v - 0.35, { t: 'miss', i, j });
    if (j < m) upd(i, j + 1, v - 0.15, { t: 'extra', i, j });
    if (i < n && j < m) { const s = sim(E[i], R[j]); upd(i + 1, j + 1, v + s - 0.5, { t: 'm', i, j, s, h: R[j] }); }
    if (i < n && j + 1 < m) { const h = R[j] + R[j + 1]; const s = sim(E[i], h); upd(i + 1, j + 2, v + s - 0.55, { t: 'm', i, j, s, h: R[j] + ' ' + R[j + 1] }); }
    if (i + 1 < n && j < m) { const s = sim(E[i] + E[i + 1], R[j]); if (s >= 0.8) upd(i + 2, j + 1, v + 2 * s - 1.3, { t: 'm2', i, j, s, h: R[j] }); }
  }
  const res = expected.map((w, i) => ({ i, word: w, heard: '', st: 'miss' }));
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = B[i][j]; if (!b) break;
    if (b.t === 'm' || b.t === 'm2') {
      const st = grade(b.t === 'm2' ? E[b.i] + E[b.i + 1] : E[b.i], b.h.replace(/ /g, ''));
      res[b.i] = { i: b.i, word: expected[b.i], heard: b.h, st };
      if (b.t === 'm2') res[b.i + 1] = { i: b.i + 1, word: expected[b.i + 1], heard: b.h, st };
    }
    i = b.i; j = b.j;
  }
  const ok = res.filter(r => r.st === 'ok').length, near = res.filter(r => r.st === 'near').length;
  return { res, score: n ? (ok + 0.5 * near) / n : 0, ok, near };
}

// ---------------- model ----------------
let asr = null, asrProfile = null, loadingP = null;
export async function loadModel(onProgress) {
  const p = currentProfile();
  if (asr && asrProfile === p.id) return asr;
  if (loadingP) return loadingP;
  loadingP = (async () => {
    const t0 = performance.now(); const files = {};
    const T = await import(TRANSFORMERS_ESM);
    T.env.allowLocalModels = false;
    if (T.env.backends && T.env.backends.onnx && T.env.backends.onnx.wasm) T.env.backends.onnx.wasm.numThreads = 1;
    const pipe = await T.pipeline('automatic-speech-recognition', RECITE.model, {
      dtype: p.dtype, device: p.device, session_options: SO,
      progress_callback: e => {
        if (e.status === 'progress' && e.file) {
          files[e.file] = { l: e.loaded, t: e.total };
          const L = Object.values(files).reduce((a, b) => a + b.l, 0), Tt = Object.values(files).reduce((a, b) => a + b.t, 0);
          onProgress && onProgress(L, Tt);
        } else if (e.status === 'ready') onProgress && onProgress(1, 1, 'ready');
      },
    });
    asr = pipe; asrProfile = p.id; lsSet(LS_READY, p.id);
    return { ms: performance.now() - t0 };
  })();
  try { const r = await loadingP; return r; } finally { loadingP = null; }
}
export async function cacheSize() {
  try {
    if (!('caches' in window)) return 0;
    const c = await caches.open(CACHE); let total = 0;
    for (const req of await c.keys()) {
      if (!req.url.includes('whisper')) continue;
      const r = await c.match(req); const len = +(r.headers.get('content-length') || 0);
      total += len || (await r.blob()).size;
    }
    return total;
  } catch (e) { return 0; }
}
export async function deleteModel() {
  asr = null; asrProfile = null; lsSet(LS_READY, null);
  try { await caches.delete(CACHE); } catch (e) {}
}

// ---------------- recording ----------------
async function toPCM(blob) {
  const buf = await blob.arrayBuffer(); const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
  const dec = await new Promise((ok, no) => ac.decodeAudioData(buf, ok, no)); ac.close && ac.close();
  const n = Math.max(1, Math.ceil(dec.duration * 16000)), off = new OfflineAudioContext(1, n, 16000);
  const src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start();
  const out = await off.startRendering(); return { pcm: out.getChannelData(0), dur: dec.duration };
}
function voicedSeconds(pcm) {
  const W = 1600; const rms = [];
  for (let i = 0; i + W <= pcm.length; i += W) { let s = 0; for (let j = 0; j < W; j++) { const v = pcm[i + j]; s += v * v; } rms.push(Math.sqrt(s / W)); }
  const sorted = [...rms].sort((a, b) => a - b); const floor = sorted[Math.floor(sorted.length * 0.2)] || 0; const thr = Math.max(0.012, floor * 3);
  return rms.filter(r => r > thr).length * 0.1;
}
/**
 * Record from the mic (must be called from a tap). Auto-stops after RECITE.silenceMs of silence once voice was heard,
 * or at RECITE.maxMs. Returns { pcm, dur } at 16 kHz mono. ui.onLevel(0..1), ui.stopper(fn) lets the caller stop early.
 */
export async function record(ui = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
  const srcNode = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 1024; srcNode.connect(an);
  const buf = new Float32Array(an.fftSize);
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', ''];
  const type = types.find(t => !t || (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)));
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined); const chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(res => mr.onstop = res);
  let heard = false, lastLoud = performance.now(); const t0 = performance.now(); let raf;
  const stop = () => { if (mr.state !== 'inactive') mr.stop(); };
  ui.stopper && ui.stopper(stop);
  const tick = () => {
    an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; const rms = Math.sqrt(s / buf.length);
    ui.onLevel && ui.onLevel(Math.min(1, rms * 12));
    const now = performance.now();
    if (rms > 0.02) { heard = true; lastLoud = now; }
    if ((heard && now - lastLoud > RECITE.silenceMs) || now - t0 > RECITE.maxMs || (!heard && now - t0 > 6000)) { stop(); return; }
    raf = requestAnimationFrame(tick);
  };
  mr.start(250); tick();
  await stopped; cancelAnimationFrame(raf);
  stream.getTracks().forEach(t => t.stop()); try { ac.close(); } catch (e) {}
  return toPCM(new Blob(chunks, { type: mr.mimeType || type }));
}

export async function transcribe(pcm) {
  if (!asr) await loadModel();
  let out;
  try { out = await asr(pcm, { language: 'arabic', task: 'transcribe', is_multilingual: true, chunk_length_s: 30 }); }
  catch (e1) { out = await asr(pcm, { chunk_length_s: 30 }); }
  return (out.text || '').trim();
}

// ---------------- parent override ----------------
/** Ask a grown-up to confirm. Signed-in child: parent override PIN (server). Guest: a grown-up question. */
export function askParent(reason) {
  return new Promise(resolve => {
    const guest = !session.user;
    const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    const ov = $(`<div class="celebrate askparent"><div class="frame" style="max-width:360px;width:100%">
      <b style="font-size:20px">🔐 Untuk Ayah/Ibu</b><p class="small" style="margin:6px 0 10px">${esc(reason)}</p>
      ${guest ? `<label class="field"><span>Berapa ${a} × ${b}?</span><input id="pp" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off"></label>`
        : `<label class="field"><span>PIN orang tua</span><input id="pp" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></label>`}
      <div class="row"><button class="btn green" id="ok">Konfirmasi</button><button class="btn ghost" id="no">Batal</button></div><p class="err" id="err"></p></div></div>`);
    const err = ov.querySelector('#err');
    const done = v => { ov.remove(); resolve(v); };
    ov.querySelector('#no').onclick = () => done(false);
    ov.querySelector('#ok').onclick = async () => {
      const v = ov.querySelector('#pp').value.trim();
      if (guest) { if (+v === a * b) done(true); else err.textContent = 'Belum tepat.'; return; }
      if (!/^[0-9]{4,6}$/.test(v)) { err.textContent = 'PIN 4–6 angka.'; return; }
      try {
        const c = await sb(); const { data, error } = await c.rpc('verify_parent_pin', { pin: v });
        if (error) throw error;
        if (data === 'ok') done(true);
        else if (data === 'locked') err.textContent = 'Terlalu banyak salah. Tunggu 10 menit.';
        else if (data === 'unset') err.textContent = 'PIN orang tua belum diatur. Atur dulu di Halaman Orang Tua.';
        else err.textContent = 'PIN salah.';
      } catch (e) { err.textContent = 'Tidak bisa mengecek PIN (cek internet).'; }
    };
    document.body.append(ov);
    setTimeout(() => { const i = ov.querySelector('#pp'); i && i.focus(); }, 50);
  });
}

// ---------------- the gate ----------------
function gate({ body, bar, s, a, review, next }) {
  S.recited = S.recited || {};
  // reviews of an ayah already recited don't need the gate again
  if (!FLAGS.recitationGate || (review && S.recited[a.a])) return next();
  [...bar.children].forEach(x => x.className = 'past');
  let fails = 0;
  const words = a.w.map(w => w.ar);
  const pass = (score, how) => {
    S.recited[a.a] = true; save();
    next();
  };
  const v = $(`<div class="frame"><h2>Sekarang kamu yang baca</h2>
    <p class="lead">Baca ayat ini dengan suaramu. Ketuk tombol mikrofon, baca, lalu diam sebentar.</p>
    <div class="ayahbig ar" lang="ar"></div>
    <div class="fb" aria-live="polite"></div>
    <div class="row" style="margin-top:10px"><button class="btn blue" id="hear">▶ Dengar dulu</button></div>
    <button class="btn green block" id="mic" style="margin-top:12px;font-size:22px">🎙️ Mulai baca</button>
    <div class="minibar" style="margin-top:8px;height:8px;background:#E8DDBF;border:2px solid var(--ink);border-radius:4px;overflow:hidden"><div id="lvl" style="height:100%;width:0;background:#7CD35E"></div></div>
    <div id="extra"></div></div>`);
  const box = v.querySelector('.ayahbig'), fb = v.querySelector('.fb'), mic = v.querySelector('#mic'), extra = v.querySelector('#extra');
  const paint = res => box.replaceChildren(...a.w.flatMap((w, i) => {
    const sp = $(`<span>${esc(w.ar)}</span>`);
    if (res) { const st = res[i].st; sp.style.borderRadius = '4px'; sp.style.padding = '0 3px'; sp.style.background = st === 'ok' ? '#BFF0B0' : st === 'near' ? '#FFE9A8' : '#F8D2C6'; }
    return i ? [document.createTextNode(' '), sp] : [sp];
  }));
  paint(null);
  v.querySelector('#hear').onclick = () => play(AA(a.a));
  const showParentBtn = () => {
    if (extra.querySelector('#par')) return;
    const b = $(`<button class="btn ghost block" id="par" style="margin-top:12px">🙋 Minta Ayah/Ibu dengar</button>`);
    b.onclick = async () => {
      stopAudio();
      if (await askParent(`${S.name || 'Anak'} sudah mencoba membaca ${s.name} ayat ${a.n}. Konfirmasi kalau Ayah/Ibu sudah mendengarnya membaca.`)) {
        logActivity('recitation_override', { ayah: a.a, fails });
        toast('Alhamdulillah, Ayah/Ibu sudah mendengar!'); pass(0, 'parent');
      }
    };
    extra.append(b);
  };
  const needModel = () => {
    mic.disabled = true;
    fb.className = 'fb'; fb.innerHTML = `Pengenal bacaan belum diunduh di perangkat ini. Minta Ayah/Ibu mengunduhnya (${esc(currentProfile().size)}, sekali saja, sebaiknya pakai Wi-Fi), atau minta Ayah/Ibu mendengarkanmu membaca.`;
    const d = $(`<button class="btn block" id="dl" style="margin-top:10px">⬇️ Ayah/Ibu: unduh pengenal bacaan</button>`);
    d.onclick = async () => {
      if (!(await askParent('Mengunduh pengenal bacaan (sekali saja). Lanjutkan?'))) return;
      d.disabled = true;
      try {
        const r = await loadModel((l, t, st) => { d.textContent = st === 'ready' ? 'Menyiapkan…' : `Mengunduh… ${t ? Math.round(100 * l / t) : 0}%`; });
        logActivity('model_download', { profile: currentProfile().id, ms: Math.round(r.ms || 0) });
        d.remove(); mic.disabled = false; fb.textContent = 'Siap! Ketuk mikrofon dan baca.';
      } catch (e) { d.disabled = false; d.textContent = '⬇️ Coba unduh lagi'; fb.textContent = 'Gagal mengunduh: ' + String(e.message || e).slice(0, 120); }
    };
    extra.prepend(d);
    showParentBtn();
  };
  mic.onclick = async () => {
    stopAudio();
    let stopFn = null;
    mic.textContent = '⏹️ Selesai membaca'; fb.className = 'fb'; fb.textContent = 'Mendengarkan… silakan baca.';
    mic.onclick2 = mic.onclick; mic.onclick = () => stopFn && stopFn();
    const restore = () => { mic.textContent = '🎙️ Baca lagi'; mic.disabled = false; mic.onclick = mic.onclick2; };
    let rec;
    try { rec = await record({ onLevel: x => { v.querySelector('#lvl').style.width = Math.round(x * 100) + '%'; }, stopper: f => stopFn = f }); }
    catch (e) {
      restore();
      fb.className = 'fb bad'; fb.textContent = e && e.name === 'NotAllowedError' ? 'Mikrofon belum diizinkan. Izinkan mikrofon untuk halaman ini di pengaturan browser, lalu coba lagi.' : 'Mikrofon tidak bisa dipakai: ' + (e.message || e);
      showParentBtn(); return;
    }
    v.querySelector('#lvl').style.width = '0';
    if (voicedSeconds(rec.pcm) < 0.6) { restore(); fb.className = 'fb bad'; fb.textContent = 'Tidak ada suara yang terdengar. Dekatkan HP ke mulut dan coba lagi.'; return; }
    mic.disabled = true; mic.textContent = '⏳ Memeriksa bacaan…'; fb.textContent = 'Sebentar, sedang mendengarkan bacaanmu…';
    const t0 = performance.now(); let text = '';
    try { text = await transcribe(rec.pcm); }
    catch (e) { restore(); fb.className = 'fb bad'; fb.textContent = 'Gagal memeriksa: ' + String(e.message || e).slice(0, 120); showParentBtn(); return; }
    const ms = Math.round(performance.now() - t0);
    const r = check(words, text);
    paint(r.res);
    const detail = { ayah: a.a, score: +r.score.toFixed(2), ms, rec_s: +rec.dur.toFixed(1), profile: currentProfile().id, heard: text.slice(0, 120) };
    if (r.score >= RECITE.passRatio) {
      logActivity('recitation_pass', detail);
      sfx.fanfare(); voice('winner', 100);
      fb.className = 'fb good'; fb.textContent = `MasyaAllah! Bacaanmu terdengar jelas (${r.ok + r.near}/${words.length} kata).`;
      mic.textContent = 'Lanjut ▸'; mic.disabled = false; mic.onclick = () => pass(r.score, 'asr');
    } else {
      fails++; logActivity('recitation_fail', detail);
      sfx.bad(); restore();
      fb.className = 'fb bad'; fb.textContent = 'Hampir! Dengar sekali lagi, yuk.';
      setTimeout(() => play(AA(a.a)), 600);
      if (fails >= RECITE.failsBeforeParent) showParentBtn();
    }
  };
  body.replaceChildren(v);
  if (!isReady()) needModel();
}
hooks.afterAyah = gate;

// ---------------- settings box (⚙ → Pengaturan) ----------------
export function settingsBox() {
  const b = $(`<div class="box"><h3>🎙️ Pengenal bacaan</h3>
    <p class="small" style="margin:0 0 8px">Setelah belajar arti ayat, anak membaca ayatnya dengan suara sendiri. Pengenal bacaan berjalan di perangkat ini (tanpa mengirim suara ke internet). Perlu unduhan sekali, lalu bisa dipakai tanpa internet. Sebaiknya pakai Wi-Fi.</p>
    <label class="field"><span>Versi</span><select id="rp">${PROFILES.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></label>
    <div id="rs" class="small" style="margin:6px 0"></div>
    <div class="minibar" style="height:10px;background:#E8DDBF;border:2px solid var(--ink);border-radius:4px;overflow:hidden;margin:6px 0"><div id="rbar" style="height:100%;width:0;background:#7CD35E"></div></div>
    <div class="row"><button class="btn" id="rdl">⬇️ Unduh model</button><button class="btn ghost" id="rdel">Hapus model</button></div></div>`);
  const sel = b.querySelector('#rp'), st = b.querySelector('#rs'), bar = b.querySelector('#rbar'), dl = b.querySelector('#rdl'), del = b.querySelector('#rdel');
  sel.value = currentProfile().id;
  const refresh = async () => {
    if (isReady()) { const sz = await cacheSize(); st.innerHTML = `<b class="ok">Siap ✓</b> · ${currentProfile().id === 'q4' ? 'versi kecil' : 'versi kualitas'} · memakai ${(sz / 1048576).toFixed(0)} MB`; bar.style.width = '100%'; dl.hidden = true; del.hidden = false; }
    else { st.textContent = `Belum diunduh (${currentProfile().size}).`; bar.style.width = '0'; dl.hidden = false; del.hidden = true; }
  };
  sel.onchange = () => { lsSet(LS_PROFILE, sel.value); refresh(); };
  dl.onclick = async () => {
    dl.disabled = true; sel.disabled = true;
    try {
      const r = await loadModel((l, t, s2) => { bar.style.width = (t ? 100 * l / t : 0) + '%'; st.textContent = s2 === 'ready' ? 'Menyiapkan model…' : `Mengunduh… ${(l / 1048576).toFixed(0)} / ${(t / 1048576).toFixed(0)} MB`; });
      logActivity('model_download', { profile: currentProfile().id, ms: Math.round(r.ms || 0) });
    } catch (e) { st.textContent = 'Gagal: ' + String(e.message || e).slice(0, 160); }
    dl.disabled = false; sel.disabled = false; refresh();
  };
  del.onclick = async () => { await deleteModel(); refresh(); };
  refresh();
  return b;
}
