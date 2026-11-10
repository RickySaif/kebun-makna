# Progress

Beta: https://rickysaif.github.io/kebun-makna/beta/ · Classic (live, untouched): https://rickysaif.github.io/kebun-makna/

## 2026-11-10 — v3 visual pass + player avatar (local Claude session)

- **New art, same game.** Every farm sprite is redrawn in code at double detail (trees, hedges, gates, fence, the three house levels, villager huts, shop, well, sign, chest, trophies, soil, all 10 crops at 5 stages) with automatic outlines, shading and drop shadows. Paths have soft edges; grass has patches, tufts and flowers. Map layout, collisions, quests, lessons and bosses are untouched (`render.js` map logic is still verbatim).
- **People:** a new character generator with 4 facing directions and a 4-step walk. Villagers keep their colours and hats; Kakek Umar gets a beard. Dialog portraits are now head-and-shoulders.
- **Player avatar builder** (`js/avatar.js`): boy/girl, 4 skin tones, 4 hair or jilbab styles, 8 hair/jilbab colours, 8 shirt/gamis colours, 4 trouser/skirt colours, peci or flower pin, and a random button. It appears in the guest onboarding, in ⚙ → "Ganti nama/tokoh", and in the parent's "Tambah anak" form. The look is packed into the existing `avatar` integer (bit 14 marks a custom look; 0 and 1 are still Rafi and Aisyah), so **no migration is needed** and friends see it in the feed, groups, races and visits.
- **"Gambar tokoh tanpa mata"** toggle on the start screen, in the avatar builder and in ⚙ → Tampilan. It removes only the eyes (mouth, cheeks and the rest stay) on every character: player, villagers, portraits, boss games, avatars in social pages. Stored per device (`kebun-makna-noeyes`) and copied into the save (`S.noEyes`) so a new device picks it up.
- **Light and life:** windows and lamps glow at night, chimney smoke, footstep dust, butterflies by day, fireflies at night, drifting cloud shadows, a tap marker showing where you will walk.
- **UI:** rounder frames and buttons with highlights, pill HUD chips, a wooden frame around the farm, sky-to-grass page background, short fade-ins. No blur or backdrop filters.
- **Performance (mid-range Android):** sprites are baked once into offscreen canvases; the ground is one cached image; a frame is about 60 `drawImage` calls for what is on screen. The farm stops drawing while a lesson, shop or boss panel covers it. Movement speed now follows real time (same speed on 60 Hz and 120 Hz screens). If frames stay slow, the canvas resolution steps down automatically (6× → 4× → 2×) and then the ambient effects switch off; ⚙ → Tampilan → "Grafik hemat" forces that.
- **Font:** the whole beta now uses Fredoka (rounded, game-like, easy to read) instead of Pixelify Sans, including the labels drawn on the farm. Ricky's reason: Pixelify was hard to read ("Cendol" looked like "Oondol"). Family codes keep a monospace font; Arabic keeps Scheherazade New.
- **Verified:** `node --check` on all modules; `phase0-playthrough.mjs` still passes (An-Nas on root vs beta, same 43 steps, **save byte-identical**, 0 console errors in beta); new `beta/tests/v3-visuals.mjs` passes (eyes toggle persists and changes only the eye pixels, the builder packs the look, `draw()` costs 0.45 ms per frame under a 4× CPU throttle at 1152×1056, no console errors). Screens checked by screenshot at 390×844: start, onboarding, farm (home, east, far, village, night, fresh save), boss 1 and 3.
- **Not verified:** the account-backed screens (parent "Tambah anak" form, a child saving a new look to `profiles.avatar`, avatars in feed/groups/race) were not run this session because the test parent credentials were not available; they only passed syntax checks. Not yet tried on a real Android phone.

## 2026-11-09 — Phases 0–8 shipped (autonomous Claude session)

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

