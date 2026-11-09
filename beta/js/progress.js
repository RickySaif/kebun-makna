// progress.js — split verbatim from the classic single-file game (Phase 0).
import { sfx, voice } from './audio.js';
import { BOSS, BY, EVENTS, HOUSE_TIERS, LV_XP, MTITLE, ORDER, PERKS, QUEST, SLV_NAMES, TITLES, VTIERS } from './data.js';
import { celebrate, suratUtuh } from './lesson.js';
import { ICON } from './render.js';
import { S, activeEvent, done, lv, save, surahDone, words } from './state.js';
import { $, esc, layer, panel } from './ui.js';

export function levelOf(xp){let l=1;for(let i=2;i<LV_XP.length;i++) if(xp>=LV_XP[i]) l=i; return l;}
export const pLevel=()=>levelOf(S.xp||0);
export const perk=l=>pLevel()>=l;
export let NOTES=[];
export function note(title,sub,img){NOTES.push({title,sub,img});}
export function flushNotes(){ if(!NOTES.length||document.querySelector('.celebrate')||layer.children.length) return; const n=NOTES.shift(); sfx.fanfare(); voice('winner'); celebrate(n.title,n.sub,n.img,()=>{ const c=document.getElementById('coins'); if(c) c.textContent=S.coins; const l=document.getElementById('lvl'); if(l) l.firstChild.textContent='Lv '+pLevel(); setTimeout(flushNotes,200); }); }
export function xpPop(n){ const c=$(`<div class="xppop">+${n} XP</div>`); document.body.append(c); setTimeout(()=>c.remove(),1300); }
export function addXP(n){ if(!n||n<=0) return; const before=pLevel(); S.xp=(S.xp||0)+n; save(); xpPop(n); const after=pLevel();
  for(let l=before+1;l<=after;l++){ const un=[]; if(PERKS[l]) un.push(PERKS[l]); HOUSE_TIERS.forEach(h=>{ if(h.lv===l) un.push(`${h.name} bisa dibangun (${h.cost} koin, lewat menu Rumah)`); });
    note(`Naik ke Level ${l}!`,`Kamu sekarang ${TITLES[l]}.${un.length?' Terbuka: '+un.join('. ')+'.':''}`,ICON.star); }
  checkSurahLevels(); }
export function repXP(key,base){ S.rep=S.rep||{}; const r=S.rep[key]; const cnt=(r&&r.d===S.day)?r.c:0; S.rep[key]={d:S.day,c:cnt+1}; return cnt===0?base:cnt===1?Math.round(base/2):0; }
export function surahLevel(no){ const s=BY[no]; if(!s.ayat.every(a=>S.ay[a.a])) return 0; if(!(S.whole&&S.whole[no])) return 1;
  if(((S.reviews||{})[no]||0)<3) return 2;
  const u=new Map(); words(no).forEach(w=>{const k=w.ar+'|'+w.id; u.set(k,Math.max(u.get(k)||0,lv(w.a)));}); const vals=[...u.values()];
  if(vals.filter(v=>v>=3).length/vals.length<0.8) return 3;
  if(s.ayat.every(a=>(S.stars[a.a]||0)>=3)&&((S.wholeStars||{})[no]||0)>=3) return 5; return 4; }
export const slvHint=(no,l)=>l>=5?'Level tertinggi! Tanamanmu jadi tanaman emas.':'Berikutnya: '+['selesaikan semua ayat.','selesaikan Surat Utuh.','ulangi surat ini 3 kali (menyiram atau Surat Utuh).','jadikan 80% kartu kata surat ini emas.','dapatkan 3 bintang di semua ayat dan Surat Utuh.'][l];
export function checkSurahLevels(silent){ S.slv=S.slv||{}; ORDER.forEach(no=>{ const l=surahLevel(no), prev=S.slv[no]||0; if(l>prev){ S.slv[no]=l; if(!silent&&l>=2) note(`${BY[no].name} naik ke Level ${l}: ${SLV_NAMES[l]}!`,slvHint(no,l)+(l===3?' Tanaman '+QUEST[no].cropName+' lebih sering panen jumbo.':''),ICON.crop(no)); } }); save(); }
export function addReview(no){ S.reviews=S.reviews||{}; S.reviews[no]=(S.reviews[no]||0)+1; save(); checkSurahLevels(); }
export const canBuild=()=>{ const nx=HOUSE_TIERS[S.house+1]; return !!nx&&!S.building&&pLevel()>=nx.lv; };
export const renoOpen=()=>!!S.solved[107];
export function renoNext(no){ const t=(S.vh||{})[no]||0; const nx=VTIERS[t+1]; if(!nx) return null; return {tier:t+1,...nx,ok:(S.slv[no]||0)>=nx.slv}; }
export const renoReady=no=>{ if(!renoOpen()) return false; const r=renoNext(no); return !!r&&r.ok&&S.coins>=r.cost; };

