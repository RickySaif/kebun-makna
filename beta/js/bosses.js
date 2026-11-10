// bosses.js — split verbatim from the classic single-file game (Phase 0).
import { sfx, tone, voice } from './audio.js';
import { BOSS, BY, KAKEK, QUEST, THIEF } from './data.js';
import { dialog, farm } from './farm.js';
import { celebrate, makeQ, renderQ } from './lesson.js';
import { addXP, repXP } from './progress.js';
import { ICON, SPOT, drawHut, drawKid, drawTree, giverNo, px } from './render.js';
import { hdCanvas, lookOf } from './art.js';
const f4=()=>Math.floor(performance.now()/110)%4; // v3: 4-step walk cycle
import { S, lv, save } from './state.js';
import { $, closePanel, comboPop, panel, pick } from './ui.js';

/* ---------- BOSS 1: chase the thief ---------- */
export function chase(){
  const B=BOSS.boss1;
  const pn=panel(B.title,'Jawab benar untuk berlari. Jawab cepat untuk sprint!',()=>{},()=>farm());
  const body=pn.querySelector('.pbody');
  const W=192,H=88;
  const v=$(`<div><canvas class="mg" width="${W}" height="${H}"></canvas><div class="mgbar"><span>Jarak: <span id="gap">25</span> m</span><span>⏱ <span id="tm">100</span></span></div><div class="frame"><div class="qh"></div></div></div>`);
  body.append(v); const c=hdCanvas(v.querySelector('canvas'),W,H);
  let st={pX:0,tX:25,boost:0,stumble:0,time:100,over:false,streak:0,started:false};
  const thiefV=1.05, baseV=0.75;
  let last=performance.now(), rid;
  function drawScene(t){
    const cam=st.pX-8;
    px(c,0,0,W,H,'#8FD3F4'); px(c,0,50,W,38,'#5DBB4A');
    for(let i=-1;i<8;i++){const x=Math.round(i*40-((cam*2)%40));drawTree(c,x,34,i%2);}
    px(c,0,66,W,14,'#D9B77A'); for(let i=-1;i<14;i++){const x=Math.round(i*16-((cam*4)%16));px(c,x,72,6,1,'#C9A465');}
    const sc=2.6; const tx=Math.round((st.tX-cam)*sc), pxp=Math.round((st.pX-cam)*sc);
    const fr=Math.floor(t/120)%2;
    if(tx<W+10){ drawKid(c,tx,58,0,f4(),THIEF.look,3); px(c,tx+9,61,6,6,'#E8D6A8'); px(c,tx+10,60,4,1,'#C9A465'); }
    else { px(c,W-14,58,12,10,'#F4B400'); c.fillStyle='#2B1D12'; c.font='bold 8px "Fredoka",sans-serif'; c.fillText('→',W-11,66); }
    drawKid(c,pxp,58,S.avatar,(st.boost>0.2||st.started)?f4():0,null,3);
    if(st.boost>1.5){px(c,pxp-6,62,4,1,'#fff');px(c,pxp-8,65,5,1,'#fff');}
    if(st.stumble>0){px(c,pxp+4,52,4,4,'#F4B400');}
  }
  function frameLoop(t){ rid=requestAnimationFrame(frameLoop); const dt=Math.min(0.1,(t-last)/1000); last=t;
    if(!document.body.contains(v)){cancelAnimationFrame(rid);return;}
    if(st.started&&!st.over){
      st.boost*=Math.pow(0.5,dt/1.0); st.stumble=Math.max(0,st.stumble-dt);
      st.pX+=(st.stumble>0?0.2:baseV+st.boost)*dt*3; st.tX+=thiefV*dt*3; st.time-=dt;
      const gap=Math.max(0,st.tX-st.pX); v.querySelector('#gap').textContent=Math.ceil(gap); v.querySelector('#tm').textContent=Math.max(0,Math.ceil(st.time));
      if(gap<=0.6){ st.over=true; win(); } else if(st.time<=0){ st.over=true; lose(); }
    }
    drawScene(t);
  }
  const ask=()=>{ if(st.over) return; const q=makeQ(B.pool);
    renderQ(v.querySelector('.qh'),q,(ok,ms,fb)=>{ if(st.over) return;
      if(ok){ const fast=ms<3000; st.boost+=fast?3.2:2.2; st.streak++; S.lv[q.w.a]=Math.min(3,lv(q.w.a)+1); sfx.boost(); fb.className='fb good'; fb.textContent=fast?'SPRINT!':'Lari!'; if(st.streak%3===0){comboPop(st.streak);voice('combo');} }
      else { st.stumble=0.8; st.boost=0; st.streak=0; sfx.bad(); fb.className='fb bad'; fb.textContent='Tersandung! Lihat jawaban yang hijau.'; }
      save(); setTimeout(ask, ok?450:1300); }); };
  function win(){ voice('winner'); sfx.fanfare(); const first=!S.trophies.boss1; S.trophies.boss1=true; if(first){const gn=giverNo('boss1'); S.leaving={no:gn,from:SPOT['boss1']};} if(first){S.coins+=50;} save(); addXP(first?80:repXP('boss1',15));
    setTimeout(()=>celebrate('Malingnya tertangkap!',first?'Keranjang panen kembali! +50 Koin dan piala Penangkap Maling. Koin bisa dipakai membangun rumahmu.':'Kamu menangkapnya lagi. Makin cepat!',ICON.trophy('#C0C0C0'),()=>{closePanel();farm(); if(first) setTimeout(()=>dialog(KAKEK,['Maling itu minta maaf dan mengembalikan semuanya. Dia berjanji tidak mencuri lagi.','Ingat Al-Falaq: kita berlindung kepada Allah dari kejahatan. Sekarang Juragan Tono sedang mencarimu!']),60);}),600); }
  function lose(){ setTimeout(()=>{ const box=$(`<div class="frame" style="margin-top:10px;text-align:center"><div class="big" style="font-size:24px;font-weight:700;color:var(--red)">Hampir saja!</div><p>Malingnya masuk hutan. Tidak apa-apa, ayo coba lagi. Jawab lebih cepat supaya sprint.</p><button class="btn green block">Coba lagi ▸</button></div>`); box.querySelector('button').onclick=()=>{closePanel();chase();}; v.querySelector('.frame').replaceWith(box); },300); }
  // countdown
  const qh=v.querySelector('.qh'); qh.innerHTML='<div class="qprompt"><div class="big" style="font-size:40px;font-weight:700">Siap…</div></div>';
  voice('ready'); setTimeout(()=>{ st.started=true; last=performance.now(); ask(); },1300);
  rid=requestAnimationFrame(frameLoop);
}

