// audio-analysis.mjs — small signal helpers for checking word boundaries (no dependencies besides ffmpeg).
import { execFileSync } from 'node:child_process';

export const SR = 16000, HOP = 160, WIN = 400, NFFT = 512, NB = 24; // 10 ms hop, 25 ms window, 24 mel-spaced bands

export function decode(file) {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  return new Int16Array(b.buffer, b.byteOffset, b.length >> 1);
}
function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const mel = f => 2595 * Math.log10(1 + f / 700), imel = m => 700 * (10 ** (m / 2595) - 1);
const EDGES = Array.from({ length: NB + 1 }, (_, i) => imel(mel(100) + (mel(5000) - mel(100)) * i / NB));
const HANN = Float64Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1)));

/** Per 10 ms frame: smoothed energy E (dB) and band levels M (dB per mel band). */
export function analyse(x) {
  const n = Math.floor((x.length - WIN) / HOP), E = new Float64Array(n), M = [], re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  for (let f = 0; f < n; f++) {
    re.fill(0); im.fill(0); let s = 0;
    for (let i = 0; i < WIN; i++) { const v = x[f * HOP + i]; s += v * v; re[i] = v * HANN[i]; }
    E[f] = 20 * Math.log10(Math.sqrt(s / WIN) + 1);
    fft(re, im);
    const band = new Float64Array(NB);
    for (let b = 0; b < NB; b++) { let p = 0, c = 0; for (let k = Math.ceil(EDGES[b] * NFFT / SR); k < EDGES[b + 1] * NFFT / SR && k < NFFT / 2; k++) { p += re[k] * re[k] + im[k] * im[k]; c++; } band[b] = 10 * Math.log10(p / Math.max(1, c) + 1); }
    M.push(band);
  }
  const Es = E.map((v, i) => ((E[i - 1] ?? v) + v + (E[i + 1] ?? v)) / 3);
  return { E: Es, M, ms: n * 10 };
}
const avg = (M, a, b) => { const o = new Float64Array(NB); let c = 0; for (let f = Math.max(0, a); f <= Math.min(M.length - 1, b); f++) { for (let k = 0; k < NB; k++) o[k] += M[f][k]; c++; } return c ? o.map(v => v / c) : o; };
/** Spectral change at `ms`: mean absolute difference (dB) between the average sound 10–50 ms before and after. A cut in
    the middle of a steady vowel scores low (about 1–2 dB); a closure, burst, fricative or new vowel scores high (5+ dB). */
export function novelty(A, ms) {
  const f = Math.round(ms / 10), a = avg(A.M, f - 5, f - 1), b = avg(A.M, f + 1, f + 5);
  let d = 0; for (let k = 0; k < NB; k++) d += Math.abs(a[k] - b[k]); return d / NB;
}
/** Best position near `ms` (within ±w): the frame with the highest novelty. */
export function peak(A, ms, w) {
  let best = { ms, nov: -1 }; for (let m = Math.max(10, Math.round((ms - w) / 10) * 10); m <= ms + w; m += 10) { const nv = novelty(A, m); if (nv > best.nov) best = { ms: m, nov: nv }; }
  return best;
}
export const energyAt = (A, ms) => A.E[Math.max(0, Math.min(A.E.length - 1, Math.round(ms / 10)))];
