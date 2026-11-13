// pvp.js — Phase 5 live race against a friend (Realtime channel race:<4-digit room>, presence + broadcast).
// Both clients build the same seeded question list from the ayat both players have learned. No server authority.
import { $, esc, root, toast } from './ui.js';
import { DATA, AW } from './data.js';
import { play, sfx } from './audio.js';
import { sb, session, friendly, logActivity } from './api.js';
import { avatarCanvas } from './account.js';
import { tabBar } from './social.js';
import { joinOnline, onlineIds, onOnlineChange, sendInvite } from './online.js';

const GOAL = 10;
const WORD = {}; DATA.forEach(s => s.ayat.forEach(a => WORD[a.a] = a.w));
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
export function questions(seed, ayat, n = 14) {
  const R = rng(seed);
  const words = ayat.flatMap(a => WORD[a] || []);
  const all = DATA.flatMap(s => s.ayat.flatMap(a => a.w));
  const out = [];
  for (let i = 0; i < n && words.length; i++) {
    const w = words[Math.floor(R() * words.length)];
    const opts = [w.id]; let guard = 0;
    while (opts.length < 4 && guard++ < 200) { const d = all[Math.floor(R() * all.length)].id; if (!opts.includes(d)) opts.push(d); }
    for (let k = opts.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [opts[k], opts[j]] = [opts[j], opts[k]]; }
    out.push({ ar: w.ar, audio: w.a, answer: w.id, opts });
  }
  return out;
}
async function myAyat() {
  const c = await sb();
  const { data } = await c.from('game_saves').select('state').eq('profile_id', session.user.id).maybeSingle();
  const ay = (data && data.state && data.state.ay) || {};
  return Object.keys(ay).filter(k => ay[k]);
}

function shell() {
  document.body.querySelectorAll('nav.tabbar').forEach(n => n.remove());
  document.body.append(tabBar('beranda')); document.body.classList.add('has-tabs');
}

export async function racePage(room) {
  shell();
  joinOnline();
  if (!room) return lobby();
  if (!/^\d{4}$/.test(room)) { location.hash = '#/lomba'; return; }
  return raceRoom(room);
}

async function lobby() {
  const w = $(`<div class="dash"><h2>🏁 Lomba Arti Kata</h2>
    <div class="frame" style="margin-bottom:12px"><p style="margin:0 0 8px">Balapan menjawab arti kata dari ayat yang sudah kalian berdua pelajari. Yang pertama sampai ${GOAL} jawaban benar menang!</p>
      <button class="btn green block" id="mk">Buat ruang lomba</button>
      <div class="formrow" style="margin-top:10px"><div class="field"><label>Punya kode ruang?</label><input id="rc" inputmode="numeric" maxlength="4" placeholder="1234" autocomplete="off"></div><button class="btn mini" id="jn">Masuk</button></div></div>
    <div class="frame"><b>Teman yang sedang online</b><div class="onl small" style="margin-top:6px">Mencari…</div></div></div>`);
  root.replaceChildren(w);
  const newRoom = () => String(1000 + Math.floor(Math.random() * 9000));
  w.querySelector('#mk').onclick = () => { location.hash = '#/lomba/' + newRoom(); };
  w.querySelector('#jn').onclick = () => { const v = w.querySelector('#rc').value.trim(); if (/^\d{4}$/.test(v)) location.hash = '#/lomba/' + v; else toast('Kode ruang 4 angka'); };
  const c = await sb();
  const { data: f } = await c.from('follows').select('followee_id').eq('follower_id', session.user.id);
  const fol = (f || []).map(x => x.followee_id);
  const { data: ppl } = fol.length ? await c.from('profiles').select('id, display_name, avatar, role').in('id', fol) : { data: [] };
  const draw = () => {
    const box = w.querySelector('.onl'); if (!box) return;
    const on = onlineIds();
    const list = (ppl || []).filter(p => p.role === session.profile.role && on.has(p.id));
    box.replaceChildren();
    if (!list.length) { box.textContent = 'Belum ada teman yang kamu ikuti sedang online. Buat ruang dan bagikan kodenya.'; return; }
    list.forEach(p => {
      const r = $(`<div class="row" style="align-items:center;justify-content:space-between;margin:6px 0"><span class="who-row"><span class="ic"></span><b></b></span><button class="btn mini">Ajak lomba</button></div>`);
      r.querySelector('.ic').append(avatarCanvas(p.avatar)); r.querySelector('b').textContent = p.display_name;
      r.querySelector('button').onclick = async () => { const room = newRoom(); await sendInvite(p.id, room); toast('Ajakan terkirim'); location.hash = '#/lomba/' + room; };
      box.append(r);
    });
  };
  onOnlineChange(draw); draw();
}

