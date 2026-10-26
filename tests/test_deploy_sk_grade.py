"""Canary for deploy/deploy_sk_grade.sh (H6501).

The deploy script is the H6398 lever-2 repair: one command instead of the
8 hand-typed shell commands of the H6317 record, with a healthz gate and an
automatic rollback to the previous revision. The script talks to git, systemctl
and curl, so the tests drive it against a throwaway git origin plus stub
`systemctl` / `curl` binaries — no prod, no network.

Three properties are pinned:

1. happy path — a new revision is checked out, the unit from the repo is
   installed, the service is restarted and the healthz gate passes;
2. rollback path — a revision that breaks the service is rolled back to the
   previous one, the service is restarted again and the script exits non-zero
   (3 = rolled back and healthy again);
3. the back-ported unit truth — the committed deploy/sk-grade.service says
   SK_GRADE_WHISPER=1, which is what prod runs (H6398 row R-2).
"""
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "deploy" / "deploy_sk_grade.sh"
UNIT = REPO_ROOT / "deploy" / "sk-grade.service"

STUB_SYSTEMCTL = """#!/bin/bash
# stub systemctl: records the calls; a checked-out `.stub_fail_healthz`
# marker (only present in the deliberately broken revision) makes the
# "service" unhealthy after a restart.
echo "$*" >> "$STUB_CALLS"
if [ "$1" = "restart" ]; then
  if [ -f "$SK_GRADE_REPO_DIR/.stub_fail_healthz" ]; then
    echo fail > "$STUB_HEALTHZ_MODE"
  else
    echo ok > "$STUB_HEALTHZ_MODE"
  fi
fi
exit 0
"""

STUB_CURL = """#!/bin/bash
# stub curl: understands the `-o <file>` / `-w '%{http_code}'` contract the
# deploy script uses; the status code follows the stub healthz mode file.
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
mode="$(cat "$STUB_HEALTHZ_MODE" 2>/dev/null || echo ok)"
code=200
[ "$mode" = "fail" ] && code=500
if [ -n "$out" ]; then
  if [ "$code" = "200" ]; then
    printf '{"ok": true, "service": "sk-grade"}' > "$out"
  else
    printf 'nope' > "$out"
  fi
fi
printf '%s' "$code"
exit 0
"""


def _run(cmd, cwd, env=None):
    return subprocess.run(
        cmd, cwd=str(cwd), env=env, capture_output=True, text=True, check=False
    )


def _git(repo, *args):
    return _run(["git", *args], repo)


