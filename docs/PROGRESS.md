# Progress

Beta: https://rickysaif.github.io/kebun-makna/beta/ · Classic (live, untouched): https://rickysaif.github.io/kebun-makna/

## 2026-11-09 — Phase 0 and Phase 1 shipped (autonomous Claude session)

### Phase 0 — monolith split (done)
- `beta/index.html` + `css/game.css` + ES modules `data, state, audio, ui, render, farm, lesson, bosses, progress, main, config`.
- The code was copied verbatim by `beta/tests/split-monolith.mjs` (acorn finds every top-level name and generates the imports/exports). Only edits: audio paths to `../audio/`, a `setS()` for the "Mulai ulang" reset, a viewport meta (the classic file has none) and a favicon.
- **Verified:** `beta/tests/phase0-playthrough.mjs` plays all of An-Nas (6 ayat, whole-surah stage, quest done) on the root and on `/beta/` at 390×844 with seeded randomness and instant audio. The screen sequence matches step for step and the final save is byte-identical. The only differences are which praise line is picked at random (supabase-js consumes random numbers on load). No console errors in beta. `node --check` passes on every module.

### Phase 1 — accounts, cloud save, parent dashboard (done)
- Start screen: **Saya Anak** (family code → avatar grid → PIN pad; the code is remembered so next time it's tap avatar + PIN), **Saya Orang Tua** (login / sign up / reset password), **Main tanpa akun** (guest).
- Cloud save (`cloud.js`): debounced 3 s plus flush on `visibilitychange`/`pagehide`; optimistic version check (`update … where version = v`); if another device wrote a newer version, it wins and a toast says so. Updates `farm_public` (house, plots, solved surahs, trophies, villager houses; nothing private). LocalStorage is the offline cache, per child.
- Activity: `login` (edge function), `ayah_done`, `surah_done`, `boss_done`, `review_done`, `import_device_progress`, worked out by diffing the save so the classic lesson code is untouched.
- Old progress: if this device has a classic/guest save and the child's cloud save is empty, the child is asked "Pakai progres lama di perangkat ini?".
- Parent dashboard (`#/ortu`): family code with copy, add / rename / delete child (delete needs typing HAPUS), reset PIN, parent override PIN, per-child level / surahs / ayat / house / coins, activity timeline, recitation attempts, posts and comments (hide/delete), follows (remove), supporter badge, link to the support page.
- Support page (`#/dukung`): tiers from `supporter_tiers`, Trakteer button, "Cendol" note, the parent's family code with copy. Saweria hidden.
- **Verified** (`beta/tests/phase1-accounts.mjs`, live backend, 390×844): the parent logs in and creates 2 children in the UI; each child logs in on its own browser and plays one ayah; the dashboard shows 1 ayat and the ayah_done entry for each; a fresh browser restores progress from the cloud; child A's session reads its own save but 0 rows of child B's; B's public snapshot is readable and has no private progress; a child can't read family codes. No console errors. Test children were deleted.

## Next
Phase 2 (recitation gate), then 3 (feed), 4 (visits), 5 (race), 6 (groups), 7 (badges everywhere + admin), 8 (akhlak arc).

## Needs applying
(none yet)

## Decisions made (assumed)
Ricky can overrule any of these.
- **Guest saves in beta use their own key** (`kebun-makna-v3:beta-guest`), seeded from the classic save on first open. Reason: beta and the live game share an origin, so beta must never write the classic key Amtar's live game uses.
- **Added a viewport meta tag in beta.** Reason: the classic file has none, so iOS lays it out at 980 px. The CSS is clearly built for phone width.
- **New child accounts skip the name/avatar onboarding** and start at Kakek Umar's intro, using the name and avatar the parent chose. Reason: children shouldn't have to type, and the parent already picked these.
- **Switching sections (game ↔ dashboard ↔ support) reloads the page.** Reason: it's the simplest reliable way to reset the game loop; it costs about 1 s.
- **Deleting a child needs typing "HAPUS".** Reason: deleting is permanent and cascades to all of the child's content.
- **The family code is shown only to parents** (dashboard and support page). Children enter it once and it's remembered on the device.
- **Sign-up sends the confirmation link back to `/beta/`.** Reason: it keeps beta self-contained until cutover.
- **Activity is logged by diffing the save, not by editing the lesson code.** Reason: this keeps the classic game code verbatim (Ricky's rule: don't rewrite the original game).

## Decisions from Ricky
- An ustaz reviews the whole beta (including all religious content) before cutover. There's no pending/approved gating. Every story that relies on a hadith or ayah cites real `sources` ids, listed in `docs/CONTENT_REVIEW.md`.
- Support: Trakteer only (https://trakteer.id/nurul_bahirah; the webhook is live and verified). Saweria is hidden. Trakteer pays in "Cendol"; supporters write `KM-XXXXXX` in the message.
- Game order: the original 10 surahs and 4 bosses come first, unchanged. The akhlak arc unlocks after `boss4` plus all 10 surahs. Social features are reachable from the start but never interrupt the original progression.

## How to run the tests
Serve the repo root (`python3 -m http.server 8765`). In a scratch folder with `playwright` and `@supabase/supabase-js@2.45.4` installed, copy `beta/tests/*.mjs` there and run `node phase0-playthrough.mjs`, then `KM_EMAIL=… KM_PASS=… node phase1-accounts.mjs` (use the test parent account; never commit its credentials).
