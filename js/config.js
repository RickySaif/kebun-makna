// config.js — backend, links and feature flags for Kebun Makna.
// Only the publishable key belongs here. Never put a service-role key or webhook secret in the frontend.

export const SUPABASE_URL = 'https://vnzmvmlvicyggylgukaz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5';
export const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export const TRANSFORMERS_ESM = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

// Support pages. Trakteer webhook is live (verified 2026-11-09). Saweria is not used for now:
// an empty value hides its button. Trakteer pays in "Cendol" units; supporters must write their
// family name as #name (e.g. #saif) in the support message so the webhook can match it.
export const SUPPORT = {
  trakteer: 'https://trakteer.id/nurul_bahirah',
  saweria: '',
};

// Recitation recognition. One model for everyone, downloaded in the background when the game opens (~140 MB, once).
// Practice, never a requirement: each ayah is read once after its quizzes (Susun), and the whole surah ayah by ayah at
// the end of Surat Utuh (Ricky 2026-11-14). Each try shows "Ketepatan" = share of meaning letters read right (js/match.js; قلب/كلب).
export const RECITE = {
  id: 'base-km8',         // changes when the model changes (logged with each attempt)
  // Tarteel whisper-base, served from models/ with a smaller decoder that fits iPhone Safari (see models/README.md)
  model: 'whisper-base-ar-quran',
  dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
  size: '≈90 MB', bytes: 93160438, // all files, for the progress bar
  silenceMs: 1500,       // auto-stop after this much silence (short checks)
  maxMs: 15000,          // hard stop
  // reading pages (Ricky: record everything, the child taps Selesai; only a long silence ends it)
  ayahSilenceMs: 6000, ayahMaxMs: 60000, surahSilenceMs: 8000, surahMaxMs: 150000,
};

export const FLAGS = {
  cloudSave: true,
  social: true,
  recitationGate: true,
};

export const SAVE_DEBOUNCE_MS = 3000;
