// kanban.js — "Papan Hafalan": a kanban board of the 10 surahs, one card per surah, four columns.
// The columns are read from the save (S), never set by hand, so "Siap" stays the game's own judgement
// (docs/RANCANGAN_15_SURAT.md bagian 5). Nothing here is religious text: names and meanings come from DATA.
//   Belum mulai → Belajar ayat → Menghafal → Siap
import { BY, ORDER, QUEST } from './data.js';
import { ICON } from './render.js';
import { S, activeEvent, done } from './state.js';
import { $, esc, panel } from './ui.js';

export const COLUMNS = [
  { id: 'mulai',   title: 'Belum mulai',   icon: '🌱', note: 'Warga desa menunggumu' },
  { id: 'belajar', title: 'Belajar ayat',  icon: '📖', note: 'Mengenal kata dan arti' },
  { id: 'hafal',   title: 'Menghafal',     icon: '🎙️', note: 'Menyiram: baca dengan bantuan makin sedikit' },
  { id: 'siap',    title: 'Siap',          icon: '✅', note: 'Bisa membaca sendiri' },
];
// the names of the 5 watering levels (the same as LEVELS in siram.js; kept here so the board needs no import of it)
const TINGKAT = ['', 'Tirukan', 'Baca sendiri', 'Huruf awal', 'Kata pertama', 'Hafalan'];

const learned = no => BY[no].ayat.filter(a => S.ay && S.ay[a.a]).length;
const isSiap = no => !!((S.siap && S.siap[no]) || (S.solved && S.solved[no]));
const ladder = no => (S.ladder && S.ladder[no]) || null;

export function stageOf(no) {
  if (isSiap(no)) return 'siap';
  const n = learned(no), all = BY[no].ayat.length;
  if (n >= all) return 'hafal';
  return n > 0 ? 'belajar' : 'mulai';
}
// reachable in the village order? (the same order the game follows; see activeEvent in state.js)
const unlocked = no => !!(S.unlockAll || done(no) || learned(no) > 0 || (S.arrived && S.arrived[no]) || activeEvent() === no);

/** One card's data, so the board and the tests read the same thing. */
export function cardOf(no) {
  const s = BY[no], Q = QUEST[no], n = learned(no), all = s.ayat.length, st = stageOf(no), L = ladder(no);
  let line, next;
  if (st === 'mulai') {
    const open = unlocked(no);
    line = open ? 'Belum ada ayat dipelajari' : '🔒 Belum terbuka';
    next = open ? `Hampiri ${Q.npc} di desa dan dengarkan ceritanya.` : 'Terbuka setelah misi sebelumnya selesai.';
  } else if (st === 'belajar') {
    line = `${n} dari ${all} ayat`;
    next = `Lanjutkan belajar ayat bersama ${Q.npc}.`;
  } else if (st === 'hafal') {
    line = L ? `Menyiram: tingkat ${L.lv} (${TINGKAT[L.lv]})` : 'Semua ayat sudah dipelajari';
    next = !(S.whole && S.whole[no]) ? 'Berikutnya: selesaikan Surat Utuh.'
      : !(S.bought && S.bought[no]) ? `Berikutnya: tanam Benih ${Q.cropName}.`
      : 'Berikutnya: siram tanamanmu dengan membaca suratnya, makin lama makin sedikit dibantu.';
  } else {
    line = L ? `Tingkat siram ${L.lv}: ${TINGKAT[L.lv]}` : 'Ulangi lewat menyiram (murajaah)';
    next = L && L.lv < 5 ? 'Terus menyiram supaya bisa membaca tanpa melihat teks.' : 'Terus murajaah dengan menyiram, supaya tidak lupa.';
  }
  return { no, stage: st, name: s.name, ar: s.arName, mean: s.mean, n, all, ayat: s.ayat.map(a => !!(S.ay && S.ay[a.a])), lvl: L ? L.lv : 0,
    stars: (S.slv && S.slv[no]) || 0, line, next, locked: st === 'mulai' && !unlocked(no) };
}