/* ---------- BOSS 2: village car race ---------- */
export function race(){
  const B=BOSS.boss2;
  const pn=panel(B.title,'Jawab benar supaya mobilmu melaju. Makin cepat, makin kencang!',()=>{},()=>farm());
  const body=pn.querySelector('.pbody');
  const W=192,H=104;
  const v=$(`<div><canvas class="mg" width="${W}" height="${H}"></canvas><div class="mgbar"><span>Posisi: <span id="pos">-</span></span><span>⏱ <span id="tm">0</span></span></div><div class="frame"><div class="qh"></div></div></div>`);
  body.append(v); const c=hdCanvas(v.querySelector('canvas'),W,H);
  const L=100;
  const cars=[{name:S.name,col:lookOf(S.avatar).shirt,x:0,v:0,me:true},{name:'Bima',col:'#E0702F',x:0,v:1.55+Math.random()*.15},{name:'Dodi',col:'#3A9D6A',x:0,v:1.75+Math.random()*.15},{name:'Tono',col:'#B8862B',x:0,v:1.95+Math.random()*.15}];
  let boost=0, started=false, over=false, time=0, finish=[], streak=0, last=performance.now(), rid;
  function car(X,Y,col,t,moving){ const b=moving&&Math.floor(t/100)%2?1:0; px(c,X,Y+3-b,16,6,col); px(c,X+3,Y-b,8,4,col); px(c,X+4,Y+1-b,5,2,'#BFE7FA'); px(c,X+1,Y+8,4,4,'#2B1D12'); px(c,X+11,Y+8,4,4,'#2B1D12'); px(c,X+2,Y+9,2,2,'#9A9A9A'); px(c,X+12,Y+9,2,2,'#9A9A9A'); px(c,X+15,Y+4-b,1,2,'#FFE07A'); }
  function drawScene(t){
    px(c,0,0,W,H,'#5DBB4A'); for(let i=0;i<4;i++){const Y=8+i*24; px(c,0,Y,W,20,'#7A7A7A'); px(c,0,Y,W,1,'#FFFFFF'); px(c,0,Y+19,W,1,'#FFFFFF'); for(let k=0;k<12;k++)px(c,k*16+((started?Math.floor(t/40):0)%16)-8,Y+10,6,1,'#D0D0D0');}
    for(let y=8;y<H-4;y+=4){px(c,176,y,4,2,(y/4)%2?'#fff':'#2B1D12');px(c,180,y+2,4,2,(y/4)%2?'#fff':'#2B1D12');}
    cars.forEach((cr,i)=>{const X=Math.round(4+cr.x/L*160),Y=12+i*24; car(X,Y,cr.col,t,started&&!cr.done); if(cr.me){px(c,X+5,Y-4,6,2,'#F4B400');}});
  }
  function frameLoop(t){ rid=requestAnimationFrame(frameLoop); const dt=Math.min(0.1,(t-last)/1000); last=t;
    if(!document.body.contains(v)){cancelAnimationFrame(rid);return;}
    if(started&&!over){ time+=dt; boost*=Math.pow(0.5,dt/1.4);
      cars.forEach(cr=>{ if(cr.done) return; const sp=cr.me?(0.9+boost):cr.v*(0.92+0.16*Math.sin(t/900+cr.v*7)); cr.x=Math.min(L,cr.x+sp*dt); if(cr.x>=L){cr.done=true;finish.push(cr);} });
      const rank=[...cars].sort((a,b)=>b.x-a.x).findIndex(cr=>cr.me)+1; v.querySelector('#pos').textContent=`${rank} dari 4`; v.querySelector('#tm').textContent=Math.floor(time);
      if(cars[0].done){ over=true; end(finish.indexOf(cars[0])+1); }
    }
    drawScene(t);
  }
  const ask=()=>{ if(over) return; const q=makeQ(B.pool.filter(n=>BY[n].ayat.some(a=>S.ay[a.a])));
    renderQ(v.querySelector('.qh'),q,(ok,ms,fb)=>{ if(over) return;
      if(ok){ const fast=ms<2500, mid=ms<5000; boost+=fast?4.2:mid?3.2:2.4; streak++; S.lv[q.w.a]=Math.min(3,lv(q.w.a)+1); sfx.boost(); fb.className='fb good'; fb.textContent=fast?'TURBO!':'Ngebut!'; if(streak%3===0){comboPop(streak);voice('combo');} }
      else { boost=Math.max(0,boost-1.5); streak=0; sfx.bad(); fb.className='fb bad'; fb.textContent='Mesin tersendat! Lihat jawaban yang hijau.'; }
      save(); setTimeout(ask, ok?400:1300); }); };
  function end(rank){
    const coins=[0,60,40,30,20][rank]; const first=!S.trophies.boss2; S.trophies.boss2=true; if(first){const gn=giverNo('boss2'); S.leaving={no:gn,from:SPOT['boss2']};} S.bestRace=S.bestRace?Math.min(S.bestRace,rank):rank; S.coins+=coins; save(); addXP(first?80:repXP('boss2',15));
    sfx.fanfare(); voice(rank===1?'winner':'you_win');
    const medal=['','Juara 1! 🥇','Juara 2! 🥈','Juara 3! 🥉','Juara 4!'][rank];
    setTimeout(()=>celebrate(medal,`+${coins} Koin Makna.${rank>1?' Main lagi dari Lemari Piala di rumah untuk mengejar juara 1.':''}`,ICON.trophy(rank===1?'#F4B400':rank===2?'#C0C0C0':'#CD7F32'),()=>{closePanel();farm(); if(first) setTimeout(()=>dialog(QUEST[110],['Hebat! Ingat An-Nasr: saat menang, kita bertasbih memuji Allah dan memohon ampun. Jangan sombong, ya!','Karena kontribusimu untuk desa (menjawab masalah warga dan menangkap maling), aku membuka gerbang tanah baru di sebelah timur kebunmu: 6 petak lagi!','Dan lihat, warga baru datang ke desa. Mereka juga punya masalah yang jawabannya ada di Al-Qur\'an.']),60);}),900);
  }
  const qh=v.querySelector('.qh'); qh.innerHTML='<div class="qprompt"><div class="big" id="cd" style="font-size:48px;font-weight:700">3</div></div>';
  const cd=qh.querySelector('#cd'); voice('3'); tone([[440,0,.15]]);
  setTimeout(()=>{cd.textContent='2';voice('2');tone([[440,0,.15]]);},900);
  setTimeout(()=>{cd.textContent='1';voice('1');tone([[440,0,.15]]);},1800);
  setTimeout(()=>{cd.textContent='Mulai!';voice('begin');tone([[880,0,.3]]);started=true;last=performance.now();ask();},2700);
  rid=requestAnimationFrame(frameLoop);
}

