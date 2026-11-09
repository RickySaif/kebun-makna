// main.js — split verbatim from the classic single-file game (Phase 0).
import { farm, onboarding } from './farm.js';
import { checkSurahLevels } from './progress.js';
import { S, save } from './state.js';

/* migration for players from earlier versions */
(function migrate(){ if(!S.hv2){ S.house=S.house===1?2:S.house===2?3:S.house||0; S.hv2=true; }
  if(S.xp===undefined){ let x=0; Object.keys(S.ay).forEach(k=>{x+=20+5*(S.stars[k]||1);}); ['boss1','boss2','boss3','boss4'].forEach(b=>{if(S.trophies[b])x+=80;}); x+=Object.keys(S.basket||{}).length*10; S.xp=x; }
  S.vh=S.vh||{}; S.whole=S.whole||{}; S.wholeStars=S.wholeStars||{}; S.reviews=S.reviews||{}; checkSurahLevels(true); save(); })();

/* ---------- boot ---------- */
if(!S.name) onboarding(); else farm();
