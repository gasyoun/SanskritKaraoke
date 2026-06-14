"""schedule_drops.py — compute a posting timeline for a chapter drop (Phase 3).

Reads a cadence config (schedule.yaml) + the post-kit drop/<campaign>/<id>/
manifests, and computes WHEN each verse posts to EACH platform — the queue a
live publisher would execute. This build is plan-only (dry-run); live posting
is a credential-gated stub that does nothing until per-platform API publishers
are implemented (Telegram is trivial via Bot API; IG/TikTok/YouTube need app
review). Nothing here makes an outward request.

    schedule.yaml + drop/<campaign>/*/manifest.json  →  posting plan
                                                     →  drop/schedule_plan.json

Usage:
    python tools/schedule_drops.py [--config schedule.yaml] [--drop drop]
                                   [--campaign bhg_2] [--include-gated]
                                   [--out drop/schedule_plan.json]
    # --live is intentionally unimplemented: every platform publisher is a stub.
"""
import sys
import os
import json
import argparse
import datetime as dt
from glob import glob

import yaml

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KNOWN_PLATFORMS = {"telegram", "instagram", "youtube", "tiktok"}


def load_config(path):
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    cfg.setdefault("per_day", 1)
    cfg.setdefault("slots", ["09:00"])
    cfg.setdefault("platforms", ["telegram"])
    cfg.setdefault("stagger_minutes", 20)
    cfg.setdefault("timezone", "")
    cfg.setdefault("only_ready", True)
    if cfg["per_day"] > len(cfg["slots"]):
        raise SystemExit(f"config error: per_day={cfg['per_day']} but only {len(cfg['slots'])} slot(s) given")
    unknown = [p for p in cfg["platforms"] if p not in KNOWN_PLATFORMS]
    if unknown:
        print(f"  ⚠ unknown platform(s) in config (no publisher will exist): {', '.join(unknown)}")
    return cfg


def parse_start(value):
    """Accept a date or a 'YYYY-MM-DD HH:MM' datetime; return a date (day 0)."""
    s = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise SystemExit(f"config error: cannot parse start={value!r} (use YYYY-MM-DD)")


def load_manifests(drop_dir, campaign):
    pattern = os.path.join(drop_dir, campaign or "*", "*", "manifest.json")
    manifests = []
    for mf in sorted(glob(pattern)):
        try:
            with open(mf, encoding="utf-8") as f:
                manifests.append(json.load(f))
        except Exception as e:
            print(f"  ⚠ skip {mf}: {e}")
    manifests.sort(key=lambda m: m.get("verse_id", ""))
    return manifests


def build_plan(cfg, manifests, include_gated):
    start_day = parse_start(cfg.get("start", ""))
    slots = cfg["slots"]
    per_day = cfg["per_day"]
    platforms = cfg["platforms"]
    stagger = int(cfg["stagger_minutes"])
    tz = cfg.get("timezone", "")

    plan, skipped = [], []
    i = 0
    for m in manifests:
        ready = bool(m.get("ready_to_publish"))
        if not ready and not include_gated:
            skipped.append(m)
            continue
        day = i // per_day
        slot = slots[i % per_day]
        hh, mm = (int(x) for x in slot.split(":"))
        base = dt.datetime.combine(start_day + dt.timedelta(days=day), dt.time(hh, mm))
        for j, platform in enumerate(platforms):
            when = base + dt.timedelta(minutes=j * stagger)
            cta = (m.get("cta") or {}).get(platform, "")
            plan.append({
                "when": when.strftime("%Y-%m-%d %H:%M"),
                "timezone": tz,
                "verse_id": m.get("verse_id"),
                "platform": platform,
                "ready": ready,
                "cta": cta,
                "captions": m.get("captions", {}),
                "media": m.get("media", {}),
            })
        i += 1
    plan.sort(key=lambda e: (e["when"], e["platform"]))
    return plan, skipped


def stub_publisher(entry):
    raise NotImplementedError(
        f"live posting to {entry['platform']} is not implemented "
        "(needs API credentials/app review; this build is plan-only)")


def main():
    ap = argparse.ArgumentParser(description="Compute the posting plan for a chapter drop (plan-only).")
    ap.add_argument("--config", default="schedule.yaml")
    ap.add_argument("--drop", default="drop")
    ap.add_argument("--campaign", default=None)
    ap.add_argument("--include-gated", action="store_true",
                    help="include verses whose manifest is not ready_to_publish")
    ap.add_argument("--out", default=os.path.join("drop", "schedule_plan.json"))
    ap.add_argument("--live", action="store_true",
                    help="(unimplemented) execute publishers; every platform is a stub")
    args = ap.parse_args()

    cfg_path = args.config if os.path.isabs(args.config) else os.path.join(REPO_ROOT, args.config)
    if not os.path.exists(cfg_path):
        raise SystemExit(f"config not found: {args.config} (copy schedule.example.yaml → schedule.yaml)")
    cfg = load_config(cfg_path)

    drop_dir = args.drop if os.path.isabs(args.drop) else os.path.join(REPO_ROOT, args.drop)
    manifests = load_manifests(drop_dir, args.campaign or cfg.get("campaign"))
    if not manifests:
        raise SystemExit(f"no drop manifests under {drop_dir} — run tools/post_kit.py first")

    plan, skipped = build_plan(cfg, manifests, args.include_gated)

    print(f"config    : {args.config}  (per_day={cfg['per_day']}, "
          f"platforms={','.join(cfg['platforms'])}, stagger={cfg['stagger_minutes']}m, tz={cfg.get('timezone') or '—'})")
    print(f"manifests : {len(manifests)} found; {len(skipped)} skipped as not-ready"
          f"{' (use --include-gated to show)' if skipped and not args.include_gated else ''}")
    print(f"plan      : {len(plan)} scheduled post(s)\n")
    if plan:
        print(f"{'when':<17} {'tz':<14} {'verse':<10} {'platform':<10} ready")
        for e in plan:
            print(f"{e['when']:<17} {(e['timezone'] or '—'):<14} {e['verse_id']:<10} {e['platform']:<10} {'✓' if e['ready'] else 'gated'}")

    out_path = args.out if os.path.isabs(args.out) else os.path.join(REPO_ROOT, args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    print(f"\nWrote plan → {os.path.relpath(out_path, REPO_ROOT)}")

    if args.live:
        print("\n--live: dispatching to publishers …")
        for e in plan:
            if not e["ready"]:
                continue
            stub_publisher(e)  # raises until per-platform API publishers exist


if __name__ == "__main__":
    main()
