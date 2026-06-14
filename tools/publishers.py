"""tools/publishers.py — per-platform publishers for chapter drops.

Each publisher posts one verse's rendered video with its caption + CTA to a social
platform. Credentials come from environment variables.

SAFETY: nothing reaches the network unless `run_publish(..., live=True)` AND the
platform's credentials are present. With `live=False` (the default) or missing creds,
the publisher only reports what it WOULD do — no API call is made. So the scheduler
is safe to run and test without ever posting.

Supported platforms: telegram, vk, facebook, instagram, wordpress.

HTTP uses `requests`, lazy-imported only inside a real post (`pip install requests`);
the module imports fine without it, so the plan / dry-run paths never depend on it.

Inputs come from the post-kit + render outputs:
  - video      : dist/<id>_9x16.mp4   (resolved flexibly)
  - thumbnail  : dist/<id>.png
  - caption    : drop/<campaign>/<id>/caption_<lang>.txt
  - title      : drop/<campaign>/<id>/manifest.json  (title.<lang>)
"""
import os
import glob
import json
import time

PLATFORMS = ["telegram", "vk", "facebook", "instagram", "wordpress"]

# Environment variables each platform needs to be "configured".
CREDS = {
    "telegram":  ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID"],
    "vk":        ["VK_ACCESS_TOKEN", "VK_OWNER_ID"],
    "facebook":  ["FB_PAGE_ID", "FB_PAGE_ACCESS_TOKEN"],
    "instagram": ["IG_BUSINESS_ACCOUNT_ID", "IG_ACCESS_TOKEN"],   # + a public video URL (see below)
    "wordpress": ["WP_BASE_URL", "WP_USER", "WP_APP_PASSWORD"],
}

# Telegram caption hard limit; others are generous.
CAPTION_LIMIT = {"telegram": 1024}
FB_API = "https://graph.facebook.com/v19.0"
VK_V = "5.199"


def creds_present(platform):
    return all(os.environ.get(v) for v in CREDS.get(platform, []))


def missing_creds(platform):
    return [v for v in CREDS.get(platform, []) if not os.environ.get(v)]


def _requests():
    try:
        import requests
        return requests
    except ImportError:  # pragma: no cover
        raise RuntimeError("live posting needs the `requests` package — pip install requests")


# ── input resolution ────────────────────────────────────────────────────────────
def resolve_video(verse_id, dist_dir):
    for name in (f"{verse_id}_9x16.mp4", f"{verse_id}_1x1.mp4", f"{verse_id}.mp4"):
        p = os.path.join(dist_dir, name)
        if os.path.exists(p):
            return p
    hits = sorted(glob.glob(os.path.join(dist_dir, f"{verse_id}*.mp4")))
    return hits[0] if hits else None


def resolve_thumb(verse_id, dist_dir):
    p = os.path.join(dist_dir, f"{verse_id}.png")
    return p if os.path.exists(p) else None


def _drop_dir(entry, ctx):
    return os.path.join(ctx["drop_dir"], entry["campaign"], entry["verse_id"])


def read_caption(entry, ctx):
    """Return (text, lang) preferring ctx['lang'], else any available caption."""
    d = _drop_dir(entry, ctx)
    for lang in (ctx.get("lang", "ru"), "ru", "en"):
        p = os.path.join(d, f"caption_{lang}.txt")
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return f.read().strip(), lang
    return "", None


def read_title(entry, ctx, lang):
    p = os.path.join(_drop_dir(entry, ctx), "manifest.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            m = json.load(f)
        t = m.get("title", {})
        return t.get(lang) or t.get("ru") or t.get("en") or entry["verse_id"]
    return entry["verse_id"]


def _clip(text, platform):
    lim = CAPTION_LIMIT.get(platform)
    return text[:lim] if lim and len(text) > lim else text


# ── per-platform publishers (only reached on a real, credentialed --live post) ───
def publish_telegram(entry, ctx):
    requests = _requests()
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat = os.environ["TELEGRAM_CHANNEL_ID"]
    video = resolve_video(entry["verse_id"], ctx["dist_dir"])
    if not video:
        return {"status": "error", "detail": "no rendered MP4 in dist/"}
    caption, _ = read_caption(entry, ctx)
    with open(video, "rb") as vf:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendVideo",
            data={"chat_id": chat, "caption": _clip(caption, "telegram"),
                  "parse_mode": "HTML", "supports_streaming": True},
            files={"video": vf}, timeout=600)
    ok = r.ok and r.json().get("ok")
    return {"status": "posted" if ok else "error", "detail": r.text[:300]}


def publish_vk(entry, ctx):
    requests = _requests()
    token = os.environ["VK_ACCESS_TOKEN"]
    owner = int(os.environ["VK_OWNER_ID"])           # community wall id, negative
    gid = abs(owner)
    video = resolve_video(entry["verse_id"], ctx["dist_dir"])
    if not video:
        return {"status": "error", "detail": "no rendered MP4 in dist/"}
    caption, _ = read_caption(entry, ctx)
    save = requests.get("https://api.vk.com/method/video.save",
                        params={"access_token": token, "v": VK_V, "group_id": gid,
                                "name": entry["verse_id"], "description": _clip(caption, "vk"),
                                "wallpost": 0}, timeout=60).json()
    if "error" in save:
        return {"status": "error", "detail": json.dumps(save["error"])[:300]}
    resp = save["response"]
    with open(video, "rb") as vf:
        done = requests.post(resp["upload_url"], files={"video_file": vf}, timeout=900).json()
    owner_id = resp["owner_id"]                      # owner_id comes from video.save, NOT the upload
    vid = done.get("video_id") or resp["video_id"]
    att = f"video{owner_id}_{vid}"
    if resp.get("access_key"):
        att += f"_{resp['access_key']}"
    post = requests.get("https://api.vk.com/method/wall.post",
                        params={"access_token": token, "v": VK_V, "owner_id": owner,
                                "from_group": 1, "message": caption, "attachments": att},
                        timeout=60).json()
    ok = "response" in post
    return {"status": "posted" if ok else "error", "detail": json.dumps(post)[:300]}