def _write(path: Path, text: str, mode: int = 0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(mode)


def _make_origin(tmp_path: Path, broken: bool) -> Path:
    """Bare origin with a `main` branch; `broken` adds the marker revision."""
    origin = tmp_path / "origin.git"
    seed = tmp_path / "seed"
    seed.mkdir()
    _run(["git", "init", "-q", "-b", "main"], seed)
    _run(["git", "config", "user.email", "h6501@example.invalid"], seed)
    _run(["git", "config", "user.name", "H6501 test"], seed)
    (seed / "deploy").mkdir(exist_ok=True)
    (seed / "deploy" / "sk-grade.service").write_text(
        "[Service]\nEnvironment=SK_GRADE_WHISPER=1\n", encoding="utf-8"
    )
    (seed / "README.md").write_text("base\n", encoding="utf-8")
    _git(seed, "add", "-A")
    _git(seed, "commit", "-qm", "base")
    # the revision the box currently runs: `deployed`
    _git(seed, "branch", "deployed")
    (seed / "good.txt").write_text("good revision\n", encoding="utf-8")
    _git(seed, "add", "-A")
    _git(seed, "commit", "-qm", "good revision")
    if broken:
        (seed / ".stub_fail_healthz").write_text("boom\n", encoding="utf-8")
        _git(seed, "add", "-A")
        _git(seed, "commit", "-qm", "broken revision")
    _run(["git", "clone", "-q", "--bare", str(seed), str(origin)], tmp_path)
    _run(["git", "symbolic-ref", "HEAD", "refs/heads/main"], origin)
    return origin


def _make_prod_clone(tmp_path: Path, origin: Path) -> Path:
    """Shallow prod clone (the H6317 record created it with --depth 1),
    sitting on the `deployed` revision while origin/main is ahead."""
    prod = tmp_path / "prod"
    _run(
        [
            "git",
            "clone",
            "-q",
            "--depth",
            "1",
            "--branch",
            "deployed",
            f"file://{origin}",
            str(prod),
        ],
        tmp_path,
    )
    # `--branch deployed` narrows the clone refspec to that branch; the prod
    # clone fetches every branch, so restore the full refspec
    _run(
        [
            "git",
            "config",
            "remote.origin.fetch",
            "+refs/heads/*:refs/remotes/origin/*",
        ],
        prod,
    )
    return prod


def _env(tmp_path: Path, prod: Path) -> dict:
    stubs = tmp_path / "bin"
    stubs.mkdir(exist_ok=True)
    _write(stubs / "systemctl", STUB_SYSTEMCTL, 0o755)
    _write(stubs / "curl", STUB_CURL, 0o755)
    env = dict(os.environ)
    env.update(
        {
            "SK_GRADE_REPO_DIR": str(prod),
            "SK_GRADE_SYSTEMCTL": str(stubs / "systemctl"),
            "SK_GRADE_CURL": str(stubs / "curl"),
            "SK_GRADE_HEALTHZ_URL": "http://127.0.0.1:8791/healthz",
            "SK_GRADE_HEALTHZ_PUBLIC_URL": "",
            "SK_GRADE_HEALTHZ_RETRIES": "2",
            "SK_GRADE_HEALTHZ_DELAY": "0",
            "SK_GRADE_UNIT_PATH": str(tmp_path / "sk-grade.service"),
            "SK_GRADE_DEPLOY_LOG": str(tmp_path / "deploy.log"),
            "SK_GRADE_ALLOW_NONROOT": "1",
            "STUB_CALLS": str(tmp_path / "systemctl.calls"),
            "STUB_HEALTHZ_MODE": str(tmp_path / "healthz.mode"),
        }
    )
    return env


def _rev(repo: Path) -> str:
    return _run(["git", "rev-parse", "HEAD"], repo).stdout.strip()


def test_committed_unit_carries_the_live_whisper_truth():
    """H6398 row R-2: prod runs SK_GRADE_WHISPER=1, the repo must say so too."""
    text = UNIT.read_text(encoding="utf-8")
    assert "Environment=SK_GRADE_WHISPER=1" in text
    assert "Environment=SK_GRADE_WHISPER=0" not in text


def test_deploy_script_is_executable():
    assert SCRIPT.exists()
    assert SCRIPT.stat().st_mode & stat.S_IXUSR


def test_deploy_checks_out_new_revision_and_passes_the_healthz_gate(tmp_path):
    origin = _make_origin(tmp_path, broken=False)
    prod = _make_prod_clone(tmp_path, origin)
    env = _env(tmp_path, prod)
    before = _rev(prod)

    res = _run(["bash", str(SCRIPT)], prod, env=env)

    assert res.returncode == 0, res.stdout + res.stderr
    after = _rev(prod)
    assert after != before
    # the new tip of origin/main is checked out
    tip = _run(["git", "rev-parse", "origin/main"], prod).stdout.strip()
    assert after == tip
    # the healthz gate was really probed
    assert "healthz" in res.stdout
    # the unit from the repo was installed over the live unit path
    installed = (tmp_path / "sk-grade.service").read_text(encoding="utf-8")
    assert "SK_GRADE_WHISPER=1" in installed
    # the service was restarted
    calls = (tmp_path / "systemctl.calls").read_text(encoding="utf-8")
    assert "restart sk-grade" in calls


def test_deploy_rolls_back_when_the_healthz_gate_fails(tmp_path):
    origin = _make_origin(tmp_path, broken=True)
    prod = _make_prod_clone(tmp_path, origin)
    env = _env(tmp_path, prod)
    before = _rev(prod)

    res = _run(["bash", str(SCRIPT)], prod, env=env)

    # 3 = deploy failed, rollback restored a healthy service
    assert res.returncode == 3, res.stdout + res.stderr
    assert _rev(prod) == before
    assert "ROLLBACK OK" in res.stdout
    calls = (tmp_path / "systemctl.calls").read_text(encoding="utf-8")
    assert calls.count("restart sk-grade") >= 2


def test_deploy_refuses_a_dirty_prod_clone(tmp_path):
    origin = _make_origin(tmp_path, broken=False)
    prod = _make_prod_clone(tmp_path, origin)
    env = _env(tmp_path, prod)
    (prod / "stray.txt").write_text("local edit\n", encoding="utf-8")

    res = _run(["bash", str(SCRIPT)], prod, env=env)

    assert res.returncode == 1
    assert "dirty" in (res.stdout + res.stderr)


def test_dry_run_changes_nothing(tmp_path):
    origin = _make_origin(tmp_path, broken=False)
    prod = _make_prod_clone(tmp_path, origin)
    env = _env(tmp_path, prod)
    env["SK_GRADE_DRY_RUN"] = "1"
    before = _rev(prod)

    res = _run(["bash", str(SCRIPT), "--dry-run"], prod, env=env)

    assert res.returncode == 0, res.stdout + res.stderr
    assert _rev(prod) == before
    assert "DRY-RUN plan" in res.stdout


def test_live_unit_is_replaced_and_the_old_one_is_kept_as_a_backup(tmp_path):
    """Config-as-code: the repo unit lands on the box, the live one is kept."""
    origin = _make_origin(tmp_path, broken=False)
    prod = _make_prod_clone(tmp_path, origin)
    env = _env(tmp_path, prod)
    unit_path = tmp_path / "sk-grade.service"
    unit_path.write_text("[Service]\nEnvironment=SK_GRADE_WHISPER=0\n", encoding="utf-8")

    res = _run(["bash", str(SCRIPT)], prod, env=env)

    assert res.returncode == 0, res.stdout + res.stderr
    assert "SK_GRADE_WHISPER=1" in unit_path.read_text(encoding="utf-8")
    backups = list(tmp_path.glob("sk-grade.service.bak-*"))
    assert len(backups) == 1
    assert "SK_GRADE_WHISPER=0" in backups[0].read_text(encoding="utf-8")


def test_rollback_restores_the_previous_unit(tmp_path):
    origin = _make_origin(tmp_path, broken=True)
    prod = _make_prod_clone(tmp_path, origin)
    env = _env(tmp_path, prod)
    unit_path = tmp_path / "sk-grade.service"
    unit_path.write_text("[Service]\nEnvironment=SK_GRADE_WHISPER=0\n", encoding="utf-8")

    res = _run(["bash", str(SCRIPT)], prod, env=env)

    assert res.returncode == 3, res.stdout + res.stderr
    assert "SK_GRADE_WHISPER=0" in unit_path.read_text(encoding="utf-8")


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash is required")
def test_script_is_syntactically_valid():
    res = _run(["bash", "-n", str(SCRIPT)], REPO_ROOT)
    assert res.returncode == 0, res.stderr
