// art.js — v3 visuals. Every sprite is drawn in code at double detail ("HD pixels": 2 per classic pixel),
// baked once into an offscreen canvas, outlined automatically, then blitted. Per-frame work is drawImage only,
// which is what keeps the farm smooth on mid-range Android phones.
export const Z = 2;                      // HD pixels per classic (logical) pixel
export const INK = '#2B1D12';

/* ---------- colour + pixel helpers ---------- */
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shadeMemo = new Map();
/** f<0 darkens (slightly towards blue), f>0 lightens (slightly towards warm white). */
export function shade(h, f) {
  const k = h + f; let v = shadeMemo.get(k); if (v) return v;
  const [r, g, b] = hex(h), a = Math.abs(f);
  v = f < 0 ? toHex([r * (1 - a), g * (1 - a * .95), b * (1 - a * .8)]) : toHex([r + (255 - r) * a, g + (255 - g) * a, b + (245 - b) * a]);
  shadeMemo.set(k, v); return v;
}
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function E(g, cx, cy, rx, ry, c) { g.fillStyle = c; for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + .5) * (ry + .5))))); if (w > 0) g.fillRect(cx - w, cy + y, w * 2, 1); } }

/* ---------- bake cache ---------- */
const cache = new Map();
function outline(g, w, h) {
  const im = g.getImageData(0, 0, w, h), d = im.data, o = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] > 100) continue;
    let n = -1;
    if (y < h - 1 && d[i + w * 4 + 3] > 200) n = i + w * 4; else if (x > 0 && d[i - 1] > 200) n = i - 4;
    else if (x < w - 1 && d[i + 4 + 3] > 200) n = i + 4; else if (y > 0 && d[i - w * 4 + 3] > 200) n = i - w * 4;
    if (n < 0) continue;
    o[i] = d[n] * .36; o[i + 1] = d[n + 1] * .32; o[i + 2] = d[n + 2] * .4; o[i + 3] = 255;
  }
  im.data.set(o); g.putImageData(im, 0, 0);
}
/** Bake a sprite. w,h are HD pixels. fn(g) draws with 1 unit = 1 HD pixel. */
export function bake(key, w, h, fn, plain) {
  let s = cache.get(key); if (s) return s;
  const pad = plain ? 0 : 1, cv = document.createElement('canvas'); cv.width = w + pad * 2; cv.height = h + pad * 2;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.translate(pad, pad); fn(g); g.setTransform(1, 0, 0, 1, 0, 0);
  if (pad) outline(g, cv.width, cv.height);
  s = { cv, pad, w: cv.width, h: cv.height }; cache.set(key, s); return s;
}
/** Draw a baked sprite with its top-left at logical (x,y). */
export function blit(c, s, x, y) { c.drawImage(s.cv, x - s.pad / Z, y - s.pad / Z, s.w / Z, s.h / Z); }

/* ---------- display preference: characters without eyes ---------- */
const EYES_KEY = 'kebun-makna-noeyes';
let noEyes = false, eyesSet = false;
try { const v = localStorage.getItem(EYES_KEY); if (v !== null) { noEyes = v === '1'; eyesSet = true; } } catch (e) {}
export const eyesOff = () => noEyes;
export const eyesChosen = () => eyesSet;       // true when this device has an explicit choice
export function setEyesOff(v, remember = true) {
  noEyes = !!v; if (remember) { eyesSet = true; try { localStorage.setItem(EYES_KEY, noEyes ? '1' : '0'); } catch (e) {} }
  portraits.clear();
  window.dispatchEvent(new Event('km-eyes'));
}

/* ---------- avatar: a look packed into the existing small integer ---------- */
export const SKIN = ['#FAD9B5', '#F1C27D', '#D9A066', '#A56B3F'];
export const HAIRC = ['#2B1D12', '#3B2A1A', '#5A3820', '#8A5A33', '#1A1A22', '#6E4A2A', '#B5793C', '#4A3B32'];
export const HIJABC = ['#E56B8A', '#F2F2F2', '#3AA6A0', '#7B3FA0', '#3A78C9', '#F2A23A', '#5FA85B', '#C8463A'];
export const SHIRTC = ['#3A78C9', '#F2A23A', '#E2483B', '#3A9D6A', '#8D5BB5', '#F4C430', '#F2F2F2', '#E56B8A'];
export const PANTSC = ['#2B4C7E', '#5A3820', '#3B3B4A', '#2F5E5B'];
export const SKIRTC = [null, '#F2F2F2', '#2B4C7E', '#8A3B5A'];   // null = same colour as the dress
export const STYLES = { boy: ['Rapi', 'Poni', 'Ikal', 'Cepak'], girl: ['Jilbab', 'Jilbab panjang', 'Kuncir dua', 'Rambut panjang'] };
const CUSTOM = 1 << 14;   // profiles.avatar is a smallint: 14 bits of look + this flag. 0 and 1 are the two classic characters.
export const packLook = o => CUSTOM | (o.girl ? 1 : 0) | (o.skin & 3) << 1 | (o.style & 3) << 3 | (o.col & 7) << 5 | (o.shirt & 7) << 8 | (o.pants & 3) << 11 | (o.hat ? 1 : 0) << 13;
export function unpackLook(av) {
  av |= 0;
  if (!(av & CUSTOM)) return av % 2 ? { girl: 1, skin: 1, style: 0, col: 0, shirt: 1, pants: 0, hat: 0 } : { girl: 0, skin: 1, style: 0, col: 1, shirt: 0, pants: 0, hat: 0 };
  return { girl: av & 1, skin: av >> 1 & 3, style: av >> 3 & 3, col: av >> 5 & 7, shirt: av >> 8 & 7, pants: av >> 11 & 3, hat: av >> 13 & 1 };
}
const lookMemo = new Map();
/** Avatar integer → concrete look (colours), the same shape the villagers use. */
export function lookOf(av) {
  av |= 0; let L = lookMemo.get(av); if (L) return L;
  const o = unpackLook(av), hijab = o.girl && o.style < 2;
  L = { girl: !!o.girl, skin: SKIN[o.skin], style: o.style, shirt: SHIRTC[o.shirt] };
  if (hijab) L.hijab = HIJABC[o.col]; else L.hair = HAIRC[o.col];
  if (o.girl) { L.skirt = SKIRTC[o.pants] || L.shirt; L.pin = !!o.hat; } else { L.pants = PANTSC[o.pants]; L.peci = !!o.hat; }
  lookMemo.set(av, L); return L;
}
export const randomLook = girl => ({ girl: girl ? 1 : 0, skin: Math.random() * 4 | 0, style: Math.random() * 4 | 0, col: Math.random() * 8 | 0, shirt: Math.random() * 8 | 0, pants: Math.random() * 4 | 0, hat: Math.random() < .3 ? 1 : 0 });

