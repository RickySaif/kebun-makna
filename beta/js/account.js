// account.js — start screen: parent email/Google login, child family name → avatar → PIN, guest mode.
import { $, esc, root } from './ui.js';
import { AVATARS, drawKid } from './render.js';
import { sb, session, friendly, childList, childSignIn, loadProfile, normFamily, isFamilyName, renderGoogleButton } from './api.js';

const LAST_CODE = 'kebun-makna-last-family';
const MODE = 'kebun-makna-mode'; // 'guest' remembered on this device
export const getLastCode = () => { try { return localStorage.getItem(LAST_CODE) || ''; } catch (e) { return ''; } };
const setLastCode = c => { try { localStorage.setItem(LAST_CODE, c); } catch (e) {} };
export const rememberGuest = on => { try { on ? localStorage.setItem(MODE, 'guest') : localStorage.removeItem(MODE); } catch (e) {} };
export const isRememberedGuest = () => { try { return localStorage.getItem(MODE) === 'guest'; } catch (e) { return false; } };

export function avatarCanvas(av, scale = 1) {
  const cv = document.createElement('canvas'); cv.width = 12; cv.height = 16;
  drawKid(cv.getContext('2d'), 0, 0, (av | 0) % AVATARS.length, 0, null);
  if (scale !== 1) { cv.style.width = 12 * 6 * scale + 'px'; cv.style.height = 16 * 6 * scale + 'px'; }
  return cv;
}

const title = sub => $(`<div class="title"><h1>Kebun Makna</h1><p>${esc(sub)}</p></div>`);
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.innerHTML = on ? '<span class="spinner"></span>' : esc(label); };

/** Show the start screen. Calls handlers.{parent, child, guest} when done. */
export function startScreen(h) {
  root.replaceChildren(title('Ayo bangun kebunmu!'));
  const f = $(`<div class="frame"><p style="margin:0 0 10px">Siapa yang main hari ini?</p>
    <div class="start-choices">
      <button class="btn green block" id="kid">🧒 Saya Anak</button>
      <button class="btn blue block" id="ortu">👨‍👩‍👧 Saya Orang Tua</button>
      <button class="btn ghost block" id="guest">Main tanpa akun</button>
    </div></div>`);
  f.querySelector('#kid').onclick = () => childStart(h);
  f.querySelector('#ortu').onclick = () => parentLogin(h);
  f.querySelector('#guest').onclick = () => { rememberGuest(true); h.guest(); };
  root.append(f, $(`<p class="start-note">Akun dibuat oleh orang tua. Anak masuk dengan kode keluarga dan PIN, tanpa email.</p>`));
}

// ---------- child ----------
function childStart(h, msg) {
  const last = getLastCode();
  if (last && !msg) return childPick(h, last);
  root.replaceChildren(title('Masuk sebagai anak'));
  const f = $(`<div class="frame"><div class="field"><label for="fc"><b>Nama keluarga</b></label>
    <input id="fc" inputmode="text" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="contoh: saif" maxlength="20" value="${esc(last && /^[a-z]/.test(last) ? last : '')}"></div>
    <p class="small" style="margin:0 0 10px">Tanya Ayah atau Ibu nama keluargamu. Nama ini ada di halaman orang tua.</p>
    <button class="btn green block" id="go">Lanjut ▸</button><p class="err" id="err">${esc(msg || '')}</p>
    <button class="linkbtn" id="back">◂ Kembali</button></div>`);
  const go = f.querySelector('#go');
  go.onclick = () => {
    const c = normFamily(f.querySelector('#fc').value);
    if (!isFamilyName(c)) { f.querySelector('#err').textContent = 'Nama keluarga 3–20 huruf kecil/angka, contoh: saif'; return; }
    childPick(h, c);
  };
  const inp = f.querySelector('#fc');
  inp.oninput = () => { const v = inp.value.toLowerCase().replace(/\s/g, ''); if (v !== inp.value) inp.value = v; };
  inp.onkeydown = e => { if (e.key === 'Enter') go.click(); };
  f.querySelector('#back').onclick = () => startScreen(h);
  root.append(f);
}

