// build-dagang-surahs.mjs — build game data + audio for six new surahs in the format of js/data.js:
// Al-Fatihah (1), Al-'Adiyat (100), Al-Qari'ah (101), At-Takatsur (102), Al-'Asr (103), Al-Humazah (104).
//
// Re-runnable, no dependencies (node 20+, ffmpeg and ffprobe on PATH or /opt/homebrew/bin).
// Usage (repo root):
//   node tools/build-dagang-surahs.mjs                 build everything (data, ayah audio, word clips, report)
//   node tools/build-dagang-surahs.mjs --only=104,103  only these surahs
//   node tools/build-dagang-surahs.mjs --no-audio      data only (no ayah/word audio written)
//   node tools/build-dagang-surahs.mjs --pin-src       write the live Quran.com gloss ("src") into tools/dagang-glosses.json
//   node tools/build-dagang-surahs.mjs --calibrate     only run the self-test against the 10 existing surahs
//
// Inputs (all public / in the repo):
//   Quran.com API v4 (words, indopak script, transliteration, Indonesian gloss per word; reciter 7 = Mishari Alafasy
//   word segments per ayah), the Quran.com ayah mp3 of the same Alafasy recording, the Supabase `sources` table
//   (Kemenag translation, the source of truth for `tr`), tools/dagang-glosses.json (child-friendly `id`),
//   tools/dagang-word-emoji.json (`emo`).
// Outputs: content/dagang/surah-<no>.json, audio/a/<SSSAAA>.mp3, audio/w/<SSSAAAWWW>.mp3, docs/DAGANG_DATA.md.
// Never writes anything for a surah that already exists in js/data.js, and never touches js/, css/ or index.html.
//
// Everything about word boundaries is checked by signal analysis only (not by ear). See docs/DAGANG_DATA.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH}`;
const args = process.argv.slice(2), has = f => args.includes(f);
const onlyArg = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const API = 'https://api.quran.com/api/v4';
const CDN = 'https://verses.quran.foundation/'; // audio url from the API is relative to this host (same files as everyayah.com Alafasy_128kbps)
const SB = 'https://vnzmvmlvicyggylgukaz.supabase.co';
const SB_KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5'; // publishable key, safe to commit
const CACHE = process.env.KM_DAGANG_CACHE || path.join(os.tmpdir(), 'km-dagang-cache');
fs.mkdirSync(CACHE, { recursive: true });

const SURAHS = [
  { no: 104, name: 'Al-Humazah', arName: 'الهُمَزَة', mean: 'Pengumpat', ayat: 9 },
  { no: 103, name: "Al-'Asr", arName: 'العَصْر', mean: 'Masa', ayat: 3 },
  { no: 102, name: 'At-Takatsur', arName: 'التَّكَاثُر', mean: 'Bermegah-megahan', ayat: 8 },
  { no: 101, name: "Al-Qari'ah", arName: 'القَارِعَة', mean: 'Hari Kiamat', ayat: 11 },
  { no: 100, name: "Al-'Adiyat", arName: 'العَادِيَات', mean: 'Kuda Perang yang Berlari Kencang', ayat: 11 },
  { no: 1, name: 'Al-Fatihah', arName: 'الفَاتِحَة', mean: 'Pembukaan', ayat: 7 },
];
const p3 = n => String(n).padStart(3, '0');
const { DATA } = await import(path.join(ROOT, 'js/data.js'));
const EXISTING = new Set(DATA.map(s => s.no));
for (const s of SURAHS) if (EXISTING.has(s.no)) throw new Error(`surah ${s.no} already exists in js/data.js: refusing to write anything for it`);

// ---------- network (cached) ----------
async function getJson(url, headers) {
  const f = path.join(CACHE, createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers }); if (!r.ok) throw new Error(`${r.status} ${url}`);
      const j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); return j;
    } catch (e) { if (i >= 3) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
}
async function getFile(url, name) {
  const f = path.join(CACHE, name); if (fs.existsSync(f) && fs.statSync(f).size > 1000) return f;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f;
    } catch (e) { if (i >= 3) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
}
const quranCom = async no => ({
  verses: (await getJson(`${API}/verses/by_chapter/${no}?words=true&word_fields=text_indopak,transliteration&language=id&per_page=50&fields=text_indopak`)).verses,
  audio: (await getJson(`${API}/verses/by_chapter/${no}?audio=7&per_page=50`)).verses,
  sources: await getJson(`${SB}/rest/v1/sources?kind=eq.quran&surah=eq.${no}&order=ayah&select=id,ayah,ref_label,indonesian,attribution`, { apikey: SB_KEY }),
});

