// avatar.js — v3: the player's own character. A small builder (skin, hair or jilbab, clothes, headwear) plus the
// "tanpa mata" display choice. The look is packed into the existing avatar integer (see art.js), so it travels
// with the save and the profile without any schema change.
import * as A from './art.js';

const el = h => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
function paint(cv, av, dir = 0, frame = 0) {
  const s = A.charSprite(A.lookOf(av), dir, frame);
  if (cv.width !== s.w || cv.height !== s.h) { cv.width = s.w; cv.height = s.h; }
  const g = cv.getContext('2d'); g.clearRect(0, 0, s.w, s.h); g.drawImage(s.cv, 0, 0);
}
/** A still picture of an avatar. scale 1 ≈ 72 px wide (matches the old avatar canvas). */
export function avatarCanvas(av, scale = 1) {
  const cv = document.createElement('canvas'); cv.dataset.av = av | 0; paint(cv, av | 0);
  if (scale !== 1) { cv.style.width = Math.round(66 * scale) + 'px'; cv.style.height = Math.round(96 * scale) + 'px'; }
  return cv;
}
// every avatar picture on screen follows the eyes choice
window.addEventListener('km-eyes', () => document.querySelectorAll('canvas[data-av]').forEach(cv => paint(cv, cv.dataset.av | 0)));

/** The eyes checkbox, shared by the start screen, the builder and the settings. */
export function eyesToggle(note = true) {
  const w = el(`<div class="eyesopt"><label class="toggle"><input type="checkbox"> <span>Gambar tokoh <b>tanpa mata</b></span></label>
    ${note ? '<p class="small">Untuk keluarga yang memilih gambar makhluk bernyawa tanpa mata. Berlaku untuk semua tokoh di perangkat ini dan bisa diubah kapan saja di ⚙.</p>' : ''}</div>`);
  const cb = w.querySelector('input'); cb.checked = A.eyesOff(); cb.onchange = () => A.setEyesOff(cb.checked);
  const sync = () => { if (!w.isConnected) return; cb.checked = A.eyesOff(); };
  window.addEventListener('km-eyes', sync);
  return w;
}

/** Avatar builder. onChange(av) fires with the packed integer on every change. opts.eyes adds the eyes checkbox. */
export function avatarBuilder(av0, onChange, opts = {}) {
  let o = A.unpackLook(av0 | 0);
  const w = el(`<div class="avb">
    <div class="avb-top"><div class="avb-prev"><canvas aria-label="Tokohmu"></canvas></div>
      <div class="avb-side"><div class="seg" data-k="girl"><button data-v="0">Laki-laki</button><button data-v="1">Perempuan</button></div>
        <button class="btn ghost mini" data-rnd type="button">🎲 Acak</button></div></div>
    <div class="avb-rows"></div></div>`);
  const cv = w.querySelector('canvas'), rows = w.querySelector('.avb-rows');
  const av = () => A.packLook(o);
  let dir = 0, tick = 0;
  const timer = setInterval(() => { if (!w.isConnected) { if (tick > 20) clearInterval(timer); tick++; return; } tick++; if (tick % 16 === 0) dir = (dir + 1) % 4; paint(cv, av(), [0, 3, 2, 1][dir], tick % 4); }, 140);
  const sw = (key, cols, label) => `<div class="avb-row"><span>${label}</span><div class="sws" data-k="${key}">${cols.map((c, i) => `<button type="button" data-v="${i}" style="background:${c}" aria-label="${label} ${i + 1}"></button>`).join('')}</div></div>`;
  function build() {
    const g = !!o.girl, hij = g && o.style < 2;
    rows.innerHTML =
      sw('skin', A.SKIN, 'Kulit') +
      `<div class="avb-row"><span>${g ? 'Kepala' : 'Rambut'}</span><div class="seg wrap" data-k="style">${A.STYLES[g ? 'girl' : 'boy'].map((n, i) => `<button type="button" data-v="${i}">${n}</button>`).join('')}</div></div>` +
      sw('col', hij ? A.HIJABC : A.HAIRC, hij ? 'Warna jilbab' : 'Warna rambut') +
      sw('shirt', A.SHIRTC, g ? 'Gamis' : 'Baju') +
      sw('pants', g ? A.SKIRTC.map(c => c || A.SHIRTC[o.shirt]) : A.PANTSC, g ? 'Rok' : 'Celana') +
      `<div class="avb-row"><span>${g ? 'Hiasan' : 'Peci'}</span><div class="seg" data-k="hat"><button type="button" data-v="0">Tanpa</button><button type="button" data-v="1">${g ? 'Jepit bunga' : 'Pakai peci'}</button></div></div>`;
    w.querySelectorAll('[data-k]').forEach(grp => grp.querySelectorAll('button').forEach(b => {
      b.type = 'button'; b.classList.toggle('on', (o[grp.dataset.k] | 0) === (b.dataset.v | 0));
      b.onclick = () => { o[grp.dataset.k] = b.dataset.v | 0; if (grp.dataset.k === 'girl') { o.style = 0; o.col = o.girl ? 0 : 1; o.hat = 0; } build(); paint(cv, av(), 0, 0); onChange(av()); };
    }));
  }
  w.querySelector('[data-rnd]').onclick = () => { o = A.randomLook(o.girl); build(); paint(cv, av()); onChange(av()); };
  build(); paint(cv, av());
  window.addEventListener('km-eyes', () => { if (w.isConnected) paint(cv, av()); });
  if (opts.eyes) w.append(eyesToggle());
  return w;
}
