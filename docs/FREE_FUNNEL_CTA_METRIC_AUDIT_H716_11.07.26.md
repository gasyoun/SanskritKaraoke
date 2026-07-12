# Free-funnel CTA/metric audit (H716, MEGABOOK §4.3) — pointer

_Created: 11-07-2026 · Last updated: 11-07-2026_

Executes [H716](https://github.com/gasyoun/Uprava/blob/main/handoffs/H716-Fable_SanskritKaraoke_free-funnel-cta-audit_11.07.26.md).
Scope: every free surface named in [MEGABOOK.md](https://github.com/gasyoun/Uprava/blob/main/MEGABOOK.md)
§4.3 (FAQ, karaoke, crossword, glossary, diagnostic) — CTA present? destination?
metric wired?

**Full audit (with private analytics/campaign specifics) lives in the private
`Uprava` hub, not here** — this repo is public (deployed via GitHub Pages), and
the full table names a live analytics counter ID and UTM-campaign structure
that belong to a different, revenue-facing repo (ORS-FAQ). See
[`Uprava/FREE_FUNNEL_CTA_METRIC_AUDIT_H716_11.07.26.md`](https://github.com/gasyoun/Uprava/blob/main/FREE_FUNNEL_CTA_METRIC_AUDIT_H716_11.07.26.md)
for the complete table and evidence.

## What's public-safe to say here

- **SanskritKaraoke's own free surfaces were audited**: `index.html`,
  `student.html`/`tools/templates/student.html`, `catalogue.html`,
  `progress.html`, `apte_prosody(_ru).html`. None of the student-facing pages
  (`student.html`, `catalogue.html`, `progress.html`) carries a CTA toward the
  paid course — all cross-links are internal, tool-to-tool navigation.
- **The karaoke video-drop funnel (Telegram/IG/YT/TikTok) already has a CTA**
  wired via `tools/post_kit.py` (UTM-tagged link to the course landing page,
  reusing the existing approved caption copy) — no gap there.
- **A draft CTA banner for the student web app was prepared and withdrawn**
  this pass: it would have reused the exact already-shipped copy and an
  existing sticky/dismiss UX pattern with no invented marketing text, but
  inserting a commercial, externally-tracked CTA into the live product is a
  business decision a human should make, not something to land unilaterally.
- **`samskrutam-crossword` does not exist** as a repo — MEGABOOK names it as a
  free-funnel surface but it was never built. Not a CTA gap, a surface gap;
  out of scope to build here (constraint: no new surfaces this pass).

**Recommendation (a human's call, not auto-applied):** decide whether to land
the drafted student-app CTA banner (copy/destination as recorded in the
private audit) on `student.html`/`catalogue.html`/`progress.html`.

_Dr. Mārcis Gasūns_
