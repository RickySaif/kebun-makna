// recite.js — on-device recitation recognition (Whisper, transformers.js) and the reading-practice pages in each lesson.
// Model: tarteel-ai whisper-base-ar-quran (ONNX). Profiles and session options come from tes-whisper.html.
import { $, esc } from './ui.js';
import { S, save } from './state.js';
import { sfx, play, stopAudio } from './audio.js';
import { AA, AW } from './data.js';
import { check, checkWord, weight } from './match.js';
import { RECITE, TRANSFORMERS_ESM, FLAGS } from './config.js';
import { logActivity } from './api.js';
import { hooks } from './hooks.js';

// One model for everyone (Ricky, 2026-11-13): q4 (~140 MB). Tested on all 48 ayat of Alafasy: the larger fp32-encoder build
// heard exactly the same words and the same letter swaps, so it isn't worth +65 MB and the memory on an iPhone.
const SO = { graphOptimizationLevel: 'basic', enableCpuMemArena: false, enableMemPattern: false };
const LS_READY = 'kebun-makna-recite-ready', LS_OLD_PROFILE = 'kebun-makna-recite-profile';
const CACHE = 'transformers-cache';
export const MODEL_SIZE = '≈140 MB';

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
export const isReady = () => !!asr;

// ---------------- model: downloaded in the background from the moment the game opens ----------------
// status: 'idle' | 'loading' | 'ready' | 'error'. Listeners get the whole state on every change.
export const model = { status: 'idle', loaded: 0, total: 0, error: '', ms: 0 };
const listeners = new Set();
const emit = () => listeners.forEach(f => { try { f(model); } catch (e) {} });
/** Subscribe to model progress; calls fn now and on every change. Returns an unsubscribe function. */
export function onModel(fn) { listeners.add(fn); fn(model); return () => listeners.delete(fn); }

let asr = null, loadingP = null;
export function loadModel() {
  if (asr) return Promise.resolve(asr);
  if (loadingP) return loadingP;
  Object.assign(model, { status: 'loading', error: '' }); emit();
  loadingP = (async () => {
    const t0 = performance.now(); const files = {};
    // players of the old "Kualitas" profile: drop its 205 MB from the cache once
    if (lsGet(LS_OLD_PROFILE) === 'mix') { try { await caches.delete(CACHE); } catch (e) {} }
    lsSet(LS_OLD_PROFILE, null);
    const T = await import(TRANSFORMERS_ESM);
    T.env.allowLocalModels = false;
    if (T.env.backends && T.env.backends.onnx && T.env.backends.onnx.wasm) T.env.backends.onnx.wasm.numThreads = 1;
    const pipe = await T.pipeline('automatic-speech-recognition', RECITE.model, {
      dtype: RECITE.dtype, device: 'wasm', session_options: SO,
      progress_callback: e => {
        if (e.status === 'progress' && e.file) {
          files[e.file] = { l: e.loaded, t: e.total };
          model.loaded = Object.values(files).reduce((a, b) => a + b.l, 0);
          model.total = Object.values(files).reduce((a, b) => a + b.t, 0);
          emit();
        }
      },
    });
    asr = pipe; model.ms = Math.round(performance.now() - t0);
    const first = !lsGet(LS_READY); lsSet(LS_READY, 'q4');
    if (first) logActivity('model_download', { profile: 'q4', ms: model.ms });
    Object.assign(model, { status: 'ready', loaded: model.total || 1, total: model.total || 1 }); emit();
    return asr;
  })().catch(e => {
    Object.assign(model, { status: 'error', error: String(e && e.message || e).slice(0, 160) }); emit();
    loadingP = null; throw e;
  });
  return loadingP;
}
/** Start (or resume) the download without waiting. Safe to call many times. Retries once after a network error. */
let retried = false;
export function preloadModel() {
  if (!FLAGS.recitationGate) return;
  loadModel().catch(() => { if (!retried) { retried = true; setTimeout(() => preloadModel(), 15000); } });
}
export const modelPct = () => model.status === 'ready' ? 100 : model.total ? Math.min(99, Math.floor(100 * model.loaded / model.total)) : 0;

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
    const box = v.querySelector('.ayahbig'), fb = v.querySelector('.fb'), mic = v.querySelector('#mic'), lvl = v.querySelector('#lvl'), accEl = v.querySelector('.acc');
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
      if (m.status === 'error') {
        fb.className = 'fb bad'; fb.textContent = 'Pengenal bacaan belum bisa diunduh (cek internet). Kamu tetap bisa lanjut.';
        if (!v.querySelector('#retry')) { const r = $(`<button class="btn ghost block" id="retry" style="margin-top:8px">🔄 Coba unduh lagi</button>`); r.onclick = () => { r.remove(); loadModel().catch(() => {}); }; fb.after(r); }
      } else { fb.className = 'fb'; fb.textContent = `Menyiapkan pengenal bacaan… ${modelPct()}% (sekali saja). Sambil menunggu, dengarkan dulu.`; }
    });
    mic.onclick = async () => {
      if (busy) { stopFn && stopFn(); return; }
      stopAudio(); busy = true; stopFn = null;
      mic.textContent = '⏹️ Selesai'; fb.className = 'fb'; fb.textContent = 'Mendengarkan… silakan baca.'; accEl.textContent = '';
      const restore = () => { busy = false; stopFn = null; mic.textContent = '🎙️ Baca lagi'; mic.disabled = false; };
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
      mic.disabled = true; mic.textContent = '⏳ Memeriksa…'; fb.textContent = 'Sebentar, sedang mendengarkan bacaanmu…';
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
        paint(r.res);
        accEl.textContent = `Ketepatan: ${pct}%`;
        accEl.style.color = pct >= 90 ? 'var(--ok)' : pct >= 70 ? '#B7791F' : 'var(--no)';
        fb.className = 'fb ' + (pct >= 90 ? 'good' : ''); fb.textContent = verdict(r.acc);
        if (pct >= 90) sfx.fanfare(); else if (pct >= 70) sfx.good();
      }
      if (kind === 'ayat') { S.recited = S.recited || {}; S.recited[a.a] = true; save(); }
      logActivity('recitation_try', { ayah: a.a, part: kind, words: words.map(w => w.a.slice(6)).join(','), score: unsure ? null : +r.acc.toFixed(2), ms, rec_s: +rec.dur.toFixed(1),
        profile: 'q4', heard: text.slice(0, 120), wrong: r.res.filter(x => x.st !== 'ok').slice(0, 6).map(x => `${x.word}→${x.heard || '∅'}`) });
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
  preloadModel();
  [...bar.children].forEach((x, k) => x.className = k <= n ? 'past' : '');
  practice({ body, s, a, items, kind: n === 1 ? 'kata' : 'bagian', next });
};
// after Susun: the whole ayah (on murajaah only if it was never read aloud before)
hooks.afterAyah = ({ body, bar, s, a, review, next }) => {
  S.recited = S.recited || {};
  if (!FLAGS.recitationGate || (review && S.recited[a.a])) return next();
  preloadModel();
  [...bar.children].forEach(x => x.className = 'past');
  practice({ body, s, a, items: [a.w], kind: 'ayat', next });
};

