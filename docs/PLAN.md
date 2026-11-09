# Kebun Makna v2 — phased plan

Each phase ships on its own to `/beta/` and should leave the game playable. Work in order. If you're blocked on a phase (for example, waiting on Ricky), note it in `PROGRESS.md` and move to the next one that isn't blocked.

**Game order (Ricky, 2026-11-09):** the original Qur'an game comes first, unchanged (10 surahs An-Nas → Al-Fil, word meanings, recitation, villager quests, crops, 4 bosses). The recitation gate and account features wrap around it without changing its story or flow. The akhlak/hadith arc (Phase 8) unlocks only after all 10 surahs plus `boss4`, as the next chapter in the same village. Social features (Phases 3–6) are reachable from the start but never interrupt or replace the original progression.

## Phase 0 — Split the monolith (no behaviour change)
- Port the root `index.html` into `beta/index.html` + `beta/css/*.css` + `beta/js/*.js` ES modules, with roughly these modules:
  - `data.js`: DATA, REV, QUEST, BOSS, copied verbatim; don't edit the text.
  - `state.js`: S, `fresh()`, save/load.
  - `render.js`: canvas, sprites, map.
  - `lesson.js`: ayah flow and whole surah.
  - `bosses.js`
  - `farm.js`: plots, clock, shop, house.
  - `ui.js`: panels, dialog, toast.
  - `audio.js`
  - `config.js`: Supabase URL and key, support links, feature flags.
- Audio paths point to `../audio/`.
- **Acceptance:** a playthrough of the first surah in `/beta/` behaves identically to the root at 390×844. No console errors. `node --check` passes on every module.

## Phase 1 — Accounts, sub-accounts, cloud save, parent dashboard
- **Start screen:** "Saya Orang Tua" (parent email login/signup) or "Saya Anak" (family code → avatar grid → PIN pad). Remember the last family code on the device, so a child usually just taps their avatar and enters the PIN.
- **Parent dashboard (`#/ortu`):**
  - Show the family code `KM-XXXXXX`.
  - Add, rename or delete a child; reset a PIN.
  - Set the parent override PIN.
  - Per child: progress (surahs, ayat, level, house), a recent `activity_log` timeline, recitation attempts, and their posts, comments and follows (with hide/delete).
  - The supporter badge and a link to the support page.
- **Cloud save:**
  - `state.js` writes S to `game_saves` (debounced ~3 s, plus on `visibilitychange`), keeping localStorage as an offline cache.
  - `version` is incremented; on conflict the higher `version` wins and a toast is shown.
  - Update the `farm_public` snapshot (house tier, plots, crops, level, surahs done; nothing private) on save.
- **Migration:** if localStorage `kebun-makna-v3` exists and the signed-in child's cloud save is empty, offer "Pakai progres lama di perangkat ini?" and import it.
- **Activity logging** (`activity_log.kind`): login, ayah_done, surah_done, boss_done, recitation_pass, recitation_fail, post, comment, follow, visit.
- **Guest mode** ("Main tanpa akun"): localStorage only, no social features, with a nudge to have a parent create an account.
- **Acceptance:**
  - The parent creates 2 children.
  - Each logs in on a different browser and plays one ayah.
  - Progress shows on the parent dashboard and survives clearing localStorage.
  - Child A can't read child B's `game_saves`. Verify this by querying with A's session.

## Phase 2 — Recitation recognition in the game (on-device Whisper)
- **Settings → "Pengenal bacaan":**
  - Explain the download (~140 MB q4, one time, Wi-Fi recommended) and offer a "Unduh model" button with a progress bar.
  - The model is cached by transformers.js in the browser Cache Storage, so it works offline afterwards. Show "Siap ✓" with the size used and a "Hapus model" button.
  - Default profile: q4 on WASM. Offer the fp32-encoder + q4-decoder "Kualitas" profile as an option. Reuse the session options and error handling from `tes-whisper.html`.
- **The gate:**
  - After an ayah's learning steps, there's a "Sekarang kamu yang baca" step: record with the mic (getUserMedia, 16 kHz mono, auto-stop on 1.5 s of silence, max 15 s), skip silent recordings, then transcribe.
  - Compare after normalising both sides: strip harakat and tatweel, unify alif/hamza/ya/ta-marbuta variants, and use word-level LCS against the ayah words.
  - Pass if at least 60% of the ayah words are matched in order (make this configurable in `config.js`).
  - Highlight the matched words. Praise uses the existing celebration and human voice. On a fail: "Hampir! Dengar sekali lagi, yuk", then replay the ayah.
  - After 3 fails, show "Minta Ayah/Ibu dengar", which calls `verify_parent_pin`. There is no other skip.
  - If the model isn't downloaded, the gate asks a parent to download it, or lets the parent override with the PIN. It never silently skips.
