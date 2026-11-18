// siram.js — watering = reading the surah aloud (docs/RANCANGAN_15_SURAT.md, Tahap A and A2).
// Each watering: read the surah (≤ 7 ayat) or one half of it, with less help every time it goes well:
//   1 Tirukan (listen first, full text) · 2 Baca sendiri (full text, ▶ on request) · 3 Huruf awal (first letter of each word)
//   4 Kata pertama (first word of each ayah + its meaning) · 5 Hafalan (no text)
// Hidden words can be peeked (💡 tap). A reading passes at ≥ 50% (PASS in recite.js, the same bar as everywhere).
// Pass → next level next time. Two failed waterings in a row → one level down. Then one meaning question.
// "Siap" (ready for the next surah, judged by the game): every part passed at level 4–5 with at most one peek per ayah,
// and at least 2 meaning questions right. Watering goes on after Siap. (Tahap A shows the badge; the gate is Tahap B.)
// Once a day a small village event wraps the watering (Ibu, Adik, the quest's villager, a goat, an errand) so it never
// feels like the same chore. Events say nothing about religious practice (no claims without a `sources` row).
// Every Arabic word, meaning and audio comes from DATA; nothing here is new religious text.
import { hooks } from './hooks.js';
import { $, esc, panel, pick, shuffle } from './ui.js';
import { S, save, fill } from './state.js';
import { BY, DATA, KAKEK, ORDER, QUEST } from './data.js';
import { makeQ, renderQ, celebrate } from './lesson.js';
import { practice, model } from './recite.js';
import { FLAGS } from './config.js';
import { ICON, portrait } from './render.js';
import { sfx, voice } from './audio.js';
import { logActivity } from './api.js';

export const LEVELS = [null,
  { name: 'Tirukan', lead: 'Dengarkan dulu bacaannya, lalu ketuk 🎙️ dan tirukan.' },
  { name: 'Baca sendiri', lead: 'Baca sendiri. Kalau lupa, tekan ▶ Dengar.' },
  { name: 'Huruf awal', lead: 'Hanya huruf awal tiap kata yang terlihat. Baca dari ingatan. Lupa? Ketuk katanya untuk 💡 intip.' },
  { name: 'Kata pertama', lead: 'Hanya kata pertama tiap ayat, dan artinya di bawah. Baca dari ingatan. Lupa? Ketuk ••• untuk 💡 intip.' },
  { name: 'Hafalan', lead: 'Hafalan! Baca dari ingatan. Lupa? Ketuk ••• untuk 💡 intip.' },
];
const IBU = { npc: 'Ibu', look: { girl: true, hijab: '#3A9D6A', shirt: '#3A9D6A', hair: '#2B1D12', pants: '#2F4F6F' } };
const ADIK = { npc: 'Adik', look: { hair: '#2B1D12', shirt: '#F4C430', pants: '#3E5C8A' } };

/* ---------- state ---------- */
// S.ladder[no] = {lv, down (failed waterings in a row), n (waterings), mean (meaning answers right), part, okp {part: true}}
const L = no => { S.ladder = S.ladder || {}; return S.ladder[no] || (S.ladder[no] = { lv: 1, down: 0, n: 0, mean: 0, part: 0, okp: {} }); };
export const isSiap = no => !!(S.siap && S.siap[no]);
export const ladderOf = no => (S.ladder && S.ladder[no]) || null;
// Surahs finished before this update count as Siap (decision 2026-11-17: nothing gets locked again).
function migrate() {
  if (S.siapInit) return;
  S.siapInit = 1; S.siap = S.siap || {};
  ORDER.forEach(n => { if (S.solved && S.solved[n]) S.siap[n] = 'lama'; });
  save();
}
// a surah of up to 7 ayat is read whole; a longer one in two halves, alternating
const chunks = no => { const a = BY[no].ayat; if (a.length <= 7) return [a]; const h = Math.ceil(a.length / 2); return [a.slice(0, h), a.slice(h)]; };

