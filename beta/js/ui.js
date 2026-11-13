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

/* ---------- v4: fit every game screen to the phone's height (no vertical scroll) ----------
   A screen taller than the visible height is scaled down with CSS zoom (text re-wraps, taps keep working).
   If it would need to shrink below MIN_ZOOM it is a long list (shop, well, Buku Kata): it then scrolls instead.
   Covers: panels (lessons, practice, shop …), the celebration pop-up, and the start / onboarding screens.
   Parent dashboard and social pages (.dash) keep normal page scrolling. */
const MIN_ZOOM=0.62;
function fitOne(box,content,over){
  if(!content) return;
  content.style.zoom=''; box.classList.remove('scrolly');
  let z=1;
  for(let k=0;k<5;k++){ const o=over(); if(o.over<=1) return; z*=o.avail/(o.avail+o.over); if(z<MIN_ZOOM) break; content.style.zoom=z.toFixed(3); }
  if(over().over>1){ content.style.zoom=''; box.classList.add('scrolly'); }
}
function fitAll(){
  document.querySelectorAll('.panel').forEach(p=>{ const top=p.scrollTop; fitOne(p,p.querySelector(':scope > .wrap'),()=>({avail:p.clientHeight,over:p.scrollHeight-p.clientHeight})); p.scrollTop=top; });
  document.querySelectorAll('.celebrate').forEach(c=>fitOne(c,c.querySelector(':scope > .frame'),()=>{ const f=c.querySelector(':scope > .frame'), cs=getComputedStyle(c), pad=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom);
    return {avail:c.clientHeight-pad,over:f.getBoundingClientRect().height-(c.clientHeight-pad)}; }));
  const page=root.firstElementChild && !root.querySelector('.farmview,.dash') && !layer.firstElementChild;
  if(page) fitOne(document.documentElement,root,()=>({avail:innerHeight,over:document.scrollingElement.scrollHeight-innerHeight}));
  else if(root.style.zoom) root.style.zoom='';
}
// at most one fit per frame; never cancel a pending one (the farm clock changes the page every frame and would starve it)
let fitRaf=0;
export function fitSoon(){ if(!fitRaf) fitRaf=requestAnimationFrame(()=>{ fitRaf=0; fitAll(); }); }
new MutationObserver(ms=>{ if(ms.some(m=>{ const el=m.target.nodeType===1?m.target:m.target.parentElement; return !el || !el.closest('#dlg,.hud2,.hud'); })) fitSoon(); })
  .observe(document.body,{childList:true,subtree:true,characterData:true});
addEventListener('resize',fitSoon); if(window.visualViewport) visualViewport.addEventListener('resize',fitSoon);
if(document.fonts) document.fonts.ready.then(fitSoon);