- Log `recitation_pass` / `recitation_fail` with `{ayah, score, ms, profile}` so Ricky can see timing on the iPhone.
- **Acceptance:** works in iOS Safari over HTTPS. The mic permission prompt appears from a user tap. Silence gives "Tidak ada suara yang terdengar". Processing time is logged.

## Phase 3 — Social feed (religious posts only)
- **Tabs:** Kebun (game) · Beranda (feed) · Profil.
- **Feed:** posts from people I follow and my groups, plus a "Jelajah" tab with recent public posts. Each card shows:
  - the avatar, name and supporter badge
  - the cited source card (Arabic, Indonesian, `ref_label`, attribution; hadith shows the matn with "Lihat lengkap")
  - the child's reflection
  - preset reactions, a comment count, and "Laporkan"
- **Composer:**
  1. Pick a source. Search `sources` with `textSearch('search', q, {type:'websearch'})`, browse Qur'an by surah/ayah, or pick from "Dari kebunmu" (ayat the child has learned in the game).
  2. Write a reflection (≤ 500 chars) with prompts like "Apa pelajaran dari ayat ini untukmu?"
  3. Show the server error messages from the guard trigger kindly.
- **Profile page:** avatar, badge, farm level, follow/unfollow, and their posts. Following is open (Ricky chose no approval), but the parent dashboard lists every follow and can remove it.
- **Acceptance:** a post without a source is impossible in the UI and rejected by the DB. Profanity is rejected with the friendly message. A hidden post disappears for others.

## Phase 4 — Farm visits
- From a profile, "Kunjungi kebun" renders their `farm_public.snapshot` read-only, using the same renderer.
- **Actions:** water one plant (once per day per friend; it gives the owner a small growth boost, applied on the owner's next load from `farm_interactions`), or send a preset salam.
- The owner sees "🌧️ Dodi menyiram kebunmu" notifications.

## Phase 5 — Live race against a friend
- Use a Supabase Realtime channel `race:<random>` with presence + broadcast.
- Challenge a follower who is online, or share a 4-digit room code.
- Both clients get the same seeded question list from the surahs both have learned. Positions are broadcast on each answer; the first to the finish wins.
- Log `boss_done {mode:'pvp'}`. No server authority is needed (it's a friendly game).

## Phase 6 — Groups
- Parents (or teachers) create a group with a name and a join code. Children join with the code.
- The group page shows members, a shared weekly goal ("50 ayat minggu ini"), and progress from `activity_log` `ayah_done` counts.
- Leaderboards are only within a group, never global.

## Phase 7 — Support and badges
- **Support page:** shows the tiers from `supporter_tiers`, explains "Gratis untuk semua; dukungan memberi lencana", and links to Trakteer and Saweria (from `config.js`). It shows the parent's own code to paste, `KM-XXXXXX`, with a copy button.
- **Badge rendering:** wherever a name appears, show the badge from `profiles.supporter_tier`.
- **Admin page** (only if `admins` contains the user): unmatched payments and a manual link action. This needs a new migration with an admin RPC, so write it and list it under "Needs applying".

## Phase 8 — Story expansion: akhlak of a good Muslim (content)
- Draft a new chapter arc after Al-Fil, unlocked only when all 10 surahs and `boss4` are done: village problems answered by hadith on akhlak, for example:
  - honesty
  - kindness to parents
  - smiling as charity
  - removing harm from the road
  - not wasting water
  - greeting with salam
  - sharing food with neighbours
  - anger control
- Each quest cites 1–2 `sources` ids. Verify each hadith's text in the table before using it; quote only what the row says.
- Write the stories in `content/akhlak/*.json` with the same shape as QUEST, plus `sources:[...]` (the `sources.id` values each story relies on). List what each story cites in `docs/CONTENT_REVIEW.md`.
- Build the stories straight into the `/beta/` game like any other feature: no status flags, no parent-only preview. Ricky's ustaz reviews the whole beta before cutover.

## Cutover (Ricky decides)
When Ricky approves, move `beta/` to the root and keep the old root as `/classic/`. This is not part of autonomous work.
