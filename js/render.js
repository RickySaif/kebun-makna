// render.js — map logic is verbatim from the classic game (Phase 0). The drawing half was rebuilt in v3:
// the same function names and classic-pixel coordinates, now backed by the baked HD sprites in art.js.
import { BOSS, ORDER, QUEST } from './data.js';
import { cv, draw, walkers } from './farm.js';
import { S, activeEvent } from './state.js';
import * as A from './art.js';

export const T=16, COLS=27, ROWS=17, VC=12, VR=11;
export const eastOpen=()=>!!S.trophies.boss2;
export const farOpen=()=>!!S.trophies.boss4;
export function px(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}
export const AVATARS=[{name:'Rafi'},{name:'Aisyah'}]; // the two classic characters (avatar 0 and 1); custom looks are packed integers, see art.js
/** Draw a person whose classic 12×16 box starts at (x,y). look = a villager's look, or null for avatar integer `av`.
    frame: 0..3 walk cycle (true/1 = step). dir: 0 down, 1 left, 2 up, 3 right. */
export function drawKid(c,x,y,av,frame,look,dir){ A.drawChar16(c,x,y,look||A.lookOf(av),dir|0,frame===true?1:frame|0); }
export const isNight=()=>S.min>=12*60;
export function drawTree(c,x,y,v){A.blit(c,A.treeSprite(v===true?1:Math.abs(v|0)),x,y-5);}
export function drawHouse(c,x,y,lvl,t,lit){A.blit(c,A.houseSprite(lvl,!!lit,lvl>=2&&Math.floor(t/300)%2),x*T,y*T-(lvl>=2?16:0));}
export function drawHut(c,X,Y,roof,wall,tier,lit){A.blit(c,A.hutSprite(roof,tier|0,!!lit),X,Y-4);}
export function drawLot(c,X,Y){A.blit(c,A.lotSprite(),X,Y);}
export function drawHedge(c,x,y){A.blit(c,A.hedgeSprite((x*3+y)%6),x*T,y*T-3);}
export function drawGate(c,x,y,open){A.blit(c,A.gateSprite(open),x*T,y*T-3);}
export function drawShop(c,x,y){A.blit(c,A.shopSprite(),x*T,y*T-4);}
export function drawWell(c,x,y,t){A.blit(c,A.wellSprite(Math.floor((t||0)/600)%2),x*T,y*T-6);}
export function drawSign(c,x,y){A.blit(c,A.signSprite(),x*T,y*T);}
export function drawChest(c,x,y,t){const b=Math.floor(t/350)%2,X=x*T,Y=y*T;A.blit(c,A.chestSprite(b),X,Y);if(b){px(c,X+1,Y+2,1,1,'#fff');px(c,X+14,Y+3,1,1,'#fff');px(c,X+13.5,Y+2.5,2,.5,'#FFF6A0');}}
export function drawTrophy(c,X,Y,col){A.blit(c,A.trophySprite(col),X,Y);}
export function drawPlotSoil(c,X,Y,wet,empty){A.blit(c,A.soilSprite(!!wet,!!empty),X,Y);}
export const CROPCOL=A.CROPCOL;
export function drawCrop(c,X,Y,kind,stage,t){A.blit(c,A.cropSprite(kind,stage,(Math.sin(t/500+X)>.5)?1:0),X,Y);}
export const stageOf=p=>p.days>=QUEST[p.no].days?4:p.days===0?0:Math.min(3,Math.max(1,Math.round(p.days/QUEST[p.no].days*3)));
/** Icon as a data URL. `draw(c)` uses classic-pixel coordinates on a w×h box; the canvas is 4× that. */
const iconMemo=new Map();
export function iconURL(draw,w=16,h=16,key){ if(key&&iconMemo.has(key)) return iconMemo.get(key);
  const cv=document.createElement('canvas');cv.width=w*4;cv.height=h*4;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;c.scale(4,4);draw(c);
  const u=cv.toDataURL(); if(key) iconMemo.set(key,u); return u; }
