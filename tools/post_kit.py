"""post_kit.py — per-verse social drop kit generator (Phase 3 funnel).

For each verse, writes a drop/<campaign>/<verse_id>/ folder containing:
  - manifest.json    : machine-readable kit (captions, UTM CTAs, media refs, publish gates)
  - caption_en.txt   : ready-to-paste English caption + CTA + hashtags
  - caption_ru.txt   : Russian caption  (or caption_ru.BLOCKED.txt with the reason
                       when the RU translation is not cleared to publish)
  - hashtags.txt     : the hashtag block on its own

The CTA is a UTM-tagged link to the course landing page, one variant per platform,
so a chapter drop produces a ready-to-schedule folder and the funnel is measurable.

Publish gates: the kit refuses to mark a verse "ready" while the audio is not in
place (no Drive id / no canonical url) or a caption's translation is not cleared
(translation.rights.<lang>.status must be public-domain / own-work / cleared).

Usage:
  python tools/post_kit.py --all
  python tools/post_kit.py bhg_2_47 bhg_2_48
  python tools/post_kit.py --all --url https://samskrtam.ru/usha-sanka --out drop
"""
import sys
import os
import json
import argparse
from glob import glob

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

DEFAULT_URL = "https://samskrtam.ru/usha-sanka"
PLATFORMS = ["telegram", "instagram", "youtube", "tiktok"]
PUBLISHABLE = {"public-domain", "own-work", "cleared"}

BASE_HASHTAGS = ["#sanskrit", "#sanskritkaraoke", "#chanting", "#mantra",
                 "#vedicchanting", "#meditation", "#yoga"]
SOURCE_HASHTAGS = {
    "Bhagavad Gita": ["#bhagavadgita", "#भगवद्गीता", "#gita", "#krishna", "#karmayoga"],
}
EN_ATTRIB = "— tr. K. T. Telang (1882), public domain"
RU_ATTRIB = "— пер. В. С. Семенцов"


def campaign_of(verse_id, explicit):
    """Derive a campaign slug, e.g. bhg_2_47 -> bhg_2."""
    if explicit:
        return explicit
    return verse_id.rsplit("_", 1)[0] if "_" in verse_id else verse_id


def cta_url(base, platform, campaign, verse_id):
    sep = "&" if "?" in base else "?"
    return (f"{base}{sep}utm_source={platform}&utm_medium=social"
            f"&utm_campaign={campaign}&utm_content={verse_id}")


def hashtags_for(verse):
    src = (verse.get("source") or {}).get("text", "")
    tags = list(BASE_HASHTAGS) + SOURCE_HASHTAGS.get(src, [])
    return " ".join(tags)


def lang_cleared(verse, lang):
    rights = (verse.get("translation") or {}).get("rights") or {}
    status = (rights.get(lang) or {}).get("status")
    return status in PUBLISHABLE, status


def publish_gates(verse):
    """Return a list of human-readable reasons the verse is NOT ready to publish."""
    gates = []
    audio = verse.get("audio") or {}
    if audio.get("drive_file_id") in (None, "", "TODO") and not audio.get("canonical_url"):
        gates.append("audio: no playable file yet (drive_file_id=TODO, no canonical_url) — "
                     f"recording owed under {audio.get('license', 'audio license')}")
    ok_ru, st_ru = lang_cleared(verse, "ru")
    if ("ru" in (verse.get("translation") or {})) and not ok_ru:
        ref = ((verse.get("translation") or {}).get("rights") or {}).get("ru", {}).get("permission_ref", "")
        gates.append(f"ru caption: translation not cleared (status={st_ru or 'missing'}; {ref})")
    return gates


def build_caption(verse, lang, base_url, campaign):
    """Compose a ready-to-paste caption for one language, or None if not cleared."""
    ok, _status = lang_cleared(verse, lang)
    if not ok:
        return None
    tr = verse.get("translation") or {}
    text = tr.get(lang)
    if not text:
        return None

    title = (verse.get("title") or {}).get(lang) or (verse.get("title") or {}).get("en", verse["id"])
    meter = verse.get("meter", "")
    s1 = verse.get("s1dev") or verse.get("s1", "")
    s2 = verse.get("s2dev") or verse.get("s2", "")
    melody = (verse.get("author") or {}).get("melody", "")
    attrib = EN_ATTRIB if lang == "en" else RU_ATTRIB
    # Telegram link in-body; the manifest carries the per-platform variants.
    cta = cta_url(base_url, "telegram", campaign, verse["id"])
    melody_line = (f"Melody & chanting: {melody}" if lang == "en"
                   else f"Распев: {melody}")
    learn = "Learn to chant it ▶" if lang == "en" else "Научись петь ▶"

    lines = [
        f"{title} · {meter}",
        "",
        s1,
        s2,
        "",
        text,
        attrib,
        "",
        melody_line,
        f"{learn} {cta}",
        "",
        hashtags_for(verse),
    ]
    return "\n".join(lines)


