// main.js — boot: route between login screen, signed-in game (cloud save), trial (nothing saved), old device save.
import { farm, onboarding, intro, introActive } from './farm.js';
import { checkSurahLevels } from './progress.js';
import { S, save, setS, fresh, normalize, setPersist } from './state.js';
import { $, esc, root, toast } from './ui.js';
import { hooks } from './hooks.js';
import { sb, session, loadProfile, signOut, updateMyAvatar } from './api.js';
import { eyesOff, eyesChosen, setEyesOff, gfxLite, setGfxLite } from './art.js';
import { eyesToggle } from './avatar.js';
import { startScreen, hasLocalSave, newPasswordScreen, rememberGuest, isRememberedGuest } from './account.js';
import { startCloud, importLegacy, flushNow } from './cloud.js';
import { settingsBox, preloadModel, prepareScreen } from './recite.js';

/* migration for players from earlier versions (verbatim from the classic game; now run after S is chosen) */
function migrate(){ if(!S.hv2){ S.house=S.house===1?2:S.house===2?3:S.house||0; S.hv2=true; }
  if(S.xp===undefined){ let x=0; Object.keys(S.ay).forEach(k=>{x+=20+5*(S.stars[k]||1);}); ['boss1','boss2','boss3','boss4'].forEach(b=>{if(S.trophies[b])x+=80;}); x+=Object.keys(S.basket||{}).length*10; S.xp=x; }
  S.vh=S.vh||{}; S.whole=S.whole||{}; S.wholeStars=S.wholeStars||{}; S.reviews=S.reviews||{}; checkSurahLevels(true); save(); }

const PROFILE_CACHE = 'kebun-makna-profile';
const cacheProfile = p => { try { localStorage.setItem(PROFILE_CACHE, JSON.stringify(p)); } catch (e) {} };
const cachedProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null'); } catch (e) { return null; } };

let mode = null; // 'start' | 'guest' (trial, nothing saved) | 'local' (old save on this device) | 'child' (older child account) | 'player' (signed in) | 'page' | 'social'
const handlers = {
  login: p => { cacheProfile(p); bootPlayer(p); },
  child: p => { cacheProfile(p); bootPlayer(p); },
  guest: () => bootGuest(),
  local: () => { rememberGuest(true); bootLocal(); },
};

function accountBox(box) {
  const p = session.profile;
  if ((mode === 'player' || mode === 'child') && p) {
    const b = $(`<div class="box"><h3>Akun</h3><p class="small" style="margin:0 0 8px">Masuk sebagai <b></b>. Progres tersimpan di akun (cloud) dan di perangkat ini, jadi aman walau ganti HP.</p>
      <div class="row"><button class="btn ghost" id="sw">Keluar</button></div></div>`);
    b.querySelector('b').textContent = p.display_name;
    b.querySelector('#sw').onclick = async () => { flushNow(); await new Promise(r => setTimeout(r, 400)); await signOut(); location.hash = ''; location.reload(); };
    box.prepend(b);
  } else if (mode === 'guest' || mode === 'local') {
    const b = $(`<div class="box" style="background:#FFF6CC"><h3>${mode === 'guest' ? 'Uji coba' : 'Belum masuk'}</h3><p class="small" style="margin:0 0 8px">${mode === 'guest' ? '<b>Uji coba. Hasil tidak disimpan.</b> Masuk atau buat akun supaya progres tersimpan, bisa main di perangkat lain, dan bisa ikut Beranda.' : 'Progres hanya tersimpan di browser ini. Masuk atau buat akun supaya progres aman, bisa main di perangkat lain, dan bisa ikut Beranda. Progres di perangkat ini bisa dipindahkan ke akunmu.'}</p>
      <div class="row"><button class="btn ghost" id="ac">Masuk / buat akun</button></div></div>`);
    b.querySelector('#ac').onclick = () => { rememberGuest(false); location.hash = ''; location.reload(); };
    box.prepend(b);
  }
}
// v3: display choices. "Tanpa mata" is a device choice that also rides along in the save, so a new device picks it up.
function displayBox() {
  const b = $(`<div class="box"><h3>Tampilan</h3><div class="eo"></div>
    <label class="toggle"><input type="checkbox" id="lite" ${gfxLite() ? 'checked' : ''}> Grafik hemat (untuk HP yang terasa berat)</label>
    <p class="small" style="margin:6px 0 0">Tokohmu bisa diubah lewat tombol "Ganti nama/tokoh" di bawah.</p></div>`);
  b.querySelector('.eo').append(eyesToggle(false));
  b.querySelector('#lite').onchange = e => setGfxLite(e.target.checked);
  return b;
}
const inGame = () => mode === 'guest' || mode === 'local' || mode === 'child' || mode === 'player';
window.addEventListener('km-eyes', () => { if (inGame() && S.name && S.noEyes !== eyesOff()) { S.noEyes = eyesOff(); save(); } });
window.addEventListener('km-avatar', () => { if (eyesChosen() && S.noEyes !== eyesOff()) { S.noEyes = eyesOff(); save(); } if (mode === 'child' || mode === 'player') updateMyAvatar(S.avatar | 0).catch(() => {}); });
hooks.atur = box => { accountBox(box); box.prepend(settingsBox()); box.prepend(displayBox()); };

