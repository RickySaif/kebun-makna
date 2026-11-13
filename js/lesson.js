// lesson.js — split verbatim from the classic single-file game (Phase 0).
import { hooks } from './hooks.js';
import { play, sfx, stopAudio, voice } from './audio.js';
import { AA, AW, BY, COIN_PER_AYAH, DATA, EXPLAIN, QUEST } from './data.js';
import { dialog, farm, idleDialog, shop, well } from './farm.js';
import { addReview, addXP, checkSurahLevels, repXP } from './progress.js';
import { SPOT, portrait, px } from './render.js';
import { S, bump, fill, lv, save, surahDone } from './state.js';
import { $, closePanel, esc, panel, pick, praiseLine, shuffle } from './ui.js';

/* ---------- lesson ---------- */
export function lessonStart(no){ const j=BY[no].ayat.findIndex(a=>!S.ay[a.a]); lesson(no,j<0?0:j,false); }
export function lesson(no,j,review){
  const s=BY[no],a=s.ayat[j]; const steps=['Dengar','Kenali','Cocokkan','Susun'];
  const p=panel(`${s.name} · Ayat ${a.n} dari ${s.ayat.length}`,review?'Murajaah':`Membantu ${QUEST[no].npc}`,()=>{});
  const body=p.querySelector('.pbody');
  const bar=$(`<div class="steps">${steps.map(()=>'<i></i>').join('')}</div>`); body.before(bar);
  const mist={match:0,arrange:0};
  function go(n){ stopAudio(); [...bar.children].forEach((x,k)=>x.className=k<n?'past':k===n?'on':'');
    const between=f=>hooks.afterStep?hooks.afterStep({n,body,bar,s,a,review,next:()=>{p.scrollTop=0;f();}}):f(); // v4: reading practice between steps
    body.replaceChildren([dengar,kenali,cocokkan,susun][n](s,a,()=>n<3?between(()=>go(n+1)):(hooks.afterAyah?hooks.afterAyah({body,bar,s,a,review,next:finish}):finish()),mist)); p.scrollTop=0; }
  function finish(){
    const first=!S.ay[a.a]; S.ay[a.a]=true; a.w.forEach(w=>bump(w.a,2));
    const stars=1+(mist.match===0?1:0)+(mist.arrange===0?1:0); S.stars[a.a]=Math.max(S.stars[a.a]||0,stars);
    const coins=first?COIN_PER_AYAH:2; S.coins+=coins; save();
    sfx.fanfare(); voice(stars===3?'flawless_victory':'you_win',150);
    addXP(first?20+5*stars:repXP('ay'+a.a,10));
    const lastAyah=j===s.ayat.length-1;
    celebrate(praiseLine(),`Ayat ${a.n} ${s.name} selesai. +${coins} Koin Makna!`,null,()=>{
      if(review){closePanel();well();return;}
      if(!lastAyah){lesson(no,j+1,false);return;}
      if(surahDone(no)&&!S.solved[no]&&!S.whole[no]){ closePanel(); suratUtuh(no,false); return; }
      if(surahDone(no)&&!S.solved[no]){ S.solved[no]=true; S.leaving={no,from:SPOT[no]}; save(); closePanel(); farm();
        setTimeout(()=>dialog(QUEST[no],QUEST[no].done,[['Ke Toko Benih',shop,'green'],['Nanti',idleDialog,'ghost']]),50); }
      else {closePanel();farm();}
    },stars);
  }
  go(0);
}
export function celebrate(title,sub,img,next,stars){
  const c=$(`<div class="celebrate"><div class="frame pop"><canvas class="burst" width="40" height="40"></canvas>${stars?`<div class="stars">${[1,2,3].map(k=>k<=stars?'<b>★</b>':'☆').join('')}</div>`:''}<div class="big">${esc(title)}</div><p style="margin:0 0 12px">${esc(sub)}</p><button class="btn green block">Lanjut ▸</button></div></div>`);
  const cv2=c.querySelector('canvas'),g=cv2.getContext('2d');let t0=performance.now(),rid;
  const im=img?Object.assign(new Image(),{src:img}):null;
  (function anim(t){rid=requestAnimationFrame(anim);const k=(t-t0)/1000;g.clearRect(0,0,40,40);
    for(let i=0;i<10;i++){const ang=i/10*Math.PI*2+k,r=8+((k*14)%10);px(g,Math.round(20+Math.cos(ang)*r)-1,Math.round(20+Math.sin(ang)*r)-1,2,2,i%2?'#F4B400':'#E56B8A');}
    if(im&&im.complete) g.drawImage(im,4,4,32,32); else {px(g,14,10,12,20,'#F4B400');px(g,10,14,20,12,'#F4B400');px(g,16,12,3,16,'#FFE07A');}})(t0);
  c.querySelector('button').onclick=()=>{cancelAnimationFrame(rid);c.remove();next();};
  document.body.append(c); sfx.coin();
}