/* ---------- the masks ---------- */
const MARK = /[ؐ-ًؚ-ٰٟۖ-ۭ]/;
const NONJOIN = 'اأإآٱءدذرزوؤة';
// the first letter of a word with its marks (بِـ…). A word that starts with the article (ال) shows the article and the
// letter after it (النـ…), because "a…" alone would be the same hint for every such word.
export function firstLetter(ar) {
  const ch = [...ar], base = []; // indexes of the letters (not marks)
  ch.forEach((c, i) => { if (!MARK.test(c)) base.push(i); });
  if (!base.length) return ar;
  const art = 'اٱأ'.includes(ch[base[0]]) && ch[base[1]] === 'ل' && base.length > 3;
  const upto = art ? base[2] : base[0]; let j = upto + 1; while (j < ch.length && MARK.test(ch[j])) j++;
  const last = ch[upto];
  return ch.slice(0, j).join('') + (NONJOIN.includes(last) ? '…' : 'ـ…');
}

/* ---------- small pieces of UI ---------- */
function talk(body, who, lines, last, next) {
  let k = 0;
  const step = () => {
    if (k >= lines.length) return next();
    const line = fill(lines[k++]);
    const v = $(`<div class="frame"><div style="display:flex;gap:10px;align-items:flex-start"><img alt="" src="${portrait(who.look)}" style="width:56px;height:56px;border:3px solid var(--ink);border-radius:4px;image-rendering:pixelated;flex:none"><div><div style="font-weight:700;color:var(--red)">${esc(who.npc)}</div><p style="margin:2px 0 0">${esc(line)}</p></div></div><button class="btn green block" style="margin-top:12px">${esc(k >= lines.length ? last : 'Lanjut ▸')}</button></div>`);
    v.querySelector('button').onclick = step; body.replaceChildren(v);
  };
  step();
}
const coins = n => { S.coins += n; save(); sfx.coin(); };
function question(body, q, title, done) {
  if (!q) return done(false);
  const v = $(`<div class="frame"><h2>${esc(title)}</h2><div class="qh"></div><button class="btn green block" id="nx" style="margin-top:12px" hidden>Lanjut ▸</button></div>`);
  body.replaceChildren(v);
  let ok = false;
  renderQ(v.querySelector('.qh'), q, (good, ms, fb) => {
    ok = good; if (good) { sfx.water(); fb.className = 'fb good'; fb.textContent = pick(['Benar!', 'Hebat!', 'Pintar!']); } else { sfx.bad(); fb.className = 'fb bad'; fb.textContent = 'Tidak apa-apa, lihat jawaban yang hijau.'; }
    v.querySelector('#nx').hidden = false;
  });
  v.querySelector('#nx').onclick = () => done(ok);
}

/* ---------- one reading ---------- */
function read(body, no, done) {
  const st = L(no), ch = chunks(no), part = st.part % ch.length, list = ch[part], lvl = st.lv, s = BY[no];
  const words = list.flatMap(a => a.w), firsts = new Set(); { let k = 0; list.forEach(a => { firsts.add(k); k += a.w.length; }); }
  let peeks = 0, tries = 0, passed = false, best = 0;
  const mask = lvl <= 2 ? null : lvl === 3 ? (i, w) => firstLetter(w.ar) : lvl === 4 ? (i, w) => (firsts.has(i) ? null : '•••') : () => '•••';
  const below = lvl === 4 ? $(`<ol class="siram-arti" start="${list[0].n}">${list.map(a => `<li>${esc(a.tr)}</li>`).join('')}</ol>`) : null;
  const where = ch.length > 1 ? ` (ayat ${list[0].n}–${list[list.length - 1].n})` : '';
  practice({
    body, s, a: list[0], items: [words], kind: 'surat', ayat: [list[0]],
    next: () => {
      if (!tries) return done(null); // the recognizer wasn't ready: the classic quiz waters the plant instead
      const okRead = passed && peeks <= list.length;
      if (passed) { st.lv = Math.min(5, lvl + 1); st.down = 0; if (lvl >= 4 && okRead) st.okp[part] = true; }
      else if (++st.down >= 2) { st.lv = Math.max(1, lvl - 1); st.down = 0; }
      st.part = part + 1; st.n++; save();
      logActivity('siram', { surah: no, level: lvl, part, pass: passed, best: +best.toFixed(2), peeks });
      done({ passed, lvl, newLv: st.lv, peeks });
    },
    opt: {
      title: `${LEVELS[lvl].name}: Surat ${s.name}${where}`, lead: LEVELS[lvl].lead, nextLabel: 'Selesai menyiram ▸',
      hear: lvl <= 2, autoplay: lvl === 1, mustTry: true, mask, below, list,
      onPeek: () => { peeks++; },
      onResult: r => { tries++; best = Math.max(best, r.acc); if (r.pass) passed = true; },
    },
  });
  // the ladder, above the reading page
  const bar = $(`<div class="siram-lv">${LEVELS.slice(1).map((x, k) => `<span class="${k + 1 < lvl ? 'past' : k + 1 === lvl ? 'on' : ''}" title="${esc(x.name)}">${k + 1}</span>`).join('')}<b>Tingkat ${lvl}: ${esc(LEVELS[lvl].name)}</b></div>`);
  body.prepend(bar);
}