/* ---------- characters (24×36 HD box, feet on the bottom edge) ---------- */
export const CW = 24, CH = 36;
function drawChar(g, L, dir, f, noeyes) {
  const P = (x, y, w, h, c) => R(g, x, y, w, h, c);
  const skin = L.skin || '#F1C27D', skD = shade(skin, -.14), girl = !!L.girl, style = L.style | 0;
  const hijab = girl && style < 2;
  const hc = hijab ? (L.hijab || '#E56B8A') : (L.hair || '#2B1D12'), hL = shade(hc, .2), hD = shade(hc, -.22);
  const top = L.shirt || '#3A78C9', topD = shade(top, -.18), topL = shade(top, .28);
  const bot = girl ? (L.skirt || top) : (L.pants || '#2B4C7E'), botD = shade(bot, -.2);
  const shoe = '#4A3222', eye = '#2B1D12';
  const step = f === 1 ? -1 : f === 3 ? 1 : 0, o = step ? -1 : 0;     // o: upper body bobs up on a step
  E(g, 12, 34, 8, 2, 'rgba(0,0,0,.2)');
  const side = dir === 1 || dir === 3, back = dir === 2;

  if (side) {
    // legs
    if (girl) { P(7, 26 + o, 10, 3, bot); P(6, 29 + o, 12, 4, bot); P(6, 32 + o, 12, 1, botD);
      if (step < 0) { P(6, 33, 5, 2, shoe); P(13, 32, 4, 2, shoe); } else if (step > 0) { P(8, 32, 4, 2, shoe); P(12, 33, 5, 2, shoe); } else P(8, 33, 7, 2, shoe); }
    else { P(8, 27 + o, 8, 3, bot);
      if (step < 0) { P(13, 30, 4, 2, botD); P(13, 32, 5, 2, shoe); P(7, 30, 4, 3, bot); P(5, 33, 6, 2, shoe); }
      else if (step > 0) { P(7, 30, 4, 2, botD); P(6, 32, 5, 2, shoe); P(12, 30, 4, 3, bot); P(11, 33, 6, 2, shoe); }
      else { P(9, 30, 6, 3, bot); P(7, 33, 8, 2, shoe); } }
    // body + arm
    P(8, 19 + o, 8, 8 + (girl ? 0 : 0), top); P(14, 20 + o, 2, 7, topD);
    const ax = 11 - step * 2; P(ax, 20 + o, 3, 5, topD); P(ax, 25 + o, 3, 2, skin);
    // head
    P(5, 9 + o, 14, 9, skin); P(6, 8 + o, 12, 1, skin); P(7, 18 + o, 10, 1, skD); P(4, 13 + o, 1, 2, skin);
    if (!hijab) P(13, 12 + o, 2, 3, skD);
    if (L.mask) { P(4, 11 + o, 10, 4, '#1A1A1A'); if (!noeyes) P(7, 12 + o, 2, 2, '#fff'); }
    else { if (!noeyes) { P(7, 12 + o, 2, 3, eye); P(7, 12 + o, 1, 1, '#fff'); } g.fillStyle = 'rgba(235,110,100,.5)'; g.fillRect(5, 15 + o, 2, 1); P(5, 16 + o, 2, 1, '#B5534A'); }
    if (L.beard) { P(4, 16 + o, 6, 3, hc); P(5, 19 + o, 4, 1, hc); }
    if (hijab) {
      P(6, 4 + o, 12, 1, hc); P(5, 5 + o, 14, 1, hc); P(4, 6 + o, 16, 3, hc); P(11, 9 + o, 9, 10, hc); P(5, 9 + o, 2, 1, hD);
      P(6, 18 + o, 12, 1, hD); P(6, 19 + o, 12, style ? 8 : 4, hc); if (style) P(5, 23 + o, 14, 4, hc);
      P(8, 5 + o, 5, 1, hL); P(15, 12 + o, 1, 6, hD);
    } else {
      hairCap(P, style, girl, hc, hL, o, true);
      P(15, 9 + o, 5, 5, hc); P(16, 14 + o, 4, 2, hc); P(11, 9 + o, 2, 2, hc);
      if (girl && style === 3) P(14, 14 + o, 6, 10, hc);
      if (girl && style === 2) { P(18, 9 + o, 4, 8, hc); P(18, 10 + o, 2, 1, '#E56B8A'); }
    }
  } else {
    // legs
    const lL = step < 0 ? 2 : 0, rL = step > 0 ? 2 : 0;
    if (girl) { P(6, 26 + o, 12, 3, bot); P(5, 29 + o, 14, 4, bot); P(5, 32 + o, 14, 1, botD); P(7, 33 - lL / 2, 4, 2, shoe); P(13, 33 - rL / 2, 4, 2, shoe); }
    else { P(7, 27 + o, 10, 4, bot); P(7, 30, 4, 3 - lL, bot); P(13, 30, 4, 3 - rL, bot); P(11, 30, 2, 1, botD); P(6, 33 - lL, 5, 2, shoe); P(13, 33 - rL, 5, 2, shoe); }
    // body + arms
    P(6, 19 + o, 12, 9 - (girl ? 2 : 1), top); P(16, 20 + o, 2, 6, topD);
    if (!back && !girl) P(10, 19 + o, 4, 1, topL);
    if (girl) P(6, 25 + o, 12, 1, topD);
    const al = step;   // arms swing opposite to each other
    P(4, 20 + o + al, 2, 5, topD); P(4, 25 + o + al, 2, 2, skin); P(18, 20 + o - al, 2, 5, topD); P(18, 25 + o - al, 2, 2, skin);
    // head
    P(5, 9 + o, 14, 9, skin); P(6, 8 + o, 12, 1, skin); P(7, 18 + o, 10, 1, skD);
    if (!hijab) { P(4, 13 + o, 1, 2, skin); P(19, 13 + o, 1, 2, skin); }
    if (!back) {
      if (L.mask) { P(5, 11 + o, 14, 4, '#1A1A1A'); if (!noeyes) { P(8, 12 + o, 2, 2, '#fff'); P(14, 12 + o, 2, 2, '#fff'); } }
      else {
        if (!noeyes) { P(8, 12 + o, 2, 3, eye); P(14, 12 + o, 2, 3, eye); P(8, 12 + o, 1, 1, '#fff'); P(14, 12 + o, 1, 1, '#fff'); }
        g.fillStyle = 'rgba(235,110,100,.5)'; g.fillRect(6, 15 + o, 2, 1); g.fillRect(16, 15 + o, 2, 1);
        P(11, 16 + o, 2, 1, '#B5534A');
      }
      if (L.beard) { P(6, 15 + o, 2, 3, hc); P(16, 15 + o, 2, 3, hc); P(7, 17 + o, 10, 3, hc); P(9, 20 + o, 6, 1, hc); P(11, 16 + o, 2, 1, '#B5534A'); }
    }
    if (hijab) {
      P(6, 4 + o, 12, 1, hc); P(5, 5 + o, 14, 1, hc); P(4, 6 + o, 16, 3, hc);
      if (back) { P(4, 9 + o, 16, 10, hc); P(8, 6 + o, 1, 12, hD); }
      else { P(4, 9 + o, 3, 10, hc); P(17, 9 + o, 3, 10, hc); P(7, 9 + o, 10, 1, hD); P(7, 18 + o, 10, 1, hD); }
      P(4, 19 + o, 16, 3, hc); P(5, 22 + o, 14, 2, hc);
      if (style) { P(3, 20 + o, 18, 5, hc); P(4, 25 + o, 16, 2, hc); P(3, 24 + o, 18, 1, hD); }
      P(7, 5 + o, 5, 1, hL); if (!back) P(11, 20 + o, 1, 3, hD);
    } else {
      hairCap(P, style, girl, hc, hL, o, false);
      if (back) { P(4, 9 + o, 16, style === 3 && !girl ? 3 : 6, hc); P(6, 15 + o, 12, 1, hc); }
      else if (!(style === 3 && !girl)) { P(4, 9 + o, 2, 3, hc); P(18, 9 + o, 2, 3, hc); }
      if (girl && style === 3) { P(3, 8 + o, 2, 15, hc); P(19, 8 + o, 2, 15, hc); if (back) P(4, 9 + o, 16, 14, hc); }
      if (girl && style === 2) { P(1, 10 + o, 3, 8, hc); P(20, 10 + o, 3, 8, hc); P(3, 11 + o, 1, 2, '#E56B8A'); P(20, 11 + o, 1, 2, '#E56B8A'); if (back) P(4, 9 + o, 16, 7, hc); }
    }
  }
  // headwear
  if (L.hat) { const hb = shade(L.hat, -.3); P(6, 2 + o, 12, 5, L.hat); P(7, 1 + o, 10, 1, L.hat); P(6, 6 + o, 12, 1, hb); P(2, 7 + o, 20, 2, L.hat); P(2, 8 + o, 20, 1, hb); P(8, 2 + o, 4, 1, shade(L.hat, .3)); }
  if (L.peci) { P(6, 2 + o, 12, 5, '#23232C'); P(7, 3 + o, 10, 1, '#3D3D4B'); P(6, 6 + o, 12, 1, '#15151B'); }
  if (L.pin && !back) { const px = side ? 13 : 16; P(px, 6 + o, 3, 3, '#FFD23F'); P(px + 1, 5 + o, 1, 5, '#FFD23F'); P(px + 1, 7 + o, 1, 1, '#FFF7D6'); }
}
function hairCap(P, style, girl, hc, hL, o, side) {
  if (!girl && style === 3) { const c = shade(hc, .12); P(6, 5 + o, 12, 1, c); P(5, 6 + o, 14, 2, c); P(4, 8 + o, 16, 1, c); return; }
  if (!girl && style === 2) {
    P(3, 6 + o, 18, 4, hc); P(5, 4 + o, 3, 2, hc); P(9, 3 + o, 3, 3, hc); P(13, 3 + o, 3, 3, hc); P(17, 5 + o, 2, 2, hc); P(3, 10 + o, 2, 3, hc); P(19, 10 + o, 2, 3, hc);
    P(6, 5 + o, 1, 1, hL); P(10, 4 + o, 1, 1, hL); P(14, 4 + o, 1, 1, hL); P(7, 8 + o, 2, 1, hL); P(13, 7 + o, 2, 1, hL); return;
  }
  P(6, 4 + o, 12, 1, hc); P(5, 5 + o, 14, 1, hc); P(4, 6 + o, 16, 3, hc); P(8, 5 + o, 5, 1, hL); P(7, 6 + o, 2, 1, hL);
  if (!girl && style === 1) { P(8, 3 + o, 2, 1, hc); P(12, 3 + o, 3, 1, hc); P(16, 4 + o, 2, 1, hc); if (!side) { P(5, 9 + o, 10, 1, hc); P(5, 10 + o, 4, 1, hc); } else P(5, 9 + o, 4, 1, hc); }
  else if (!side) { P(6, 9 + o, 3, 1, hc); P(12, 9 + o, 3, 1, hc); if (girl) P(15, 9 + o, 3, 1, hc); }
}
const keyMemo = new WeakMap();
const lookKey = L => { let k = keyMemo.get(L); if (!k) { k = JSON.stringify(L); keyMemo.set(L, k); } return k; };
/** dir: 0 down, 1 left, 2 up, 3 right. frame: 0..3 (0 and 2 stand, 1 and 3 step). */
export function charSprite(L, dir = 0, frame = 0) {
  const ne = noEyes;
  return bake('c' + lookKey(L) + dir + frame + (ne ? 'n' : ''), CW, CH, g => {
    if (dir === 3) { g.translate(CW, 0); g.scale(-1, 1); }
    drawChar(g, L, dir === 3 ? 1 : dir, frame, ne);
  });
}
/** Draw a character whose classic 12×16 box starts at logical (x,y). */
export function drawChar16(c, x, y, L, dir, frame) { blit(c, charSprite(L, dir, frame), x, y - 2); }

