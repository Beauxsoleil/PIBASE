# Legacy iPad display

## What ships

Add `ipad.html` at the repository root beside `display.html`. It is handwritten
ES5 with inline CSS and JS, no SDK, build step, external font, or redirect.
Its only UI asset dependency is the existing `icons/pibase-192.png` home-screen
icon. Data uses Firestore REST plus the existing `calendar.ics` feed.

After this branch is reviewed, merged and GitHub Pages publishes it, open:

https://beauxsoleil.github.io/PIBASE/ipad.html

The Pi continues to use `display.html`. No existing app file, Rules, auth provider,
account, service worker, configuration, or Pi URL is changed by this addition.
Do not point the iPad at the modern `index.html` to sign in; this file has its own
REST sign-in form. No automatic Safari redirect was added.

## Login and privacy

Use your existing PIBASE email/password. REST `accounts:signInWithPassword` obtains
an ID token; requests send it in an Authorization header. The Secure Token REST
endpoint refreshes the session. No signup, anonymous identity, Firestore write,
role lookup, Admin SDK or service-account credential is used. The unchanged Rules
still decide access. Owner login does NOT become a read-only backend account.

The checked Remember option saves a refresh token (a credential) and UID in
`pibase.ipad.v1.session` in localStorage. No password or applicant data is saved
by this file; ID tokens stay in memory. Same-origin scripts/browser-profile
access can access localStorage: this is not encrypted isolation. Uncheck Remember
for a session that ends on reload. Sign out clears this file's token and display,
without changing any existing SDK/Pi session. No tokens in URLs or diagnostics.

Add to Home Screen BEFORE signing in; Safari and the standalone context may have
separate storage. Cleared/blocked storage can require signing in again. MFA is not
implemented. If this account requires MFA or App Check enforcement blocks REST,
stop and review compatibility; do not weaken the existing project's settings.
Live key restrictions, App Check, login and actual iOS 9 TLS/certificate support
have not been tested. No live applicant data was accessed during development.

## Read contract and differences from the Pi

Source inspected: display.html, firebase-config.js, pibase-util.js, events-ui.js,
appointment-reminder.js and firestore.rules on main at 42e0028.
Project: pi-base-a3a09, database: (default).

- `applicants`: same active/archive semantics and descending updatedAt order as
  the Pi (records lacking updatedAt are excluded to match its orderBy query).
  Names, age, generalArea, priorService, educationLevel, statusStage, waiverType,
  latestNote, updatedAt/createdAt, nextAction/nextActionDate and precedence are
  available from the same source. Seven stage markers; DEP aliases Q&E; Review
  means 30 full days since updatedAt, falling back to createdAt.
- `settings/mission`: fiscalYear and target; stage counts/mission totals.
- `events`: name/date/location/poc/type, leads/appointments/qualified/contracts,
  resultNotes; `eventResults`: summary/start and matching result fields.
- `settings/inputAppointments-YYYY-MM-DD`: dismissed. Reminder uses Mountain time
  with explicit US DST rules since 2007, no Intl dependency. It is a nonblocking
  banner; dismiss only through the existing phone app. Future timezone-law changes
  need maintenance. Other calendar/day displays and daily reload use device time;
  set the iPad timezone to Boise and enable automatic date/time.
- `calendar.ics`: existing published feed, refreshed every 5 minutes. Same limited
  DTSTART/DTEND-style parsing model as the Pi; no independent recurrence engine.
  UTC and date-only starts supported; legacy bare TZID times use device local time.

All collection pages are fetched using nextPageToken. No partial page replaces a
complete display. A failed required Firestore read retains the previous complete
poll and timestamp; 403 is labeled access denied, not an empty roster. Polls do not
overlap; one 401 refresh retry per pass; request timeout 12 seconds. Calendar has
its own failure indicator. Empty input is distinct from a failed read.

Applicant cards use two float columns (four per page). Every section rotates with
no taps: applicants, Today/follow-ups, next-seven-day calendar, pipeline/mission,
events/results, territory. Short pages dwell 12 seconds; overflowing content
scrolls fully before advancing. Latest notes are escaped and shown in full.
Long notes can make a rotation take longer. No interactive applicant detail/contact
screen or editing is included. Calendar uses an agenda instead of seven columns;
events use date-descending pages rather than separate upcoming/recent panels;
territory uses a counts table. Pi auxiliary high/review/waiver/Q&E tiles, event
aggregate tiles and mission pace tile are omitted. Stage counts, mission totals,
applicant fields, event per-record results and area stage mix remain available.