export function dengar(s,a,next){
  const v=$(`<div class="frame"><h2>Dengarkan ayatnya</h2><p class="lead">Perhatikan kata yang menyala saat dibaca.</p><div class="ayahbig ar" lang="ar"></div><div class="trans"><b>Artinya:</b> ${esc(a.tr)}</div><div class="row" style="margin-top:12px"><button class="btn blue" id="pl">▶ Putar lagi</button></div><button class="btn green block" id="nx" style="margin-top:12px" disabled>Lanjut ▸</button></div>`);
  const box=v.querySelector('.ayahbig');
  box.replaceChildren(...a.w.flatMap((w,i)=>{const sp=$(`<span>${esc(w.ar)}</span>`);return i?[document.createTextNode(' '),sp]:[sp];}));
  const spans=[...box.querySelectorAll('span')], nx=v.querySelector('#nx');
  const run=async()=>{ await play(AA(a.a),ms=>{const i=a.t.findIndex((x,k)=>ms>=x&&ms<a.t[k+1]);spans.forEach((sp,k)=>sp.classList.toggle('now',k===i));}); spans.forEach(sp=>sp.classList.remove('now')); nx.disabled=false; };
  v.querySelector('#pl').onclick=run; nx.onclick=next; setTimeout(()=>{nx.disabled=false;},(a.t[a.t.length-1]||5000)+800);
  run(); return v;
}
export function kenali(s,a,next){
  const v=$(`<div class="frame"><h2>Kenali setiap kata</h2><p class="lead">Ketuk kartu. Bunyinya sama persis dengan bacaan ayat tadi.</p><div class="cards"></div><button class="btn blue" id="all" style="margin-top:12px">▶ Dengar ayat utuh</button><button class="btn green block" id="nx" style="margin-top:12px" disabled>Lanjut ▸</button></div>`);
  const cards=v.querySelector('.cards'),opened=new Set(),nx=v.querySelector('#nx');
  a.w.forEach((w,k)=>{const c=$(`<button class="card" aria-label="Kata ${k+1}"><div><div class="ar w" lang="ar">${esc(w.ar)}</div><div class="tap">ketuk</div></div></button>`);
    c.onclick=async()=>{ if(!opened.has(k)){opened.add(k);const isNew=lv(w.a)<1;bump(w.a,1);c.classList.add('open','pop');c.innerHTML=`<div><div class="ar w" lang="ar">${esc(w.ar)}</div>${w.emo?`<div class="e">${w.emo}</div>`:''}<div class="m">${esc(w.id)}</div>${isNew?'<div class="tap" style="color:#B8860B">+ kartu baru!</div>':''}</div>`;sfx.good();if(opened.size===a.w.length)nx.disabled=false;}
      cards.querySelectorAll('.playing').forEach(x=>x.classList.remove('playing'));c.classList.add('playing');await play(AW(w.a));c.classList.remove('playing');};
    cards.append(c);});
  v.querySelector('#all').onclick=()=>play(AA(a.a),ms=>{const i=a.t.findIndex((x,k)=>ms>=x&&ms<a.t[k+1]);[...cards.children].forEach((c,k)=>c.classList.toggle('playing',k===i));}).then(()=>[...cards.children].forEach(c=>c.classList.remove('playing')));
  nx.onclick=next; return v;
}
export function poolFor(s,a){ let list=a.w.slice(); const m=new Set(list.map(w=>w.id)),r=new Set(list.map(w=>w.ar));
  if(list.length<4){for(const ay of s.ayat){if(ay.n>=a.n)break;for(const w of ay.w){if(list.length>=4)break;if(!m.has(w.id)&&!r.has(w.ar)){list.push(w);m.add(w.id);r.add(w.ar);}}}}
  const out=[],mm=new Set(),rr=new Set();for(const w of list){if(mm.has(w.id)||rr.has(w.ar))continue;mm.add(w.id);rr.add(w.ar);out.push(w);}return out; }
