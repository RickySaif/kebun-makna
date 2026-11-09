// ui.js — split verbatim from the classic single-file game (Phase 0).
import { stopAudio } from './audio.js';
import { farm } from './farm.js';
import { S } from './state.js';


/* ---------- helpers ---------- */
export const $=h=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstElementChild;};
export const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
export const pick=a=>a[Math.floor(Math.random()*a.length)];
export let tT;export function toast(m){const t=document.getElementById('toast');t.textContent=m;t.hidden=false;clearTimeout(tT);tT=setTimeout(()=>t.hidden=true,2600);}
export const root=document.getElementById('root'), layer=document.getElementById('layer');
export const praiseLine=()=>pick([`MasyaAllah, hebat sekali, ${S.name}!`,`Bagus sekali, ${S.name}! Barakallah!`,`Kerja bagus, ${S.name}!`,`Luar biasa, ${S.name}!`]);
export const clockStr=()=>{const m=360+Math.floor(S.min);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
export function comboPop(n){ const c=$(`<div class="combo pop">COMBO ×${n}!</div>`); document.body.append(c); setTimeout(()=>c.remove(),1100); }

/* ---------- panels ---------- */
export function panel(title,sub,build,onClose){
  const p=$(`<div class="panel"><div class="wrap"><div class="ptop"><button class="btn ghost icon" style="width:44px;height:44px;padding:0" aria-label="Kembali">◂</button><div class="t"><b>${esc(title)}</b><span>${esc(sub)}</span></div></div><div class="pbody"></div></div></div>`);
  p.querySelector('button').onclick=()=>{closePanel(); onClose?onClose():farm();};
  build(p.querySelector('.pbody'),p);
  layer.replaceChildren(p); p.scrollTop=0;
  return p;
}
export function closePanel(){stopAudio();layer.replaceChildren();}

