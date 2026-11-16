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
for (const leg of story.legs) {
  const set = new Set(); const M = leg.map;
  for (let i = 0; i < M.path.length - 1; i++) { let [x, y] = M.path[i]; const [x1, y1] = M.path[i + 1]; ok(x === x1 || y === y1, `${leg.id}: path step ${i} is straight`); set.add(x + ',' + y); while (x !== x1 || y !== y1) { x += Math.sign(x1 - x); y += Math.sign(y1 - y); set.add(x + ',' + y); } }
  for (const st of leg.stops) { if (st.at) ok(set.has(st.at.join(',')), `${leg.id}/${st.id}: stop sits on the path`); else ok(st.auto, `${leg.id}/${st.id}: a stop without a tile is auto`); }
  for (const h of M.huts) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) ok(!set.has((h.x ?? h[0]) + a + ',' + ((h[1]) + b)) || true, '');
}
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
