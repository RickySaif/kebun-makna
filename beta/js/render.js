// render.js — split verbatim from the classic single-file game (Phase 0).
import { BOSS, ORDER, QUEST } from './data.js';
import { cv, draw, walkers } from './farm.js';
import { S, activeEvent } from './state.js';

/* =========================================================
   PIXEL ART (original sprites, drawn in code)
   ========================================================= */
export const T=16, COLS=27, ROWS=17, VC=12, VR=11;
export const eastOpen=()=>!!S.trophies.boss2;
export const farOpen=()=>!!S.trophies.boss4;
export function px(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}
export function sprite(c,rows,pal,ox,oy){rows.forEach((r,y)=>{for(let x=0;x<r.length;x++){const k=r[x];if(k!=='.'&&pal[k]){c.fillStyle=pal[k];c.fillRect(ox+x,oy+y,1,1);}}});}
export const KID=["....HHHH....","...HHHHHH...","..HHHHHHHH..","..HSSSSSSH..","..SSESSESS..","..SSSSSSSS..","...SSMMSS...","....SSSS....",
 "..CCCCCCCC..",".SCCCCCCCCS.",".SCCCCCCCCS.","..CCCCCCCC..","..PPPPPPPP..","..PPP..PPP..","..PPP..PPP..","..KKK..KKK.."];
export const KIDW=["..PPP..PPP..","..KKK..PPP..","......KKK..."];
export const GIRL=["....JJJJ....","...JJJJJJ...","..JJJJJJJJ..","..JSSSSSSJ..","..JSESSESJ..","..JSSSSSSJ..","..JJSMMSJJ..",".JJJJJJJJJJ.",
 ".JJJJJJJJJJ.",".SDDDDDDDDS.",".SDDDDDDDDS.","..DDDDDDDD..","..DDDDDDDD..","..DDDDDDDD..","...SS..SS...","...KK..KK..."];
export const GIRLW=["..DDDDDDDD..","...KK..SS...",".......KK..."];
export const HAT=["...TTTTTT...","TTTTTTTTTTTT"];
export const AVATARS=[{name:'Rafi',rows:KID,walk:KIDW,pal:{H:'#3B2A1A',S:'#F1C27D',E:'#2B1D12',M:'#B5534A',C:'#3A78C9',P:'#2B4C7E',K:'#2B1D12'}},
               {name:'Aisyah',rows:GIRL,walk:GIRLW,pal:{J:'#E56B8A',S:'#F1C27D',E:'#2B1D12',M:'#B5534A',D:'#F2A23A',K:'#2B1D12'}}];
export function drawKid(c,x,y,av,frame,look){
  let rows,pal;
  if(look&&look.girl){rows=GIRL.slice();pal={J:look.hijab,S:'#F1C27D',E:'#2B1D12',M:'#B5534A',D:look.shirt,K:'#2B1D12'}; if(frame) rows=rows.slice(0,13).concat(GIRLW);}
  else if(look){rows=KID.slice();pal={H:look.hair,S:'#F1C27D',E:'#2B1D12',M:'#B5534A',C:look.shirt,P:look.pants,K:'#2B1D12'}; if(frame) rows=rows.slice(0,13).concat(KIDW);}
  else{const A=AVATARS[av];rows=A.rows.slice();pal=A.pal;if(frame){rows=rows.slice(0,13).concat(A.walk);}}
  px(c,x+2,y+15,8,2,'rgba(0,0,0,.22)');
  sprite(c,rows,pal,x,y-(frame?1:0));
  if(look&&look.hat&&!look.girl) sprite(c,HAT,{T:look.hat},x,y-1);
  if(look&&look.mask){px(c,x+2,y+3-(frame?1:0),8,2,'#1A1A1A');px(c,x+3,y+4-(frame?1:0),1,1,'#fff');px(c,x+8,y+4-(frame?1:0),1,1,'#fff');}
}
export function drawTree(c,x,y,v){px(c,x+6,y+10,4,6,'#6E4426');px(c,x+1,y+1,14,11,'#2E7D3A');px(c,x+3,y,10,1,'#2E7D3A');px(c,x,y+3,16,7,'#2E7D3A');px(c,x+3,y+2,5,3,'#4FA34B');px(c,x+9,y+5,3,2,'#4FA34B');px(c,x+2,y+11,12,1,'#24622E');if(v)px(c,x+11,y+3,2,2,'#E2483B');}
export function drawGrass(c){for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const X=x*T,Y=y*T;px(c,X,Y,T,T,'#5DBB4A');const h=(x*73+y*151)%7;
  if(h<3){px(c,X+3+h,Y+5,1,2,'#4CA63C');px(c,X+4+h,Y+4,1,1,'#4CA63C');} if(h===4){px(c,X+10,Y+11,1,2,'#4CA63C');px(c,X+11,Y+10,1,1,'#4CA63C');} if(h===5){px(c,X+7,Y+8,2,2,'#F7F2A0');px(c,X+7,Y+8,1,1,'#fff');}}}