### Phase 1 extras (backend 90476f9): Google login, parents play, spouse linking, role separation (done)
- "Masuk dengan Google" appears only when `/auth/v1/settings` reports Google enabled (it's off now, so it's hidden); a "not enabled" error also hides it.
- "Main sebagai saya" on the dashboard: the parent plays the full game on their own `game_saves` row.
- Pasangan box: invite by family code, incoming invite with a merge explanation before accepting, decline/cancel. No unlink.
- Two social spaces: each feed shows only its own role (a parent's feed hides their own children's posts, which RLS allows them to read). Visits and races only offer same-role targets; Realtime channels are per role and payload roles are checked.
- **Verified:** `phase1b-parent.mjs` (Google hidden, self-invite refused kindly, parent plays and saves to own row). Accepting an invite isn't tested end to end: it needs a second real parent account, and I may not create accounts.

### Phase 2 — recitation gate (done)
- ⚙ → Pengaturan → "🎙️ Pengenal bacaan": choose q4 (default, ≈140 MB) or Kualitas (fp32 encoder + q4 decoder), download with a progress bar, "Siap ✓" with the MB used, "Hapus model".
- After the 4 classic ayah steps, "Sekarang kamu yang baca" appears (via a one-line hook; the classic flow is otherwise untouched): mic with 1.5 s silence auto-stop and 15 s max; "Tidak ada suara yang terdengar" on silence; word alignment from `tes-whisper.html`; pass at 60% (`config.js`); matched words highlighted; fail → "Hampir! Dengar sekali lagi, yuk" plus replay; after 3 fails, "Minta Ayah/Ibu dengar" (`verify_parent_pin`). No model → a grown-up downloads it, or the parent PIN. Never a silent skip.
- Logs `recitation_pass/fail {ayah, score, ms, rec_s, profile, heard}`; the dashboard shows them under "Percobaan membaca".
- **Verified** (`phase2-recite.mjs`, real model, Chrome fake mic): the gate appears and asks for the download; download and load took 50 s on desktop; silence → the right message; Alafasy's 114:1 → 4/4 words, pass; a signed-in child's `recitation_pass` row has `ms` 10056 and profile q4 (headless desktop, 1 WASM thread). **iPhone timing is still unmeasured**: check the dashboard after Amtar's first attempts.