/* ---------- portraits (dialog faces) ---------- */
const portraits = new Map();
export function portraitURL(L) {
  const k = lookKey(L) + (noEyes ? 'n' : ''); let u = portraits.get(k); if (u) return u;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const sky = g.createLinearGradient(0, 0, 0, 64); sky.addColorStop(0, '#9EDCF8'); sky.addColorStop(.7, '#DDF3FB'); g.fillStyle = sky; g.fillRect(0, 0, 64, 64);
  E(g, 14, 60, 26, 12, '#8AD277'); E(g, 52, 62, 24, 10, '#74C365');
  const s = charSprite(L, 0, 0); g.drawImage(s.cv, s.pad, s.pad, CW, 27, -4, 1, CW * 3, 27 * 3);
  u = cv.toDataURL(); portraits.set(k, u); return u;
}

/* ---------- ground (one big canvas, rebuilt only when the map opens up) ---------- */
const G1 = '#74C365', G2 = '#68B85A', G3 = '#82CD72', GD = '#4F9E4A', P1 = '#E3C58F', P2 = '#D3B079', P3 = '#EFDAB0';
export function buildGround(COLS, ROWS, isPath, o) {
  const cv = document.createElement('canvas'), W = COLS * 32, H = ROWS * 32; cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), rnd = rng(20261110);
  R(g, 0, 0, W, H, G1);
  for (let i = 0; i < COLS * ROWS * 1.1; i++) E(g, rnd() * W | 0, rnd() * H | 0, 5 + rnd() * 11 | 0, 3 + rnd() * 5 | 0, rnd() < .5 ? G2 : G3);
  for (let i = 0; i < COLS * ROWS * 3; i++) { const x = rnd() * W | 0, y = rnd() * H | 0; R(g, x, y, 1, 3, GD); R(g, x + 2, y + 1, 1, 2, GD); if (rnd() < .5) R(g, x - 2, y + 1, 1, 2, GD); }
  for (let i = 0; i < COLS * ROWS * .45; i++) { const x = 4 + rnd() * (W - 8) | 0, y = 4 + rnd() * (H - 8) | 0, c = ['#FFFFFF', '#FFE98A', '#F7A8C0', '#CFE8FF'][rnd() * 4 | 0];
    R(g, x - 1, y, 3, 1, c); R(g, x, y - 1, 1, 3, c); R(g, x, y, 1, 1, '#F4B400'); R(g, x, y + 2, 1, 2, GD); }
  for (let i = 0; i < COLS * ROWS * .12; i++) { const x = rnd() * W | 0, y = rnd() * H | 0; R(g, x, y, 3, 2, '#B9B9B0'); R(g, x, y, 2, 1, '#DADAD2'); R(g, x, y + 2, 3, 1, 'rgba(0,0,0,.15)'); }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!isPath(x, y)) continue; const X = x * 32, Y = y * 32;
    R(g, X, Y, 32, 32, P1);
    for (let i = 0; i < 9; i++) { const a = rnd() * 29 | 0, b = rnd() * 30 | 0; R(g, X + a, Y + b, 2 + (rnd() * 2 | 0), 1, rnd() < .6 ? P2 : P3); }
    if (rnd() < .5) { const a = 4 + rnd() * 22 | 0, b = 4 + rnd() * 22 | 0; R(g, X + a, Y + b, 3, 2, '#C2A26C'); R(g, X + a, Y + b, 2, 1, '#F5E6C4'); }
    const n = !isPath(x, y - 1), s = !isPath(x, y + 1), w = !isPath(x - 1, y), e = !isPath(x + 1, y);
    for (let k = 0; k < 32; k += 2) {
      const d = () => 1 + (rnd() < .45 ? 1 : 0) + (rnd() < .15 ? 1 : 0);
      if (n) { const q = d(); R(g, X + k, Y, 2, q, G2); R(g, X + k, Y + q, 2, 1, P2); }
      if (s) { const q = d(); R(g, X + k, Y + 32 - q, 2, q, G1); R(g, X + k, Y + 31 - q, 2, 1, P3); }
      if (w) { const q = d(); R(g, X, Y + k, q, 2, G2); R(g, X + q, Y + k, 1, 2, P2); }
      if (e) { const q = d(); R(g, X + 32 - q, Y + k, q, 2, G1); R(g, X + 31 - q, Y + k, 1, 2, P3); }
    }
    const corner = (cx, cy, sx, sy) => { R(g, cx, cy, 4 * sx, 2 * sy, G1); R(g, cx, cy, 2 * sx, 4 * sy, G1); R(g, cx, cy, 6 * sx, 1 * sy, G1); R(g, cx, cy, 1 * sx, 6 * sy, G1); };
    if (n && w) corner(X, Y, 1, 1); if (n && e) corner(X + 32, Y, -1, 1); if (s && w) corner(X, Y + 32, 1, -1); if (s && e) corner(X + 32, Y + 32, -1, -1);
  }
  (o.locked || []).forEach(([a, b]) => { const X = a * 32, Y = b * 32; g.fillStyle = 'rgba(70,110,50,.35)'; g.fillRect(X + 8, Y + 12, 48, 40); g.fillStyle = 'rgba(40,70,30,.5)'; for (let k = 0; k < 48; k += 6) { g.fillRect(X + 8 + k, Y + 12, 3, 1); g.fillRect(X + 8 + k, Y + 51, 3, 1); } for (let k = 0; k < 40; k += 6) { g.fillRect(X + 8, Y + 12 + k, 1, 3); g.fillRect(X + 55, Y + 12 + k, 1, 3); } });
  (o.dim || []).forEach(([a, b, w, h]) => { g.fillStyle = 'rgba(30,45,25,.3)'; g.fillRect(a * 32, b * 32, w * 32, h * 32); });
  return cv;
}

