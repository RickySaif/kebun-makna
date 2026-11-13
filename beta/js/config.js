// config.js — backend, links and feature flags for Kebun Makna v2 (beta).
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
// Grading (beta/js/match.js): a word is wrong only when a letter changes (قلب/كلب); tajwid and harakat are not graded.
export const RECITE = {
  model: 'eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran',
  dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
  maxWrong: 0,           // words allowed to be wrong or missing and still pass (0 = every word must keep its letters)
  silenceMs: 1500,       // auto-stop after this much silence
  maxMs: 15000,          // hard stop
  failsBeforeParent: 3,  // after this many fails, offer "Minta Ayah/Ibu dengar"
};

export const FLAGS = {
  cloudSave: true,
  social: true,
  recitationGate: true,
};

export const SAVE_DEBOUNCE_MS = 3000;