/* ---------- BOSS 3: deliver food to orphans (Al-Ma'un, Quraisy) ---------- */
export function cartGame(){
  const B=BOSS.boss3;
  const pn=panel(B.title,'Jawab benar supaya gerobak melompati rintangan.',()=>{},()=>farm());
  const body=pn.querySelector('.pbody');
  const W=192,H=88;
  const v=$(`<div><canvas class="mg" width="${W}" height="${H}"></canvas><div class="mgbar"><span>Bekal: <span id="bk">5</span>/5</span><span>Rintangan: <span id="ob">0</span>/8</span></div><div class="frame"><div class="qh"></div></div></div>`);
  body.append(v); const c=hdCanvas(v.querySelector('canvas'),W,H);
  const N=8, GAP=6, SPEED=0.9, CARTX=46, SC=16;
  const obs=Array.from({length:N},(_,i)=>({x:6+i*GAP,kind:i%3===1?'hole':'rock',state:'open'}));
  let st={x:0,bekal:5,pause:0,jump:0,over:false,started:false,cur:0,passed:0}, last=performance.now(), rid;
  const endX=6+(N-1)*GAP+3;
  function drawCart(X,Y,b){ px(c,X,Y+6,20,8,'#A86B3C');px(c,X,Y+6,20,2,'#C98A52');px(c,X+2,Y+14,5,5,'#2B1D12');px(c,X+13,Y+14,5,5,'#2B1D12');px(c,X+3,Y+15,3,3,'#9A9A9A');px(c,X+14,Y+15,3,3,'#9A9A9A');
    for(let i=0;i<b;i++){px(c,X+1+i*4,Y+1-(i%2),4,5,'#F2E2C0');px(c,X+1+i*4,Y+3-(i%2),4,1,'#E0702F');} px(c,X+20,Y+8,6,1,'#6E4426'); }
  function drawScene(t){
    const prog=Math.min(1,st.x/endX);
    const sky=prog<.6?'#8FD3F4':prog<.85?'#F6B26B':'#E8875A';
    px(c,0,0,W,H,sky); px(c,W-30,10+Math.round(prog*24),12,12,prog<.6?'#FFF3A0':'#FF9B4A');
    px(c,0,50,W,38,'#5DBB4A');
    const cam=st.x*SC-CARTX;
    for(let i=-1;i<8;i++){const x=Math.round(i*40-((cam*0.5)%40));drawTree(c,x,32,i%2);}
    px(c,0,64,W,16,'#D9B77A'); for(let i=-1;i<14;i++){const x=Math.round(i*16-(cam%16));px(c,x,72,6,1,'#C9A465');}
    const vx=Math.round(endX*SC-cam); if(vx<W+40){drawHut(c,vx,34,'#C8463A','#F2E2C0');drawHut(c,vx+34,34,'#3A78C9','#F2E2C0');}
    obs.forEach(o=>{ if(o.state==='done'||o.state==='hit') return; const ox=Math.round(o.x*SC-cam); if(ox<-10||ox>W) return;
      if(o.kind==='rock'){px(c,ox,66,10,7,'#8E8E8E');px(c,ox+2,64,6,3,'#A8A8A8');px(c,ox+1,66,3,2,'#C8C8C8');}
      else {px(c,ox-1,70,13,5,'#4A3020');px(c,ox+1,69,9,1,'#6E4426');}
      if(o.state==='ok'){px(c,ox+3,58,4,4,'#7CD35E');} });
    const jy=st.jump>0?-Math.round(Math.sin((1-st.jump/0.6)*Math.PI)*12):0;
    const fr=Math.floor(t/140)%2;
    drawCart(CARTX-24,54+jy,st.bekal); drawKid(c,CARTX,58+jy,S.avatar,st.pause>0?0:f4(),null,3);
    if(st.pause>0){px(c,CARTX+4,50,4,4,'#F4B400');}
  }
  function nextQuestion(){ if(st.over) return; const o=obs.find(o=>o.state==='open'); if(!o){ v.querySelector('.qh').innerHTML='<div class="qprompt"><div class="lead">Hampir sampai!</div></div>'; return; }
    o.state='asking'; const q=makeQ(B.pool);
    renderQ(v.querySelector('.qh'),q,(ok,ms,fb)=>{ if(st.over) return;
      if(o.state!=='asking'){fb.className='fb bad';fb.textContent='Terlambat! Gerobak sudah sampai di rintangan.';return;}
      if(ok){o.state='ok';S.lv[q.w.a]=Math.min(3,lv(q.w.a)+1);sfx.boost();fb.className='fb good';fb.textContent=ms<3000?'Cepat sekali!':'Siap melompat!';st.streak=(st.streak||0)+1;if(st.streak%3===0){comboPop(st.streak);voice('combo');}}
      else {o.state='bad';st.streak=0;sfx.bad();fb.className='fb bad';fb.textContent='Ups! Lihat jawaban yang hijau.';}
      save(); setTimeout(nextQuestion, ok?500:1300); }); }
  function frameLoop(t){ rid=requestAnimationFrame(frameLoop); const dt=Math.min(0.1,(t-last)/1000); last=t;
    if(!document.body.contains(v)){cancelAnimationFrame(rid);return;}
    if(st.started&&!st.over){
      const waiting=obs.some(o=>o.state==='asking');
      const sp=waiting?SPEED:(obs.some(o=>o.state==='open')?3.2:4.5);
      if(st.pause>0) st.pause-=dt; else st.x+=sp*dt;
      if(st.jump>0) st.jump=Math.max(0,st.jump-dt);
      obs.forEach(o=>{ if(o.state==='done'||o.state==='hit') return; if(st.x>=o.x-0.4){
        if(o.state==='ok'){o.state='done';st.jump=0.6;sfx.good();}
        else { if(o.state==='asking'){o.state='hit';setTimeout(nextQuestion,900);} else o.state='hit';
          st.bekal=Math.max(0,st.bekal-1);st.pause=0.9;sfx.bad(); }
        st.passed++; v.querySelector('#ob').textContent=st.passed; v.querySelector('#bk').textContent=st.bekal; } });
      if(st.x>=endX){ st.over=true; finish(); }
    }
    drawScene(t);
  }
  function finish(){
    if(st.bekal===0){ const box=$(`<div class="frame" style="margin-top:10px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--red)">Bekalnya jatuh semua…</div><p>Tidak apa-apa. Ayo coba lagi, jawab sebelum gerobak sampai di rintangan.</p><button class="btn green block">Coba lagi ▸</button></div>`); box.querySelector('button').onclick=()=>{closePanel();cartGame();}; v.querySelector('.frame').replaceWith(box); return; }
    const first=!S.trophies.boss3; S.trophies.boss3=true; if(first){const gn=giverNo('boss3'); S.leaving={no:gn,from:SPOT['boss3']};} const coins=first?10*st.bekal+20:5*st.bekal; S.coins+=coins; S.best3=Math.max(S.best3||0,st.bekal); save(); addXP(first?80:repXP('boss3',15));
    sfx.fanfare(); voice(st.bekal===5?'flawless_victory':'winner');
    setTimeout(()=>celebrate(`${st.bekal} bekal sampai!`,`Anak-anak yatim senang sekali. +${coins} Koin Makna.${st.bekal<5?' Main lagi dari Lemari Piala untuk mengantar 5 bekal.':''}`,ICON.trophy('#7CD35E'),()=>{closePanel();farm();
      if(first) setTimeout(()=>dialog(QUEST[107],['Terima kasih, {n}! Lihat wajah anak-anak itu, mereka tersenyum.','Ingat Al-Ma\'un: jangan menghardik anak yatim, dan ajak orang memberi makan orang miskin.','Sekarang Pak Hasan si pedagang sedang mencarimu.']),60);}),700);
  }
  const qh=v.querySelector('.qh'); qh.innerHTML='<div class="qprompt"><div style="font-size:40px;font-weight:700">Siap…</div></div>';
  voice('ready'); setTimeout(()=>{st.started=true;last=performance.now();nextQuestion();},1300);
  rid=requestAnimationFrame(frameLoop);
}