const plantPic=(c,kind,x,y)=>{const s=A.bake('picon'+kind,32,32,g=>A.plantIcon(g,kind));c.drawImage(s.cv,x-1,y-1,s.w,s.h);};
export const ICON={
 star:iconURL(c=>{const s=A.bake('istar',32,32,g=>{const R=(x,y,w,h,k)=>{g.fillStyle=k;g.fillRect(x,y,w,h);};
   [[14,2,4],[13,5,6],[12,8,8],[2,11,28],[4,14,24],[7,17,18],[8,20,16],[7,23,18],[6,26,8],[18,26,8],[5,28,5],[22,28,5]].forEach(([x,y,w])=>R(x,y,w,3,'#F4B400'));
   R(14,5,2,6,'#FFE98A');R(6,12,10,2,'#FFE98A');R(10,15,3,6,'#FFE98A');R(17,20,6,3,'#D99A00');R(19,24,6,4,'#D99A00');});c.drawImage(s.cv,-.5,-.5,s.w/2,s.h/2);}),
 coin:iconURL(c=>{const s=A.bake('icoin',32,32,g=>{const R=(x,y,w,h,k)=>{g.fillStyle=k;g.fillRect(x,y,w,h);};
   [[10,3,12],[7,5,18],[5,7,22],[4,10,24],[4,13,24],[4,16,24],[4,19,24],[5,22,22],[7,25,18],[10,27,12]].forEach(([x,y,w])=>R(x,y,w,3,'#F4B400'));
   [[11,6,10],[8,9,16],[7,12,18],[7,15,18],[7,18,18],[8,21,16],[11,24,10]].forEach(([x,y,w])=>R(x,y,w,3,'#FFD23F'));
   R(10,8,3,12,'#FFF1A8');R(13,6,4,2,'#FFF1A8');R(15,11,3,10,'#C98A00');R(13,11,6,2,'#C98A00');R(13,19,6,2,'#C98A00');R(20,10,2,12,'#E0A800');});c.drawImage(s.cv,-.5,-.5,s.w/2,s.h/2);}),
 seed:no=>iconURL(c=>{px(c,6,5,20,25,'#E8D6A8');px(c,6,5,3,25,'#F6EACB');px(c,23,5,3,25,'#CDB682');px(c,8,2,16,3,'#C9A465');px(c,6,28,20,2,'#B79F74');px(c,5,4,22,1,'#2B1D12');px(c,5,30,22,1,'#2B1D12');px(c,5,4,1,27,'#2B1D12');px(c,26,4,1,27,'#2B1D12');px(c,7,1,18,1,'#2B1D12');
   c.save();c.translate(8,8);c.scale(.5,.5);plantPic(c,QUEST[no].crop,0,2);c.restore();},32,32,'seed'+no),
 crop:no=>iconURL(c=>{plantPic(c,QUEST[no].crop,0,0);},32,32,'crop'+no),
 chest:iconURL(c=>A.blit(c,A.chestSprite(0),0,0)),
 trophy:col=>iconURL(c=>A.blit(c,A.trophySprite(col),1,1),16,16,'tr'+col)
};
export function portrait(look,av){return A.portraitURL(look||A.lookOf(av));}