export function drawPath(c,x,y){const X=x*T,Y=y*T;px(c,X,Y,T,T,'#D9B77A');px(c,X+2,Y+3,2,1,'#C9A465');px(c,X+9,Y+10,3,1,'#C9A465');px(c,X+12,Y+4,1,1,'#EBD39E');}
export function drawHouse(c,x,y,lvl,t){const X=x*T,Y=y*T;
  const wall=lvl>=1?'#C98A52':'#F2E2C0', wallLine=lvl>=1?'#B07440':'#E3CFA5';
  if(lvl>=2){ // second floor
    px(c,X+6,Y+2,36,18,wall); for(let i=0;i<3;i++)px(c,X+6,Y+6+i*5,36,1,wallLine);
    px(c,X+12,Y+6,7,7,'#2B1D12');px(c,X+13,Y+7,5,5,'#9FD8F5');px(c,X+29,Y+6,7,7,'#2B1D12');px(c,X+30,Y+7,5,5,'#9FD8F5');
    for(let i=0;i<5;i++)px(c,X+4+i*2,Y-8-i*2+10,40-i*4,2,i%2?'#3A78C9':'#2F62A8');
    px(c,X+23,Y-12,1,8,'#5A3820');px(c,X+24,Y-12,6,4,(Math.floor(t/300)%2)?'#F4B400':'#E8A800');
  }
  px(c,X+4,Y+18,40,30,wall);px(c,X+4,Y+46,40,2,'#C9B48A');
  for(let i=0;i<5;i++)px(c,X+4,Y+22+i*6,40,1,wallLine);
  px(c,X,Y+14,48,6,'#9E3328'); if(lvl<2) for(let i=0;i<7;i++){px(c,X+2+i*1,Y+12-i*2,44-i*2,2,i%2?'#C8463A':'#B23C31');}
  px(c,X+20,Y+30,10,18,'#7A4A2A');px(c,X+21,Y+31,8,16,'#8E5A33');px(c,X+27,Y+39,1,2,'#F4B400');
  px(c,X+8,Y+26,9,8,'#2B1D12');px(c,X+9,Y+27,7,6,'#9FD8F5');px(c,X+12,Y+27,1,6,'#2B1D12');px(c,X+9,Y+30,7,1,'#2B1D12');
  px(c,X+33,Y+26,8,8,'#2B1D12');px(c,X+34,Y+27,6,6,'#9FD8F5');px(c,X+37,Y+27,1,6,'#2B1D12');
  if(lvl>=1){px(c,X+7,Y+34,11,3,'#8E5A33');[9,12,15].forEach(o=>px(c,X+o,Y+32,2,2,'#E56B8A'));px(c,X+32,Y+34,10,3,'#8E5A33');[34,37,40].forEach(o=>px(c,X+o,Y+32,2,2,'#F4C430'));}
  if(lvl<2){px(c,X+36,Y+2,5,10,'#8E8E8E');px(c,X+35,Y+1,7,2,'#6E6E6E');}
  if(lvl>=1){const s=Math.floor(t/400)%3;px(c,X+37+s,Y-2-s*2,3,2,'rgba(255,255,255,.7)');}
}
export function drawHut(c,X,Y,roof,wall){px(c,X+2,Y+12,28,18,wall);px(c,X+2,Y+28,28,2,'#C9B48A');px(c,X,Y+10,32,4,'#5A3820');for(let i=0;i<5;i++)px(c,X+2+i,Y+9-i*2,28-i*2,2,roof);px(c,X+13,Y+18,7,12,'#7A4A2A');px(c,X+18,Y+24,1,1,'#F4B400');px(c,X+4,Y+16,6,5,'#2B1D12');px(c,X+5,Y+17,4,3,'#9FD8F5');px(c,X+23,Y+16,6,5,'#2B1D12');px(c,X+24,Y+17,4,3,'#9FD8F5');}
export function drawLot(c,X,Y){px(c,X+3,Y+20,26,10,'#8FCB6A');px(c,X+14,Y+10,2,12,'#6E4426');px(c,X+8,Y+6,14,8,'#A86B3C');px(c,X+13,Y+8,4,4,'#FFF6DC');px(c,X+14,Y+9,2,1,'#2B1D12');px(c,X+15,Y+10,1,1,'#2B1D12');}
export function drawHedge(c,x,y){const X=x*T,Y=y*T;px(c,X+1,Y+2,14,13,'#2E7D3A');px(c,X+3,Y+1,10,2,'#2E7D3A');px(c,X+3,Y+4,4,3,'#4FA34B');px(c,X+9,Y+8,3,3,'#4FA34B');}
export function drawGate(c,x,y,open){const X=x*T,Y=y*T;px(c,X,Y+2,2,13,'#6E4426');px(c,X+14,Y+2,2,13,'#6E4426');if(!open){px(c,X+2,Y+4,12,2,'#C98A52');px(c,X+2,Y+9,12,2,'#C98A52');px(c,X+7,Y+4,2,7,'#A86B3C');px(c,X+6,Y+7,4,3,'#F4B400');}}
export function drawFence(c){for(let x=1;x<=10;x++){if(x===3||x===6)continue;const X=x*T,Y=10*T;px(c,X,Y+2,T,2,'#C98A52');px(c,X,Y+8,T,2,'#C98A52');px(c,X+2,Y,2,13,'#A86B3C');px(c,X+11,Y,2,13,'#A86B3C');}}
export function drawShop(c,x,y){const X=x*T,Y=y*T;
  px(c,X+2,Y+12,44,20,'#A86B3C');px(c,X+2,Y+12,44,2,'#5A3820');
  for(let i=0;i<6;i++)px(c,X+i*8,Y+2,8,10,i%2?'#FFF6DC':'#C8463A');px(c,X,Y+11,48,2,'#5A3820');
  px(c,X+2,Y+20,44,3,'#7A4A2A');
  [['#E0702F',6],['#F4C430',16],['#FFFFFF',26],['#D23A2A',36]].forEach(([col,o])=>{px(c,X+o,Y+14,7,6,'#E8D6A8');px(c,X+o+2,Y+15,3,3,col);});
  px(c,X+4,Y+24,40,6,'#8E5A33');px(c,X+4,Y+30,4,2,'#5A3820');px(c,X+40,Y+30,4,2,'#5A3820');}
