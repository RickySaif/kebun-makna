// Copies the cited `sources` rows VERBATIM into each content/akhlak/*.json as `source_rows`, so the game can show
// them offline and the ustaz can check them next to the story. Never edit `source_rows` by hand: re-run this.
// Usage (from a folder with @supabase/supabase-js@2.45.4 installed): node snapshot-sources.mjs <repo>/content/akhlak
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
const dir = process.argv[2];
const c = createClient('https://vnzmvmlvicyggylgukaz.supabase.co', 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5');
const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
for (const id of idx.stories) {
  const f = path.join(dir, id + '.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const { data, error } = await c.from('sources').select('id, ref_label, arabic, indonesian, attribution').in('id', s.sources);
  if (error) throw error;
  if (data.length !== s.sources.length) throw new Error(`${id}: missing source rows ${s.sources}`);
  s.source_rows = s.sources.map(x => data.find(r => r.id === x));
  fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
  console.log(id, s.sources.join(', '));
}
