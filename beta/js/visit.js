// visit.js — Phase 4 farm visits: render a friend's farm_public snapshot read-only with the game renderer,
// water one plant (once a day per friend) or send a preset salam. Owners get notified on their next load.
import { $, esc, root, toast } from './ui.js';
import { S, fresh, setS, setSaveKey, setSaveHook } from './state.js';
import { ORDER, QUEST } from './data.js';
import { T, VC, VR } from './render.js';
import { startVisitView, visitWalk, visitCam } from './farm.js';
import { sb, session, friendly, logActivity } from './api.js';
import { badgeFor, loadTiers } from './badges.js';
import { tabBar } from './social.js';

export const SALAM = [
  { k: 'assalamualaikum', t: "Assalamu'alaikum! 👋" },
  { k: 'masyaallah', t: 'MasyaAllah, kebunmu indah! 🌟' },
  { k: 'barakallah', t: 'Barakallah! 🤲' },
  { k: 'semangat', t: 'Semangat menghafal! 💪' },
  { k: 'jazakallah', t: 'Jazakallah khairan! 🌱' },
];

function snapshotState(snap, visitorAvatar) {
  const st = fresh();
  st.name = 'tamu'; st.avatar = visitorAvatar | 0; st.min = 120; st.day = snap.day || 1;
  st.house = snap.house || 0;
  st.plots = Array.from({ length: 18 }, (_, i) => { const p = (snap.plots || [])[i]; return p && QUEST[p.no] ? { no: p.no, days: p.days | 0, watered: !!p.watered } : null; });
  st.solved = {}; (snap.solved || []).forEach(n => st.solved[n] = true);
  st.trophies = {}; (snap.trophies || []).forEach(b => st.trophies[b] = true);
  st.vh = snap.vh || {}; st.slv = snap.slv || {};
  st.bought = {}; ORDER.forEach(n => st.bought[n] = true); // no "BARU" seed badge
  st.arrived = {}; st.coins = 0; st.chest = false; st.xp = 0; st.hv2 = true;
  return st;
}

