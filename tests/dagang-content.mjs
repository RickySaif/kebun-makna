// Perjalanan Dagang: content integrity, plain Node (no browser needed). Run from the repo root: node tests/dagang-content.mjs
// Checks: every surah file has its audio (ayah + word clips), word/time arrays agree, `tr` equals the live `sources` row,
// every story stop is valid (unique ids, stops sit on their map's path, parts cover each surah exactly once, `{tr:}` tokens
// resolve, cast keys exist), and every hadith/ayah card in the story is a verbatim copy of the live `sources` table.
import fs from 'node:fs';
const D = 'content/dagang/', story = JSON.parse(fs.readFileSync(D + 'story.json', 'utf8'));
const KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5', SRC = 'https://vnzmvmlvicyggylgukaz.supabase.co/rest/v1/sources';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.error('FAIL', m); } else console.log('ok  ', m); };
const surah = {};
for (const n of story.surahs) {
  const f = `${D}surah-${n}.json`; if (!fs.existsSync(f)) { ok(false, `surah-${n}.json exists`); continue; }
  const s = surah[n] = JSON.parse(fs.readFileSync(f, 'utf8'));
  ok(s.no === n && s.ayat.length > 0, `surah ${n} ${s.name}: ${s.ayat.length} ayat`);
  for (const a of s.ayat) {
    ok(fs.existsSync(`audio/a/${a.a}.mp3`), `audio/a/${a.a}.mp3`);
    ok(a.t.length === a.w.length + 1 && a.t.every((v, i) => !i || v > a.t[i - 1]), `${a.a}: t has ${a.w.length + 1} increasing values`);
    for (const w of a.w) if (!fs.existsSync(`audio/w/${w.a}.mp3`)) ok(false, `audio/w/${w.a}.mp3`);
  }
  const { data } = { data: await (await fetch(`${SRC}?select=id,indonesian&id=in.(${encodeURIComponent(s.ayat.map(a => `"quran:${n}:${a.n}"`).join(','))})`, { headers: { apikey: KEY } })).json() };
  ok(s.ayat.every(a => (data.find(r => r.id === `quran:${n}:${a.n}`) || {}).indonesian === a.tr), `surah ${n}: every tr equals the live sources row`);
}
// story
const ids = new Set(), cast = story.cast, stops = story.legs.flatMap(l => l.stops);
ok(stops.length === new Set(stops.map(s => s.id)).size, 'stop ids are unique');
// overworld areas (pure grid module, same code the game uses)
const { buildArea, bfs, exitAt, key } = await import('../js/dunia-grid.js');
const flat = story.legs.flatMap(l => l.stops), AR = Object.fromEntries(story.areas.map(a => [a.id, a]));
for (const spec of story.areas) {
  const g = buildArea(spec, flat), ex = spec.exits || [];
  ok(g.trees.length > 0 && spec.cols >= 12 && spec.rows >= 12, `${spec.id}: ${spec.cols}x${spec.rows}, ${g.trees.length} forest tiles`);
  for (const e of ex) { if (e.to !== 'farm') { ok(AR[e.to] && e.spawn, `${spec.id} -> ${e.to}: target exists and has a spawn`); if (AR[e.to]) { const tg = buildArea(AR[e.to], flat); ok(tg.base(...e.spawn) && !exitAt(AR[e.to], tg, ...e.spawn), `${spec.id} -> ${e.to}: spawn ${e.spawn} is walkable and not itself an exit`); } } }
  const entry = ex.length ? ex.map(e => [e.to, e]) : [];
  // every walkable tile on an exit edge is reachable from the first exit's tile with all ropes gone
  const noRope = (x, y) => g.base(x, y), tiles = [];
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) { const e = exitAt(spec, g, x, y); if (e) tiles.push([x, y]); }
  ok(tiles.length > 0, `${spec.id}: has exit tiles`);
  for (const [x, y] of tiles.slice(1)) ok(!!bfs(g, noRope, tiles[0], [[x, y]]) || tiles[0][0] === x && tiles[0][1] === y, `${spec.id}: exit tile ${x},${y} is reachable`);
  // stops of this area: walkable, not on a rope, reachable from every entry with the ropes of later blockers still up
  const mine = flat.filter(st => st.area === spec.id);
  for (const st of mine) {
    ok(g.base(...st.at) && !g.fenceAt.has(key(...st.at)), `${spec.id}/${st.id}: stop tile ${st.at} is walkable and not a rope tile`);
    const later = new Set(flat.slice(flat.indexOf(st) + 1).filter(s => s.block).map(s => s.id));
    const okTile = (x, y) => g.base(x, y) && !(g.fenceAt.has(key(x, y)) && later.has(g.fenceAt.get(key(x, y)))) && !(x === st.at[0] && y === st.at[1]);
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [st.at[0] + a, st.at[1] + b]).filter(([x, y]) => okTile(x, y));
    for (const e of ex.filter(e => e.to !== 'farm')) { const from = tiles.find(([x, y]) => exitAt(spec, g, x, y) === e); ok(adj.some(t => bfs(g, okTile, from, [t]) !== null), `${spec.id}/${st.id}: reachable from the ${e.edge} entrance`); }
    if (st.type === 'learn' || st.type === 'customer' || st.type === 'tell' || st.type === 'scene') ok(st.area && st.at, `${st.id}: has area and tile`);
  }
}
ok(flat.every(st => st.auto || (st.area && AR[st.area] && st.at)), 'every non-auto stop sits in a known area');
ok(AR[story.spawn.area] && buildArea(AR[story.spawn.area], flat).base(story.spawn.x, story.spawn.y), 'spawn from the farm gate is walkable');
for (const st of flat) if (st.area !== 'desa' && st.area) { let a = st.area, hops = 0; while (a && a !== 'desa' && hops++ < 6) a = AR[a].parent; ok(a === 'desa', `${st.id}: area ${st.area} chains back to the village`); }
const keys = l => (Array.isArray(l) ? [l[0]] : []);
const checkTokens = t => [...t.matchAll(/\{tr:(\d+):(\d+)-(\d+)\}/g)].every(([, no, a, b]) => surah[no] && +a >= 1 && +b <= surah[no].ayat.length && +a <= +b);
for (const st of stops) {
  const lines = [...(st.lines || []), ...(st.ask || []), ...(st.yes || []), ...(st.done || [])];
  ok(lines.every(l => !Array.isArray(l) || ((l[0] === 'me' || cast[l[0]]) && checkTokens(l[1]))), `${st.id}: cast keys and {tr:} tokens resolve`);
  ok(!st.npc || cast[st.npc], `${st.id}: npc ${st.npc} exists`);
  if (st.type === 'learn') {
    const s = surah[st.surah]; ok(s && st.part[0] >= 1 && st.part[1] <= s.ayat.length, `${st.id}: part ${st.part} inside surah ${st.surah}`);
    ok(st.explain && s.ayat[st.explain.ayah - 1] && st.explain.ayah >= st.part[0] - 0, `${st.id}: explain ayah exists`);
    if (st.whole) ok(st.wholeE && s.ayat[st.wholeE.ayah - 1], `${st.id}: wholeE ayah exists`);
  }
  for (const l of st.lines || []) if (l.card) ok(story.sources.includes(l.card), `${st.id}: card ${l.card} is listed in sources`);
}
for (const n of story.surahs) { const parts = stops.filter(s => s.type === 'learn' && s.surah === n).map(s => s.part).sort((a, b) => a[0] - b[0]); const cover = parts.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)); ok(surah[n] && cover.join() === surah[n].ayat.map(a => a.n).join(), `surah ${n}: parts ${JSON.stringify(parts)} cover every ayah once, in order`); }
// source rows verbatim
const rows = story.source_rows || [], live = await (await fetch(`${SRC}?select=id,ref_label,arabic,indonesian,attribution&id=in.(${encodeURIComponent(story.sources.map(x => `"${x}"`).join(','))})`, { headers: { apikey: KEY } })).json();
ok(rows.length === story.sources.length && rows.every(r => { const d = live.find(x => x.id === r.id); return d && d.arabic === r.arabic && d.indonesian === r.indonesian && d.ref_label === r.ref_label && d.attribution === r.attribution; }), 'source_rows are identical to the live sources table');
console.log(bad ? `\n${bad} FAILED` : '\nall good'); process.exit(bad ? 1 : 0);
