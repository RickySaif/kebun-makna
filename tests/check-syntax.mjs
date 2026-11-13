// node --check every .js under js/ (and supabase-free)
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const dir = process.argv[2];
let bad = 0;
const walkDir = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkDir(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walkDir(dir).filter(f => f.endsWith('.js') || f.endsWith('.mjs'))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.log('FAIL', f, String(e.stderr).slice(0, 400)); }
}
console.log(bad ? `${bad} failed` : 'all modules pass node --check');
