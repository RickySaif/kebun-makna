// ortu.js — parent dashboard (#/ortu): family name, children, PINs, progress, activity, social oversight.
import { $, esc, root, toast } from './ui.js';
import { DATA, BY, HOUSE_TIERS } from './data.js';
import { levelOf } from './progress.js';
import { sb, session, friendly, normFamily, familyCreate, familySetPin, familyDelete, signOut } from './api.js';
import { avatarCanvas } from './account.js';
import { avatarBuilder } from './avatar.js';
import { badgeFor, loadTiers, fmtDate } from './badges.js';

const TOTAL_AYAT = DATA.reduce((s, x) => s + x.ayat.length, 0);
const KIND = {
  login: '🔑 Masuk', ayah_done: '📖 Ayat selesai', surah_done: '🌟 Surat selesai', boss_done: '🏆 Game boss selesai',
  review_done: '💧 Murajaah', recitation_pass: '🎙️ Bacaan lulus', recitation_fail: '🎙️ Bacaan belum lulus', recitation_try: '🎙️ Latihan baca',
  parent_override: '🔓 Dibantu orang tua', post: '📝 Menulis kiriman', comment: '💬 Komentar', follow: '➕ Mengikuti',
  visit: '🏡 Berkunjung', import_device_progress: '📲 Pakai progres lama', water: '🌧️ Menyiram kebun teman', salam: '👋 Kirim salam',
  model_download: '⬇️ Unduh pengenal bacaan',
};
const fmtTime = t => { const d = new Date(t); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); };
function describe(a) {
  const d = a.detail || {};
  if (a.kind === 'ayah_done' && d.ayah) { const s = BY[+String(d.ayah).slice(0, 3)]; return `${s ? s.name : ''} ayat ${+String(d.ayah).slice(3)}${d.stars ? ' · ' + '★'.repeat(d.stars) : ''}`; }
  if (a.kind === 'surah_done') return d.name || (BY[d.surah] || {}).name || '';
  if (a.kind === 'review_done') return (BY[d.surah] || {}).name || '';
  if (a.kind.startsWith('recitation')) { const s = d.ayah ? BY[+String(d.ayah).slice(0, 3)] : null; return `${s ? s.name + ' ' + (+String(d.ayah).slice(3)) : ''}${d.part ? ' (' + d.part + (d.part === 'ayat' ? '' : ' ' + d.words) + ')' : ''} · ${d.score === null ? 'belum bisa dinilai' : (d.part ? 'ketepatan ' : 'skor ') + Math.round((d.score || 0) * 100) + '%'} · ${((d.ms || 0) / 1000).toFixed(1)} dtk${d.wrong && d.wrong.length ? ' · salah: ' + d.wrong.join(', ') : ''}`; }
  if (a.kind === 'boss_done') return `${d.boss || ''}${d.mode === 'pvp' ? ' (lomba teman)' : ''}`;
  return '';
}

let ctx = { family: null, kids: [], saves: {}, acts: [], posts: [], comments: [], follows: [], names: {} };

export async function parentDashboard({ onLogout, onPlayGuest, onPlaySelf }) {
  root.replaceChildren($(`<div class="dash"><h2>Halaman Orang Tua</h2><div class="frame"><span class="spinner"></span> Memuat…</div></div>`));
  try { await loadAll(); }
  catch (e) { root.replaceChildren($(`<div class="dash"><h2>Halaman Orang Tua</h2><div class="frame"><p class="err">${esc(friendly(e))}</p></div></div>`)); const b = $(`<button class="btn">Coba lagi</button>`); b.onclick = () => parentDashboard({ onLogout, onPlayGuest, onPlaySelf }); root.querySelector('.frame').append(b); return; }
  render({ onLogout, onPlayGuest, onPlaySelf });
}

