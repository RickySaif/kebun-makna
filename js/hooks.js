// hooks.js — small extension points the classic game code calls into (kept tiny on purpose).
export const hooks = {
  atur: null,       // (box) => void : extra sections in ⚙ Untuk Orang Tua → Pengaturan
  afterWhole: null, // ({body, bar, s, review, next}) => void : end of Surat Utuh, before its celebration (read the surah ayah by ayah)
  afterAyah: null,  // ({body, bar, s, a, review, next}) => void : runs after the last step, before the celebration (read the whole ayah)
};
