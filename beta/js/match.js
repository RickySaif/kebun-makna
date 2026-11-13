// match.js — does a recitation keep the meaning? Compares the ayah's words with what the model heard, letter by letter.
// Goal (Ricky): not tajwid perfection, but no change of meaning. In Arabic one consonant changes the word
// (qalb قلب "heart" vs kalb كلب "dog"), so:
//   • HARD (the word is wrong): a different consonant (ق/ك, ح/ه, ع/ء, ص/س, ض/د, ط/ت, ظ/ذ/ز, ث/س …), or a consonant added or dropped.
//   • SOFT (ignored): harakat and tajwid marks, hamza seats (أ إ آ ٱ ؤ ئ ء), ة/ه, ى/ي, and the long-vowel letters ا و ي —
//     the mushaf spelling (الكفرون, عبدون, لايلف) and the model's spelling (الكافرون, عابدون, لإيلاف) differ in exactly these.
//   • The assimilated lam of al- before a sun letter (النَّاس is said an-nās) may be missing from what was heard.
// Pure module (no DOM) so tests can run it in Node.

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/;
const SHADDA = 'ّ';
const SOFT = new Set(['ا', 'و', 'ي']);
const SUN = new Set([...'تثدذرزسشصضطظلن']);
const BASE = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه', 'ک': 'ك', 'ی': 'ي' };

/** Letters of one word: [{c, soft}] with marks removed. Uses the vocalised text to spot an assimilated (silent) lam. */
export function letters(word) {
  const s = String(word), out = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (MARKS.test(ch)) continue;
    const c = BASE[ch] || ch;
    if (!/[ء-ي]/.test(c)) continue;
    let soft = SOFT.has(c);
    if (c === 'ل' && out.length && out[out.length - 1].c === 'ا') {
      // al- + sun letter: the next letter carries a shadda and the lam itself has no vowel → the lam is not pronounced
      let j = i + 1, own = '';
      while (j < s.length && MARKS.test(s[j])) own += s[j++];
      let k = j + 1, next = '';
      while (k < s.length && MARKS.test(s[k])) next += s[k++];
      if (!own && j < s.length && SUN.has(BASE[s[j]] || s[j]) && next.includes(SHADDA)) soft = true;
    }
    out.push({ c, soft });
  }
  return out;
}
const plain = w => letters(w).map(x => x.c).join('');

/** Weighted letter alignment. Returns { hard, cost }: hard = number of meaning-changing edits. */
export function compare(expWord, heardWord) {
  const E = letters(expWord), H = letters(heardWord).map(x => ({ c: x.c, soft: SOFT.has(x.c) }));
  const n = E.length, m = H.length, EPS = 0.01;
  // D[i][j] = [hard, cost]; compare lexicographically on cost (hard edits weigh 1, soft ones EPS)
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  D[0][0] = [0, 0];
  const put = (i, j, h, c) => { const d = D[i][j]; if (!d || c < d[1]) D[i][j] = [h, c]; };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const d = D[i][j]; if (!d) continue;
    if (i < n) { const hard = !E[i].soft; put(i + 1, j, d[0] + hard, d[1] + (hard ? 1 : EPS)); }
    if (j < m) { const hard = !H[j].soft; put(i, j + 1, d[0] + hard, d[1] + (hard ? 1 : EPS)); }
    if (i < n && j < m) {
      const same = E[i].c === H[j].c, bothSoft = SOFT.has(E[i].c) && H[j].soft;
      put(i + 1, j + 1, d[0] + (same || bothSoft ? 0 : 1), d[1] + (same ? 0 : bothSoft ? EPS : 1));
    }
  }
  const [hard, cost] = D[n][m];
  return { hard, cost };
}

/**
 * Align the ayah's words with the transcript (in order) and grade each word.
 * Returns { res:[{i, word, heard, st:'ok'|'bad'|'miss'}], ok, bad, miss, score }.
 * 'bad' = heard, but a letter changed (meaning may change). 'miss' = not heard at all.
 */
export function check(expected, heard) {
  const R = String(heard).split(/\s+/).filter(w => plain(w));
  const n = expected.length, m = R.length, NEG = -1e9;
  // word-pair score: 1 for a perfect match, falling with hard edits (relative to word length)
  const pair = (e, h) => { const { hard, cost } = compare(e, h); const L = Math.max(1, plain(e).length); return { hard, s: 1 - Math.min(1, cost / L) }; };
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(NEG)), B = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  D[0][0] = 0;
  const upd = (i, j, v, bk) => { if (v > D[i][j]) { D[i][j] = v; B[i][j] = bk; } };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const v = D[i][j]; if (v === NEG) continue;
    if (i < n) upd(i + 1, j, v - 0.35, { t: 'miss', i, j });
    if (j < m) upd(i, j + 1, v - 0.15, { t: 'extra', i, j });
    if (i < n && j < m) { const p = pair(expected[i], R[j]); upd(i + 1, j + 1, v + p.s - 0.5, { t: 'm', i, j, n: 1, hard: p.hard, h: R[j] }); }
    // one expected word heard as two (يايها → يا أيها)
    if (i < n && j + 1 < m) { const p = pair(expected[i], R[j] + R[j + 1]); upd(i + 1, j + 2, v + p.s - 0.55, { t: 'm', i, j, n: 1, hard: p.hard, h: R[j] + ' ' + R[j + 1] }); }
    // two expected words heard as one (برب الناس → بربناس)
    if (i + 1 < n && j < m) { const p = pair(expected[i] + expected[i + 1], R[j]); if (p.hard === 0) upd(i + 2, j + 1, v + 2 * p.s - 1.05, { t: 'm', i, j, n: 2, hard: 0, h: R[j] }); }
  }
  const res = expected.map((w, i) => ({ i, word: w, heard: '', st: 'miss' }));
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = B[i][j]; if (!b) break;
    if (b.t === 'm') for (let k = 0; k < b.n; k++) res[b.i + k] = { i: b.i + k, word: expected[b.i + k], heard: b.h, st: b.hard ? 'bad' : 'ok' };
    i = b.i; j = b.j;
  }
  const ok = res.filter(r => r.st === 'ok').length, bad = res.filter(r => r.st === 'bad').length;
  return { res, ok, bad, miss: n - ok - bad, score: n ? ok / n : 0 };
}