async function raceRoom(room) {
  const me = session.user.id, role = session.profile.role;
  const w = $(`<div class="dash"><h2>🏁 Ruang <span class="code" style="font-size:20px">${room}</span></h2>
    <div class="frame track"></div><div class="frame" id="stage" style="margin-top:12px"><p class="small">Bagikan kode <b>${room}</b> ke temanmu, atau tunggu temanmu masuk…</p><span class="spinner"></span></div>
    <p class="start-note"><a class="linkbtn" style="color:#fff" href="#/lomba">◂ Keluar dari ruang</a></p></div>`);
  root.replaceChildren(w);
  const stage = w.querySelector('#stage'), track = w.querySelector('.track');
  const mine = await myAyat();
  const c = await sb();
  const ch = c.channel('race:' + room, { config: { presence: { key: me }, broadcast: { self: false } } });
  let players = [], started = false, finished = false, Q = [], qi = 0, pos = {}, names = {}, avatars = {};
  const drawTrack = () => {
    track.replaceChildren(...players.map(id => {
      const r = $(`<div class="lane"><div class="nm small"></div><div class="road"><div class="car"></div><div class="flag">🏁</div></div></div>`);
      r.querySelector('.nm').textContent = (names[id] || '…') + (id === me ? ' (kamu)' : '') + ` · ${pos[id] || 0}/${GOAL}`;
      const car = r.querySelector('.car'); car.append(avatarCanvas(avatars[id] | 0)); car.style.left = `calc(${Math.min(1, (pos[id] || 0) / GOAL) * 100}% * 0.86)`;
      return r;
    }));
  };
  const finish = winner => {
    if (finished) return; finished = true;
    const won = winner === me;
    if (won) { sfx.fanfare(); } else sfx.bad();
    const opp = players.find(p => p !== me);
    logActivity('boss_done', { boss: 'race', mode: 'pvp', won, opponent: opp || null });
    stage.replaceChildren($(`<div style="text-align:center"><div class="big" style="font-size:28px">${won ? '🏆 Kamu menang!' : '🥈 Temanmu menang!'}</div><p>${won ? 'MasyaAllah, hebat!' : 'Tidak apa-apa, ayo murajaah lagi lalu tanding ulang!'}</p><a class="btn green" href="#/lomba">Lomba lagi</a></div>`));
  };
  const ask = () => {
    if (finished) return;
    const q = Q[qi % Q.length]; qi++;
    const v = $(`<div><p class="small" style="margin:0">Apa arti kata ini?</p><div class="ar" lang="ar" style="font-size:40px;text-align:center;line-height:1.8"></div><div class="opts"></div></div>`);
    v.querySelector('.ar').textContent = q.ar;
    play(AW(q.audio));
    const opts = v.querySelector('.opts');
    q.opts.forEach(o => {
      const b = $(`<button class="opt"></button>`); b.textContent = o;
      b.onclick = () => {
        opts.querySelectorAll('button').forEach(x => x.disabled = true);
        if (o === q.answer) {
          b.classList.add('good'); sfx.good(); pos[me] = (pos[me] || 0) + 1; drawTrack();
          ch.send({ type: 'broadcast', event: 'pos', payload: { id: me, pos: pos[me] } });
          if (pos[me] >= GOAL) { ch.send({ type: 'broadcast', event: 'finish', payload: { winner: me } }); finish(me); return; }
          setTimeout(ask, 350);
        } else { b.classList.add('bad'); sfx.bad(); [...opts.children].find(x => x.textContent === q.answer).classList.add('good'); setTimeout(ask, 1100); }
      };
      opts.append(b);
    });
    stage.replaceChildren(v);
  };
  const start = ({ seed, ayat, ids }) => {
    if (started || !ids.includes(me)) return;
    started = true; players = ids; ids.forEach(id => pos[id] = 0);
    if (!ayat.length) { stage.replaceChildren($(`<p>Kalian belum punya ayat yang sama-sama sudah dipelajari. Pelajari ayat yang sama di kebun dulu, ya!</p>`)); return; }
    Q = questions(seed, ayat); drawTrack();
    let n = 3; stage.replaceChildren($(`<div class="big" style="text-align:center;font-size:40px">3</div>`));
    const t = setInterval(() => { n--; if (n > 0) stage.querySelector('.big').textContent = n; else { clearInterval(t); ask(); } }, 800);
  };
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    const ms = Object.values(st).flatMap(a => a).filter(m => m.role === role); // same role only
    ms.forEach(m => { names[m.id] = m.name; avatars[m.id] = m.avatar; });
    const ids = [...new Set(ms.map(m => m.id))].sort().slice(0, 2);
    if (!started) { players = ids; drawTrack(); }
    if (started && !finished && players.some(id => !ids.includes(id))) { finished = true; stage.replaceChildren($(`<p>Temanmu keluar dari ruang. <a href="#/lomba">Kembali</a></p>`)); }
    if (!started && ids.length === 2 && ids[0] === me) {
      const other = ms.find(m => m.id === ids[1]);
      const both = mine.filter(a => (other.ayat || []).includes(a));
      const payload = { seed: Math.floor(Math.random() * 2 ** 31), ayat: both, ids };
      setTimeout(() => { ch.send({ type: 'broadcast', event: 'start', payload }); start(payload); }, 700);
    }
  });
  ch.on('broadcast', { event: 'start' }, ({ payload }) => start(payload));
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => { if (players.includes(payload.id)) { pos[payload.id] = Math.min(GOAL, payload.pos | 0); drawTrack(); } });
  ch.on('broadcast', { event: 'finish' }, ({ payload }) => { if (players.includes(payload.winner)) finish(payload.winner); });
  ch.subscribe(async st => { if (st === 'SUBSCRIBED') await ch.track({ id: me, role, name: session.profile.display_name, avatar: session.profile.avatar | 0, ayat: mine }); });
  window.addEventListener('hashchange', () => { c.removeChannel(ch); }, { once: true });
}
