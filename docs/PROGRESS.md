# Progress

## 2026-11-09 — backend set up (local Claude session)
- Supabase project `kebun-makna` created. Schema, RLS, the 17,804-row sources library and 3 edge functions (`family`, `child-login`, `payment-webhook`) are deployed.
- Verified end to end:
  - parent login → create a child → child login with PIN → child session
  - wrong PIN rejected; children can't read families or secrets, or raise their own tier
  - posts need a real source; the profanity filter blocks; the parent can read the child's save
  - the webhook rejects unsigned calls
- Parent override PIN RPCs added (migration `20261109024500`).
- Repo created; root = current live game (unchanged); new work goes in `/beta/`.

## Next
Phase 0 (see PLAN.md).

## Needs applying
(none)

## Questions for Ricky
- Trakteer and Saweria page URLs, plus their webhook token and stream key, so the support page and webhook can go live.
- Who reviews the hadith-based story content (you, or an ustaz)?
