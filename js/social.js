// social.js — Beranda (feed), composer (source required), profile pages. Role separation is enforced by RLS:
// children only see children, parents only see parents (plus their own family).
import { $, esc, root, toast } from './ui.js';
import { BY, DATA } from './data.js';
import { sb, session, friendly, logActivity } from './api.js';
import { avatarCanvas } from './account.js';
import { badgeFor, loadTiers } from './badges.js';

export const REACTIONS = [
  { k: 'masyaallah', label: 'MasyaAllah', e: '🌟' },
  { k: 'jazakallah', label: 'Jazakallah', e: '🤲' },
  { k: 'aamiin', label: 'Aamiin', e: '🙏' },
  { k: 'subhanallah', label: 'SubhanAllah', e: '✨' },
];
const PROMPTS = ['Apa pelajaran dari ayat ini untukmu?', 'Kapan kamu bisa mengamalkannya minggu ini?', 'Apa yang membuatmu bersyukur setelah membacanya?'];
const fmt = t => { const d = new Date(t), now = Date.now(), s = (now - d) / 1000; if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt'; if (s < 86400) return Math.floor(s / 3600) + ' jam'; return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
const me = () => session.user && session.user.id;

// ---------- sources ----------
/** For hadith rows: the matn (quoted words after the chain of narrators), or null when it can't be split reliably. */
export function matn(src) {
  if (!src || src.kind === 'quran' || !/^(bukhari|muslim):/.test(src.id)) return null;
  const t = src.indonesian; const first = t.indexOf(']'); if (first < 0) return null;
  // Candidate quoted segments after the first narrator. Accept the first one that directly follows
  // "bersabda" / "berkata kepadaku" / "berpesan", has no narrator names and doesn't end mid-sentence.
  // Anything else (dialogues, narrations) falls back to the full text.
  const qs = []; for (let i = t.indexOf('"', first); i >= 0; i = t.indexOf('"', i + 1)) qs.push(i);
  for (let k = 0; k < qs.length; k++) {
    const a = qs[k], b = k + 1 < qs.length ? qs[k + 1] : t.length;
    const seg = t.slice(a + 1, b).trim(), before = t.slice(Math.max(0, a - 40), a);
    if (!/(bersabda|berkata kepadaku|berpesan kepada saya)[^"]{0,20}[:;,]?\s*$/.test(before)) continue;
    if (seg.length < 20 || seg.includes('[') || /[;:,]$/.test(seg)) continue;
    return seg;
  }
  return null;
}
export function sourceCard(src) {
  if (!src) return $(`<div class="srccard"><p class="small">Sumber tidak tersedia.</p></div>`);
  const isQ = src.id.startsWith('quran:');
  const m = matn(src);
  const c = $(`<div class="srccard">
    ${isQ ? `<div class="ar" lang="ar" dir="rtl"></div>` : ''}
    <p class="idn"></p>
    <div class="small ref"><b></b> · <span class="attr"></span></div>
    ${!isQ ? `<button class="linkbtn more">Lihat lengkap</button><div class="full" hidden><div class="ar" lang="ar" dir="rtl" style="font-size:20px"></div><p class="small fullid"></p></div>` : ''}
  </div>`);
  if (isQ) c.querySelector('.ar').textContent = src.arabic;
  c.querySelector('.idn').textContent = isQ ? src.indonesian : (m ? `“${m}”` : src.indonesian.slice(0, 700) + (src.indonesian.length > 700 ? '…' : ''));
  c.querySelector('.ref b').textContent = src.ref_label;
  c.querySelector('.attr').textContent = src.attribution;
  if (!isQ) {
    c.querySelector('.full .ar').textContent = src.arabic; c.querySelector('.fullid').textContent = src.indonesian;
    c.querySelector('.more').onclick = e => { const f = c.querySelector('.full'); f.hidden = !f.hidden; e.target.textContent = f.hidden ? 'Lihat lengkap' : 'Tutup'; };
  }
  return c;
}
export async function getSources(ids) {
  const out = {}; ids = [...new Set(ids)].filter(Boolean); if (!ids.length) return out;
  const c = await sb(); const { data, error } = await c.from('sources').select('id, kind, ref_label, arabic, indonesian, attribution').in('id', ids);
  if (error) throw error; (data || []).forEach(s => out[s.id] = s); return out;
}

// ---------- shell with tabs ----------
export function tabBar(active) {
  const nav = $(`<nav class="tabbar">
    <a href="#/" data-t="kebun">🌱<span>Kebun</span></a>
    <a href="#/beranda" data-t="beranda">📰<span>Beranda</span></a>
    <a href="#/grup" data-t="grup">👥<span>Grup</span></a>
    <a href="#/profil" data-t="profil">👤<span>Profil</span></a></nav>`);
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.t === active));
  return nav;
}
function page(title, active) {
  const w = $(`<div class="dash social"><h2></h2><div class="body"></div></div>`);
  w.querySelector('h2').textContent = title;
  root.replaceChildren(w);
  document.body.querySelectorAll('nav.tabbar').forEach(n => n.remove());
  document.body.append(tabBar(active));
  document.body.classList.add('has-tabs');
  return w.querySelector('.body');
}

// ---------- feed ----------
export async function feedPage(which = 'ikuti') {
  const body = page('Beranda', 'beranda');
  await loadTiers();
  const top = $(`<div><div class="ptab"><button data-w="ikuti">Diikuti</button><button data-w="jelajah">Jelajah</button></div>
    <div class="row"><button class="btn green" id="new" style="flex:2">✏️ Tulis kiriman</button><a class="btn blue" href="#/lomba" style="flex:1">🏁 Lomba</a></div></div>`);
  top.querySelectorAll('.ptab button').forEach(b => { b.classList.toggle('on', b.dataset.w === which); b.onclick = () => { location.hash = '#/beranda/' + b.dataset.w; }; });
  top.querySelector('#new').onclick = () => composer();
  const list = $(`<div class="feed"><div class="frame"><span class="spinner"></span></div></div>`);
  body.append(top, list);
  try {
    const c = await sb();
    let q = c.from('posts').select('id, author_id, source_id, body, hidden, created_at').order('created_at', { ascending: false }).limit(40);
    if (which === 'ikuti') {
      const [{ data: f }, { data: gm }] = await Promise.all([
        c.from('follows').select('followee_id').eq('follower_id', me()),
        c.from('group_members').select('group_id').eq('profile_id', me()),
      ]);
      let ids = [me(), ...(f || []).map(x => x.followee_id)];
      if (gm && gm.length) { const { data: mem } = await c.from('group_members').select('profile_id').in('group_id', gm.map(g => g.group_id)); ids.push(...(mem || []).map(m => m.profile_id)); }
      q = q.in('author_id', [...new Set(ids)]);
    }
    const { data: posts, error } = await q; if (error) throw error;
    list.replaceChildren();
    if (!posts.length) list.append($(`<div class="banner">${which === 'ikuti' ? 'Belum ada kiriman dari teman yang kamu ikuti. Lihat tab <b>Jelajah</b> untuk menemukan teman, atau tulis kiriman pertamamu!' : 'Belum ada kiriman. Jadilah yang pertama!'}</div>`));
    else { const els = await postCards(posts, true); els.forEach(el => list.append(el)); if (!els.length) list.append($(`<div class="banner">Belum ada kiriman.</div>`)); }
  } catch (e) { list.replaceChildren($(`<p class="err"></p>`)); list.querySelector('.err').textContent = friendly(e); }
}

export async function postCards(posts, sameRoleOnly = false) {
  if (!posts.length) return [];
  const c = await sb();
  const ids = posts.map(p => p.id);
  const [{ data: authors }, srcs, { data: reacts }, { data: comms }] = await Promise.all([
    c.from('profiles').select('id, display_name, avatar, supporter_tier, supporter_until, supporter_mult, role').in('id', [...new Set(posts.map(p => p.author_id))]),
    getSources(posts.map(p => p.source_id)),
    c.from('reactions').select('post_id, profile_id, kind').in('post_id', ids),
    c.from('comments').select('post_id').in('post_id', ids),
  ]);
  const A = {}; (authors || []).forEach(a => A[a.id] = a);
  // parents can also read their own children's posts (RLS); keep each feed to one side
  if (sameRoleOnly) posts = posts.filter(p => A[p.author_id] && A[p.author_id].role === session.profile.role);
  return posts.map(p => postCard(p, A[p.author_id], srcs[p.source_id], (reacts || []).filter(r => r.post_id === p.id), (comms || []).filter(x => x.post_id === p.id).length));
}

function nameRow(a, when) {
  const r = $(`<a class="who-row"><span class="ic"></span><span><b class="nm"></b><span class="bd"></span><br><span class="small">${esc(when || '')}</span></span></a>`);
  if (a) { r.href = '#/profil/' + a.id; r.querySelector('.ic').append(avatarCanvas(a.avatar)); r.querySelector('.nm').textContent = a.display_name; r.querySelector('.bd').innerHTML = badgeFor(a); }
  else r.querySelector('.nm').textContent = 'Pengguna';
  return r;
}

function postCard(p, author, src, reacts, ncom) {
  const card = $(`<article class="post"><div class="top"></div><div class="src"></div><p class="body"></p>
    <div class="reacts"></div>
    <div class="row" style="justify-content:space-between;align-items:center;margin-top:6px"><button class="linkbtn cm">💬 ${ncom} komentar</button><span><button class="linkbtn rp" style="color:#8A6D3B">Laporkan</button>${p.author_id === me() ? ' · <button class="linkbtn dl" style="color:#B3261E">Hapus</button>' : ''}</span></div>
    <div class="comments" hidden></div></article>`);
  card.querySelector('.top').append(nameRow(author, fmt(p.created_at) + (p.hidden ? ' · disembunyikan' : '')));
  card.querySelector('.src').append(sourceCard(src));
  card.querySelector('.body').textContent = p.body;
  const rx = card.querySelector('.reacts');
  const drawR = () => {
    rx.replaceChildren(...REACTIONS.map(R => {
      const n = reacts.filter(r => r.kind === R.k).length, mine = reacts.some(r => r.kind === R.k && r.profile_id === me());
      const b = $(`<button class="rx${mine ? ' on' : ''}" title="${R.label}">${R.e} <span>${R.label}</span>${n ? ' ' + n : ''}</button>`);
      b.onclick = async () => {
        const c = await sb();
        if (mine) { const { error } = await c.from('reactions').delete().match({ post_id: p.id, profile_id: me(), kind: R.k }); if (!error) reacts = reacts.filter(r => !(r.kind === R.k && r.profile_id === me())); else toast(friendly(error)); }
        else { const { error } = await c.from('reactions').insert({ post_id: p.id, profile_id: me(), kind: R.k }); if (!error) reacts.push({ post_id: p.id, profile_id: me(), kind: R.k }); else toast(friendly(error)); }
        drawR();
      };
      return b;
    }));
  };
  drawR();
  card.querySelector('.rp').onclick = () => report({ post_id: p.id });
  const dl = card.querySelector('.dl');
  if (dl) dl.onclick = async () => { if (!confirm('Hapus kiriman ini?')) return; const c = await sb(); const { error } = await c.from('posts').delete().eq('id', p.id); if (error) toast(friendly(error)); else card.remove(); };
  const cbox = card.querySelector('.comments');
  card.querySelector('.cm').onclick = () => { cbox.hidden = !cbox.hidden; if (!cbox.hidden) loadComments(p, cbox, card.querySelector('.cm')); };
  return card;
}

async function loadComments(p, box, counter) {
  box.replaceChildren($(`<span class="spinner"></span>`));
  const c = await sb();
  const { data: cs, error } = await c.from('comments').select('id, author_id, body, hidden, created_at').eq('post_id', p.id).order('created_at');
  if (error) { box.textContent = friendly(error); return; }
  const { data: au } = cs.length ? await c.from('profiles').select('id, display_name, avatar, supporter_tier, supporter_until, supporter_mult').in('id', [...new Set(cs.map(x => x.author_id))]) : { data: [] };
  const A = {}; (au || []).forEach(a => A[a.id] = a);
  box.replaceChildren();
  cs.forEach(x => {
    const r = $(`<div class="cmt"><div class="h"></div><p></p><div class="small"><button class="linkbtn rp">Laporkan</button>${(x.author_id === me() || p.author_id === me()) ? ' · <button class="linkbtn dl">Hapus</button>' : ''}</div></div>`);
    r.querySelector('.h').append(nameRow(A[x.author_id], fmt(x.created_at)));
    r.querySelector('p').textContent = x.body;
    r.querySelector('.rp').onclick = () => report({ comment_id: x.id });
    const d = r.querySelector('.dl'); if (d) d.onclick = async () => { const { error: e } = await c.from('comments').delete().eq('id', x.id); if (e) toast(friendly(e)); else r.remove(); };
    box.append(r);
  });
  const f = $(`<div class="formrow"><div class="field"><textarea maxlength="280" rows="2" placeholder="Tulis komentar yang baik…"></textarea></div><button class="btn mini">Kirim</button></div>`);
  const ta = f.querySelector('textarea'); const err = $(`<p class="err"></p>`);
  f.querySelector('button').onclick = async () => {
    const body = ta.value.trim(); if (!body) return;
    const { error: e } = await c.from('comments').insert({ post_id: p.id, author_id: me(), body });
    if (e) { err.textContent = friendly(e); return; }
    logActivity('comment', { post: p.id }); ta.value = ''; counter.textContent = '💬 ' + (cs.length + 1) + ' komentar'; loadComments(p, box, counter);
  };
  box.append(f, err);
}

function report(target) {
  const ov = $(`<div class="celebrate askparent"><div class="frame" style="max-width:360px;width:100%"><b>Laporkan</b>
    <p class="small">Kenapa ini tidak pantas? Laporanmu dibaca admin. Kalau 3 orang melapor, kiriman otomatis disembunyikan.</p>
    <div class="opts">${['Kata-kata tidak baik', 'Mengejek orang lain', 'Bukan tentang agama', 'Lainnya'].map(r => `<button class="opt" data-r="${r}">${r}</button>`).join('')}</div>
    <button class="btn ghost block" id="x" style="margin-top:8px">Batal</button></div></div>`);
  ov.querySelector('#x').onclick = () => ov.remove();
  ov.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
    const c = await sb(); const { error } = await c.from('reports').insert({ reporter_id: me(), reason: b.dataset.r, ...target });
    ov.remove(); toast(error ? friendly(error) : 'Terima kasih, laporan terkirim.');
  });
  document.body.append(ov);
}

