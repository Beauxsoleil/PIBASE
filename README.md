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

In Firebase console → Firestore Database → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /applicants/{applicantId} {
      allow read: if true;
      allow write: if request.auth != null;

      match /notes/{noteId} {
        allow read: if true;
        allow write: if request.auth != null;
      }
    }
  }
}
```

This lets the TV read without logging in, but only your signed-in phone can write.

## 3. Create your one login

Firebase console → Authentication → Sign-in method → enable **Email/Password**.
Then Authentication → Users → **Add user** → set the email/password you'll use on the phone.

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
- If the TV shows "Connection error," check the MiFi puck's signal — the Pi needs internet access to reach Firestore.