async function loadAll() {
  const c = await sb();
  await loadTiers();
  const uid = session.user.id;
  const [{ data: fam, error: fe }, { data: links, error: le }] = await Promise.all([
    c.rpc('my_family_name').then(r => ({ data: r.data ? { name: r.data } : null, error: r.error })),
    c.from('family_members').select('child_id').eq('parent_id', uid),
  ]);
  if (fe) throw fe; if (le) throw le;
  ctx.family = fam;
  const ids = (links || []).map(l => l.child_id);
  ctx.kids = []; ctx.saves = {}; ctx.acts = []; ctx.posts = []; ctx.comments = []; ctx.follows = [];
  if (!ids.length) return;
  const [kids, saves, acts, posts, comments, follows] = await Promise.all([
    c.from('profiles').select('id, display_name, avatar, supporter_tier, supporter_until, supporter_mult, created_at').in('id', ids).order('created_at'),
    c.from('game_saves').select('profile_id, state, version, updated_at').in('profile_id', ids),
    c.from('activity_log').select('profile_id, kind, detail, created_at').in('profile_id', ids).order('created_at', { ascending: false }).limit(300),
    c.from('posts').select('id, author_id, source_id, body, hidden, created_at').in('author_id', ids).order('created_at', { ascending: false }).limit(100),
    c.from('comments').select('id, author_id, post_id, body, hidden, created_at').in('author_id', ids).order('created_at', { ascending: false }).limit(100),
    c.from('follows').select('follower_id, followee_id, created_at').in('follower_id', ids),
  ]);
  for (const r of [kids, saves, acts, posts, comments, follows]) if (r.error) throw r.error;
  ctx.kids = kids.data; ctx.acts = acts.data; ctx.posts = posts.data; ctx.comments = comments.data; ctx.follows = follows.data;
  saves.data.forEach(s => ctx.saves[s.profile_id] = s);
  const other = [...new Set(ctx.follows.map(f => f.followee_id))];
  ctx.names = {};
  if (other.length) {
    const { data } = await c.from('profiles').select('id, display_name, supporter_tier, supporter_until, supporter_mult').in('id', other);
    (data || []).forEach(p => ctx.names[p.id] = p);
  }
}

function render(h) {
  const p = session.profile;
  const wrap = $(`<div class="dash"></div>`);
  const head = $(`<div class="frame" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <b style="font-size:20px">Halo, ${esc(p.display_name)}${badgeFor(p)}</b>
      <button class="btn ghost mini" id="out">Keluar</button></div>
    <p style="margin:10px 0 4px">Nama keluarga (anak mengetiknya sekali untuk masuk di perangkat mana pun):</p>
    <div class="row" style="align-items:center"><span class="code" id="code"></span><button class="btn mini" id="copy">Salin</button><button class="btn ghost mini" id="chg">Ganti</button></div>
    <div id="chgbox"></div>
    <p class="small" style="margin:8px 0 0">Nama ini juga dipakai saat mendukung Kebun Makna (tulis <b>#nama</b> di pesan Trakteer) supaya lencana pendukung muncul di akun keluarga. Anak tetap perlu PIN untuk masuk.</p>
    <button class="btn green block" id="play" style="margin-top:12px">🌱 Main sebagai saya</button>
    <p class="small" style="margin:6px 0 0">Orang tua juga bisa main game lengkapnya. Progres Anda terpisah dari progres anak.</p>
  </div>`);
  head.querySelector('#play').onclick = h.onPlaySelf;
  head.querySelector('#out').onclick = async () => { await signOut(); h.onLogout(); };
  const fname = (ctx.family && ctx.family.name) || '';
  head.querySelector('#code').textContent = fname || '—';
  head.querySelector('#copy').onclick = () => copy(fname);
  head.querySelector('#chg').onclick = () => familyNameEditor(head.querySelector('#chgbox'), fname, h);
  wrap.append(head);

  wrap.append($(`<h2>Anak-anak</h2>`));
  if (!ctx.kids.length) wrap.append($(`<div class="banner">Belum ada akun anak. Tambahkan di bawah, lalu anak masuk dengan kode keluarga dan PIN.</div>`));
  ctx.kids.forEach(k => wrap.append(kidCard(k, h)));
  wrap.append(addKidForm(h));
  wrap.append(spouseBox(h));
  wrap.append(parentPinBox());
  wrap.append(supportBox());
  import('./admin.js').then(async m => { if (await m.isAdmin()) wrap.append($(`<div class="frame" style="margin-bottom:12px"><b>🛠️ Admin</b><p class="small" style="margin:6px 0">Cocokkan dukungan yang belum terhubung ke keluarga.</p><a class="btn mini" href="#/admin">Buka halaman admin</a></div>`)); });
  const g = $(`<p class="start-note"><button class="linkbtn" style="color:#fff" id="guest">Coba main di perangkat ini sebagai tamu</button></p>`);
  g.querySelector('#guest').onclick = h.onPlayGuest; wrap.append(g);
  root.replaceChildren(wrap);
}