/* ---------- map ---------- */
export const PLOTS=[[1,6],[4,6],[7,6],[1,8],[4,8],[7,8],[12,6],[15,6],[18,6],[12,8],[15,8],[18,8],[21,6],[24,6],[21,9],[24,9],[21,12],[24,12]];
export const GATE2={x:20,y:4}, FRUIT=[[21,2],[23,2],[25,2]];
export const isFar=(x,y)=>x>=20;
export const GATE={x:11,y:4};
export const LOTS=[[1,11],[4,11],[7,11],[9,11],[12,11],[15,11],[18,11],[1,14],[4,14],[7,14],[9,14],[12,14],[15,14],[18,14]];
export const isEast=(x,y)=>x>=11&&y<=10;
export const OBJ={house:{x:1,y:1,w:3,h:3,door:[2,4]},shop:{x:8,y:1,w:3,h:2,door:[9,3]},well:{x:10,y:6,w:1,h:1},sign:{x:5,y:2,w:1,h:1}};
export const CHESTPOS={x:4,y:3};
export const SPOT={114:[6,4],113:[5,3],112:[7,3],boss1:[6,4],111:[4,5],110:[9,5],boss2:[9,5],109:[13,5],108:[16,5],107:[19,5],boss3:[19,5],106:[13,3],105:[16,3],boss4:[16,3]};
export const evLook=e=>typeof e==='number'?QUEST[e].look:BOSS[e].giver.look;
export const evName=e=>typeof e==='number'?QUEST[e].npc:BOSS[e].giver.npc;
export const ENTRY=[1,4];
export function npcHere(){ const e=activeEvent(); if(!e||!S.arrived||!S.arrived[e]) return null; if(walkers.some(w=>w.e===e)) return null; const [x,y]=SPOT[e]; return {e,x,y}; }
export function homeOf(no){ const i=ORDER.filter(n=>S.solved[n]).indexOf(no); if(i<0) return ENTRY; const [hx,hy]=LOTS[i]; return [hx+(i%2),13]; }
export function giverNo(e){ if(typeof e==='number') return e; const gv=BOSS[e].giver; const n=ORDER.find(k=>QUEST[k]===gv); return n||null; }
export const villagers=()=>ORDER.filter(n=>S.solved[n]).map((n,i)=>{const [hx,hy]=LOTS[i];return {no:n,hx,hy,x:hx+(i%2),y:13,away:walkers.some(w=>w.no===n)||isOut(n)};});
export function isOut(n){ const e=activeEvent(); return !!(e&&typeof e==='string'&&giverNo(e)===n&&S.arrived&&S.arrived[e]); }
export function blocked(x,y){
  if(x<=0||y<=0||x>=COLS-1||y>=ROWS-1) return true;
  if(x===11&&y<=10&&!(y===4&&eastOpen())) return true;
  if(isEast(x,y)&&!eastOpen()) return true;
  if(x===20&&!(y===4&&farOpen())) return true;
  if(isFar(x,y)&&!farOpen()) return true;
  if(FRUIT.some(([a,b])=>a===x&&b===y)) return true;
  for(const v of villagers()){if(x>=v.hx&&x<v.hx+2&&y>=v.hy&&y<v.hy+2)return true;}
  for(const k in OBJ){const o=OBJ[k];if(x>=o.x&&x<o.x+o.w&&y>=o.y&&y<o.y+o.h)return true;}
  for(const [a,b] of PLOTS){if(x>=a&&x<a+2&&y>=b&&y<b+2)return true;}
  const nh=npcHere(); if(nh&&x===nh.x&&y===nh.y) return true;
  if(S.chest&&x===CHESTPOS.x&&y===CHESTPOS.y) return true;
  return false;
}
export function hitObject(x,y){
  for(let i=0;i<PLOTS.length;i++){const [a,b]=PLOTS[i];if(i>=6&&i<12&&!eastOpen())continue;if(i>=12&&!farOpen())continue;if(x>=a&&x<a+2&&y>=b&&y<b+2)return {type:'plot',i,tiles:[[a,b],[a+1,b],[a,b+1],[a+1,b+1]]};}
  const nh=npcHere(); if(nh&&x===nh.x&&y===nh.y) return {type:'npc',tiles:[[x,y]]};
  if(S.chest&&x===CHESTPOS.x&&y===CHESTPOS.y) return {type:'chest',tiles:[[x,y]]};
  const v=villagers().find(v=>(v.x===x&&v.y===y)||(x>=v.hx&&x<v.hx+2&&y>=v.hy&&y<v.hy+2)); if(v) return {type:'villager',no:v.no,tiles:[[v.hx,v.hy],[v.hx+1,v.hy],[v.hx,v.hy+1],[v.hx+1,v.hy+1]]};
  if(x===GATE.x&&y===GATE.y&&!eastOpen()) return {type:'gate',tiles:[[x,y]]};
  if(isEast(x,y)&&!eastOpen()) return {type:'gate',tiles:[[GATE.x,GATE.y]]};
  if(isFar(x,y)&&!farOpen()) return {type:'gate2',tiles:[[GATE2.x,GATE2.y]]};
  if(FRUIT.some(([a,b])=>a===x&&b===y)) return {type:'fruit',tiles:[[x,y]]};
  for(const k in OBJ){const o=OBJ[k];if(x>=o.x&&x<o.x+o.w&&y>=o.y&&y<o.y+o.h){const tl=[];for(let i=0;i<o.w;i++)for(let j=0;j<o.h;j++)tl.push([o.x+i,o.y+j]);return {type:k,tiles:tl};}}
  return null;
}
export function bfs(sx,sy,goals){
  const key=(x,y)=>x+','+y, G=new Set(goals.map(([x,y])=>key(x,y)));
  const q=[[sx,sy]],prev={[key(sx,sy)]:null};
  while(q.length){const [x,y]=q.shift(); if(G.has(key(x,y))){const path=[];let k=key(x,y);while(k){const [a,b]=k.split(',').map(Number);path.unshift([a,b]);k=prev[k];}return path.slice(1);}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=key(nx,ny);if(!(k in prev)&&!blocked(nx,ny)){prev[k]=key(x,y);q.push([nx,ny]);}}}
  return null;
}
export function adjacent(tiles){const out=[];for(const [x,y] of tiles)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(!blocked(nx,ny))out.push([nx,ny]);}return out;}