/** All cards grouped by column, in the order the surahs are played. */
export function boardData() {
  const cols = Object.fromEntries(COLUMNS.map(c => [c.id, []]));
  ORDER.forEach(no => { const c = cardOf(no); cols[c.stage].push(c); });
  return cols;
}

function cardEl(c) {
  const dots = c.ayat.map(on => `<i class="${on ? 'on' : ''}"></i>`).join('');
  const lad = c.stage === 'hafal' && c.lvl ? `<div class="kb-lad" aria-hidden="true">${[1, 2, 3, 4, 5].map(k => `<i class="${k < c.lvl ? 'past' : k === c.lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const el = $(`<button type="button" class="kb-card${c.locked ? ' lock' : ''}" aria-expanded="false">
    <div class="kb-top"><img alt="" src="${ICON.crop(c.no)}"><div class="kb-nm"><b>${esc(c.name)}</b><span>${esc(c.mean)}</span></div><div class="kb-ar" lang="ar" dir="rtl">${esc(c.ar)}</div></div>
    <div class="kb-dots" aria-label="${c.n} dari ${c.all} ayat dipelajari">${dots}</div>
    ${lad}
    <div class="kb-line">${esc(c.line)}</div>
    <div class="kb-next" hidden>${esc(c.next)}</div></button>`);
  el.onclick = () => { const nx = el.querySelector('.kb-next'); nx.hidden = !nx.hidden; el.setAttribute('aria-expanded', String(!nx.hidden)); };
  return el;
}

export function kanbanBoard() {
  const cols = boardData(), siap = cols.siap.length, total = ORDER.length;
  panel('Papan Hafalan', `${siap} dari ${total} surat sudah Siap`, v => {
    v.append($(`<div class="box kb-sum"><div class="xpbar"><div style="width:${siap / total * 100}%"></div></div>
      <p class="small" style="margin:6px 0 0">Papan ini bergeser sendiri mengikuti belajarmu. Ketuk kartu untuk melihat langkah berikutnya.</p></div>`));
    const board = $(`<div class="kb-board" role="list"></div>`);
    COLUMNS.forEach(col => {
      const items = cols[col.id];
      const c = $(`<section class="kb-col kb-${col.id}" role="listitem" aria-label="${esc(col.title)}"><header><span>${col.icon} <b>${esc(col.title)}</b></span><em>${items.length}</em></header><p class="kb-note">${esc(col.note)}</p><div class="kb-list"></div></section>`);
      const list = c.querySelector('.kb-list');
      if (items.length) items.forEach(it => list.append(cardEl(it))); else list.append($(`<div class="kb-empty">Belum ada</div>`));
      board.append(c);
    });
    v.append(board);
  });
}

/* ---------- demo (localhost only): a save with progress in every column, so the board can be tried without an account ---------- */
export function demoState() {
  const ay = {}, learn = (no, k) => BY[no].ayat.slice(0, k == null ? undefined : k).forEach(a => { ay[a.a] = 1; });
  [114, 113, 112, 111].forEach(no => learn(no)); learn(110, 2);
  const solved = { 114: 1, 113: 1, 112: 1 };
  return { name: 'Amtar', avatar: 0, coins: 120, xp: 260, day: 6, ay, solved, trophies: { boss1: 1 },
    whole: { 114: 1, 113: 1, 112: 1, 111: 1 }, bought: { 114: 1, 113: 1, 112: 1, 111: 1 },
    siap: { 114: 'lama', 113: 'lama', 112: 'lama' }, siapInit: 1,
    ladder: { 114: { lv: 5, down: 0, n: 6, mean: 2, part: 0, okp: {} }, 113: { lv: 4, down: 0, n: 4, mean: 2, part: 0, okp: {} },
      112: { lv: 3, down: 0, n: 3, mean: 1, part: 0, okp: {} }, 111: { lv: 2, down: 0, n: 2, mean: 1, part: 0, okp: {} } } };
}