// ---------- text rules (derived by comparing js/data.js with Quran.com's text_indopak; verified by --calibrate) ----------
// Ayah `ar`: Quran.com verse text_indopak without the invisible RLM/ZWSP marks and without the private-use pause glyphs
// (the existing data has none of those); U+0615 (small high tah) is written U+06D7 (the "qala" waqf sign), as in 111:1, 111:2, 111:4.
const cleanAyah = t => t.replace(/[​‏]/g, '').replace(/[-]/g, '').replace(/ؕ/g, 'ۗ').trim();
// Word `ar`: the same text minus the waqf mark, spaces and the rub-el-hizb sign around the word.
const cleanWord = t => { let s = cleanAyah(t), p; do { p = s; s = s.replace(/[ۖ-ۛۗ  \s]+$/u, '').replace(/^[۞\s]+/u, ''); } while (s !== p); return s; };
const isMark = t => /^[ۖ-ۛۗ۞]+$/.test(t);
function arabicWords(verseText, apiCount, ref) {
  let toks = cleanAyah(verseText).split(/[\s  ]+/).map(cleanWord).filter(t => t && !isMark(t));
  // Quran.com's indopak text sometimes writes a one-letter prefix as its own token ("وَ" + "عَمِلُوا"); its glosses follow the real words.
  for (let i = 0; toks.length > apiCount && i < toks.length - 1; i++) if (toks[i] === 'وَ') { toks.splice(i, 2, toks[i] + toks[i + 1]); i--; }
  if (toks.length !== apiCount) throw new Error(`${ref}: ${toks.length} Arabic tokens but ${apiCount} Quran.com words`);
  return toks;
}

// ---------- audio analysis ----------
const sh = (cmd, a, o = {}) => execFileSync(cmd, a, { maxBuffer: 1 << 30, ...o });
const durMs = f => Math.round(parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()) * 1000);
const pcm = f => { const b = sh('ffmpeg', ['-v', 'error', '-i', f, '-f', 's16le', '-ac', '1', '-ar', '44100', '-']); return new Int16Array(b.buffer, b.byteOffset, b.length >> 1); };
const HOP = 220, WIN = 441; // 5 ms hop, 10 ms window
function envelope(x) { // smoothed RMS in dB, frame i is centred at i*5+5 ms
  const n = Math.floor((x.length - WIN) / HOP), e = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < WIN; j++) { const v = x[i * HOP + j]; s += v * v; } e[i] = 20 * Math.log10(Math.sqrt(s / WIN) / 32768 + 1e-6); }
  const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = (e[Math.max(0, i - 1)] + e[i] + e[Math.min(n - 1, i + 1)]) / 3; return o;
}
const toFrame = ms => Math.round(ms / 5), toMs = f => f * 5 + 5;
const depthAt = (e, i) => Math.max(...e.slice(Math.max(0, i - 50), Math.min(e.length, i + 50))) - e[i]; // dB below the loudest point within 250 ms either side
// Snap an estimate to the quietest point within +-80 ms (centre of the quiet plateau if there is one).
function snap(e, est, W = 80) {
  const lo = Math.max(0, toFrame(est - W)), hi = Math.min(e.length - 1, toFrame(est + W));
  let mi = lo; for (let i = lo; i <= hi; i++) if (e[i] < e[mi]) mi = i;
  let a = mi, b = mi; while (a > lo && e[a - 1] <= e[mi] + 2) a--; while (b < hi && e[b + 1] <= e[mi] + 2) b++;
  const c = Math.round((a + b) / 2); return { ms: toMs(c), depth: depthAt(e, c), plateau: (b - a + 1) * 5 };
}
// Other clear dips (>=15 dB) within 250 ms that are more than 80 ms away from the chosen point: a second candidate for the human.
function altDip(e, chosenMs) {
  const lo = Math.max(1, toFrame(chosenMs - 250)), hi = Math.min(e.length - 2, toFrame(chosenMs + 250)); let best = null;
  for (let i = lo; i <= hi; i++) if (e[i] <= e[i - 1] && e[i] <= e[i + 1] && Math.abs(toMs(i) - chosenMs) > 80) { const d = depthAt(e, i); if (d >= 15 && (!best || d > best.depth)) best = { ms: toMs(i), depth: d }; }
  return best;
}
// Boundaries between words: estimate = middle between the end of word k and the start of word k+1 in Quran.com's segments.
function findBounds(e, seg, ar) {
  const out = []; let prev = 0;
  for (let k = 0; k < seg.length - 1; k++) {
    const est = Math.round((seg[k][3] + seg[k + 1][2]) / 2), s = snap(e, est);
    let ms = s.depth >= 8 ? s.ms : est; // no real dip (voiced continuation / nasal hum): keep the published estimate
    const reasons = [];
    if (ms < prev + 60) { ms = prev + 60; reasons.push('nudged to keep order'); }
    if (s.depth < 8) reasons.push(`no clear dip (${s.depth.toFixed(0)} dB): Quran.com estimate kept`);
    else if (s.depth < 12) reasons.push(`weak dip (${s.depth.toFixed(0)} dB)`);
    if (Math.abs(ms - est) >= 60) reasons.push(`moved ${ms - est > 0 ? '+' : ''}${ms - est} ms from Quran.com`);
    const alt = altDip(e, ms); // kept in the record only: in the self-test the second dip was never the right one
    const lastLetter = (ar[k].match(/[\u0621-\u064a](?=[^\u0621-\u064a]*$)/) || [''])[0], tanwin = /[\u064b-\u064d]/.test(ar[k].slice(-3));
    const nasal = tanwin || lastLetter === 'ن' || lastLetter === 'م';
    if (nasal && s.depth < 16) reasons.push('possible nasal join (ghunna/ikhfa)');
    // tier A: no real dip, the time is only Quran.com's estimate; B: weak/uncertain; C: clear dip close to Quran.com's estimate
    const tier = s.depth < 8 ? 'A' : (s.depth < 12 || Math.abs(ms - est) >= 60 || (nasal && s.depth < 16)) ? 'B' : 'C';
    out.push({ ms, est, depth: s.depth, alt, nasal, tier, reasons }); prev = ms;
  }
  // Snapping must not squeeze a word: if a word became shorter than 60% of what Quran.com's timing gives (or under 100 ms), put its two boundaries back.
  for (let k = 0; k < out.length; k++) {
    const l = out[k].ms - (k ? out[k - 1].ms : 0), q = out[k].est - (k ? out[k - 1].est : 0);
    if (l < Math.max(100, 0.6 * q) && q > 0) for (const j of [k - 1, k]) if (j >= 0 && out[j].ms !== out[j].est) { out[j].ms = out[j].est; out[j].tier = 'A'; out[j].reasons.push('snapping made a neighbouring word too short: Quran.com estimate kept'); }
  }
  for (let k = 0; k < out.length; k++) { const prevMs = k ? out[k - 1].ms : 0; if (out[k].ms < prevMs + 60) { out[k].ms = prevMs + 60; out[k].tier = 'A'; out[k].reasons.push('nudged to keep order'); } }
  return out;
}

