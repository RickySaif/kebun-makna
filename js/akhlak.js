// akhlak.js — Phase 8: "Akhlak Seorang Muslim", the next chapter in the same village. Unlocks only after the original
// game is finished (all 10 surahs solved + boss4). Stories live in ../content/akhlak/*.json; every hadith/ayah shown
// comes verbatim from the `sources` rows copied into each file (`source_rows`). The classic game code is untouched:
// this adds a HUD button and its own panels.
import { $, esc, root, panel, closePanel, toast, pick } from './ui.js';
import { S, save, fill } from './state.js';
import { ORDER } from './data.js';
import { portrait } from './render.js';
import { sfx, voice } from './audio.js';
import { addXP, note } from './progress.js';
import { celebrate } from './lesson.js';
import { sourceCard, matn } from './social.js';
import { logActivity } from './api.js';

const BASE = new URL('../content/akhlak/', import.meta.url).href; // js/ → content/
let STORIES = null;
export const unlocked = () => ORDER.every(n => S.solved && S.solved[n]) && !!(S.trophies && S.trophies.boss4);
const doneMap = () => (S.akhlak = S.akhlak || {});

async function load() {
  if (STORIES) return STORIES;
  const idx = await (await fetch(BASE + 'index.json')).json();
  STORIES = await Promise.all(idx.stories.map(async id => (await fetch(BASE + id + '.json')).json()));
  STORIES.sort((a, b) => a.order - b.order);
  return STORIES;
}
const nextStory = list => list.find(s => !doneMap()[s.id]);

/** Called whenever the farm screen renders: adds the 📗 button (with a "BARU" marker) once the chapter is unlocked. */
export function installAkhlak() {
  const put = () => {
    if (!unlocked()) return;
    const hud = document.querySelector('.hud'); if (!hud || hud.querySelector('#akh')) return;
    const anyLeft = !STORIES || STORIES.some(s => !doneMap()[s.id]);
    const b = $(`<button class="btn ghost icon" id="akh" aria-label="Kisah Akhlak" style="position:relative">📗${anyLeft ? '<span class="newtag" style="position:absolute;top:-8px;right:-10px;font-size:10px;background:#E2483B;color:#fff;padding:1px 4px;border-radius:3px">BARU</span>' : ''}</button>`);
    b.onclick = chapterView;
    const gear = hud.querySelector('#gear'); gear ? gear.before(b) : hud.append(b);
    if (!S.akhlakIntro) {
      S.akhlakIntro = true; save();
      note('Bab baru: Akhlak Seorang Muslim', 'Warga desa punya masalah baru. Ketuk tombol 📗 untuk membantu mereka dengan pesan Rasulullah ﷺ.', null);
    }
  };
  new MutationObserver(put).observe(root, { childList: true, subtree: false });
  put();
  load().catch(() => {});
}

async function chapterView() {
  let list;
  try { list = await load(); } catch (e) { toast('Kisah belum bisa dimuat. Cek internet, lalu coba lagi.'); return; }
  const nx = nextStory(list);
  panel('Kisah Akhlak', 'Akhlak Seorang Muslim · bab baru', body => {
    body.append($(`<div class="frame" style="margin-bottom:10px"><p style="margin:0">Setelah desa aman berkat surat-surat yang kamu pelajari, warga datang dengan masalah sehari-hari. Bantu mereka dengan pesan Rasulullah ﷺ dan firman Allah.</p></div>`));
    list.forEach((s, i) => {
      const done = !!doneMap()[s.id], open = done || s === nx;
      const r = $(`<button class="opt" style="display:flex;gap:10px;align-items:center;text-align:left;width:100%" ${open ? '' : 'disabled'}>
        <img alt="" src="${portrait(s.look)}" style="width:40px;height:40px;border:2px solid var(--ink);image-rendering:pixelated;flex:none">
        <span style="flex:1"><b>${i + 1}. ${esc(s.title)}</b><br><span class="small">${done ? '✓ selesai' : open ? `${esc(s.npc)} menunggumu` : '🔒 selesaikan kisah sebelumnya'}</span></span>${s === nx ? '<span class="newtag" style="background:#E2483B;color:#fff;font-size:11px;padding:1px 4px;border-radius:3px">!</span>' : ''}</button>`);
      if (open) r.onclick = () => story(s, list);
      body.append(r);
    });
  });
}

