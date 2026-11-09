// farm.js — split verbatim from the classic single-file game (Phase 0).
import { play, sfx, stopAudio, voice } from './audio.js';
import { cartGame, chase, pestGame, race } from './bosses.js';
import { AW, BOSS, BY, DATA, EVENTS, HOUSE_TIERS, KAKEK, LV_XP, ORDER, QUEST, SLV_NAMES, seedPrice } from './data.js';
import { celebrate, lesson, lessonStart, makeQ, renderQ, suratUtuh } from './lesson.js';
import { addReview, addXP, canBuild, flushNotes, journal, note, pLevel, perk, renoNext, renoOpen, renoReady, repXP } from './progress.js';
import { AVATARS, CHESTPOS, COLS, ENTRY, FRUIT, GATE, GATE2, ICON, LOTS, OBJ, PLOTS, ROWS, SPOT, T, VC, VR, adjacent, bfs, blocked, drawChest, drawCrop, drawFence, drawGate, drawGrass, drawHedge, drawHouse, drawHut, drawKid, drawLot, drawPath, drawPlotSoil, drawShop, drawSign, drawTree, drawTrophy, drawWell, eastOpen, evLook, evName, farOpen, giverNo, hitObject, homeOf, npcHere, portrait, px, stageOf, villagers } from './render.js';
import { S, activeEvent, done, fill, fresh, lv, save, setS, surahDone, words } from './state.js';
import { $, clockStr, closePanel, comboPop, esc, layer, panel, pick, root, toast } from './ui.js';

export let camX=0,camY=0;
export let walkers=[];
/* ---------- time: 1 game minute = 1 real second (Harvest Moon rule) ---------- */
export const DAY_END=16*60; // 06:00 + 16h = 22:00
export let sparkles=[];
export function paused(){ return layer.children.length>0 || !!document.querySelector('.celebrate,.sleepfade') || !document.getElementById('farm'); }
export function tickClock(dt){
  if(paused()) return;
  if(S.min>=DAY_END) return;
  S.min=Math.min(DAY_END,S.min+dt/1000);
  const el=document.getElementById('clk'); if(el) el.textContent=clockStr();
  if(S.min>=DAY_END){ save(); dialog(KAKEK,['Sudah jam 10 malam. Waktunya tidur! Tanaman yang sudah disiram akan tumbuh besok pagi.'],[['Tidur 💤',sleep,'green']]); }
}
setInterval(()=>save(),10000);
export function sleep(){
  const f=$(`<div class="sleepfade">💤</div>`); document.body.append(f); requestAnimationFrame(()=>f.classList.add('on'));
  setTimeout(()=>{
    const grown=[];
    S.plots.forEach((p,i)=>{ if(p&&p.watered){ p.days=Math.min(QUEST[p.no].days,p.days+1); p.watered=false; grown.push(i);} });
    S.day++; S.min=0; S.pos={x:2,y:4};
    const chest=!S.chest && Math.random()<0.6; if(chest) S.chest=true;
    let built=null; if(S.building){ S.house=S.building.tier; built=HOUSE_TIERS[S.house].name; S.building=null; }
    const gifts=[]; ORDER.forEach(n=>{ const t=(S.vh||{})[n]||0; if(t&&Math.random()<0.5){ const c=(2+Math.floor(Math.random()*4))*t; S.coins+=c; gifts.push(`${QUEST[n].npc} memberimu ${c} koin sebagai terima kasih.`);} });
    save();
    f.textContent=`Hari ke-${S.day} · 06:00`;
    setTimeout(()=>{ f.classList.remove('on'); setTimeout(()=>f.remove(),600);
      farm(); sparkles=grown.map(i=>({i,until:performance.now()+2500}));
      if(grown.length) sfx.grow();
      const lines=[];
      if(grown.length){ grown.forEach(i=>{const p=S.plots[i],Q=QUEST[p.no]; lines.push(p.days>=Q.days?`${Q.cropName}mu sudah siap dipanen!`:`${Q.cropName}mu tumbuh! ${Q.days-p.days} hari lagi sampai panen.`);}); }
      else lines.push('Selamat pagi! Tanaman hanya tumbuh kalau disiram sehari sebelumnya.');
      if(chest) lines.push('Ada peti hadiah di depan rumah! Hampiri dan buka.');
      gifts.forEach(x=>lines.push(x));
      if(built){ lines.unshift(`Selamat pagi! Rumah barumu sudah jadi: ${built}!`); note(`${built} sudah jadi!`,'Tukang sudah selesai membangun rumahmu. Lihat di peta!',ICON.star); addXP(20); setTimeout(flushNotes,300); }
      dialog(KAKEK,lines);
    },900);
  },700);
}

/* ---------- farm scene ---------- */
export let cv,ctx,me={x:2,y:4,fx:2,fy:4,path:[],onArrive:null},raf=null,lastStep=0,selPlot=-1,lastT=0;
export function villageProgress(){ const lab={boss1:'Tangkap maling sayur',boss2:'Ikut Lomba Mobil Desa',boss3:'Antar bekal anak yatim',boss4:'Usir hama ulat'};
  const list=EVENTS.map(e=>[typeof e==='number'?'Bantu '+QUEST[e].npc+' ('+BY[e].name+')':lab[e],done(e)]);
  return {list,done:list.filter(x=>x[1]).length,total:list.length}; }
