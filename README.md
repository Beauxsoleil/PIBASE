# APPLEMDT Tracker

Phone edits, TV displays, Firebase syncs both in real time.

## 1. Deploy to GitHub Pages

```bash
cd tracker
git init
git add .
git commit -m "Initial tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from branch → main → / (root)**.
Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

- Phone: open `.../index.html`, sign in, add to Home Screen.
- TV (via Pi): load `.../display.html` in kiosk mode.

## 2. Firestore security rules

The canonical rules live in [`firestore.rules`](./firestore.rules) — deploy them with the
Firebase CLI (`firebase deploy --only firestore:rules`) or paste them into
Firebase console → Firestore Database → Rules.

What changed from the old setup:

- **Applicant PII is no longer public.** The old rule was `allow read: if true`,
  which let anyone on the internet read names, phones, emails, health and legal
  notes via the Firestore REST API (the project ID is public in
  `firebase-config.js`). Reads now require `request.auth != null`.
- **All collections the app actually writes are covered** — `applicants`,
  `applicants/{id}/notes`, `events`, and `settings/mission`.
- **Writes are validated** (name required, numeric fields typed) instead of
  accepting arbitrary keys/types.
- **Clients can't delete** records — the app archives instead, so history and
  notes stay recoverable.

## 3. Set up authentication

Firebase console → Authentication → Sign-in method:

- Enable **Email/Password** (phone login).
- Enable **Anonymous** (the TV kiosk signs in anonymously so its reads satisfy
  `request.auth != null`). Without this the kiosk shows "Connection error".

Then Authentication → Users → **Add user** → set the email/password you'll use on the phone.

### One-time mission migration

The mission (fiscal year + target) is now stored in a single `settings/mission`
document — previously it was stashed inside an applicant record. After deploying,
open the phone app once and re-enter/save the mission numbers; the kiosk's
Pipeline screen will pick them up from the new location.

## 4. Pi 2 kiosk mode

On the Pi, install a lightweight browser (Chromium) and autostart it in kiosk mode pointed at the display URL.

```bash
sudo apt update
sudo apt install --no-install-recommends xserver-xorg x11-xserver-utils xinit openbox chromium-browser -y
```

Create `~/.xinitrc`:

```bash
#!/bin/sh
xset -dpms
xset s off
xset s noblank
openbox-session &
chromium-browser --noerrdialogs --disable-infobars --kiosk \
  "https://<your-username>.github.io/<repo-name>/display.html"
```

Auto-login to console + auto-start X on boot — add to `~/.bash_profile`:

```bash
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi
```

Enable auto-login on tty1 via `sudo raspi-config` → System Options → Boot / Auto Login → Console Autologin.

Reboot — the Pi should boot straight into the live board.

## Notes

- The `apiKey` in `firebase-config.js` is safe to be public — it identifies the project, it doesn't authorize access. Security comes from the Firestore rules above.
- If the TV shows "Connection error," check the MiFi puck's signal — the Pi needs internet access to reach Firestore. Also confirm the **Anonymous** sign-in provider is enabled (see step 3).
- The kiosk and the phone both enable Firestore offline persistence, so cached data stays visible when the MiFi puck drops. The kiosk refreshes its calendar feed every 5 minutes; the GitHub Action republishes `calendar.ics` every 10 minutes.
- For stronger protection against scrapers, add **Firebase App Check** (reCAPTCHA) in the console and call `initializeAppCheck` in `firebase-config.js`.

### Calendar feed secret

The published iCloud calendar URL is a shared token, so it must not sit in the
public repo. Store it as a repository secret and the sync workflow will use it:

1. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**.
2. Name it `ICAL_FEED_URL`, value = your published calendar URL
   (iCloud → Calendar → share a calendar → "Public Calendar" → copy link).
   Paste the link as-is — both `https://…` and `webcal://…` forms work.
3. The scheduled `Sync iCloud Calendar` workflow fails loudly with a reminder if
   the secret is missing.

### CI

`.github/workflows/ci.yml` syntax-checks every JS module and inline script and
runs `scripts/smoke.mjs` (parser/date/escape unit tests) on each push/PR.
