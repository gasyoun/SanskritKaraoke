---
name: history-rewrite-must-stop-windows-rescue-push-first
description: Any SanskritKaraoke history rewrite must first stop the Windows box's daily rescue-branch push, or the old history (and a purged secret) comes straight back
metadata:
  type: project
---

The Windows box pushes a `rescue/SanskritKaraoke-<date>-win` branch every day at 00:30 UTC (H4357 dirty-snapshot job). It pushes whatever history that clone holds. After a `git filter-repo` force-push, the Windows clone still holds the OLD history, so its next rescue push re-uploads every purged blob to GitHub under a new branch name.

Also, GitHub secret scanning does not look inside zip archives. A key committed inside `my-old-tools/shloka-wave.zip` sat public from 22-06-2026 to 21-09-2026 with no alert.

**Why:** found while preparing the purge of GCP key `211c6a6e6a07` from `shloka-wave.zip` (21-09-2026, [incident note](https://github.com/gasyoun/SanskritKaraoke/blob/main/docs/security/INCIDENT_GCP_SERVICE_ACCOUNT_KEY_SHLOKA_WAVE_ZIP_21-09-2026.md)). 13 rescue branches already carried the leaky blob.

**How to apply:** before any history rewrite here, disable the Windows rescue job for this repo, rewrite and force-push, re-clone on Windows, then turn the job back on. When auditing for secrets, list entries inside every archive in history (`unzip -Z1`) rather than trusting the scanning alerts.
