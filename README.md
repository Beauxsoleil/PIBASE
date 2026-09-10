# APPLEMDT Tracker

Phone edits, TV displays, Firebase syncs both in real time.

## Installable PWA

PIBASE is an installable Progressive Web App shared by the phone editor and the
Raspberry Pi kiosk. The manifest supplies the app name, colors, icons, and
standalone launch behavior. The shared service worker caches the Applicants,
Events, and kiosk screens along with their application code, calendar snapshot,
and Firebase browser SDK.

On iPhone, open `index.html` in Safari, tap **Share → Add to Home Screen**, and
launch PIBASE from the new icon. If an update is ready, the phone displays a
**Refresh** action so it never reloads over an unsaved form. Offline status is
shown at the bottom of the phone screen; Firestore continues to provide the last
cached records and queues supported writes until connectivity returns.

The kiosk installs updates automatically and reloads through its existing safe
idle-recovery path. `scripts/pwa-smoke.mjs` verifies the manifest, icons, page
metadata, and offline shell in CI so PWA coverage cannot be removed unnoticed.

## Live kiosk follow-ups

The kiosk's **Today** screen combines today's iCloud calendar events with
applicant follow-ups that are overdue or due in the next 30 days. Each follow-up
shows its due date, applicant name, action text, and current pipeline stage.
Applicant edits arrive through Firestore's real-time listener, so changing an
action or due date on the phone updates the kiosk without a manual refresh.

An applicant receives the **Review** badge only after their `updatedAt` timestamp
is at least 30 full days old. Saving the applicant or adding a note refreshes
that timestamp and removes the badge. Legacy records fall back to `createdAt`;
records with neither timestamp are not guessed to be stale.

## Applicant archiving

Applicants are never deleted. The phone editor can move a saved applicant into
the **Cowards** or **Previous FY** archive folder after an explicit confirmation.
Archived records retain their notes and history, are visually identified inside
their archive folder, and can be restored to Active Applicants.

All operational surfaces treat archived applicants as inactive: the default
phone list, TV board, Today screen, reminders, pipeline counts, and mission totals
exclude them immediately through Firestore's real-time listeners. Missing archive
fields mean active for backward compatibility; either `archived: true` or a
legacy nonempty `archiveFolder` means archived.

The private Interview service can add reviewed interview notes and approved
structured fields through Firebase Admin. It follows the same archive semantics
and cannot sync to an archived applicant unless the recruiter explicitly chooses
to restore that record first. The Firebase service-account credential belongs
only on the Interview server and must never be added to this static-site repo.

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

The canonical rules live in [`firestore.rules`](./firestore.rules). Two ways to
deploy them:

**A. Firebase console (no CLI needed)**

1. Open https://console.firebase.google.com/ and select project **pi-base-a3a09**.
2. Go to **Build → Firestore Database → Rules** tab.
3. Click **Edit rules**, replace everything with the contents of `firestore.rules`, and click **Publish**.

**B. Firebase CLI**

```bash
npm install -g firebase-tools
firebase login
firebase use pi-base-a3a09
firebase deploy --only firestore:rules
```

(`firebase.json` in this repo already points at `firestore.rules`.)

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

### Reporting results on iCloud calendar events

You no longer need to re-create an iCloud event to record its statistics:

1. On the phone, open **Recruiting events**. Every iCloud event is now tappable —
   tap **Report results ›** and enter leads / appointments / qualified /
   contracts. Recent past events (last 30 days) stay listed so you can report
   after an event ends.
2. Results are stored in the `eventResults` collection, keyed to the event's
   iCloud `UID` + start date — so they survive renames, moves, and calendar
   resyncs, and never duplicate the event record.
3. The TV's **Event Results** screen merges these in: its totals and "recent"
   list now include iCloud-event results alongside hand-entered event records.

> **Run the calendar sync once after deploying** so the published feed carries
> each event's iCloud `UID` before you report results (the workflow now emits
> `UID`). Results link by that identifier.

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