export function farm(){
  stopAudio(); layer.replaceChildren();
  me.x=me.fx=S.pos.x; me.y=me.fy=S.pos.y; me.path=[];
  const vp=villageProgress();
  root.replaceChildren($(`<div>
    <div class="hud"><div class="grow">${esc(S.name)}</div>
      <div class="chip" title="Koin Makna"><img alt="" src="${ICON.coin}"><span id="coins">${S.coins}</span></div>
      <button class="chip lvchip" id="lvl" title="Level Petani">Lv ${pLevel()}<span class="minibar"><i style="width:${(()=>{const L=pLevel(),n=LV_XP[L+1];return n?Math.min(100,(S.xp-LV_XP[L])/(n-LV_XP[L])*100):100;})()}%"></i></span></button>
      <button class="btn ghost icon" id="jrn" aria-label="Jurnal Misi">📜</button>
      <button class="btn ghost icon" id="book" aria-label="Buku Kata">📖</button>
      <button class="btn ghost icon" id="gear" aria-label="Untuk orang tua">⚙</button></div>
    <div class="hud2"><div class="clock">Hari ${S.day} · <span id="clk">${clockStr()}</span></div>
      <div class="vbar"><span>Desa</span><div class="track"><div class="fillb" style="width:${vp.done/vp.total*100}%"></div></div><span>${vp.done}/${vp.total}</span></div></div>
    <div class="stage"><canvas id="farm" width="${VC*T}" height="${VR*T}" aria-label="Kebunmu. Ketuk tempat untuk berjalan."></canvas></div>
    <div class="frame dialog" id="dlg"></div>
    <p class="hint" style="color:#E9F7DF;text-shadow:1px 1px 0 #2B1D12;margin:8px 2px 0">Ketuk tanah untuk berjalan. Ketuk orang, toko, petak, peti, rumah, atau sumur untuk menghampirinya. Tidur di rumah untuk lompat ke pagi.</p></div>`));
  cv=document.getElementById('farm'); ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
  cv.onclick=onTap;
  document.getElementById('gear').onclick=parentView;
  document.getElementById('book').onclick=bookView;
  document.getElementById('jrn').onclick=journal; document.getElementById('lvl').onclick=journal;
  setTimeout(flushNotes,700);
  idleDialog();
  const e=activeEvent();
  if(S.pendingPlant) dialog(KAKEK,[`Kamu punya Benih ${QUEST[S.pendingPlant].cropName}! Jalan ke petak tanah yang kosong, lalu ketuk petaknya untuk menanam.`]);
  walkers=[];
  if(!introActive){ if(!S.pendingPlant) setTimeout(stepEvents,400); else setTimeout(()=>{ if(S.leaving) stepEvents(); },400); }
  cancelAnimationFrame(raf); lastT=performance.now(); loop(lastT);
}
export function loop(t){
  raf=requestAnimationFrame(loop);
  if(!document.getElementById('farm')){cancelAnimationFrame(raf);return;}
  const dt=Math.min(100,t-lastT); lastT=t; tickClock(dt);
  if(me.path.length){const [nx,ny]=me.path[0];const sp=perk(6)?0.18:0.12;me.fx+=Math.sign(nx-me.fx)*Math.min(sp,Math.abs(nx-me.fx));me.fy+=Math.sign(ny-me.fy)*Math.min(sp,Math.abs(ny-me.fy));
    if(Math.abs(me.fx-nx)<.01&&Math.abs(me.fy-ny)<.01){me.fx=nx;me.fy=ny;me.x=nx;me.y=ny;me.path.shift();if(t-lastStep>180){sfx.step();lastStep=t;}
      if(!me.path.length){S.pos={x:me.x,y:me.y};save();const f=me.onArrive;me.onArrive=null;f&&f();}}}
  walkers.forEach(w=>{ if(!w.path.length) return; const [nx,ny]=w.path[0]; const sp=0.07; w.fx+=Math.sign(nx-w.fx)*Math.min(sp,Math.abs(nx-w.fx)); w.fy+=Math.sign(ny-w.fy)*Math.min(sp,Math.abs(ny-w.fy)); if(Math.abs(w.fx-nx)<.01&&Math.abs(w.fy-ny)<.01){w.fx=nx;w.fy=ny;w.path.shift(); if(!w.path.length){ walkers=walkers.filter(x=>x!==w); w.done&&w.done(); }} });
  draw(t);
}
export function npcPath(from,to){ const key=(x,y)=>x+','+y; const q=[from],prev={[key(...from)]:null}; const ok=(x,y)=>!(x<=0||y<=0||x>=COLS-1||y>=ROWS-1)&&(!blocked(x,y)||(x===to[0]&&y===to[1]));
  while(q.length){const [x,y]=q.shift(); if(x===to[0]&&y===to[1]){const p=[];let k=key(x,y);while(k){p.unshift(k.split(',').map(Number));k=prev[k];}return p.slice(1);}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=key(nx,ny);if(!(k in prev)&&ok(nx,ny)){prev[k]=key(x,y);q.push([nx,ny]);}}}
  return [to]; }
