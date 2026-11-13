// apply-emoji.mjs — write beta/tools/word-emoji.json into the "emo" field of every word in beta/js/data.js.
// Usage (repo root): node beta/tools/apply-emoji.mjs
import fs from 'node:fs';
const P = 'beta/js/data.js', E = JSON.parse(fs.readFileSync('beta/tools/word-emoji.json', 'utf8'));
let src = fs.readFileSync(P, 'utf8'), n = 0;
const seen = new Set();
src = src.replace(/"emo": "([^"]*)", "a": "(\d{9})"/g, (m, old, id) => {
  if (!(id in E)) throw new Error('no emoji decision for ' + id);
  seen.add(id); n++;
  return `"emo": ${JSON.stringify(E[id])}, "a": "${id}"`;
});
const extra = Object.keys(E).filter(k => !k.startsWith('_') && !seen.has(k));
if (extra.length) throw new Error('ids not in data.js: ' + extra.join(','));
fs.writeFileSync(P, src);
console.log(`${n} words, ${Object.entries(E).filter(([k, v]) => !k.startsWith('_') && v).length} with emoji`);
