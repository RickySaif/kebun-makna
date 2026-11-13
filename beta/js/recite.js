// recite.js — on-device recitation recognition (Whisper, transformers.js) and the "Sekarang kamu yang baca" gate.
// Model: tarteel-ai whisper-base-ar-quran (ONNX). Profiles and session options come from tes-whisper.html.
import { $, esc, toast } from './ui.js';
import { S, save } from './state.js';
import { sfx, voice, play, stopAudio } from './audio.js';
import { AA, AW } from './data.js';
import { check } from './match.js';
import { RECITE, TRANSFORMERS_ESM, FLAGS } from './config.js';
import { sb, session, logActivity } from './api.js';
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
  await loadModel();
  // No language/task options: this fine-tuned model's generation config has no language table (passing language
  // throws "Cannot read properties of null (reading '<|ar|>')"), and it only knows Qur'anic Arabic anyway.
  const out = await asr(pcm, { chunk_length_s: 30 });
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
const COL = { ok: '#BFF0B0', bad: '#F8B9A6', miss: '#E6E0D2' };
function gate({ body, bar, s, a, review, next }) {
  S.recited = S.recited || {};
  // reviews of an ayah already recited don't need the gate again
  if (!FLAGS.recitationGate || (review && S.recited[a.a])) return next();
  preloadModel();
  [...bar.children].forEach(x => x.className = 'past');
  let fails = 0, busy = false;
  const words = a.w.map(w => w.ar);
  const pass = () => { S.recited[a.a] = true; save(); unsub(); next(); };
  const v = $(`<div class="frame"><h2>Sekarang kamu yang baca</h2>
    <p class="lead">Baca ayat ini dengan suaramu. Ketuk tombol mikrofon, baca, lalu diam sebentar.</p>
    <div class="ayahbig ar" lang="ar"></div>
    <div class="fb" aria-live="polite"></div>
    <div class="row" style="margin-top:10px"><button class="btn blue" id="hear">▶ Dengar dulu</button></div>
    <button class="btn green block" id="mic" style="margin-top:12px;font-size:22px">🎙️ Mulai baca</button>
    <div class="minibar" style="margin-top:8px;height:8px;background:#E8DDBF;border:2px solid var(--ink);border-radius:4px;overflow:hidden"><div id="lvl" style="height:100%;width:0;background:#7CD35E"></div></div>
    <div id="extra"></div></div>`);
  const box = v.querySelector('.ayahbig'), fb = v.querySelector('.fb'), mic = v.querySelector('#mic'), extra = v.querySelector('#extra'), lvl = v.querySelector('#lvl');
  // tap a word to hear it (handy after a red word)
  const paint = res => box.replaceChildren(...a.w.flatMap((w, i) => {
    const sp = $(`<span role="button" tabindex="0">${esc(w.ar)}</span>`);
    sp.style.cursor = 'pointer';
    sp.onclick = () => { stopAudio(); play(AW(w.a)); };
    if (res) { const st = res[i].st; sp.style.borderRadius = '4px'; sp.style.padding = '0 3px'; sp.style.background = COL[st]; if (st !== 'ok') sp.style.textDecoration = 'underline wavy #C0392B'; }
    return i ? [document.createTextNode(' '), sp] : [sp];
  }));
  paint(null);
  v.querySelector('#hear').onclick = () => { stopAudio(); play(AA(a.a)); };
  const showParentBtn = () => {
    if (extra.querySelector('#par')) return;
    const b = $(`<button class="btn ghost block" id="par" style="margin-top:12px">🙋 Minta Ayah/Ibu dengar</button>`);
    b.onclick = async () => {
      stopAudio();
      if (await askParent(`${S.name || 'Anak'} sudah mencoba membaca ${s.name} ayat ${a.n}. Konfirmasi kalau Ayah/Ibu sudah mendengarnya membaca dengan huruf yang benar.`)) {
        logActivity('recitation_override', { ayah: a.a, fails, model: model.status });
        toast('Alhamdulillah, Ayah/Ibu sudah mendengar!'); pass();
      }
    };
    extra.append(b);
  };
  // model still downloading (it started when the game opened): show progress, enable the mic when ready
  const unsub = onModel(m => {
    if (v.dataset.seen && !v.isConnected) return unsub(); // the child left the lesson
    if (v.isConnected) v.dataset.seen = '1';
    if (busy) return;
    if (m.status === 'ready') { if (mic.disabled && !mic.dataset.used) { mic.disabled = false; fb.className = 'fb'; fb.textContent = 'Siap! Ketuk mikrofon dan baca.'; } extra.querySelector('#retry')?.remove(); return; }
    mic.disabled = true;
    if (m.status === 'error') {
      fb.className = 'fb bad'; fb.textContent = 'Pengenal bacaan belum bisa diunduh. Sambungkan ke internet (sebaiknya Wi-Fi), lalu coba lagi.';
      if (!extra.querySelector('#retry')) {
        const r = $(`<button class="btn block" id="retry" style="margin-top:10px">🔄 Coba unduh lagi</button>`);
        r.onclick = () => { r.remove(); loadModel().catch(() => {}); };
        extra.prepend(r);
      }
      showParentBtn();
    } else { fb.className = 'fb'; fb.textContent = `Menyiapkan pengenal bacaan… ${modelPct()}% (sekali saja). Sambil menunggu, dengarkan ayatnya dulu.`; }
  });
  mic.onclick = async () => {
    stopAudio();
    busy = true; mic.dataset.used = '1';
    let stopFn = null;
    mic.textContent = '⏹️ Selesai membaca'; fb.className = 'fb'; fb.textContent = 'Mendengarkan… silakan baca.';
    const listen = mic.onclick; mic.onclick = () => stopFn && stopFn();
    const restore = () => { busy = false; mic.textContent = '🎙️ Baca lagi'; mic.disabled = false; mic.onclick = listen; };
    let rec;
    try { rec = await record({ onLevel: x => { lvl.style.width = Math.round(x * 100) + '%'; }, stopper: f => stopFn = f }); }
    catch (e) {
      restore();
      fb.className = 'fb bad'; fb.textContent = e && e.name === 'NotAllowedError' ? 'Mikrofon belum diizinkan. Izinkan mikrofon untuk halaman ini di pengaturan browser, lalu coba lagi.' : 'Mikrofon tidak bisa dipakai: ' + (e.message || e);
      showParentBtn(); return;
    }
    lvl.style.width = '0';
    if (voicedSeconds(rec.pcm) < 0.6) { restore(); fb.className = 'fb bad'; fb.textContent = 'Tidak ada suara yang terdengar. Dekatkan HP ke mulut dan coba lagi.'; return; }
    mic.disabled = true; mic.textContent = '⏳ Memeriksa bacaan…'; fb.textContent = 'Sebentar, sedang mendengarkan bacaanmu…';
    const t0 = performance.now(); let text = '';
    try { text = await transcribe(rec.pcm); }
    catch (e) { restore(); fb.className = 'fb bad'; fb.textContent = 'Gagal memeriksa: ' + String(e.message || e).slice(0, 120); showParentBtn(); return; }
    const ms = Math.round(performance.now() - t0);
    const r = check(words, text);
    paint(r.res);
    const wrong = r.res.filter(x => x.st !== 'ok');
    const detail = { ayah: a.a, score: +r.score.toFixed(2), ok: r.ok, bad: r.bad, miss: r.miss, ms, rec_s: +rec.dur.toFixed(1), profile: 'q4', heard: text.slice(0, 120),
      wrong: wrong.slice(0, 6).map(x => `${x.word}→${x.heard || '∅'}`) };
    if (wrong.length <= RECITE.maxWrong) {
      logActivity('recitation_pass', detail);
      sfx.fanfare(); voice('winner', 100);
      fb.className = 'fb good'; fb.textContent = `MasyaAllah! Semua kata terbaca dengan huruf yang benar (${r.ok}/${words.length}).`;
      busy = false; mic.textContent = 'Lanjut ▸'; mic.disabled = false; mic.onclick = () => pass();
    } else {
      fails++; logActivity('recitation_fail', detail);
      sfx.bad(); restore();
      fb.className = 'fb bad';
      fb.textContent = r.bad
        ? 'Hampir! Ada huruf yang berubah di kata yang merah, jadi artinya bisa berubah. Ketuk kata merah untuk mendengarnya, lalu baca lagi.'
        : 'Hampir! Ada kata yang belum terdengar. Baca lagi pelan-pelan dan jelas, ya.';
      const first = a.w[wrong[0].i];
      setTimeout(() => { stopAudio(); play(first ? AW(first.a) : AA(a.a)); }, 600);
      if (fails >= RECITE.failsBeforeParent) showParentBtn();
    }
  };
  body.replaceChildren(v);
}
hooks.afterAyah = gate;

// ---------------- settings box (⚙ → Pengaturan): status only, the download is automatic ----------------
export function settingsBox() {
  const b = $(`<div class="box"><h3>🎙️ Pengenal bacaan</h3>
    <p class="small" style="margin:0 0 8px">Setelah belajar arti ayat, anak membaca ayatnya dengan suara sendiri. Yang diperiksa: setiap huruf tetap benar, supaya artinya tidak berubah (misalnya قلب "hati" dan كلب "anjing"). Tajwid belum dinilai. Pengenal bacaan berjalan di perangkat ini (suara tidak dikirim ke internet) dan diunduh otomatis sekali (${MODEL_SIZE}) saat game dibuka.</p>
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
