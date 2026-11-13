// groups.js — Phase 6 groups (family / class / TPA). Parents create (audience 'child' or 'parent'), members join by code.
// Weekly goal + progress from activity_log ayah_done counts via rpc('group_progress'). Leaderboards only inside a group.
import { $, esc, root, toast } from './ui.js';
import { sb, session, friendly } from './api.js';
import { avatarCanvas } from './account.js';
import { badgeFor, loadTiers } from './badges.js';
import { tabBar } from './social.js';

const PENDING = 'Grup sedang disiapkan di server (menunggu pembaruan database). Coba lagi nanti, ya.';
const isPendingErr = e => e && (e.code === '42P17' || e.code === '42883' || e.code === 'PGRST202' || /recursion|does not exist|Could not find the function/i.test(e.message || ''));

function shell(title) {
  document.body.querySelectorAll('nav.tabbar').forEach(n => n.remove());
  document.body.append(tabBar('grup')); document.body.classList.add('has-tabs');
  const w = $(`<div class="dash social"><h2></h2><div class="body"></div></div>`);
  w.querySelector('h2').textContent = title; root.replaceChildren(w);
  return w.querySelector('.body');
}

export async function groupsPage(id) {
  await loadTiers();
  return id ? groupDetail(id) : groupList();
}

async function groupList() {
  const body = shell('Grup');
  const parent = session.profile.role === 'parent';
  const c = await sb();
  const join = $(`<div class="frame" style="margin-bottom:12px"><b>Gabung grup</b><p class="small" style="margin:4px 0">Minta kode grup ke ustaz/ustazah, guru, atau orang tua yang membuat grup.</p>
    <div class="formrow"><div class="field"><input id="gc" placeholder="Kode grup (6 huruf/angka)" maxlength="6" autocapitalize="characters" autocomplete="off"></div><button class="btn mini" id="gj">Gabung</button></div><p class="err" id="ge"></p></div>`);
  join.querySelector('#gj').onclick = async () => {
    const v = join.querySelector('#gc').value.trim(); const er = join.querySelector('#ge');
    if (!/^[0-9a-fA-F]{6}$/.test(v)) { er.textContent = 'Kode grup 6 huruf/angka.'; return; }
    const { data, error } = await c.rpc('join_group', { code: v });
    if (error) { er.textContent = isPendingErr(error) ? PENDING : friendly(error); return; }
    toast('Berhasil bergabung!'); location.hash = '#/grup/' + data;
  };
  body.append(join);
  if (parent) {
    const mk = $(`<div class="frame" style="margin-bottom:12px"><b>Buat grup baru</b>
      <div class="field"><label>Nama grup</label><input id="gn" maxlength="60" placeholder="mis. TPA Al-Ikhlas kelas 2"></div>
      <div class="field"><label>Untuk siapa?</label><select id="ga"><option value="child">Anak-anak (kelas, TPA, keluarga)</option><option value="parent">Orang tua</option></select></div>
      <p class="small" style="margin:0 0 8px">Grup anak dikelola oleh Anda tanpa Anda menjadi anggotanya. Anak bergabung dengan kode grup.</p>
      <button class="btn green block" id="gm">Buat grup</button><p class="err" id="gme"></p></div>`);
    mk.querySelector('#gm').onclick = async () => {
      const name = mk.querySelector('#gn').value.trim(), audience = mk.querySelector('#ga').value, er = mk.querySelector('#gme');
      if (!name) { er.textContent = 'Nama grup wajib diisi.'; return; }
      const { data, error } = await c.from('groups').insert({ name, owner_id: session.user.id, audience }).select('id').single();
      if (error) { er.textContent = isPendingErr(error) ? PENDING : friendly(error); return; }
      location.hash = '#/grup/' + data.id;
    };
    body.append(mk);
  }
  const list = $(`<div><h3 style="color:#fff;text-shadow:1px 1px 0 var(--ink)">Grupku</h3><div class="gl"><span class="spinner"></span></div></div>`);
  body.append(list);
  const { data, error } = await c.from('groups').select('id, name, owner_id').order('created_at', { ascending: false });
  const gl = list.querySelector('.gl');
  if (error) { gl.replaceChildren($(`<div class="banner">${esc(isPendingErr(error) ? PENDING : friendly(error))}</div>`)); return; }
  gl.replaceChildren();
  if (!data.length) gl.append($(`<p class="start-note">Belum ada grup.</p>`));
  data.forEach(g => { const a = $(`<a class="post" style="display:block;text-decoration:none;color:var(--ink)"><b></b><div class="small">${g.owner_id === session.user.id ? 'Kamu pengelolanya' : 'Anggota'}</div></a>`); a.href = '#/grup/' + g.id; a.querySelector('b').textContent = g.name; gl.append(a); });
}

