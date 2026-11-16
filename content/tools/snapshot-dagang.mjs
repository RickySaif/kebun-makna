// Copies the cited `sources` rows VERBATIM into content/dagang/story.json as `source_rows`, so the game can show
// hadith/ayah cards offline and the ustaz can check them next to the story. Never edit `source_rows` by hand: re-run this.
// Usage (repo root, Node 18+): node content/tools/snapshot-dagang.mjs
import fs from 'node:fs';
const URL_ = 'https://vnzmvmlvicyggylgukaz.supabase.co/rest/v1/sources', KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5';
const f = 'content/dagang/story.json', s = JSON.parse(fs.readFileSync(f, 'utf8'));
const ids = s.sources.map(x => `"${x}"`).join(',');
const r = await fetch(`${URL_}?select=id,ref_label,arabic,indonesian,attribution&id=in.(${encodeURIComponent(ids)})`, { headers: { apikey: KEY } });
const data = await r.json();
if (!Array.isArray(data) || data.length !== s.sources.length) throw new Error('missing source rows: ' + JSON.stringify(data).slice(0, 200));
s.source_rows = s.sources.map(x => data.find(row => row.id === x));
fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
console.log('snapshot:', s.sources.join(', '));
