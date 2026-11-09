// badges.js — supporter badges from `supporter_tiers` (falls back to the known tiers offline).
import { sb } from './api.js';
import { esc } from './ui.js';

let TIERS = [
  { tier: 1, name: 'Penanam', min_total_idr: 25000, badge: '🌱' },
  { tier: 2, name: 'Perawat Kebun', min_total_idr: 100000, badge: '🌳' },
  { tier: 3, name: 'Penjaga Desa', min_total_idr: 500000, badge: '🏡' },
  { tier: 4, name: 'Sahabat Kebun Makna', min_total_idr: 1000000, badge: '🌟' },
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
/** HTML snippet for a name badge; withName adds the tier name. */
export function badgeFor(t, withName = false) {
  const x = tierInfo(t | 0);
  if (!x) return '';
  return `<span class="badge" title="Pendukung: ${esc(x.name)}">${x.badge}${withName ? ' ' + esc(x.name) : ''}</span>`;
}
