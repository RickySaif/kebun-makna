// account.js — start screen: one login for everyone (email / Google), trial without an account.
import { $, esc, root } from './ui.js';
import { avatarCanvas, eyesToggle } from './avatar.js';
import { sb, session, friendly, loadProfile, renderGoogleButton, warmGoogle } from './api.js';
import { normalizeWhatsapp } from './phone.js';

const MODE = 'kebun-makna-mode'; // 'guest' remembered on this device
export const rememberGuest = on => { try { on ? localStorage.setItem(MODE, 'guest') : localStorage.removeItem(MODE); } catch (e) {} };
export const isRememberedGuest = () => { try { return localStorage.getItem(MODE) === 'guest'; } catch (e) { return false; } };

export { avatarCanvas };

const title = sub => $(`<div class="title"><h1>Kebun Makna</h1><p>${esc(sub)}</p></div>`);
const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.innerHTML = on ? '<span class="spinner"></span>' : esc(label); };

/** Start screen: one login for everyone (email or Google), or a trial without an account. Calls handlers.{login, guest, local}. */
export function startScreen(h) { loginScreen(h); }

export function hasLocalSave() {
  for (const k of ['kebun-makna-v3:beta-guest', 'kebun-makna-v3']) { try { const r = JSON.parse(localStorage.getItem(k) || 'null'); if (r && r.name) return r; } catch (e) {} }
  return null;
}

// ---------- login (everyone) ----------
export function loginScreen(h, mode = 'login', msg = '') {
  warmGoogle();
  root.replaceChildren(title(mode === 'signup' ? 'Buat akun' : mode === 'reset' ? 'Lupa kata sandi' : 'Ayo bangun kebunmu!'));
  const f = $(`<div class="frame">
    ${mode === 'signup' ? `<div class="field"><label for="dn"><b>Nama panggilan</b></label><input id="dn" maxlength="40" autocomplete="nickname" placeholder="mis. Amtar"></div>` : ''}
    ${mode === 'signup' ? `<div class="field"><label for="wa"><b>Nomor WhatsApp</b></label><input id="wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="mis. 0812 3456 7890"><span class="small">Wajib selama uji coba (beta). Kami akan menghubungi Anda untuk meminta masukan. Tidak ditampilkan ke pemain lain.</span></div>` : ''}
    <div class="field"><label for="em"><b>Email</b></label><input id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="off"></div>
    ${mode !== 'reset' ? `<div class="field"><label for="pw"><b>Kata sandi</b></label><input id="pw" type="password" minlength="8" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></div>` : ''}
    <button class="btn green block" id="go">${mode === 'signup' ? 'Daftar' : mode === 'reset' ? 'Kirim tautan reset' : 'Masuk'}</button>
    <p class="err" id="err">${esc(msg)}</p>
    <div class="row" style="justify-content:space-between">
      ${mode === 'login' ? `<button class="linkbtn" id="su">Belum punya akun? Daftar</button><button class="linkbtn" id="rs">Lupa kata sandi?</button>` : `<button class="linkbtn" id="li">Sudah punya akun? Masuk</button>`}
    </div></div>`);
  const err = f.querySelector('#err'), go = f.querySelector('#go');
  const q = s => f.querySelector(s);
  go.onclick = async () => {
    const email = q('#em').value.trim(), pw = q('#pw') ? q('#pw').value : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Email belum benar.'; return; }
    if (mode !== 'reset' && pw.length < 8) { err.textContent = 'Kata sandi minimal 8 karakter.'; return; }
    const wa = mode === 'signup' ? normalizeWhatsapp(q('#wa').value) : null;
    if (mode === 'signup' && !wa) { err.textContent = 'Nomor WhatsApp wajib diisi dengan benar. Contoh: 0812 3456 7890.'; return; }
    const label = go.textContent; busy(go, true, label); err.textContent = '';
    try {
      const c = await sb();
      const redirect = location.origin + location.pathname;
      if (mode === 'login') {
        const { error } = await c.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        const p = await loadProfile();
        if (!p) throw new Error('Profil tidak ditemukan.');
        rememberGuest(false); h.login(p);
      } else if (mode === 'signup') {
        const dn = q('#dn').value.trim();
        const { error } = await c.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect, data: { display_name: dn, whatsapp: wa } } });
        if (error) throw error;
        root.replaceChildren(title('Cek email Anda'), $(`<div class="frame"><p>Kami mengirim tautan konfirmasi ke <b>${esc(email)}</b>. Ketuk tautannya, lalu kembali ke sini dan masuk.</p></div>`));
        const b = $(`<button class="btn block">Ke halaman masuk</button>`); b.onclick = () => loginScreen(h); root.lastChild.append(b);
      } else {
        const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        err.className = 'ok'; err.textContent = 'Tautan reset dikirim. Cek email Anda.'; busy(go, false, label);
      }
    } catch (e) { err.className = 'err'; err.textContent = friendly(e); busy(go, false, label); }
  };
  f.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go.click(); });
  if (q('#su')) q('#su').onclick = () => loginScreen(h, 'signup');
  if (q('#rs')) q('#rs').onclick = () => loginScreen(h, 'reset');
  if (q('#li')) q('#li').onclick = () => loginScreen(h, 'login');
  root.append(f);
  if (mode !== 'reset') {
    const g = $(`<div><div class="small" style="text-align:center;margin:10px 0 8px">atau</div><div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div></div>`);
    go.after(g);
    renderGoogleButton(g.querySelector('#gbtn'), p => {
      if (!p) { err.className = 'err'; err.textContent = 'Profil tidak ditemukan.'; return; }
      rememberGuest(false); h.login(p);
    }, e => { err.className = 'err'; err.textContent = friendly(e); })
      .then(ok => { if (!ok) g.remove(); }, () => g.remove()); // no GIS / provider off -> email login only
  }
  if (mode === 'reset') { const b = $(`<div class="frame"><button class="linkbtn" id="bk">◂ Kembali</button></div>`); b.querySelector('#bk').onclick = () => loginScreen(h); root.append(b); return; }
  // trial without an account: nothing is saved
  const t = $(`<div class="frame trial"><button class="btn ghost block" id="guest">Coba dulu tanpa akun</button>
    <p class="trialnote"><b>Uji coba. Hasil tidak disimpan.</b></p>
    ${hasLocalSave() ? `<button class="linkbtn" id="old">Lanjutkan kebun lama di perangkat ini</button>` : ''}</div>`);
  t.querySelector('#guest').onclick = () => { rememberGuest(false); h.guest(); };
  if (t.querySelector('#old')) t.querySelector('#old').onclick = () => h.local();
  const eo = $(`<div class="frame eyesframe"><div class="pv"></div></div>`); eo.querySelector('.pv').append(avatarCanvas(0, .5), avatarCanvas(1, .5)); eo.append(eyesToggle());
  root.append(t, eo);
}
export const parentLogin = loginScreen;

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