async function childPick(h, code) {
  root.replaceChildren(title('Siapa kamu?'), $(`<div class="frame"><span class="spinner"></span> Memuat…</div>`));
  let kids;
  try { ({ children: kids } = await childList(code)); }
  catch (e) { return childStart(h, e.status === 404 ? 'Nama keluarga tidak ditemukan. Cek lagi ejaannya, ya.' : friendly(e)); }
  setLastCode(code);
  const f = $(`<div class="frame"><p style="margin:0">Ketuk gambarmu.</p><div class="kidgrid"></div>
    <p class="err" id="err"></p><button class="linkbtn" id="other">Ganti nama keluarga</button> · <button class="linkbtn" id="back">◂ Kembali</button></div>`);
  const grid = f.querySelector('.kidgrid');
  if (!kids.length) f.querySelector('#err').textContent = 'Belum ada anak di keluarga ini. Minta Ayah/Ibu menambahkanmu di halaman orang tua.';
  kids.forEach(k => {
    const b = $(`<button class="av"><span></span></button>`);
    b.prepend(avatarCanvas(k.avatar)); b.querySelector('span').textContent = k.display_name;
    b.onclick = () => pinPad(h, code, k);
    grid.append(b);
  });
  f.querySelector('#other').onclick = () => { setLastCode(''); childStart(h, ' '); };
  f.querySelector('#back').onclick = () => startScreen(h);
  root.replaceChildren(title('Siapa kamu?'), f);
}