export function cocokkan(s,a,next,mist){
  const items=poolFor(s,a);
  const v=$(`<div class="frame"><h2>Cocokkan arti</h2><p class="lead">Ketuk kata Arab, lalu ketuk artinya.</p><div class="match"><div class="col" data-c="ar"></div><div class="col" data-c="mn"></div></div><div class="fb" aria-live="polite"></div><button class="btn green block" id="nx" style="margin-top:12px" disabled>Lanjut ▸</button></div>`);
  const L=v.querySelector('[data-c=ar]'),R=v.querySelector('[data-c=mn]'),fb=v.querySelector('.fb'),nx=v.querySelector('#nx');let sel=null,left=items.length;
  shuffle(items).forEach(w=>{const c=$(`<button class="chip2 ar" lang="ar">${esc(w.ar)}</button>`);c._w=w;c.onclick=()=>{L.querySelectorAll('.sel').forEach(x=>x.classList.remove('sel'));c.classList.add('sel');sel=c;play(AW(w.a));};L.append(c);});
  shuffle(items).forEach(w=>{const c=$(`<button class="chip2 mn">${esc(w.id)}</button>`);c._w=w;c.onclick=()=>{
    if(!sel){fb.className='fb';fb.textContent='Pilih kata Arabnya dulu, ya.';return;}
    if(sel._w===c._w){sel.classList.remove('sel');sel.classList.add('good');c.classList.add('good');bump(w.a,2);sfx.good();fb.className='fb good';fb.textContent=pick(['Benar!','Hebat!','Pintar!','MasyaAllah!']);sel=null;if(--left===0)nx.disabled=false;}
    else{mist.match++;c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake');sfx.bad();fb.className='fb bad';fb.textContent='Belum tepat, coba lagi ya.';}};R.append(c);});
  nx.onclick=next; return v;
}
export function susun(s,a,next,mist){
  const v=$(`<div class="frame"><h2>Susun ayatnya</h2><p class="lead">Ketuk kata sesuai urutan bacaan, dari kanan ke kiri. Ketuk kotak untuk mengembalikan kata.</p><div class="slots"></div><div class="pool"></div><div class="fb" aria-live="polite"></div><div class="row" style="margin-top:10px"><button class="btn blue" id="pl">▶ Dengar ayat</button></div><button class="btn green block" id="nx" style="margin-top:12px" disabled>Cek susunan</button></div>`);
  const slots=v.querySelector('.slots'),pool=v.querySelector('.pool'),fb=v.querySelector('.fb'),nx=v.querySelector('#nx');
  const placed=new Array(a.w.length).fill(null);let solved=false;const els=new Map();
  shuffle(a.w.map((w,k)=>({w,k}))).forEach(t=>{const el=$(`<button class="tile"><span class="ar w" lang="ar">${esc(t.w.ar)}</span></button>`);el.onclick=()=>{if(solved)return;const i=placed.indexOf(null);if(i<0)return;placed[i]=t;el.classList.add('used');play(AW(t.w.a));render();};els.set(t,el);pool.append(el);});
  function render(){slots.replaceChildren(...placed.map((t,i)=>{const sl=$(`<button class="slot${t?' filled':''}" aria-label="Posisi ${i+1}">${t?`<span class="ar" lang="ar" style="font-size:28px">${esc(t.w.ar)}</span>`:''}</button>`);sl.onclick=()=>{if(solved||!t)return;placed[i]=null;els.get(t).classList.remove('used');fb.textContent='';render();};return sl;}));nx.disabled=placed.includes(null)&&!solved;}
  render(); v.querySelector('#pl').onclick=()=>play(AA(a.a));
  nx.onclick=()=>{ if(solved){next();return;} const wrong=placed.map((t,i)=>t.k!==i);
    if(wrong.some(Boolean)){mist.arrange++;sfx.bad();fb.className='fb bad';fb.textContent='Hampir! Kotak merah belum di tempatnya. Dengar ayatnya lagi kalau perlu.';[...slots.children].forEach((sl,i)=>sl.classList.toggle('bad',wrong[i]));}
    else{solved=true;sfx.good();fb.className='fb good';fb.textContent='Susunannya benar!';v.insertBefore($(`<div class="trans pop"><b>Artinya:</b> ${esc(a.tr)}</div>`),v.querySelector('.row'));nx.textContent='Selesai ▸';play(AA(a.a));} };
  return v;
}

/* ---------- question generator (watering + bosses) ---------- */
export function learnedWords(nos){ return nos.flatMap(n=>BY[n].ayat.filter(a=>S.ay[a.a]).flatMap(a=>a.w.map(w=>({w,a,no:n})))); }
export function weighted(list){ const tot=list.reduce((s,x)=>s+(4-Math.min(3,lv(x.w.a))),0); let r=Math.random()*tot; for(const x of list){r-=4-Math.min(3,lv(x.w.a)); if(r<=0) return x;} return list[0]; }
export function makeQ(nos,types){
  const L=learnedWords(nos); if(!L.length) return null;
  const allW=[...new Map(DATA.flatMap(s=>s.ayat.flatMap(a=>a.w)).map(w=>[w.id,w])).values()];
  const learnedNos=nos.filter(n=>BY[n].ayat.some(a=>S.ay[a.a]));
  let type=pick(types||['meaning','meaning','listen','next','surah']);
  if(type==='surah'&&learnedNos.length<2) type='meaning';
  const it=weighted(L), w=it.w;
  if(type==='next'){ const k=it.a.w.indexOf(w); if(k<1) type='meaning'; else {
    const others=shuffle([...new Map(L.map(x=>x.w).filter(x=>x.ar!==w.ar).map(x=>[x.ar,x])).values()]).slice(0,2);
    if(others.length<2) type='meaning'; else {
    const opts=shuffle([w,...others]);
    return {w,html:`<div class="lead">Kata apa sesudahnya?</div><div class="ar ayah" lang="ar">${it.a.w.slice(0,k).map(x=>esc(x.ar)).join(' ')} …</div>`,opts:opts.map(o=>({label:o.ar,ar:true,ok:o===w})),audio:null}; } } }
  if(type==='surah'){ const opts=shuffle([it.no,...shuffle(learnedNos.filter(n=>n!==it.no)).slice(0,2)]);
    return {w,html:`<div class="lead">Ayat ini dari surat apa?</div><div class="ar ayah" lang="ar">${esc(it.a.ar)}</div>`,opts:opts.map(n=>({label:BY[n].name,ok:n===it.no})),audio:AA(it.a.a)}; }
  if(type==='listen'){ const others=shuffle([...new Map(L.map(x=>x.w).filter(x=>x.ar!==w.ar).map(x=>[x.ar,x])).values()]).slice(0,2);
    if(others.length>=2){ const opts=shuffle([w,...others]); return {w,html:`<div class="lead">Dengarkan! Kata mana yang dibaca?</div><button class="btn blue" data-replay>▶ Dengar lagi</button>`,opts:opts.map(o=>({label:o.ar,ar:true,ok:o===w})),audio:AW(w.a)}; } }
  const opts=shuffle([w,...shuffle(allW.filter(x=>x.id!==w.id&&x.ar!==w.ar)).slice(0,2)]);
  return {w,html:`<div class="lead">Apa artinya?</div><div class="ar" lang="ar">${esc(w.ar)}</div>`,opts:opts.map(o=>({label:o.id,ok:o===w})),audio:AW(w.a)};
}
export function renderQ(host,q,onAnswer){
  const v=$(`<div><div class="qprompt">${q.html}</div><div class="opts">${q.opts.map((o,n)=>`<button class="opt${o.ar?' ar':''}" ${o.ar?'lang="ar"':''} data-n="${n}">${esc(o.label)}</button>`).join('')}</div><div class="fb" aria-live="polite"></div></div>`);
  if(q.audio) play(q.audio); const rp=v.querySelector('[data-replay]'); if(rp) rp.onclick=()=>play(q.audio);
  const t0=performance.now(); let ans=false;
  v.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ if(ans) return; ans=true; const o=q.opts[+b.dataset.n]; const ms=performance.now()-t0;
    if(o.ok){b.classList.add('good');} else {b.classList.add('bad');v.querySelectorAll('.opt')[q.opts.findIndex(x=>x.ok)].classList.add('good');}
    onAnswer(o.ok,ms,v.querySelector('.fb')); });
  host.replaceChildren(v);
}

/* ---------- Surat Utuh ---------- */
export function suratUtuh(no,review){
  const s=BY[no], Q=QUEST[no];
  const pn=panel(`Surat Utuh · ${s.name}`,review?'Murajaah surat utuh':`Langkah terakhir membantu ${Q.npc}`,()=>{});
  const body=pn.querySelector('.pbody');
  const bar=$(`<div class="steps"><i></i><i></i><i></i></div>`); body.before(bar);
  let mist=0;
  const go=n=>{ stopAudio(); [...bar.children].forEach((x,k)=>x.className=k<n?'past':k===n?'on':''); body.replaceChildren([cerita,urutan,jelaskan][n](()=>n<2?go(n+1):finish())); pn.scrollTop=0; };
  function cerita(next){
    const v=$(`<div class="frame"><h2>Cerita Surat ${esc(s.name)}</h2><p class="lead">Dengarkan surat utuh. Arti tiap ayat muncul seperti cerita. Nanti ada jeda pertanyaan.</p><div class="story"></div><div class="qh"></div><button class="btn green block" id="nx" style="margin-top:12px" hidden>Lanjut ▸</button></div>`);
    const story=v.querySelector('.story'), qh=v.querySelector('.qh');
    const checkAt=new Set([Math.floor((s.ayat.length-1)/2), s.ayat.length-1]);
    let i=0;
    const playNext=async()=>{
      if(!document.body.contains(v)) return;
      if(i>=s.ayat.length){ v.querySelector('#nx').hidden=false; story.querySelectorAll('.srow').forEach(r=>r.classList.remove('now')); return; }
      const a=s.ayat[i]; const row=$(`<div class="srow now"><span class="n">${a.n}</span><div class="ar" lang="ar">${esc(a.ar)}</div><div class="tr">${esc(a.tr)}</div></div>`);
      story.querySelectorAll('.srow').forEach(r=>r.classList.remove('now')); story.append(row);
      await play(AA(a.a));
      if(!document.body.contains(v)) return;
      const k=i; i++;
      if(checkAt.has(k)) ask(k); else setTimeout(playNext,250);
    };
    const ask=k=>{ const a=s.ayat[k]; const opts=shuffle([a,...shuffle(s.ayat.filter(x=>x!==a)).slice(0,2)]);
      const q=$(`<div class="frame" style="margin-top:10px;background:#FFF6CC"><b>Jeda sebentar!</b> Ayat ${a.n} yang baru dibaca artinya apa?<div class="opts">${opts.map((o,n)=>`<button class="opt" data-n="${n}" style="font-weight:500">${esc(o.tr)}</button>`).join('')}</div><div class="fb"></div></div>`);
      qh.replaceChildren(q);
      let ans=false; q.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ if(ans) return; ans=true; const o=opts[+b.dataset.n]; const fb=q.querySelector('.fb');
        if(o===a){b.classList.add('good');sfx.good();fb.className='fb good';fb.textContent='Benar! Lanjut ceritanya…';} else {mist++;b.classList.add('bad');q.querySelectorAll('.opt')[opts.indexOf(a)].classList.add('good');sfx.bad();fb.className='fb bad';fb.textContent='Yang benar yang hijau. Lanjut…';}
        setTimeout(()=>{qh.replaceChildren();playNext();},1400); }); };
    v.querySelector('#nx').onclick=next;
    setTimeout(playNext,300); return v;
  }
  function urutan(next){
    const v=$(`<div class="frame"><h2>Susun urutan ayat</h2><p class="lead">Ketuk ayat dari yang pertama sampai yang terakhir. Ketuk ▶ untuk mendengar ayatnya dulu.</p><div class="ostack"></div><div class="pool2"></div><div class="fb"></div><button class="btn green block" id="nx" style="margin-top:12px" disabled>Cek urutan</button></div>`);
    const stack=v.querySelector('.ostack'), pool=v.querySelector('.pool2'), fb=v.querySelector('.fb'), nx=v.querySelector('#nx');
    const placed=[]; let solved=false; const els=new Map();
    shuffle(s.ayat.map((a,k)=>({a,k}))).forEach(it=>{ const el=$(`<div class="aytile"><button class="pl" aria-label="Dengar ayat">▶</button><button class="tx ar" lang="ar">${esc(it.a.ar)}</button></div>`);
      el.querySelector('.pl').onclick=()=>play(AA(it.a.a));
      el.querySelector('.tx').onclick=()=>{ if(solved||placed.includes(it)) return; placed.push(it); el.classList.add('used'); play(AA(it.a.a)); render(); };
      els.set(it,el); pool.append(el); });
    function render(){ stack.replaceChildren(...placed.map((it,i)=>{ const r=$(`<button class="orow"><span class="num">${i+1}</span><span class="ar" lang="ar">${esc(it.a.ar)}</span></button>`); r.onclick=()=>{ if(solved) return; placed.splice(i,1); els.get(it).classList.remove('used'); fb.textContent=''; render(); }; return r; }));
      if(!placed.length) stack.append($(`<div class="hint" style="padding:8px">Ayat pertama ditaruh di sini…</div>`)); nx.disabled=placed.length<s.ayat.length&&!solved; }
    render();
    nx.onclick=()=>{ if(solved){next();return;} const wrong=placed.map((it,i)=>it.k!==i);
      if(wrong.some(Boolean)){ mist++; sfx.bad(); fb.className='fb bad'; fb.textContent='Ada yang belum di tempatnya (merah). Ketuk untuk mengembalikan, lalu coba lagi.'; [...stack.querySelectorAll('.orow')].forEach((r,i)=>r.classList.toggle('bad',wrong[i])); }
      else { solved=true; sfx.good(); fb.className='fb good'; fb.textContent='Urutannya benar!'; nx.textContent='Lanjut ▸'; } };
    return v;
  }
  function jelaskan(next){
    const E=EXPLAIN[no]; const a=s.ayat[E.ayah-1]; const opts=shuffle([a,...shuffle(s.ayat.filter(x=>x!==a)).slice(0,2)]);
    const v=$(`<div class="frame"><h2>Jelaskan ke ${esc(Q.npc)}</h2><div style="display:flex;gap:10px;align-items:flex-start;margin:6px 0 4px"><img alt="" src="${portrait(Q.look)}" style="width:56px;height:56px;border:3px solid var(--ink);border-radius:4px;image-rendering:pixelated;flex:none"><div><div style="font-weight:700;color:var(--red)">${esc(Q.npc)}</div><p style="margin:2px 0 0">${esc(fill(E.q))}</p></div></div>
      <div class="opts">${opts.map((o,n)=>`<button class="opt" data-n="${n}"><span class="ar" lang="ar" style="display:block;font-size:24px;text-align:right;line-height:1.9">${esc(o.ar)}</span><span style="font-weight:500">${esc(o.tr)}</span></button>`).join('')}</div><div class="fb"></div><button class="btn green block" id="nx" style="margin-top:12px" hidden>Lanjut ▸</button></div>`);
    let fin=false;
    v.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ if(fin) return; const o=opts[+b.dataset.n]; const fb=v.querySelector('.fb'); play(AA(o.a));
      if(o===a){ fin=true; b.classList.add('good'); sfx.good(); fb.className='fb good'; fb.textContent=`${Q.npc}: "${fill(E.yes)}"`; v.querySelector('#nx').hidden=false; }
      else { mist++; b.classList.add('bad'); sfx.bad(); fb.className='fb bad'; fb.textContent='Hmm, ayat itu membahas hal lain. Coba pilih ayat yang lain.'; setTimeout(()=>b.classList.remove('bad'),900);} });
    v.querySelector('#nx').onclick=next; return v;
  }
  function finish(){
    const first=!S.whole[no]; S.whole[no]=true; const stars=mist===0?3:mist<=2?2:1; S.wholeStars[no]=Math.max(S.wholeStars[no]||0,stars);
    const coins=first?20:3; S.coins+=coins; save();
    sfx.fanfare(); voice(stars===3?'flawless_victory':'winner',150);
    const xp=first?50:repXP('whole'+no,10);
    celebrate(`Surat ${s.name} utuh!`,`Kamu memahami surat ini dari awal sampai akhir. +${coins} koin.`,null,()=>{
      if(!first) addReview(no);
      addXP(xp); checkSurahLevels();
      if(review||S.solved[no]){ closePanel(); farm(); return; }
      S.solved[no]=true; S.leaving={no,from:SPOT[no]}; save(); closePanel(); farm();
      setTimeout(()=>dialog(QUEST[no],QUEST[no].done,[['Ke Toko Benih',shop,'green'],['Nanti',idleDialog,'ghost']]),50);
    },stars);
  }
  go(0);
}