### Phase 3 — feed (done)
- Tabs: Kebun/Keluarga · Beranda · Grup · Profil. Beranda has Diikuti (follows + my groups + me) and Jelajah. Cards show avatar, name, badge, the source card (Qur'an: Arabic + Kemenag; hadith: matn when it can be split reliably, with full Arabic + Indonesian including sanad behind "Lihat lengkap"), ref_label, attribution, 4 preset reactions, comments, Laporkan.
- Composer: Dari kebunmu (learned ayat) / Cari (websearch) / Al-Qur'an (surah:ayah), reflection ≤ 500 with prompts, server guard messages shown as-is. Profile: follow/unfollow, posts, Kunjungi kebun, Ajak lomba.
- **Verified** (`phase3-feed.mjs`): profanity → "Kata-kata ini tidak sopan…"; an insert without source_id is rejected by the DB; B sees, reacts, comments, follows; the parent's feed has no child posts; after the parent hides a post, it disappears for B and the author still sees it.
- **Bug found in the backend:** any select on `groups`/`group_members` returns 500 (RLS infinite recursion). It's fixed in the new migration below; the feed ignores it meanwhile.

### Phase 4 — farm visits (done)
- `#/kunjungi/<id>` renders the friend's `farm_public` snapshot with the real renderer; the visitor can walk around and nothing is saved. Water one plant (once per friend per day) or send a preset salam (once a day; same DB unique index).
- On their next load, the owner gets a "Ada tamu di kebunmu!" note ("🌧️ Dodi menyiram kebunmu", salam text), and each watering waters one thirsty plant.
- **Verified** (`phase4-visit.mjs`).

### Phase 5 — live race (done)
- `#/lomba`: create a 4-digit room or join by code; followed friends who are online can be invited (a banner on their screen, never auto-navigation). Same seeded questions from ayat both have learned; first to 10 correct answers wins; both log `boss_done {mode:'pvp'}`.
- **Verified** (`phase5-race.mjs`).

### Phase 6 — groups (done)
- `#/grup`: join by code; parents create groups for children or parents and manage child groups without being members; weekly goal, progress bar, in-group leaderboard (`rpc group_progress`), remove member, leave, delete.
- **Verified** (`phase6-groups.mjs`, with the migration applied): the parent creates a child group in the UI, which shows the join code; a child joins; a parent can't join a child group; the leaderboard shows 2 ayat this week; progress reads 2/50; the owner changes the goal. Before the migration, the pages degraded gracefully.

### Phase 7 — support, badges, admin (done)
- Badges next to names everywhere, including the game HUD. Support page verified. `#/admin` (only for users in `admins`) lists unmatched payments with "Hubungkan" by family name.
- **Verified** (`phase7-support.mjs`).

### Phase 8 — akhlak chapter (done; for the ustaz to review)
- 8 stories in `content/akhlak/*.json`, in the same village after Al-Fil. They unlock only when all 10 surahs and `boss4` are done; a 📗 button with a BARU marker and a "Bab baru" note appear. Topics: honesty, kindness to mother, a friendly face, removing thorns from the road, saving water, salam, sharing soup with neighbours, controlling anger.
- Each story: the villager's problem (dialogue) → "Buka kitab": the child picks which of 3 real sources answers it (so there are no paraphrased answer options) → the full verbatim source card → the villager's resolution → reward (+15 coins, +30 XP), with `akhlak_done` logged. Stories unlock one after another.
- Hadith/ayah text is copied verbatim from `sources` into `source_rows` by `content/tools/snapshot-sources.mjs`, so it works offline and the ustaz sees exactly what children see. `docs/CONTENT_REVIEW.md` lists each story's citations and its paraphrase lines.
- **Verified** (`phase8-akhlak.mjs`): every `source_rows` entry is identical to the live table; the chapter is locked on a fresh game and unlocks after 10 surahs + boss4; a wrong pick gets gentle feedback; the right pick shows the verbatim HR. Muslim 4719 card; the reward is granted; the next story opens.

### Family names + Google Identity Services (backend cb13349/e977e8d) (done)
- See Decisions. Tests updated to use the family name (`rpc my_family_name`). `phase1c-google.mjs` checks the GIS button at 390 px and the no-GIS fallback.

## Next
All planned phases are built. What remains is Ricky's: the ustaz review of the whole beta, measuring recitation timing on Amtar's iPhone (dashboard → Percobaan membaca), and the cutover.

## Needs applying
(none; `20261109060000_groups_fix_progress_admin` applied 2026-11-09 by the local session, with `admin_link_payment` changed to accept family names via `resolve_family`)

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
- **The recitation gate is skipped on murajaah of an ayah already recited.** Reason: one recitation per ayah keeps reviews short (boss games and reviews must stay short).
- **Guests pass the gate's grown-up check with a multiplication question** (there's no parent PIN without an account). Reason: guests have no server PIN, and the rule is "no silent skip".
- **The model download asks for a grown-up first.** Reason: it's about 140 MB and should go over Wi-Fi.
- **Social pages switch in place; going between the game and social pages reloads.** Reason: the classic game loop owns the screen.
- **Comments are free text (≤ 280, server-filtered),** as the schema allows; reactions are the 4 presets. Reason: this follows the backend contract.
- **A friend's watering counts as today's watering for one thirsty plant** (it grows at the owner's next sleep). Reason: it reuses the game's own growth rule; there's no new mechanic to balance.
- **Salam is limited to once a day per friend.** Reason: the DB unique index (visitor, owner, kind, day) applies to salam too.
- **Race questions are word meanings from ayat both players have learned; 10 correct to win; a wrong answer costs 1 s.** Reason: it's short and friendly.
- **Online presence is per role** (`online:child`, `online:parent`), and invites go only to people you follow. Reason: Realtime isn't RLS-gated, and this enforces role separation client-side.
- **Only parents create groups; children join by code.** Reason: this follows PLAN ("parents or teachers create").
- **The group week starts Monday 00:00 WIB.** Reason: it matches Indonesian school weeks.
- **Hadith cards show the matn only when it's the quoted text right after the narrator chain;** otherwise they show the start of the full text. "Lihat lengkap" always shows the full Arabic and Indonesian. Reason: never cut a hadith in a way that changes it.
- **Children can't create their own groups or see family codes.** The group join code is visible to members so they can invite classmates.
- **Family names replace KM codes everywhere in the UI** (Ricky). Child login has one field, "Nama keluarga" (placeholder "contoh: saif"), lowercased as you type and remembered per device; a remembered legacy code still works. The dashboard shows the name prominently with Salin and Ganti (live availability check, debounced 350 ms). Spouse invites take the family name. Accepting asks you to pick one of the two names (radio), and explains that the other is released. The support page shows `#name` with copy; admin links payments by family name.
- **Google sign-in uses Google Identity Services** (the official button, popup, hashed nonce → `signInWithIdToken`). `signInWithOAuth` is removed. The button shows only when Supabase reports the Google provider enabled and the GIS script loads; otherwise the email login stays alone. Reason: Google's chooser then shows Kebun Makna / rickysaif.github.io instead of supabase.co.

- **v3 art stays pixel art, drawn in code** (no image files). Reason: keeps the Harvest Moon look, no build step, nothing to download, and it can be baked for speed.
- **Custom avatars reuse the `avatar` smallint** (14 bits + a flag). Reason: no schema change; older clients just show Rafi or Aisyah.
- **"Tanpa mata" is one switch for all characters on the device**, not per character. Reason: it is a family's choice about pictures in general. Face emoji in buttons (🧒, 👨‍👩‍👧) are left as they are.
- **Girls can pick jilbab (two lengths) or hair (kuncir dua, rambut panjang).** Reason: young girls dress both ways; jilbab is the default.
- **The lesson "celebrate" burst and boss-game backgrounds keep the classic blocky look**; only the people, trees and huts in them are new. Reason: scope; they can follow later.

## Decisions from Ricky
- **Supporter badges are monthly (rolling 30 days)** (Ricky). Trakteer has no auto-recurring billing, so a badge is active for 30 days after the latest payment and then stays visible but greyed out ("tidak aktif"). Tier = household support in the last 30 days, with 🌟 above Rp310.000 getting a multiplier rounded down to 1 decimal (465k = 1,5🌟, 620k = 2🌟): 🌱 15k · 🌳 50k · 🏡 150k · 🌟 310k. The parent dashboard nudges 5 days before expiry and after it lapses. Test: `beta/tests/phase7b-monthly-badge.mjs` (BADGE_STATE=active|lapsed).
- An ustaz reviews the whole beta (including all religious content) before cutover. There's no pending/approved gating. Every story that relies on a hadith or ayah cites real `sources` ids, listed in `docs/CONTENT_REVIEW.md`.
- Support: Trakteer only (https://trakteer.id/nurul_bahirah; the webhook is live and verified). Saweria is hidden. Trakteer pays in "Cendol"; supporters write `KM-XXXXXX` in the message.
- Game order: the original 10 surahs and 4 bosses come first, unchanged. The akhlak arc unlocks after `boss4` plus all 10 surahs. Social features are reachable from the start but never interrupt the original progression.

## How to run the tests
Serve the repo root (`python3 -m http.server 8765`). In a scratch folder with `playwright@1.57.0` and `@supabase/supabase-js@2.45.4` installed (the tests use the system Chrome via `channel: 'chrome'`), copy `beta/tests/*.mjs` there and run them with `KM_EMAIL=… KM_PASS=…` (the test parent account; never commit its credentials). Each test creates its own `Uji …` children and deletes them at the end.
- `node check-syntax.mjs <repo>/beta`: runs `node --check` on every module.
- `v3-visuals.mjs` (no backend): avatar builder, eyes toggle, draw cost.
- `phase0-playthrough.mjs` (root vs beta, no backend) · `phase1-accounts` · `phase1b-parent` · `phase1c-google` (needs `BASE=https://rickysaif.github.io/kebun-makna`, because GIS only renders on the authorized origin) · `phase2-recite` (needs `recite.wav` = `ffmpeg -i audio/a/114001.mp3 -af apad=pad_dur=2.5 -ar 16000 -ac 1 recite.wav` and `silence.wav` = `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 10 silence.wav`; downloads the real model) · `phase3-feed` · `phase4-visit` · `phase5-race` · `phase6-groups` · `phase7-support` · `phase8-akhlak` (`CONTENT=<repo>/content/akhlak`).
- Last full run (2026-11-09): all pass.