function pinPad(h, code, kid) {
  let pin = '';
  const f = $(`<div class="frame" style="text-align:center"><div class="head" style="display:flex;justify-content:center;align-items:center;gap:10px"></div>
    <p style="margin:6px 0 0">Masukkan PIN-mu</p><div class="pinshow"></div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}<button class="fn" data-f="del" aria-label="Hapus">⌫</button><button data-n="0">0</button><button class="fn" data-f="ok">Masuk</button></div>
    <p class="err" id="err"></p><button class="linkbtn" id="back">◂ Bukan aku</button></div>`);
  const head = f.querySelector('.head'); head.append(avatarCanvas(kid.avatar, 0.5), $(`<b style="font-size:22px">${esc(kid.display_name)}</b>`));
  const show = f.querySelector('.pinshow'), err = f.querySelector('#err');
  const draw = () => { show.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
  let sending = false;
  const submit = async () => {
    if (sending) return;
    if (pin.length < 4) { err.textContent = 'PIN 4 sampai 6 angka.'; return; }
    sending = true; err.innerHTML = '<span class="spinner"></span>';
    try { await childSignIn(code, kid.id, pin); rememberGuest(false); h.child(session.profile); }
    catch (e) {
      sending = false; pin = ''; draw();
      err.textContent = e.status === 429 ? 'Terlalu banyak salah. Tunggu 10 menit, atau minta Ayah/Ibu ganti PIN.'
        : e.status === 401 ? 'PIN salah. Coba lagi, ya.' : friendly(e);
    }
  };
  f.querySelectorAll('.pinpad button').forEach(b => b.onclick = () => {
    if (b.dataset.n !== undefined) { if (pin.length < 6) pin += b.dataset.n; err.textContent = ''; draw(); }
    else if (b.dataset.f === 'del') { pin = pin.slice(0, -1); draw(); }
    else submit();
  });
  f.querySelector('#back').onclick = () => childPick(h, code);
  draw();
  root.replaceChildren(title('Halo!'), f);
}

// ---------- parent ----------
export function parentLogin(h, mode = 'login', msg = '') {
  root.replaceChildren(title(mode === 'signup' ? 'Daftar orang tua' : mode === 'reset' ? 'Lupa kata sandi' : 'Masuk orang tua'));
  const f = $(`<div class="frame">
    ${mode === 'signup' ? `<div class="field"><label for="dn"><b>Nama Anda</b></label><input id="dn" maxlength="40" autocomplete="name" placeholder="mis. Ayah Amtar"></div>` : ''}
    <div class="field"><label for="em"><b>Email</b></label><input id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="off"></div>
    ${mode !== 'reset' ? `<div class="field"><label for="pw"><b>Kata sandi</b></label><input id="pw" type="password" minlength="8" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></div>` : ''}
    <button class="btn green block" id="go">${mode === 'signup' ? 'Daftar' : mode === 'reset' ? 'Kirim tautan reset' : 'Masuk'}</button>
    <p class="err" id="err">${esc(msg)}</p>
    <div class="row" style="justify-content:space-between">
      ${mode === 'login' ? `<button class="linkbtn" id="su">Belum punya akun? Daftar</button><button class="linkbtn" id="rs">Lupa kata sandi?</button>` : `<button class="linkbtn" id="li">Sudah punya akun? Masuk</button>`}
    </div><button class="linkbtn" id="back">◂ Kembali</button></div>`);
  const err = f.querySelector('#err'), go = f.querySelector('#go');
  const q = s => f.querySelector(s);
  go.onclick = async () => {
    const email = q('#em').value.trim(), pw = q('#pw') ? q('#pw').value : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Email belum benar.'; return; }
    if (mode !== 'reset' && pw.length < 8) { err.textContent = 'Kata sandi minimal 8 karakter.'; return; }
    const label = go.textContent; busy(go, true, label); err.textContent = '';
    try {
      const c = await sb();
      const redirect = location.origin + location.pathname;
      if (mode === 'login') {
        const { error } = await c.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        const p = await loadProfile();
        if (!p) throw new Error('Profil tidak ditemukan.');
        if (p.role !== 'parent') { await c.auth.signOut(); throw new Error('Akun ini bukan akun orang tua.'); }
        rememberGuest(false); h.parent(p);
      } else if (mode === 'signup') {
        const dn = q('#dn').value.trim();
        const { error } = await c.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect, data: { display_name: dn } } });
        if (error) throw error;
        root.replaceChildren(title('Cek email Anda'), $(`<div class="frame"><p>Kami mengirim tautan konfirmasi ke <b>${esc(email)}</b>. Ketuk tautannya, lalu kembali ke sini dan masuk.</p></div>`));
        const b = $(`<button class="btn block">Ke halaman masuk</button>`); b.onclick = () => parentLogin(h); root.lastChild.append(b);
      } else {
        const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        err.className = 'ok'; err.textContent = 'Tautan reset dikirim. Cek email Anda.'; busy(go, false, label);
      }
    } catch (e) { err.className = 'err'; err.textContent = friendly(e); busy(go, false, label); }
  };
  f.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go.click(); });
  if (q('#su')) q('#su').onclick = () => parentLogin(h, 'signup');
  if (q('#rs')) q('#rs').onclick = () => parentLogin(h, 'reset');
  if (q('#li')) q('#li').onclick = () => parentLogin(h, 'login');
  q('#back').onclick = () => startScreen(h);
  root.append(f);
  if (mode !== 'reset') {
    const g = $(`<div><div class="small" style="text-align:center;margin:10px 0 8px">atau</div><div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div></div>`);
    go.after(g);
    renderGoogleButton(g.querySelector('#gbtn'), p => {
      if (!p) { err.className = 'err'; err.textContent = 'Profil tidak ditemukan.'; return; }
      if (p.role !== 'parent') { err.className = 'err'; err.textContent = 'Akun ini bukan akun orang tua.'; return; }
      rememberGuest(false); h.parent(p);
    }, e => { err.className = 'err'; err.textContent = friendly(e); })
      .then(ok => { if (!ok) g.remove(); }, () => g.remove()); // no GIS / provider off -> email login only
  }
}

/** After a password-recovery link: let the parent choose a new password. */
export function newPasswordScreen(done) {
  root.replaceChildren(title('Kata sandi baru'));
  const f = $(`<div class="frame"><div class="field"><label for="pw"><b>Kata sandi baru</b></label><input id="pw" type="password" minlength="8" autocomplete="new-password"></div>
    <button class="btn green block" id="go">Simpan</button><p class="err" id="err"></p></div>`);
  f.querySelector('#go').onclick = async () => {
    const pw = f.querySelector('#pw').value; const err = f.querySelector('#err');
    if (pw.length < 8) { err.textContent = 'Minimal 8 karakter.'; return; }
    try { const c = await sb(); const { error } = await c.auth.updateUser({ password: pw }); if (error) throw error; done(); }
    catch (e) { err.textContent = friendly(e); }
  };
  root.append(f);
}