/* ---------- village events (one a day) ---------- */
const EV_ORDER = ['ibu', 'kambing', 'adik', 'tokoh', 'antar'];
const helpers = no => ORDER.filter(n => S.solved && S.solved[n] && n !== no);
const EV = {
  ibu: no => ({
    before: (b, n) => talk(b, IBU, ["Assalamu'alaikum, {n}! Ibu bawa bekal untukmu.", `Sambil Ibu istirahat di sini, bacakan Surat ${BY[no].name} untuk Ibu, ya. Ibu ingin mendengarnya.`], 'Bacakan untuk Ibu ▸', n),
    after: (b, n) => { coins(5); talk(b, IBU, ['MasyaAllah, Ibu senang sekali mendengar bacaanmu. Ini bekalnya, dimakan ya! (+5 Koin Makna)'], 'Terima kasih, Bu ▸', n); },
  }),
  adik: no => ({
    before: (b, n) => talk(b, ADIK, ['Kak {n}! Aku mau ikut menyiram!', `Ajari aku Surat ${BY[no].name}, ya. Kakak baca dulu, nanti aku tirukan.`], 'Baca untuk Adik ▸', n),
    after: (b, n) => adikGame(b, no, n),
  }),
  tokoh: no => { const Q = QUEST[no]; return {
    before: (b, n) => talk(b, Q, [`{n}! Aku datang mau lihat tanamanmu.`, `Boleh aku dengar kamu membaca Surat ${BY[no].name}? Aku jadi ingat waktu kamu membantuku.`], 'Bacakan ▸', n),
    after: (b, n) => talk(b, Q, ['Bacaanmu makin lancar! Sekarang gantian, aku yang bertanya.'], 'Ayo ▸', () =>
      question(b, makeQ([no], ['next', 'meaning']), `Pertanyaan dari ${Q.npc}`, ok => { coins(ok ? 5 : 2); talk(b, Q, [ok ? 'Benar! Terima kasih, {n}. Ini untukmu. (+5 Koin Makna)' : 'Tidak apa-apa, besok kita ulang lagi. Ini untukmu. (+2 Koin Makna)'], 'Sampai jumpa ▸', n); })),
  }; },
  kambing: no => ({
    after: (b, n) => talk(b, KAKEK, ['Waduh, {n}! Ada kambing lepas masuk ke kebun!', 'Cepat, tangkap dia sebelum sayurmu dimakan! Ketuk kambingnya 3 kali.'], 'Tangkap! ▸', () => goatGame(b, n)),
  }),
  antar: no => { const h = helpers(no); if (!h.length) return EV.tokoh(no); const who = QUEST[pick(h)]; return {
    after: (b, n) => talk(b, KAKEK, [`{n}, tolong antarkan sayur ini ke rumah ${who.npc}, ya.`], 'Antar ▸', () => {
      const v = $(`<div class="frame" style="text-align:center"><div style="font-size:40px" class="siram-walk">🚶🧺</div><p>Mengantar sayur ke rumah ${esc(who.npc)}…</p></div>`); b.replaceChildren(v);
      setTimeout(() => talk(b, who, ['Wah, terima kasih, {n}! Sebelum pulang, jawab pertanyaanku, ya.'], 'Ayo ▸', () =>
        question(b, makeQ(helpers(-1).length ? helpers(-1) : [no], ['next', 'meaning']), `Pertanyaan dari ${who.npc}`, ok => { coins(ok ? 5 : 2); talk(b, who, [ok ? 'Pintar! Ini hadiah kecil untukmu. (+5 Koin Makna)' : 'Hampir! Ini tetap untukmu. (+2 Koin Makna)'], 'Pulang ke kebun ▸', n); })), 1300);
    }),
  }; },
};
function eventFor(no) {
  if (S.evDay === S.day) return null;
  S.evDay = S.day; const k = EV_ORDER[(S.evN || 0) % EV_ORDER.length]; S.evN = (S.evN || 0) + 1; save();
  logActivity('siram_event', { kind: k });
  return EV[k](no);
}
// Adik repeats the reading and gets one word wrong: which word is right?
function adikGame(b, no, next) {
  const ay = BY[no].ayat.filter(a => a.w.length >= 2); if (!ay.length) return next();
  const a = pick(ay), k = Math.floor(Math.random() * a.w.length), w = a.w[k];
  const pool = [...new Map(DATA.flatMap(s => s.ayat.flatMap(x => x.w)).filter(x => x.ar !== w.ar).map(x => [x.ar, x])).values()];
  const wrong = pick(pool), others = shuffle(BY[no].ayat.flatMap(x => x.w).filter(x => x.ar !== w.ar && x.ar !== wrong.ar)).slice(0, 2);
  if (others.length < 2) return next();
  const opts = shuffle([w, ...others]);
  const v = $(`<div class="frame"><div style="display:flex;gap:10px;align-items:flex-start"><img alt="" src="${portrait(ADIK.look)}" style="width:56px;height:56px;border:3px solid var(--ink);border-radius:4px;image-rendering:pixelated;flex:none"><div><div style="font-weight:700;color:var(--red)">Adik</div><p style="margin:2px 0 0">Aku tirukan, ya! Eh, sepertinya ada satu kata yang salah. Kata mana yang benar, Kak?</p></div></div>
    <div class="ar ayah" lang="ar" style="font-size:28px;line-height:2;text-align:center;margin:10px 0">${a.w.map((x, i) => i === k ? `<span style="background:#F8B9A6;border-radius:4px;padding:0 3px;text-decoration:underline wavy #C0392B">${esc(wrong.ar)}</span>` : esc(x.ar)).join(' ')}</div>
    <div class="opts">${opts.map((o, i) => `<button class="opt ar" lang="ar" data-n="${i}">${esc(o.ar)}</button>`).join('')}</div><div class="fb"></div><button class="btn green block" id="nx" style="margin-top:12px" hidden>Lanjut ▸</button></div>`);
  let ans = false;
  v.querySelectorAll('.opt').forEach(btn => btn.onclick = () => { if (ans) return; ans = true; const o = opts[+btn.dataset.n], fb = v.querySelector('.fb');
    if (o === w) { btn.classList.add('good'); sfx.good(); coins(3); fb.className = 'fb good'; fb.textContent = 'Oh iya! Terima kasih, Kak. (+3 Koin Makna)'; }
    else { btn.classList.add('bad'); v.querySelectorAll('.opt')[opts.indexOf(w)].classList.add('good'); sfx.bad(); fb.className = 'fb bad'; fb.textContent = 'Yang benar yang hijau. Kita belajar sama-sama, ya!'; }
    v.querySelector('#nx').hidden = false; });
  v.querySelector('#nx').onclick = next;
  b.replaceChildren(v);
}
// a goat hops around the field; tap it 3 times in 12 seconds
function goatGame(b, next) {
  const v = $(`<div class="frame"><h2>Tangkap kambingnya!</h2><p class="small" style="margin:0">Tertangkap: <b id="gc">0</b>/3</p><div class="siram-field"><button class="siram-goat" aria-label="Kambing">🐐</button></div></div>`);
  b.replaceChildren(v);
  const goat = v.querySelector('.siram-goat'), field = v.querySelector('.siram-field'); let got = 0, over = false;
  const hop = () => { goat.style.left = (5 + Math.random() * 75) + '%'; goat.style.top = (5 + Math.random() * 70) + '%'; };
  hop(); const iv = setInterval(() => { if (!v.isConnected) return clearInterval(iv); hop(); }, 950);
  const end = win => { if (over) return; over = true; clearInterval(iv); clearTimeout(to); if (win) coins(5);
    talk(b, KAKEK, [win ? 'Alhamdulillah, kambingnya tertangkap dan sayurmu aman! Pemiliknya memberi hadiah. (+5 Koin Makna)' : 'Kambingnya lari pulang sendiri ke kandang. Tidak apa-apa, sayurmu tetap aman!'], 'Lanjut ▸', next); };
  const to = setTimeout(() => end(false), 12000);
  goat.onclick = e => { e.stopPropagation(); if (over) return; got++; sfx.good(); v.querySelector('#gc').textContent = got; if (got >= 3) end(true); else hop(); };
  field.onclick = () => { if (!over) sfx.bad(); };
}

