# Progress

Live: https://km.generasimerdeka.com/ · (old address https://rickysaif.github.io/kebun-makna/ redirects)

## 2026-11-13 — Original game removed (Ricky: "Delete the classic game")
- `classic/` (the single-file game and its old word clips) is deleted; it is in git history before this commit. `tests/phase0-playthrough.mjs` now only plays the game through (no comparison).
- The old address rickysaif.github.io/kebun-makna is redirected by `index.html` itself (GitHub Pages kept serving it after the custom domain was attached).

## 2026-11-13 (late night) — Cutover: the new game is the main game at km.generasimerdeka.com
- Ricky: "the recitation feature is good enough"; Google Cloud (authorized JavaScript origin) and Supabase (Site URL / Redirect URLs) updated by Ricky; DNS `km CNAME rickysaif.github.io` set.
- **Layout:** the new game moved from `beta/` to the repo root (`index.html`, `js/`, `css/`, `models/`, `tools/`, `tests/`, `cek-audio.html`); its re-cut word clips are now `audio/w/`. The original game is unchanged at `classic/` with its own old word clips (`classic/audio/w/`); it shares `audio/a` and `audio/v`. `beta/index.html` redirects to the root and keeps `?query#hash` (old bookmarks, old confirmation/reset emails).
- Paths fixed: `js/data.js` (`audio/a`, `audio/v`), `js/akhlak.js` (`content/akhlak` via `import.meta.url`), `cek-audio.html`, tools (`tools/recut-words.mjs`, `tools/apply-emoji.mjs`: run from the repo root), tests (`BASE + '/'`, phase0 compares `/classic/` with `/`). `js/recite.js` already resolved `models/` from `import.meta.url`.
- Tests on the new layout: syntax, word-audio, phase0 (classic vs new, save identical), v3, akhlak, fit-height 81/81, model-boot, phase2-recite, practice-lock: all pass.
- **Saved progress and the new address:** a browser keeps saves per address. Signed-in children: progress is in the cloud, nothing lost (they sign in again once). Guests and anyone who only played the classic game at rickysaif.github.io: their save stays at the old address, which redirects once the domain is attached. See "Questions for Ricky".
- Ricky to check after the domain is live: Google sign-in on the new address, a confirmation/reset email link, recitation on the iPhone.

## 2026-11-13 (night) — iPhone loop, take 2: a model that fits; Pak Ustaz while checking; "Yang Ustaz dengar"
**Still looping on Ricky's iPhone 13 (Safari) after the evening fix:** download → reload → (faster) download → reload …
- **Why the guard didn't hold:** the crash marker was written to localStorage, which Safari puts on disk a moment later in the background; the build blocks the page right away and the tab was killed first, so after the reload no marker was found. Now the marker is written to **Cache Storage** (the promise resolves after the write is done) *and* localStorage, and the build waits 0.5 s after writing it.
- **Why it crashed at all:** the base decoder (123 MB) keeps the 51865×512 token table in float32 (106 MB), and ONNX Runtime makes a second transposed copy of it for the logits. **New decoder** (`beta/tools/shrink-decoder.py`, same weights): int8 table with a scale per row for the lookup; 8-bit integer weights for the logits (DynamicQuantizeLinear → MatMulInteger, a scale per column); the float32 table is gone. Decoder 123 → 71 MB; all files 146 → 93 MB. Peak memory while building (Chrome, 3 runs): **~450–590 MB, was 600 MB–1 GB**.
  - Accuracy is the same as the original: Alafasy ayat 48/48, parts 71/74, words 161/201 (was 162), correct TTS reading → 100% 8/10, letter swaps caught 10/12; on every wrong-reading test file it hears exactly the same text as the original.
  - A 4-bit version (61 MB) was smaller but heard "a'uzu" as أعوذ (lost the ذ/ز difference): rejected. ORT web supports MatMulNBits only at 4 bits, hence the standard-op 8-bit path.
- **The model is now served from this site** (`beta/models/whisper-base-ar-quran/`, Apache-2.0, see `beta/models/README.md`), not Hugging Face. Old cached files of other models are deleted on the next visit.
- **If the iPhone still shows the memory message** on the start-up screen: next step is recognising on a server (voice leaves the phone), or the tiny model (correct readings by a different voice passed only 2/10).

**Reading page while checking (Ricky):** while listening only ⏹️ Selesai works; while checking, every button (Dengar, Baca, Lanjut, back ◂, word taps) is off, the ayah is dimmed and **Pak Ustaz** (new villager look: white peci and baju koko; follows "tanpa mata") appears: "Sebentar, Ustaz sedang mendengarkan bacaanmu…". Test: `beta/tests/practice-lock.mjs`.

