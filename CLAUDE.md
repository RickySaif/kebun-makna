# Kebun Makna — build brief for Claude

You are continuing the build of **Kebun Makna**, a free, Harvest Moon-style pixel farm game that teaches Indonesian children (first player: Ricky's son Amtar, plays on **iPhone 13 Safari**) the word-by-word meaning and recitation of short Juz 30 surahs, and is now growing into a **logged-in social game** about being a good Muslim as taught by Prophet Muhammad ﷺ. Owner: Ricky Saif (product owner, not an engineer). UI language: **Bahasa Indonesia**, warm and child-friendly.

Read `docs/PLAN.md` for the phased work and acceptance criteria. Keep `docs/PROGRESS.md` updated at the end of every work session (what shipped, what's next, open questions for Ricky).

## Non-negotiable rules
1. **Religious accuracy.** Never invent an ayah, a hadith, a translation or a word meaning. Qur'an and hadith text shown anywhere must come from the `sources` table (or the existing reviewed `DATA` block in the game). Every story or dialogue that relies on a hadith or ayah must cite real rows from `sources`: keep the `sources.id` values in the content file and list them in `docs/CONTENT_REVIEW.md` (a simple list of what each story cites). Story content is built straight into `/beta/` with no status flags or parent-only preview; Ricky's ustaz reviews the whole beta before cutover.
2. **Word audio** for the existing 10 surahs is cut from Alafasy's continuous recitation (`audio/w`, `audio/a`, `audio/v`). Don't regenerate or replace it with TTS.
3. **Children's safety.** Children never type an email or password. No free chat or DMs. Posts must cite a source. Comments are short and filtered on the server. Parents see everything their children do. Never show a child's family code to other users.
4. **Don't break the live game.** Since the cutover (2026-11-13) the new game is the root of the repo and is live at https://km.generasimerdeka.com/ (`index.html`, `js/`, `css/`, `audio/`, `models/`, `content/`). The original single-file game is kept unchanged at `classic/` (with its own old word clips in `classic/audio/w`; it shares `audio/a` and `audio/v`). `beta/index.html` only redirects old links to the root. Every push to `main` deploys to players at once.
5. **No build step.** Plain HTML, CSS and native ES modules. Load libraries from CDN with **exact pinned versions** (for example `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm`, `@huggingface/transformers@3.8.1`). It must work on iOS Safari 17+ and need nothing installed.
6. **Secrets.** Only the publishable key goes in the frontend. Never commit a service-role key or a webhook secret.
7. **Game order.** The original Qur'an game comes first, exactly as it is today: the 10 surahs An-Nas → Al-Fil with word meanings, recitation, villager quests, crops and the 4 bosses. Don't reorder, merge or rewrite it. New layers (the in-game recitation gate, accounts, cloud save) wrap around it without changing its story or flow. The hadith/akhlak story arc unlocks only after the player finishes the original game (all 10 surahs plus `boss4`), as the next chapter in the same village. Social features (feed, visits, race, groups) are reachable from the start but must never interrupt or replace the original progression.

## Backend (already live; you don't need Supabase admin access)
- Project: `kebun-makna`, ref `vnzmvmlvicyggylgukaz`, region ap-southeast-1, **free tier** (pauses after 7 days idle; Ricky restores it).
- URL: `https://vnzmvmlvicyggylgukaz.supabase.co`
- Publishable key (safe in the frontend): `sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5`
- Schema source of truth: `supabase/migrations/*.sql`. Edge functions: `supabase/functions/*`.
- **If you need a schema or function change:** write a new migration file (`supabase/migrations/<timestamp>_<name>.sql`) or edit the function source. Do **not** assume it's applied. List it under "Needs applying" in `docs/PROGRESS.md`, and write the frontend so it degrades gracefully until it's applied. Ricky's local Claude applies these.

### Auth model
- **Parent:** normal Supabase email auth (`signUp` / `signInWithPassword` / magic link). A trigger auto-creates `profiles(role='parent')` and `families(code)`, a 6-hex family code. Show it as `KM-XXXXXX`.
- **Child (sub-account):** created by the parent. `POST /functions/v1/family` with the parent JWT:
  - `{action:'create', display_name, avatar, pin}` (PIN is 4–6 digits)
  - `{action:'set_pin', child_id, pin}`
  - `{action:'delete', child_id}`
- **Child sign-in** on any device, with no email:
  1. `POST /functions/v1/child-login {family_code}` returns `{children:[{id,display_name,avatar}]}`.
  2. Pick the avatar, then `POST {family_code, child_id, pin}`, which returns `{token_hash}`.
  3. `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` gives a normal session.
  
  The account locks for 10 minutes after 5 wrong PINs (HTTP 429). Verified end-to-end on 2026-11-09.
- **Parent override PIN** (for the recitation gate):
  - The parent calls `rpc('set_parent_pin', {pin})`.
  - A child session calls `rpc('verify_parent_pin', {pin})`, which returns `'ok'|'wrong'|'locked'|'unset'`. A successful check is logged.
  - `rpc('has_parent_pin')` returns a boolean.

### Tables (RLS enforced; see the migrations for the exact policies)
| table | who reads | who writes |
|---|---|---|
| `profiles` (id, role, display_name, avatar, supporter_tier) | any signed-in user | self or parent: `display_name` and `avatar` only |
| `families` (parent_id, code) | the parent only | trigger |
| `family_members` (child_id, parent_id) | that parent or that child | edge function |
| `game_saves` (profile_id, state jsonb, version) | self, parent, admin | self |
| `farm_public` (profile_id, snapshot jsonb, level, surahs_done) | any signed-in user | self (for farm visits) |
| `activity_log` (profile_id, kind, detail) | self, parent, admin | self (insert) |
| `farm_interactions` (visitor, owner, kind water/salam, preset) | both parties and their parents | visitor; water is unique per visitor, owner and day |
| `sources` (id `quran:S:A` / `bukhari:N` / `muslim:N`, ref_label, arabic, indonesian, attribution, `search` tsvector) | everyone | nobody (read-only library) |
| `follows` | any signed-in user | follower; the follower's parent can remove |
| `posts` (author, **source_id required**, body ≤ 500) | everyone, except hidden posts (visible to author, parent, admin) | author. The trigger enforces the word filter and 10 posts a day. Parent or admin can set `hidden`. |
| `comments` (post, author, body ≤ 280) | same as posts | author (60 a day, filtered). The post author, the commenter's parent, or admin can delete. |
| `reactions` (preset: masyaallah, jazakallah, aamiin, subhanallah) | any signed-in user | self |
| `reports` | the reporter and admin | reporter. 3 distinct reports auto-hide the item. |
| `groups` / `group_members` + `rpc('join_group',{code})` | members | owner creates; join is by code |
| `supporter_tiers` (1 Penanam 🌱 ≥ Rp25k · 2 Perawat Kebun 🌳 ≥ 100k · 3 Penjaga Desa 🏡 ≥ 500k · 4 Sahabat Kebun Makna 🌟 ≥ 1jt) | everyone | — |
| `payments` | the parent and admin | `payment-webhook` edge function only |

- **Sources library:** 6,236 ayat (Kemenag translation via quran.com), 6,638 Bukhari and 4,930 Muslim hadith (Lidwa Pusaka Indonesian translation and **Lidwa numbering**, via github.com/gadingnst/hadith-api, MIT).
  - Lidwa numbers differ from sunnah.com/Fuad Abdul Baqi numbering. Always show the `ref_label` and the `attribution`.
  - Muslim's first entries are muqaddimah (introduction), not hadith in the main collection.
  - Hadith `indonesian` text includes the full sanad ("Telah menceritakan kepada kami [...]"). For display to children, show the matn (the part after the chain) when you can split it reliably, and always offer the full text behind "Lihat lengkap".
- **Supporter payments:** Trakteer or Saweria POSTs to `/functions/v1/payment-webhook?provider=trakteer|saweria`. The supporter writes their family code (`KM-XXXXXX`) in the message. The webhook matches it, sums the totals and sets `supporter_tier` on the parent and all their children. Ricky still has to create the Trakteer and Saweria pages and set the `TRAKTEER_WEBHOOK_TOKEN` and `SAWERIA_STREAM_KEY` secrets. Until then, the support page shows instructions with placeholder links from `beta/js/config.js`.

## The original game (now `classic/index.html`, about 173 KB, one file; the new game in `js/` was split from it)
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
- Commit small and often to `main`. Don't touch `classic/`. Write clear commit messages. Pushing to `main` deploys the live game via GitHub Pages, so it must never be left broken: run the tests (`tests/`, see docs/PROGRESS.md) before pushing.
- Test what you can: run `node --check` on modules, use headless Chrome/Playwright if available at a mobile viewport (390×844), and run the auth flow against the live backend. Email confirmation is on, so don't create parent accounts with `signUp` in tests (the free-tier email rate limit is low and bounces hurt). Use the test parent credentials given in your task prompt (never commit them). Delete test children you create.
