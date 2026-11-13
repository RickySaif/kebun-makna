// recite.js — on-device recitation recognition (Whisper, transformers.js) and the reading-practice pages in each lesson.
// Model: tarteel-ai whisper-base-ar-quran (ONNX). Profiles and session options come from tes-whisper.html.
import { $, esc, root } from './ui.js';
import { S, save } from './state.js';
import { sfx, play, stopAudio } from './audio.js';
import { AA, AW, USTAZ } from './data.js';
import { portraitURL } from './art.js';
const portrait = look => portraitURL(look);
import { check, checkWord, weight } from './match.js';
import { RECITE, TRANSFORMERS_ESM, FLAGS } from './config.js';
import { logActivity } from './api.js';
import { hooks } from './hooks.js';

// One model for everyone. The model files come from RECITE (config.js).
//
// iPhone safety (2026-11-13, Ricky's iPhone 13 reloaded the page 3× after the download):
// building the recognizer from the files briefly needs several times their size in memory (~0.6–1 GB measured for the
// base model in Chrome), and iOS kills a Safari tab that goes over its limit; Safari then reloads the page. Before, the
// files were only written to storage at the very end, so the crash lost them and the next load started from zero, and
// since the load ran at boot, every reload crashed again. Now:
//   1. DOWNLOAD (prefetchModel, at boot): each file is streamed straight into Cache Storage, chunk by chunk, under the
//      exact key transformers.js looks up. Low memory, and every finished file survives a crash.
//   2. LOAD (loadModel): only when a reading page needs it. A marker is written before and removed after. If the page
//      opens and finds the marker, the last load crashed: we never load again by ourselves (no reload loop); the
//      reading pages say so and offer "Coba lagi"; Lanjut always works.
const SO = { graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false };
const LS_READY = 'kebun-makna-recite-ready', LS_OLD_PROFILE = 'kebun-makna-recite-profile';
const LS_LOADING = 'kebun-makna-recite-loading', LS_CRASH = 'kebun-makna-recite-crash';
const CACHE = 'transformers-cache';
// The model files are served from this site (beta/models/<model>/…), not from Hugging Face: see models/README.md.
const HOST = new URL('../models/', import.meta.url).href;
function hostModels(T) { T.env.allowLocalModels = false; T.env.allowRemoteModels = true; T.env.remoteHost = HOST; T.env.remotePathTemplate = '{model}/'; }
const SUFFIX = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4', bnb4: '_bnb4' };
const FILES = () => ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json',
  `onnx/encoder_model${SUFFIX[RECITE.dtype.encoder_model]}.onnx`, `onnx/decoder_model_merged${SUFFIX[RECITE.dtype.decoder_model_merged]}.onnx`];
const fileURL = f => `${HOST}${RECITE.model}/${f}`; // the exact key transformers.js uses for its cache
export const MODEL_SIZE = RECITE.size;

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
export const isReady = () => !!asr;

// A build that started but never finished = the tab was killed while building (see above).
// The marker must be ON DISK before the build starts: Safari writes localStorage to disk a little later, in the
// background, and the build blocks the page right away, so on Ricky's iPhone the localStorage marker never landed and
// the loop went on. So the marker goes into Cache Storage (the write is done when the promise resolves) AND
// localStorage, and the build waits for it.
const FLAG_CACHE = 'kebun-makna-flags', FLAG_URL = new URL('__km/recite-building', location.href).href;
async function setMark(on) {
  lsSet(LS_LOADING, on ? String(Date.now()) : null);
  try { const c = await caches.open(FLAG_CACHE); if (on) await c.put(FLAG_URL, new Response(String(Date.now()))); else await c.delete(FLAG_URL); } catch (e) {}
}
const crashCheck = (async () => {
  let hit = !!lsGet(LS_LOADING);
  try { const c = await caches.open(FLAG_CACHE); if (await c.match(FLAG_URL)) { hit = true; await c.delete(FLAG_URL); } } catch (e) {}
  if (hit) { lsSet(LS_LOADING, null); lsSet(LS_CRASH, String((+lsGet(LS_CRASH) || 0) + 1)); }
})();
const crashes = () => +lsGet(LS_CRASH) || 0;

