// support.js — "Dukung Kebun Makna" page (#/dukung): tiers, Trakteer link, your #username to paste in the message.
import { $, esc, root, toast } from './ui.js';
import { sb, session, loadProfile, normUsername, isUsername, friendly } from './api.js';
import { loadTiers, badgeFor, badgeActive, fmtDate } from './badges.js';
import { SUPPORT } from './config.js';

const rp = n => 'Rp' + Number(n).toLocaleString('id-ID');

export async function supportPage() {
  root.replaceChildren($(`<div class="dash"><h2>💚 Dukung Kebun Makna</h2><div class="frame"><span class="spinner"></span></div></div>`));
  const [tiers] = await Promise.all([loadTiers(), loadProfile().catch(() => null)]);
  const p = session.profile;
  let code = null;
  if (p) {
    try { const c = await sb(); const { data } = await c.rpc('my_username'); code = data || null; } catch (e) {}
  }
  const links = [
    SUPPORT.trakteer && `<a class="btn green block" href="${esc(SUPPORT.trakteer)}" target="_blank" rel="noopener">Dukung lewat Trakteer ▸</a>`,
    SUPPORT.saweria && `<a class="btn blue block" href="${esc(SUPPORT.saweria)}" target="_blank" rel="noopener">Dukung lewat Saweria ▸</a>`,
  ].filter(Boolean).join('');
  const f = $(`<div class="dash"><h2>💚 Dukung Kebun Makna</h2>
    <div class="frame" style="margin-bottom:12px"><p style="margin:0 0 8px"><b>Gratis untuk semua.</b> Semua surat, cerita dan fitur bisa dipakai tanpa bayar. Dukungan membantu biaya server dan pembuatan konten, dan memberi <b>lencana pendukung</b> untuk akun Anda.</p>
      ${p && p.supporter_tier ? (badgeActive(p)
        ? `<div class="banner">Lencana Anda: ${badgeFor(p, true)}, aktif sampai <b>${fmtDate(p.supporter_until)}</b>. Jazakumullahu khairan!</div>`
        : `<div class="banner">Lencana Anda: ${badgeFor(p, true)}. Dukung lagi bulan ini untuk mengaktifkannya kembali.</div>`) : ''}</div>
    <div class="frame" style="margin-bottom:12px"><b>Lencana</b><ul style="list-style:none;padding:0;margin:8px 0 0">
      ${tiers.map(t => `<li style="padding:6px 0;border-bottom:1px dashed #D8CBA8"><span style="font-size:22px">${t.badge}</span> <b>${esc(t.name)}</b> <span class="small">· mulai ${rp(t.min_total_idr)}</span></li>`).join('')}
    </ul><p class="small" style="margin:8px 0 0"><b>Per 30 hari.</b> Semua dukungan Anda dalam 30 hari terakhir dijumlahkan (di atas Rp310.000 lencana 🌟 mendapat pengali, misalnya Rp620.000 = 2🌟). Lencana aktif 30 hari sejak dukungan terakhir. Setelah itu lencana tetap ada tetapi tampak abu-abu sampai Anda mendukung lagi. Trakteer tidak menagih otomatis, jadi kami akan mengingatkan Anda.</p></div>
    <div class="frame" style="margin-bottom:12px"><b>Cara mendukung</b>
      <ol style="padding-left:20px;margin:8px 0">
        <li>Salin nama pengguna Anda (dengan tanda #). Bisa diganti di bawah.</li>
        <li>Buka halaman Trakteer. Di sana dukungan dihitung dalam satuan <b>Cendol</b>.</li>
        <li><b>Tulis #namapengguna di pesan dukungan</b>, misalnya <b>#saif</b>. Tanpa itu, lencana tidak bisa dicocokkan ke akun Anda.</li>
      </ol>
      <div id="code"></div>
      <div style="display:grid;gap:10px;margin-top:10px">${links || '<p class="small">Tautan dukungan belum tersedia.</p>'}</div></div>
    <p class="start-note"><a class="linkbtn" style="color:#fff" href="#">◂ Kembali</a></p></div>`);
  const box = f.querySelector('#code');
  if (code) {
    const r = $(`<div class="row" style="align-items:center"><span class="code">#${esc(code)}</span><button class="btn mini">Salin</button></div>`);
    r.querySelector('button').onclick = () => { const t = '#' + code; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Disalin: ' + t), () => prompt('Salin kode ini:', t)); };
    box.append(r);
    const ed = $(`<button class="linkbtn" style="margin-top:6px">Ganti nama pengguna</button>`);
    ed.onclick = () => usernameEditor(box, code, ed);
    box.append(ed);
  } else {
    box.append($(`<div class="banner">Masuk dulu dengan akunmu untuk melihat kode dukungan.</div>`));
  }
  root.replaceChildren(f);
}

// ---------- change the username (live availability check) ----------
function usernameEditor(box, current, btn) {
  if (box.querySelector('.confirm')) { box.querySelector('.confirm').remove(); return; }
  const f = $(`<div class="confirm small" style="margin-top:8px"><div class="formrow"><div class="field"><label>Nama pengguna baru</label>
    <input class="nn" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" autocomplete="off"></div><button class="btn mini sv">Simpan</button></div>
    <p class="st" style="margin:4px 0"></p><p style="margin:0">3–20 huruf kecil atau angka, diawali huruf. Ini yang ditulis pendukung di pesan Trakteer (#nama), jadi nama ini harus unik.</p></div>`);
  const inp = f.querySelector('.nn'), st = f.querySelector('.st'), sv = f.querySelector('.sv');
  inp.value = current; let t = null, okName = null;
  const check = () => {
    const v = normUsername(inp.value); if (v !== inp.value) inp.value = v; okName = null; sv.disabled = true;
    if (v === current) { st.className = 'st'; st.textContent = 'Ini nama pengguna Anda sekarang.'; return; }
    if (!isUsername(v)) { st.className = 'st err'; st.textContent = 'Belum sesuai aturan.'; return; }
    st.className = 'st'; st.textContent = 'Mengecek…';
    clearTimeout(t); t = setTimeout(async () => {
      const c = await sb(); const { data, error } = await c.rpc('username_available', { name: v });
      if (normUsername(inp.value) !== v) return;
      if (error) { st.className = 'st err'; st.textContent = friendly(error); return; }
      if (data) { st.className = 'st ok'; st.textContent = `✓ "${v}" tersedia`; okName = v; sv.disabled = false; }
      else { st.className = 'st err'; st.textContent = `"${v}" sudah dipakai.`; }
    }, 350);
  };
  inp.oninput = check;
  sv.onclick = async () => {
    if (!okName) return;
    const c = await sb(); const { error } = await c.rpc('set_username', { name: okName });
    if (error) { st.className = 'st err'; st.textContent = friendly(error); return; }
    toast('Nama pengguna disimpan: ' + okName); supportPage();
  };
  box.append(f); check(); inp.focus();
}