export function startWalker(look,from,to,extra,done){ const w=Object.assign({look,fx:from[0],fy:from[1],path:npcPath(from,to),done},extra||{}); walkers.push(w); return w; }
export function stepEvents(){
  S.arrived=S.arrived||{};
  if(S.leaving){
    // jangan pergi selama masih ada percakapan di layar; tunggu sampai ditutup
    if(dlgBusy||introActive){ clearTimeout(leaveT); leaveT=setTimeout(()=>{ if(document.getElementById('farm')) stepEvents(); },500); return; }
    const L=S.leaving; S.leaving=null; save();
    const no=L.no; const target=no?homeOf(no):ENTRY;
    startWalker(no?QUEST[no].look:KAKEK.look,L.from,target,{no,mode:no?'home':'exit'},()=>{ if(no){sfx.good();toast(`${QUEST[no].npc} pulang ke rumah barunya di kampung.`);} stepEvents(); });
    return; }
  const e=activeEvent(); if(!e||S.arrived[e]||walkers.some(w=>w.e===e)) return;
  const gn=giverNo(e); const from=(typeof e==='string'&&gn&&S.solved[gn])?homeOf(gn):ENTRY;
  const name=evName(e);
  if(dlgBusy) toast(typeof e==='number'?`Ada warga baru datang: ${name}!`:`${name} berlari ke arahmu!`);
  else if(typeof e==='number') dialog(KAKEK,[`Lihat! Ada warga baru datang ke desa: ${name}. Sepertinya dia sedang punya masalah.`]);
  else dialog(BOSS[e].giver,[`${S.name}! ${S.name}! Tunggu, aku datang!`]);
  startWalker(evLook(e),from,SPOT[e],{e,no:gn&&typeof e==='string'?gn:null},()=>{ S.arrived[e]=true; save(); sfx.coin();
    if(dlgBusy) return;
    if(typeof e==='number') dialog(QUEST[e],[`Halo! Aku ${name}. Bisa ke sini sebentar? Ketuk aku, ya.`]);
    else dialog(BOSS[e].giver,[`${S.name}, cepat ke sini! Ada kejadian besar! Ketuk aku.`]); });
}
export function draw(t){
  const c=ctx;
  const tx=me.fx*T+8-VC*T/2, ty=me.fy*T+8-VR*T/2;
  camX=Math.round(Math.max(0,Math.min(COLS*T-VC*T,tx))); camY=Math.round(Math.max(0,Math.min(ROWS*T-VR*T,ty)));
  c.setTransform(1,0,0,1,-camX,-camY);
  drawGrass(c);
  for(let x=1;x<=25;x++){drawPath(c,x,4);} for(let x=1;x<=19;x++)drawPath(c,x,13); drawPath(c,9,3); for(let y=5;y<=14;y++)drawPath(c,23,y);
  for(let y=5;y<=12;y++){drawPath(c,3,y);drawPath(c,6,y);drawPath(c,14,y);drawPath(c,17,y);}
  for(let y=1;y<=10;y++) if(y!==4) drawHedge(c,11,y);
  drawGate(c,GATE.x,GATE.y,eastOpen());
  for(let y=1;y<=15;y++) if(y!==4) drawHedge(c,20,y);
  drawGate(c,GATE2.x,GATE2.y,farOpen());
  FRUIT.forEach(([a,b])=>{drawTree(c,a*T,b*T,1);px(c,a*T+4,b*T+4,2,2,'#F4B400');px(c,a*T+10,b*T+7,2,2,'#E2483B');});
  LOTS.forEach(([hx,hy],i)=>{const v=villagers()[i]; if(v&&!walkers.some(w=>w.no===v.no&&w.mode==='home')){ const X=hx*T,Y=hy*T,tier=(S.vh||{})[v.no]||0; drawHut(c,X,Y,['#C8463A','#3A78C9','#3A9D6A','#8D5BB5','#B8862B','#E0702F','#5B7FD9','#E56B8A','#8E6A3A','#3AA6A0'][i%10],tier>=1?'#FFF6DC':'#F2E2C0');
      if(tier>=1){ px(c,X+3,Y+21,8,2,'#8E5A33'); px(c,X+22,Y+21,8,2,'#8E5A33'); [4,7,23,26].forEach(o=>px(c,X+o,Y+19,2,2,o<20?'#E56B8A':'#F4C430')); px(c,X,Y+29,32,1,'#A86B3C'); }
      if(tier>=2){ px(c,X,Y+10,32,1,'#F4B400'); const night=S.min>=12*60; px(c,X+11,Y+16,2,4,night?'#FFE07A':'#C9A465'); if(night){c.fillStyle='rgba(255,224,122,.22)';c.fillRect(X+6,Y+12,12,12);} }
      if(renoReady(v.no)){ const b=Math.floor(t/300)%2; px(c,X+3,Y-6+b,26,9,'#3A78C9'); px(c,X+4,Y-5+b,24,7,'#5B95E0'); c.fillStyle='#fff'; c.font='bold 7px monospace'; c.fillText('BANTU',X+6,Y+1+b); }
      if(renoFx&&renoFx.no===v.no&&renoFx.until>t){ for(let k=0;k<10;k++){const ang=k/10*Math.PI*2+t/250,r=10+((t/50)%10);px(c,X+16+Math.round(Math.cos(ang)*r),Y+16+Math.round(Math.sin(ang)*r),2,2,k%2?'#FFF6A0':'#FFFFFF');}} }
    else drawLot(c,hx*T,hy*T);});
  for(let x=0;x<COLS;x++){drawTree(c,x*T,0,x%4===1);drawTree(c,x*T,(ROWS-1)*T,x%5===2);} for(let y=1;y<ROWS-1;y++){drawTree(c,0,y*T,0);drawTree(c,(COLS-1)*T,y*T,y%3===0);}
  if(!eastOpen()){c.fillStyle='rgba(30,40,20,.35)';c.fillRect(12*T,1*T,8*T,10*T);}
  if(!farOpen()){c.fillStyle='rgba(30,40,20,.35)';c.fillRect(21*T,1*T,5*T,15*T);}
  if(S.house>=2) drawFence(c);
  drawHouse(c,1,1,S.house>=3?2:S.house>=1?1:0,t);
  if(S.house>=4){ const night=S.min>=12*60; [[0.5,3.2],[3.6,3.2]].forEach(([x,y])=>{const X=Math.round(x*T),Y=Math.round(y*T);px(c,X+5,Y,2,9,'#5A3820');px(c,X+3,Y-3,6,4,night?'#FFE07A':'#C9A465');if(night){c.fillStyle='rgba(255,224,122,.25)';c.fillRect(X-1,Y-7,14,12);}}); [[1,4],[3,4]].forEach(([x,y])=>{px(c,x*T+2,y*T+11,12,4,'#4CA63C');px(c,x*T+3,y*T+10,2,2,'#E56B8A');px(c,x*T+8,y*T+10,2,2,'#F4C430');px(c,x*T+12,y*T+11,2,2,'#FFFFFF');}); }
  if(S.building){ for(let i=0;i<4;i++){px(c,1*T+2+i*14,1*T+4,2,44,'#A86B3C');} px(c,1*T,1*T+18,48,2,'#A86B3C'); px(c,1*T,1*T+34,48,2,'#A86B3C'); const d=Math.floor(t/200)%3; px(c,1*T+10+d*8,1*T+44-d*3,4,3,'rgba(220,200,160,.9)'); }
  if(canBuild()){ const b=Math.floor(t/300)%2,X=1*T+8,Y=1*T-8+b; px(c,X,Y,34,9,'#2F8F3A'); px(c,X+1,Y+1,32,7,'#3FAE4C'); px(c,X+14,Y+9,4,2,'#2F8F3A'); c.fillStyle='#FFFFFF'; c.font='bold 7px monospace'; c.fillText('BANGUN',X+4,Y+7); } drawShop(c,8,1);
  if(anyNewSeed()){const b=Math.floor(t/300)%2,X=8*T+10,Y=1*T-6+b;px(c,X,Y,28,9,'#C8463A');px(c,X+1,Y+1,26,7,'#E2483B');px(c,X+12,Y+9,4,2,'#C8463A');c.fillStyle='#FFFFFF';c.font='bold 7px monospace';c.fillText('BARU',X+6,Y+7);} drawWell(c,10,6); drawSign(c,5,2);
  if(S.trophies.boss1) drawTrophy(c,4*T+1,1*T+2,'#C0C0C0'); if(S.trophies.boss2) drawTrophy(c,6*T+1,1*T+2,S.bestRace===1?'#F4B400':S.bestRace===2?'#C0C0C0':'#CD7F32');
  if(S.trophies.boss3) drawTrophy(c,7*T+1,3*T+2,'#7CD35E'); if(S.trophies.boss4) drawTrophy(c,8*T+1,3*T+2,'#3A9D6A');
  if(S.chest) drawChest(c,CHESTPOS.x,CHESTPOS.y,t);
  PLOTS.forEach(([a,b],i)=>{const p=S.plots[i];const X=a*T,Y=b*T;if((i>=6&&i<12&&!eastOpen())||(i>=12&&!farOpen())){px(c,X+4,Y+6,24,20,'#7C9E5A');return;}drawPlotSoil(c,X,Y,p&&p.watered,!p);
    if(p){ const st=stageOf(p); drawCrop(c,X,Y,QUEST[p.no].crop,st,t);
      const need=QUEST[p.no].days; px(c,X+3,Y+2,26,4,'#2B1D12'); px(c,X+4,Y+3,Math.round(24*p.days/need),2,st===4?'#7CD35E':'#F4B400');
      if(st===4&&Math.floor(t/400)%2){px(c,X+26,Y+8,3,3,'#FFFFFF');px(c,X+4,Y+12,2,2,'#FFFFFF');}
      if(st<4&&!p.watered){const bob=Math.floor(t/400)%2;px(c,X+24,Y+8+bob,5,5,'#3A78C9');px(c,X+25,Y+7+bob,3,1,'#3A78C9');px(c,X+25,Y+9+bob,1,1,'#BFE7FA');}
    }
    const sp=sparkles.find(s=>s.i===i&&s.until>t); if(sp){for(let k=0;k<8;k++){const ang=k/8*Math.PI*2+t/300,r=8+((t/60)%8);px(c,X+16+Math.round(Math.cos(ang)*r),Y+14+Math.round(Math.sin(ang)*r),2,2,k%2?'#FFF6A0':'#FFFFFF');}}
    if(i===selPlot){c.strokeStyle='#F4B400';c.lineWidth=1;c.strokeRect(X+.5,Y+.5,31,31);} });
  villagers().forEach(v=>{ if(!v.away) drawKid(c,v.x*T+2,v.y*T,0,0,QUEST[v.no].look); });
  walkers.forEach(w=>drawKid(c,Math.round(w.fx*T)+2,Math.round(w.fy*T),0,Math.floor(t/150)%2,w.look));
  if(!eastOpen()){px(c,13*T,2*T,48,14,'#A86B3C');px(c,13*T+2,2*T+2,44,10,'#C98A52');c.fillStyle='#2B1D12';c.font='bold 7px monospace';c.fillText('TANAH BARU',13*T+4,2*T+10);}
  if(!farOpen()){px(c,21*T,5*T,72,14,'#A86B3C');px(c,21*T+2,5*T+2,68,10,'#C98A52');c.fillStyle='#2B1D12';c.font='bold 7px monospace';c.fillText('TANAH PAK KADES',21*T+4,5*T+10);}
  const nh=npcHere();
  if(nh){const e=nh.e,X=nh.x*T,Y=nh.y*T;drawKid(c,X+2,Y,0,0,evLook(e));const bob=Math.floor(t/300)%2;const col=typeof e==='string'?'#F4B400':'#FFFFFF';px(c,X+6,Y-9+bob,4,7,col);px(c,X+7,Y-8+bob,2,3,'#C8463A');px(c,X+7,Y-4+bob,2,1,'#C8463A');}
  const moving=me.path.length>0; drawKid(c,Math.round(me.fx*T)+2,Math.round(me.fy*T),S.avatar,moving&&Math.floor(t/150)%2,null);
  // daylight tint
  const h=6+S.min/60; let tint=null;
  if(h>=16&&h<18) tint=`rgba(255,140,40,${((h-16)/2*.18).toFixed(3)})`; else if(h>=18) tint=`rgba(20,30,90,${(.2+Math.min(1,(h-18)/4)*.25).toFixed(3)})`; else if(h<7) tint=`rgba(255,200,120,${((7-h)*.12).toFixed(3)})`;
  c.setTransform(1,0,0,1,0,0);
  if(tint){c.fillStyle=tint;c.fillRect(0,0,VC*T,VR*T);}
}
export function walkTo(goals,then){const p=bfs(me.x,me.y,goals); if(p===null){toast('Tidak bisa ke sana.');return;} me.path=p; me.onArrive=then; if(!p.length){me.onArrive=null;then&&then();}}
export function onTap(e){
  const r=cv.getBoundingClientRect(); const x=Math.floor(((e.clientX-r.left)/r.width*VC*T+camX)/T), y=Math.floor(((e.clientY-r.top)/r.height*VR*T+camY)/T);
  const o=hitObject(x,y);
  if(o){ const goal=o.type==='house'?[OBJ.house.door]:o.type==='shop'?[OBJ.shop.door]:adjacent(o.tiles); if(o.type==='plot') selPlot=o.i; walkTo(goal,()=>interact(o)); }
  else if(!blocked(x,y)) walkTo([[x,y]],null);
}
window.addEventListener('keydown',e=>{ if(!document.getElementById('farm')||paused()) return; const d={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key]; if(!d) return; e.preventDefault(); if(me.path.length) return; const nx=me.x+d[0],ny=me.y+d[1];
  if(!blocked(nx,ny)) me.path=[[nx,ny]]; else { const o=hitObject(nx,ny); if(o){ if(o.type==='plot') selPlot=o.i; interact(o);} } });