/* ---------- Jurnal Misi ---------- */
export function journal(){
  panel('Jurnal Misi',`Level ${pLevel()} · ${TITLES[pLevel()]} · ${S.xp||0} XP`,v=>{
    const L=pLevel(), next=LV_XP[L+1];
    v.append($(`<div class="box"><h3>Level Petani ${L}: ${TITLES[L]}</h3><div class="xpbar"><div style="width:${next?Math.min(100,((S.xp-LV_XP[L])/(next-LV_XP[L]))*100):100}%"></div></div><p class="small" style="margin:6px 0 0">${next?`${next-S.xp} XP lagi ke Level ${L+1}${PERKS[L+1]?` · hadiah: ${PERKS[L+1]}`:''}${HOUSE_TIERS.find(h=>h.lv===L+1)?` · ${HOUSE_TIERS.find(h=>h.lv===L+1).name} bisa dibangun`:''}`:'Level tertinggi!'}</p></div>`));
    const e=activeEvent();
    EVENTS.forEach((ev,i)=>{
      const unlocked=done(ev)||ev===e; const isNum=typeof ev==='number';
      if(!unlocked){ v.append($(`<div class="box mission lock"><h3>??? Misi ${i+1}</h3><p class="small" style="margin:0">Terbuka setelah misi sebelumnya selesai.</p></div>`)); return; }
      if(!isNum){ v.append($(`<div class="box mission${ev===e?' cur':''}"><h3>${done(ev)?'✔':'⚔'} ${MTITLE[ev]}</h3><p class="small" style="margin:0">${done(ev)?'Selesai! Main lagi dari Lemari Piala di rumah.':'Misi besar! Hampiri '+BOSS[ev].giver.npc+' yang bertanda seru (!).'}</p></div>`)); return; }
      const no=ev, s=BY[no], Q=QUEST[no], nA=s.ayat.filter(a=>S.ay[a.a]).length, sl=S.slv[no]||0;
      const obj=[[`Dengar masalah ${Q.npc}`,!!(S.arrived&&S.arrived[no])||nA>0],[`Pelajari ${s.ayat.length} ayat (${nA}/${s.ayat.length})`,nA===s.ayat.length],['Surat Utuh: cerita, urutan ayat, jelaskan ke warga',!!S.whole[no]],[`Tanam Benih ${Q.cropName}`,!!(S.bought&&S.bought[no])],[`Panen ${Q.cropName} pertama`,(S.basket[no]||0)>0]];
      const box=$(`<div class="box mission${ev===e?' cur':''}"><h3>${done(ev)?'✔':'📜'} ${MTITLE[no]} <span class="small" style="color:#6A4E36">· Surat ${s.name}</span></h3>
        <ul class="milestones">${obj.map(([t,d])=>`<li><b>${d?'☑':'☐'}</b>${esc(t)}</li>`).join('')}</ul>
        <p class="small" style="margin:8px 0 0">Level Pemahaman: <b>${'★'.repeat(sl)}${'☆'.repeat(5-sl)}</b> ${SLV_NAMES[sl]}${sl>=1?' · '+slvHint(no,sl):''}</p></div>`);
      if(surahDone(no)){ const b=$(`<button class="btn blue" style="margin-top:8px">${S.whole[no]?'Ulangi Surat Utuh':'Mulai Surat Utuh'} ▸</button>`); b.onclick=()=>suratUtuh(no,!!S.solved[no]); box.append(b); }
      v.append(box); });
  });
}

