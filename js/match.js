// match.js — does a recitation keep the meaning? Compares the ayah's words with what the model heard, letter by letter.
// Goal (Ricky): not tajwid perfection, but no change of meaning. In Arabic one consonant changes the word
// (qalb قلب "heart" vs kalb كلب "dog"), so:
//   • HARD (the word is wrong): a consonant that sounds clearly different (ن/م, ب/ف, ر/ل …), or a consonant added or dropped.
//     Letters that sound alike to a non-native child are accepted (see GROUP below, Ricky 2026-11-14).
//   • SOFT (ignored): harakat and tajwid marks, hamza seats (أ إ آ ٱ ؤ ئ ء), ة/ه, ى/ي, and the long-vowel letters ا و ي —
//     the mushaf spelling (الكفرون, عبدون, لايلف) and the model's spelling (الكافرون, عابدون, لإيلاف) differ in exactly these.
//   • The assimilated lam of al- before a sun letter (النَّاس is said an-nās) may be missing from what was heard.
// Pure module (no DOM) so tests can run it in Node.

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/;
const SHADDA = 'ّ';
const SOFT = new Set(['ا', 'و', 'ي', 'ع']);
// v4 (Ricky, 2026-11-14): the players are not native Arabic speakers. Letters that sound alike to an Indonesian child
// count as right: ا/ء/ع · ه/ح/خ · س/ص/ث · ز/ذ/ظ · ق/ك · د/ض · ت/ط. (ع is also soft like ا: dropping it is not an error.)
const GROUP = {};
['اع', 'هحخ', 'سصث', 'زذظ', 'قك', 'دض', 'تط'].forEach((g, i) => [...g].forEach(c => GROUP[c] = i));
const alike = (a, b) => a === b || (GROUP[a] !== undefined && GROUP[a] === GROUP[b]);
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
    out.push({ c, soft, raw: ch });
  }
  return out;
}
const plain = w => letters(w).map(x => x.c).join('');

/**
 * Weighted letter alignment. Returns { hard, cost }: hard = number of meaning-changing edits.
 * opts.freeStart / opts.freeEnd: letters heard before / after the word cost nothing. Used only at the edges of a
 * reading: the model pads short recordings (سَيَدْخُلُونَ for يَدۡخُلُوۡنَ, رَبَّكَ for رَبَّ, كَبِأَصْحَابِ for بِاَصۡحٰبِ,
 * even on Alafasy's own clips). A changed, missing or added letter INSIDE the word always counts.
 */
export function compare(expWord, heardWord, opts = {}) {
  const atEnd = !!opts.freeEnd;
  const E = letters(expWord), H = letters(heardWord).map(x => ({ c: x.c, soft: SOFT.has(x.c), raw: x.raw }));
  // a word with tanwin read on its own is often heard with its "-n" written out (أحدٌ → أحدن): not an error
  if (/[\u064B-\u064D]\s*$/.test(String(expWord)) && H.length && H[H.length - 1].c === 'ن') H[H.length - 1].soft = true;
  // the last word of what was read, ending in a short vowel (اَعُوۡذُ): the model often writes the breath after the vowel
  // as an extra ه (أعوذه). Only at the very end of the reading, and only if the word itself doesn't end in ه.
  const lastE = E.length ? E[E.length - 1].c : '';
  if (atEnd && /[\u064E-\u0650]\s*$/.test(String(expWord)) && lastE !== 'ه' && H.length > E.length && H[H.length - 1].c === 'ه') H[H.length - 1].soft = true;
  const n = E.length, m = H.length, EPS = 0.01;
  // D[i][j] = [hard, cost]; compare lexicographically on cost (hard edits weigh 1, soft ones EPS)
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  D[0][0] = [0, 0];
  if (opts.freeStart) for (let j = 1; j <= m; j++) D[0][j] = [0, j * EPS / 10];
  const endAt = [];
  // D[i][j] = [hard, cost, back]; back = [pi, pj, op] (op: 'skip' free edge, 'del' expected letter not heard,
  // 'ins' extra heard letter, 'sub' different letter, 'eq' same / both soft)
  const put = (i, j, h, c, back) => { const d = D[i][j]; if (!d || c < d[1]) D[i][j] = [h, c, back]; };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const d = D[i][j]; if (!d) continue;
    // after skipping heard letters for free, the word's first letter must be read (aligned), not dropped
    if (i < n && !(opts.freeStart && i === 0 && j > 0)) { const hard = !E[i].soft; put(i + 1, j, d[0] + hard, d[1] + (hard ? 1 : EPS), [i, j, 'del']); }
    if (j < m && !(opts.freeStart && i === 0)) { const hard = !H[j].soft; put(i, j + 1, d[0] + hard, d[1] + (hard ? 1 : EPS), [i, j, 'ins']); }
    if (i < n && j < m) {
      const same = alike(E[i].c, H[j].c), bothSoft = SOFT.has(E[i].c) && SOFT.has(H[j].c);
      const h = d[0] + (same || bothSoft ? 0 : 1), c = d[1] + (same ? 0 : bothSoft ? EPS : 1);
      put(i + 1, j + 1, h, c, [i, j, same || bothSoft ? 'eq' : 'sub']);
      // the word's last letter aligned with a heard letter: anything heard after it may be ignored (freeEnd)
      if (i + 1 === n && (!endAt[j + 1] || c < endAt[j + 1][1])) endAt[j + 1] = [h, c, [i, j, same || bothSoft ? 'eq' : 'sub']];
    }
  }
  let best = D[n][m], endJ = m;
  if (opts.freeEnd) for (let j = 1; j < m; j++) if (endAt[j] && endAt[j][1] + (m - j) * EPS / 10 < best[1]) { best = [endAt[j][0], endAt[j][1] + (m - j) * EPS / 10, endAt[j][2]]; endJ = j; }
  // walk back: the meaning-changing letters only (what the child should fix)
  const ops = [];
  let i = n, j = endJ, back = best[2];
  while (back && (i > 0 || j > 0)) {
    const [pi, pj, op] = back;
    if (op === 'sub') ops.push({ op, e: E[pi].raw, h: H[pj].raw, at: pi });
    else if (op === 'del' && !E[pi].soft) ops.push({ op, e: E[pi].raw, at: pi });
    else if (op === 'ins' && !H[pj].soft) ops.push({ op, h: H[pj].raw, at: pi });
    i = pi; j = pj; back = D[i][j] ? D[i][j][2] : null;
  }
  return { hard: best[0], cost: best[1], ops: ops.reverse() };
}

