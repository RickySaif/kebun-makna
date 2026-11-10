// Word audio check (no backend, no browser): every word has a clip in beta/audio/w, each clip is as long as its
// planned span, the clips of an ayah add up to the whole ayah recording, and wordcuts.js matches the boundaries file.
// Run from the repo root: node beta/tests/word-audio.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { DATA } = await import(path.join(ROOT, 'beta/js/data.js'));
const { CUTS } = await import(path.join(ROOT, 'beta/js/wordcuts.js'));
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'beta/tools/word-boundaries.json'), 'utf8'));
const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()) * 1000;
let fails = 0, words = 0, ayat = 0;
const fail = m => { fails++; console.log('FAIL ' + m); };

for (const s of DATA) for (const a of s.ayat) {
  ayat++;
  const total = dur(path.join(ROOT, 'audio/a', `${a.a}.mp3`)), e = B[a.a];
  if (!e) { fail(`${a.a}: no boundaries`); continue; }
  if (JSON.stringify(CUTS[a.a].slice(0, -1)) !== JSON.stringify([0, ...e.bounds])) fail(`${a.a}: wordcuts.js differs from word-boundaries.json`);
  if (JSON.stringify(a.t) !== JSON.stringify(CUTS[a.a])) fail(`${a.a}: data.js does not use the new t array`);
  const edges = [0, ...e.bounds, total]; let sum = 0;
  a.w.forEach((w, k) => {
    words++;
    const f = path.join(ROOT, 'beta/audio/w', `${w.a}.mp3`);
    if (!fs.existsSync(f)) return fail(`${w.a}: clip missing`);
    const d = dur(f), plan = edges[k + 1] - edges[k]; sum += d;
    if (plan < 150) fail(`${w.a}: planned span only ${plan.toFixed(0)} ms`);
    if (Math.abs(d - plan) > 40) fail(`${w.a}: clip is ${d.toFixed(0)} ms, planned ${plan.toFixed(0)} ms`);
  });
  if (Math.abs(sum - total) > 40 * a.w.length) fail(`${a.a}: clips add up to ${sum.toFixed(0)} ms, ayah is ${total.toFixed(0)} ms`);
}
// the 114:1 case that was reported: "aʿūdhu" must now hold its "dhu" (it used to end at 1.03 s, inside the dhu)
const w2 = dur(path.join(ROOT, 'beta/audio/w/114001002.mp3'));
if (!(w2 > 780 && w2 < 880)) fail(`114:1 word 2 is ${w2.toFixed(0)} ms, expected about 830 ms (was 660)`);
console.log(`${words} words in ${ayat} ayat checked: ${fails ? fails + ' FAILED' : 'all ok'}`);
process.exit(fails ? 1 : 0);