async function bootGame() {
  if (!eyesChosen() && typeof S.noEyes === 'boolean') setEyesOff(S.noEyes, false); // adopt the account's choice on a new device
  await prepareScreen(); // the recitation recognizer is downloaded and built before the game starts
  migrate();
  import('./akhlak.js').then(m => m.installAkhlak()).catch(() => {}); // next chapter, only after boss4 + 10 surahs
  if (!S.name) onboarding(); else farm();
}

// Trial: a fresh game that is never written to the device or the cloud.
function bootGuest() {
  mode = 'guest';
  setS(fresh()); normalize(); setPersist(false);
  trialRibbon();
  bootGame();
  setTimeout(() => toast('Uji coba. Hasil tidak disimpan.'), 1200);
}
// The old save on this device (players from before accounts): kept and saved as before, until they sign in and import it.
function bootLocal() {
  mode = 'local';
  bootGame();
  setTimeout(() => toast('Belum masuk: progres hanya di perangkat ini.'), 1200);
}
function trialRibbon() {
  const r = $(`<a class="trial-ribbon" href="#">Uji coba. Hasil tidak disimpan. <u>Masuk</u></a>`);
  r.onclick = e => { e.preventDefault(); location.hash = ''; location.reload(); };
  document.body.append(r);
}

// supporter badge next to the player's name in the game HUD (the HUD is re-rendered by the classic code)
function hudBadge(p) {
  if (!p || !p.supporter_tier) return;
  import('./badges.js').then(async b => {
    await b.loadTiers();
    const put = () => { const g = document.querySelector('.hud .grow'); if (g && !g.querySelector('.badge')) g.insertAdjacentHTML('beforeend', b.badgeFor(p)); };
    new MutationObserver(put).observe(root, { childList: true }); put();
  });
}

async function bootPlayer(p) {
  hudBadge(p);
  mode = p.role === 'child' ? 'child' : 'player';
  addTabs('kebun');
  import('./online.js').then(o => o.joinOnline()).catch(() => {});
  root.replaceChildren($(`<div class="title"><h1>Kebun Makna</h1><p>Memuat kebunmu…</p></div>`));
  // A newer save from another device redraws the farm. If Kakek Umar's welcome is still open, redraw it too:
  // a plain farm() would drop its "Siap!" button and leave introActive stuck, so no villager ever arrives.
  const r = await startCloud(p.id, { onReplace: () => { if (!document.getElementById('farm')) return; if (introActive) intro(); else farm(); } });
  if (r.legacy) {
    const ay = Object.keys(r.legacy.ay || {}).length, solved = Object.keys(r.legacy.solved || {}).length;
    const f = $(`<div class="frame"><h2 style="margin:0 0 6px">Pakai progres lama di perangkat ini?</h2>
      <p>Di perangkat ini ada kebun milik <b></b>: ${solved} surat selesai, ${ay} ayat. Mau dipindahkan ke akun <b class="nm"></b>?</p>
      <div class="row"><button class="btn green" id="y">Ya, pakai</button><button class="btn ghost" id="n">Mulai baru</button></div></div>`);
    f.querySelector('b').textContent = r.legacy.name || 'pemain';
    f.querySelector('.nm').textContent = p.display_name;
    root.append(f);
    await new Promise(res => {
      f.querySelector('#y').onclick = () => { importLegacy(r.legacy); res(); };
      f.querySelector('#n').onclick = () => res();
    });
  }
  // v4: the look chosen on the profile is the game's look
  if (p.role !== 'child' && S.name && typeof p.avatar === 'number' && (S.avatar | 0) !== p.avatar) { S.avatar = p.avatar; save(); }
  // friends' waterings and salam since the last visit (Phase 4)
  try { const v = await import('./visit.js'); const { note } = await import('./progress.js'); await v.applyVisits(note); } catch (e) {}
  if (!S.name) {
    S.name = String(p.display_name || '').slice(0, 16); S.avatar = p.avatar | 0;
    if (!eyesChosen() && typeof S.noEyes === 'boolean') setEyesOff(S.noEyes, false);
    await prepareScreen();
    migrate(); save(); intro();
  } else bootGame();
}

