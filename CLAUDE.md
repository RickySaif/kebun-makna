# Kebun Makna — build brief for Claude

You are continuing the build of **Kebun Makna**, a free, Harvest Moon-style pixel farm game that teaches Indonesian children (first player: Ricky's son Amtar, plays on **iPhone 13 Safari**) the word-by-word meaning and recitation of short Juz 30 surahs, and is now growing into a **logged-in social game** about being a good Muslim as taught by Prophet Muhammad ﷺ. Owner: Ricky Saif (product owner, not an engineer). UI language: **Bahasa Indonesia**, warm and child-friendly.

Read `docs/PLAN.md` for the phased work and acceptance criteria. Keep `docs/PROGRESS.md` updated at the end of every work session (what shipped, what's next, open questions for Ricky).

## Non-negotiable rules
1. **Religious accuracy.** Never invent an ayah, a hadith, a translation or a word meaning. Qur'an and hadith text shown anywhere must come from the `sources` table (or the existing reviewed `DATA` block in the game). Every story or dialogue that relies on a hadith or ayah must cite real rows from `sources`: keep the `sources.id` values in the content file and list them in `docs/CONTENT_REVIEW.md` (a simple list of what each story cites). Story content is built straight into `/beta/` with no status flags or parent-only preview; Ricky's ustaz reviews the whole beta before cutover.
2. **Word audio** for the existing 10 surahs is cut from Alafasy's continuous recitation (`audio/w`, `audio/a`, `audio/v`). Don't regenerate or replace it with TTS.
3. **Safety.** No free chat or DMs. Posts must cite a source. Comments are short and filtered on the server. Since 2026-11-16 there are no child sub-accounts, family codes or parent dashboards: every player has their own email or Google account (a parent can make one for a child). Moderation is by the author, the word filter, reports (3 distinct auto-hide) and the admin.
4. **Don't break the live game.** Since the cutover (2026-11-13) the game is the root of the repo and is live at https://km.generasimerdeka.com/ (`index.html`, `js/`, `css/`, `audio/`, `models/`, `content/`). The original single-file game was removed on 2026-11-13 (Ricky); it is in git history before that date. `beta/index.html` only redirects old links to the root. Every push to `main` deploys to players at once.
5. **No build step.** Plain HTML, CSS and native ES modules. Load libraries from CDN with **exact pinned versions** (for example `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`, `@huggingface/transformers@3.8.1`). It must work on iOS Safari 17+ and need nothing installed.
6. **Secrets.** Only the publishable key goes in the frontend. Never commit a service-role key or a webhook secret.
7. **Game order.** The original Qur'an game comes first: the 10 surahs An-Nas → Al-Fil with word meanings, recitation, villager quests, crops and the 4 bosses, in that order. **Since 2026-11-17 Ricky approved an overhaul toward memorising** (`docs/RANCANGAN_15_SURAT.md`): watering is reading the surah aloud with less and less help (`js/siram.js`, ladder 1–5, ≥ 50% green passes, a small village event once a day), the game judges when a surah is "Siap", and later phases add two-part quests, a readiness gate, new plots and trade routes every 5 surahs, and Al-Fatihah as the first quest. Build those phases as the design says; keep the existing stories, villagers and bosses, and don't reorder the 10 surahs. The hadith/akhlak story arc unlocks only after the player finishes the original game (all 10 surahs plus `boss4`), as the next chapter in the same village. Social features (feed, visits, race, groups) are reachable from the start but must never interrupt or replace the original progression.

## Backend (already live; you don't need Supabase admin access)
- Project: `kebun-makna`, ref `vnzmvmlvicyggylgukaz`, region ap-southeast-1, **free tier** (pauses after 7 days idle; Ricky restores it).
- URL: `https://vnzmvmlvicyggylgukaz.supabase.co`
- Publishable key (safe in the frontend): `sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5`
- Schema source of truth: `supabase/migrations/*.sql`. Edge functions: `supabase/functions/*`.
- **If you need a schema or function change:** write a new migration file (`supabase/migrations/<timestamp>_<name>.sql`) or edit the function source. Do **not** assume it's applied. List it under "Needs applying" in `docs/PROGRESS.md`, and write the frontend so it degrades gracefully until it's applied. Ricky's local Claude applies these.

### Auth model
- **One kind of account (Ricky, 2026-11-16):** Supabase email auth (`signUp` / `signInWithPassword` / magic link / Google). A trigger auto-creates `profiles(role='parent')` with a unique `username`. `role` is always `'parent'` now; it is kept only because `same_side()` and the feed/race code read it. A trial without an account saves nothing.
  - **Google is the only sign-in shown (Ricky, 2026-11-23).** `js/account.js` has `ONLY_GOOGLE = true`: the start screen is the Google button, the no-save trial and the avatar toggle. The email/password form, sign-up and password reset still exist in the file but are hidden; set `ONLY_GOOGLE = false` to bring them back. If Google's button cannot load, the card shows "Tombol Google belum bisa dimuat" and a reload button. Tests sign in through the app's own Supabase client (`tests/lib.mjs` `login()`), not through the form.
- **Username:** `profiles.username` (3–20 chars, `a-z0-9`, starts with a letter, unique). It is the supporter-payment key (`#saif` in the Trakteer message). Change it on the support page (`rpc('username_available')`, `rpc('set_username')`; `rpc('my_username')` reads it).
- **Retired for good:** child sub-accounts, `family` / `child-login` edge functions, the family code and name, spouse linking, parent override PIN, `families`, `family_members`, `spouses`, `spouse_invites`, `parent_secrets`, `child_secrets`. Migration `20261116090000_retire_family_and_spouses.sql`. The old code is in git history before this date.

### Tables (RLS enforced; see the migrations for the exact policies)
| table | who reads | who writes |
|---|---|---|
| `profiles` (id, role, display_name, avatar, username, supporter_tier) | any signed-in user | self: `display_name` and `avatar` only (`username` only through `set_username`) |
| `game_saves` (profile_id, state jsonb, version) | self, admin | self |
| `farm_public` (profile_id, snapshot jsonb, level, surahs_done) | any signed-in user | self (for farm visits) |
| `activity_log` (profile_id, kind, detail) | self, admin | self (insert) |
| `farm_interactions` (visitor, owner, kind water/salam, preset) | both parties | visitor; water is unique per visitor, owner and day |
| `sources` (id `quran:S:A` / `bukhari:N` / `muslim:N`, ref_label, arabic, indonesian, attribution, `search` tsvector) | everyone | nobody (read-only library) |
| `follows` | any signed-in user | follower |
| `posts` (author, **source_id required**, body ≤ 500) | everyone, except hidden posts (visible to author, admin) | author. The trigger enforces the word filter and 10 posts a day. Admin can set `hidden`. |
| `comments` (post, author, body ≤ 280) | same as posts | author (60 a day, filtered). The post author, or admin can delete. |
| `reactions` (preset: masyaallah, jazakallah, aamiin, subhanallah) | any signed-in user | self |
| `reports` | the reporter and admin | reporter. 3 distinct reports auto-hide the item. |
| `groups` / `group_members` + `rpc('join_group',{code})` | members | owner creates; join is by code |
| `supporter_tiers` (1 Penanam 🌱 ≥ Rp25k · 2 Perawat Kebun 🌳 ≥ 100k · 3 Penjaga Desa 🏡 ≥ 500k · 4 Sahabat Kebun Makna 🌟 ≥ 1jt) | everyone | — |
| `payments` | the parent and admin | `payment-webhook` edge function only |

- **Sources library:** 6,236 ayat (Kemenag translation via quran.com), 6,638 Bukhari and 4,930 Muslim hadith (Lidwa Pusaka Indonesian translation and **Lidwa numbering**, via github.com/gadingnst/hadith-api, MIT).
  - Lidwa numbers differ from sunnah.com/Fuad Abdul Baqi numbering. Always show the `ref_label` and the `attribution`.
  - Muslim's first entries are muqaddimah (introduction), not hadith in the main collection.
  - Hadith `indonesian` text includes the full sanad ("Telah menceritakan kepada kami [...]"). For display to children, show the matn (the part after the chain) when you can split it reliably, and always offer the full text behind "Lihat lengkap".
- **Supporter payments:** Trakteer or Saweria POSTs to `/functions/v1/payment-webhook?provider=trakteer|saweria`. The supporter writes their username (`#saif`) in the message. The webhook matches `profiles.username`, sums the last 30 days and sets `supporter_tier` on that account. Ricky still has to create the Trakteer and Saweria pages and set the `TRAKTEER_WEBHOOK_TOKEN` and `SAWERIA_STREAM_KEY` secrets. Until then, the support page shows instructions with placeholder links from `js/config.js`.

## Analytics (anonymous stats, added 2026-11-16)
- Umami, self-hosted by Ricky: dashboard at https://monitor-km.generasimerdeka.com (website "Kebun Makna"). It counts visits, screens, game errors and load speed. Source and hosting notes: the `RickySaif/monitor-km` repo (`.github/MONITOR.md`).
- `js/stats.js` (a classic script on `index.html`, `privasi.html`, `syarat.html`) loads the tracker only on `km.generasimerdeka.com`, and `kmStatsBeforeSend` rewrites **every** payload before it is sent. `tests/stats.mjs` checks it.
- **Rule: never send names, usernames, IDs, room or group codes, emails, tokens or any query/hash text to Umami.** Do not add `umami.track(...)` calls with custom data, and do not set `umami.identify`.
- **When you add a new hash route** (`#/something`), add it to `ROUTES` in `js/stats.js` and a case in `tests/stats.mjs`. Until then it is counted as "/". A route that carries an ID or code must map to `/<route>/detail`.
- Error messages are redacted in `redact()`; if an error could ever contain user text, extend it.
- `privasi.html` has a "Statistik anonim" section: keep it true if what is collected changes.

## The original game (the code in `js/` was split from the original single-file game, removed 2026-11-13)
- **Inline data:**
  - `DATA`: 10 surahs (114→105) with per-word Arabic, meaning, emoji, audio ids and timing `t`.
  - `REV`: audio revision suffixes.
  - `QUEST`: villager problem → surah → crop.
  - `BOSS`: 4 boss mini-games (thief chase, car race, orphan lunch cart, caterpillar pest).
  - `HOUSE_TIERS`, XP and levels.
- **Rendering:** canvas pixel art at 16px tiles, a 27×17 map with a 12×11 viewport.
- **State:** the object `S` from `fresh()` is saved in localStorage key `kebun-makna-v3`. This is the payload to move into `game_saves.state`.
- **Learning flow per ayah:** listen, recognise words, arrange (Arabic only; the meaning appears after), explain. Then a whole-surah stage, a seed unlock, planting, growth on a game clock, harvest, then coins and XP.
- **Ricky's playtest lessons (keep them):**
  - Arranging words must not show jumbled Indonesian.
  - New NPCs walk in, and "new" things carry a marker.
  - NPCs don't leave mid-dialogue.
  - Boss games must be short.
  - Dialogue must be realistic and unforced (see Pak Darto in Al-Ma'un).
  - The house grows with each surah, with a notification.
- **Recitation recognition:** `tes-whisper.html` runs `eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran` (an ONNX conversion of tarteel-ai/whisper-base-ar-quran) with transformers.js 3.8.1 on WASM. The profiles there are q4 (~140 MB, default) and an fp32 encoder + q4 decoder (~205 MB). q8 is broken (ConvInteger). fp16 WebGPU needs `shader-f16` and fails on iOS. Ricky's on-device timing results for q4 were never reported, so measure in-app and log it.

## Working style
- Ricky wants direct, structured updates: a recommendation plus reasoning. Flag problems instead of smoothing them over. Ask him (in `docs/PROGRESS.md` → "Questions for Ricky") rather than guess on product or religious-content decisions. Keep making progress on everything else.
- Commit small and often to `main`. Write clear commit messages. Pushing to `main` deploys the live game via GitHub Pages, so it must never be left broken: run the tests (`tests/`, see docs/PROGRESS.md) before pushing.
- Test what you can: run `node --check` on modules, use headless Chrome/Playwright if available at a mobile viewport (390×844), and run the auth flow against the live backend. Email confirmation is on, so don't create parent accounts with `signUp` in tests (the free-tier email rate limit is low and bounces hurt). Use the test account credentials given in your task prompt (never commit them).