/* ---------- nature ---------- */
const TREES = [['#2E8B47', '#3FA654', '#5CC068', '#226C3A'], ['#2E8B47', '#3FA654', '#5CC068', '#226C3A'], ['#3C9440', '#58B04A', '#80CC5E', '#2C7434'], ['#267F56', '#35A06C', '#55BE86', '#1B6344']];
/** 32×42, the tile is the bottom 32 rows. v: 0 plain, 1 red fruit, 2 light, 3 teal, 4 fruit tree (orange + red). */
export const treeSprite = v => bake('tree' + v, 32, 42, g => {
  const [d, m, l, u] = TREES[v % 4], rnd = rng(77 + v);
  E(g, 16, 39, 11, 2, 'rgba(0,0,0,.22)');
  R(g, 13, 26, 6, 14, '#8A5A33'); R(g, 13, 26, 2, 14, '#6E4426'); R(g, 17, 29, 1, 9, '#A8743F'); R(g, 11, 39, 3, 1, '#6E4426'); R(g, 18, 39, 3, 1, '#8A5A33');
  E(g, 16, 25, 11, 4, u); E(g, 16, 16, 14, 12, d); E(g, 15, 14, 12, 9, m); E(g, 11, 10, 7, 4, l); E(g, 21, 12, 4, 2, l); E(g, 9, 8, 3, 1, shade(l, .25));
  for (let i = 0; i < 14; i++) { const x = 5 + rnd() * 22 | 0, y = 8 + rnd() * 16 | 0; R(g, x, y, 2, 1, i % 3 ? d : u); }
  if (v === 1 || v === 4) [[8, 17], [20, 9], [23, 19], [13, 22]].forEach(([x, y], i) => { const c = v === 4 && i % 2 ? '#F4A300' : '#E2483B'; R(g, x, y, 3, 3, c); R(g, x, y, 1, 1, '#FFD0C4'); });
});
/** 32×38 hedge (tile = bottom 32 rows). */
export const hedgeSprite = v => bake('hedge' + v, 32, 38, g => {
  E(g, 16, 36, 13, 1, 'rgba(0,0,0,.2)'); E(g, 16, 22, 15, 13, '#2E8B47'); E(g, 16, 31, 14, 4, '#226C3A');
  E(g, 9, 15, 7, 6, '#3FA654'); E(g, 22, 14, 8, 7, '#3FA654'); E(g, 15, 9, 6, 3, '#5CC068'); E(g, 24, 9, 3, 2, '#5CC068'); E(g, 7, 12, 2, 1, '#80D680');
  const rnd = rng(5 + v); for (let i = 0; i < 10; i++) R(g, 4 + rnd() * 24 | 0, 12 + rnd() * 18 | 0, 2, 1, '#226C3A');
  if (v % 3 === 0) [[8, 22], [22, 25], [15, 17]].forEach(([x, y]) => { R(g, x, y, 2, 2, v % 2 ? '#F7A8C0' : '#FFFFFF'); R(g, x, y, 1, 1, '#FFE98A'); });
});
export const gateSprite = open => bake('gate' + (open ? 1 : 0), 32, 38, g => {
  [1, 26].forEach(x => { R(g, x, 8, 5, 29, '#8A5A33'); R(g, x, 8, 2, 29, '#6E4426'); R(g, x + 4, 10, 1, 25, '#A8743F'); R(g, x - 1, 6, 7, 3, '#B5793C'); R(g, x, 5, 5, 1, '#D29A58'); });
  if (open) { R(g, 6, 12, 2, 24, '#C98A52'); R(g, 24, 12, 2, 24, '#C98A52'); return; }
  [14, 26].forEach(y => { R(g, 6, y, 20, 4, '#D29A58'); R(g, 6, y + 3, 20, 1, '#A86B3C'); R(g, 6, y, 20, 1, '#E8B878'); });
  for (let i = 0; i < 9; i++) R(g, 7 + i * 2, 17 + i, 3, 2, '#B5793C');
  R(g, 13, 18, 6, 8, '#F4B400'); R(g, 13, 18, 6, 1, '#FFE07A'); R(g, 15, 21, 2, 3, '#7A5A00'); R(g, 14, 15, 4, 3, '#C9C9C9'); R(g, 15, 16, 2, 2, '#D29A58');
});
export const fenceSprite = () => bake('fence', 32, 30, g => {
  R(g, 0, 28, 32, 2, 'rgba(0,0,0,.18)');
  [12, 21].forEach(y => { R(g, 0, y, 32, 3, '#D9A866'); R(g, 0, y + 2, 32, 1, '#B5833F'); R(g, 0, y, 32, 1, '#EFC98A'); });
  [2, 10, 18, 26].forEach(x => { R(g, x, 7, 5, 21, '#EBC88E'); R(g, x + 1, 5, 3, 2, '#EBC88E'); R(g, x + 2, 4, 1, 1, '#EBC88E'); R(g, x, 7, 1, 21, '#FBE3B4'); R(g, x + 4, 8, 1, 20, '#C99A5E'); });
});

