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

### Phase 6 — groups (built; waiting on the migration)
- `#/grup`: join by code; parents create groups for children or parents and manage child groups without being members; weekly goal, progress bar, in-group leaderboard (`rpc group_progress`), remove member, leave, delete.
- **Verified:** degrades gracefully today. Run `phase6-groups.mjs` after applying the migration; it then tests the full path automatically.

### Phase 7 — support, badges, admin (done)
- Badges next to names everywhere, including the game HUD. Support page verified. `#/admin` (only for users in `admins`) lists unmatched payments with "Hubungkan" by family code.
- **Verified** (`phase7-support.mjs`).

## Next
Phase 8 (akhlak arc after Al-Fil + boss4).

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
- **Parent's Google sign-in redirects back to `/beta/`.**

## Decisions from Ricky
- An ustaz reviews the whole beta (including all religious content) before cutover. There's no pending/approved gating. Every story that relies on a hadith or ayah cites real `sources` ids, listed in `docs/CONTENT_REVIEW.md`.
- Support: Trakteer only (https://trakteer.id/nurul_bahirah; the webhook is live and verified). Saweria is hidden. Trakteer pays in "Cendol"; supporters write `KM-XXXXXX` in the message.
- Game order: the original 10 surahs and 4 bosses come first, unchanged. The akhlak arc unlocks after `boss4` plus all 10 surahs. Social features are reachable from the start but never interrupt the original progression.

## How to run the tests
Serve the repo root (`python3 -m http.server 8765`). In a scratch folder with `playwright` and `@supabase/supabase-js@2.45.4` installed, copy `beta/tests/*.mjs` there and run `node phase0-playthrough.mjs`, then `KM_EMAIL=… KM_PASS=… node phase1-accounts.mjs` (use the test parent account; never commit its credentials).
