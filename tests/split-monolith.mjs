// Split root index.html game script into ES modules with auto-generated imports/exports.
import fs from 'fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const [,, src, outDir] = process.argv;
const lines = fs.readFileSync(src, 'utf8').split('\n');
const L = n => lines[n - 1];

// line ranges (1-based, inclusive) -> module
const MAP = [
  [232, 305, 'data'],
  [306, 325, 'state'],
  [326, 351, 'audio'],
  [352, 363, 'ui'],
  [364, 367, 'render'],
  [368, 368, 'farm'],
  [369, 473, 'render'],
  [474, 474, 'farm'],
  [475, 514, 'render'],
  [515, 682, 'farm'],
  [683, 715, 'farm'],
  [716, 809, 'farm'],
  [810, 819, 'ui'],
  [820, 936, 'lesson'],
  [937, 953, 'farm'],
  [954, 1167, 'bosses'],
  [1168, 1190, 'data'],
  [1191, 1215, 'progress'],
  [1216, 1220, 'main'],
  [1221, 1240, 'progress'],
  [1241, 1314, 'lesson'],
  [1315, 1395, 'farm'],
  [1396, 1397, 'main'],
];
const chunks = {};
for (const [a, b, m] of MAP) {
  let txt = [];
  for (let i = a; i <= b; i++) {
    let s = L(i);
    if (i === 232) s = s.replace(/^<script>/, '');
    txt.push(s);
  }
  (chunks[m] ||= []).push(txt.join('\n'));
}
// minimal, explicit edits (the only non-verbatim changes)
const FIX = {
  data: [["`audio/w/${w}", "`../audio/w/${w}"], ["`audio/a/${a}", "`../audio/a/${a}"], ["`audio/v/${v}", "`../audio/v/${v}"]],
  farm: [["{S=fresh()", "{setS(fresh())"]],
  state: [["let S=fresh();", "let S=fresh();\nfunction setS(v){S=v;}"]],
};
for (const m in FIX) for (const [a, b] of FIX[m]) {
  const j = chunks[m].join('\n');
  if (j.split(a).length !== 2) throw new Error('fix not unique: ' + a);
  chunks[m] = [j.replace(a, b)];
}
const mods = {};
for (const m in chunks) {
  const code = chunks[m].join('\n');
  const ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: 'module' });
  const decl = new Set();
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') decl.add(st.id.name);
    if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
      if (d.id.type !== 'Identifier') throw new Error('pattern decl in ' + m);
      decl.add(d.id.name);
    }
  }
  const refs = new Set(), assigns = new Set();
  walk.fullAncestor(ast, (node, state, anc) => {
    if (node.type !== 'Identifier') return;
    const p = anc[anc.length - 2];
    if (p) {
      if (p.type === 'MemberExpression' && p.property === node && !p.computed) return;
      if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === node && !p.computed && !p.shorthand) return;
      if (p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') return;
      if (p.type === 'AssignmentExpression' && p.left === node) assigns.add(node.name);
      if (p.type === 'UpdateExpression') assigns.add(node.name);
    }
    refs.add(node.name);
  });
  mods[m] = { code, decl, refs, assigns };
}
const owner = {};
for (const m in mods) for (const n of mods[m].decl) {
  if (owner[n]) throw new Error('dup ' + n + ' in ' + m + ' and ' + owner[n]);
  owner[n] = m;
}
const report = [];
for (const m in mods) {
  const imp = {};
  for (const n of mods[m].refs) {
    const o = owner[n];
    if (m === 'audio' && n === 'raf') continue; // local `let raf` inside play()
    if (o && o !== m) (imp[o] ||= []).push(n);
    if (o && o !== m && mods[m].assigns.has(n)) report.push(`ASSIGN ${m} -> ${n} (owned by ${o})`);
  }
  mods[m].imp = imp;
}
fs.mkdirSync(outDir, { recursive: true });
for (const m in mods) {
  const { code, decl, imp } = mods[m];
  const head = Object.keys(imp).sort().map(o => `import { ${imp[o].sort().join(', ')} } from './${o}.js';`).join('\n');
  // export every top-level decl: prefix declarations at top level
  const ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: 'module' });
  let out = '', pos = 0;
  for (const st of ast.body) {
    if (['FunctionDeclaration', 'ClassDeclaration', 'VariableDeclaration'].includes(st.type) && m !== 'main') {
      out += code.slice(pos, st.start) + 'export ';
      pos = st.start;
    }
  }
  out += code.slice(pos);
  fs.writeFileSync(`${outDir}/${m}.js`, `// ${m}.js — split verbatim from the classic single-file game (Phase 0).\n${head}\n\n${out}\n`);
}
console.log(report.join('\n'));
console.log(Object.fromEntries(Object.entries(mods).map(([m, v]) => [m, Object.keys(v.imp)])));
