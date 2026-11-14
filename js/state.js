// state.js — split verbatim from the classic single-file game (Phase 0).
import { BY, EVENTS, ORDER, QUEST } from './data.js';


/* ---------- state ---------- */
export const KEY='kebun-makna-v3';
export const fresh=()=>({name:'',avatar:0,coins:0,day:1,min:0,ay:{},stars:{},lv:{},solved:{},seeds:{},plots:Array(18).fill(null),basket:{},pos:{x:2,y:4},
  unlockAll:false,sfx:true,voice:true,pendingPlant:null,house:0,trophies:{},chest:false,bestRace:0});
export let S=fresh();
export function setS(v){S=v;}
// v2: beta never writes the classic key (the live game shares this origin); guests start from a copy of it
export const GUEST_KEY=KEY+':beta-guest';
try{ let r=localStorage.getItem(GUEST_KEY)||localStorage.getItem(KEY);
  if(r){S=Object.assign(fresh(),JSON.parse(r));}
  else { const old=localStorage.getItem('kebun-makna-v2'); if(old){ const o=JSON.parse(old); S=Object.assign(fresh(),{name:o.name,avatar:o.avatar,coins:o.coins,ay:o.ay||{},lv:o.lv||{},solved:o.solved||{},seeds:o.seeds||{},basket:o.basket||{},pos:o.pos||{x:2,y:4},sfx:o.sfx!==false,pendingPlant:o.pendingPlant||null});
      S.plots=(o.plots||[]).map(p=>p?{no:p.no,days:Math.min(p.stage||0,QUEST[p.no].days),watered:false}:null); while(S.plots.length<6)S.plots.push(null); } } }catch(e){}
normalize();
// v2: normalisation shared by local load and cloud load
export function normalize(){
while(S.plots.length<18)S.plots.push(null);
if(!S.bought){S.bought={};ORDER.forEach(n=>{if((S.seeds[n]||0)>0||(S.basket[n]||0)>0||S.plots.some(p=>p&&p.no===n))S.bought[n]=true;});}
}
// v2: load a state object (from cloud or another cache) into S
export function loadState(raw){ S=Object.assign(fresh(),raw||{}); if(!Array.isArray(S.plots)) S.plots=Array(18).fill(null); normalize(); }
// v2: signed-in children save under their own key; guests keep the classic key. A hook syncs to the cloud.
let saveKey=GUEST_KEY, saveHook=null;
export function setSaveKey(k){saveKey=k;}
export function setSaveHook(f){saveHook=f;}
// trial mode (no account): nothing is written to the device
let persist=true; export function setPersist(v){persist=v;}
export function save(){if(persist){try{localStorage.setItem(saveKey,JSON.stringify(S))}catch(e){}} if(saveHook){try{saveHook()}catch(e){}}}
export const fill=t=>t.replaceAll('{n}',S.name||'kamu');
export const lv=k=>S.lv[k]||0;
export const bump=(k,t)=>{if(lv(k)<t){S.lv[k]=t;save();}};
export const surahDone=no=>BY[no].ayat.every(a=>S.ay[a.a]);
export const done=e=>typeof e==='number'?!!S.solved[e]:!!S.trophies[e];
export function activeEvent(){ for(let i=0;i<EVENTS.length;i++){const e=EVENTS[i]; if(!done(e)) return (S.unlockAll||i===0||done(EVENTS[i-1]))?e:null;} return null; }
export const words=no=>BY[no].ayat.flatMap(a=>a.w);
