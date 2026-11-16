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
import { ICON, T, drawHut, drawKid, drawTree, portrait, px } from './render.js';
import { blit, buildGround, fenceSprite, hdCanvas } from './art.js';
import { buildArea, bfs, exitAt, key } from './dunia-grid.js';
import { hooks } from './hooks.js';
import { farm } from './farm.js';
import { play, sfx, voice, stopAudio } from './audio.js';
import { addXP, note } from './progress.js';
import { sourceCard } from './social.js';
import { logActivity } from './api.js';
import { unlocked } from './akhlak.js';

const BASE = new URL('../content/dagang/', import.meta.url).href; // js/ → content/dagang/
const PRICE = 8;                                                  // coins per vegetable sold
const HUTROOF = ['#C8463A', '#3A78C9', '#3A9D6A', '#8D5BB5', '#B8862B', '#E0702F', '#5B7FD9', '#E56B8A', '#8E6A3A', '#3AA6A0'];
let ST = null, V = null;                                           // story, current journey view
const rowsOf = id => (ST.source_rows || []).find(r => r.id === id);

/* ---------- content ---------- */
async function load() {
  if (ST) return ST;
  const story = await (await fetch(BASE + 'story.json')).json();
  const surahs = (await Promise.all(story.surahs.map(async n => { try { const r = await fetch(BASE + `surah-${n}.json`); return r.ok ? await r.json() : null; } catch (e) { return null; } }))).filter(Boolean);
  surahs.forEach(e => { if (!BY[e.no]) { DATA.push(e); BY[e.no] = e; } }); // lets lessons, questions and word cards use them
  story.flat = story.legs.flatMap(l => l.stops);
  return (ST = story);
}

/* ---------- state ---------- */
// d.q = index of the current quest stop in the flat list of all stops (old saves had leg + i: migrated in D())
const DEF = () => ({ q: 0, cart: {}, seen: {}, exp: {}, wh: {}, done: {}, arrived: null, fin: false, started: false, pos: null });
const D = () => {
  if (!S.dagang) S.dagang = DEF(); else { const f = DEF(); for (const k in f) if (!(k in S.dagang)) S.dagang[k] = f[k]; }
  const d = S.dagang;
  if (ST && d.leg !== undefined) { d.q = ST.legs.slice(0, d.leg).reduce((n, l) => n + l.stops.length, 0) + (d.i || 0); delete d.leg; delete d.i; }
  return d;
};
const stopOf = d => ST.flat[d.q];
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

/* ---------- entry: a gate at the east end of the village road, and a button as a shortcut ---------- */
export function installDagang() {
  hooks.worldOpen = () => unlocked();                 // farm: opens the exit tile in the east edge (and its gate)
  hooks.worldEnter = () => { enterWorld({ fromFarm: true }); };
  const put = () => {
    if (!unlocked()) return;
    const hud = document.querySelector('.hud'); if (!hud || hud.querySelector('#dag')) return;
    const fresh = !(S.dagang && S.dagang.started);
    const b = $(`<button class="btn ghost icon" id="dag" aria-label="Perjalanan Dagang" style="position:relative">🧭${fresh ? '<span class="newtag" style="position:absolute;top:-8px;right:-10px;font-size:10px;background:#E2483B;color:#fff;padding:1px 4px;border-radius:3px">BARU</span>' : ''}</button>`);
    b.onclick = () => enterWorld({});
    const anchor = hud.querySelector('#akh') || hud.querySelector('#gear'); anchor ? anchor.before(b) : hud.append(b);
    if (!S.dagangIntro) { S.dagangIntro = true; save(); note('Jalan baru terbuka!', 'Gerbang di ujung timur jalan desa sekarang terbuka. Berjalanlah keluar desa, berdagang, dan belajar surat-surat baru. (Tombol 🧭 juga membawamu ke sana.)', null); }
  };
  new MutationObserver(put).observe(root, { childList: true }); put();
  load().catch(() => {});
}
async function enterWorld({ fromFarm }) {
  try { await load(); } catch (e) { toast('Perjalanan belum bisa dimuat. Cek internet, lalu coba lagi.'); return; }
  const d = D();
  if (d.fin && !fromFarm) return summary();
  if (fromFarm || !d.pos) d.pos = { a: ST.spawn.area, x: ST.spawn.x, y: ST.spawn.y };
  worldView();
}

