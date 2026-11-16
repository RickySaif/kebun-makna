// dunia-grid.js — pure tile logic for the Perjalanan Dagang overworld (no DOM, so tests can import it too).
// An area is described in content/dagang/story.json: {cols, rows, paths:[{pts,half}], open:[[x0,y0,x1,y1]], huts:[[x,y,roof,label]], exits}.
// Walkable tiles = the road polylines widened by `half` tiles + open rectangles, minus huts. Everything else is forest.
export const key = (x, y) => x + ',' + y;

export function buildArea(spec, stops = []) {
  const { cols, rows } = spec, walk = new Uint8Array(cols * rows), road = new Set();
  const inb = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const mark = (x, y) => { if (inb(x, y)) walk[y * cols + x] = 1; };
  for (const p of spec.paths || []) {
    const half = p.half ?? 1;
    for (let i = 0; i < p.pts.length - 1; i++) {
      let [x, y] = p.pts[i]; const [x1, y1] = p.pts[i + 1];
      const step = () => { if (inb(x, y)) road.add(key(x, y)); for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) mark(x + a, y + b); };
      step();
      while (x !== x1 || y !== y1) { x += Math.sign(x1 - x); y += Math.sign(y1 - y); step(); }
    }
  }
  for (const [x0, y0, x1, y1] of spec.open || []) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mark(x, y);
  const huts = (spec.huts || []).map(([x, y, r, label]) => ({ x, y, r, label })), hutTiles = new Set();
  for (const h of huts) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { hutTiles.add(key(h.x + a, h.y + b)); if (inb(h.x + a, h.y + b)) walk[(h.y + b) * cols + h.x + a] = 0; }
  // a blocker (someone standing in the road) also gets a rope across the road's shoulders, so nobody walks around him
  const fences = [];
  for (const st of stops) if (st.block && st.area === spec.id && st.at) {
    const [x, y] = st.at, vertical = road.has(key(x, y - 1)) || road.has(key(x, y + 1));
    const sides = vertical ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]];
    for (const [fx, fy] of sides) if (inb(fx, fy) && walk[fy * cols + fx]) fences.push({ x: fx, y: fy, stop: st.id });
  }
  const fenceAt = new Map(fences.map(f => [key(f.x, f.y), f.stop]));
  const trees = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!walk[y * cols + x] && !hutTiles.has(key(x, y))) trees.push({ x, y, v: [0, 2, 3, 0, 2, 1][(x * 7 + y * 13) % 6] });
  return { cols, rows, walk, road, huts, fences, fenceAt, trees, inb, base: (x, y) => inb(x, y) && !!walk[y * cols + x] };
}

// which exit (if any) does the tile (x,y) of this area belong to
export function exitAt(spec, g, x, y) {
  if (!g.base(x, y)) return null;
  for (const e of spec.exits || []) {
    const onEdge = e.edge === 'N' ? y === 0 : e.edge === 'S' ? y === g.rows - 1 : e.edge === 'W' ? x === 0 : x === g.cols - 1;
    if (!onEdge) continue;
    const c = e.edge === 'N' || e.edge === 'S' ? x : y;
    if ((e.min === undefined || c >= e.min) && (e.max === undefined || c <= e.max)) return e;
  }
  return null;
}

// BFS over tiles; `ok(x,y)` says whether a tile can be stepped on; goals is an array of [x,y]
export function bfs(g, ok, from, goals) {
  const G = new Set(goals.map(([x, y]) => key(x, y))), q = [from], prev = { [key(...from)]: null };
  while (q.length) {
    const [x, y] = q.shift();
    if (G.has(key(x, y))) { const p = []; let k = key(x, y); while (k) { p.unshift(k.split(',').map(Number)); k = prev[k]; } return p.slice(1); }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!(k in prev) && ok(nx, ny)) { prev[k] = key(x, y); q.push([nx, ny]); } }
  }
  return null;
}
