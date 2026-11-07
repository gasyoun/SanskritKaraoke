"""Contract tests for the public student profile page (ROADMAP.md Phase 3).

profile.html must carry the four profile elements — avatar picker, streak,
mastered count, studied-verse list — be wired into the service-worker cache
and the site nav, and ship ru+en strings.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def test_profile_page_has_four_profile_elements():
    html = _read("profile.html")
    assert 'id="avatar-btn"' in html, "avatar element missing"
    assert 'id="avatar-picker"' in html, "avatar picker missing"
    assert 'id="profile-name"' in html, "editable profile name missing"
    assert 'id="streak-count"' in html, "streak element missing"
    assert 'id="stat-mastered"' in html, "mastered-count element missing"
    assert 'id="stat-studied"' in html, "studied-count element missing"
    assert 'id="studied-table"' in html, "studied-verse list missing"
    assert "AVATARS" in html and "🪷" in html, "avatar emoji set missing"
    assert "PROFILE_KEY" in html and "shloka_profile" in html, "profile persistence key missing"


def test_profile_reads_srs_and_verse_data():
    html = _read("profile.html")
    assert "getSrsData()" in html, "profile must read SRS records"
    assert "verses/index.json" in html, "profile must join the verse catalog"
    assert "interval >= 21" in html, "mastery threshold must match progress.html (interval >= 21)"


def test_service_worker_precaches_profile_page():
    sw = _read("sw.js")
    assert re.search(r"'profile\.html'", sw), "profile.html missing from SW ASSETS"
    assert "'profile.html'" in sw.split("HTML_ASSETS")[1].split(";")[0], "profile.html missing from HTML_ASSETS"
    assert "v1.5.5" not in sw, "CACHE_NAME not bumped for the new asset list"


def test_nav_links_to_profile():
    assert 'href="profile.html"' in _read("catalogue.html"), "catalogue nav missing profile link"
    assert 'href="profile.html"' in _read("progress.html"), "progress header missing profile link"


def test_profile_strings_ship_ru_and_en():
    strings = _read("src/scripts/strings.js")
    assert "profileHeading: 'Профиль студента'" in strings, "ru profileHeading missing"
    assert "profileHeading: 'Student Profile'" in strings, "en profileHeading missing"
    assert "profileDefaultName: 'Студент'" in strings
    assert "profileDefaultName: 'Student'" in strings