/* ---------- areas ---------- */
const AREAS = {};
const area = id => AREAS[id] || (AREAS[id] = (() => { const spec = ST.areas.find(a => a.id === id), g = buildArea(spec, ST.flat); return { spec, g, ground: buildGround(spec.cols, spec.rows, (x, y) => g.road.has(key(x, y)), {}) }; })());
// may the player enter this area now? Only areas on the way to the current quest, or ones already visited
function allowed(id) {
  const d = D(), st = stopOf(d); if (id === 'desa' || !st || !st.area) return true;
  const chain = []; for (let a = st.area; a; a = (ST.areas.find(x => x.id === a) || {}).parent) chain.push(a);
  return chain.includes(id) || ST.flat.some(s => s.area === id && d.done[s.id]);
}
function routeHint(from, to) {
  if (from === to) return '';
  const q = [[from, null]], seen = new Set([from]);
  while (q.length) { const [a, first] = q.shift(); const sp = ST.areas.find(x => x.id === a); for (const e of sp.exits) { if (e.to === 'farm' || seen.has(e.to)) continue; seen.add(e.to); const f = first || e; if (e.to === to) return ` Jalan ke ${f.dir}.`; q.push([e.to, f]); } }
  return '';
}

/* ---------- the overworld: free walking, camera follows ---------- */
const VW = 12 * T, VH = 11 * T;
function board(c, X, Y, w, text) { px(c, X, Y, w, 12, '#6E4426'); px(c, X + 1, Y + 1, w - 2, 10, '#C98A52'); px(c, X + 1, Y + 1, w - 2, 1.5, '#E3A96C'); c.fillStyle = '#2B1D12'; c.font = 'bold 5.5px "Fredoka",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, X + w / 2, Y + 6.5); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; }
function tag(c, X, Y, w, text, dark, light, t) { const b = Math.sin(t / 260) > 0 ? 0 : .5; c.fillStyle = dark; c.fillRect(X + .5, Y + b, w - 1, 9); c.fillRect(X, Y + b + .5, w, 8); c.fillRect(X + w / 2 - 2, Y + b + 9, 4, 1); c.fillRect(X + w / 2 - 1, Y + b + 10, 2, 1);
  c.fillStyle = light; c.fillRect(X + 1, Y + b + 1, w - 2, 7); c.fillStyle = '#fff'; c.font = 'bold 6.5px "Fredoka",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, X + w / 2, Y + b + 4.8); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; }

async function worldView(quiet) {
  await load(); stopAudio();
  const d = D(); d.started = true; save();
  const A = area(d.pos.a);
  const p = panel(A.spec.name, 'Perjalanan Dagang', body => {
    body.append($(`<div class="jv"><div class="jtop"><span>🛒 <b id="jc"></b></span><span><img alt="" src="${ICON.coin}" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:-3px"> <b id="jco"></b></span></div>
      <div class="stage"><canvas id="jmap" width="${VW * 2}" height="${VH * 2}" aria-label="Peta perjalanan. Ketuk tanah untuk berjalan."></canvas></div>
      <div class="frame dialog jdlg"></div></div>`));
  });
  const cv = p.querySelector('#jmap');
  V = { p, cv, dlg: p.querySelector('.jdlg'), A, busy: !!quiet, me: null, cam: { x: 0, y: 0 } }; // a quiet view is rebuilt by a flow that is still running: no auto-triggers
  startWorld(); chips();
  if (!quiet) { banner(A.spec.name); idle(); }
}
const chips = () => { if (!V) return; const jc = V.p.querySelector('#jc'), jo = V.p.querySelector('#jco'); if (jc) jc.textContent = cartCount() ? cartText(D().cart) : 'kosong'; if (jo) jo.textContent = S.coins; };
const ensureView = cb => { if (V && V.p.isConnected && layer.contains(V.p)) cb(); else worldView(true).then(() => cb()); };
function banner(text) {
  if (!V) return; V.p.querySelectorAll('.jbanner').forEach(e => e.remove());
  const b = $(`<div class="jbanner">${esc(text)}</div>`); V.p.querySelector('.stage').append(b); setTimeout(() => b.remove(), 2300);
}

// is this tile free to step on right now? (forest, huts, the current NPC and unpassed ropes are not)
function free(x, y) {
  const d = D(), g = V.A.g; if (!g.base(x, y)) return false;
  const f = g.fenceAt.get(key(x, y)); if (f && !d.done[f]) return false;
  const st = stopOf(d); if (st && st.area === V.A.spec.id && st.at && !st.auto && st.at[0] === x && st.at[1] === y) return false;
  return true;
}
function startWorld() {
  const d = D(), cv = V.cv, g = V.A.g, me = V.me = { x: d.pos.x, y: d.pos.y, fx: d.pos.x, fy: d.pos.y, path: [], dir: 3, onArrive: null };
  if (!g.base(me.x, me.y)) { me.x = me.fx = ST.spawn.x; me.y = me.fy = ST.spawn.y; }
  let raf = 0, last = performance.now(), ctx = null;
  const fit = () => { ctx = hdCanvas(cv, VW, VH); };
  fit(); window.addEventListener('resize', fit);
  V.stop = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); };
  const onKey = e => { if (!cv.isConnected || V.busy) return; const dd = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (!dd) return; e.preventDefault(); if (me.path.length) return; stepTo(me.x + dd[0], me.y + dd[1]); };
  window.addEventListener('keydown', onKey);
  cv.onclick = e => {
    if (V.busy) return; const r = cv.getBoundingClientRect();
    const tx = Math.floor(((e.clientX - r.left) / r.width * VW + V.cam.x) / T), ty = Math.floor(((e.clientY - r.top) / r.height * VH + V.cam.y) / T);
    const st = stopOf(D()), npc = st && st.area === V.A.spec.id && st.at && !st.auto && st.at[0] === tx && st.at[1] === ty;
    const goals = npc ? [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]].filter(([x, y]) => free(x, y)) : free(tx, ty) ? [[tx, ty]] : [];
    if (!goals.length) return;
    const path = bfs(g, free, [me.x, me.y], goals); if (path) { me.path = path; me.onArrive = null; }
  };
  function stepTo(nx, ny) { // one tile with the keyboard
    if (!free(nx, ny)) return; me.path = [[nx, ny]];
  }
  const tick = () => { // called each time the player stands on a new tile
    d.pos = { a: V.A.spec.id, x: me.x, y: me.y };
    const ex = exitAt(V.A.spec, g, me.x, me.y);
    if (ex) return useExit(ex);
    triggers();
  };
  V.tick = tick;
  const loop = t => {
    if (!cv.isConnected) return V.stop && V.stop(); raf = requestAnimationFrame(loop);
    const dt = Math.min(100, t - last); last = t; const c = ctx, k = cv._k || 2;
    if (me.path.length && !V.busy) {
      const [nx, ny] = me.path[0], sp = .1 * dt / 16.7, ddx = nx - me.fx, ddy = ny - me.fy;
      if (!free(nx, ny)) me.path = []; else {
        if (ddx || ddy) me.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 1 : 3) : (ddy < 0 ? 2 : 0);
        me.fx += Math.sign(ddx) * Math.min(sp, Math.abs(ddx)); me.fy += Math.sign(ddy) * Math.min(sp, Math.abs(ddy));
        if (Math.abs(me.fx - nx) < .01 && Math.abs(me.fy - ny) < .01) { me.fx = nx; me.fy = ny; me.x = nx; me.y = ny; me.path.shift(); save(); tick(); }
      }
    }
    const A = V.A, d2 = D(), st = stopOf(d2), cam = V.cam;
    cam.x = Math.round(Math.max(0, Math.min(A.spec.cols * T - VW, me.fx * T + 8 - VW / 2)) * k) / k;
    cam.y = Math.round(Math.max(0, Math.min(A.spec.rows * T - VH, me.fy * T + 8 - VH / 2)) * k) / k;
    c.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k); c.imageSmoothingEnabled = false;
    c.drawImage(A.ground, cam.x * 2, cam.y * 2, VW * 2, VH * 2, cam.x, cam.y, VW, VH);
    const vis = (x, y, w, h) => x < cam.x + VW && x + w > cam.x && y < cam.y + VH && y + h > cam.y, items = [], put = (b, f) => items.push({ b, f });
    A.g.trees.forEach(tr => { if (vis(tr.x * T - 2, tr.y * T - 8, 20, 26)) put(tr.y * T + 15, () => drawTree(c, tr.x * T, tr.y * T, tr.v)); });
    A.g.huts.forEach((h, i) => { if (vis(h.x * T - 4, h.y * T - 16, 40, 52)) { put(h.y * T + 31, () => drawHut(c, h.x * T, h.y * T, HUTROOF[h.r % 10], null, 0, false)); if (h.label) put(h.y * T + 40, () => board(c, h.x * T + 16 - Math.max(24, h.label.length * 3.1 + 6) / 2, h.y * T + 34, Math.max(24, h.label.length * 3.1 + 6), h.label)); } });
    A.g.fences.forEach(f => { if (!d2.done[f.stop] && vis(f.x * T, f.y * T - 4, 16, 20)) put(f.y * T + 14, () => blit(c, fenceSprite(), f.x * T, f.y * T)); });
    if (st && st.area === A.spec.id && st.at && !st.auto) { const [x, y] = st.at, look = ST.cast[st.npc] && ST.cast[st.npc].look; if (look) put(y * T + 16, () => drawKid(c, x * T + 2, y * T, 0, 0, look, y * T > me.fy * T ? 2 : 0)); }
    const moving = me.path.length > 0, wf = Math.floor(t / 120) % 4;
    put(me.fy * T + 16.5, () => drawKid(c, Math.round(me.fx * T * 2) / 2 + 2, Math.round(me.fy * T * 2) / 2, S.avatar, moving ? wf : 0, null, me.dir | 0));
    items.sort((a, b) => a.b - b.b).forEach(it => it.f());
    if (st && st.area === A.spec.id && st.at && !st.auto && !V.busy && !d2.arrived) tag(c, st.at[0] * T + 3, st.at[1] * T - 13, 10, '!', '#A8362B', '#E2483B', t);
    c.setTransform(k, 0, 0, k, 0, 0);
  };
  raf = requestAnimationFrame(loop);
  setTimeout(triggers, 400); // a Kakek who waits at the entrance of an area calls out right away
}
function useExit(ex) {
  const me = V.me;
  if (ex.to === 'farm') { V.stop(); closePanel(); S.pos = { x: 25, y: 4 }; save(); farm(); return; }
  if (!allowed(ex.to)) { me.path = []; const st = stopOf(D()); say(cast('me'), `Belum waktunya ke sana. Tujuanmu sekarang: ${st.name}.${routeHint(V.A.spec.id, st.area)}`, []); sfx.bad(); const g = V.A.g; // step back inside
    const back = [[me.x + 1, me.y], [me.x - 1, me.y], [me.x, me.y + 1], [me.x, me.y - 1]].find(([x, y]) => g.base(x, y) && !exitAt(V.A.spec, g, x, y)); if (back) { me.x = me.fx = back[0]; me.y = me.fy = back[1]; D().pos = { a: V.A.spec.id, x: me.x, y: me.y }; } return; }
  const A2 = area(ex.to), d = D(); d.pos = { a: ex.to, x: ex.spawn[0], y: ex.spawn[1] }; save(); sfx.coin();
  V.stop(); worldView(true).then(() => { banner(A2.spec.name); setTimeout(idle, 0); });
}
// the current quest stop is close (or waits for us at the entrance): start it, Pokémon-trainer style
function triggers() {
  if (!V || V.busy) return; const d = D(), st = stopOf(d); if (!st) return;
  if (st.auto) { V.busy = true; V.me.path = []; return arrive(st); }
  if (st.area !== V.A.spec.id) return;
  const me = V.me, dist = Math.abs(me.x - st.at[0]) + Math.abs(me.y - st.at[1]);
  if (st.onEnter || dist <= 2) { V.busy = true; me.path = []; arrive(st); }
}