// ---------- composer ----------
async function learnedAyat() {
  const c = await sb();
  const { data } = await c.from('game_saves').select('state').eq('profile_id', me()).maybeSingle();
  const ay = Object.keys((data && data.state && data.state.ay) || {}).filter(k => data.state.ay[k]).sort();
  return ay.map(k => `quran:${+k.slice(0, 3)}:${+k.slice(3)}`);
}
export function composer(preset) {
  let chosen = null;
  const ov = $(`<div class="panel"><div class="wrap"><div class="ptop"><button class="btn ghost icon" style="width:44px;height:44px;padding:0" aria-label="Tutup">✕</button><div class="t"><b>Tulis kiriman</b><span>Setiap kiriman harus mengutip ayat atau hadis</span></div></div>
    <div class="frame step1"><h3 style="margin:0 0 6px">1. Pilih sumber</h3>
      <div class="ptab"><button data-m="kebun" class="on">Dari kebunmu</button><button data-m="cari">Cari</button><button data-m="surat">Al-Qur'an</button></div>
      <div class="picker"></div></div>
    <div class="frame step2" style="margin-top:12px" hidden><h3 style="margin:0 0 6px">2. Tulis renunganmu</h3><div class="chosen"></div>
      <p class="small prompt" style="margin:8px 0 4px"></p>
      <textarea class="refl" maxlength="500" rows="5" style="width:100%;font:inherit;font-size:17px;padding:8px;border:3px solid var(--ink);border-radius:4px"></textarea>
      <div class="small" style="text-align:right"><span class="cnt">0</span>/500</div>
      <button class="btn green block" id="send">Kirim</button><p class="err" id="err"></p></div></div></div>`);
  ov.querySelector('.ptop button').onclick = () => ov.remove();
  const picker = ov.querySelector('.picker'), step2 = ov.querySelector('.step2');
  const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  ov.querySelector('.prompt').textContent = prompt;
  const ta = ov.querySelector('.refl'); ta.placeholder = prompt;
  ta.oninput = () => ov.querySelector('.cnt').textContent = ta.value.length;
  const choose = src => {
    chosen = src; step2.hidden = false;
    ov.querySelector('.chosen').replaceChildren(sourceCard(src));
    setTimeout(() => step2.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const listSources = (srcs) => {
    const w = $(`<div class="srclist"></div>`);
    if (!srcs.length) w.append($(`<p class="small">Tidak ada hasil.</p>`));
    srcs.forEach(s => { const b = $(`<button class="srcpick"><b></b><span></span></button>`); b.querySelector('b').textContent = s.ref_label; b.querySelector('span').textContent = (matn(s) || s.indonesian).slice(0, 110) + '…'; b.onclick = () => choose(s); w.append(b); });
    return w;
  };
  let modeTok = 0;
  const modes = {
    async kebun() {
      picker.replaceChildren($(`<span class="spinner"></span>`));
      const tok = ++modeTok;
      const ids = await learnedAyat();
      if (tok !== modeTok) return;
      if (!ids.length) { picker.replaceChildren($(`<p class="small">Belum ada ayat yang kamu pelajari di kebun. Pakai tab <b>Cari</b> atau <b>Al-Qur'an</b>.</p>`)); return; }
      const S = await getSources(ids);
      if (tok !== modeTok) return;
      picker.replaceChildren(listSources(ids.map(i => S[i]).filter(Boolean)));
    },
    cari() {
      const f = $(`<div><div class="formrow"><div class="field"><input placeholder="mis. sabar, tetangga, senyum" autocomplete="off"></div><button class="btn mini">Cari</button></div><div class="res"></div></div>`);
      const go = async () => {
        const q = f.querySelector('input').value.trim(); if (!q) return; const res = f.querySelector('.res');
        res.replaceChildren($(`<span class="spinner"></span>`));
        const c = await sb(); const { data, error } = await c.from('sources').select('id, kind, ref_label, arabic, indonesian, attribution').textSearch('search', q, { type: 'websearch', config: 'simple' }).limit(25);
        res.replaceChildren(error ? $(`<p class="err">${esc(friendly(error))}</p>`) : listSources(data || []));
      };
      f.querySelector('button').onclick = go; f.querySelector('input').onkeydown = e => { if (e.key === 'Enter') go(); };
      picker.replaceChildren(f); f.querySelector('input').focus();
    },
    surat() {
      const f = $(`<div class="formrow"><div class="field"><label>Nomor surat (1–114)</label><input class="s" inputmode="numeric" maxlength="3" value="112"></div><div class="field"><label>Ayat</label><input class="a" inputmode="numeric" maxlength="3" value="1"></div><button class="btn mini">Tampilkan</button></div>`);
      const res = $(`<div></div>`);
      f.querySelector('button').onclick = async () => {
        const id = `quran:${+f.querySelector('.s').value}:${+f.querySelector('.a').value}`;
        const S = await getSources([id]); res.replaceChildren(S[id] ? listSources([S[id]]) : $(`<p class="small">Ayat tidak ditemukan.</p>`));
      };
      picker.replaceChildren(f, res);
    },
  };
  ov.querySelectorAll('.step1 .ptab button').forEach(b => b.onclick = () => { modeTok++; ov.querySelectorAll('.step1 .ptab button').forEach(x => x.classList.toggle('on', x === b)); modes[b.dataset.m](); });
  ov.querySelector('#send').onclick = async () => {
    const err = ov.querySelector('#err'), body = ta.value.trim();
    if (!chosen) { err.textContent = 'Pilih sumbernya dulu, ya.'; return; }
    if (!body) { err.textContent = 'Tulis renunganmu dulu.'; return; }
    const btn = ov.querySelector('#send'); btn.disabled = true;
    const c = await sb(); const { error } = await c.from('posts').insert({ author_id: me(), source_id: chosen.id, body });
    if (error) { btn.disabled = false; err.textContent = friendly(error); return; }
    logActivity('post', { source: chosen.id }); ov.remove(); toast('Kiriman terkirim. Barakallah!');
    if (location.hash.startsWith('#/beranda')) feedPage(location.hash.split('/')[2] || 'ikuti'); else location.hash = '#/beranda';
  };
  document.getElementById('layer').replaceChildren(ov);
  if (preset) choose(preset); else modes.kebun();
}

// ---------- profile ----------
export async function profilePage(id) {
  id = id || me();
  const body = page('Profil', 'profil');
  await loadTiers();
  const c = await sb();
  const [{ data: p }, { data: fp }, { data: fol }, { data: fers }, { data: posts }] = await Promise.all([
    c.from('profiles').select('id, display_name, avatar, supporter_tier, supporter_until, supporter_mult, role').eq('id', id).maybeSingle(),
    c.from('farm_public').select('level, surahs_done, snapshot').eq('profile_id', id).maybeSingle(),
    c.from('follows').select('followee_id').eq('follower_id', me()).eq('followee_id', id),
    c.from('follows').select('follower_id', { count: 'exact' }).eq('followee_id', id),
    c.from('posts').select('id, author_id, source_id, body, hidden, created_at').eq('author_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!p) { body.append($(`<div class="banner">Profil ini tidak bisa dilihat.</div>`)); return; }
  const isMe = id === me(), following = fol && fol.length > 0;
  const head = $(`<div class="frame" style="margin-bottom:12px"><div style="display:flex;gap:12px;align-items:center"><div class="ic"></div><div style="flex:1"><b class="nm" style="font-size:22px"></b><span class="bd"></span>
    <div class="stats" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"><span class="pill">Lv ${(fp && fp.level) || 1}</span><span class="pill">${(fp && fp.surahs_done) || 0}/10 surat</span><span class="pill">${(fers || []).length} pengikut</span></div></div></div>
    <div class="row acts" style="margin-top:10px"></div></div>`);
  head.querySelector('.ic').append(avatarCanvas(p.avatar, 0.6));
  head.querySelector('.nm').textContent = p.display_name; head.querySelector('.bd').innerHTML = badgeFor(p, true);
  const acts = head.querySelector('.acts');
  if (!isMe) {
    const fb = $(`<button class="btn ${following ? 'ghost' : 'green'}">${following ? '✓ Mengikuti' : '➕ Ikuti'}</button>`);
    fb.onclick = async () => {
      const { error } = following ? await c.from('follows').delete().match({ follower_id: me(), followee_id: id }) : await c.from('follows').insert({ follower_id: me(), followee_id: id });
      if (error) { toast(friendly(error)); return; }
      if (!following) logActivity('follow', { who: id, name: p.display_name });
      profilePage(id);
    };
    acts.append(fb);
    if (p.role === session.profile.role) {
      acts.append($(`<a class="btn blue" href="#/kunjungi/${id}">🏡 Kunjungi kebun</a>`));
      import('./online.js').then(async o => {
        await o.joinOnline();
        const add = () => { if (!o.onlineIds().has(id) || acts.querySelector('.race')) return;
          const b = $(`<button class="btn race">🏁 Ajak lomba</button>`);
          b.onclick = async () => { const room = String(1000 + Math.floor(Math.random() * 9000)); await o.sendInvite(id, room); location.hash = '#/lomba/' + room; };
          acts.append(b); };
        o.onOnlineChange(add); add();
      });
    }
  } else acts.append($(`<a class="btn green" href="#/">🌱 Ke kebunku</a>`));
  body.append(head, $(`<h3 style="color:#fff;text-shadow:1px 1px 0 var(--ink)">Kiriman</h3>`));
  const list = $(`<div class="feed"></div>`);
  if (!posts || !posts.length) list.append($(`<p class="start-note">Belum ada kiriman.</p>`));
  else for (const el of await postCards(posts)) list.append(el);
  body.append(list);
  if (isMe) {
    const { data: following2 } = await c.from('follows').select('followee_id').eq('follower_id', me());
    if (following2 && following2.length) {
      const { data: ppl } = await c.from('profiles').select('id, display_name, avatar, supporter_tier, supporter_until, supporter_mult').in('id', following2.map(f => f.followee_id));
      const box = $(`<div class="frame" style="margin-top:12px"><b>Yang kamu ikuti</b><div class="ppl"></div></div>`);
      (ppl || []).forEach(x => box.querySelector('.ppl').append(nameRow(x, '')));
      body.append(box);
    }
  }
}