export function drawWell(c,x,y){const X=x*T,Y=y*T;px(c,X+2,Y+8,12,8,'#9A9A9A');px(c,X+3,Y+9,10,2,'#3A78C9');px(c,X+2,Y+12,12,1,'#7A7A7A');px(c,X+2,Y+1,1,9,'#6E4426');px(c,X+13,Y+1,1,9,'#6E4426');px(c,X+1,Y,14,2,'#C8463A');px(c,X+7,Y+2,1,5,'#5A3820');px(c,X+6,Y+6,3,2,'#8E5A33');}
export function drawSign(c,x,y){const X=x*T,Y=y*T;px(c,X+7,Y+8,2,8,'#6E4426');px(c,X+1,Y+2,14,8,'#A86B3C');px(c,X+1,Y+2,14,1,'#C98A52');px(c,X+3,Y+5,10,1,'#5A3820');px(c,X+4,Y+7,8,1,'#5A3820');}
export function drawChest(c,x,y,t){const X=x*T,Y=y*T,b=Math.floor(t/350)%2;px(c,X+2,Y+6+b,12,9,'#A86B3C');px(c,X+2,Y+6+b,12,3,'#C98A52');px(c,X+2,Y+9+b,12,1,'#5A3820');px(c,X+7,Y+8+b,2,3,'#F4B400');px(c,X+2,Y+6+b,1,9,'#5A3820');px(c,X+13,Y+6+b,1,9,'#5A3820');if(b){px(c,X+1,Y+2,1,1,'#fff');px(c,X+14,Y+3,1,1,'#fff');}}
export function drawTrophy(c,X,Y,col){px(c,X+3,Y+1,8,6,col);px(c,X+1,Y+2,2,3,col);px(c,X+11,Y+2,2,3,col);px(c,X+6,Y+7,2,3,col);px(c,X+4,Y+10,6,2,'#5A3820');px(c,X+4,Y+2,2,3,'#FFF6DC');}
export function drawPlotSoil(c,X,Y,wet,empty){px(c,X+1,Y+1,30,30,wet?'#5A3A22':'#8A5A33');for(let i=0;i<4;i++)px(c,X+3,Y+5+i*7,26,2,wet?'#47301C':'#6E4426');px(c,X,Y,32,1,'#6E4426');px(c,X,Y+31,32,1,'#6E4426');px(c,X,Y,1,32,'#6E4426');px(c,X+31,Y,1,32,'#6E4426');
  if(empty){px(c,X+14,Y+12,4,1,'#C9A465');px(c,X+15,Y+10,2,5,'#C9A465');}}