function story(s, list) {
  const who = { npc: s.npc, look: s.look };
  const p = panel(s.title, `Kisah Akhlak · ${s.npc}`, () => {}, chapterView);
  const body = p.querySelector('.pbody');
  const say = (lines, then, btn = 'Lanjut ▸') => {
    let i = 0;
    const show = () => {
      const v = $(`<div class="frame"><div style="display:flex;gap:10px;align-items:flex-start"><img alt="" src="${portrait(s.look)}" style="width:56px;height:56px;border:3px solid var(--ink);border-radius:4px;image-rendering:pixelated;flex:none"><div><b style="color:var(--red)">${esc(s.npc)}</b><p style="margin:4px 0 0" class="tx"></p></div></div><button class="btn green block" style="margin-top:12px">${i < lines.length - 1 ? 'Lanjut ▸' : btn}</button></div>`);
      v.querySelector('.tx').textContent = fill(lines[i]);
      v.querySelector('button').onclick = () => { i++; if (i < lines.length) show(); else then(); };
      body.replaceChildren(v); p.scrollTop = 0;
    };
    show();
  };
  const quiz = () => {
    const right = s.source_rows[0];
    const others = list.filter(x => x.id !== s.id).map(x => x.source_rows[0]);
    const opts = [right, ...shuffle(others).slice(0, 2)];
    const shown = shuffle(opts);
    const v = $(`<div class="frame"><h2 style="margin:0 0 4px">📖 Buka kitab</h2><p class="lead">${esc(s.pick)}</p><div class="opts"></div><div class="fb" aria-live="polite"></div></div>`);
    const box = v.querySelector('.opts'), fb = v.querySelector('.fb');
    shown.forEach(r => {
      const b = $(`<button class="opt" style="text-align:left"><b class="small"></b><span style="display:block;font-weight:500;margin-top:4px"></span></button>`);
      b.querySelector('b').textContent = r.ref_label;
      b.querySelector('span').textContent = shortText(r);
      b.onclick = () => {
        if (r === right) {
          sfx.good(); b.classList.add('good'); fb.className = 'fb good'; fb.textContent = 'Tepat!';
          setTimeout(reveal, 700);
        } else { sfx.bad(); b.classList.add('bad'); fb.className = 'fb bad'; fb.textContent = 'Hmm, itu membahas hal lain. Baca lagi masalahnya, lalu coba lagi.'; setTimeout(() => b.classList.remove('bad'), 900); }
      };
      box.append(b);
    });
    body.replaceChildren(v); p.scrollTop = 0;
  };
  const reveal = () => {
    const v = $(`<div class="frame"><h2 style="margin:0 0 6px">Pesan untuk ${esc(s.npc)}</h2><div class="cards"></div><button class="btn green block nx" style="margin-top:12px">Lanjut ▸</button></div>`);
    s.source_rows.forEach(r => v.querySelector('.cards').append(sourceCard({ ...r, kind: r.id.split(':')[0] })));
    v.querySelector('.nx').onclick = () => say(s.done, finish, 'Selesai ▸');
    body.replaceChildren(v); p.scrollTop = 0;
  };
  const finish = () => {
    const first = !doneMap()[s.id];
    doneMap()[s.id] = true;
    const coins = first ? 15 : 0; S.coins += coins; save();
    if (first) { addXP(30); logActivity('akhlak_done', { story: s.id, sources: s.sources }); }
    sfx.fanfare(); voice('you_win', 150);
    celebrate(`${s.npc}: "${fill(s.thanks)}"`, first ? `Kisah "${s.title}" selesai. +${coins} Koin Makna!` : `Kisah "${s.title}" diulang.`, portrait(s.look), () => { closePanel(); chapterView(); });
  };
  say(s.ask, quiz, '📖 Buka kitab');
}
// Text for a quiz option, always a verbatim part of the row: the ayah, the matn, or (for dialogues) the text from the
// first quote after the narrator chain up to the next narrator bracket; otherwise the full text.
function shortText(r) {
  if (r.id.startsWith('quran:')) return r.indonesian;
  const m = matn(r); if (m) return m;
  const t = r.indonesian, a = t.indexOf('"', t.indexOf(']'));
  if (a >= 0) { const b = t.indexOf('[', a); const seg = t.slice(a, b < 0 ? t.length : b).trim(); if (seg.length >= 40) return seg; }
  return t;
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