/* ---------- dialog box ---------- */
export let typing=null, dlgBusy=false, introActive=false, leaveT=null;
export function dialog(who,lines,actions){
  dlgBusy=true;
  const d=document.getElementById('dlg'); if(!d) return;
  let i=0;
  const show=()=>{
    const last=i===lines.length-1;
    d.replaceChildren($(`<div style="display:contents"><img class="portrait" alt="" src="${who.portrait||portrait(who.look,who.av)}"><div class="body"><div class="who">${esc(who.npc)}</div><div class="txt"></div><div class="row act"></div></div></div>`));
    const txt=d.querySelector('.txt'), act=d.querySelector('.act'); const full=fill(lines[i]); let k=0; clearInterval(typing);
    typing=setInterval(()=>{k+=2;txt.textContent=full.slice(0,k);if(k>=full.length)clearInterval(typing);},22);
    txt.onclick=()=>{clearInterval(typing);txt.textContent=full;};
    if(!last){const b=$(`<button class="btn">Lanjut ▸</button>`);b.onclick=()=>{i++;show();};act.append(b);}
    else{ (actions||[]).forEach(([label,fn,cls])=>{const b=$(`<button class="btn ${cls||''}">${esc(label)}</button>`);b.onclick=fn;act.append(b);}); if(!actions||!actions.length){const b=$(`<button class="btn ghost">Oke</button>`);b.onclick=idleDialog;act.append(b);} }
  };
  show();
}
export function idleDialog(){
  dlgBusy=false;
  const d=document.getElementById('dlg'); if(!d) return;
  const e=activeEvent(); const ready=S.plots.filter(p=>p&&stageOf(p)===4).length; const thirsty=S.plots.filter(p=>p&&stageOf(p)<4&&!p.watered).length; const wateredAll=S.plots.some(p=>p&&p.watered)&&!thirsty;
  let msg = (!S.pendingPlant&&anyNewSeed())?`Ada benih BARU di Toko Benih: ${ORDER.filter(isNewSeed).map(n=>QUEST[n].cropName).join(', ')}! Ketuk tokonya.`
    : S.pendingPlant?`Benih ${QUEST[S.pendingPlant].cropName} siap ditanam. Ketuk petak kosong.`
    : ready?`${ready} tanaman siap dipanen! Ketuk petaknya.`
    : thirsty?`${thirsty} tanaman belum disiram hari ini. Ketuk petaknya untuk menyiram dengan murajaah.`
    : S.chest?'Ada peti hadiah di depan rumah!'
    : typeof e==='string'?`${BOSS[e].giver.npc} memanggilmu. Ada kejadian besar!`
    : typeof e==='number'?`${QUEST[e].npc} sedang menunggumu. Cari orang dengan tanda seru (!).`
    : wateredAll?'Semua tanaman sudah disiram. Tidur di rumah supaya besok pagi tumbuh.'
    : 'Rawat kebunmu, ulangi ayat di sumur, dan kumpulkan kartu di Buku Kata.';
  d.replaceChildren($(`<div style="display:contents"><img class="portrait" alt="" src="${portrait(null,S.avatar)}"><div class="body"><div class="who">${esc(S.name)}</div><div class="txt">${esc(msg)}</div></div></div>`));
}

