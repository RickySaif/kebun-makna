// main.js — boot: route between start screen, child game (cloud save), guest game, parent dashboard.
import { farm, onboarding, intro } from './farm.js';
import { checkSurahLevels } from './progress.js';
import { S, save } from './state.js';
import { $, esc, root, toast } from './ui.js';
import { hooks } from './hooks.js';
import { sb, session, loadProfile, signOut } from './api.js';
import { startScreen, parentLogin, newPasswordScreen, rememberGuest, isRememberedGuest } from './account.js';
import { startCloud, importLegacy, flushNow } from './cloud.js';
import { settingsBox } from './recite.js';

/* migration for players from earlier versions (verbatim from the classic game; now run after S is chosen) */
function migrate(){ if(!S.hv2){ S.house=S.house===1?2:S.house===2?3:S.house||0; S.hv2=true; }
  if(S.xp===undefined){ let x=0; Object.keys(S.ay).forEach(k=>{x+=20+5*(S.stars[k]||1);}); ['boss1','boss2','boss3','boss4'].forEach(b=>{if(S.trophies[b])x+=80;}); x+=Object.keys(S.basket||{}).length*10; S.xp=x; }
  S.vh=S.vh||{}; S.whole=S.whole||{}; S.wholeStars=S.wholeStars||{}; S.reviews=S.reviews||{}; checkSurahLevels(true); save(); }

const PROFILE_CACHE = 'kebun-makna-profile';
const cacheProfile = p => { try { localStorage.setItem(PROFILE_CACHE, JSON.stringify(p)); } catch (e) {} };
const cachedProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null'); } catch (e) { return null; } };

let mode = null; // 'start' | 'guest' | 'child' | 'player' (parent playing) | 'parent' | 'page'
const handlers = {
  parent: () => { location.hash = '#/ortu'; route(); },
  child: p => { cacheProfile(p); bootPlayer(p); },
  guest: () => bootGuest(),
};

function accountBox(box) {
  const p = session.profile;
  if (mode === 'player' && p) {
    const b = $(`<div class="box"><h3>Akun</h3><p class="small" style="margin:0 0 8px">Anda bermain sebagai <b></b> (orang tua). Progres Anda terpisah dari progres anak-anak.</p>
      <div class="row"><button class="btn ghost" id="bk">Kembali ke Halaman Orang Tua</button></div></div>`);
    b.querySelector('b').textContent = p.display_name;
    b.querySelector('#bk').onclick = async () => { flushNow(); await new Promise(r => setTimeout(r, 400)); location.hash = '#/ortu'; location.reload(); };
    box.prepend(b);
  } else if (mode === 'child' && p) {
    const b = $(`<div class="box"><h3>Akun</h3><p class="small" style="margin:0 0 8px">Masuk sebagai <b></b>. Progres tersimpan di akun (cloud) dan di perangkat ini, jadi aman walau ganti HP.</p>
      <div class="row"><button class="btn ghost" id="sw">Ganti pemain / keluar</button></div></div>`);
    b.querySelector('b').textContent = p.display_name;
    b.querySelector('#sw').onclick = async () => { flushNow(); await new Promise(r => setTimeout(r, 400)); await signOut(); location.hash = ''; location.reload(); };
    box.prepend(b);
  } else if (mode === 'guest') {
    const b = $(`<div class="box" style="background:#FFF6CC"><h3>Mode tamu</h3><p class="small" style="margin:0 0 8px">Progres hanya tersimpan di browser ini. Minta Ayah/Ibu membuat akun keluarga supaya progres aman, bisa main di perangkat lain, dan bisa ikut Beranda.</p>
      <div class="row"><button class="btn ghost" id="ac">Masuk / buat akun</button></div></div>`);
    b.querySelector('#ac').onclick = () => { rememberGuest(false); location.hash = ''; location.reload(); };
    box.prepend(b);
  }
}
hooks.atur = box => { accountBox(box); box.prepend(settingsBox()); };

function bootGame() {
  migrate();
  if (!S.name) onboarding(); else farm();
}

