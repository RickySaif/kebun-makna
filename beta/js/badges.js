// badges.js — supporter badges from `supporter_tiers` (falls back to the known tiers offline).
import { sb } from './api.js';
import { esc } from './ui.js';

let TIERS = [
  { tier: 1, name: 'Penanam', min_total_idr: 15000, badge: '🌱' },
  { tier: 2, name: 'Perawat Kebun', min_total_idr: 50000, badge: '🌳' },
  { tier: 3, name: 'Penjaga Desa', min_total_idr: 150000, badge: '🏡' },
  { tier: 4, name: 'Sahabat Kebun Makna', min_total_idr: 310000, badge: '🌟' },
];
let loaded = false;
export async function loadTiers() {
  if (loaded) return TIERS;
  try {
    const c = await sb();
    const { data } = await c.from('supporter_tiers').select('tier, name, min_total_idr, badge').order('tier');
    if (data && data.length) TIERS = data;
    loaded = true;
  } catch (e) { /* keep fallback */ }
  return TIERS;
}
export const tiers = () => TIERS;
export const tierInfo = t => TIERS.find(x => x.tier === t) || null;
/** Is a profile's badge active? Badges last 30 days after the latest payment (Trakteer has no auto-renew). */
export function badgeActive(p) {
  if (!p || typeof p !== 'object') return true;
  return !!(p.supporter_until && new Date(p.supporter_until) > new Date());
}
/** HTML snippet for a name badge. `p` is a profile row ({supporter_tier, supporter_until}) or a tier number.
 *  A lapsed badge stays visible but greyed out. withName adds the tier name. */
export function badgeFor(p, withName = false) {
  const t = typeof p === 'object' && p ? p.supporter_tier : p;
  const x = tierInfo(t | 0);
  if (!x) return '';
  const on = badgeActive(p);
  const title = on ? `Pendukung: ${x.name}` : `Pendukung: ${x.name} (tidak aktif bulan ini)`;
  const style = on ? '' : ' style="filter:grayscale(1);opacity:.45"';
  return `<span class="badge${on ? '' : ' off'}" title="${esc(title)}"${style}>${x.badge}${withName ? ' ' + esc(x.name) + (on ? '' : ' (tidak aktif)') : ''}</span>`;
}
export const fmtDate = d => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