**"Yang Ustaz dengar" (Ricky):** under the score, for up to 3 red words: the word as written ← what the model heard, **with its harakat**, plus the letters to fix: "ذ terdengar ز", "د tidak terdengar", "ada ر tambahan". `match.js` `compare()` now returns these letter differences (`ops`), only for meaning-changing letters.

## 2026-11-13 (evening) — iPhone reload loop fixed; model prepared at start-up; every screen fits the phone height
**Bug (Ricky, iPhone 13):** after the model finished downloading the page reloaded, downloaded again, reloaded… (3×).
- **Cause:** building the recognizer briefly needs several times the model's size in memory. Measured in Chrome for the base model: peak ~600 MB right after download, ~1 GB when loading from storage. iOS kills a Safari tab that goes over its limit and Safari reloads it. transformers.js only wrote a file to storage after reading all of it into memory, so the crash lost the download. Since the last change the load started at boot, so every reload crashed again.
- **Fix (`recite.js`):**
  1. **Download (`prefetchModel`):** each file is streamed straight into Cache Storage under the key transformers.js looks up. Low memory; finished files survive a crash; a second visit downloads nothing (tested).
  2. **Build (`loadModel`):** guarded by a marker in localStorage. If the page opens and finds the marker, the last build crashed this tab: the game **never builds again by itself** (no reload loop). It says "Pengenal bacaan berhenti karena memori HP penuh. Tutup aplikasi lain, lalu coba lagi." with **Coba lagi** and **Main tanpa latihan baca**; the reading pages show the same message, and Lanjut always works.
  3. **Start-up screen (Ricky: "make sure it has been downloaded before it reaches the practice page"):** "Menyiapkan pengenal bacaan" with a progress bar (MB) comes before the farm (guest, child and parent-playing). It downloads, then builds the recognizer while nothing else is loaded yet. The first reading page then has the mic ready at once (tested). Offline: "Sambungkan ke internet …" + Coba lagi / Main tanpa latihan baca.
- **Smaller model? No.** Tested the tiny Tarteel builds with the same harness. Sharjeelbaig/whisper-tiny-ar-quran-onnx (≈63 MB): Alafasy ayat 47/48, parts 66/74, words 146/201, but a correct reading by a different voice (TTS) passed only **2/10** (base: 8/10), so a child reading correctly would often see red words. aaqibhabib/whisper-tiny-ar-quran-onnx: 0/48 (broken). Kept the base model (`RECITE.id = 'base-q4'`).
- **Watch on the iPhone:** if the start-up screen shows the memory message, the base model is too big for that phone even at start-up. Next options then: (a) the tiny model, with the accuracy cost above, or (b) recognising on a server (the voice would leave the phone).
- Tests: new `beta/tests/model-boot.mjs` (fresh device, second visit, simulated crash, offline). Tests that don't need recognition use `noModel()` + `startGuest()` / `skipPrep()` from `lib.mjs`.

**No vertical scroll (Ricky):**
- **Farm:** exactly one screen tall (`css/fit.css`); the map takes the height left after the HUD and dialog and keeps its shape (`fitCanvas` + ResizeObserver). The walking hint shows only on tall screens (the intro dialog already explains it).
- **Panels, the celebration pop-up, start and onboarding screens:** `fitAll()` in `ui.js` scales a screen down with CSS `zoom` just enough to fit (text re-wraps, taps keep working). Below 62% it is a long list (shop, house, well, Buku Kata): that list scrolls inside its panel. Parent dashboard and social pages keep normal scrolling.
- **Avatar builder:** one option group at a time (tabs: Kulit, Rambut, Warna, Baju, Celana, Peci); the long "tanpa mata" note is left out of onboarding (still in ⚙). Kenali with 5+ words: three cards per row. The default 8 px body margin is gone.
- Tested (`beta/tests/fit-height.mjs`) at Safari's visible height on iPhone 13 (390×664) and iPhone SE (375×548): every screen fits, smallest zoom 0.67 (Cocokkan with 7 words on the SE, still readable).