// ---------- calibration against the 10 existing surahs ----------
async function calibrate() {
  const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/word-boundaries.json'), 'utf8'));
  const st = { ayat: 0, arOK: 0, wordsOK: 0, words: 0, wordArOK: 0, latOK: 0, srcOK: 0, srcKnown: 0, trOK: 0, bounds: [], arBad: [] };
  for (const s of DATA) {
    const q = await quranCom(s.no);
    for (const a of s.ayat) {
      const v = q.verses[a.n - 1], ws = v.words.filter(w => w.char_type_name === 'word'); st.ayat++;
      if (cleanAyah(v.text_indopak) === a.ar) st.arOK++; else st.arBad.push(`${s.no}:${a.n}`);
      if (ws.map(w => w.transliteration.text).join(' ') === a.lat) st.latOK++;
      if (q.sources.find(x => x.ayah === a.n).indonesian === a.tr) st.trOK++;
      ws.forEach((w, i) => { st.words++; if (cleanWord(w.text_indopak) === a.w[i].ar) st.wordArOK++; if (!/diperbaiki manual/.test(a.w[i].src)) { st.srcKnown++; if (w.translation.text === a.w[i].src) st.srcOK++; } });
      const ref = B[a.a], seg = q.audio[a.n - 1].audio.segments, e = envelope(pcm(path.join(ROOT, 'audio/a', `${a.a}.mp3`)));
      findBounds(e, seg, a.w.map(w => w.ar)).forEach((b, k) => st.bounds.push({ d: Math.abs(b.ms - ref.bounds[k]), tier: b.tier, b, qcErr: Math.abs(b.est - ref.bounds[k]), ref: ref.bounds[k] }));
    }
  }
  const pc = (n, d) => `${n}/${d}`, ab = st.bounds.map(b => b.d).sort((x, y) => x - y);
  const within = (arr, t) => arr.filter(x => (x.d ?? x) <= t).length, tier = t => st.bounds.filter(b => b.tier === t);
  st.text = `ayah text ${pc(st.arOK, st.ayat)} identical to js/data.js (rest: ${st.arBad.join(', ') || 'none'}), transliteration ${pc(st.latOK, st.ayat)}, Kemenag translation from \`sources\` ${pc(st.trOK, st.ayat)}, word Arabic ${pc(st.wordArOK, st.words)} (the other ${st.words - st.wordArOK} are the words Quran.com splits differently: 111:4, 109:5, 107:3), word gloss \`src\` ${pc(st.srcOK, st.srcKnown)} (the rest are the hand-fixed words).`;
  st.timing = `Boundaries: re-derived for the 10 existing surahs and compared with the reviewed ones in tools/word-boundaries.json (${ab.length} boundaries). Median difference ${ab[ab.length >> 1]} ms; ${within(st.bounds, 40)}/${ab.length} within 40 ms, ${within(st.bounds, 80)}/${ab.length} within 80 ms; the worst 10% differ by more than ${ab[Math.floor(ab.length * 0.9)]} ms. By tier: ` + ['A', 'B', 'C'].map(t => `tier ${t} ${within(tier(t), 80)}/${tier(t).length} within 80 ms (${within(tier(t), 40)} within 40 ms)`).join(', ') + '.';
  return st;
}