/* ---------- buildings ---------- */
function planks(g, x, y, w, h, base) {
  R(g, x, y, w, h, base); const d = shade(base, -.14), l = shade(base, .16), rnd = rng(x * 31 + y * 7 + w);
  for (let r = y + 5; r < y + h; r += 6) { R(g, x, r, w, 1, d); for (let k = 0; k < 3; k++) R(g, x + 3 + (rnd() * (w - 8) | 0), r - 3, 2, 1, k ? d : l); }
  R(g, x, y, w, 3, shade(base, -.2)); R(g, x + w - 2, y, 2, h, d); R(g, x, y + 3, 1, h - 3, l);
}
function roof(g, x, y, w, h, slope, c) {
  const c2 = shade(c, -.14), l = shade(c, .25), d = shade(c, -.32);
  for (let r = 0; r < h; r++) { const ins = Math.round((h - 1 - r) * slope), band = (r / 4 | 0), col = band % 2 ? c2 : c; R(g, x + ins, y + r, w - 2 * ins, 1, col);
    if (r % 4 === 3) for (let k = x + ins + (band % 2 ? 2 : 5); k < x + w - ins - 1; k += 6) R(g, k, y + r - 2, 1, 3, d);
    if (r % 4 === 0) R(g, x + ins + 1, y + r, w - 2 * ins - 2, 1, l); }
  R(g, x, y + h - 2, w, 2, d); R(g, x + Math.round((h - 1) * slope), y, w - 2 * Math.round((h - 1) * slope), 1, l);
}
function win(g, x, y, w, h, lit) {
  R(g, x - 1, y - 1, w + 2, h + 2, '#5A3820'); R(g, x, y, w, h, lit ? '#FFE38A' : '#9FD8F5');
  if (lit) { R(g, x, y, w, 2, '#FFF4C2'); R(g, x, y + h - 3, w, 3, '#F8C456'); } else { R(g, x + 1, y + 1, 3, 1, '#fff'); R(g, x + 1, y + 2, 1, 2, '#fff'); R(g, x, y + h - 3, w, 3, '#7CC3EA'); }
  R(g, x + (w >> 1), y, 1, h, '#5A3820'); R(g, x, y + (h >> 1), w, 1, '#5A3820'); R(g, x - 2, y + h + 1, w + 4, 2, '#E8D6A8'); R(g, x - 2, y + h + 3, w + 4, 1, '#B79F74');
}
function door(g, x, y, w, h) {
  R(g, x - 1, y - 1, w + 2, h + 1, '#5A3820'); R(g, x, y, w, h, '#9A6035'); R(g, x + 1, y + 1, w - 2, 2, '#B87A45'); R(g, x + 2, y + 5, w - 4, h / 2 - 5 | 0, '#84502B'); R(g, x + 2, y + h / 2 + 2 | 0, w - 4, h / 2 - 4 | 0, '#84502B');
  R(g, x + w - 4, y + h / 2 | 0, 2, 3, '#F4C430'); R(g, x - 3, y + h, w + 6, 3, '#C9C2B4'); R(g, x - 3, y + h, w + 6, 1, '#E6E0D2');
}
function flowerBox(g, x, y, w, c) { R(g, x, y + 3, w, 4, '#8E5A33'); R(g, x, y + 3, w, 1, '#B5793C'); for (let k = 1; k < w - 1; k += 4) { R(g, x + k, y + 1, 3, 2, '#3FA654'); R(g, x + k, y - 1, 3, 3, k % 8 < 4 ? c : '#FFFFFF'); R(g, x + k + 1, y, 1, 1, '#F4B400'); } }
function floor1(g, oy, wall, lit, lvl) {
  planks(g, 10, 38 + oy, 76, 54, wall);
  R(g, 8, 90 + oy, 80, 5, '#B9A583'); for (let k = 8; k < 88; k += 10) R(g, k, 90 + oy, 1, 5, '#8E7B5B'); R(g, 8, 90 + oy, 80, 1, '#D8C9A6');
  door(g, 39, 58 + oy, 18, 32); win(g, 17, 54 + oy, 14, 14, lit); win(g, 66, 54 + oy, 14, 14, lit);
  if (lvl >= 1) { flowerBox(g, 14, 70 + oy, 20, '#E56B8A'); flowerBox(g, 63, 70 + oy, 20, '#F4C430'); }
}
/** Player house. lvl 0 hut, 1 wooden house, 2 two floors. Box 96×96 (lvl 2: 96×128, 32 rows above the tile area). */
export const houseSprite = (lvl, lit, flag) => bake('house' + lvl + (lit ? 1 : 0) + (flag ? 1 : 0), 96, lvl >= 2 ? 128 : 96, g => {
  const oy = lvl >= 2 ? 32 : 0;
  E(g, 48, 93 + oy, 45, 3, 'rgba(0,0,0,.22)');
  if (lvl >= 2) {
    floor1(g, oy, '#DDA06A', lit, 1);
    planks(g, 16, 34, 64, 34, '#E6B07A'); win(g, 25, 42, 13, 13, lit); win(g, 58, 42, 13, 13, lit);
    roof(g, 2, 60, 92, 14, .35, '#4A86D6'); roof(g, 6, 4, 84, 34, .62, '#4A86D6');
    R(g, 47, -1 + 2, 2, 8, '#6E4426'); R(g, 49, 2, 9, 5, flag ? '#F4B400' : '#E8A800'); R(g, 49, flag ? 6 : 2, 9, 1, '#C98A00');
  } else {
    floor1(g, 0, lvl ? '#DDA06A' : '#F4E3BC', lit, lvl);
    if (lvl) { R(g, 68, 4, 11, 20, '#B5553F'); for (let r = 6; r < 24; r += 4) R(g, 68, r, 11, 1, '#8E3F2E'); R(g, 66, 2, 15, 4, '#8E8E8E'); R(g, 66, 2, 15, 1, '#B5B5B5'); }
    else { R(g, 68, 6, 10, 18, '#9A9A9A'); R(g, 68, 6, 3, 18, '#B5B5B5'); R(g, 66, 4, 14, 4, '#7A7A7A'); }
    roof(g, 2, 8, 92, 36, .55, lvl ? '#D2503F' : '#D9B457');
  }
});
const TIERWALL = ['#F4E3BC', '#FFF6DC', '#FFF6DC'];
/** Villager hut, 64×72 (tile area = bottom 64 rows). */
export const hutSprite = (roofCol, tier, lit) => bake('hut' + roofCol + tier + (lit ? 1 : 0), 64, 72, g => {
  E(g, 32, 70, 30, 2, 'rgba(0,0,0,.22)');
  planks(g, 6, 38, 52, 30, TIERWALL[tier] || TIERWALL[0]); R(g, 4, 66, 56, 4, '#B9A583'); R(g, 4, 66, 56, 1, '#D8C9A6');
  door(g, 26, 46, 13, 20); win(g, 10, 46, 10, 10, lit); win(g, 45, 46, 10, 10, lit);
  roof(g, 0, 10, 64, 30, .5, roofCol);
  if (tier >= 1) { flowerBox(g, 8, 58, 14, '#E56B8A'); flowerBox(g, 43, 58, 14, '#F4C430'); }
  if (tier >= 2) { R(g, 6, 38, 52, 2, '#F4B400'); R(g, 6, 38, 52, 1, '#FFE07A'); R(g, 22, 42, 2, 4, '#6E4426'); R(g, 21, 46, 4, 5, lit ? '#FFE07A' : '#D9B457'); }
});
export const lotSprite = () => bake('lot', 64, 64, g => {
  E(g, 32, 46, 27, 13, '#8FD37C'); E(g, 32, 46, 24, 11, '#9BDB88');
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; R(g, 32 + Math.round(Math.cos(a) * 26) - 1, 46 + Math.round(Math.sin(a) * 12), 3, 1, '#5FAE52'); }
  R(g, 30, 26, 4, 22, '#8A5A33'); R(g, 30, 26, 1, 22, '#6E4426'); R(g, 18, 12, 28, 17, '#C98A52'); R(g, 18, 12, 28, 2, '#E3A96C'); R(g, 18, 27, 28, 2, '#A86B3C'); R(g, 20, 15, 24, 11, '#FFF6DC');
  R(g, 31, 19, 2, 6, '#3FA654'); R(g, 27, 17, 4, 3, '#5CC068'); R(g, 33, 16, 4, 3, '#5CC068');
});
/** Seed shop, 96×72 (tile area = bottom 64 rows). */
export const shopSprite = () => bake('shop', 96, 72, g => {
  E(g, 48, 70, 44, 2, 'rgba(0,0,0,.22)');
  R(g, 6, 30, 84, 38, '#8A5A33'); planks(g, 6, 48, 84, 20, '#B5793C'); R(g, 4, 44, 88, 5, '#D9A866'); R(g, 4, 44, 88, 1, '#F0CC92'); R(g, 4, 48, 88, 1, '#8A5A33');
  R(g, 6, 30, 84, 14, '#6E4426');
  [['#E0702F', 12], ['#F4C430', 32], ['#FFFFFF', 52], ['#D23A2A', 72]].forEach(([c, x]) => { R(g, x, 34, 14, 10, '#E8D6A8'); R(g, x, 34, 14, 2, '#F6EACB'); R(g, x, 42, 14, 2, '#B79F74'); E(g, x + 4, 37, 2, 2, c); E(g, x + 9, 38, 2, 2, c); E(g, x + 7, 35, 2, 1, shade(c, .2)); });
  [5, 87].forEach(x => { R(g, x, 26, 4, 42, '#6E4426'); R(g, x, 26, 1, 42, '#8A5A33'); });
  for (let i = 0; i < 8; i++) { const c = i % 2 ? '#FFF6DC' : '#D2503F', x = i * 12; R(g, x, 10, 12, 16, c); R(g, x, 10, 12, 2, shade(c, .3)); R(g, x, 22, 12, 4, shade(c, -.14)); E(g, x + 6, 27, 6, 3, c); R(g, x + 11, 10, 1, 16, shade(c, -.2)); }
  R(g, 0, 8, 96, 3, '#6E4426'); R(g, 0, 8, 96, 1, '#A8743F');
  R(g, 36, 0, 24, 11, '#C98A52'); R(g, 36, 0, 24, 2, '#E3A96C'); R(g, 38, 3, 20, 6, '#FFF6DC'); R(g, 47, 4, 2, 4, '#3FA654'); R(g, 44, 4, 3, 2, '#5CC068'); R(g, 49, 3, 3, 2, '#5CC068');
});
/** Well, 32×44 (tile area = bottom 32 rows). */
export const wellSprite = f => bake('well' + f, 32, 44, g => {
  E(g, 16, 41, 14, 2, 'rgba(0,0,0,.22)');
  R(g, 3, 28, 26, 12, '#9A9AA4'); E(g, 16, 28, 13, 5, '#B9B9C2'); E(g, 16, 28, 10, 3, '#2F6DB5'); E(g, 15 + f, 27, 4, 1, '#7DB8EE');
  for (let k = 5; k < 28; k += 6) { R(g, k, 31, 1, 4, '#74747E'); R(g, k + 3, 35, 1, 5, '#74747E'); } R(g, 3, 35, 26, 1, '#74747E'); R(g, 3, 39, 26, 1, '#6A6A74');
  [3, 26].forEach(x => { R(g, x, 10, 3, 20, '#8A5A33'); R(g, x, 10, 1, 20, '#A8743F'); });
  R(g, 5, 13, 22, 2, '#6E4426'); R(g, 15, 15, 1, 6, '#D8C9A6'); R(g, 13, 20, 6, 5, '#B5793C'); R(g, 13, 20, 6, 1, '#D9A866'); R(g, 13, 22, 6, 1, '#6E4426');
  roof(g, 0, 2, 32, 10, .5, '#D2503F');
});
export const signSprite = () => bake('sign', 32, 32, g => {
  E(g, 16, 30, 7, 1, 'rgba(0,0,0,.2)'); R(g, 14, 16, 4, 14, '#8A5A33'); R(g, 14, 16, 1, 14, '#6E4426');
  R(g, 3, 4, 26, 15, '#C98A52'); R(g, 3, 4, 26, 2, '#E3A96C'); R(g, 3, 17, 26, 2, '#A86B3C'); R(g, 7, 8, 18, 2, '#6E4426'); R(g, 9, 12, 14, 2, '#6E4426');
  R(g, 10, 29, 1, 2, '#3FA654'); R(g, 20, 28, 1, 3, '#3FA654');
});
export const chestSprite = f => bake('chest' + f, 32, 32, g => {
  const y = f ? 2 : 0; E(g, 16, 30, 11, 1, 'rgba(0,0,0,.22)');
  R(g, 5, 15 + y, 22, 13 - y, '#B5713A'); R(g, 5, 15 + y, 22, 1, '#6E4426'); R(g, 6, 9 + y, 20, 6, '#D08A4E'); R(g, 5, 11 + y, 22, 4, '#D08A4E'); R(g, 7, 10 + y, 14, 1, '#EDB277');
  [8, 22].forEach(x => R(g, x, 9 + y, 2, 19 - y, '#F4C430')); R(g, 5, 26, 22, 2, '#8E5328');
  R(g, 14, 13 + y, 4, 6, '#F4C430'); R(g, 15, 15 + y, 2, 2, '#7A5A00'); R(g, 14, 13 + y, 4, 1, '#FFF1A8');
});
export const trophySprite = col => bake('trophy' + col, 28, 28, g => {
  const l = shade(col, .45), d = shade(col, -.25);
  R(g, 7, 2, 14, 12, col); R(g, 9, 14, 10, 2, col); R(g, 12, 16, 4, 5, d); R(g, 3, 4, 4, 2, col); R(g, 3, 4, 2, 7, col); R(g, 3, 9, 5, 2, col); R(g, 21, 4, 4, 2, col); R(g, 23, 4, 2, 7, col); R(g, 20, 9, 5, 2, col);
  R(g, 9, 4, 2, 7, l); R(g, 7, 2, 14, 1, l); R(g, 18, 4, 2, 9, d); R(g, 8, 21, 12, 4, '#6E4426'); R(g, 8, 21, 12, 1, '#A8743F'); R(g, 10, 25, 8, 1, '#4A2E18');
});