There is no service worker on iOS 9. During an outage, keep the already-loaded page
open: last-good data remains only in memory. A cold offline launch, forced reload,
or OS process eviction may require connectivity again. Daily reload is once per
local day after 3 AM, deferred until a recent successful poll and a persisted
session exist; it is disabled for temporary sessions. A successful API poll cannot
guarantee the static host will also be reachable at reload time.

## Quota warning: decide before continuous use

Requested interval is 15 seconds: 5,760 polls per 24 hours, or 1,920 in 8 hours.
For A applicant documents, E event docs, R eventResult docs, a rough document-read
floor is `polls * (A + E + R + 2)`, plus empty-query minimums, authorization-dependent
reads, retries and pagination costs. Archived applicant documents are downloaded
and then filtered, so include them in A. This is an estimate, not measured usage.

Twenty applicant documents ALONE yield 115,200 reads/day or 38,400 over eight
hours. The documented free Firestore allowance is 50,000 document reads/day; other
PIBASE/Warrior activity shares the database's allowance. Exhausting it on Spark
can affect the existing Pi and phone. No billing or quota settings were changed.
Recommend a slower agreed interval before unattended all-day operation; 15 seconds
is retained here to honor the requested contract, not endorsed as quota-safe.

## Test evidence (2026-11-02)

- `node scripts/ipad-smoke.mjs`: 17 synthetic tests passed: typed data, pagination,
  error retention, archive/stage semantics, escaping, authentication/refresh,
  storage refusal, sign-out races, timeout/locks, scrolling, DST and daily reload.
- Acorn parse with `ecmaVersion: 5`: passed for the entire inline script.
- `node scripts/ipad-browser-smoke.mjs` with Playwright and Chromium available:
  passed at 1024x768 with external requests mocked. Verified rendering, page tokens,
  full-note overflow scroll, 503 retention, session restore after reload and sign-out.
  Test supports PIBASE_PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE_PATH overrides.
- Existing `node scripts/smoke.mjs`, `node scripts/pwa-smoke.mjs`,
  `node scripts/appointment-reminder-smoke.mjs`: all passed unchanged.
- No physical iPad, live login, TLS test, overnight soak or quota measurement done.
  Chromium is not certification of iOS 9/Safari 9.

## Physical iPad checklist (fill after testing)

- [ ] Open the HTTPS URL in Safari while online. Confirm date/time and Boise zone.
- [ ] Share > Add to Home Screen; use that icon, landscape orientation, then sign in.
- [ ] Verify names, stages, latest notes, archive exclusions and totals against Pi.
- [ ] Check Settings > General > Auto-Lock > Never (iOS 9 menu), connect power.
- [ ] Settings > General > Accessibility > Guided Access: enable and set passcode.
      Open display, triple-click Home to start Guided Access. Test exit procedure.
- [ ] Let it rotate through all sections and scroll a long synthetic test note.
- [ ] Turn Wi-Fi off: last data remains and timestamp stops; offline retry appears.
- [ ] Reconnect: updates resume. Close/reopen while online: session restores.
- [ ] Sign out: cards and this page's remembered credential disappear.
- [ ] Test after 3 AM; confirm one reload, delayed during outage; run overnight soak.
- [ ] Check Firebase usage before/after a timed trial; approve an interval budget.

Blank screen: the initial HTML includes a static sign-in panel and boot/debug text.
If the HTML itself never loads, check HTTPS connection, device date/certificates
and the exact ipad.html URL. If script fails, a redacted line number appears in
footer. Enable Settings > Safari > Advanced > Web Inspector and inspect from a
compatible Mac Safari Develop menu when available. Never paste auth tokens,
passwords or applicant-bearing screenshots into a public issue.

Official references checked 2026-11-02:
- https://firebase.google.com/docs/reference/rest/auth
- https://firebase.google.com/docs/firestore/use-rest-api
- https://firebase.google.com/docs/firestore/quotas