function copy(text) {
  const done = () => toast('Disalin: ' + text);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => prompt('Salin kode ini:', text));
  else prompt('Salin kode ini:', text);
}

function kidCard(k, h) {
  const sv = ctx.saves[k.id], st = (sv && sv.state) || {};
  const ayat = Object.keys(st.ay || {}).filter(x => st.ay[x]).length;
  const surahs = Object.keys(st.solved || {}).filter(x => st.solved[x]).map(n => (BY[n] || {}).name).filter(Boolean);
  const house = (HOUSE_TIERS[st.house || 0] || {}).name || HOUSE_TIERS[0].name;
  const acts = ctx.acts.filter(a => a.profile_id === k.id);
  const recs = acts.filter(a => a.kind.startsWith('recitation') || a.kind === 'parent_override');
  const posts = ctx.posts.filter(x => x.author_id === k.id), comments = ctx.comments.filter(x => x.author_id === k.id), follows = ctx.follows.filter(x => x.follower_id === k.id);
  const c = $(`<div class="kidcard"><div class="head"><div class="ic"></div><div style="flex:1"><b></b>${badgeFor(k)}<div class="small">${sv ? 'Tersimpan ' + fmtTime(sv.updated_at) : 'Belum pernah main'}</div></div></div>
    <div class="stats"><span class="pill">Lv ${levelOf(st.xp || 0)}</span><span class="pill">${surahs.length}/10 surat</span><span class="pill">${ayat}/${TOTAL_AYAT} ayat</span><span class="pill">🏠 ${esc(house)}</span><span class="pill">🪙 ${st.coins || 0}</span></div>
    ${surahs.length ? `<p class="small" style="margin:0 0 6px">Surat selesai: ${esc(surahs.join(', '))}</p>` : ''}
    <details class="sec"><summary>Aktivitas terbaru (${acts.length})</summary><ul class="timeline">${acts.slice(0, 60).map(a => `<li><time>${fmtTime(a.created_at)}</time><span>${KIND[a.kind] || esc(a.kind)} <span class="small">${esc(describe(a))}</span></span></li>`).join('') || '<li>Belum ada.</li>'}</ul></details>
    <details class="sec"><summary>Percobaan membaca (${recs.length})</summary><ul class="timeline">${recs.slice(0, 40).map(a => `<li><time>${fmtTime(a.created_at)}</time><span>${KIND[a.kind] || esc(a.kind)} <span class="small">${esc(describe(a))}</span></span></li>`).join('') || '<li>Belum ada.</li>'}</ul></details>
    <details class="sec" data-s="posts"><summary>Kiriman (${posts.length}) · Komentar (${comments.length})</summary><div class="pl"></div></details>
    <details class="sec" data-s="follows"><summary>Mengikuti (${follows.length})</summary><div class="fl"></div></details>
    <details class="sec"><summary>Pengaturan akun anak</summary>
      <div class="formrow"><div class="field"><label>Ganti nama</label><input class="rn" maxlength="40"></div><button class="btn mini rnb">Simpan</button></div>
      <div class="formrow"><div class="field"><label>PIN baru (4–6 angka)</label><input class="pn" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></div><button class="btn mini pnb">Ganti PIN</button></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost mini del" style="color:#B3261E">Hapus akun anak…</button></div><div class="cf"></div>
      <p class="err msg"></p></details></div>`);
  c.querySelector('.ic').append(avatarCanvas(k.avatar));
  c.querySelector('.head b').textContent = k.display_name;
  c.querySelector('.rn').value = k.display_name;
  const msg = c.querySelector('.msg');
  c.querySelector('.rnb').onclick = async () => {
    const v = c.querySelector('.rn').value.trim(); if (!v) return;
    const cl = await sb(); const { error } = await cl.from('profiles').update({ display_name: v }).eq('id', k.id);
    if (error) { msg.textContent = friendly(error); return; } toast('Nama disimpan'); refresh(h);
  };
  c.querySelector('.pnb').onclick = async () => {
    const v = c.querySelector('.pn').value.trim();
    if (!/^[0-9]{4,6}$/.test(v)) { msg.textContent = 'PIN harus 4–6 angka.'; return; }
    try { await familySetPin(k.id, v); c.querySelector('.pn').value = ''; msg.className = 'ok msg'; msg.textContent = 'PIN diganti (kunci salah-PIN juga dibuka).'; }
    catch (e) { msg.className = 'err msg'; msg.textContent = friendly(e); }
  };
  c.querySelector('.del').onclick = () => {
    const cf = c.querySelector('.cf');
    cf.replaceChildren($(`<div class="confirm small">Semua progres, kebun, kiriman dan komentar ${esc(k.display_name)} akan dihapus permanen. Ketik <b>HAPUS</b> untuk melanjutkan.<div class="formrow"><div class="field"><input class="cfi" autocapitalize="characters"></div><button class="btn mini cfy" style="background:#F8D2C6">Hapus</button><button class="btn ghost mini cfn">Batal</button></div></div>`));
    cf.querySelector('.cfn').onclick = () => cf.replaceChildren();
    cf.querySelector('.cfy').onclick = async () => {
      if (cf.querySelector('.cfi').value.trim().toUpperCase() !== 'HAPUS') return;
      try { await familyDelete(k.id); toast('Akun anak dihapus'); refresh(h); } catch (e) { msg.textContent = friendly(e); }
    };
  };
  // posts & comments with hide/delete
  const pl = c.querySelector('.pl');
  const item = (kind, x) => {
    const r = $(`<div class="box" style="margin:6px 0;padding:8px"><div class="small">${kind === 'post' ? '📝 Kiriman' : '💬 Komentar'} · ${fmtTime(x.created_at)}${x.hidden ? ' · <b>disembunyikan</b>' : ''}${x.source_id ? ' · ' + esc(x.source_id) : ''}</div><p style="margin:4px 0;white-space:pre-wrap"></p><div class="row"><button class="btn ghost mini hd">${x.hidden ? 'Tampilkan' : 'Sembunyikan'}</button><button class="btn ghost mini dl" style="color:#B3261E">Hapus</button></div></div>`);
    r.querySelector('p').textContent = x.body;
    const table = kind === 'post' ? 'posts' : 'comments';
    r.querySelector('.hd').onclick = async () => { const cl = await sb(); const { error } = await cl.from(table).update({ hidden: !x.hidden }).eq('id', x.id); if (error) toast(friendly(error)); else refresh(h); };
    r.querySelector('.dl').onclick = async () => { if (!confirm('Hapus permanen?')) return; const cl = await sb(); const { error } = await cl.from(table).delete().eq('id', x.id); if (error) toast(friendly(error)); else refresh(h); };
    return r;
  };
  if (!posts.length && !comments.length) pl.append($(`<p class="small">Belum ada.</p>`));
  posts.forEach(x => pl.append(item('post', x))); comments.forEach(x => pl.append(item('comment', x)));
  const fl = c.querySelector('.fl');
  if (!follows.length) fl.append($(`<p class="small">Belum mengikuti siapa pun.</p>`));
  follows.forEach(f => {
    const o = ctx.names[f.followee_id] || {};
    const r = $(`<div class="row" style="align-items:center;justify-content:space-between;margin:4px 0"><span></span><button class="btn ghost mini">Hapus</button></div>`);
    r.querySelector('span').textContent = (o.display_name || 'Pengguna') + ' · sejak ' + fmtTime(f.created_at);
    r.querySelector('button').onclick = async () => { const cl = await sb(); const { error } = await cl.from('follows').delete().eq('follower_id', f.follower_id).eq('followee_id', f.followee_id); if (error) toast(friendly(error)); else refresh(h); };
    fl.append(r);
  });
  return c;
}

