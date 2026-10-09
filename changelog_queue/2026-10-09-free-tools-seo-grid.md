# Free-tools SEO grid: tool pages + 58 verse landing pages + sitemap

_Created: 09-10-2026 · Last updated: 09-10-2026_

H6318 (GLM glm-5.3-flash). New `site/` tree shipped by the Pages workflow:

- [tools/](https://github.com/gasyoun/SanskritKaraoke/blob/main/site/tools/index.html) hub — metre detector + transliteration converter + the śloka library grid (58 verse pages).
- [tools/meter-detector/](https://github.com/gasyoun/SanskritKaraoke/blob/main/site/tools/meter-detector/index.html) — paste-a-shloka metre detector with the guru/laghu wave diagram; engine extracted verbatim from `src/scripts/app.js` by [tools/build_seo_pages.mjs](https://github.com/gasyoun/SanskritKaraoke/blob/main/tools/build_seo_pages.mjs) (same extraction precedent as `tools/test_meter_detector.py`, which still passes).
- [tools/encoding-converter/](https://github.com/gasyoun/SanskritKaraoke/blob/main/site/tools/encoding-converter/index.html) — Devanagari ↔ IAST with auto-detect of HK/ITRANS/SLP/VH/WX input (same verbatim engine extraction).
- `verse/<id>/` ×58 — Devanagari + IAST + wave + rights-gated translations (13 RU: 10 own-work + 3 cleared; 3 EN public-domain) + glosses (CC BY-SA attribution) + JSON-LD + proven CTA footer (`utm_campaign=verse-<id>`).
- `sitemap.xml` (61 URLs) + `robots.txt`; [.github/workflows/pages.yml](https://github.com/gasyoun/SanskritKaraoke/blob/main/.github/workflows/pages.yml) now copies `site/` into the Pages artifact.

Regenerate: `node tools/build_seo_pages.mjs` (self-checks: corpus coverage, rights counts, bhg_2_48 → anuṣṭubh pathyā canary, internal link resolution; exits non-zero on drift).

_Dr. Mārcis Gasūns_