// ---------- main ----------
const gloss = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/dagang-glosses.json'), 'utf8'));
const emoji = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/dagang-word-emoji.json'), 'utf8'));
const BANNED = [[0x1f600, 0x1f64e], [0x1f440, 0x1f441], [0x1f400, 0x1f43f], [0x1f980, 0x1f9a2]]; // faces, eyes, animals (🙏 U+1F64F is allowed)
const lintEmoji = (id, e) => { for (const c of e) { const cp = c.codePointAt(0); if (BANNED.some(([a, b]) => cp >= a && cp <= b)) throw new Error(`emoji ${e} for ${id} is a face, eye or animal`); } };

if (has('--dump')) { const c = await calibrate(); fs.writeFileSync(process.env.DUMP, JSON.stringify(c.bounds)); process.exit(0); }
if (has('--calibrate')) { const c = await calibrate(); console.log(c.text + '\n' + c.timing); process.exit(0); }
const cal = await calibrate();
console.log(cal.text + '\n' + cal.timing);

const todo = SURAHS.filter(s => !onlyArg || onlyArg.split(',').map(Number).includes(s.no));
const report = [], summary = {}; const usedGloss = new Set(), seenWordIds = new Set();
fs.mkdirSync(path.join(ROOT, 'content/dagang'), { recursive: true });
if (!has('--no-audio')) for (const d of ['audio/a', 'audio/w']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });

for (const S of todo) {
  const q = await quranCom(S.no);
  if (q.verses.length !== S.ayat) throw new Error(`${S.no}: ${q.verses.length} ayat from Quran.com, expected ${S.ayat}`);
  if (q.sources.length !== S.ayat) throw new Error(`${S.no}: ${q.sources.length} rows in sources, expected ${S.ayat}`);
  const entry = { no: S.no, name: S.name, arName: S.arName, mean: S.mean, ayat: [] }, srcIds = [], apiCounts = [], clipMs = [], shortClips = [];
  let ayahFiles = 0, wordFiles = 0, tOK = true, wordsOK = true;
  for (const v of q.verses) {
    const n = v.verse_number, ws = v.words.filter(w => w.char_type_name === 'word'), aid = p3(S.no) + p3(n), src = q.sources.find(x => x.ayah === n);
    if (src.id !== `quran:${S.no}:${n}`) throw new Error(`unexpected source row ${src.id}`);
    srcIds.push(src.id); apiCounts.push(ws.length);
    const ar = arabicWords(v.text_indopak, ws.length, `${S.no}:${n}`);
    const words = ws.map((w, i) => {
      const wid = aid + p3(i + 1), g = gloss[wid]; if (!g) throw new Error(`no gloss decision for ${wid}`);
      if (g.src !== undefined && g.src !== w.translation.text) throw new Error(`${wid}: Quran.com gloss changed to "${w.translation.text}" (decision was made for "${g.src}")`);
      if (!(wid in emoji)) throw new Error(`no emoji decision for ${wid}`);
      lintEmoji(wid, emoji[wid]); usedGloss.add(wid); seenWordIds.add(wid);
      return { ar: ar[i], id: g.id, src: w.translation.text, emo: emoji[wid], a: wid };
    });
    const seg = q.audio[n - 1].audio.segments;
    if (seg.length !== ws.length) throw new Error(`${aid}: ${seg.length} timing segments but ${ws.length} words`);
    // ayah audio: the Quran.com file of the same recording, re-encoded like the existing audio/a files (mono, 44.1 kHz, 64 kbps)
    const aPath = path.join(ROOT, 'audio/a', `${aid}.mp3`), dl = await getFile(CDN + q.audio[n - 1].audio.url, `${aid}.mp3`);
    if (!has('--no-audio')) {
      sh('ffmpeg', ['-v', 'error', '-y', '-i', dl, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', aPath]);
      ayahFiles++;
    }
    const srcAudio = fs.existsSync(aPath) ? aPath : dl, total = durMs(srcAudio);
    if (Math.abs(total - durMs(dl)) > 60) console.warn(`WARNING ${aid}: local file ${total} ms vs Quran.com ${durMs(dl)} ms`);
    const e = envelope(pcm(srcAudio)), bounds = findBounds(e, seg, ar), edges = [0, ...bounds.map(b => b.ms), total];
    const t = edges.slice();
    if (t.length !== words.length + 1) tOK = false; if (words.length !== ws.length) wordsOK = false;
    words.forEach((w, k) => {
      const start = edges[k], end = edges[k + 1], d = (end - start) / 1000, tail = Math.min(0.012, d / 4);
      clipMs.push(end - start); if (end - start < 120) shortClips.push(`${S.no}:${n} #${k + 1}`);
      if (!has('--no-audio')) {
        // same recipe as tools/recut-words.mjs: trim inside the filter, reset timestamps, then 6 ms fade in / 12 ms fade out.
        // ffmpeg 8's libmp3lame can fail ("inadequate AVFrame plane padding") when atrim ends at the end of the file, so the last
        // word is trimmed from its start to the end of the file (no end=), and any other failure is retried with a padded frame size.
        const trim = k === words.length - 1 ? `atrim=start=${(start / 1000).toFixed(3)}` : `atrim=start=${(start / 1000).toFixed(3)}:end=${(end / 1000).toFixed(3)}`;
        const fades = `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.006,afade=t=out:st=${(d - tail).toFixed(3)}:d=${tail.toFixed(3)}`, dest = path.join(ROOT, 'audio/w', `${w.a}.mp3`);
        const enc = af => sh('ffmpeg', ['-v', 'error', '-y', '-i', srcAudio, '-af', af, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', dest], { stdio: 'pipe' });
        try { enc(`${trim},${fades}`); } catch { enc(`${trim},${fades},asetnsamples=n=1152:p=0`); }
        wordFiles++;
      }
      if (k < bounds.length) report.push({ ref: `${S.no}:${n}`, k: k + 1, left: w.ar, right: words[k + 1].ar, ms: bounds[k].ms, est: bounds[k].est, depth: bounds[k].depth, tier: bounds[k].tier, reasons: bounds[k].reasons, lenL: end - start, lenR: edges[k + 2] - end });
    });
    entry.ayat.push({ n, ar: cleanAyah(v.text_indopak), lat: ws.map(w => w.transliteration.text).join(' '), tr: src.indonesian, a: aid, w: words, t });
  }
  // verify the files that exist on disk
  let missing = [];
  if (!has('--no-audio')) for (const a of entry.ayat) { if (!fs.existsSync(path.join(ROOT, 'audio/a', `${a.a}.mp3`))) missing.push(a.a); for (const w of a.w) { const f = path.join(ROOT, 'audio/w', `${w.a}.mp3`); if (!fs.existsSync(f)) missing.push(w.a); else { const d = durMs(f); if (d < 120) shortClips.push(`file ${w.a} ${d} ms`); } } }
  const checks = {
    ayatCount: entry.ayat.length, ayatExpected: S.ayat,
    wordsPerAyah: entry.ayat.map(a => a.w.length), quranComWordsPerAyah: apiCounts,
    wordCountsMatchQuranCom: entry.ayat.every((a, i) => a.w.length === apiCounts[i]),
    tLengthIsWordsPlusOne: entry.ayat.every(a => a.t.length === a.w.length + 1) && tOK,
    tStrictlyIncreasing: entry.ayat.every(a => a.t.every((x, i) => i === 0 || x > a.t[i - 1])),
    trIdenticalToSources: entry.ayat.every((a, i) => a.tr === q.sources[i].indonesian),
    ayahAudioFiles: has('--no-audio') ? 'skipped' : entry.ayat.length - missing.filter(m => m.length === 6).length,
    wordAudioFiles: has('--no-audio') ? 'skipped' : entry.ayat.reduce((n, a) => n + a.w.length, 0) - missing.filter(m => m.length === 9).length,
    missingAudio: missing, shortestWordClipMs: Math.min(...clipMs), clipsUnder120ms: shortClips,
  };
  const out = { ...entry, sources: srcIds, checks };
  const line = o => JSON.stringify(o);
  const txt = `{"no":${S.no},"name":${line(S.name)},"arName":${line(S.arName)},"mean":${line(S.mean)},\n"ayat":[\n${entry.ayat.map(line).join(',\n')}],\n"sources":${line(srcIds)},\n"checks":${line(checks)}}\n`;
  JSON.parse(txt); fs.writeFileSync(path.join(ROOT, `content/dagang/surah-${S.no}.json`), txt);
  summary[S.no] = { ...checks, words: checks.wordsPerAyah.reduce((a, b) => a + b, 0) };
  console.log(`surah ${S.no}: ${entry.ayat.length} ayat, ${summary[S.no].words} words, shortest clip ${checks.shortestWordClipMs} ms, ${shortClips.length} clips < 120 ms, missing ${missing.length}`);
}

if (has('--pin-src')) { // freeze the Quran.com gloss next to each decision so a later upstream change is noticed
  for (const S of todo) { const d = JSON.parse(fs.readFileSync(path.join(ROOT, `content/dagang/surah-${S.no}.json`), 'utf8')); for (const a of d.ayat) for (const w of a.w) gloss[w.a].src = w.src; }
  const keys = Object.keys(gloss).sort();
  fs.writeFileSync(path.join(ROOT, 'tools/dagang-glosses.json'), '{\n"_readme":' + JSON.stringify(gloss._readme) + ',\n' + keys.filter(k => k[0] !== '_').map(k => `"${k}":${JSON.stringify(gloss[k])}`).join(',\n') + '\n}\n');
  console.log('pinned src into tools/dagang-glosses.json');
}
if (todo.length !== SURAHS.length) { console.log('partial run (--only): docs/DAGANG_DATA.md not rewritten'); process.exit(0); }
const extra = Object.keys(gloss).filter(k => k[0] !== '_' && !usedGloss.has(k)); if (extra.length) throw new Error('glosses for words that do not exist: ' + extra.join(','));

// ---------- docs/DAGANG_DATA.md ----------
const files = SURAHS.map(s => JSON.parse(fs.readFileSync(path.join(ROOT, `content/dagang/surah-${s.no}.json`), 'utf8')));
const wordsAll = files.flatMap(f => f.ayat.flatMap(a => a.w.map(w => ({ ...w, ref: `${f.no}:${a.n}`, pos: +w.a.slice(6) }))));
const changed = wordsAll.filter(w => w.id !== w.src);
const flagged = wordsAll.filter(w => gloss[w.a].flag);
const tierN = t => report.filter(r => r.tier === t).length;
const ranked = report.filter(r => r.tier !== 'C').map(r => ({ ...r, short: r.lenL < 250 || r.lenR < 250 })).sort((a, b) => (a.tier === b.tier ? a.depth - b.depth : a.tier < b.tier ? -1 : 1));
const shortC = report.filter(r => r.tier === 'C' && (r.lenL < 250 || r.lenR < 250));
const perAyah = {}; for (const r of report) { const o = (perAyah[r.ref] ??= { A: 0, B: 0, C: 0 }); o[r.tier]++; }
const totalBounds = report.length, totalWords = wordsAll.length, totalAyat = files.reduce((n, f) => n + f.ayat.length, 0);
const esc = s => String(s).replace(/\|/g, '\\|');
const emoCount = wordsAll.filter(w => w.emo).length;
const md = `# Data for six new surahs (Al-Fatihah, Al-'Adiyat, Al-Qari'ah, At-Takatsur, Al-'Asr, Al-Humazah)

Generated by \`tools/build-dagang-surahs.mjs\`. Output: \`content/dagang/surah-<no>.json\` (one \`DATA\` entry each, same shape as \`js/data.js\` plus \`sources\` and \`checks\`), \`audio/a/<SSSAAA>.mp3\` (${totalAyat} ayat) and \`audio/w/<SSSAAAWWW>.mp3\` (${totalWords} word clips). Nothing in \`js/\`, \`css/\`, \`index.html\` or the 10 existing surahs was touched.

| surah | file | ayat | words |
|---|---|---|---|
${files.map(f => `| ${f.no} ${f.name} (${f.mean}) | \`content/dagang/surah-${f.no}.json\` | ${f.ayat.length} | ${f.checks.wordsPerAyah.reduce((a, b) => a + b, 0)} |`).join('\n')}

## Sources (nothing was written from memory)
- **Ayah text, word text, word-by-word gloss, transliteration:** Quran.com API v4, \`GET ${API}/verses/by_chapter/<no>?words=true&word_fields=text_indopak,transliteration&language=id&per_page=50&fields=text_indopak\`. Ayah and word Arabic = \`text_indopak\` (the same script variant as \`js/data.js\`), \`lat\` = the word transliterations joined by spaces, \`src\` = the Indonesian word gloss, unchanged.
- **Ayah translation (\`tr\`):** the Supabase \`sources\` table (\`quran:S:A\`, "Terjemah Kemenag RI (via quran.com, resource 33)"), verbatim. Every id used is listed in each file's \`sources\` array.
- **Audio:** reciter Mishari Alafasy (Quran.com recitation id 7). \`GET ${API}/verses/by_chapter/<no>?audio=7\` gives, per ayah, the file (\`Alafasy/mp3/SSSAAA.mp3\` on \`${CDN}\`, identical to everyayah.com \`Alafasy_128kbps\`) and Quran.com's published word segments. The file is re-encoded with ffmpeg exactly like the existing \`audio/a\` files (mono, 44.1 kHz, 64 kbps). Test: re-encoding Quran.com's 105:1 this way gives a file of exactly the same size and length as the existing \`audio/a/105001.mp3\` (63,897 bytes, 7.890544 s).
- **No TTS anywhere.** Word clips are cut from the ayah file with the recipe of \`tools/recut-words.mjs\`: \`atrim\` + \`asetpts\` inside the filter, 6 ms fade-in, 12 ms fade-out, mono, 44.1 kHz, 64 kbps (the documented atrim bug fix is used).

## How to re-run
\`\`\`
node tools/build-dagang-surahs.mjs               # everything (needs network the first time; downloads are cached in $TMPDIR/km-dagang-cache)
node tools/build-dagang-surahs.mjs --only=104    # one surah (docs are not rewritten)
node tools/build-dagang-surahs.mjs --no-audio    # data only
node tools/build-dagang-surahs.mjs --calibrate   # only the self-test against the 10 existing surahs
\`\`\`
Meaning decisions live in \`tools/dagang-glosses.json\` (\`id\`, why it differs from \`src\`, flags) and \`tools/dagang-word-emoji.json\`. The script stops if Quran.com changes a gloss after a decision was made for it, if a word has no decision, or if an emoji is a face, an eye or an animal. The script refuses to write anything for a surah that is already in \`js/data.js\`.

## Self-test: the same pipeline re-run on the 10 existing surahs
- ${cal.text}
- ${cal.timing}

So the text pipeline reproduces the existing data exactly. The boundary finder is **less accurate than the reviewed boundaries of the existing surahs** (those were looked at on spectrograms). Treat the new boundaries as a good first pass and check the list below with \`cek-audio.html\`.

## Word boundaries: how they were found, and which to check by ear
Method: start from Quran.com's segments (middle between the end of one word and the start of the next), snap to the quietest point within +-80 ms (centre of the quiet plateau). If there is no real dip (less than 8 dB below the surrounding sound, e.g. a nasal hum or a voiced continuation) the Quran.com estimate is kept. Not done automatically: the spectrogram reading rules of \`docs/WORD_AUDIO.md\` (long vowels stay with their word; the boundary goes inside the silence before a stop; where a hum joins two words it goes inside the hum). They are approximated by the "quietest point" rule only, which suits silences before stops but not hums, so every hum is flagged.

**This was checked by signal analysis only, not by ear.** ${totalBounds} boundaries in total, in three tiers:
- **Tier A (${tierN('A')}): no clear dip.** The sound is continuous there (a hum, a long vowel running into the next word, or a soft consonant), so the time is only Quran.com's estimate. In the self-test only about two thirds of these were within 80 ms of the reviewed boundary. **Listen to all of them.**
- **Tier B (${tierN('B')}): weak dip, a nasal join, or moved 60 ms or more from Quran.com.** Mostly right in the self-test but check by ear, especially nasal joins.
- **Tier C (${tierN('C')}): a clear dip (12 dB or more) within 60 ms of Quran.com's estimate.** All of these were right in the self-test; not listed one by one.

Words shorter than 250 ms are risky because an error of 80 ms is a third of the word. The shortest clip is ${Math.min(...files.map(f => f.checks.shortestWordClipMs))} ms; clips under 120 ms: ${files.flatMap(f => f.checks.clipsUnder120ms).join(', ') || 'none'}.${shortC.length ? ` Tier C boundaries that touch a word under 250 ms (check these too): ${shortC.map(r => `${r.ref} #${r.k}`).join(', ')}.` : ''}

Boundaries per ayah (A / B / C), to see where to listen first: ${Object.entries(perAyah).map(([k, v]) => `${k}: ${v.A}/${v.B}/${v.C}`).join('; ')}.

### Tier A and B boundaries
"at" = chosen time in the ayah file (ms), "QC" = Quran.com's estimate, "dip" = how far below the nearby loudest sound the chosen point is. #k = boundary after word k. Tier A first (weakest dip first).

| tier | ayah | # | between | at | QC | dip dB | why |
|---|---|---|---|---|---|---|---|
${ranked.map(r => `| ${r.tier} | ${r.ref} | ${r.k} | ${r.left} \\| ${r.right} | ${r.ms} | ${r.est} | ${r.depth.toFixed(0)} | ${esc(r.reasons.join('; '))}${r.short ? '; word under 250 ms' : ''} |`).join('\n')}

## Glosses
\`src\` is Quran.com's word gloss, never edited. \`id\` is the card text: a minimal tidy-up (one option instead of "a/b", typo fixes, "kamu" instead of "(kalian)", "yang" before adjectives like the existing surahs, consistency with the translation). ${changed.length} of ${totalWords} words differ from \`src\`; the full list is below so a reviewer can see every change. No meaning was replaced from outside knowledge.

### Needs a human (ustaz) decision (${flagged.length} words)
${flagged.map(w => `- **${w.ref} #${w.pos} ${w.ar}** (src "${w.src}", id "${w.id}"): ${gloss[w.a].flag}`).join('\n')}

### Alignment fix in 103:3
Quran.com's Arabic word list for 103:3 is shifted against its glosses (it splits \`وَ\` from \`عَمِلُوا\` and joins \`وَتَوَاصَوۡا بِالصَّبۡرِ\`). The 9 words were rebuilt as \`وَعَمِلُوا\`, ..., \`وَتَوَاصَوۡا\`, \`بِالصَّبۡرِ\`, which matches the 9 glosses, the 9 transliterations and the 9 timing segments. The same kind of shift exists in the existing 107:3 and 109:5.

### Every id that differs from src
| ayah | # | word | src | id | why |
|---|---|---|---|---|---|
${changed.map(w => `| ${w.ref} | ${w.pos} | ${w.ar} | ${esc(w.src)} | ${esc(w.id)} | ${esc(gloss[w.a].why || '')} |`).join('\n')}

## Emoji (\`tools/dagang-word-emoji.json\`)
${emoCount} of ${totalWords} words have an emoji. Rules of \`tools/word-emoji.json\` applied: no faces, eyes or animals (checked by the script, and 👁️ was avoided on purpose: "mata" in 102:7 uses 🔍), nothing for words that refer to Allah (his name, Tuhan, Penguasa, Maha Pengasih/Penyayang, "kepada-Mu", "benar-benar Maha Mengetahui"), nothing for people that no eyeless figure fits, nothing for the insect in 101:4. Function words reuse the emoji of the same Indonesian word in the existing surahs (dari ⬅️, dalam/ke dalam 📥, apa ❓, apabila ⏳, tidak/dan tidak 🚫, sesungguhnya ✅, yang/orang-orang yang 🔗, api 🔥, harta 💰, dada 🫀, manusia 👥, kemudian is new ⏭️). **Decision for Ricky:** in Al-'Adiyat (100:1-3) the three participles (the ones that run, spark and raid) only exist as the horses, but they name actions, so they got action emoji (💨 ✨ ⚔️) and the horses themselves have none. If the rule should be read strictly, empty these three in \`tools/dagang-word-emoji.json\` and re-run.

## Differences from the conventions of the existing surahs
- **Ayah text:** U+0615 in Quran.com's current text is written U+06D7 (the waqf sign the existing data uses for the same marks); invisible RLM/ZWSP marks and private-use glyphs are removed, as in the existing data.
- **Last value of \`t\`:** the length of the ayah file in ms. The existing surahs keep a slightly larger hand-set end value (e.g. 7941 for a 7890 ms file) that times the "Lanjut" button; the new files do not have that cushion. The game code should use the JSON \`t\` (the existing surahs get theirs from \`js/wordcuts.js\`).
- **Al-Fatihah ayah 1 is the Bismillah** (Quran.com / Kemenag numbering, 7 ayat): \`audio/a/001001.mp3\`, \`quran:1:1\`.
- **Boundaries** come from the automatic method above, not from spectrogram review (existing surahs).
- \`arName\` follows the existing style (article, partial diacritics); the names and meanings are the ones given in the task.
- Word emoji for pronoun and function words follow the existing word-emoji file, but some words in these surahs have no equivalent there.
`;
fs.writeFileSync(path.join(ROOT, 'docs/DAGANG_DATA.md'), md);
console.log('wrote docs/DAGANG_DATA.md');
