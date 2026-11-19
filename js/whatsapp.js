// whatsapp.js — mandatory WhatsApp number for beta testers (so Ricky can ask for feedback).
// Stored in `beta_contacts` (own row + admin only; NOT in `profiles`, which every signed-in player can read).
// The number is kept as digits with the country code and no "+", for example 6281234567890.
import { $, esc, root } from './ui.js';
import { sb, session, friendly, signOut } from './api.js';
import { normalizeWhatsapp, showWhatsapp, isPlaceholderWhatsapp } from './phone.js';

const KEY = uid => 'kebun-makna-wa:' + uid; // "this account already has a number" remembered on the device (saves a query per start)
const remember = uid => { try { localStorage.setItem(KEY(uid), '1'); } catch (e) {} };

/** True when the signed-in player has not given a number yet.
 *  False on any error (offline, or the beta_contacts migration is not applied yet): never lock players out. */
export async function needsWhatsapp() {
  const u = session.user; if (!u) return false;
  try { if (localStorage.getItem(KEY(u.id)) === '1') return false; } catch (e) {}
  try {
    const c = await sb();
    const { data, error } = await c.from('beta_contacts').select('whatsapp').eq('profile_id', u.id).maybeSingle();
    if (error) return false;
    if (data) { remember(u.id); return false; }
    return true;
  } catch (e) { return false; }
}

async function save(digits) {
  const c = await sb();
  const { error } = await c.from('beta_contacts').upsert({ profile_id: session.user.id, whatsapp: digits });
  if (error) throw error;
  remember(session.user.id);
}

const WHY = 'Kebun Makna sedang dalam uji coba (beta). Kami akan menghubungi Anda lewat WhatsApp untuk meminta masukan. Nomor ini tidak ditampilkan ke pemain lain dan tidak dipakai untuk iklan.';

/** Full screen shown once after login to anyone without a number. done() runs after saving. */
export function whatsappScreen(done) {
  root.replaceChildren($(`<div class="title"><h1>Kebun Makna</h1><p>Satu langkah lagi</p></div>`));
  const f = $(`<div class="frame">
    <p style="margin:0 0 6px">${esc(WHY)}</p>
    <div class="field"><label for="wa"><b>Nomor WhatsApp</b></label><input id="wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="mis. 0812 3456 7890"></div>
    <button class="btn green block" id="go">Simpan</button>
    <p class="err" id="err"></p>
    <button class="linkbtn" id="out">Keluar</button></div>`);
  const err = f.querySelector('#err'), go = f.querySelector('#go');
  go.onclick = async () => {
    const d = normalizeWhatsapp(f.querySelector('#wa').value);
    if (!d) { err.textContent = 'Nomor WhatsApp belum benar. Contoh: 0812 3456 7890.'; return; }
    go.disabled = true; err.textContent = '';
    try { await save(d); done(); }
    catch (e) { err.textContent = friendly(e); go.disabled = false; }
  };
  f.querySelector('#wa').onkeydown = e => { if (e.key === 'Enter') go.click(); };
  f.querySelector('#out').onclick = async () => { await signOut(); location.hash = ''; location.reload(); };
  root.append(f);
}

/** A small card for the own profile page: shows the saved number and lets the player correct it. */
export async function whatsappBox() {
  const box = $(`<div class="frame"><b>📱 Nomor WhatsApp</b><p class="small" style="margin:4px 0 8px"></p>
    <div class="row"><button class="btn ghost" id="ch">Ubah</button></div></div>`);
  const line = box.querySelector('p');
  let cur = null;
  try {
    const c = await sb();
    const { data, error } = await c.from('beta_contacts').select('whatsapp').eq('profile_id', session.user.id).maybeSingle();
    if (error) return null; // migration not applied yet: show nothing
    cur = data && data.whatsapp;
  } catch (e) { return null; }
  line.textContent = cur && !isPlaceholderWhatsapp(cur) ? showWhatsapp(cur) + ' · hanya terlihat olehmu dan admin.' : 'Belum diisi. Isi nomor aslimu, ya.';
  box.querySelector('#ch').onclick = () => {
    const ed = $(`<div><div class="field"><input id="wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="mis. 0812 3456 7890"></div>
      <div class="row"><button class="btn green" id="sv">Simpan</button></div><p class="err"></p></div>`);
    const e = ed.querySelector('.err');
    ed.querySelector('#sv').onclick = async () => {
      const d = normalizeWhatsapp(ed.querySelector('#wa').value);
      if (!d) { e.textContent = 'Nomor WhatsApp belum benar.'; return; }
      try { await save(d); line.textContent = showWhatsapp(d) + ' · hanya terlihat olehmu dan admin.'; ed.remove(); box.querySelector('#ch').hidden = false; }
      catch (x) { e.textContent = friendly(x); }
    };
    box.querySelector('#ch').hidden = true; box.append(ed); ed.querySelector('#wa').focus();
  };
  return box;
}