// ---------------- settings box (⚙ → Pengaturan): status only, the download is automatic ----------------
export function settingsBox() {
  const b = $(`<div class="box"><h3>🎙️ Pengenal bacaan</h3>
    <p class="small" style="margin:0 0 8px">Saat belajar ayat, anak berlatih membaca: setiap kata, lalu per bagian, lalu satu ayat. Setiap percobaan menunjukkan <b>ketepatan</b>: berapa banyak huruf yang terbaca benar, supaya artinya tidak berubah (misalnya قلب "hati" dan كلب "anjing"). Tajwid belum dinilai. Ini latihan, bukan syarat untuk lanjut. Pengenal bacaan berjalan di perangkat ini (suara tidak dikirim ke internet) dan diunduh otomatis sekali (${MODEL_SIZE}) saat game dibuka.</p>
    <div id="rs" class="small" style="margin:6px 0"></div>
    <div class="minibar" style="height:10px;background:#E8DDBF;border:2px solid var(--ink);border-radius:4px;overflow:hidden;margin:6px 0"><div id="rbar" style="height:100%;width:0;background:#7CD35E"></div></div>
    <div class="row"><button class="btn" id="rdl" hidden>🔄 Coba unduh lagi</button></div></div>`);
  const st = b.querySelector('#rs'), bar = b.querySelector('#rbar'), dl = b.querySelector('#rdl');
  const unsub = onModel(m => {
    if (b.dataset.seen && !b.isConnected) return unsub(); // settings closed
    if (b.isConnected) b.dataset.seen = '1';
    bar.style.width = modelPct() + '%';
    dl.hidden = m.status !== 'error';
    st.innerHTML = m.status === 'ready' ? '<b class="ok">Siap ✓</b>'
      : m.status === 'error' ? 'Belum bisa diunduh: ' + esc(m.error)
      : m.total ? `Mengunduh… ${(m.loaded / 1048576).toFixed(0)} / ${(m.total / 1048576).toFixed(0)} MB` : 'Menyiapkan…';
  });
  dl.onclick = () => loadModel().catch(() => {});
  preloadModel();
  return b;
}