/* ---------- interactions ---------- */
export function interact(o){
  if(o.type==='npc'){ const e=activeEvent();
    if(typeof e==='string'){ const B=BOSS[e]; dialog(B.giver,B.ask,[['Ayo! ▸',()=>({boss1:chase,boss2:race,boss3:cartGame,boss4:pestGame})[e](),'green'],['Nanti',idleDialog,'ghost']]); return; }
    const Q=QUEST[e]; const started=BY[e].ayat.some(a=>S.ay[a.a]);
    dialog(Q, started?[`Bagaimana, ${S.name}? Sudah ${BY[e].ayat.filter(a=>S.ay[a.a]).length} dari ${BY[e].ayat.length} ayat ${BY[e].name} kamu pelajari.`]:Q.ask,
      [[started?'Lanjut belajar':'Ayo bantu!',()=>lessonStart(e),'green'],['Nanti dulu',idleDialog,'ghost']]); }
  if(o.type==='villager') villagerTalk(o.no);
  if(o.type==='gate2') dialog(QUEST[110],['Tanah di balik gerbang ini milik desa. Kalau kamu terus membantu warga, mungkin suatu hari tanah ini jadi milikmu, {n}.']);
  if(o.type==='fruit') { if(S.picked!==S.day){ const c=pick([2,3,5]); S.picked=S.day; S.coins+=c; save(); sfx.coin(); const el=document.getElementById('coins'); if(el) el.textContent=S.coins; dialog(KAKEK,[`Pohon buah hadiah Pak Kades. Kamu memetik buahnya dan menjualnya: +${c} koin.`]); } else dialog(KAKEK,['Buahnya sudah dipetik hari ini. Besok berbuah lagi!']); }
  if(o.type==='gate') dialog(KAKEK,['Di balik gerbang ini ada tanah baru yang luas. Gerbangnya dibuka setelah kamu ikut Lomba Mobil Desa.']);
  if(o.type==='chest') openChest();
  if(o.type==='shop') shop();
  if(o.type==='house') house();
  if(o.type==='well') well();
  if(o.type==='sign') dialog({npc:'Papan',portrait:portrait(KAKEK.look)},[`"Kebun ${S.name}". Hari ke-${S.day}. Semoga berkah!`]);
  if(o.type==='plot') plotAction(o.i);
}
export function openChest(){
  S.chest=false; const roll=Math.random(); const owned=ORDER.filter(n=>S.solved[n]);
  let title,sub;
  if(roll<0.2&&owned.length){const n=pick(owned);S.seeds[n]=(S.seeds[n]||0)+1;S.pendingPlant=S.pendingPlant||n;title='Benih gratis!';sub=`Kamu dapat Benih ${QUEST[n].cropName}.`;}
  else {const c=pick([3,5,5,8,10,15]);S.coins+=c;title=c>=10?'Wah, banyak koin!':'Koin kejutan!';sub=`+${c} Koin Makna.`;}
  save(); sfx.chest(); celebrate(title,sub,ICON.chest,()=>farm());
}
export function plotAction(i){
  const p=S.plots[i];
  if(!p){
    if(S.pendingPlant){ const no=S.pendingPlant; S.plots[i]={no,days:(perk(8)&&QUEST[no].days>1)?1:0,watered:false}; S.seeds[no]--; S.pendingPlant=null; save(); sfx.plant();
      dialog(KAKEK,[`Benih ${QUEST[no].cropName} sudah tertanam! Butuh ${QUEST[no].days} hari untuk panen.`,`Siram setiap hari dengan murajaah: jawab arti kata dari ${BY[no].name}. Tanaman yang disiram tumbuh besok pagi. Tidur di rumah untuk lompat ke pagi.`],[['Siram sekarang',()=>water(i),'blue'],['Nanti',idleDialog,'ghost']]); return; }
    const owned=ORDER.filter(n=>S.seeds[n]>0);
    if(owned.length){ dialog(KAKEK,['Petak ini kosong. Mau tanam benih apa?'],owned.map(n=>[`${QUEST[n].cropName} (${S.seeds[n]})`,()=>{S.pendingPlant=n;save();plotAction(i);},'green']).concat([['Batal',idleDialog,'ghost']])); return; }
    dialog(KAKEK,['Petak ini masih kosong. Benih dibeli di Toko Benih dengan Koin Makna.','Koin didapat dengan membantu warga: pelajari arti surat yang menjawab masalah mereka.']); return; }
  const Q=QUEST[p.no], st=stageOf(p);
  if(st===4){ const sl=S.slv[p.no]||0, gold=sl>=5, jumbo=Math.random()<(sl>=3?0.35:0.2); let coins=jumbo?30:15; if(gold) coins*=2; if(perk(4)) coins+=5; const qty=(jumbo?2:1)+(perk(4)?1:0);
    S.coins+=coins; S.basket[p.no]=(S.basket[p.no]||0)+qty; S.plots[i]=null; save(); sfx.fanfare(); voice('winner',200);
    celebrate(gold?`${Q.cropName} EMAS!`:jumbo?`${Q.cropName} JUMBO!`:`Panen ${Q.cropName}!`,`+${coins} Koin Makna, ${qty} hasil panen${jumbo?' (panen jumbo!)':''}${gold?' (tanaman emas karena kamu Mahir Surat '+BY[p.no].name+')':''}. Beli benih lagi di toko untuk menanam ulang.`,ICON.crop(p.no),()=>{addXP(10);farm();}); return; }
  if(p.watered){ dialog(KAKEK,[`${Q.cropName} sudah disiram hari ini (${p.days}/${Q.days} hari). Besok pagi tumbuh. Tidur di rumah untuk lompat ke pagi.`],[['Pulang tidur',()=>walkTo([OBJ.house.door],house),'green'],['Oke',idleDialog,'ghost']]); return; }
  dialog(KAKEK,[`${Q.cropName} (${p.days}/${Q.days} hari) belum disiram hari ini. Siram dengan murajaah ${BY[p.no].name}?`],[['Siram',()=>water(i),'blue'],['Nanti',idleDialog,'ghost']]);
}