def publish_facebook(entry, ctx):
    requests = _requests()
    page = os.environ["FB_PAGE_ID"]
    token = os.environ["FB_PAGE_ACCESS_TOKEN"]
    video = resolve_video(entry["verse_id"], ctx["dist_dir"])
    if not video:
        return {"status": "error", "detail": "no rendered MP4 in dist/"}
    caption, _ = read_caption(entry, ctx)
    with open(video, "rb") as vf:
        r = requests.post(f"{FB_API}/{page}/videos",
                          data={"description": caption, "access_token": token},
                          files={"source": vf}, timeout=900)
    ok = r.ok and "id" in r.json()
    return {"status": "posted" if ok else "error", "detail": r.text[:300]}


def publish_instagram(entry, ctx):
    requests = _requests()
    ig = os.environ["IG_BUSINESS_ACCOUNT_ID"]
    token = os.environ["IG_ACCESS_TOKEN"]
    # Instagram cannot take a local file — it needs a PUBLIC video URL.
    base = os.environ.get("IG_VIDEO_BASE_URL", "").rstrip("/")
    video_name = os.path.basename(resolve_video(entry["verse_id"], ctx["dist_dir"]) or f"{entry['verse_id']}.mp4")
    video_url = entry.get("media_url") or (f"{base}/{video_name}" if base else "")
    if not video_url:
        return {"status": "error",
                "detail": "Instagram needs a public video URL — host the MP4 and set IG_VIDEO_BASE_URL"}
    caption, _ = read_caption(entry, ctx)
    cont = requests.post(f"{FB_API}/{ig}/media",
                         data={"media_type": "REELS", "video_url": video_url,
                               "caption": caption, "access_token": token}, timeout=120).json()
    cid = cont.get("id")
    if not cid:
        return {"status": "error", "detail": json.dumps(cont)[:300]}
    # REELS containers process asynchronously — wait for FINISHED before publishing.
    status = ""
    for _ in range(30):  # up to ~5 min
        st = requests.get(f"{FB_API}/{cid}",
                          params={"fields": "status_code", "access_token": token}, timeout=60).json()
        status = st.get("status_code", "")
        if status in ("FINISHED", "ERROR"):
            break
        time.sleep(10)
    if status != "FINISHED":
        return {"status": "pending",
                "detail": f"container {cid} not ready (status={status or 'unknown'}); retry media_publish later"}
    pub = requests.post(f"{FB_API}/{ig}/media_publish",
                        data={"creation_id": cid, "access_token": token}, timeout=120).json()
    ok = "id" in pub
    return {"status": "posted" if ok else "error",
            "detail": ("published " + pub["id"]) if ok else json.dumps(pub)[:200]}


def publish_wordpress(entry, ctx):
    requests = _requests()
    base = os.environ["WP_BASE_URL"].rstrip("/")
    auth = (os.environ["WP_USER"], os.environ["WP_APP_PASSWORD"])
    video = resolve_video(entry["verse_id"], ctx["dist_dir"])
    if not video:
        return {"status": "error", "detail": "no rendered MP4 in dist/"}
    caption, lang = read_caption(entry, ctx)
    title = read_title(entry, ctx, lang or "ru")
    fname = os.path.basename(video)
    with open(video, "rb") as vf:
        media = requests.post(f"{base}/wp-json/wp/v2/media", auth=auth,
                              headers={"Content-Disposition": f'attachment; filename="{fname}"',
                                       "Content-Type": "video/mp4"},
                              data=vf, timeout=900).json()
    src = media.get("source_url")
    if not src:
        return {"status": "error", "detail": json.dumps(media)[:300]}
    body = f'<!-- wp:video --><figure class="wp-block-video"><video controls src="{src}"></video></figure><!-- /wp:video -->\n' \
           f'<p>{caption.replace(chr(10), "<br>")}</p>'
    post = requests.post(f"{base}/wp-json/wp/v2/posts", auth=auth,
                         json={"title": title, "content": body, "status": "draft"}, timeout=120).json()
    ok = "id" in post
    return {"status": "posted" if ok else "error",
            "detail": (f"draft post {post['id']} ({post.get('link', '')})") if ok else json.dumps(post)[:300]}


PUBLISHERS = {
    "telegram":  publish_telegram,
    "vk":        publish_vk,
    "facebook":  publish_facebook,
    "instagram": publish_instagram,
    "wordpress": publish_wordpress,
}


def run_publish(entry, ctx, live):
    """Dispatch one plan entry to its platform publisher.

    Returns {status, detail}. status ∈ {skip, dry-run, posted, pending, error}.
    Makes a network call ONLY when live=True and the platform's creds are present.
    """
    platform = entry.get("platform")
    fn = PUBLISHERS.get(platform)
    if fn is None:
        return {"status": "skip", "detail": f"no publisher for '{platform}'"}
    if not creds_present(platform):
        return {"status": "skip", "detail": "no credentials — set " + ", ".join(missing_creds(platform))}
    if not live:
        return {"status": "dry-run", "detail": f"would post to {platform} (creds present)"}
    try:
        return fn(entry, ctx)
    except Exception as e:  # network/parse/file errors never crash the run
        return {"status": "error", "detail": f"{type(e).__name__}: {str(e)[:280]}"}