/* ---------- the watering itself ---------- */
function siram({ no, finish, quiz }) {
  migrate();
  // Even when the recognizer isn't ready on this phone (still downloading, crashed last time, error), the reading page
  // opens: it says why and offers "Coba lagi". Leaving it without a checked reading waters with the classic quiz.
  if (!FLAGS.recitationGate) return quiz();
  const st = L(no), ev = eventFor(no), wasSiap = isSiap(no);
  const pn = panel(`Menyiram ${QUEST[no].cropName}`, `Membaca Surat ${BY[no].name} · Tingkat ${st.lv}`, () => {});
  const body = pn.querySelector('.pbody');
  const before = ev && ev.before ? ev.before : (b, n) => n(), after = ev && ev.after ? ev.after : (b, n) => n();
  before(body, () => read(body, no, res => {
    if (!res) return talk(body, KAKEK, [model.status === 'ready' ? 'Belum ada bacaan yang diperiksa. Hari ini kita siram dengan menjawab soal arti dulu, ya.' : 'Pak Ustaz belum bisa mendengar bacaan di HP ini. Hari ini kita siram dengan menjawab soal arti dulu, ya.'], 'Jawab soal ▸', quiz);
    pn.scrollTop = 0;
    const msg = res.passed ? (res.newLv > res.lvl ? `Bacaanmu lulus! Siraman berikutnya naik ke tingkat ${res.newLv}: ${LEVELS[res.newLv].name}.` : 'Bacaanmu lulus di tingkat tertinggi. MasyaAllah!')
      : res.newLv < res.lvl ? `Tidak apa-apa. Besok kita latihan di tingkat ${res.newLv} dulu, ya.` : 'Tidak apa-apa, tanamanmu tetap tersiram. Besok coba lagi!';
    question(body, makeQ([no], ['meaning']), 'Satu soal arti', ok => {
      if (ok) { st.mean++; save(); }
      after(body, () => {
        if (!wasSiap && chunks(no).every((_, k) => st.okp[k]) && st.mean >= 2) {
          S.siap = S.siap || {}; S.siap[no] = S.day; save(); logActivity('siap', { surah: no, waterings: st.n });
          sfx.fanfare(); voice('winner', 150);
          return celebrate('✅ Siap!', `MasyaAllah, kamu sudah bisa membaca Surat ${BY[no].name} sendiri dengan sedikit bantuan dan tahu artinya. Tanaman ini tetap disiram sampai panen.`, ICON.star, finish);
        }
        talk(body, KAKEK, [msg], 'Lanjut ▸', finish);
      });
    });
  }));
}

export function installSiram() { hooks.water = siram; try { migrate(); } catch (e) {} }
