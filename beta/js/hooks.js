// hooks.js — small extension points the classic game code calls into (kept tiny on purpose).
export const hooks = {
  atur: null,       // (box) => void : extra sections in ⚙ Untuk Orang Tua → Pengaturan
  afterAyah: null,  // (no, j, review, next) => void : runs between an ayah's lesson steps and its celebration (Phase 2 gate)
};