def write_kit(verse, base_url, campaign, out_root):
    vid = verse["id"]
    out_dir = os.path.join(out_root, campaign, vid)
    os.makedirs(out_dir, exist_ok=True)

    gates = publish_gates(verse)
    ready = not gates

    captions = {}
    for lang in ("en", "ru"):
        if lang not in (verse.get("translation") or {}):
            continue
        cap = build_caption(verse, lang, base_url, campaign)
        clean = os.path.join(out_dir, f"caption_{lang}.txt")
        blocked = os.path.join(out_dir, f"caption_{lang}.BLOCKED.txt")
        if cap is not None:
            captions[lang] = cap
            with open(clean, "w", encoding="utf-8") as f:
                f.write(cap + "\n")
            if os.path.exists(blocked):
                os.remove(blocked)  # clearance arrived — drop the stale BLOCKED marker
        else:
            _ok, status = lang_cleared(verse, lang)
            with open(blocked, "w", encoding="utf-8") as f:
                f.write(f"{lang.upper()} caption withheld — translation not cleared to publish "
                        f"(rights.status={status or 'missing'}).\n"
                        f"Clear the license/provenance in verses/data/{vid}.json before using this caption.\n")
            if os.path.exists(clean):
                os.remove(clean)  # clearance revoked — drop the now-unauthorized caption

    with open(os.path.join(out_dir, "hashtags.txt"), "w", encoding="utf-8") as f:
        f.write(hashtags_for(verse) + "\n")

    manifest = {
        "verse_id": vid,
        "campaign": campaign,
        "title": verse.get("title", {}),
        "meter": verse.get("meter", ""),
        "ready_to_publish": ready,
        "publish_gates": gates,
        "media": {
            "mp4": f"{vid}.mp4",
            "vtt": f"{vid}.vtt",
            "thumbnail": f"{vid}.png",
        },
        "cta": {p: cta_url(base_url, p, campaign, vid) for p in PLATFORMS},
        "captions": {lang: f"caption_{lang}.txt" for lang in captions},
        "hashtags": hashtags_for(verse),
        "attribution": {
            "melody": (verse.get("author") or {}).get("melody", ""),
            "audio_license": (verse.get("audio") or {}).get("license", ""),
            "en_translation": "K. T. Telang (1882), public domain",
            "ru_translation": "V. S. Sementsov" if lang_cleared(verse, "ru")[0] else "V. S. Sementsov (license pending — withheld)",
        },
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return ready, gates, list(captions.keys())


def main():
    ap = argparse.ArgumentParser(description="Generate per-verse social drop kits.")
    ap.add_argument("verse_ids", nargs="*", help="verse ids (e.g. bhg_2_47); omit with --all")
    ap.add_argument("--all", action="store_true", help="process every verse in verses/data/")
    ap.add_argument("--url", default=DEFAULT_URL, help=f"course CTA landing URL (default {DEFAULT_URL})")
    ap.add_argument("--campaign", default=None, help="UTM campaign slug (default derived per verse, e.g. bhg_2)")
    ap.add_argument("--out", default="drop", help="output root directory (default: drop/)")
    args = ap.parse_args()

    data_dir = os.path.join("verses", "data")
    if args.all or not args.verse_ids:
        files = sorted(glob(os.path.join(data_dir, "*.json")))
    else:
        files = [os.path.join(data_dir, f"{vid}.json") for vid in args.verse_ids]

    if not files:
        print("No verse files to process.")
        sys.exit(1)

    ready_n = 0
    for fp in files:
        if not os.path.exists(fp):
            print(f"✗ {fp}: not found")
            continue
        with open(fp, "r", encoding="utf-8") as f:
            verse = json.load(f)
        campaign = campaign_of(verse["id"], args.campaign)
        ready, gates, caps = write_kit(verse, args.url, campaign, args.out)
        if ready:
            ready_n += 1
            print(f"✓ {verse['id']}: kit written ({'+'.join(caps) or 'no captions'}) → {args.out}/{campaign}/{verse['id']}/")
        else:
            print(f"⧖ {verse['id']}: kit written, NOT ready to publish ({'+'.join(caps) or 'no captions'})")
            for g in gates:
                print(f"    gate: {g}")

    print(f"\n{ready_n}/{len(files)} verse(s) ready to publish; "
          f"{len(files) - ready_n} gated. Kits under {args.out}/")


if __name__ == "__main__":
    main()