export const CROPCOL={carrot:'#E0702F',sunflower:'#F4C430',jasmine:'#FFFFFF',chili:'#D23A2A',pumpkin:'#E8862A',tomato:'#E0362C',strawberry:'#E8344E',corn:'#F2D23C',eggplant:'#7B3FA0',watermelon:'#3E8E35'};
export function drawCrop(c,X,Y,kind,stage,t){
  const cx=X+16,base=Y+26, sway=(Math.sin(t/500)>.6)?1:0;
  if(stage===0){px(c,cx-3,base-2,6,3,'#5A3820');px(c,cx-2,base-3,1,1,'#E8D6A8');px(c,cx+1,base-3,1,1,'#E8D6A8');return;}
  if(stage===1){px(c,cx,base-6,1,6,'#3E8E35');px(c,cx-3+sway,base-7,3,2,'#5DBB4A');px(c,cx+1+sway,base-8,3,2,'#5DBB4A');return;}
  if(stage===2){px(c,cx,base-12,2,12,'#3E8E35');px(c,cx-5+sway,base-10,5,3,'#5DBB4A');px(c,cx+2+sway,base-13,5,3,'#5DBB4A');px(c,cx-4,base-5,4,2,'#4CA63C');px(c,cx+2,base-6,4,2,'#4CA63C');return;}
  if(stage===3){px(c,cx,base-16,2,16,'#3E8E35');px(c,cx-7+sway,base-12,7,4,'#5DBB4A');px(c,cx+2+sway,base-16,7,4,'#5DBB4A');px(c,cx-6,base-6,6,3,'#4CA63C');px(c,cx+2,base-8,6,3,'#4CA63C');px(c,cx-1+sway,base-19,4,4,CROPCOL[kind]);px(c,cx,base-18+0,2,2,'#FFF6DC');return;}
  if(kind==='carrot'){for(let i=-1;i<=1;i++){px(c,cx+i*7-3,base-6,6,6,'#E0702F');px(c,cx+i*7-2,base-3,4,4,'#C85E22');px(c,cx+i*7-1,base-13,2,7,'#3E8E35');px(c,cx+i*7-3+sway,base-12,2,3,'#5DBB4A');px(c,cx+i*7+1+sway,base-13,2,3,'#5DBB4A');}}
  if(kind==='sunflower'){px(c,cx,base-20,2,20,'#3E8E35');px(c,cx-5,base-10,5,3,'#5DBB4A');px(c,cx+2,base-7,5,3,'#5DBB4A');px(c,cx-5+sway,base-27,12,10,'#F4C430');px(c,cx-3+sway,base-29,8,14,'#F4C430');px(c,cx-2+sway,base-25,6,6,'#7A4A2A');px(c,cx-1+sway,base-24,2,2,'#5A3820');}
  if(kind==='jasmine'){px(c,cx-9,base-12,18,12,'#3E8E35');px(c,cx-7,base-14,14,3,'#4CA63C');[[-6,-12],[0,-15],[5,-10],[-2,-7],[6,-4],[-7,-4]].forEach(([a,b])=>{px(c,cx+a,base+b,3,3,'#FFFFFF');px(c,cx+a+1,base+b+1,1,1,'#F4C430');});}
  if(kind==='chili'){px(c,cx,base-16,2,16,'#3E8E35');px(c,cx-8,base-14,16,8,'#4CA63C');[[-7,-8],[-2,-6],[3,-9],[6,-5]].forEach(([a,b])=>{px(c,cx+a,base+b,2,6,'#D23A2A');px(c,cx+a,base+b-1,2,1,'#3E8E35');});}
  if(kind==='tomato'){px(c,cx,base-16,2,16,'#3E8E35');px(c,cx-8,base-15,16,10,'#4CA63C');[[-7,-8],[-1,-12],[4,-7],[-3,-4],[5,-13]].forEach(([a,b])=>{px(c,cx+a,base+b,4,4,'#E0362C');px(c,cx+a+1,base+b,1,1,'#FFB3A8');});}
  if(kind==='strawberry'){px(c,cx-10,base-8,20,8,'#3E8E35');px(c,cx-8,base-10,16,3,'#4CA63C');[[-8,-5],[-3,-8],[2,-5],[6,-8],[-5,-2],[4,-2]].forEach(([a,b])=>{px(c,cx+a,base+b,3,4,'#E8344E');px(c,cx+a,base+b-1,3,1,'#5DBB4A');px(c,cx+a+1,base+b+1,1,1,'#FFE07A');});}
  if(kind==='corn'){[-6,0,6].forEach(o=>{px(c,cx+o,base-24,2,24,'#3E8E35');px(c,cx+o-3+sway,base-14,3,2,'#5DBB4A');px(c,cx+o+2+sway,base-18,3,2,'#5DBB4A');px(c,cx+o+2,base-16,3,7,'#F2D23C');px(c,cx+o+2,base-16,1,7,'#D9B32A');px(c,cx+o+2,base-9,3,1,'#7CB342');px(c,cx+o,base-26,2,2,'#C9A465');});}
  if(kind==='eggplant'){px(c,cx,base-14,2,14,'#3E8E35');px(c,cx-8,base-15,16,7,'#4CA63C');[[-7,-8],[-1,-7],[5,-9]].forEach(([a,b])=>{px(c,cx+a,base+b,3,8,'#7B3FA0');px(c,cx+a,base+b,3,1,'#3E8E35');px(c,cx+a,base+b+2,1,2,'#B07CD0');});}
  if(kind==='watermelon'){px(c,cx-12,base-3,24,2,'#3E8E35');px(c,cx-10,base-12,20,11,'#3E8E35');px(c,cx-8,base-14,16,15,'#3E8E35');for(let i=-7;i<=7;i+=4)px(c,cx+i,base-13,1,13,'#9BD37A');px(c,cx-1,base-16,2,3,'#6E4426');}
  if(kind==='pumpkin'){px(c,cx-12,base-4,8,2,'#3E8E35');px(c,cx+5,base-5,8,2,'#3E8E35');px(c,cx-9,base-12,18,12,'#E8862A');px(c,cx-7,base-14,14,16,'#E8862A');px(c,cx-3,base-13,1,14,'#C96A1C');px(c,cx+2,base-13,1,14,'#C96A1C');px(c,cx-1,base-17,2,4,'#6E4426');px(c,cx+1,base-17,4,2,'#5DBB4A');}
}
export const stageOf=p=>p.days>=QUEST[p.no].days?4:p.days===0?0:Math.min(3,Math.max(1,Math.round(p.days/QUEST[p.no].days*3)));
export function iconURL(draw,w=16,h=16){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');draw(c);return cv.toDataURL();}
export const ICON={
 star:iconURL(c=>{px(c,7,1,2,3,'#F4B400');px(c,5,4,6,2,'#F4B400');px(c,1,5,14,3,'#F4B400');px(c,3,8,10,3,'#F4B400');px(c,3,11,4,3,'#F4B400');px(c,9,11,4,3,'#F4B400');px(c,7,5,2,4,'#FFE07A');}),
 coin:iconURL(c=>{px(c,4,2,8,12,'#F4B400');px(c,2,4,12,8,'#F4B400');px(c,5,4,2,8,'#FFE07A');px(c,9,5,1,6,'#B8860B');px(c,4,2,8,1,'#B8860B');px(c,4,13,8,1,'#B8860B');}),
 seed:no=>iconURL(c=>{px(c,6,4,20,26,'#E8D6A8');px(c,8,2,16,3,'#C9A465');px(c,6,30,20,2,'#C9A465');drawCrop(c,0,0,QUEST[no].crop,4,0);},32,32),
 crop:no=>iconURL(c=>{drawCrop(c,0,2,QUEST[no].crop,4,0);},32,32),
 chest:iconURL(c=>drawChest(c,0,0,0)),
 trophy:col=>iconURL(c=>drawTrophy(c,1,2,col))
};
export function portrait(look,av){return iconURL(c=>{px(c,0,0,16,16,'#BFE7FA');px(c,0,11,16,5,'#7CD35E');drawKid(c,2,1,av,0,look);},16,16);}

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

