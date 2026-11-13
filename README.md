# Kebun Makna

A free farm game for learning the meaning and recitation of Juz 30, now with family accounts and a social feed built on verified sources (the Qur'an, Sahih Bukhari, Sahih Muslim).

- Live: https://km.generasimerdeka.com/ (the old address https://rickysaif.github.io/kebun-makna/ redirects there)
- The original single-file game is kept at https://km.generasimerdeka.com/classic/
- Backend: Supabase (`supabase/`). Build brief: `CLAUDE.md`, plan: `docs/PLAN.md`, log: `docs/PROGRESS.md`.

Layout: `index.html` + `js/` + `css/` (the game, no build step) · `audio/` (ayah `a`, word `w`, voice `v`) · `models/` (on-device recitation model) · `content/akhlak/` · `tools/` · `tests/` · `classic/` (old game, its own word clips) · `beta/` (redirects to the root).
