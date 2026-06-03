# Firebase Cloud Sync Acceptance

## Current Status

The Firebase project `sanskritkaraoke` is wired into the deployed GitHub Pages app.
The live app now reaches Google Accounts through Firebase redirect auth.

The acceptance test is paused inside Google sign-in, not in app code.

Latest observed browser state:

- URL: `https://accounts.google.com/v3/signin/challenge/pwd?...`
- Flow: Google OAuth for `sanskritkaraoke.firebaseapp.com`
- Account: `gasyoun@gmail.com`
- Current blocker: Google is waiting for the account password, 2FA, and/or consent.

User-reported Firebase Console setup:

- Firebase Authentication enabled.
- Google sign-in provider enabled.
- Project support email set.
- Authorized domains includes `gasyoun.github.io`.
- Firestore Database exists.
- Firestore rules were pasted/published from `firestore.rules`.

## Exact Handoff Note

It is not fully logged in yet. The email field is already filled with
`gasyoun@gmail.com`, but Google is waiting for you to click the blue `"Далее"`
button, then finish password/2FA/consent if asked.

After Google redirects back to SanskritKaraoke, tell Codex `done` and continue
the SRS + Firestore acceptance.

Since the latest observed URL is already `signin/challenge/pwd`, the email step
has likely passed. Continue from the visible Google password/verification screen.

## Acceptance Steps To Resume

1. Complete Google password/2FA/consent in the in-app browser.
2. Confirm the browser redirects back to `https://gasyoun.github.io/SanskritKaraoke/progress.html...`.
3. Confirm the progress button changes from `Sync: Local` to `Sync: Cloud (...)`.
4. Open `student.html?id=bhg_2_47`.
5. Submit one SRS rating through the visible student UI.
6. Confirm Firestore receives:
   - `users/{uid}/data/srs_v1`
   - `users/{uid}/data/telemetry`
   - `users/{uid}/data/progress_meta`
7. Reopen `progress.html` after clearing local state or using another profile.
8. Confirm cloud progress restores.
9. Logout and confirm the UI returns to local mode.

## Data Contract

Firestore path:

```text
users/{uid}/data/{docId}
```

Allowed document ids:

- `srs_v1`
- `telemetry`
- `progress_meta`

Document shape:

```json
{
  "payload": {},
  "updated_at": "2026-06-03T00:00:00.000Z"
}
```

Rules source:

```text
firestore.rules
```
