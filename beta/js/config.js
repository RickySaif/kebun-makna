// config.js — backend, links and feature flags for Kebun Makna v2 (beta).
// Only the publishable key belongs here. Never put a service-role key or webhook secret in the frontend.

export const SUPABASE_URL = 'https://vnzmvmlvicyggylgukaz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_obFuN_gARWpT-HHQWBEDXg_37CaxUE5';
export const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export const TRANSFORMERS_ESM = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

// Support pages. Trakteer webhook is live (verified 2026-11-09). Saweria is not used for now:
// an empty value hides its button. Trakteer pays in "Cendol" units; supporters must write their
// family code KM-XXXXXX in the support message so the webhook can match it.
export const SUPPORT = {
  trakteer: 'https://trakteer.id/nurul_bahirah',
  saweria: '',
};

// Recitation recognition (Phase 2).
export const RECITE = {
  model: 'eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran',
  passRatio: 0.6,        // share of ayah words matched in order to pass
  silenceMs: 1500,       // auto-stop after this much silence
  maxMs: 15000,          // hard stop
  failsBeforeParent: 3,  // after this many fails, offer "Minta Ayah/Ibu dengar"
};

export const FLAGS = {
  cloudSave: true,
  social: true,
  recitationGate: true,
  // Pending (unreviewed) story content is NEVER shown to children; parents may preview it.
  showPendingToParents: true,
};

export const SAVE_DEBOUNCE_MS = 3000;
