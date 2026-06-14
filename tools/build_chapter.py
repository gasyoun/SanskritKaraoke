"""build_chapter.py — one-command chapter batch pipeline.

Audio arrives as a single batch recording session, so this chains the whole
drop in one command:

    audio_dir/  →  align_chapter.py --write  (auto-timing into verse JSON)
                →  render_chapter.js          (feed_v1 MP4 + .srt/.vtt → dist/)
                →  post_kit.py                (captions + UTM CTAs → drop/)

then prints a readiness summary (which verses aligned, rendered, and are
cleared to publish vs. gated).

This is the Phase 1/2 glue behind the roadmap's "one chapter, raw audio to
scheduled posts, in one working day" criterion.

Usage:
    python tools/build_chapter.py <audio_dir> [options]

Options:
    --verses <dir>    verse JSON directory        (default: verses/data)
    --dist <dir>      rendered MP4/VTT output      (default: dist)
    --drop <dir>      post-kit output             (default: drop)
    --url <url>       course CTA landing URL       (default: https://samskrtam.ru/usha-sanka)
    --only <ids>      comma-separated verse IDs to process
    --format <fmt>    9:16 | 1:1                   (default: 9:16)
    --fps <n>         frames per second            (default: 30)
    --no-write        align to sidecar JSONs instead of writing verse JSON
                      (NOTE: render reads verse.timing, so --no-write skips render)
    --skip-align      reuse existing verse.timing; don't re-align
    --skip-render     don't render MP4s (e.g. captions/post-kit only)
    --skip-postkit    don't generate the drop kit
    --dry-run         print the matched verses + the exact commands, run nothing

Dependencies: align/post-kit are pure Python; render needs Node + puppeteer
(`npm install --prefix tools`).
"""
import sys
import os
import json
import argparse
import shutil
import subprocess
from glob import glob

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus", ".aac"}
DEFAULT_URL = "https://samskrtam.ru/usha-sanka"


def discover(audio_dir, verses_dir, only):
    """Match audio file stems to verse JSONs. Returns (matched, no_audio, orphan_audio)."""
    verse_ids = set()
    for fp in glob(os.path.join(verses_dir, "*.json")):
        verse_ids.add(os.path.splitext(os.path.basename(fp))[0])

    audio_by_stem = {}
    if os.path.isdir(audio_dir):
        for fname in os.listdir(audio_dir):
            stem, ext = os.path.splitext(fname)
            if ext.lower() in AUDIO_EXTS:
                audio_by_stem[stem] = fname

    if only:
        verse_ids = {v for v in verse_ids if v in only}

    matched = {vid: audio_by_stem[vid] for vid in sorted(verse_ids) if vid in audio_by_stem}
    no_audio = sorted(vid for vid in verse_ids if vid not in audio_by_stem)
    orphan_audio = sorted(stem for stem in audio_by_stem if stem not in verse_ids and (not only or stem in only))
    return matched, no_audio, orphan_audio


def run(cmd, dry_run):
    printable = " ".join(cmd)
    if dry_run:
        print(f"    $ {printable}")
        return 0
    print(f"  $ {printable}")
    proc = subprocess.run(cmd, cwd=REPO_ROOT, encoding="utf-8")
    return proc.returncode


def readiness_summary(drop_dir, campaign_ids):
    """Read post-kit manifests to report ready vs. gated."""
    ready, gated = [], []
    for mf in glob(os.path.join(drop_dir, "*", "*", "manifest.json")):
        try:
            with open(mf, encoding="utf-8") as f:
                m = json.load(f)
        except Exception:
            continue
        (ready if m.get("ready_to_publish") else gated).append(m)
    if ready or gated:
        print(f"\nReadiness: {len(ready)} ready to publish, {len(gated)} gated.")
        for m in gated:
            print(f"  ⧖ {m['verse_id']}: " + "; ".join(m.get("publish_gates", [])))


