// admin.js — #/admin, only for users in `admins`: unmatched supporter payments and a manual link by family code
// (rpc admin_link_payment from migration 20261109060000).
import { $, esc, root, toast } from './ui.js';
import { sb, session, friendly } from './api.js';

export async function isAdmin() {
  if (!session.user) return false;
  try { const c = await sb(); const { data } = await c.from('admins').select('user_id').eq('user_id', session.user.id); return !!(data && data.length); }
  catch (e) { return false; }
}

const rp = n => 'Rp' + Number(n).toLocaleString('id-ID');

export async function adminPage() {
  root.replaceChildren($(`<div class="dash"><h2>Admin</h2><div class="frame"><span class="spinner"></span></div></div>`));
  if (!(await isAdmin())) { root.replaceChildren($(`<div class="dash"><h2>Admin</h2><div class="banner">Halaman ini hanya untuk admin.</div></div>`)); return; }
  const c = await sb();
  const { data, error } = await c.from('payments').select('id, provider, provider_ref, amount_idr, supporter_name, message, created_at').is('parent_id', null).order('created_at', { ascending: false }).limit(100);
  const w = $(`<div class="dash"><h2>Admin · Dukungan belum cocok</h2><div class="list"></div><p class="start-note"><a class="linkbtn" style="color:#fff" href="#/ortu">◂ Kembali</a></p></div>`);
  const list = w.querySelector('.list');
  if (error) list.append($(`<div class="banner">${esc(friendly(error))}</div>`));
  else if (!data.length) list.append($(`<div class="banner">Semua dukungan sudah cocok dengan keluarga. 🎉</div>`));
  else data.forEach(p => {
    const r = $(`<div class="post"><div class="small">${esc(p.provider)} · ${new Date(p.created_at).toLocaleString('id-ID')} · ${esc(p.provider_ref)}</div>
      <b>${rp(p.amount_idr)}</b> dari <span class="nm"></span><p class="msg small" style="white-space:pre-wrap"></p>
      <div class="formrow"><div class="field"><input class="fc" placeholder="KM-XXXXXX" maxlength="9" autocapitalize="characters"></div><button class="btn mini">Hubungkan</button></div><p class="err"></p></div>`);
    r.querySelector('.nm').textContent = p.supporter_name || '(tanpa nama)';
    r.querySelector('.msg').textContent = p.message || '';
    r.querySelector('button').onclick = async () => {
      const code = r.querySelector('.fc').value.trim();
      const { error: e } = await c.rpc('admin_link_payment', { payment_id: p.id, family_code: code });
      if (e) { r.querySelector('.err').textContent = /Could not find the function/i.test(e.message) ? 'Fungsi admin belum dipasang di server (migrasi 20261109060000).' : friendly(e); return; }
      toast('Terhubung, lencana diperbarui'); r.remove();
    };
    list.append(r);
  });
  root.replaceChildren(w);
}