function addKidForm(h) {
  let av = 0;
  const f = $(`<div class="frame" style="margin-bottom:12px"><b style="font-size:18px">➕ Tambah anak</b>
    <div class="field"><label for="kn">Nama panggilan</label><input id="kn" maxlength="40" autocomplete="off" placeholder="mis. Amtar"></div>
    <b>Tokoh</b> <span class="small">(anak bisa mengubahnya sendiri nanti)</span><div class="avatars" style="margin:8px 0 10px"></div>
    <div class="field"><label for="kp">PIN untuk anak (4–6 angka)</label><input id="kp" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></div>
    <button class="btn green block" id="add">Buat akun anak</button><p class="err" id="err"></p></div>`);
  f.querySelector('.avatars').replaceWith(avatarBuilder(0, v => { av = v; }));
  f.querySelector('#add').onclick = async () => {
    const name = f.querySelector('#kn').value.trim(), pin = f.querySelector('#kp').value.trim(), err = f.querySelector('#err');
    if (!name) { err.textContent = 'Nama wajib diisi.'; return; }
    if (!/^[0-9]{4,6}$/.test(pin)) { err.textContent = 'PIN harus 4–6 angka.'; return; }
    const b = f.querySelector('#add'); b.disabled = true; err.textContent = '';
    try { await familyCreate(name, av, pin); toast(`Akun ${name} dibuat`); refresh(h); }
    catch (e) { err.textContent = friendly(e); b.disabled = false; }
  };
  return f;
}

