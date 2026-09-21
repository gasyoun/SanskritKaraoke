_Created: 21-09-2026 · Last updated: 21-09-2026_

# Incident: Google Cloud service-account key inside `my-old-tools/shloka-wave.zip`

Found on 21-09-2026. Fixed at the tip the same day by PR [#147](https://github.com/gasyoun/SanskritKaraoke/pull/147). Revoking the key and deciding whether to rewrite history are still open (see Status). Written by Claude Code Opus 5 (`claude-opus-5`).

The key's contents were never extracted, printed or used at any point in this work. Every check below reads archive entry *names*, never file contents.

## What leaked

1. **File:** [`my-old-tools/shloka-wave.zip`](https://github.com/gasyoun/SanskritKaraoke/blob/main/my-old-tools/shloka-wave.zip), a 31 MB archive of the old shloka-wave tool.
2. **Entry:** `Service Acc Key/sanskrit-wave-211c6a6e6a07.json`. The name follows Google Cloud's service-account key-file pattern (`<project>-<key id>.json`), so the project is probably `sanskrit-wave` and the key id starts with `211c6a6e6a07`.
3. **First committed:** 81a57e4, 22-06-2026, "v1.4.5 - Pada devider Optionally".
4. **Exposure window:** public from 22-06-2026 until the key is revoked. Removing it from the tip does not end the exposure.
5. **Leaky blob:** `915025420245220a02cb4f0ce96640b5cc371cac`. **Clean blob now on main:** `a88be38b6ab60a674fbf18773e84e6f55f2ce9fb`.

## Why GitHub didn't flag it

GitHub secret scanning does not look inside zip archives. The repo's two scanning alerts are about other keys. Alert #2 is the Firebase web config key (closed as won't-fix: public by design). Alert #1 has been open since 17-04-2026 and covers a different Google API key. That is a separate issue with its own triage, and it is not covered here.

## Status

1. [x] **Removed from the tip:** PR [#147](https://github.com/gasyoun/SanskritKaraoke/pull/147) merged 21-09-2026 as a069edf. The archive was rebuilt with `zip -d`: 288 entries became 286, and the other 286 are identical by name, CRC-32 and size.
2. [ ] **Revoked in Google Cloud.** Needs the Google Cloud project owner, who is the archive's author, to log in. An agent cannot do this.
3. [ ] **History rewrite: decision pending.** This is destructive, so it waits for an explicit human yes. The plan and blast radius are below.

## Human step: revoke the key (~5 minutes)

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts and choose the project `sanskrit-wave`.
2. Open each service account, go to the **Keys** tab, find the key whose id starts with `211c6a6e6a07`, and click the bin icon to delete it.
3. If something still uses this service account, create a new key there (**Add key → Create new key → JSON**). Keep it out of every git repo.
4. Optional: check **Logging → Logs Explorer** for calls made by this service account since 22-06-2026.

- **If this is done:** the key in history becomes worthless. Anyone holding a copy gets `invalid_grant`.
- **If it is not done:** anyone who downloaded the repo or any tag from v1.4.6 to v1.5.11 can act as this service account, with whatever roles it has on `sanskrit-wave`.

## Exposure inventory (all checked 21-09-2026)

1. **Branches and tags still holding the leaky blob:** main history before a069edf, 18 other branches (13 `rescue/SanskritKaraoke-*-win` snapshots, `h2440-usha-rights`, `h2440-usha-rights2`, `h4719-drain`, `h5223-drain`), and 16 tags (v1.4.6 to v1.5.11). The 16 GitHub Releases on those tags have no uploaded assets, but their auto-generated source zips include the archive.
2. **Commits a rewrite would give new SHAs:** 226 across all refs, 187 of them on main.
3. **GitHub PR refs:** 114 of the 136 `refs/pull/*/head` refs contain 81a57e4. Nobody can force-push these. Only GitHub Support can remove them.
4. **Forks:** 0. **Open PRs:** 0. **Collaborators:** 2. **Zenodo archive:** none.
5. **GitHub Pages:** not exposed. The Pages build uploads `_site`, and https://gasyoun.github.io/SanskritKaraoke/my-old-tools/shloka-wave.zip returns 404.
6. **Other credentials in history (file names only):** none found. This zip is the only archive with a credential-like entry. The two `docs/legal/*.docx` files hold only standard Word parts. No `*.pem`, `*.p12`, `*.key`, `.env` (only `.env.example`), or `private_key` / `"type": "service_account"` text was ever committed.

## History rewrite plan (run ONLY after the key is revoked AND a human says yes)

This follows the `/secret-purge` skill and the official [git-filter-repo sensitive-data-removal docs](https://github.com/newren/git-filter-repo/blob/main/Documentation/git-filter-repo.txt).

It swaps the blob rather than deleting a path. Every historical commit ends up with the clean 286-entry archive, so the old-tools archive is kept and the repo does not grow. PR #147 then becomes an empty commit and is pruned.

1. Stop the Windows box's daily 00:30 UTC rescue snapshot (H4357, which pushes `rescue/SanskritKaraoke-<date>-win`) for this repo. Otherwise its next run pushes the old history, and the key with it, back to GitHub.
2. Ask both collaborators not to push until step 8.
3. Install the tool: `brew install git-filter-repo` (2.47.0).
4. Make a fresh clone and pull out the clean archive:
   ```bash
   git clone https://github.com/gasyoun/SanskritKaraoke.git /tmp/sk-purge
   git -C /tmp/sk-purge cat-file blob a88be38b6ab60a674fbf18773e84e6f55f2ce9fb > /tmp/shloka-wave.clean.zip
   ```
5. Rewrite:
   ```bash
   cd /tmp/sk-purge && git filter-repo --sensitive-data-removal --blob-callback '
   if blob.original_id == b"915025420245220a02cb4f0ce96640b5cc371cac":
       blob.data = open("/tmp/shloka-wave.clean.zip", "rb").read()
   '
   ```
6. Verify: `git -C /tmp/sk-purge rev-list --all --objects | grep -c 915025420245220a02cb4f0ce96640b5cc371cac` must print `0`. `git -C /tmp/sk-purge log --all --oneline -- my-old-tools/shloka-wave.zip` must show one commit.
7. Allow force pushes on `main` for a moment (Settings → Branches → main → Allow force pushes), then run `git -C /tmp/sk-purge push --force --mirror origin`, then turn force pushes off again. GitHub will refuse the `refs/pull/*` refs. That is expected.
8. Open a GitHub Support request under "Removing sensitive data" with the first changed commit and the list of affected PRs that filter-repo prints. Only Support can purge the 114 PR refs, dangling commits and cached views.
9. Every clone re-clones or hard-resets. That means this Mac's clone and all its worktrees, the Windows clone (then turn the rescue job back on), and the other collaborator's clone.

**What this changes:** 226 commit SHAs, 16 release tags move to new commits, and every commit SHA cited in changelogs, handoffs or GTD rows across the estate stops resolving on GitHub.

**What it cannot fix:** copies already downloaded or scraped. Revocation is the only real fix; the rewrite only tidies up afterwards.

_Гасунс_
