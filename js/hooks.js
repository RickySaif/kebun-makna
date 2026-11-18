// hooks.js — small extension points the classic game code calls into (kept tiny on purpose).
export const hooks = {
  atur: null,       // (box) => void : extra sections in ⚙ Pengaturan → Pengaturan & sumber
  afterWhole: null, // ({body, bar, s, review, next}) => void : end of Surat Utuh, before its celebration (read the surah ayah by ayah)
  worldOpen: null,  // () => bool : the village's east gate (to the Perjalanan Dagang world) is open
  worldEnter: null, // () => void : the player walked through that gate
  afterAyah: null,  // ({body, bar, s, a, review, next}) => void : runs after the last step, before the celebration (read the whole ayah)
  water: null,      // ({i, p, no, finish, quiz}) => void : watering a plot (js/siram.js: read the surah aloud; quiz() = the classic quiz)
};