export const isNewSeed=no=>!!S.solved[no]&&!(S.bought&&S.bought[no]);
export const anyNewSeed=()=>ORDER.some(isNewSeed);
export function shop(){
  panel(`Toko Benih`,`Koin Makna kamu: ${S.coins}`,v=>{
    v.append($(`<p class="lead">Setiap benih terbuka setelah kamu membantu warga dengan satu surat. Harganya sama dengan koin dari menyelesaikan surat itu.</p>`));
    const list=$(`<div class="list"></div>`);
    const sorted=[...ORDER.filter(isNewSeed),...ORDER.filter(n=>!isNewSeed(n)&&S.solved[n]),...ORDER.filter(n=>!S.solved[n])];
    sorted.forEach(no=>{ const Q=QUEST[no], price=seedPrice(no), open=!!S.solved[no], fresh=isNewSeed(no);
      const it=$(`<div class="item${fresh?' new':''}">${fresh?'<span class="newtag">BARU!</span>':''}<img alt="" src="${ICON.seed(no)}" style="${open?'':'filter:grayscale(1) opacity(.45)'}"><div class="t"><b>${open?'':'🔒 '}Benih ${Q.cropName}</b><span>${open?`${Q.days} hari sampai panen · punya ${S.seeds[no]||0}`:`Terkunci · bantu ${Q.npc} dengan Surat ${BY[no].name}`}</span></div><button class="btn" ${open&&S.coins>=price?'':'disabled'}><img alt="" src="${ICON.coin}" style="width:16px;height:16px;image-rendering:pixelated"> ${price}</button></div>`);
      it.querySelector('button').onclick=()=>{ S.coins-=price; S.seeds[no]=(S.seeds[no]||0)+1; S.pendingPlant=no; S.bought=S.bought||{}; S.bought[no]=true; save(); sfx.coin(); closePanel(); farm(); toast(`Benih ${Q.cropName} dibeli!`); };
      list.append(it); });
    v.append(list);
  });
}
export function house(){
  const vp=villageProgress();
  panel(`Rumah ${S.name}`,`${HOUSE_TIERS[S.house].name} · Level ${pLevel()} · Hari ${S.day}, ${clockStr()}`,v=>{
    const sl=$(`<div class="box"><h3>Tidur</h3><p class="small" style="margin:0 0 8px">Tidur untuk lompat ke pagi hari berikutnya. Tanaman yang sudah disiram akan tumbuh.</p><button class="btn green">Tidur sampai pagi 💤</button></div>`);
    sl.querySelector('button').onclick=()=>{closePanel();sleep();}; v.append(sl);
    v.append(buildBox());
    v.append($(`<div class="box"><h3>Level desa ${vp.done}/${vp.total}</h3><ul class="milestones">${vp.list.map(([n,d])=>`<li><b>${d?'★':'☆'}</b>${esc(n)}</li>`).join('')}</ul><p class="small" style="margin:8px 0 0">Rumahmu dibangun dengan Level Petani dan koin (menu Bangun di atas). Gerbang tanah baru terbuka setelah lomba mobil, dan Pak Kades menghadiahkan tanah lagi setelah hama ulat diusir.</p></div>`));
    const items=ORDER.filter(n=>S.basket[n]);
    v.append($(`<div class="box"><h3>Keranjang panen</h3>${items.length?`<div class="list">${items.map(n=>`<div class="item"><img alt="" src="${ICON.crop(n)}"><div class="t"><b>${QUEST[n].cropName} × ${S.basket[n]}</b><span>Dari Surat ${BY[n].name}</span></div></div>`).join('')}</div>`:'<p class="small" style="margin:0">Belum ada panen.</p>'}</div>`));
    if(S.trophies.boss1||S.trophies.boss2||S.trophies.boss3||S.trophies.boss4){ const tb=$(`<div class="box"><h3>Lemari piala</h3><div class="list"></div></div>`);
      if(S.trophies.boss1){const it=$(`<div class="item"><img alt="" src="${ICON.trophy('#C0C0C0')}"><div class="t"><b>Penangkap Maling</b><span>Main lagi untuk latihan</span></div><button class="btn blue">Main</button></div>`);it.querySelector('button').onclick=()=>{closePanel();chase();};tb.querySelector('.list').append(it);}
      if(S.trophies.boss2){const it=$(`<div class="item"><img alt="" src="${ICON.trophy(S.bestRace===1?'#F4B400':S.bestRace===2?'#C0C0C0':'#CD7F32')}"><div class="t"><b>Lomba Mobil · juara ${S.bestRace}</b><span>Kejar juara 1!</span></div><button class="btn blue">Main</button></div>`);it.querySelector('button').onclick=()=>{closePanel();race();};tb.querySelector('.list').append(it);}
      if(S.trophies.boss3){const it=$(`<div class="item"><img alt="" src="${ICON.trophy('#7CD35E')}"><div class="t"><b>Pengantar Bekal · ${S.best3||0}/5</b><span>Antar 5 bekal!</span></div><button class="btn blue">Main</button></div>`);it.querySelector('button').onclick=()=>{closePanel();cartGame();};tb.querySelector('.list').append(it);}
      if(S.trophies.boss4){const it=$(`<div class="item"><img alt="" src="${ICON.trophy('#3A9D6A')}"><div class="t"><b>Penjaga Kebun · ${S.best4||0}/5</b><span>Selamatkan 5 tanaman!</span></div><button class="btn blue">Main</button></div>`);it.querySelector('button').onclick=()=>{closePanel();pestGame();};tb.querySelector('.list').append(it);}
      v.append(tb);}
  });
}
export function well(){
  const dn=ORDER.filter(n=>BY[n].ayat.some(a=>S.ay[a.a]));
  panel('Sumur Murajaah','Ulangi ayat, kejar 3 bintang',v=>{
    if(!dn.length){v.append($(`<p class="lead">Belum ada ayat yang dipelajari. Bantu warga dulu, lalu kembali ke sini.</p>`));return;}
    v.append($(`<p class="lead">Setiap ayat yang diulang memberi +2 Koin Makna. Bintang 2: tanpa salah saat mencocokkan. Bintang 3: tanpa salah saat menyusun.</p>`));
    dn.forEach(no=>{ const box=$(`<div class="box"><h3>${BY[no].name} <span class="small" style="color:#6A4E36">· Level ${S.slv[no]||0} ${SLV_NAMES[S.slv[no]||0]}</span></h3><div class="list"></div></div>`);
      if(surahDone(no)){ const ws=(S.wholeStars||{})[no]||0; const b=$(`<button class="item" style="width:100%;background:#FFF6CC"><div class="t"><b>📖 Surat Utuh ${BY[no].name}</b><span>Cerita surat, susun urutan ayat, jelaskan ke warga</span></div><div style="color:#B8860B;font-size:18px;white-space:nowrap">${'★'.repeat(ws)}${'☆'.repeat(3-ws)}</div></button>`); b.onclick=()=>suratUtuh(no,!!S.solved[no]); box.querySelector('.list').append(b); }
      BY[no].ayat.forEach((a,j)=>{ if(!S.ay[a.a]) return; const st=S.stars[a.a]||1; const it=$(`<button class="item" style="width:100%"><div class="t ar" lang="ar" style="font-size:24px;text-align:right">${esc(a.ar)}</div><div style="color:#B8860B;font-size:18px;white-space:nowrap">${'★'.repeat(st)}${'☆'.repeat(3-st)}</div></button>`); it.onclick=()=>lesson(no,j,true); box.querySelector('.list').append(it); });
      v.append(box); });
  });
}
export function bookView(){
  const uniq=no=>{const m=new Map();words(no).forEach(w=>{const k=w.ar+'|'+w.id;const o=m.get(k);if(!o)m.set(k,{w,l:lv(w.a)});else o.l=Math.max(o.l,lv(w.a));});return [...m.values()];};
  const all=ORDER.flatMap(uniq); const got=all.filter(x=>x.l>=1).length, gold=all.filter(x=>x.l>=3).length;
  panel('Buku Kata',`${got}/${all.length} kartu terkumpul · ${gold} kartu emas`,v=>{
    v.append($(`<p class="lead">Kartu terbuka saat kamu mengenali kata. Kartu jadi emas setelah kamu menjawabnya dengan benar saat menyiram atau melawan boss.</p>`));
    ORDER.forEach(no=>{ const box=$(`<div class="box"><h3>${BY[no].name}</h3><div class="book"></div></div>`);
      uniq(no).forEach(({w,l})=>{ const c=l>=1?$(`<button class="bk${l>=3?' gold':''}"><div><div class="ar w" lang="ar">${esc(w.ar)}</div><div class="m">${esc(w.id)}</div></div></button>`):$(`<div class="bk lock">?</div>`); if(l>=1) c.onclick=()=>play(AW(w.a)); box.querySelector('.book').append(c); });
      v.append(box); });
  });
}

