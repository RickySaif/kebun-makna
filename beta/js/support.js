// support.js — "Dukung Kebun Makna" page (#/dukung): tiers, Trakteer link, the parent's #familyname to paste.
import { $, esc, root, toast } from './ui.js';
import { sb, session, loadProfile } from './api.js';
import { loadTiers, badgeFor } from './badges.js';
import { SUPPORT } from './config.js';

const rp = n => 'Rp' + Number(n).toLocaleString('id-ID');

export async function supportPage() {
  root.replaceChildren($(`<div class="dash"><h2>💚 Dukung Kebun Makna</h2><div class="frame"><span class="spinner"></span></div></div>`));
  const [tiers] = await Promise.all([loadTiers(), loadProfile().catch(() => null)]);
  const p = session.profile;
  let code = null;
  if (p && p.role === 'parent') {
    try { const c = await sb(); const { data } = await c.rpc('my_family_name'); code = data || null; } catch (e) {}
  }
  const links = [
    SUPPORT.trakteer && `<a class="btn green block" href="${esc(SUPPORT.trakteer)}" target="_blank" rel="noopener">Dukung lewat Trakteer ▸</a>`,
    SUPPORT.saweria && `<a class="btn blue block" href="${esc(SUPPORT.saweria)}" target="_blank" rel="noopener">Dukung lewat Saweria ▸</a>`,
  ].filter(Boolean).join('');
  const f = $(`<div class="dash"><h2>💚 Dukung Kebun Makna</h2>
    <div class="frame" style="margin-bottom:12px"><p style="margin:0 0 8px"><b>Gratis untuk semua.</b> Semua surat, cerita dan fitur bisa dipakai tanpa bayar. Dukungan membantu biaya server dan pembuatan konten, dan memberi <b>lencana pendukung</b> untuk seluruh keluarga.</p>
      ${p && p.supporter_tier ? `<div class="banner">Lencana keluarga Anda: ${badgeFor(p.supporter_tier, true)}. Jazakumullahu khairan!</div>` : ''}</div>
    <div class="frame" style="margin-bottom:12px"><b>Lencana</b><ul style="list-style:none;padding:0;margin:8px 0 0">
      ${tiers.map(t => `<li style="padding:6px 0;border-bottom:1px dashed #D8CBA8"><span style="font-size:22px">${t.badge}</span> <b>${esc(t.name)}</b> <span class="small">· total dukungan mulai ${rp(t.min_total_idr)}</span></li>`).join('')}
    </ul><p class="small" style="margin:8px 0 0">Total dukungan keluarga dijumlahkan. Lencana muncul di samping nama orang tua dan anak-anak.</p></div>
    <div class="frame" style="margin-bottom:12px"><b>Cara mendukung</b>
      <ol style="padding-left:20px;margin:8px 0">
        <li>Salin nama keluarga Anda (dengan tanda #).</li>
        <li>Buka halaman Trakteer. Di sana dukungan dihitung dalam satuan <b>Cendol</b>.</li>
        <li><b>Tulis #namakeluarga di pesan dukungan</b>, misalnya <b>#saif</b>. Tanpa itu, lencana tidak bisa dicocokkan ke akun Anda.</li>
      </ol>
      <div id="code"></div>
      <div style="display:grid;gap:10px;margin-top:10px">${links || '<p class="small">Tautan dukungan belum tersedia.</p>'}</div></div>
    <p class="start-note"><a class="linkbtn" style="color:#fff" href="${p && p.role === 'parent' ? '#/ortu' : '#'}">◂ Kembali</a></p></div>`);
  const box = f.querySelector('#code');
  if (code) {
    const r = $(`<div class="row" style="align-items:center"><span class="code">#${esc(code)}</span><button class="btn mini">Salin</button></div>`);
    r.querySelector('button').onclick = () => { const t = '#' + code; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Disalin: ' + t), () => prompt('Salin kode ini:', t)); };
    box.append(r);
  } else {
    box.append($(`<div class="banner">Nama keluarga ada di <a href="#/ortu">Halaman Orang Tua</a>. Masuk sebagai orang tua untuk menyalinnya.</div>`));
  }
  root.replaceChildren(f);
}
