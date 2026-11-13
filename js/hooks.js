// hooks.js — small extension points the classic game code calls into (kept tiny on purpose).
export const hooks = {
  atur: null,       // (box) => void : extra sections in ⚙ Untuk Orang Tua → Pengaturan
  afterStep: null,  // ({n, body, bar, s, a, review, next}) => void : runs after lesson step n (0..2), before step n+1 (reading practice)
  afterAyah: null,  // ({body, bar, s, a, review, next}) => void : runs after the last step, before the celebration (read the whole ayah)
};