/* ---------- watering = daily murajaah ---------- */
export function water(i){
  const p=S.plots[i], no=p.no; let need=3, streak=0, asked=0;
  const pn=panel(`Menyiram ${QUEST[no].cropName}`,`Murajaah Surat ${BY[no].name} · 3 jawaban benar = 1 siraman`,()=>{});
  const body=pn.querySelector('.pbody'); const frame=$(`<div class="frame"><div class="mgbar"><span>💧 <span id="wc">0</span>/3</span><span id="st"></span></div><div class="qh"></div></div>`); body.append(frame);
  let got=0;
  const ask=()=>{ const q=makeQ([no],['meaning','meaning','listen','next']); asked++;
    renderQ(frame.querySelector('.qh'),q,(ok,ms,fb)=>{
      if(ok){got++;streak++;S.lv[q.w.a]=Math.min(3,lv(q.w.a)+1);save();sfx.water();fb.className='fb good';fb.textContent=pick(['Benar!','Hebat!','Pintar!']); if(streak>=3&&streak%3===0){comboPop(streak);voice('combo');}}
      else {streak=0;sfx.bad();fb.className='fb bad';fb.textContent='Tidak apa-apa, lihat jawaban yang hijau.';}
      frame.querySelector('#wc').textContent=got;
      setTimeout(()=>{ if(got>=need) finish(); else ask(); }, ok?700:1400); }); };
  const finish=()=>{ p.watered=true; let extra=0; if(perk(2)) S.plots.forEach(q=>{ if(q&&q!==p&&q.no===no&&!q.watered&&stageOf(q)<4){q.watered=true;extra++;} }); save(); sfx.fanfare(); voice('you_win',150);
    celebrate('Tanaman disiram!',`${QUEST[no].cropName} akan tumbuh besok pagi (${p.days}/${QUEST[no].days} hari).${extra?` Penyiram Besar ikut menyiram ${extra} petak lain!`:''} Tidur di rumah untuk lompat ke pagi.`,ICON.crop(no),()=>{closePanel();addReview(no);addXP(repXP('water'+no+'_'+i,10)||2);farm();}); };
  ask();
}

/* ---------- membangun rumah pemain ---------- */
export function buildBox(){
  const cur=HOUSE_TIERS[S.house], nx=HOUSE_TIERS[S.house+1];
  const b=$(`<div class="box"><h3>Bangun rumah</h3><p class="small" style="margin:0 0 8px">Sekarang: <b>${cur.name}</b>. Butuh Level Petani dan Koin Makna. Rumah selesai dibangun besok pagi.</p><div class="list"></div></div>`);
  const list=b.querySelector('.list');
  HOUSE_TIERS.forEach((h,i)=>{ if(i===0) return; const doneT=S.house>=i, building=S.building&&S.building.tier===i, next=i===S.house+1;
    const lvOk=pLevel()>=h.lv, coinOk=S.coins>=h.cost;
    const it=$(`<div class="item"><div class="t"><b>${doneT?'✔ ':building?'🔨 ':''}${h.name}</b><span>${doneT?'Sudah dibangun':building?'Sedang dibangun, jadi besok pagi':`Butuh Level ${h.lv} ${lvOk?'✔':'✗'} · ${h.cost} koin ${coinOk?'✔':'✗'}`}</span></div>${next&&!S.building?`<button class="btn" ${lvOk&&coinOk?'':'disabled'}>Bangun</button>`:''}</div>`);
    const btn=it.querySelector('button'); if(btn) btn.onclick=()=>{ S.coins-=h.cost; S.building={tier:i}; save(); sfx.plant(); closePanel(); farm(); toast(`Tukang mulai membangun ${h.name}! Selesai besok pagi.`); };
    list.append(it); });
  return b;
}

/* ---------- renovasi rumah warga ---------- */
export function villagerTalk(no){
  const Q=QUEST[no]; const lines=[`Ini rumahku, ${S.name}. `+fill(Q.thanks)];
  if(!renoOpen()){ dialog(Q,lines); return; }
  const r=renoNext(no);
  if(!r){ dialog(Q,lines.concat(['Rumahku sekarang indah sekali. Terima kasih sudah membantu, '+S.name+'!'])); return; }
  if(!r.ok){ dialog(Q,lines.concat([`Kalau kamu sudah lebih paham Surat ${BY[no].name} (Level ${r.slv}: ${SLV_NAMES[r.slv]}), kamu bisa membantu memperbaiki rumahku. Sekarang Level ${S.slv[no]||0}.`])); return; }
  dialog(Q,lines.concat([`Kamu sudah paham Surat ${BY[no].name}. Mau membantu memperbaiki rumahku jadi ${r.name}? Butuh ${r.cost} koin.`]),[[`Bantu (${r.cost} koin)`,()=>{
    if(S.coins<r.cost){ toast(`Koinmu belum cukup (${S.coins}/${r.cost}).`); return; }
    S.coins-=r.cost; S.vh[no]=r.tier; save(); sfx.chest(); addXP(25);
    renoFx={no,until:performance.now()+2500};
    note(`Rumah ${Q.npc} jadi ${r.name}!`,`Kamu membantu tetangga, seperti pesan Surat Al-Ma'un. ${Q.npc} akan sesekali memberi hadiah terima kasih di pagi hari.`,ICON.star);
    farm(); setTimeout(flushNotes,2600);
  },'green'],['Nanti',idleDialog,'ghost']]);
}
export let renoFx=null;

/* ---------- onboarding ---------- */
export function onboarding(){
  root.replaceChildren($(`<div class="title"><h1>Kebun Makna</h1><p>Ayo bangun kebunmu!</p></div>`));
  const f=$(`<div class="frame"><img class="portrait" alt="" style="float:left;margin:0 12px 6px 0;width:64px;height:64px;border:3px solid var(--ink);image-rendering:pixelated" src="${portrait(KAKEK.look)}">
    <div class="who" style="font-weight:700;color:var(--red)">Kakek Umar</div><p style="margin:2px 0 10px">Selamat datang di desa! Kakek punya sebidang tanah kosong dan gubuk kecil untukmu. Siapa namamu?</p>
    <div class="field" style="clear:both"><label for="nm"><b>Namamu</b></label><input id="nm" maxlength="16" autocomplete="off" placeholder="Tulis namamu" value="${esc(S.name)}"></div>
    <b>Pilih tokohmu</b><div class="avatars" style="margin:8px 0 14px"></div>
    <button class="btn green block" id="go">Mulai berkebun ▸</button><p class="hint" id="err" style="margin:8px 0 0"></p></div>`);
  const avs=f.querySelector('.avatars');
  AVATARS.forEach((A,i)=>{const b=$(`<button class="av${S.avatar===i?' on':''}"><canvas width="12" height="16"></canvas><span>${A.name}</span></button>`);drawKid(b.querySelector('canvas').getContext('2d'),0,0,i,0,null);b.onclick=()=>{S.avatar=i;avs.querySelectorAll('.av').forEach(x=>x.classList.remove('on'));b.classList.add('on');sfx.good();};avs.append(b);});
  f.querySelector('#go').onclick=()=>{const n=f.querySelector('#nm').value.trim(); if(!n){f.querySelector('#err').textContent='Tulis namamu dulu, ya.';return;} const isNew=!S.name; S.name=n; save(); sfx.fanfare(); voice('ready'); isNew?intro():farm();};
  root.append(f);
}
export function intro(){
  introActive=true; farm();
  dialog(KAKEK,[`Ini kebunmu, ${S.name}. Masih kosong: hanya ada gubuk kecil dan tanah.`,'Di desa ini, benih dibeli dengan Koin Makna. Koin didapat saat kamu memahami arti ayat Al-Qur\'an untuk membantu warga.','Tanam benih, siram setiap hari dengan murajaah, lalu tidur. Besok pagi tanamanmu tumbuh!',`Lihat jam di atas. Satu hari di desa sekitar 16 menit. Nanti warga desa akan datang membawa masalah. Cari orang dengan tanda seru (!).`],[['Siap!',()=>{introActive=false;idleDialog();stepEvents();},'green']]);
}