def main():
    ap = argparse.ArgumentParser(description="One-command chapter batch pipeline (align → render → post-kit).")
    ap.add_argument("audio_dir", help="directory of the batch recording session's audio files")
    ap.add_argument("--verses", default=os.path.join("verses", "data"))
    ap.add_argument("--dist", default="dist")
    ap.add_argument("--drop", default="drop")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--only", default="")
    ap.add_argument("--format", default="9:16")
    ap.add_argument("--fps", default="30")
    ap.add_argument("--no-write", action="store_true",
                    help="align to sidecars instead of verse JSON (skips render)")
    ap.add_argument("--skip-align", action="store_true")
    ap.add_argument("--skip-render", action="store_true")
    ap.add_argument("--skip-postkit", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    only = set(x.strip() for x in args.only.split(",") if x.strip())
    audio_dir = os.path.abspath(args.audio_dir)

    matched, no_audio, orphan = discover(audio_dir, os.path.join(REPO_ROOT, args.verses), only)

    print(f"audio_dir : {audio_dir}" + ("" if os.path.isdir(audio_dir) else "   ⚠ NOT FOUND"))
    print(f"verses    : {args.verses}")
    print(f"matched   : {len(matched)} verse(s) with audio" +
          (": " + ", ".join(matched) if matched else ""))
    if no_audio:
        print(f"no audio  : {len(no_audio)} verse(s) will be skipped: {', '.join(no_audio)}")
    if orphan:
        print(f"orphan    : {len(orphan)} audio file(s) with no verse JSON: {', '.join(orphan)}")

    if not matched and not args.dry_run:
        print("\nNothing to do — no audio matched any verse. (Drop recordings named <verse_id>.<ext> into audio_dir.)")
        sys.exit(0)

    only_arg = ",".join(matched) if matched else (args.only or "")
    py = sys.executable

    align_cmd = [py, os.path.join("tools", "align_chapter.py"), audio_dir,
                 "--verses", args.verses]
    if only_arg:
        align_cmd += ["--only", only_arg]
    if not args.no_write:
        align_cmd.append("--write")

    render_cmd = ["node", os.path.join("tools", "render_chapter.js"), audio_dir,
                  "--verses", args.verses, "--out", args.dist,
                  "--format", args.format, "--fps", str(args.fps)]
    if only_arg:
        render_cmd += ["--only", only_arg]

    postkit_cmd = [py, os.path.join("tools", "post_kit.py")]
    postkit_cmd += (list(matched) if matched else ["--all"])
    postkit_cmd += ["--url", args.url, "--out", args.drop]

    if args.dry_run:
        print("\n[dry-run] would run, in order:")
        if not args.skip_align:
            print("  1. align:")
            run(align_cmd, True)
        if not args.skip_render and not args.no_write:
            print("  2. render:")
            run(render_cmd, True)
        elif args.no_write:
            print("  2. render: SKIPPED (--no-write → timing not in verse JSON, render has nothing to read)")
        if not args.skip_postkit:
            print("  3. post-kit:")
            run(postkit_cmd, True)
        print("\n[dry-run] nothing executed.")
        return

    # Pre-flight: render needs node + puppeteer
    if not args.skip_render and not args.no_write:
        if shutil.which("node") is None:
            print("  ⚠ node not on PATH — render step will fail. Install Node, or use --skip-render.")
        elif not os.path.isdir(os.path.join(REPO_ROOT, "tools", "node_modules")):
            print("  ⚠ tools/node_modules missing — run `npm install --prefix tools` or use --skip-render.")

    codes = {}
    if not args.skip_align:
        print("\n[1/3] align")
        codes["align"] = run(align_cmd, False)  # nonzero = some fallback; outputs still written
    if not args.skip_render and not args.no_write:
        print("\n[2/3] render")
        codes["render"] = run(render_cmd, False)
    if not args.skip_postkit:
        print("\n[3/3] post-kit")
        codes["postkit"] = run(postkit_cmd, False)

    readiness_summary(os.path.join(REPO_ROOT, args.drop), matched)

    nonzero = {k: v for k, v in codes.items() if v not in (0, None)}
    if nonzero:
        print("\nFinished with warnings: " +
              ", ".join(f"{k} exit {v}" for k, v in nonzero.items()) +
              " (partial outputs may still be usable; check the log above).")
        sys.exit(1)
    print("\nChapter build complete.")


if __name__ == "__main__":
    main()