## 2026-11-13 (later) — Reading practice inside each lesson (never a requirement) + emoji in Buku Kata
- **Flow (Ricky's choice):** Dengar → Kenali → **read each word** → Cocokkan → **read parts of 2–3 words** → Susun → **read the whole ayah** → celebration. Every page has ▶ Dengar, 🎙️ Baca and **Lanjut** (always works; nothing blocks). Reviews (murajaah) skip the word and part pages; the whole-ayah page shows on a review only if that ayah was never read aloud. The parent-PIN override is gone (nothing to override).
- **Score shown to the child:** "Ketepatan: N%" = share of meaning letters (consonants) read right; red wavy words; tap any word to hear it. ≥90% "MasyaAllah, jelas sekali!", ≥70% "Bagus! …", else "Ayo coba lagi pelan-pelan …".
- **Matcher changes (`match.js`):** letters heard before the first word / after the last word are ignored (the model pads short recordings, even Alafasy's: سَيَدْخُلُونَ, رَبَّكَ, كَبِأَصْحَابِ); a word's first and last letters must still line up, so a changed letter at the edge counts (اَرلّٰهُ, كل are still caught). Tanwin heard as ن is fine.
- **Very short words read alone** (1–2 consonants: مَا, مِنْ, لَمْ, هُوَ, عَنْ, فِي) are often not heard at all by the model, even from Alafasy. When such a word scores 0% the page says "Kata pendek: belum bisa dinilai" instead of a false 0%; it is scored inside the parts and the whole ayah. Logged with `score: null`.
- **Mic:** echo cancellation, noise suppression and auto gain are now OFF while recording. With them on, a'uzu (ذ→ز) was caught 2 of 6 times through Chrome's mic path; off: 6 of 6, and Alafasy still 5 of 5 at 100%. **Watch on the iPhone:** without auto gain a soft voice may give "Tidak ada suara"; tell me if that happens.
- **Measured on Alafasy's own audio (correct readings):** whole ayat 96/96 at 100%; parts 71/74 at 100% (rest 80–86%: the model hears عَوْدٌ for عَنۡ, خَيْرًا for طَيۡرًا); single words read alone 162/201 at 100% (most misses are the short words above; others are the model mishearing a clip cut from continuous recitation, e.g. حَاسِبٍ for حَاسِدٍ). Letter swaps at text level: 478/478 caught.
- **Logs:** `recitation_try {ayah, part: kata|bagian|ayat, words, score, ms, rec_s, heard, wrong}`; the dashboard shows "Latihan baca".
- **Buku Kata** cards now show the word's emoji (as the Kenali cards do).
- **Emoji for every word (Ricky: "you decide"; boundary clarified: nothing with eyes):** source of truth `beta/tools/word-emoji.json`, applied by `node beta/tools/apply-emoji.mjs`. Not allowed: faces, people drawn with faces, animals, 👀. Allowed: eyeless figures (🗣️ katakanlah, 👥 manusia/berbondong-bondong) and body parts (🤲 🫀 🤝 🙏). **No emoji for words that refer to Allah** (His name, Tuhan, Raja, sembahan, Esa, aṣ-Ṣamad, Dia/Kami for Him, Maha Penerima Taubat); a verb whose doer is Allah shows the action or object (خَلَقَ ✨, اَعۡطَيۡنٰكَ 🎁). Animal words (gajah, burung) and a few people words (anak yatim, istrinya, Abu, Quraisy, pronouns) stay plain.

## 2026-11-13 — Word clips fixed: 152 of 201 were partly or fully muted (prod bug reported by Ricky)
- Symptom: on An-Nas 1, بِرَبِّ had no sound and أَعُوۡذُ lost its "dzu".
- Cause: `recut-words.mjs` seeked with `-ss` after `-i`, so the fades ran on the ayah's timeline; the fade-out landed inside or before the word. The boundaries were right; only the cutting was wrong.
- Fix: `atrim` + `asetpts=PTS-STARTPTS` before the fades; all 201 clips re-cut (same boundaries, wordcuts.js and WORD_AUDIO.md unchanged).
- Verified: no clip has audible recitation muted (new check in `word-audio.mjs`, which fails 152 clips on the old files); the clips of every ayah joined back together and run through the recitation model give 201/201 words right; all 48 ayah, 201 word and 8 voice files exist and are audible.

## 2026-11-13 — Recitation: one model, downloaded from the start; graded on meaning (letters), not tajwid
- **One model for everyone (Ricky's call):** q4 (~140 MB). The "Kualitas" profile and the picker are gone; a cached "mix" model is deleted once. Tested on all 48 Alafasy ayat: the fp32-encoder build heard exactly the same words and letter swaps, so it wasn't worth +65 MB.
- **Downloads in the background from boot** (1.5 s after the game opens; not on the parent dashboard or parent login). No grown-up approval step. The gate shows "Menyiapkan pengenal bacaan… N%" and turns the mic on when ready; on a network error it offers "Coba unduh lagi" plus the parent button. Pengaturan shows status only.
- **Grading (`beta/js/match.js`, Ricky: "pronunciation without changing the meaning", e.g. qalb/kalb):** a word is wrong when a consonant changes, or one is added or dropped. Ignored: harakat and tajwid, hamza seats, ة/ه, ى/ي, long-vowel letters ا و ي (mushaf vs. modern spelling) and the assimilated lam of al- + sun letter. **Every word must be right to pass** (`RECITE.maxWrong = 0`). Wrong words are red with a wavy underline; tap any word to hear it; after a fail the first red word plays.
- **Measured:** Alafasy 96/96 ayat pass with every word ✓ (no false fails). Text-level letter swaps on every word: 478/478 caught. TTS (macOS Majed) swaps: 8 of 10 caught by q4 + An-Nas 1 ذ→ز and ن→م caught. **Limit:** the model was trained on correct recitation and sometimes "hears" the right word anyway (خلك → خلق, and كل → قل in one build). When it flags a letter it's reliable; it can miss some. Real data from Amtar will tell how often.
- **Bug fixed:** `transcribe()` passed `language/task`, which this model's generation config rejects (`reading '<|ar|>'`), so every call went through the fallback. It now calls the plain form directly.
- Logs now include `ok/bad/miss` and `wrong: ["أعوذ→أعوز"]`; the dashboard shows "salah: …".
- Verified: `phase2-recite.mjs` (rewritten; new `wrong.wav`, see the header) all ok, model ready 49.8 s after boot on desktop; `phase0-playthrough` ok.

## 2026-11-10 (later) — Word audio boundaries re-checked for all 201 words

- **Problem (Ricky):** a word card sometimes played only part of its word, and the rest played on the next card. Example: 114:1 "aʿūdhu" played "aʿū", and the "dhu" played on "birabbi".
- **Cause:** the word clips were cut at hand-placed boundaries. 67 of the 201 clips had an edge in the wrong place by more than 80 ms: inside a syllable (114:1 "dhu"), inside a hiss (the "sh" of "sharri", the "kh" of "khalaqa"), or in the middle of a long vowel.
- **What I did:** checked all 153 word boundaries in all 48 ayat. Compared the old boundaries with Quran.com's word timings for the same Alafasy recording (same files, same length). 64 boundaries agree within 80 ms. The other 89 were checked one by one on a spectrogram. Neither source is reliable alone: Quran.com often gives the tail of a long vowel to the next word (for example "yadā | abī"), and the old cuts often fall inside a syllable. Then re-cut all clips from our own `audio/a/` recordings into `beta/audio/w/`. The ayah highlight timings (`beta/js/wordcuts.js`) use the same boundaries. The live `audio/` folder is untouched.
- **Files:** `beta/tools/word-boundaries.json` (the reviewed boundaries), `beta/tools/recut-words.mjs` (re-cuts everything), `beta/tools/audio-analysis.mjs`, `beta/tests/word-audio.mjs`, `docs/WORD_AUDIO.md` (old vs new table for every word, and the rules used), `beta/cek-audio.html` (a page to listen to every word, new next to old).
- **Verified:** `word-audio.mjs` (every clip exists, matches its planned length, the clips of an ayah add up to the ayah, and the reported 114:1 word is now 0.83 s instead of 0.66 s); the first-surah playthrough still ends with a save identical to the classic game; the beta loads the new clips.
- **Not verified:** I cannot listen. Everything was judged from signal analysis and spectrograms. **Ricky or the ustaz should listen** with `beta/cek-audio.html`, especially the yellow ayat (105:4, 105:5, 106:4, 107:4, 111:5), where a nasal hum joins two words and the exact split is a judgement call.
- **At cutover:** the beta now loads `beta/audio/w/<id>.mp3`. When beta replaces the root, move that folder to `audio/w/` and delete the old `_r2` clips there; the classic game keeps using the old clips until then.

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
- `word-audio.mjs` (no backend, repo root): word clips exist, match their planned length, add up to the ayah.
- `phase0-playthrough.mjs` (root vs beta, no backend) · `phase1-accounts` · `phase1b-parent` · `phase1c-google` (needs `BASE=https://rickysaif.github.io/kebun-makna`, because GIS only renders on the authorized origin) · `phase2-recite` (needs `recite.wav` = `ffmpeg -i audio/a/114001.mp3 -af apad=pad_dur=2.5 -ar 16000 -ac 1 recite.wav` and `silence.wav` = `ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 10 silence.wav`; downloads the real model) · `phase3-feed` · `phase4-visit` · `phase5-race` · `phase6-groups` · `phase7-support` · `phase8-akhlak` (`CONTENT=<repo>/content/akhlak`).
- Last full run (2026-11-09): all pass.