/* ---------- parent view ---------- */
export function parentView(){
  let tab='progres';
  panel('Untuk Orang Tua','Progres, cek arti, pengaturan',(body)=>{
    const tabs=$(`<div class="ptab"><button data-t="progres">Progres</button><button data-t="arti">Cek arti per kata</button><button data-t="atur">Pengaturan &amp; sumber</button></div>`); const inner=$(`<div class="sys"></div>`);
    body.append(tabs,inner);
    const render=()=>{ tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
      if(tab==='progres') inner.replaceChildren($(`<div class="box"><h3>Ringkasan</h3><p class="small" style="margin:0">Hari ke-${S.day} di game · ${Object.keys(S.ay).length}/${DATA.reduce((s,x)=>s+x.ayat.length,0)} ayat · ${ORDER.flatMap(words).filter(w=>lv(w.a)>=3).length}/${ORDER.flatMap(words).length} kata kuat (benar saat menyiram/boss) · rumah tingkat ${S.house+1}</p></div>`),...ORDER.map(no=>{const s=BY[no],ws=words(no),need=ws.filter(w=>lv(w.a)>0&&lv(w.a)<3);
        return $(`<div class="box"><h3>${s.name}</h3><p class="small" style="margin:0 0 6px">${s.ayat.filter(a=>S.ay[a.a]).length}/${s.ayat.length} ayat · ${ws.filter(w=>lv(w.a)>=3).length}/${ws.length} kata kuat · ${S.solved[no]?'masalah warga terjawab':'belum selesai'}</p>${need.length?`<div class="small"><b>Tanyakan lagi saat santai:</b><ul style="margin:6px 0 0;padding-left:20px">${need.map(w=>`<li><span class="ar" lang="ar" style="font-size:20px">${esc(w.ar)}</span> = ${esc(w.id)}</li>`).join('')}</ul></div>`:''}</div>`);}));
      if(tab==='arti') inner.replaceChildren($(`<p class="small" style="margin:0 0 10px">Semua arti yang dipakai di aplikasi. <span class="tag">disesuaikan</span> = ejaan atau pilihan kata kami rapikan, arti asli dari sumber ditulis di bawahnya.</p>`),...ORDER.map(no=>{const s=BY[no];return $(`<div class="box"><h3>${s.name}</h3><div class="tablewrap"><table><thead><tr><th>Ayat</th><th>Kata</th><th>Arti</th></tr></thead><tbody>${s.ayat.map(a=>a.w.map((w,k)=>`<tr><td>${k===0?a.n:''}</td><td class="ar" lang="ar">${esc(w.ar)}</td><td>${esc(w.id)}${w.id!==w.src?`<br><span class="tag">disesuaikan</span> <span class="small" style="color:#6A4E36">sumber: ${esc(w.src)}</span>`:''}</td></tr>`).join('')+`<tr><td></td><td colspan="2" class="small" style="color:#6A4E36">Terjemahan ayat: ${esc(a.tr)}</td></tr>`).join('')}</tbody></table></div></div>`);}));
      if(tab==='atur'){ const b=$(`<div><div class="box"><h3>Pengaturan</h3>
        <label class="toggle"><input type="checkbox" id="unl" ${S.unlockAll?'checked':''}> Buka semua misi tanpa urutan (termasuk boss)</label>
        <label class="toggle"><input type="checkbox" id="sfx" ${S.sfx?'checked':''}> Bunyi efek</label>
        <label class="toggle"><input type="checkbox" id="voi" ${S.voice?'checked':''}> Suara penyiar (rekaman manusia, bahasa Inggris)</label>
        <div class="row" style="margin-top:12px"><button class="btn ghost" id="rn">Ganti nama/tokoh</button><button class="btn ghost" id="rs" style="color:#C0472E">Mulai ulang dari awal</button></div><div id="cf"></div>
        <p class="small" style="margin:10px 0 0">Waktu di game: 1 menit game = 1 detik nyata, jadi satu hari (06:00–22:00) sekitar 16 menit. Waktu berhenti saat menu, pelajaran, atau game boss terbuka. Progres tersimpan di browser perangkat ini saja.</p></div>
        <div class="box"><h3>Sumber</h3><ul class="small" style="padding-left:20px;margin:0">
        <li><b>Arti per kata:</b> terjemah per kata Bahasa Indonesia dari Quran.com (dataset ihzaa/quran-json-indopak-tajweed), dicek silang dengan basis data quranterjemah.com. Pada 109:5 dan 107:3 pemenggalan kata di sumber bergeser, sudah diperbaiki manual. Kata yang dirapikan ditandai di tab Cek arti.</li>
        <li><b>Terjemahan ayat:</b> Kementerian Agama RI, melalui Quran.com.</li>
        <li><b>Bacaan:</b> Syaikh Mishary Rashid Alafasy per ayat (versebyversequran.com). Audio per kata dipotong dari rekaman ayat yang sama; batas kata ditentukan manual mengikuti tajwid.</li>
        <li><b>Suara penyiar</b> ("You win!", "Combo!", "3-2-1"): Kenney Voiceover Pack, kenney.nl, lisensi CC0.</li></ul>
        <p class="small" style="margin:8px 0 0">Bila menemukan arti atau potongan bunyi yang keliru, mohon dicek dengan mushaf terjemah per kata Kemenag atau ustaz/ustazah setempat.</p></div></div>`);
        b.querySelector('#unl').onchange=e=>{S.unlockAll=e.target.checked;save();};
        b.querySelector('#sfx').onchange=e=>{S.sfx=e.target.checked;save();};
        b.querySelector('#voi').onchange=e=>{S.voice=e.target.checked;save();if(S.voice)voice('ready');};
        b.querySelector('#rn').onclick=()=>{closePanel();onboarding();};
        b.querySelector('#rs').onclick=()=>{const cf=b.querySelector('#cf');cf.replaceChildren($(`<div class="confirm small">Kebun, koin, dan progres akan hilang. Yakin? <div class="row" style="margin-top:8px"><button class="btn" id="y" style="background:#F8D2C6">Ya, mulai ulang</button><button class="btn ghost" id="n">Batal</button></div></div>`));cf.querySelector('#y').onclick=()=>{setS(fresh());save();closePanel();onboarding();};cf.querySelector('#n').onclick=()=>cf.replaceChildren();};
        inner.replaceChildren(b);}
    };
    tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();}); render();
  });
}

