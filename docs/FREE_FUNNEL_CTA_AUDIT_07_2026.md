# Free-funnel CTA audit — every surface gets a next step and a metric

_Created: 12-07-2026 · Last updated: 12-07-2026_

Executed as [H716](https://github.com/gasyoun/Uprava/blob/main/handoffs/archive/H716-Fable_SanskritKaraoke_free-funnel-cta-audit_11.07.26.md)
(MEGABOOK §4.3, Lane D of the Fable sprint) by Fable 5 (`claude-fable-5`), 12-07-2026.
Scope: the org's live free-funnel surfaces — CTA present? points where? metric wired? —
plus repo-local fixes where the repo fully owns the rendered surface. No deploys, no new
surfaces; CTA copy restricted to custdev-proven messages (see «Copy evidence» below).

## Audit table

| # | Surface | Public URL | CTA before audit | CTA after audit | Destination | Metric wired | Residual action |
|---|---|---|---|---|---|---|---|
| 1 | SanskritKaraoke site (4 pages: app, catalogue, student, progress) | [gasyoun.github.io/SanskritKaraoke](https://gasyoun.github.io/SanskritKaraoke/) | ❌ none clickable (course link existed only baked into exported videos) | ✅ `.cta-footer` on all 4 pages (v1.4.8, this pass) | `samskrtam.ru/usha-sanka` + `t.me/rusamskrtam` | 🟡 UTM only (`utm_source=karaoke&utm_medium=cta&utm_campaign=<page>`) — no on-site analytics tag | Metrika tag on the Pages site: a human should decide (same ruling family as ORS-FAQ R5) |
| 2 | Rendered karaoke videos (feed exports) | posted per-platform | ✅ canvas footer + end-card (`drawFooter`/`drawEndCard` in [src/core/feed.js](https://github.com/gasyoun/SanskritKaraoke/blob/main/src/core/feed.js)) | unchanged | `samskrtam.ru/usha-sanka` | ✅ UTM per platform/verse via [tools/post_kit.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/post_kit.py) | none — gated on the MG audio drop, not on CTA wiring |
| 3 | ORS-FAQ static site (~124 notes + master quiz) | [samskrtam.ru/faq/](https://samskrtam.ru/faq/) | ✅ per-note `cta_primary`/`cta_secondary` frontmatter + quiz/card CTAs in [publish.py](https://github.com/gasyoun/ORS-FAQ/blob/main/ors_faq/publish.py) | unchanged (already the best-wired surface) | `samskrte.ru/online` (UTM), `t.me/rusamskrtam`, `samskrtam.ru/u` | ❌ no Metrika tag on `/faq/` — CTA clicks invisible on-site; only UTM reaches the shop | already ruled (R5, [LTV_COLLECTOR_PLATFORM_FINDINGS.md](https://github.com/gasyoun/ORS-FAQ/blob/main/docs/LTV_COLLECTOR_PLATFORM_FINDINGS.md)): reuse Metrika 18296974, owner-gated on a Metrika OAuth token — no repo-local fix landed here, deploy is FTP-to-prod on merge |
| 4 | samskrutam-crossword (static bundle, no git repo) | not deployed — bundle parked as [Uprava handoffs/assets/H216_*](https://github.com/gasyoun/Uprava/tree/main/handoffs/assets) | ❌ none | ✅ same `.cta-footer` pattern added to the bundle's `index.html` (this pass) | `samskrte.ru/online` (UTM `utm_source=crossword`) + `t.me/rusamskrtam` | 🟡 UTM only; WordPress host page may carry site Metrika | MG @DO: drop the bundle into `samskrtam.ru/crossword/` (H216 resume step) |
| 5 | SanskritRussian glossary (3-layer Sa→Ru, 190k forms) | [gasyoun.github.io/SanskritRussian](https://gasyoun.github.io/SanskritRussian/) | ❌ none (pure reference page) | ✅ CTA footer added to `index.html` (this pass) | `samskrte.ru/online` (UTM `utm_source=glossary`) + `t.me/rusamskrtam` | 🟡 UTM only — no analytics tag | none blocking; Metrika tag rides the same decision as row 1 |
| 6 | csl-guides Sanskrit Level Quiz + Word Game | [sanskrit-lexicon.github.io/csl-guides/tools/sanskrit-level-quiz](https://sanskrit-lexicon.github.io/csl-guides/tools/sanskrit-level-quiz) · [/tools/word-game](https://sanskrit-lexicon.github.io/csl-guides/tools/word-game) | 🟡 internal links only (no course CTA) | unchanged — not repo-local to this funnel | internal site pages | ❌ localStorage-only telemetry, «never sent anywhere»; no gtag wired in `docusaurus.config.js` | a human should decide whether a commercial samskrte.ru CTA belongs on the scholarly `sanskrit-lexicon` org site (EN audience, RU courses) — GTD @DECIDE |
| 7 | Systema intent master quiz (3-day diagnostic marathon) | `/online/konsultaciya` on samskrte.ru — launch-gated to 28-08-2026 | ✅ intent-routing quiz → personal track → ₽500 paid track ([MarathonController.php](https://github.com/gasyoun/Systema-Sanscriticum/blob/main/app/Http/Controllers/MarathonController.php)) | unchanged | course tracks + payment | ✅ Yandex Metrika + VK pixel goals (per-landing `yandex_metrika_id`/`vk_pixel_id` in [promo.blade.php](https://github.com/gasyoun/Systema-Sanscriticum/blob/main/resources/views/layouts/promo.blade.php)) | none — the only fully-wired surface; gated on cohort launch, tracked as goal G31 |

**The structural gap (one sentence):** the genuinely public free surfaces (rows 1, 4, 5, 6)
had no next step and no metric, while the only surface with both (row 7) is not public yet —
this pass closes the CTA half on every surface the org's own repos render (rows 1, 4, 5), and
leaves analytics-tag and org-boundary questions as the two residual human calls.

## Copy evidence (why this CTA text and no other)

Source: [ORS-FAQ docs/custdev_full_report.md](https://github.com/gasyoun/ORS-FAQ/blob/main/docs/custdev_full_report.md)
(2,605 dialogs joined to CRM ground truth), win/loss lifts over the 52% base:
скидка/льгота **+9**, рассрочка **+8**, «в своём темпе» **+5**, личное внимание **+4**;
**срочность/набор −7**, **соц-доказательство −6**. Hence the shipped copy: primary
«Записаться на курс санскрита →», hint «Можно в записи и в своём темпе» (the top proven
barrier-removal props), secondary «Задать вопрос в Telegram» (the canonical curator
channel `t.me/rusamskrtam`). No urgency, no student-count claims, no invented prices —
volatile facts stay on the destination pages.

## Metric convention

Every CTA link carries `utm_source=<surface>&utm_medium=cta&utm_campaign=<page>`, matching
the existing conventions in [ORS-FAQ wiki frontmatter](https://github.com/gasyoun/ORS-FAQ/blob/main/ors_faq/wiki/courses/грамматика.md)
(`utm_source=faq&utm_medium=cta`) and [SanskritKaraoke tools/post_kit.py](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/post_kit.py).
Attribution therefore lands in the destination sites' Yandex Metrika (counter 18296974 for
samskrtam.ru) even where the source page carries no tag. On-source-page event tracking is
the residual gap, deliberately not greenfielded here: no analytics pattern existed in these
repos, and the org's ruling on record (ORS-FAQ R5) is «reuse Metrika, no own beacon», gated
on an owner OAuth token.

## Fixes landed this pass

- SanskritKaraoke v1.4.8: CTA footer on all 4 deployed pages (i18n RU/EN), `docs/legal/`
  excluded from the public Pages artifact, service-worker cache bumped.
- SanskritRussian: CTA footer on the glossary `index.html`.
- samskrutam-crossword bundle (in Uprava assets): CTA footer added, ships with the
  eventual WordPress drop.

_Dr. Mārcis Gasūns_