/* ---------- farm plots + crops ---------- */
export const soilSprite = (wet, empty) => bake('soil' + (wet ? 1 : 0) + (empty ? 1 : 0), 64, 64, g => {
  const b = wet ? '#6B4526' : '#9A6638', tr = wet ? '#4F3019' : '#7B4D29', hi = wet ? '#86592F' : '#B98250', rnd = rng(wet ? 3 : 9);
  R(g, 2, 0, 60, 64, '#5E3A20'); R(g, 0, 2, 64, 60, '#5E3A20'); R(g, 1, 1, 62, 62, '#5E3A20'); R(g, 3, 3, 58, 58, b); R(g, 3, 3, 58, 1, tr);
  for (let i = 0; i < 4; i++) { const y = 10 + i * 14; R(g, 5, y, 54, 6, tr); R(g, 5, y - 2, 54, 2, hi); R(g, 5, y + 5, 54, 1, shade(tr, -.2)); }
  for (let i = 0; i < 40; i++) R(g, 5 + rnd() * 53 | 0, 5 + rnd() * 54 | 0, 1 + (rnd() * 2 | 0), 1, rnd() < .5 ? hi : tr);
  if (wet) for (let i = 0; i < 7; i++) { const x = 7 + rnd() * 48 | 0, y = 11 + (rnd() * 4 | 0) * 14; R(g, x, y + 1, 3, 1, '#7FB6E6'); R(g, x + 1, y, 1, 1, '#CFE8FF'); }
  if (empty) { g.fillStyle = 'rgba(255,240,200,.5)'; g.fillRect(30, 24, 4, 16); g.fillRect(24, 30, 16, 4); }
}, true);
const LEAF = '#4FB04A', LEAFL = '#74CC5E', STEM = '#3A8E3C';
function plant(g, kind, st, sw, cx, by) {
  const P = (x, y, w, h, c) => R(g, cx + x, by + y, w, h, c);
  if (st === 0) { P(-4, -3, 8, 3, '#5E3A20'); P(-3, -4, 6, 1, '#7B4D29'); P(-1, -5, 2, 1, '#E8D6A8'); return; }
  if (st === 1) { P(0, -5, 1, 5, STEM); P(-3 + sw, -7, 3, 2, LEAFL); P(1 + sw, -8, 3, 2, LEAF); return; }
  if (st === 2) { P(0, -10, 2, 10, STEM); P(-5 + sw, -9, 5, 3, LEAF); P(2 + sw, -12, 5, 3, LEAFL); P(-4, -4, 4, 2, LEAF); P(2, -5, 4, 2, LEAF); return; }
  const C = CROPCOL[kind];
  if (st === 3) { P(0, -15, 2, 15, STEM); P(-6 + sw, -11, 6, 3, LEAF); P(2 + sw, -15, 6, 3, LEAFL); P(-5, -5, 5, 3, LEAF); P(2, -7, 5, 3, LEAF); P(-1 + sw, -18, 4, 4, C); P(sw, -17, 1, 1, '#FFF6DC'); return; }
  const e = (x, y, rx, ry, c) => E(g, cx + x, by + y, rx, ry, c);
  if (kind === 'carrot') { P(-3, -4, 6, 4, '#E0702F'); P(-3, -4, 2, 3, '#F5924E'); P(-3, -1, 6, 1, '#B85320'); P(-1, -14, 2, 10, STEM); P(-5 + sw, -13, 3, 6, LEAFL); P(3 + sw, -14, 3, 7, LEAF); P(-3 + sw, -16, 2, 4, LEAF); P(1 + sw, -17, 2, 4, LEAFL); }
  if (kind === 'sunflower') { P(0, -20, 2, 20, STEM); P(-5, -10, 5, 3, LEAF); P(2, -7, 5, 3, LEAFL); e(1 + sw, -23, 6, 5, '#F4C430'); P(-2 + sw, -30, 6, 3, '#F4C430'); P(-2 + sw, -19, 6, 2, '#E0A800'); e(1 + sw, -23, 3, 2, '#7A4A2A'); P(sw, -24, 1, 1, '#A8743F'); }
  if (kind === 'jasmine') { e(0, -8, 8, 7, '#3A8E3C'); e(-1, -10, 6, 4, LEAF); [[-6, -9], [0, -14], [4, -8], [-2, -5], [5, -3], [-7, -3]].forEach(([a, b]) => { P(a, b, 3, 3, '#FFFFFF'); P(a + 1, b + 1, 1, 1, '#F4C430'); }); }
  if (kind === 'chili') { P(0, -15, 2, 15, STEM); e(0 + sw, -12, 8, 5, LEAF); e(-2 + sw, -14, 5, 2, LEAFL); [[-6, -9], [-2, -7], [3, -10], [6, -6]].forEach(([a, b]) => { P(a, b, 2, 6, '#D23A2A'); P(a, b, 1, 4, '#F06A55'); P(a, b - 1, 2, 1, STEM); }); }
  if (kind === 'tomato') { P(-4, -18, 1, 18, '#A8743F'); P(0, -15, 2, 15, STEM); e(0 + sw, -12, 8, 6, LEAF); e(-2 + sw, -15, 5, 2, LEAFL); [[-6, -9], [0, -13], [4, -7], [-2, -4]].forEach(([a, b]) => { e(a + 2, b + 2, 2, 2, '#E0362C'); P(a + 1, b + 1, 1, 1, '#FFB3A8'); P(a + 2, b, 1, 1, STEM); }); }
  if (kind === 'strawberry') { e(0, -5, 9, 5, '#3A8E3C'); e(-1, -7, 7, 3, LEAF); [[-7, -5], [-2, -8], [3, -5], [6, -8], [-4, -2], [2, -2]].forEach(([a, b]) => { P(a, b, 3, 3, '#E8344E'); P(a + 1, b + 3, 1, 1, '#E8344E'); P(a, b - 1, 3, 1, LEAFL); P(a + 1, b + 1, 1, 1, '#FFE07A'); }); }
  if (kind === 'corn') { P(0, -26, 2, 26, STEM); P(-5 + sw, -16, 5, 2, LEAF); P(2 + sw, -20, 6, 2, LEAFL); P(-6 + sw, -10, 6, 2, LEAFL); P(2, -17, 4, 9, '#F2D23C'); P(2, -17, 1, 9, '#D9B32A'); P(4, -16, 1, 1, '#FFF1A8'); P(4, -13, 1, 1, '#FFF1A8'); P(2, -8, 4, 2, LEAF); P(0, -29, 2, 3, '#D9B77A'); }
  if (kind === 'eggplant') { P(0, -14, 2, 14, STEM); e(0 + sw, -12, 8, 4, LEAF); e(-2 + sw, -14, 5, 2, LEAFL); [[-6, -9], [-1, -8], [4, -10]].forEach(([a, b]) => { P(a, b, 3, 8, '#7B3FA0'); P(a, b + 1, 1, 4, '#B07CD0'); P(a, b + 8, 2, 1, '#5E2E7E'); P(a, b - 1, 3, 1, STEM); }); }
  if (kind === 'watermelon') { P(-12, -2, 24, 2, STEM); P(-12, -5, 4, 3, LEAF); P(9, -6, 4, 3, LEAFL); e(0, -8, 10, 7, '#2F8A3A'); for (let i = -7; i <= 7; i += 4) P(i, -14 + Math.abs(i) / 3 | 0, 2, 13 - (Math.abs(i) / 2 | 0), '#8FD37C'); e(-3, -12, 3, 1, '#B5E8A0'); P(-1, -17, 2, 3, '#6E4426'); }
  if (kind === 'pumpkin') { P(-12, -3, 7, 2, STEM); P(6, -4, 7, 2, STEM); e(0, -7, 10, 7, '#E8862A'); e(-4, -7, 4, 6, '#F29B45'); P(-1, -13, 1, 12, '#C96A1C'); P(4, -12, 1, 11, '#C96A1C'); e(-5, -10, 2, 2, '#FBC078'); P(-1, -17, 2, 4, '#6E4426'); P(1, -17, 4, 2, LEAFL); }
}
export const CROPCOL = { carrot: '#E0702F', sunflower: '#F4C430', jasmine: '#FFFFFF', chili: '#D23A2A', pumpkin: '#E8862A', tomato: '#E0362C', strawberry: '#E8344E', corn: '#F2D23C', eggplant: '#7B3FA0', watermelon: '#3E8E35' };
const BIG = { pumpkin: 1, watermelon: 1 };
/** A plot's plants, 64×64 over the soil. stage 0 seed … 4 ripe. sway 0/1. */
export const cropSprite = (kind, st, sw) => bake('crop' + kind + st + sw, 64, 64, g => {
  const pos = st === 4 && BIG[kind] ? [[18, 30], [46, 30], [32, 59]] : [[12, 30], [32, 30], [52, 30], [12, 59], [32, 59], [52, 59]];
  pos.forEach(([x, y], i) => plant(g, kind, st, st === 4 && BIG[kind] ? 0 : (sw + i) % 2 * (sw ? 1 : 0), x, y));
});
/** One ripe plant for icons: 32×32 HD, drawn at double size by the icon canvas. */
export function plantIcon(g, kind) { plant(g, kind, 4, 0, 16, 30); }

