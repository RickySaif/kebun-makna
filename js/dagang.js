// dagang.js — "Perjalanan Dagang": the chapter after the original game (all 10 surahs + boss4), in the style of a
// Pokémon-like route. Amtar (the player) trades vegetables along a road, meets people who ask about earlier surahs
// (right answer = the wares sell), and meets people who block the road: to pass, he learns a new surah and tells them.
// Long surahs are learned in parts (3–5 ayat each). Content: ../content/dagang/story.json + surah-<no>.json
// (word data in the same shape as DATA, audio in audio/a and audio/w). Every ayah text shown comes from those files
// ({tr:SSS:a-b} in the story is expanded from the surah file's `tr`, never retyped); hadith cards come verbatim
// from `story.source_rows` (a snapshot of the `sources` table, see content/tools/snapshot-dagang.mjs).
// The original farm code is untouched: this adds a HUD button (🧭) and its own panels.
import { $, esc, root, layer, panel, closePanel, toast, shuffle } from './ui.js';
import { S, save, fill } from './state.js';
import { AA, BY, DATA, ORDER, QUEST } from './data.js';
import { lesson, suratUtuh, makeQ, renderQ, celebrate } from './lesson.js';
import { ICON, T, drawGate, drawHut, drawKid, drawTree, portrait, px } from './render.js';
import { buildGround, hdCanvas } from './art.js';
import { play, sfx, voice, stopAudio } from './audio.js';
import { addXP, note } from './progress.js';
import { sourceCard } from './social.js';
import { logActivity } from './api.js';
import { unlocked } from './akhlak.js';

const BASE = new URL('../content/dagang/', import.meta.url).href; // js/ → content/dagang/
const COLS = 12, VR = 11, PRICE = 8;                              // map width in tiles, visible rows, coins per vegetable
const HUTROOF = ['#C8463A', '#3A78C9', '#3A9D6A', '#8D5BB5', '#B8862B', '#E0702F', '#5B7FD9', '#E56B8A', '#8E6A3A', '#3AA6A0'];
let ST = null, V = null;                                           // story, current journey view
const rowsOf = id => (ST.source_rows || []).find(r => r.id === id);

/* ---------- content ---------- */
async function load() {
  if (ST) return ST;
  const story = await (await fetch(BASE + 'story.json')).json();
  const surahs = (await Promise.all(story.surahs.map(async n => { try { const r = await fetch(BASE + `surah-${n}.json`); return r.ok ? await r.json() : null; } catch (e) { return null; } }))).filter(Boolean);
  surahs.forEach(e => { if (!BY[e.no]) { DATA.push(e); BY[e.no] = e; } }); // lets lessons, questions and word cards use them
  return (ST = story);
}