export async function visitPage(id) {
  // never let the visited farm be saved anywhere
  setSaveHook(null); setSaveKey('kebun-makna-visit-scratch');
  document.body.querySelectorAll('nav.tabbar').forEach(n => n.remove());
  document.body.append(tabBar('profil')); document.body.classList.add('has-tabs');
  root.replaceChildren($(`<div class="dash"><h2>Berkunjung…</h2><div class="frame"><span class="spinner"></span></div></div>`));
  await loadTiers();
  const c = await sb();
  const [{ data: owner }, { data: fp }] = await Promise.all([
    c.from('profiles').select('id, display_name, avatar, supporter_tier, supporter_until, role').eq('id', id).maybeSingle(),
    c.from('farm_public').select('snapshot, level, surahs_done').eq('profile_id', id).maybeSingle(),
  ]);
  if (!owner || owner.role !== session.profile.role || id === session.user.id) {
    root.replaceChildren($(`<div class="dash"><h2>Kunjungan</h2><div class="banner">Kebun ini tidak bisa dikunjungi.</div></div>`)); return;
  }
  if (!fp) { root.replaceChildren($(`<div class="dash"><h2>Kunjungan</h2><div class="banner">${esc(owner.display_name)} belum mulai berkebun.</div></div>`)); return; }
  setS(snapshotState(fp.snapshot || {}, session.profile.avatar));
  const w = $(`<div class="dash"><div class="hud"><div class="grow">🏡 Kebun <b class="nm"></b><span class="bd"></span></div><span class="pill">Lv ${fp.level || 1}</span></div>
    <div class="stage" style="margin-top:8px"><canvas id="farm" width="${VC * T}" height="${VR * T}" aria-label="Kebun teman"></canvas></div>
    <div class="frame" style="margin-top:10px"><p class="small" style="margin:0 0 8px">Ketuk tanah untuk berjalan-jalan. Kamu tidak bisa mengubah kebun teman, tapi bisa menyiram satu tanaman sehari dan mengirim salam.</p>
      <button class="btn blue block" id="water">🌧️ Siram satu tanaman</button>
      <div class="small" style="margin:12px 0 6px"><b>Kirim salam</b></div><div class="salam" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      <p class="fb" id="fb" aria-live="polite"></p>
      <a class="linkbtn" href="#/profil/${esc(id)}">◂ Kembali ke profil</a></div></div>`);
  w.querySelector('.nm').textContent = owner.display_name; w.querySelector('.bd').innerHTML = badgeFor(owner);
  root.replaceChildren(w);
  const cv = w.querySelector('#farm');
  startVisitView(cv, { x: 2, y: 4 });
  cv.onclick = e => {
    const r = cv.getBoundingClientRect(), { camX, camY } = visitCam();
    visitWalk(Math.floor(((e.clientX - r.left) / r.width * VC * T + camX) / T), Math.floor(((e.clientY - r.top) / r.height * VR * T + camY) / T));
  };
  logActivity('visit', { owner: id, name: owner.display_name });
  const fb = w.querySelector('#fb');
  const thirsty = (fp.snapshot.plots || []).some(p => p && QUEST[p.no] && (p.days | 0) < QUEST[p.no].days);
  const wb = w.querySelector('#water');
  if (!thirsty) { wb.disabled = true; wb.textContent = '🌧️ Tidak ada tanaman yang perlu disiram'; }
  wb.onclick = async () => {
    wb.disabled = true;
    const { error } = await c.from('farm_interactions').insert({ visitor_id: session.user.id, owner_id: id, kind: 'water' });
    if (error) {
      fb.className = 'fb bad';
      fb.textContent = error.code === '23505' ? `Kamu sudah menyiram kebun ${owner.display_name} hari ini. Besok lagi, ya!` : friendly(error);
      return;
    }
    // show it on screen: water the first growing plant
    const i = S.plots.findIndex(p => p && p.days < QUEST[p.no].days && !p.watered); if (i >= 0) S.plots[i].watered = true;
    fb.className = 'fb good'; fb.textContent = `Kamu menyiram kebun ${owner.display_name}. Tanamannya akan tumbuh lebih cepat!`;
    logActivity('water', { owner: id }); toast('🌧️ Disiram!');
  };
  const sbox = w.querySelector('.salam');
  SALAM.forEach(x => {
    const b = $(`<button class="rx">${esc(x.t)}</button>`);
    b.onclick = async () => {
      const { error } = await c.from('farm_interactions').insert({ visitor_id: session.user.id, owner_id: id, kind: 'salam', preset: x.k });
      if (error) { fb.className = 'fb bad'; fb.textContent = error.code === '23505' ? 'Kamu sudah mengirim salam hari ini. Besok lagi, ya!' : friendly(error); return; }
      fb.className = 'fb good'; fb.textContent = `Salam terkirim ke ${owner.display_name}.`; logActivity('salam', { owner: id, preset: x.k });
    };
    sbox.append(b);
  });
}

/**
 * Owner side, called after the cloud save loads: friends' waterings since the last check each water one
 * thirsty plant (counts as today's watering), and a summary note is queued. Returns the lines for the dialog.
 */
export async function applyVisits(note) {
  if (!session.user) return [];
  try {
    const c = await sb();
    const since = S.visitSeen || new Date(Date.now() - 7 * 864e5).toISOString();
    const { data, error } = await c.from('farm_interactions').select('id, visitor_id, kind, preset, created_at')
      .eq('owner_id', session.user.id).gt('created_at', since).order('created_at');
    if (error || !data || !data.length) return [];
    const ids = [...new Set(data.map(d => d.visitor_id))];
    const { data: ppl } = await c.from('profiles').select('id, display_name').in('id', ids);
    const N = {}; (ppl || []).forEach(p => N[p.id] = p.display_name);
    const lines = [];
    for (const d of data) {
      const who = N[d.visitor_id] || 'Teman';
      if (d.kind === 'water') {
        const p = S.plots.find(p => p && QUEST[p.no] && p.days < QUEST[p.no].days && !p.watered);
        if (p) p.watered = true;
        lines.push(`🌧️ ${who} menyiram kebunmu${p ? ` (${QUEST[p.no].cropName})` : ''}.`);
      } else {
        const s = SALAM.find(x => x.k === d.preset);
        lines.push(`👋 ${who}: ${s ? s.t : 'Assalamu\'alaikum!'}`);
      }
    }
    S.visitSeen = data[data.length - 1].created_at;
    if (note && lines.length) note('Ada tamu di kebunmu!', lines.slice(-4).join(' '), null);
    return lines;
  } catch (e) { return []; }
}