/**
 * One word read on its own (word pages). The model pads short recordings: it writes sounds before or after the word
 * (وَشَرِّبْ for شَرِّ, يُكَذِّبُونَ for يُكَذِّبُ), so letters heard BEFORE or AFTER the word are ignored; a changed,
 * missing or added letter INSIDE the word still counts. Returns the same shape as check() for one word.
 */
export function checkWord(word, heard) {
  const h = String(heard).replace(/\s+/g, ''), L = weight(word);
  const cmp = plain(h) ? compare(word, h, { freeStart: true, freeEnd: true }) : null;
  const hard = cmp ? Math.min(cmp.hard, L) : L;
  const st = !plain(h) ? 'miss' : hard ? 'bad' : 'ok';
  return { res: [{ i: 0, word, heard: String(heard).trim(), st, hard, ops: cmp && hard ? cmp.ops : [] }], ok: +(st === 'ok'), bad: +(st === 'bad'), miss: +(st === 'miss'), score: st === 'ok' ? 1 : 0, acc: Math.max(0, 1 - hard / L) };
}

/** Letters that carry the meaning (consonants), used as the weight of a word in the accuracy score. */
export const weight = w => Math.max(1, letters(w).filter(x => !x.soft).length);

/**
 * Align the ayah's words with the transcript (in order) and grade each word.
 * Returns { res:[{i, word, heard, st:'ok'|'bad'|'miss', hard}], ok, bad, miss, score, acc }.
 * acc = share of meaning letters read right (0..1): a missing word counts all its letters wrong, a wrong word its
 * changed letters. This is the "Ketepatan" the child sees.
 * 'bad' = heard, but a letter changed (meaning may change). 'miss' = not heard at all.
 */
export function check(expected, heard) {
  const R = String(heard).split(/\s+/).filter(w => plain(w));
  const n = expected.length, m = R.length, NEG = -1e9;
  // word-pair score: 1 for a perfect match, falling with hard edits (relative to word length)
  const pair = (e, h, start, end) => { const { hard, cost } = compare(e, h, { freeStart: start, freeEnd: end }); const L = Math.max(1, plain(e).length); return { hard, s: 1 - Math.min(1, cost / L) }; };
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(NEG)), B = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));
  D[0][0] = 0;
  const upd = (i, j, v, bk) => { if (v > D[i][j]) { D[i][j] = v; B[i][j] = bk; } };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const v = D[i][j]; if (v === NEG) continue;
    if (i < n) upd(i + 1, j, v - 0.35, { t: 'miss', i, j });
    if (j < m) upd(i, j + 1, v - 0.15, { t: 'extra', i, j });
    if (i < n && j < m) { const p = pair(expected[i], R[j], i === 0 && j === 0, i === n - 1 && j === m - 1); upd(i + 1, j + 1, v + p.s - 0.5, { t: 'm', i, j, n: 1, hard: p.hard, h: R[j] }); }
    // one expected word heard as two (يايها → يا أيها)
    if (i < n && j + 1 < m) { const p = pair(expected[i], R[j] + R[j + 1], i === 0 && j === 0, i === n - 1 && j + 1 === m - 1); upd(i + 1, j + 2, v + p.s - 0.55, { t: 'm', i, j, n: 1, hard: p.hard, h: R[j] + ' ' + R[j + 1] }); }
    // two expected words heard as one (برب الناس → بربناس)
    if (i + 1 < n && j < m) { const p = pair(expected[i] + expected[i + 1], R[j], i === 0 && j === 0, i + 1 === n - 1 && j === m - 1); if (p.hard === 0) upd(i + 2, j + 1, v + 2 * p.s - 1.05, { t: 'm', i, j, n: 2, hard: 0, h: R[j] }); }
  }
  const res = expected.map((w, i) => ({ i, word: w, heard: '', st: 'miss', hard: weight(w) }));
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = B[i][j]; if (!b) break;
    if (b.t === 'm') for (let k = 0; k < b.n; k++) res[b.i + k] = { i: b.i + k, word: expected[b.i + k], heard: b.h, st: b.hard ? 'bad' : 'ok', hard: Math.min(b.hard, weight(expected[b.i + k])) };
    i = b.i; j = b.j;
  }
  for (const r of res) if (r.st === 'bad') r.ops = compare(r.word, r.heard.replace(/\s+/g, ''), { freeStart: r.i === 0, freeEnd: r.i === n - 1 }).ops;
  const ok = res.filter(r => r.st === 'ok').length, bad = res.filter(r => r.st === 'bad').length;
  const W = expected.reduce((t, w) => t + weight(w), 0), lost = res.reduce((t, r) => t + r.hard, 0);
  return { res, ok, bad, miss: n - ok - bad, score: n ? ok / n : 0, acc: W ? Math.max(0, 1 - lost / W) : 0 };
}
