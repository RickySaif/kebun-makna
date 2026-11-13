// audio.js — split verbatim from the classic single-file game (Phase 0).
import { AV } from './data.js';
import { S } from './state.js';


/* ---------- audio ---------- */
export const player=new Audio(); player.preload='auto';
export const vplayer=new Audio(); vplayer.preload='auto';
export let tok=0;
export function stopAudio(){tok++;try{player.pause()}catch(e){}}
export function play(src,onTime){return new Promise(res=>{const t=++tok;player.src=src;player.currentTime=0;let raf;
  const tick=()=>{if(t!==tok){cancelAnimationFrame(raf);return;} onTime&&onTime(player.currentTime*1000); raf=requestAnimationFrame(tick);};
  player.onended=()=>{cancelAnimationFrame(raf);res(true)}; player.onerror=()=>{cancelAnimationFrame(raf);res(false)};
  const p=player.play(); if(p&&p.catch)p.catch(()=>res(false)); if(onTime) raf=requestAnimationFrame(tick);});}
export function voice(name,delay=0){ if(!S.voice) return; setTimeout(()=>{try{vplayer.src=AV(name);vplayer.currentTime=0;const p=vplayer.play();p&&p.catch&&p.catch(()=>{});}catch(e){}},delay); }
export let actx=null;
export function tone(seq){ if(!S.sfx) return; try{actx=actx||new (window.AudioContext||window.webkitAudioContext)(); const t0=actx.currentTime+.02;
  seq.forEach(([f,st,du,type='square',vol=.07])=>{const o=actx.createOscillator(),g=actx.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(vol,t0+st);g.gain.exponentialRampToValueAtTime(.0001,t0+st+du);o.connect(g).connect(actx.destination);o.start(t0+st);o.stop(t0+st+du+.02);});}catch(e){} }
export const sfx={
  good:()=>tone([[784,0,.09],[1047,.08,.16]]),
  bad:()=>tone([[220,0,.18,'triangle',.12]]),
  coin:()=>tone([[988,0,.06],[1319,.06,.22]]),
  step:()=>tone([[140,0,.03,'triangle',.05]]),
  fanfare:()=>tone([[523,0,.12],[659,.12,.12],[784,.24,.12],[1047,.36,.36],[784,.36,.36,'triangle',.05],[1319,.74,.5,'square',.05]]),
  plant:()=>tone([[330,0,.08,'triangle',.12],[262,.09,.14,'triangle',.12]]),
  water:()=>tone([[1200,0,.05,'sine',.06],[900,.05,.05,'sine',.06],[1400,.1,.05,'sine',.06],[1000,.15,.08,'sine',.06]]),
  grow:()=>tone([[523,0,.08,'sine',.08],[659,.08,.08,'sine',.08],[880,.16,.2,'sine',.08]]),
  boost:()=>tone([[440,0,.05],[660,.04,.05],[990,.08,.1]]),
  chest:()=>tone([[392,0,.1],[523,.1,.1],[659,.2,.1],[1047,.3,.4],[1319,.45,.4,'triangle',.05]])
};