// status: 'idle' | 'downloading' | 'downloaded' | 'loading' | 'ready' | 'blocked' (last load crashed) | 'error'
export const model = { status: 'idle', loaded: 0, total: 0, error: '', ms: 0, crashes: crashes() };
const listeners = new Set();
const emit = () => listeners.forEach(f => { try { f(model); } catch (e) {} });
/** Subscribe to model progress; calls fn now and on every change. Returns an unsubscribe function. */
export function onModel(fn) { listeners.add(fn); fn(model); return () => listeners.delete(fn); }

// ---- 1. download into Cache Storage, streamed ----
let prefetchP = null;
export function prefetchModel() {
  if (prefetchP) return prefetchP;
  prefetchP = (async () => {
    if (!('caches' in window)) return; // transformers.js will download in loadModel instead
    if (lsGet(LS_OLD_PROFILE)) { try { await caches.delete(CACHE); } catch (e) {} lsSet(LS_OLD_PROFILE, null); }
    const cache = await caches.open(CACHE);
    // drop files of any other model (e.g. the 142 MB Hugging Face download from before) to free the phone's storage
    for (const req of await cache.keys()) if (!req.url.startsWith(HOST + RECITE.model + '/')) await cache.delete(req);
    const missing = [];
    for (const f of FILES()) if (!(await cache.match(fileURL(f)))) missing.push(f);
    if (!missing.length) { if (model.status === 'idle') { model.status = 'downloaded'; emit(); } return; }
    Object.assign(model, { status: 'downloading', loaded: 0, total: RECITE.bytes || 0, error: '' }); emit();
    let done = 0;
    for (const f of missing) {
      const url = fileURL(f), res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${f}`);
      let seen = 0;
      const counted = res.body.pipeThrough(new TransformStream({ transform(chunk, c) { seen += chunk.byteLength; model.loaded = done + seen; if (model.loaded > model.total) model.total = model.loaded; emit(); c.enqueue(chunk); } }));
      try { await cache.put(url, new Response(counted, { headers: res.headers })); }
      catch (e) { await cache.add(url); } // older engines without streamed put: the browser streams it itself
      done += seen;
    }
    if (model.status === 'downloading') { model.status = 'downloaded'; emit(); }
  })().catch(e => { prefetchP = null; if (model.status === 'downloading') { Object.assign(model, { status: 'error', error: String(e && e.message || e).slice(0, 160) }); emit(); } throw e; });
  return prefetchP;
}

// ---- 2. build the recognizer (memory-heavy; guarded) ----
let asr = null, loadingP = null;
export function loadModel() {
  if (asr) return Promise.resolve(asr);
  if (loadingP) return loadingP;
  loadingP = (async () => {
    const t0 = performance.now();
    await prefetchModel().catch(() => {}); // files first (transformers.js downloads whatever is still missing)
    Object.assign(model, { status: 'loading', error: '' }); emit();
    const T = await import(TRANSFORMERS_ESM);
    if (T.env.backends && T.env.backends.onnx && T.env.backends.onnx.wasm) T.env.backends.onnx.wasm.numThreads = 1;
    hostModels(T);
    await setMark(true); await new Promise(r => setTimeout(r, 500)); // let Safari put the marker on disk first
    let pipe;
    try { pipe = await T.pipeline('automatic-speech-recognition', RECITE.model, { dtype: RECITE.dtype, device: 'wasm', session_options: SO }); }
    finally { await setMark(false); }
    asr = pipe; model.ms = Math.round(performance.now() - t0);
    lsSet(LS_CRASH, null); model.crashes = 0;
    const first = lsGet(LS_READY) !== RECITE.id; lsSet(LS_READY, RECITE.id);
    if (first) logActivity('model_download', { profile: RECITE.id, ms: model.ms });
    Object.assign(model, { status: 'ready', loaded: model.total || 1, total: model.total || 1 }); emit();
    return asr;
  })().catch(e => {
    Object.assign(model, { status: 'error', error: String(e && e.message || e).slice(0, 160) }); emit();
    loadingP = null; throw e;
  });
  return loadingP;
}
/** At boot: download only (safe). */
export function preloadModel() {
  if (!FLAGS.recitationGate) return;
  prefetchModel().catch(() => setTimeout(() => prefetchModel().catch(() => {}), 15000));
}
/** On a reading page: build the recognizer, unless the last attempt crashed this tab (then wait for "Coba lagi"). */
export async function ensureModel(manual = false) {
  if (!FLAGS.recitationGate || asr) return;
  await crashCheck;
  if (!manual && crashes() > 0) { // finish any missing download (safe), then wait for the player's "Coba lagi"
    model.crashes = crashes();
    const block = () => { if (!asr && !loadingP) { model.status = 'blocked'; emit(); } };
    prefetchModel().then(block, block); return;
  }
  loadModel().catch(() => {});
}
export const modelPct = () => model.status === 'ready' || model.status === 'downloaded' ? 100 : model.total ? Math.min(99, Math.floor(100 * model.loaded / model.total)) : 0;

const mb = n => (n / 1048576).toFixed(0);
/** One line for the child/parent about where the recognizer is. */
export function statusText(m) {
  switch (m.status) {
    case 'downloading': return m.total ? `Mengunduh pengenal bacaan… ${mb(m.loaded)} / ${mb(m.total)} MB (sekali saja).` : 'Mengunduh pengenal bacaan…';
    case 'idle': case 'downloaded': case 'loading': return 'Menyiapkan pengenal bacaan… (beberapa detik)';
    case 'ready': return 'Pengenal bacaan siap.';
    case 'blocked': return 'Pengenal bacaan berhenti karena memori HP penuh. Tutup aplikasi lain, lalu coba lagi.';
    default: return 'Pengenal bacaan belum bisa diunduh. Sambungkan ke internet (sebaiknya Wi-Fi), lalu coba lagi.';
  }
}

/**
 * Start-up screen (Ricky: "make sure it has been downloaded before it reaches the practice page"): shown when the game
 * opens, before the farm. Downloads the files (progress bar), then builds the recognizer. Resolves when ready. If it
 * can't (offline, or the last build crashed this tab), the player chooses "Coba lagi" or "Main tanpa latihan baca";
 * nothing ever loops.
 */
export function prepareScreen() {
  return new Promise(resolve => {
    if (!FLAGS.recitationGate || asr) return resolve();
    const v = $(`<div class="prep"><div class="title"><h1>Kebun Makna</h1><p>Sebentar, ya…</p></div>
      <div class="frame" style="text-align:center"><div style="font-size:44px;line-height:1">🎙️</div>
        <h2 style="margin:6px 0 4px">Menyiapkan pengenal bacaan</h2>
        <p class="small" style="margin:0 0 10px">Supaya nanti bisa berlatih membaca ayat dengan suaramu. Unduhan hanya sekali (${MODEL_SIZE}); sebaiknya pakai Wi-Fi.</p>
        <div class="minibar" style="height:14px;background:#E8DDBF;border:3px solid var(--ink);border-radius:6px;overflow:hidden"><div class="bar" style="height:100%;width:0;background:#7CD35E;transition:width .2s"></div></div>
        <p class="st" aria-live="polite" style="margin:8px 0 0"></p><div class="act"></div></div></div>`);
    const bar = v.querySelector('.bar'), st = v.querySelector('.st'), act = v.querySelector('.act');
    let finished = false;
    const finish = () => { if (finished) return; finished = true; unsub(); resolve(); };
    const unsub = onModel(m => {
      if (finished) return;
      bar.style.width = (m.status === 'loading' || m.status === 'downloaded' ? 100 : modelPct()) + '%';
      st.textContent = statusText(m);
      if (m.status === 'ready') { bar.style.width = '100%'; setTimeout(finish, 300); return; }
      const stuck = m.status === 'error' || m.status === 'blocked';
      if (stuck && !act.firstChild) {
        const retry = $(`<button class="btn green block" style="margin-top:12px">🔄 Coba lagi</button>`);
        const skip = $(`<button class="btn ghost block" style="margin-top:8px">Main tanpa latihan baca</button>`);
        retry.onclick = () => { act.replaceChildren(); ensureModel(true); };
        skip.onclick = finish;
        act.append(retry, skip);
      } else if (!stuck) act.replaceChildren();
    });
    root.replaceChildren(v);
    ensureModel(); // after a crash this does not load by itself: the player sees "Coba lagi"
  });
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
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
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
  await loadModel();
  // No language/task options: this fine-tuned model's generation config has no language table (passing language
  // throws "Cannot read properties of null (reading '<|ar|>')"), and it only knows Qur'anic Arabic anyway.
  const out = await asr(pcm, { chunk_length_s: 30 });
  return (out.text || '').trim();
}

// ---------------- reading practice (never a requirement) ----------------
// After Kenali: each word. After Cocokkan: parts of 2–3 words. After Susun: the whole ayah.
// Every try shows "Ketepatan" (share of meaning letters read right) and the words coloured; "Lanjut" always works.
const COL = { ok: '#BFF0B0', bad: '#F8B9A6', miss: '#E6E0D2' };

/** Split an ayah's words into parts of 2–3 words (one part when the ayah has 3 words or fewer). */
export function parts(words) {
  const n = words.length, k = Math.ceil(n / 3); if (k <= 1) return [words];
  const out = []; let i = 0;
  for (let p = 0; p < k; p++) { const size = Math.round((n - i) / (k - p)); out.push(words.slice(i, i + size)); i += size; }
  return out;
}
const verdict = acc => acc >= 0.9 ? 'MasyaAllah, jelas sekali!' : acc >= 0.7 ? 'Bagus! Perhatikan kata yang merah, lalu coba lagi kalau mau.'
  : acc > 0 ? 'Ayo coba lagi pelan-pelan. Dengarkan dulu kata yang merah.' : 'Belum terdengar. Dengarkan dulu, lalu baca pelan-pelan.';

/**
 * v4 (Ricky): tell the child what Pak Ustaz heard for each red word, and which letter to fix.
 * Up to 3 words: the word as written → what the model heard (with its harakat), then the letters that differ.
 */
function showHeard(el, res) {
  const wrong = res.filter(x => x.st !== 'ok').slice(0, 3);
  if (!wrong.length) { el.hidden = true; el.replaceChildren(); return; }
  const L = c => `<b class="ar" lang="ar">${esc(c)}</b>`;
  const rows = wrong.map(x => {
    if (x.st === 'miss' || !x.heard) return `<div class="hrow"><span class="ar w" lang="ar">${esc(x.word)}</span><span class="tag">belum terdengar</span></div>`;
    const tips = (x.ops || []).slice(0, 3).map(o => o.op === 'sub' ? `<span class="tip">${L(o.e)} terdengar ${L(o.h)}</span>`
      : o.op === 'del' ? `<span class="tip">${L(o.e)} tidak terdengar</span>` : `<span class="tip">ada ${L(o.h)} tambahan</span>`).join('');
    return `<div class="hrow"><span class="ar w" lang="ar">${esc(x.word)}</span><span class="arrow">←</span><span class="ar w heardw" lang="ar">${esc(x.heard)}</span>${tips ? `<div class="tips">${tips}</div>` : ''}</div>`;
  }).join('');
  el.innerHTML = `<div class="hhead">Yang Ustaz dengar:</div>${rows}`;
  el.hidden = false;
}

/**
 * Show one practice page per item (an item = an array of word objects from a.w) and call next() after the last one.
 * kind: 'kata' | 'bagian' | 'ayat' (used in the title and the activity log).
 */
function practice({ body, s, a, items, kind, next }) {
  let idx = 0, unsub = () => {};
  const done = () => { unsub(); stopAudio(); next(); };
  const show = () => {
    unsub(); stopAudio();
    const words = items[idx], isLast = idx === items.length - 1;
    const title = kind === 'kata' ? 'Ayo baca kata ini' : kind === 'bagian' ? 'Ayo baca bagian ini' : 'Sekarang baca satu ayat';
    const count = items.length > 1 ? `<p class="small" style="margin:0 0 6px">${kind === 'kata' ? 'Kata' : 'Bagian'} ${idx + 1} dari ${items.length}</p>` : '';
    const v = $(`<div class="frame practice"><h2>${title}</h2>${count}
      <p class="lead">Dengarkan, lalu ketuk mikrofon dan baca dengan suaramu. Ini latihan: kamu boleh lanjut kapan saja.</p>
      <div class="ayahbig ar" lang="ar"></div>
      ${kind === 'kata' ? `<p class="small" style="text-align:center;margin:4px 0 0">${esc(words[0].emo || '')} ${esc(words[0].id)}</p>` : ''}
      <div class="acc" style="text-align:center;font-weight:700;font-size:20px;min-height:28px;margin-top:6px"></div>
      <div class="fb" aria-live="polite"></div>
      <div class="row" style="margin-top:10px"><button class="btn blue" id="hear">▶ Dengar</button><button class="btn green" id="mic" style="flex:1">🎙️ Baca</button></div>
      <div class="minibar" style="margin-top:8px;height:8px;background:#E8DDBF;border:2px solid var(--ink);border-radius:4px;overflow:hidden"><div id="lvl" style="height:100%;width:0;background:#7CD35E"></div></div>
      <button class="btn block" id="next" style="margin-top:14px">${isLast ? 'Lanjut ▸' : (kind === 'kata' ? 'Kata berikutnya ▸' : 'Bagian berikutnya ▸')}</button></div>`);
    // v4 (Ricky): while listening only "Selesai" works; while checking, every button is off and Pak Ustaz thinks.
    const think = $(`<div class="ustaz-think" hidden aria-live="polite"><img class="portrait" alt="Pak Ustaz" src="${portrait(USTAZ.look)}">
      <div><b>Pak Ustaz</b><p>Sebentar, Ustaz sedang mendengarkan bacaanmu<span class="dots"><i>.</i><i>.</i><i>.</i></span></p></div></div>`);
    function lock(mode) {
      const off = !!mode, panelEl = v.closest('.panel');
      v.querySelectorAll('#hear, #next, #retry').forEach(b => b.disabled = off);
      if (panelEl) panelEl.querySelector('.ptop button').disabled = off;
      v.querySelector('.ayahbig').classList.toggle('locked', off);
      v.classList.toggle('thinking', mode === 'think');
      think.hidden = mode !== 'think';
      if (mode === 'think') think.querySelector('img').src = portrait(USTAZ.look); // follows "tanpa mata"
    }
    const box = v.querySelector('.ayahbig'), fb = v.querySelector('.fb'), mic = v.querySelector('#mic'), lvl = v.querySelector('#lvl'), accEl = v.querySelector('.acc');
    const heardEl = $(`<div class="heard" hidden></div>`); accEl.after(heardEl);
    v.querySelector('.fb').before(think);
    let busy = false, stopFn = null, tries = 0;
    const paint = res => box.replaceChildren(...words.flatMap((w, i) => {
      const sp = $(`<span role="button" tabindex="0">${esc(w.ar)}</span>`);
      sp.style.cursor = 'pointer';
      sp.onclick = () => { stopAudio(); play(AW(w.a)); };
      if (res) { const st = res[i].st; sp.style.borderRadius = '4px'; sp.style.padding = '0 3px'; sp.style.background = COL[st]; if (st !== 'ok') sp.style.textDecoration = 'underline wavy #C0392B'; }
      return i ? [document.createTextNode(' '), sp] : [sp];
    }));
    paint(null);
    const hear = async () => { stopAudio(); if (kind === 'ayat') return play(AA(a.a)); for (const w of words) { if (!v.isConnected) return; await play(AW(w.a)); } };
    v.querySelector('#hear').onclick = hear;
    v.querySelector('#next').onclick = () => { if (stopFn) stopFn(); idx++; if (idx < items.length) show(); else done(); };
    unsub = onModel(m => {
      if (busy) return;
      if (m.status === 'ready') { if (mic.disabled) { mic.disabled = false; if (!tries) { fb.className = 'fb'; fb.textContent = ''; } } v.querySelector('#retry')?.remove(); return; }
      mic.disabled = true;
      if (m.status === 'error' || m.status === 'blocked') {
        fb.className = 'fb bad'; fb.textContent = statusText(m) + ' Kamu tetap bisa lanjut.';
        if (!v.querySelector('#retry')) { const r = $(`<button class="btn ghost block" id="retry" style="margin-top:8px">🔄 Coba lagi</button>`); r.onclick = () => { r.remove(); ensureModel(true); }; fb.after(r); }
      } else { fb.className = 'fb'; fb.textContent = statusText(m) + ' Sambil menunggu, dengarkan dulu.'; }
    });
    ensureModel();
    mic.onclick = async () => {
      if (busy) { stopFn && stopFn(); return; }
      stopAudio(); busy = true; stopFn = null;
      mic.textContent = '⏹️ Selesai'; fb.className = 'fb'; fb.textContent = 'Mendengarkan… silakan baca.'; accEl.textContent = ''; heardEl.hidden = true; heardEl.replaceChildren();
      lock('listen');
      const restore = () => { busy = false; stopFn = null; mic.textContent = '🎙️ Baca lagi'; mic.disabled = false; lock(null); };
      let rec;
      try { rec = await record({ onLevel: x => { lvl.style.width = Math.round(x * 100) + '%'; }, stopper: f => stopFn = f }); }
      catch (e) {
        restore();
        fb.className = 'fb bad'; fb.textContent = e && e.name === 'NotAllowedError' ? 'Mikrofon belum diizinkan. Izinkan mikrofon untuk halaman ini di pengaturan browser. Kamu tetap bisa lanjut.' : 'Mikrofon tidak bisa dipakai: ' + (e.message || e);
        return;
      }
      lvl.style.width = '0';
      if (!v.isConnected) return;
      if (voicedSeconds(rec.pcm) < (kind === 'kata' ? 0.25 : 0.6)) { restore(); fb.className = 'fb bad'; fb.textContent = 'Tidak ada suara yang terdengar. Dekatkan HP ke mulut dan coba lagi.'; return; }
      mic.disabled = true; mic.textContent = '⏳ Memeriksa…'; fb.textContent = ''; lock('think');
      const t0 = performance.now(); let text = '';
      try { text = await transcribe(rec.pcm); }
      catch (e) { restore(); fb.className = 'fb bad'; fb.textContent = 'Gagal memeriksa: ' + String(e.message || e).slice(0, 120); return; }
      if (!v.isConnected) return;
      const ms = Math.round(performance.now() - t0), r = words.length === 1 ? checkWord(words[0].ar, text) : check(words.map(w => w.ar), text), pct = Math.round(r.acc * 100);
      tries++; restore(); v.dataset.heard = text; // what the model heard (tests and debugging)
      // A very short word read on its own (مَا, مِنْ, هُوَ …) is often not heard at all by the model, even from Alafasy.
      // Don't show a false 0%: say it can't be scored here; it is scored inside the parts and the whole ayah.
      const unsure = words.length === 1 && weight(words[0].ar) <= 2 && r.acc === 0;
      if (unsure) {
        paint(null); accEl.textContent = 'Kata pendek: belum bisa dinilai'; accEl.style.color = '#8A7A5A';
        fb.className = 'fb'; fb.textContent = 'Pengenal bacaan sulit mendengar kata sependek ini. Dengarkan dan tirukan, lalu lanjut. Kata ini dinilai lagi saat membaca per bagian.';
      } else {
        paint(r.res); showHeard(heardEl, r.res);
        accEl.textContent = `Ketepatan: ${pct}%`;
        accEl.style.color = pct >= 90 ? 'var(--ok)' : pct >= 70 ? '#B7791F' : 'var(--no)';
        fb.className = 'fb ' + (pct >= 90 ? 'good' : ''); fb.textContent = verdict(r.acc);
        if (pct >= 90) sfx.fanfare(); else if (pct >= 70) sfx.good();
      }
      if (kind === 'ayat') { S.recited = S.recited || {}; S.recited[a.a] = true; save(); }
      logActivity('recitation_try', { ayah: a.a, part: kind, words: words.map(w => w.a.slice(6)).join(','), score: unsure ? null : +r.acc.toFixed(2), ms, rec_s: +rec.dur.toFixed(1),
        profile: RECITE.id, heard: text.slice(0, 120), wrong: r.res.filter(x => x.st !== 'ok').slice(0, 6).map(x => `${x.word}→${x.heard || '∅'}`) });
    };
    body.replaceChildren(v);
  };
  show();
}

// after Kenali (step 1): each word · after Cocokkan (step 2): parts. Reviews skip these to stay short.
hooks.afterStep = ({ n, body, bar, s, a, review, next }) => {
  if (!FLAGS.recitationGate || review || (n !== 1 && n !== 2)) return next();
  const items = n === 1 ? a.w.map(w => [w]) : parts(a.w);
  // an ayah of 1 word has nothing new to practise in parts; the whole ayah comes after Susun
  if (n === 2 && (a.w.length <= 1 || items.length === 1)) return next();
  [...bar.children].forEach((x, k) => x.className = k <= n ? 'past' : '');
  practice({ body, s, a, items, kind: n === 1 ? 'kata' : 'bagian', next });
};
// after Susun: the whole ayah (on murajaah only if it was never read aloud before)
hooks.afterAyah = ({ body, bar, s, a, review, next }) => {
  S.recited = S.recited || {};
  if (!FLAGS.recitationGate || (review && S.recited[a.a])) return next();
  [...bar.children].forEach(x => x.className = 'past');
  practice({ body, s, a, items: [a.w], kind: 'ayat', next });
};

// ---------------- settings box (⚙ → Pengaturan): status only, the download is automatic ----------------
export function settingsBox() {
  const b = $(`<div class="box"><h3>🎙️ Pengenal bacaan</h3>
    <p class="small" style="margin:0 0 8px">Saat belajar ayat, anak berlatih membaca: setiap kata, lalu per bagian, lalu satu ayat. Setiap percobaan menunjukkan <b>ketepatan</b>: berapa banyak huruf yang terbaca benar, supaya artinya tidak berubah (misalnya قلب "hati" dan كلب "anjing"). Tajwid belum dinilai. Ini latihan, bukan syarat untuk lanjut. Pengenal bacaan berjalan di perangkat ini (suara tidak dikirim ke internet) dan disiapkan saat game dibuka (unduhan sekali, ${MODEL_SIZE}).</p>
    <div id="rs" class="small" style="margin:6px 0"></div>
    <div class="minibar" style="height:10px;background:#E8DDBF;border:2px solid var(--ink);border-radius:4px;overflow:hidden;margin:6px 0"><div id="rbar" style="height:100%;width:0;background:#7CD35E"></div></div>
    <div class="row"><button class="btn" id="rdl" hidden>🔄 Coba lagi</button></div></div>`);
  const st = b.querySelector('#rs'), bar = b.querySelector('#rbar'), dl = b.querySelector('#rdl');
  const unsub = onModel(m => {
    if (b.dataset.seen && !b.isConnected) return unsub(); // settings closed
    if (b.isConnected) b.dataset.seen = '1';
    bar.style.width = modelPct() + '%';
    dl.hidden = !(m.status === 'error' || m.status === 'blocked');
    st.innerHTML = m.status === 'ready' ? '<b class="ok">Siap ✓</b>' : esc(statusText(m)) + (m.status === 'error' && m.error ? ` <span class="small">(${esc(m.error)})</span>` : '');
  });
  dl.onclick = () => ensureModel(true);
  preloadModel();
  return b;
}