function parentPinBox() {
  const f = $(`<div class="frame" style="margin-bottom:12px"><b style="font-size:18px">🔐 PIN orang tua</b>
    <p class="small" style="margin:6px 0">Dipakai saat anak minta dibantu di tahap membaca ayat ("Minta Ayah/Ibu dengar"). Berbeda dari PIN anak.</p>
    <p class="small" id="st"><span class="spinner"></span></p>
    <div class="formrow"><div class="field"><label for="pp">PIN orang tua baru (4–6 angka)</label><input id="pp" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></div><button class="btn mini" id="sv">Simpan</button></div>
    <p class="err" id="err"></p></div>`);
  sb().then(c => c.rpc('has_parent_pin')).then(({ data, error }) => {
    f.querySelector('#st').textContent = error ? 'Status PIN belum bisa dicek.' : data ? '✅ PIN orang tua sudah diatur.' : '⚠️ Belum diatur. Atur sekarang supaya anak bisa dibantu saat membaca.';
  });
  f.querySelector('#sv').onclick = async () => {
    const v = f.querySelector('#pp').value.trim(), err = f.querySelector('#err');
    if (!/^[0-9]{4,6}$/.test(v)) { err.textContent = 'PIN harus 4–6 angka.'; return; }
    const c = await sb(); const { error } = await c.rpc('set_parent_pin', { pin: v });
    if (error) { err.className = 'err'; err.textContent = friendly(error); return; }
    f.querySelector('#pp').value = ''; err.className = 'ok'; err.textContent = 'PIN orang tua disimpan.';
    f.querySelector('#st').textContent = '✅ PIN orang tua sudah diatur.';
  };
  return f;
}

// reminder: Trakteer has no auto-renew, so nudge 5 days before the badge lapses and after it has lapsed
function supportReminder(p) {
  if (!p.supporter_tier || !p.supporter_until) return '';
  const days = Math.ceil((new Date(p.supporter_until) - new Date()) / 86400000);
  if (days > 5) return '';
  const msg = days > 0 ? `Lencana keluarga aktif ${days} hari lagi (sampai ${fmtDate(p.supporter_until)}). Dukung lagi agar tetap aktif.`
                       : 'Lencana keluarga sedang tidak aktif. Dukung lagi bulan ini untuk mengaktifkannya kembali.';
  return `<div class="banner" style="margin:6px 0">${esc(msg)}</div>`;
}

function supportBox() {
  const p = session.profile;
  return $(`<div class="frame" style="margin-bottom:12px"><b style="font-size:18px">💚 Dukung Kebun Makna</b>
    <p class="small" style="margin:6px 0">Gratis untuk semua. Dukungan memberi lencana pendukung untuk seluruh keluarga, aktif 30 hari sejak dukungan terakhir.${p.supporter_tier ? ' Lencana Anda: ' + badgeFor(p, true) + '.' : ''}</p>
    ${supportReminder(p)}
    <a class="btn mini" href="#/dukung">Lihat cara mendukung</a></div>`);
}

async function refresh(h) {
  try { await loadAll(); render(h); } catch (e) { toast(friendly(e)); }
}