/* ---------- soft effects (not outlined) ---------- */
export const glowSprite = () => bake('glow', 64, 64, g => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, 'rgba(255,225,130,.55)'); r.addColorStop(1, 'rgba(255,225,130,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, true);
export const cloudSprite = () => bake('cloud', 160, 80, g => { [[50, 44, 46, 26], [96, 36, 50, 30], [120, 52, 34, 20]].forEach(([x, y, a, b]) => { g.fillStyle = 'rgba(20,40,60,.07)'; g.beginPath(); g.ellipse(x, y, a, b, 0, 0, 7); g.fill(); }); }, true);
export const vignetteSprite = () => bake('vig', 96, 88, g => { const r = g.createRadialGradient(48, 44, 30, 48, 44, 70); r.addColorStop(0, 'rgba(30,20,10,0)'); r.addColorStop(1, 'rgba(30,20,10,.28)'); g.fillStyle = r; g.fillRect(0, 0, 96, 88); }, true);
export const butterflySprite = (c, f) => bake('bf' + c + f, 8, 6, g => { R(g, 3, 1, 1, 4, '#3A2A1E'); if (f) { R(g, 1, 1, 2, 3, c); R(g, 4, 1, 2, 3, c); } else { R(g, 0, 0, 3, 3, c); R(g, 4, 0, 3, 3, c); R(g, 1, 3, 2, 2, c); R(g, 4, 3, 2, 2, c); } }, true);

/* ---------- canvas sizing + quality governor ---------- */
const GFX_KEY = 'kebun-makna-gfx';
let lite = false; try { lite = localStorage.getItem(GFX_KEY) === 'lite'; } catch (e) {}
export const gfxLite = () => lite;
export function setGfxLite(v) { lite = !!v; try { localStorage.setItem(GFX_KEY, lite ? 'lite' : 'auto'); } catch (e) {} window.dispatchEvent(new Event('km-gfx')); }
let cap = 6;   // lowered at runtime when frames are slow
export const lowerCap = () => { if (cap > 2) { cap -= 2; return true; } return false; };
/** Backing-store pixels per logical pixel for a canvas shown `cssW` wide with `logW` logical pixels. Always even. */
export function pickScale(cssW, logW) {
  const want = cssW * (window.devicePixelRatio || 1) / logW;
  return Math.max(2, Math.min(lite ? 4 : cap, Math.ceil(want / 2) * 2));
}
/** Size a canvas for logical W×H and return its context, scaled so drawing code keeps using logical pixels. */
export function hdCanvas(cv, W, H, scale) {
  const k = scale || pickScale(cv.clientWidth || 360, W);
  if (cv.width !== W * k || cv.height !== H * k) { cv.width = W * k; cv.height = H * k; }
  cv.style.imageRendering = 'auto';
  const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.imageSmoothingEnabled = false; cv._k = k;
  return c;
}