/* ---------- BOSS 4: caterpillar attack (Al-Fil: "seperti daun yang dimakan ulat") ---------- */
export function pestGame(){
  const B=BOSS.boss4;
  const pn=panel(B.title,'Jawab benar untuk memanggil burung pemakan ulat.',()=>{},()=>farm());
  const body=pn.querySelector('.pbody');
  const W=192,H=112, LANES=5, LY=i=>14+i*19, PLANTX=10, TOTAL=12;
  const v=$(`<div><canvas class="mg" width="${W}" height="${H}"></canvas><div class="mgbar"><span>Tanaman selamat: <span id="pl">5</span>/5</span><span>Ulat: <span id="ul">0</span>/${TOTAL}</span></div><div class="frame"><div class="qh"></div></div></div>`);
  body.append(v); const c=hdCanvas(v.querySelector('canvas'),W,H);
  const plants=Array.from({length:LANES},()=>({hp:3}));
  let worms=[], birds=[], spawned=0, cleared=0, nextSpawn=1.5, over=false, started=false, streak=0, last=performance.now(), rid, time=0;
  function drawPlant(X,Y,hp){ if(hp<=0){px(c,X+5,Y+8,3,4,'#6E4426');return;} px(c,X+6,Y+4,2,9,'#3E8E35'); if(hp>=1)px(c,X+1,Y+6,5,4,'#5DBB4A'); if(hp>=2)px(c,X+8,Y+5,5,4,'#5DBB4A'); if(hp>=3)px(c,X+3,Y,7,5,'#4CA63C'); }
  function drawWorm(X,Y,t){ const w=Math.floor(t/200)%2; for(let i=0;i<4;i++)px(c,X+i*3,Y+(i%2===w?0:1),3,3,i===0?'#7CB342':'#9CCC65'); px(c,X,Y,1,1,'#2B1D12'); }
  function drawBird(X,Y,t){ const f=Math.floor(t/90)%2; px(c,X,Y+2,6,3,'#5A3820'); px(c,X+5,Y+1,2,2,'#5A3820'); px(c,X+7,Y+2,2,1,'#F4B400'); px(c,X+1,Y+(f?-1:3),4,2,'#8E5A33'); }
  function drawScene(t){
    px(c,0,0,W,H,'#8A5A33'); for(let i=0;i<LANES;i++){px(c,0,LY(i)+12,W,2,'#6E4426');}
    px(c,0,0,22,H,'#5A3A22');
    plants.forEach((p,i)=>drawPlant(PLANTX-6,LY(i)-2,p.hp));
    worms.forEach(wm=>drawWorm(Math.round(wm.x),LY(wm.lane)+6,t));
    birds.forEach(b=>drawBird(Math.round(b.x),Math.round(b.y),t));
  }
  function target(){ return worms.filter(w=>!w.targeted).sort((a,b)=>a.x-b.x)[0]; }
  function sendBird(){ const w=target(); if(!w) return false; w.targeted=true; birds.push({x:W-10,y:-6,w}); return true; }
  function frameLoop(t){ rid=requestAnimationFrame(frameLoop); const dt=Math.min(0.1,(t-last)/1000); last=t;
    if(!document.body.contains(v)){cancelAnimationFrame(rid);return;}
    if(started&&!over){ time+=dt;
      if(!worms.length&&nextSpawn>0.7) nextSpawn=0.7; nextSpawn-=dt; if(nextSpawn<=0&&spawned<TOTAL){ const alive=plants.map((p,i)=>i).filter(i=>plants[i].hp>0); const lane=alive.length?pick(alive):Math.floor(Math.random()*LANES); worms.push({x:W,lane,targeted:false}); spawned++; nextSpawn=3.6+Math.random()*1.2; v.querySelector('#ul').textContent=spawned; }
      worms.forEach(w=>{ w.x-=11*dt; });
      worms=worms.filter(w=>{ if(w.x<=PLANTX+4){ const p=plants[w.lane]; if(p.hp>0){p.hp--;sfx.bad();} birds=birds.filter(b=>b.w!==w); return false;} return true; });
      birds.forEach(b=>{ const tx=b.w.x, ty=LY(b.w.lane)+2; const dx=tx-b.x, dy=ty-b.y, d=Math.hypot(dx,dy); const sp=150*dt; if(d<=sp){ b.done=true; } else { b.x+=dx/d*sp; b.y+=dy/d*sp; } });
      birds.filter(b=>b.done).forEach(b=>{ worms=worms.filter(w=>w!==b.w); cleared++; sfx.coin(); });
      birds=birds.filter(b=>!b.done);
      v.querySelector('#pl').textContent=plants.filter(p=>p.hp>0).length;
      if(spawned>=TOTAL&&!worms.length&&!birds.length){ over=true; finish(); }
    }
    drawScene(t);
  }
  const ask=()=>{ if(over) return; const q=makeQ(B.pool);
    renderQ(v.querySelector('.qh'),q,(ok,ms,fb)=>{ if(over) return;
      if(ok){ const n=ms<3000?2:1; let sent=0; for(let i=0;i<n;i++) if(sendBird()) sent++; streak++; S.lv[q.w.a]=Math.min(3,lv(q.w.a)+1); sfx.boost(); fb.className='fb good'; fb.textContent=sent?(n===2?'Dua burung datang!':'Burung datang!'):'Benar! Belum ada ulat, burung siaga.'; if(streak%3===0){comboPop(streak);voice('combo');} }
      else { streak=0; sfx.bad(); fb.className='fb bad'; fb.textContent='Belum tepat. Lihat jawaban yang hijau.'; }
      save(); setTimeout(ask, ok?450:1300); }); };
  function finish(){
    const saved=plants.filter(p=>p.hp>0).length;
    if(saved===0){ const box=$(`<div class="frame" style="margin-top:10px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--red)">Tanamannya habis dimakan ulat…</div><p>Ayo coba lagi. Jawab lebih cepat supaya datang dua burung sekaligus.</p><button class="btn green block">Coba lagi ▸</button></div>`); box.querySelector('button').onclick=()=>{closePanel();pestGame();}; v.querySelector('.frame').replaceWith(box); return; }
    const first=!S.trophies.boss4; S.trophies.boss4=true; if(first){const gn=giverNo('boss4'); S.leaving={no:gn,from:SPOT['boss4']};} const coins=first?60+10*saved:5*saved; S.coins+=coins; S.best4=Math.max(S.best4||0,saved); save(); addXP(first?80:repXP('boss4',15));
    sfx.fanfare(); voice(saved===5?'flawless_victory':'winner');
    setTimeout(()=>celebrate(`${saved} tanaman selamat!`,`Ulatnya habis! +${coins} Koin Makna.`,ICON.trophy('#3A9D6A'),()=>{closePanel();farm();
      if(first) setTimeout(()=>dialog(QUEST[110],['{n}, selama ini kamu sudah banyak membantu warga.','Kamu menjawab masalah mereka dengan Al-Qur\'an, menangkap maling, mengantar bekal untuk anak yatim, dan menyelamatkan kebun dari hama.'+(Object.values(S.vh||{}).filter(Boolean).length?` Kamu juga sudah membantu memperbaiki ${Object.values(S.vh).filter(Boolean).length} rumah warga.`:''),'Karena kontribusimu untuk desa, aku menghadiahkan tanah di ujung timur: 6 petak baru untukmu!','Terima kasih, {n}. Barakallahu fiik.'],[['Lihat tanahnya ▸',()=>{S.pos={x:19,y:4};save();farm();},'green']]),60);}),700);
  }
  const qh=v.querySelector('.qh'); qh.innerHTML='<div class="qprompt"><div style="font-size:40px;font-weight:700">Siap…</div></div>';
  voice('ready'); setTimeout(()=>{started=true;last=performance.now();ask();},1300);
  rid=requestAnimationFrame(frameLoop);
}