async function route() {
  const h = location.hash;
  if (h.startsWith('#/dukung')) { mode = 'page'; const m = await import('./support.js'); return m.supportPage(); }
  if (h.startsWith('#/admin')) { mode = 'page'; await loadProfile().catch(() => null); const m = await import('./admin.js'); return m.adminPage(); }
  let p = null;
  try { p = await loadProfile(); if (p) cacheProfile(p); }
  catch (e) {
    // offline: keep a signed-in child playing from the local cache
    try { const c = await sb(); const { data: { session: s } } = await c.auth.getSession(); if (s) { session.user = s.user; p = cachedProfile(); if (p && p.id !== s.user.id) p = null; session.profile = p; } } catch (e2) {}
  }
  // The recitation model (~93 MB, once) starts downloading right after a successful login (Ricky), parents included,
  // so it is ready by the first ayah. Download only: it is streamed into storage, the memory-heavy build waits for the
  // start-up screen. Guests get it on that screen.
  if (p) preloadModel();
  if (h.startsWith('#/tamu')) return bootGuest();
  const soc = h.match(/^#\/(beranda|profil|grup|kunjungi|lomba)(?:\/([^/]+))?/);
  if (soc && p) return socialRoute(soc[1], soc[2]);
  if (soc && !p) { mode = 'start'; return guestNudge(); }
  if (p) return bootPlayer(p);
  if (isRememberedGuest() && hasLocalSave()) return bootLocal();
  mode = 'start';
  startScreen(handlers);
}

async function socialRoute(kind, arg) {
  mode = 'social';
  import('./online.js').then(o => o.joinOnline()).catch(() => {});
  const m = await import('./social.js');
  if (kind === 'beranda') return m.feedPage(arg || 'ikuti');
  if (kind === 'profil') return m.profilePage(arg);
  if (kind === 'grup') { const g = await import('./groups.js'); return g.groupsPage(arg); }
  if (kind === 'kunjungi') { const v = await import('./visit.js'); return v.visitPage(arg); }
  if (kind === 'lomba') { const r = await import('./pvp.js'); return r.racePage(arg); }
}
function guestNudge() {
  root.replaceChildren($(`<div class="dash"><h2>Beranda</h2><div class="frame"><p>Beranda, kunjungan kebun dan grup hanya untuk pemain yang sudah masuk. Buat akun atau masuk dulu, ya.</p><a class="btn green" href="#">Ke halaman awal</a></div></div>`));
}
function addTabs(active) {
  import('./social.js').then(m => { document.body.append(m.tabBar(active)); document.body.classList.add('has-tabs'); });
}

// Switching between social pages happens in place; any switch into or out of the game or dashboard reloads
// the page, the simplest reliable way to reset the game loop and module state.
const SOCIAL = /^#\/(beranda|profil|grup|kunjungi|lomba)/;
window.addEventListener('hashchange', () => {
  if (!mode || mode === 'start') return;
  if (mode === 'social' && SOCIAL.test(location.hash)) { route(); return; }
  if (mode === 'child' || mode === 'player') { flushNow(); setTimeout(() => location.reload(), 300); return; }
  location.reload();
});

(async () => {
  try {
    const c = await sb();
    c.auth.onAuthStateChange(ev => {
      if (ev === 'PASSWORD_RECOVERY') newPasswordScreen(() => { toast('Kata sandi disimpan'); location.hash = ''; location.reload(); });
    });
  } catch (e) { /* offline: Supabase library could not load */ }
  try { await route(); }
  catch (e) {
    console.error(e);
    if (isRememberedGuest() && hasLocalSave()) bootLocal(); else if (!navigator.onLine) bootGuest();
    else { root.replaceChildren($(`<div class="frame"><p class="err">${esc(e.message || e)}</p></div>`)); const b = $(`<button class="btn">Main tanpa akun</button>`); b.onclick = () => bootGuest(); root.lastChild.append(b); }
  }
})();