function say(who, text, btns) {
  const el = $(`<div style="display:contents"><img class="portrait" alt="" src="${who.portrait || portrait(who.look, who.av)}"><div class="body"><div class="who">${esc(who.npc)}</div><div class="txt"></div><div class="row act"></div></div></div>`);
  el.querySelector('.txt').textContent = text;
  (btns || []).forEach(([label, fn, cls]) => { const b = $(`<button class="btn ${cls || ''}">${esc(label)}</button>`); b.onclick = fn; el.querySelector('.act').append(b); });
  V.dlg.replaceChildren(el); chips();
}
const trText = t => t.replace(/\{tr:(\d+):(\d+)-(\d+)\}/g, (m, no, a, b) => BY[no].ayat.filter(x => x.n >= +a && x.n <= +b).map(x => x.tr).join(' '));
const txt = t => fill(trText(t));

// the hint line between conversations: where to go next
function idle() {
  const d = D(), st = stopOf(d); if (!V) return; V.busy = false;
  if (!st) return;
  const here = V.A.spec.id, there = st.area || here, areaName = ST.areas.find(a => a.id === there)?.name || '';
  say(cast('me'), here === there ? `Tujuan: ${st.name}. Ketuk tanah untuk berjalan, ketuk orang yang bertanda ! untuk bicara.` : `Tujuan: ${st.name} di ${areaName}.${routeHint(here, there)} Berjalanlah ke tepi peta.`, []);
  triggers();
}
function arrive(st) {
  const d = D(); d.arrived = st.id; save(); sfx.coin();
  if (st.type === 'customer') return customer(st, () => finishStop(st));
  if (st.type === 'learn') return learn(st, () => finishStop(st));
  scene(st.lines, () => finishStop(st));
}
function finishStop(st) {
  const d = D(); d.done[st.id] = true; d.arrived = null; d.q++;
  save(); logActivity('dagang_stop', { stop: st.id });
  if (st.final) return finale();
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
  const back = () => worldView();
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
  }, () => worldView());
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

export const _debug = () => V; // for tests (tests/*.mjs read the live view state)