async function groupDetail(id) {
  const body = shell('Grup');
  const c = await sb();
  let { data: g, error } = await c.from('groups').select('id, name, owner_id, join_code, audience, weekly_goal').eq('id', id).maybeSingle();
  if (error && /weekly_goal/.test(error.message || '')) ({ data: g, error } = await c.from('groups').select('id, name, owner_id, join_code, audience').eq('id', id).maybeSingle());
  if (error || !g) { body.append($(`<div class="banner">${esc(error ? (isPendingErr(error) ? PENDING : friendly(error)) : 'Grup tidak ditemukan.')}</div>`)); return; }
  const owner = g.owner_id === session.user.id, goal = g.weekly_goal || 50;
  const { data: prog, error: pe } = await c.rpc('group_progress', { g: id });
  const total = (prog || []).reduce((s, m) => s + Number(m.ayat_week || 0), 0);
  const head = $(`<div class="frame" style="margin-bottom:12px"><b class="nm" style="font-size:22px"></b><div class="small">Grup ${g.audience === 'parent' ? 'orang tua' : 'anak-anak'} · kode <span class="code" style="font-size:16px">${esc(g.join_code)}</span></div>
    <div style="margin-top:10px"><b>Target minggu ini: ${goal} ayat</b>
      <div class="minibar" style="height:16px;background:#E8DDBF;border:3px solid var(--ink);border-radius:6px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.min(100, total / goal * 100)}%;background:#7CD35E"></div></div>
      <p class="small" style="margin:4px 0 0">${pe ? 'Progres belum bisa dihitung (menunggu pembaruan server).' : `${total} dari ${goal} ayat selesai bersama sejak Senin.${total >= goal ? ' MasyaAllah, target tercapai! 🎉' : ''}`}</p></div></div>`);
  head.querySelector('.nm').textContent = g.name;
  body.append(head);
  if (owner) {
    const ed = $(`<div class="frame" style="margin-bottom:12px"><b>Pengaturan (pengelola)</b>
      <div class="formrow"><div class="field"><label>Target ayat per minggu</label><input id="wg" inputmode="numeric" maxlength="4" value="${goal}"></div><button class="btn mini" id="ws">Simpan</button></div>
      <button class="btn ghost mini" id="gd" style="color:#B3261E">Hapus grup</button><p class="err" id="we"></p></div>`);
    ed.querySelector('#ws').onclick = async () => {
      const v = parseInt(ed.querySelector('#wg').value, 10), er = ed.querySelector('#we');
      if (!(v >= 1 && v <= 10000)) { er.textContent = 'Angka 1–10000.'; return; }
      const { error: e } = await c.from('groups').update({ weekly_goal: v }).eq('id', id);
      if (e) { er.textContent = /weekly_goal|permission/i.test(e.message) ? PENDING : friendly(e); return; }
      groupDetail(id);
    };
    ed.querySelector('#gd').onclick = async () => { if (!confirm('Hapus grup ini?')) return; const { error: e } = await c.from('groups').delete().eq('id', id); if (e) toast(friendly(e)); else location.hash = '#/grup'; };
    body.append(ed);
  }
  const lb = $(`<div class="frame"><b>Papan peringkat minggu ini</b><p class="small" style="margin:2px 0 8px">Hanya untuk anggota grup ini.</p><ol class="lb" style="padding-left:22px;margin:0"></ol></div>`);
  const ol = lb.querySelector('.lb');
  if (pe) ol.append($(`<li class="small">${esc(isPendingErr(pe) ? PENDING : friendly(pe))}</li>`));
  else if (!prog.length) ol.append($(`<li class="small">Belum ada anggota. Bagikan kode grup.</li>`));
  else prog.forEach(m => {
    const li = $(`<li style="margin:6px 0"><span class="who-row" style="display:inline-flex"><span class="ic"></span><span><b></b><span class="bd"></span> · ${Number(m.ayat_week)} ayat</span></span>${owner && m.profile_id !== session.user.id ? ' <button class="linkbtn rm">keluarkan</button>' : ''}</li>`);
    li.querySelector('.ic').append(avatarCanvas(m.avatar)); li.querySelector('b').textContent = m.display_name; li.querySelector('.bd').innerHTML = badgeFor(m);
    const rm = li.querySelector('.rm'); if (rm) rm.onclick = async () => { const { error: e } = await c.from('group_members').delete().match({ group_id: id, profile_id: m.profile_id }); if (e) toast(friendly(e)); else groupDetail(id); };
    ol.append(li);
  });
  body.append(lb);
  if (!owner) {
    const lv = $(`<p class="start-note"><button class="linkbtn" style="color:#fff">Keluar dari grup</button></p>`);
    lv.querySelector('button').onclick = async () => { if (!confirm('Keluar dari grup?')) return; await c.from('group_members').delete().match({ group_id: id, profile_id: session.user.id }); location.hash = '#/grup'; };
    body.append(lv);
  }
}