// ---------- Pasangan (spouse linking) ----------
function spouseBox(h) {
  const f = $(`<div class="frame" style="margin-bottom:12px"><b style="font-size:18px">💞 Pasangan</b><div class="sp"><span class="spinner"></span></div></div>`);
  const sp = f.querySelector('.sp');
  (async () => {
    const c = await sb(); const me = session.user.id;
    const { data: link, error } = await c.from('spouses').select('parent_a, parent_b, created_at').or(`parent_a.eq.${me},parent_b.eq.${me}`).maybeSingle();
    if (error) { sp.replaceChildren($(`<p class="small">Fitur pasangan belum tersedia.</p>`)); return; }
    if (link) {
      const other = link.parent_a === me ? link.parent_b : link.parent_a;
      const { data: op } = await c.from('profiles').select('display_name, supporter_tier, supporter_until, supporter_mult').eq('id', other).maybeSingle();
      sp.replaceChildren($(`<p style="margin:6px 0 0">✅ Terhubung dengan <b></b>. Anda berdua melihat dan mengelola semua anak. Anak masuk dengan satu nama keluarga bersama, dan PIN orang tua siapa pun bisa dipakai.</p>`));
      sp.querySelector('b').textContent = (op && op.display_name) || 'pasangan';
      return;
    }
    const { data: inv } = await c.from('spouse_invites').select('id, from_parent, to_parent, created_at').eq('status', 'pending').or(`from_parent.eq.${me},to_parent.eq.${me}`).order('created_at', { ascending: false });
    const ids = [...new Set((inv || []).flatMap(i => [i.from_parent, i.to_parent]).filter(x => x !== me))];
    const names = {};
    if (ids.length) { const { data } = await c.from('profiles').select('id, display_name').in('id', ids); (data || []).forEach(p => names[p.id] = p.display_name); }
    sp.replaceChildren($(`<p class="small" style="margin:6px 0">Hubungkan akun Ayah dan Ibu supaya keduanya mengelola anak-anak yang sama.</p>`));
    for (const i of (inv || []).filter(i => i.to_parent === me)) {
      const r = $(`<div class="banner"><b></b> mengundang Anda sebagai pasangan.<div class="row" style="margin-top:8px"><button class="btn green mini y">Terima…</button><button class="btn ghost mini n">Tolak</button></div><div class="cf"></div></div>`);
      r.querySelector('b').textContent = names[i.from_parent] || 'Orang tua';
      r.querySelector('.n').onclick = async () => { await c.rpc('decline_spouse', { invite_id: i.id }); refresh(h); };
      r.querySelector('.y').onclick = () => {
        const cf = r.querySelector('.cf');
        cf.replaceChildren($(`<div class="confirm small" style="margin-top:8px"><b>Sebelum menerima:</b><ul style="padding-left:18px;margin:6px 0">
          <li>Daftar anak Anda dan pasangan digabung. Anda berdua bisa melihat dan mengelola semua anak.</li>
          <li>Kalau ada nama anak yang sama, salah satunya otomatis diberi angka (mis. "Amtar 2"). Kedua akun tetap ada, progresnya tidak hilang.</li>
          <li>Keluarga hanya memakai <b>satu nama keluarga</b>. Pilih di bawah; nama yang lain dilepas (bisa dipakai keluarga lain). Kedua orang tua dan semua anak memakai nama yang dipilih.</li>
          <li>Lencana pendukung dihitung bersama untuk satu rumah tangga. PIN orang tua siapa pun bisa dipakai.</li>
          <li>Hubungan ini belum bisa diputus dari aplikasi.</li></ul>
          <div class="names"><span class="spinner"></span></div>
          <div class="row"><button class="btn green mini ok">Ya, hubungkan</button><button class="btn ghost mini no">Batal</button></div></div>`));
        cf.querySelector('.no').onclick = () => cf.replaceChildren();
        c.rpc('spouse_invite_names', { invite_id: i.id }).then(({ data: nm }) => {
          const row = Array.isArray(nm) ? nm[0] : nm; const box = cf.querySelector('.names');
          if (!row) { box.textContent = 'Nama keluarga tidak bisa dimuat.'; return; }
          box.replaceChildren($(`<div style="margin:6px 0"><b>Pakai nama keluarga:</b><label class="toggle"><input type="radio" name="fn${i.id}" value=""> <span class="m"></span> (milik Anda)</label><label class="toggle"><input type="radio" name="fn${i.id}" value=""> <span class="t"></span> (milik <span class="w"></span>)</label></div>`));
          const [r1, r2] = box.querySelectorAll('input');
          r1.value = row.mine || ''; r2.value = row.theirs || ''; r1.checked = true;
          box.querySelector('.m').textContent = row.mine || '—'; box.querySelector('.t').textContent = row.theirs || '—'; box.querySelector('.w').textContent = row.inviter_name || 'pasangan';
        });
        cf.querySelector('.ok').onclick = async () => {
          const sel = cf.querySelector('.names input:checked');
          if (!sel || !sel.value) { toast('Pilih satu nama keluarga dulu.'); return; }
          const { error: e2 } = await c.rpc('accept_spouse', { invite_id: i.id, family_name: sel.value });
          if (e2) toast(friendly(e2)); else { toast('Akun pasangan terhubung'); refresh(h); }
        };
      };
      sp.append(r);
    }
    const out = (inv || []).find(i => i.from_parent === me);
    if (out) {
      const r = $(`<div class="banner">Menunggu <b></b> menerima undangan. <button class="linkbtn">Batalkan</button></div>`);
      r.querySelector('b').textContent = names[out.to_parent] || 'pasangan';
      r.querySelector('button').onclick = async () => { await c.rpc('decline_spouse', { invite_id: out.id }); refresh(h); };
      sp.append(r);
    }
    const form = $(`<div><div class="formrow"><div class="field"><label>Nama keluarga pasangan</label><input class="sc" placeholder="contoh: saif" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" autocomplete="off"></div><button class="btn mini sb">Undang</button></div><p class="err se"></p></div>`);
    sp.append(form);
    const se = sp.querySelector('.se');
    sp.querySelector('.sb').onclick = async () => {
      const code = normFamily(sp.querySelector('.sc').value);
      if (!/^[a-z][a-z0-9]{2,19}$/.test(code)) { se.textContent = 'Nama keluarga 3–20 huruf kecil/angka, contoh: saif'; return; }
      const { error: e3 } = await c.rpc('invite_spouse', { family_code: code });
      if (e3) se.textContent = friendly(e3); else { toast('Undangan dikirim. Pasangan menerimanya di Halaman Orang Tua miliknya.'); refresh(h); }
    };
  })().catch(e => { const er = $(`<p class="err"></p>`); er.textContent = friendly(e); sp.replaceChildren(er); });
  return f;
}

