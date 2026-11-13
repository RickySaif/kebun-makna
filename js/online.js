// online.js — presence of signed-in players per role (Realtime channel online:<role>) and race invites.
// Realtime channels are not RLS-gated, so role separation is enforced here: each role has its own channel and
// every payload's role is checked. Invites show a small dismissible banner; nothing ever navigates on its own.
import { $, esc } from './ui.js';
import { sb, session } from './api.js';

let ch = null, joined = null;
const listeners = new Set();
export const onlineIds = () => {
  if (!ch) return new Set();
  const st = ch.presenceState(); const ids = new Set();
  Object.values(st).forEach(arr => arr.forEach(m => { if (m.role === session.profile.role) ids.add(m.id); }));
  return ids;
};
export const onOnlineChange = f => { listeners.add(f); return () => listeners.delete(f); };

export async function joinOnline() {
  if (!session.user || !session.profile) return null;
  if (joined) return joined;
  joined = (async () => {
    const c = await sb();
    const role = session.profile.role;
    ch = c.channel('online:' + role, { config: { presence: { key: session.user.id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => listeners.forEach(f => f()));
    ch.on('broadcast', { event: 'invite' }, ({ payload }) => {
      if (!payload || payload.to !== session.user.id || payload.role !== role || !/^\d{4}$/.test(payload.room)) return;
      showInvite(payload);
    });
    await new Promise(res => ch.subscribe(st => { if (st === 'SUBSCRIBED') res(); }));
    await ch.track({ id: session.user.id, role, name: session.profile.display_name, avatar: session.profile.avatar | 0 });
    return ch;
  })();
  return joined;
}

export async function sendInvite(toId, room) {
  const c = await joinOnline(); if (!c) return;
  await c.send({ type: 'broadcast', event: 'invite', payload: { to: toId, from: session.user.id, name: session.profile.display_name, role: session.profile.role, room } });
}

function showInvite(p) {
  document.querySelectorAll('.invite-banner').forEach(x => x.remove());
  const b = $(`<div class="invite-banner"><span>🏁 <b></b> mengajakmu lomba!</span><a class="btn green mini" href="#/lomba/${esc(p.room)}">Ayo</a><button class="btn ghost mini">Nanti</button></div>`);
  b.querySelector('b').textContent = p.name || 'Teman';
  b.querySelector('button').onclick = () => b.remove();
  b.querySelector('a').onclick = () => b.remove();
  document.body.append(b);
  setTimeout(() => b.remove(), 30000);
}