/* ---------- state ---------- */
const DEF = () => ({ leg: 0, i: 0, cart: {}, seen: {}, exp: {}, wh: {}, done: {}, arrived: null, fin: false, started: false });
const D = () => { if (!S.dagang) S.dagang = DEF(); else { const f = DEF(); for (const k in f) if (!(k in S.dagang)) S.dagang[k] = f[k]; } return S.dagang; };
const legOf = d => ST.legs[d.leg], stopOf = d => (legOf(d) || {}).stops && legOf(d).stops[d.i];
const cartCount = () => Object.values(D().cart).reduce((a, b) => a + b, 0);
const cartText = c => Object.entries(c).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${QUEST[k].cropName}`).join(', ');
const cast = k => k === 'me' ? { npc: S.name || 'Kamu', portrait: portrait(null, S.avatar) } : ST.cast[k] || ST.cast.kakek;
const NARR = () => ({ npc: 'Dagangan', portrait: ICON.coin });

// Fill the cart from the harvest basket. If the basket is short, Kakek tops it up from the village store.
function loadCart(n) {
  const d = D(); d.cart = {}; let need = n, topped = 0, guard = 0;
  const have = ORDER.filter(k => (S.basket[k] || 0) > 0);
  while (need > 0 && have.some(k => S.basket[k] > 0) && guard++ < 200) for (const k of have) { if (need <= 0) break; if (S.basket[k] > 0) { S.basket[k]--; d.cart[k] = (d.cart[k] || 0) + 1; need--; } }
  if (need > 0) { const crops = ORDER.filter(k => S.solved[k]); if (!crops.length) crops.push(114); for (let q = 0; q < need; q++) { const k = crops[q % crops.length]; d.cart[k] = (d.cart[k] || 0) + 1; topped++; } }
  save(); return topped;
}
function sell(n) {
  const d = D(); const sold = {}; let items = 0;
  const want = n === 'all' ? Infinity : n;
  while (items < want) { const ks = Object.keys(d.cart).filter(k => d.cart[k] > 0).sort((a, b) => d.cart[b] - d.cart[a]); if (!ks.length) break; d.cart[ks[0]]--; sold[ks[0]] = (sold[ks[0]] || 0) + 1; items++; }
  const coins = items * PRICE; S.coins += coins; save();
  return { sold, items, coins };
}

/* ---------- entry button ---------- */
export function installDagang() {
  const put = () => {
    if (!unlocked()) return;
    const hud = document.querySelector('.hud'); if (!hud || hud.querySelector('#dag')) return;
    const d = D(), fresh = !d.started;
    const b = $(`<button class="btn ghost icon" id="dag" aria-label="Perjalanan Dagang" style="position:relative">🧭${fresh ? '<span class="newtag" style="position:absolute;top:-8px;right:-10px;font-size:10px;background:#E2483B;color:#fff;padding:1px 4px;border-radius:3px">BARU</span>' : ''}</button>`);
    b.onclick = openJourney;
    const anchor = hud.querySelector('#akh') || hud.querySelector('#gear'); anchor ? anchor.before(b) : hud.append(b);
    if (!S.dagangIntro) { S.dagangIntro = true; save(); note('Bab baru: Perjalanan Dagang', 'Kakek Umar punya kabar baru. Ketuk tombol 🧭 untuk berdagang ke wilayah baru dan belajar surat-surat berikutnya.', null); }
  };
  new MutationObserver(put).observe(root, { childList: true }); put();
  load().catch(() => {});
}
async function openJourney() {
  try { await load(); } catch (e) { toast('Perjalanan belum bisa dimuat. Cek internet, lalu coba lagi.'); return; }
  if (D().fin) return summary();
  journeyView();
}

/* ---------- map ---------- */
function buildMap(leg) {
  const M = leg.map, rows = M.rows, set = new Set();
  const add = (x, y) => set.add(x + ',' + y);
  for (let i = 0; i < M.path.length - 1; i++) {
    const [x0, y0] = M.path[i], [x1, y1] = M.path[i + 1]; let x = x0, y = y0; add(x, y);
    while (x !== x1 || y !== y1) { x += Math.sign(x1 - x); y += Math.sign(y1 - y); add(x, y); }
  }
  const huts = M.huts.map(([x, y, r]) => ({ x, y, r })), taken = new Set();
  huts.forEach(h => { for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) taken.add((h.x + a) + ',' + (h.y + b)); });
  let seed = 31 + leg.id.length * 17; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const near = (x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (set.has((x + a) + ',' + (y + b))) return true; return false; };
  const trees = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < COLS; x++) {
    const k = x + ',' + y; if (set.has(k) || taken.has(k) || near(x, y)) continue;
    const edge = x === 0 || x === COLS - 1 || y === 0 || y === rows - 1;
    if (rnd() < (edge ? .85 : .13)) trees.push({ x, y, v: [0, 2, 3, 0, 2, 1][Math.floor(rnd() * 6)] });
  }
  return { set, huts, trees, rows, ground: buildGround(COLS, rows, (x, y) => set.has(x + ',' + y), {}) };
}
const stopTile = (leg, i) => { for (let k = i; k >= 0; k--) if (leg.stops[k].at) return leg.stops[k].at; return leg.map.start; };
function bfs(set, from, to) {
  const key = (x, y) => x + ',' + y, q = [from], prev = { [key(...from)]: null };
  while (q.length) { const [x, y] = q.shift(); if (x === to[0] && y === to[1]) { const p = []; let k = key(x, y); while (k) { p.unshift(k.split(',').map(Number)); k = prev[k]; } return p.slice(1); }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!(k in prev) && set.has(k)) { prev[k] = key(x, y); q.push([nx, ny]); } } }
  return [];
}
function tag(c, X, Y, w, text, dark, light, t) { const b = Math.sin(t / 260) > 0 ? 0 : .5; c.fillStyle = dark; c.fillRect(X + .5, Y + b, w - 1, 9); c.fillRect(X, Y + b + .5, w, 8); c.fillRect(X + w / 2 - 2, Y + b + 9, 4, 1); c.fillRect(X + w / 2 - 1, Y + b + 10, 2, 1);
  c.fillStyle = light; c.fillRect(X + 1, Y + b + 1, w - 2, 7); c.fillStyle = '#fff'; c.font = 'bold 6.5px "Fredoka",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, X + w / 2, Y + b + 4.8); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; }

function startMap(cv, leg) {
  const d0 = D();
  const M = buildMap(leg), VW = COLS * T, VH = VR * T;
  const me = { fx: 0, fy: 0, path: [], dir: 3, onArrive: null }; [me.fx, me.fy] = d0.i === 0 ? leg.map.start : stopTile(leg, d0.i - 1);
  const view = { me, M, walk(to, then) { me.path = bfs(M.set, [Math.round(me.fx), Math.round(me.fy)], to); const st = leg.stops[D().i]; if (st && st.npc && st.icon !== 'gate' && me.path.length) me.path.pop(); me.onArrive = then; if (!me.path.length) { me.onArrive = null; then && then(); } } };
  let raf = 0, last = performance.now(), ctx = null;
  const fit = () => { ctx = hdCanvas(cv, VW, VH); };
  fit(); window.addEventListener('resize', fit); view.stop = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  const loop = t => {
    if (!cv.isConnected) return view.stop(); raf = requestAnimationFrame(loop);
    const dt = Math.min(100, t - last); last = t; const c = ctx, k = cv._k || 2, d = D();
    if (me.path.length) { const [nx, ny] = me.path[0], sp = .1 * dt / 16.7, ddx = nx - me.fx, ddy = ny - me.fy; if (ddx || ddy) me.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 1 : 3) : (ddy < 0 ? 2 : 0);
      me.fx += Math.sign(ddx) * Math.min(sp, Math.abs(ddx)); me.fy += Math.sign(ddy) * Math.min(sp, Math.abs(ddy));
      if (Math.abs(me.fx - nx) < .01 && Math.abs(me.fy - ny) < .01) { me.fx = nx; me.fy = ny; me.path.shift(); if (!me.path.length) { const f = me.onArrive; me.onArrive = null; f && f(); } } }
    const camY = Math.round(Math.max(0, Math.min(M.rows * T - VH, me.fy * T + 8 - VH / 2)) * k) / k, camX = 0;
    c.setTransform(k, 0, 0, k, -camX * k, -camY * k); c.imageSmoothingEnabled = false;
    c.drawImage(M.ground, 0, camY * 2, VW * 2, VH * 2, 0, camY, VW, VH);
    const vis = (y, h) => y < camY + VH && y + h > camY, items = [], put = (b, f) => items.push({ b, f });
    M.trees.forEach(tr => { if (vis(tr.y * T - 6, 24)) put(tr.y * T + 15, () => drawTree(c, tr.x * T, tr.y * T, tr.v)); });
    M.huts.forEach(h => { if (vis(h.y * T - 12, 46)) put(h.y * T + 31, () => drawHut(c, h.x * T, h.y * T, HUTROOF[h.r % 10], null, 0, false)); });
    const cur = leg.stops[d.i];
    leg.stops.forEach((st, i) => { if (!st.at || st.auto) return; const [x, y] = st.at, isDone = !!d.done[st.id]; if (!vis(y * T - 14, 40)) return;
      if (st.icon === 'gate') { put(y * T + 14, () => drawGate(c, x, y, true)); return; }
      if (st.block && !isDone) put(y * T + 5, () => { px(c, x * T - 1, y * T + 4, 2, 9, '#6E4426'); px(c, x * T + 15, y * T + 4, 2, 9, '#6E4426'); px(c, x * T + 1, y * T + 7, 14, 1, '#C98A52'); });
      const look = ST.cast[st.npc] && ST.cast[st.npc].look; if (look) put(y * T + 16, () => drawKid(c, (isDone && st.block ? x + 1 : x) * T + 2, y * T, 0, 0, look, isDone && st.block ? 1 : 0)); });
    const moving = me.path.length > 0, wf = Math.floor(t / 120) % 4;
    put(me.fy * T + 16.5, () => drawKid(c, Math.round(me.fx * T * 2) / 2 + 2, Math.round(me.fy * T * 2) / 2, S.avatar, moving ? wf : 0, null, me.dir | 0));
    items.sort((a, b) => a.b - b.b).forEach(it => it.f());
    if (cur && cur.at && !cur.auto && !moving && !d.arrived) tag(c, cur.at[0] * T + 3, cur.at[1] * T - 13, 10, '!', '#A8362B', '#E2483B', t);
    c.setTransform(k, 0, 0, k, 0, 0);
  };
  raf = requestAnimationFrame(loop);
  return view;
}

/* ---------- journey view: map on top, dialog below ---------- */
async function journeyView(quiet) {
  await load(); stopAudio();
  const d = D(); d.started = true; save();
  const leg = legOf(d);
  if (!leg) return summary();
  const p = panel(leg.title, leg.sub, body => {
    body.append($(`<div class="jv"><div class="jtop"><span>🛒 <b id="jc"></b></span><span><img alt="" src="${ICON.coin}" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:-3px"> <b id="jco"></b></span></div>
      <div class="stage"><canvas id="jmap" width="${COLS * T * 2}" height="${VR * T * 2}" aria-label="Peta perjalanan"></canvas></div>
      <div class="frame dialog jdlg"></div></div>`));
  });
  const cv = p.querySelector('#jmap');
  V = { p, dlg: p.querySelector('.jdlg'), map: startMap(cv, leg) };
  chips(); if (!quiet) idle();
}
const chips = () => { if (!V) return; const jc = V.p.querySelector('#jc'), jo = V.p.querySelector('#jco'); if (jc) jc.textContent = cartCount() ? cartText(D().cart) : 'kosong'; if (jo) jo.textContent = S.coins; };
const ensureView = cb => { if (V && V.p.isConnected && layer.contains(V.p)) cb(); else journeyView(true).then(() => cb()); };

function say(who, text, btns) {
  const el = $(`<div style="display:contents"><img class="portrait" alt="" src="${who.portrait || portrait(who.look, who.av)}"><div class="body"><div class="who">${esc(who.npc)}</div><div class="txt"></div><div class="row act"></div></div></div>`);
  el.querySelector('.txt').textContent = text;
  (btns || []).forEach(([label, fn, cls]) => { const b = $(`<button class="btn ${cls || ''}">${esc(label)}</button>`); b.onclick = fn; el.querySelector('.act').append(b); });
  V.dlg.replaceChildren(el); chips();
}
const trText = t => t.replace(/\{tr:(\d+):(\d+)-(\d+)\}/g, (m, no, a, b) => BY[no].ayat.filter(x => x.n >= +a && x.n <= +b).map(x => x.tr).join(' '));
const txt = t => fill(trText(t));

// the idle prompt: walk to the next stop, or talk if we already arrived
function idle() {
  const d = D(), leg = legOf(d), st = stopOf(d);
  if (!st) return;
  if (st.auto) return arrive(st);
  if (d.i === 0 && !d.arrived) return arrive(st); // a leg starts where the player already stands
  if (d.arrived === st.id) return say(cast(st.npc), `${st.name}. Ketuk untuk melanjutkan percakapan.`, [['Bicara ▸', () => arrive(st), 'green']]);
  const n = d.i + 1;
  say(cast('me'), `Berikutnya: ${st.name} (${n} dari ${leg.stops.length}). Jalan terus, ya!`, [['Jalan ▸', () => { V.dlg.replaceChildren(); V.map.walk(st.at, () => arrive(st)); }, 'green']]);
}
function arrive(st) {
  const d = D(); d.arrived = st.id; save(); sfx.coin();
  if (st.type === 'customer') return customer(st, () => finishStop(st));
  if (st.type === 'learn') return learn(st, () => finishStop(st));
  scene(st.lines, () => finishStop(st));
}
function finishStop(st) {
  const d = D(); d.done[st.id] = true; d.arrived = null; d.i++;
  const legBefore = d.leg; if (d.i >= legOf(d).stops.length) { d.leg++; d.i = 0; }
  save(); logActivity('dagang_stop', { stop: st.id });
  if (st.final) return finale();
  if (d.leg !== legBefore) { toast('Wilayah baru terbuka!'); return journeyView(); }
  ensureView(idle);
}

/* ---------- scenes ---------- */
function scene(lines, then) {
  let i = 0;
  const step = () => {
    if (i >= lines.length) return then();
    const L = lines[i++];
    if (Array.isArray(L)) return say(cast(L[0]), txt(L[1]), [['Lanjut ▸', step, 'green']]);
    if (L.card) return card(L.card, step);
    if (L.sell) return sellStep(L.sell, step);
    if (L.coins) return coinStep(L.coins, step);
    if (L.load) return loadStep(L.load, step);
    step();
  };
  step();
}
function card(id, next) {
  const r = rowsOf(id); if (!r) return next();
  const el = $(`<div style="flex:1;min-width:0"><div class="small" style="font-weight:700;color:var(--red);margin-bottom:4px">📖 Buka kitab</div><div class="cards"></div><button class="btn green block" style="margin-top:8px">Lanjut ▸</button></div>`);
  el.querySelector('.cards').append(sourceCard({ ...r, kind: r.id.split(':')[0] }));
  el.querySelector('button').onclick = next; V.dlg.replaceChildren(el); sfx.good();
}
function loadStep(n, next) {
  const topped = loadCart(n); sfx.coin(); chips();
  say(NARR(), `Gerobak berisi: ${cartText(D().cart)}.${topped ? ` (Kakek menambah ${topped} dari lumbung desa karena keranjang panenmu belum cukup.)` : ''}`, [['Lanjut ▸', next, 'green']]);
}
function sellStep(n, next) {
  const r = sell(n); sfx.coin(); chips(); addXP(r.items ? 10 : 0); logActivity('dagang_sale', { items: r.items, coins: r.coins });
  say(NARR(), r.items ? `Terjual: ${cartText(r.sold)}. +${r.coins} Koin Makna!` : 'Gerobakmu sudah kosong.', [['Lanjut ▸', next, 'green']]);
}
function coinStep(n, next) { S.coins += n; save(); sfx.coin(); chips(); say(NARR(), `Hadiah terima kasih: +${n} Koin Makna!`, [['Lanjut ▸', next, 'green']]); }

/* ---------- a customer asks about earlier surahs ---------- */
function customer(st, done) {
  scene(st.ask, () => {
    const pool = [...ORDER, ...ST.surahs]; let ok = 0, tried = 0;
    const next = () => {
      if (ok >= st.qn || tried >= 8) return scene(st.yes, () => sellStep(st.sell, done));
      const q = makeQ(pool); if (!q) { ok = st.qn; return next(); }
      tried++;
      const host = $(`<div style="flex:1;min-width:0"><div class="small" style="font-weight:700;color:var(--red);margin-bottom:4px">Pertanyaan ${ok + 1} dari ${st.qn}</div><div class="qh"></div></div>`);
      V.dlg.replaceChildren(host);
      renderQ(host.querySelector('.qh'), q, (good, ms, fb) => {
        if (good) { ok++; sfx.good(); fb.className = 'fb good'; fb.textContent = 'Benar!'; } else { sfx.bad(); fb.className = 'fb bad'; fb.textContent = 'Hampir! Yang benar yang hijau. Kita coba pertanyaan lain.'; }
        setTimeout(next, good ? 900 : 1500);
      });
    };
    next();
  });
}

/* ---------- learn one part of a surah, then (last part) the whole surah ---------- */
function learn(st, done) {
  const d = D(), no = st.surah, s = BY[no], [a, b] = st.part, T0 = cast(st.teacher || st.npc);
  const back = () => journeyView();
  const stage = () => {
    if (!d.seen[st.id]) { d.seen[st.id] = 1; save(); return scene(st.ask, stage); }
    const j = s.ayat.findIndex(x => x.n >= a && x.n <= b && !S.ay[x.a]);
    if (j >= 0) return lesson(no, j, false, { sub: `${T0.npc} · bagian ${a}–${b}`, back, after: () => stage() });
    if (!d.exp[st.id]) return explain(st, () => { d.exp[st.id] = 1; save(); stage(); });
    if (st.whole && !d.wh[st.id]) return suratUtuh(no, false, { Q: T0, E: st.wholeE, back, after: () => { d.wh[st.id] = 1; save(); logActivity('dagang_surah', { surah: no }); stage(); } });
    ensureView(() => scene(st.done, done));
  };
  ensureView(stage);
}
function explain(st, next) {
  const s = BY[st.surah], E = st.explain, who = cast(st.teacher || st.npc), a = s.ayat[E.ayah - 1];
  const opts = shuffle([a, ...shuffle(s.ayat.filter(x => x !== a)).slice(0, 2)]);
  panel(`${s.name} · bagian ${st.part[0]}–${st.part[1]}`, 'Cek pemahaman', body => {
    const v = $(`<div class="frame"><h2>Jelaskan, ya!</h2><div style="display:flex;gap:10px;align-items:flex-start;margin:6px 0 4px"><img alt="" src="${who.portrait || portrait(who.look)}" style="width:56px;height:56px;border:3px solid var(--ink);border-radius:4px;image-rendering:pixelated;flex:none"><div><div style="font-weight:700;color:var(--red)">${esc(who.npc)}</div><p style="margin:2px 0 0">${esc(fill(E.q))}</p></div></div>
      <div class="opts">${opts.map((o, n) => `<button class="opt" data-n="${n}"><span class="ar" lang="ar" style="display:block;font-size:24px;text-align:right;line-height:1.9">${esc(o.ar)}</span><span style="font-weight:500">${esc(o.tr)}</span></button>`).join('')}</div><div class="fb"></div><button class="btn green block" id="nx" style="margin-top:12px" hidden>Lanjut ▸</button></div>`);
    let fin = false;
    v.querySelectorAll('.opt').forEach(btn => btn.onclick = () => { if (fin) return; const o = opts[+btn.dataset.n], fb = v.querySelector('.fb');
      play(AA(o.a));
      if (o === a) { fin = true; btn.classList.add('good'); sfx.good(); fb.className = 'fb good'; fb.textContent = fill(E.yes); v.querySelector('#nx').hidden = false; }
      else { btn.classList.add('bad'); sfx.bad(); fb.className = 'fb bad'; fb.textContent = 'Hmm, ayat itu membahas hal lain. Coba pilih ayat yang lain.'; setTimeout(() => btn.classList.remove('bad'), 900); } });
    v.querySelector('#nx').onclick = () => next(); body.append(v);
  }, () => journeyView());
}

/* ---------- the end of the chapter, and a review page ---------- */
function finale() {
  const d = D(); d.fin = true; S.coins += 50; save(); addXP(100); sfx.fanfare(); voice('winner', 150);
  logActivity('dagang_done', { surahs: ST.surahs });
  celebrate('Pedagang Kebun Makna!', 'Perjalanan Dagang selesai: 6 surat baru dan banyak teman baru. +50 Koin Makna dan +100 XP!', ICON.coin, () => { closePanel(); summary(); });
}
function summary() {
  panel('Perjalanan Dagang', 'Surat-surat dari perjalananmu', body => {
    body.append($(`<div class="frame" style="margin-bottom:10px"><p style="margin:0">Alhamdulillah, perjalananmu selesai. Ulangi Surat Utuh kapan saja untuk menjaga hafalan.</p></div>`));
    ST.surahs.forEach(no => {
      const s = BY[no], stop = ST.legs.flatMap(l => l.stops).find(x => x.surah === no && x.whole), ws = (S.wholeStars || {})[no] || 0;
      const b = $(`<button class="opt" style="display:flex;gap:10px;align-items:center;text-align:left;width:100%"><span style="flex:1"><b>${esc(s.name)}</b><br><span class="small">${esc(s.mean)} · ${s.ayat.length} ayat</span></span><span style="color:#B8860B;font-size:18px;white-space:nowrap">${'★'.repeat(ws)}${'☆'.repeat(3 - ws)}</span></button>`);
      b.onclick = () => suratUtuh(no, true, { Q: cast(stop.teacher || stop.npc), E: stop.wholeE, back: summary, after: () => summary() });
      body.append(b);
    });
  });
}