function bootGuest() {
  mode = 'guest';
  bootGame();
  setTimeout(() => toast('Mode tamu: progres hanya di perangkat ini.'), 1200);
}

async function bootPlayer(p) {
  mode = p.role === 'parent' ? 'player' : 'child';
  if (p.role === 'child') addTabs('kebun');
  root.replaceChildren($(`<div class="title"><h1>Kebun Makna</h1><p>Memuat kebunmu…</p></div>`));
  const r = await startCloud(p.id, { onReplace: () => { if (document.getElementById('farm')) farm(); } });
  if (r.legacy && p.role === 'child') {
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
  if (!S.name) {
    S.name = String(p.display_name || '').slice(0, 16); S.avatar = (p.avatar | 0) % 2;
    migrate(); save(); intro();
  } else bootGame();
}

async function showParent() {
  mode = 'parent';
  addTabs('ortu');
  const { parentDashboard } = await import('./ortu.js');
  parentDashboard({
    onLogout: () => { location.hash = ''; location.reload(); },
    onPlayGuest: () => { location.hash = '#/tamu'; location.reload(); },
    onPlaySelf: () => { location.hash = '#/main'; location.reload(); },
  });
}

async function route() {
  const h = location.hash;
  if (h.startsWith('#/dukung')) { mode = 'page'; const m = await import('./support.js'); return m.supportPage(); }
  let p = null;
  try { p = await loadProfile(); if (p) cacheProfile(p); }
  catch (e) {
    // offline: keep a signed-in child playing from the local cache
    try { const c = await sb(); const { data: { session: s } } = await c.auth.getSession(); if (s) { session.user = s.user; p = cachedProfile(); if (p && p.id !== s.user.id) p = null; session.profile = p; } } catch (e2) {}
  }
  if (h.startsWith('#/tamu')) return bootGuest();
  const soc = h.match(/^#\/(beranda|profil|grup|kunjungi|lomba)(?:\/([^/]+))?/);
  if (soc && p) return socialRoute(soc[1], soc[2]);
  if (soc && !p) { mode = 'start'; return guestNudge(); }
  if (p && p.role === 'parent') return h.startsWith('#/main') ? bootPlayer(p) : showParent();
  if (p && p.role === 'child') return bootPlayer(p);
  if (h.startsWith('#/ortu')) { mode = 'start'; return parentLogin(handlers); }
  if (isRememberedGuest()) return bootGuest();
  mode = 'start';
  startScreen(handlers);
}

async function socialRoute(kind, arg) {
  mode = 'social';
  const m = await import('./social.js');
  if (kind === 'beranda') return m.feedPage(arg || 'ikuti');
  if (kind === 'profil') return m.profilePage(arg);
  if (kind === 'grup') { const g = await import('./groups.js'); return g.groupsPage(arg); }
  if (kind === 'kunjungi') { const v = await import('./visit.js'); return v.visitPage(arg); }
  if (kind === 'lomba') { const r = await import('./pvp.js'); return r.racePage(arg); }
}
function guestNudge() {
  root.replaceChildren($(`<div class="dash"><h2>Beranda</h2><div class="frame"><p>Beranda, kunjungan kebun dan grup hanya untuk pemain yang punya akun keluarga. Minta Ayah/Ibu membuat akun, lalu masuk dengan kode keluarga dan PIN.</p><a class="btn green" href="#">Ke halaman awal</a></div></div>`));
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
      if (ev === 'PASSWORD_RECOVERY') newPasswordScreen(() => { toast('Kata sandi disimpan'); location.hash = '#/ortu'; location.reload(); });
    });
  } catch (e) { /* offline: Supabase library could not load */ }
  try { await route(); }
  catch (e) {
    console.error(e);
    if (isRememberedGuest() || !navigator.onLine) bootGuest();
    else { root.replaceChildren($(`<div class="frame"><p class="err">${esc(e.message || e)}</p></div>`)); const b = $(`<button class="btn">Main tanpa akun</button>`); b.onclick = () => bootGuest(); root.lastChild.append(b); }
  }
})();