// ---------- change the family name (live availability check) ----------
function familyNameEditor(box, current, h) {
  if (box.firstChild) { box.replaceChildren(); return; }
  const f = $(`<div class="confirm small" style="margin-top:8px"><div class="formrow"><div class="field"><label>Nama keluarga baru</label>
    <input class="nn" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" autocomplete="off"></div><button class="btn mini sv">Simpan</button></div>
    <p class="st" style="margin:4px 0"></p><p style="margin:0">3–20 huruf kecil atau angka, diawali huruf. Setelah diganti, anak perlu mengetik nama baru saat masuk di perangkat lain.</p></div>`);
  const inp = f.querySelector('.nn'), st = f.querySelector('.st'), sv = f.querySelector('.sv');
  inp.value = current; let t = null, okName = null;
  const check = () => {
    const v = normFamily(inp.value); if (v !== inp.value) inp.value = v; okName = null; sv.disabled = true;
    if (v === current) { st.className = 'st'; st.textContent = 'Ini nama keluarga Anda sekarang.'; return; }
    if (!/^[a-z][a-z0-9]{2,19}$/.test(v)) { st.className = 'st err'; st.textContent = 'Belum sesuai aturan.'; return; }
    st.className = 'st'; st.textContent = 'Mengecek…';
    clearTimeout(t); t = setTimeout(async () => {
      const c = await sb(); const { data, error } = await c.rpc('family_name_available', { name: v });
      if (normFamily(inp.value) !== v) return;
      if (error) { st.className = 'st err'; st.textContent = friendly(error); return; }
      if (data) { st.className = 'st ok'; st.textContent = `✓ "${v}" tersedia`; okName = v; sv.disabled = false; }
      else { st.className = 'st err'; st.textContent = `"${v}" sudah dipakai keluarga lain.`; }
    }, 350);
  };
  inp.oninput = check;
  sv.onclick = async () => {
    if (!okName) return;
    const c = await sb(); const { error } = await c.rpc('set_family_name', { name: okName });
    if (error) { st.className = 'st err'; st.textContent = friendly(error); return; }
    toast('Nama keluarga disimpan: ' + okName); refresh(h);
  };
  box.replaceChildren(f); check(); inp.focus();
}
