# Privacy hardening (PR #34)

PIBASE handles recruiting applicants: names, phone numbers, emails, medical and
legal screening information, waiver details, and free-text notes. This document
describes how the app now limits what each screen and each credential can see,
what historical data still needs a decision, and how to deploy and clean up.

## 1. What changed

### Medical / legal flags instead of free text (editor)

The editor no longer accepts medical or legal narratives. Two tri-state
selects, `medicalIssueFlag` and `legalIssueFlag`, store only `yes`, `no`, or
`unknown` ("Not reviewed"). The old `physicalHealth` and `legalIssues`
textareas are gone from the form, and no code reads or writes those fields.

- The Firestore rules enforce the tri-state values (`validApplicant`) and
  freeze the legacy fields: no new record may carry `physicalHealth` or
  `legalIssues`, and no update may introduce, change, or clear them — even
  for the owner. Removal goes through the console retention process in
  section 5, not through casual edits.
- Legacy records that still carry those fields keep them untouched on
  re-save (the editor's `updateDoc` is a partial merge). The editor shows a
  presence-only notice — "This record still holds older medical/legal notes
  entered before the flag system" — never the content.
- The notes box keeps a helper line ("Do not enter medical diagnoses,
  medications, criminal history, or other sensitive details in applicant
  notes") plus a keyword confirm dialog (`containsSensitiveNotePattern` in
  `pibase-util.js`). The dialog is a speed bump, not a guarantee: it cannot
  catch paraphrases or abbreviations, and the recruiter can still save.

### Kiosk screens show less (Pi + legacy iPad)

Firestore rules cannot restrict individual fields inside a readable
document, so the kiosk no longer reads `applicants` at all. It reads a
sanitized mirror collection, `kioskApplicants`, and the kiosk role's read
access to full applicant documents was removed from the rules.

The mirror carries exactly these 15 fields:

`name`, `statusStage`, `age`, `generalArea`, `priorService`,
`educationLevel`, `nextAction`, `nextActionDate`, `precedence`, `updatedAt`,
`createdAt`, `archived`, `archiveFolder`, `archivedFiscalYear`, `updatedBy`

Everything else is excluded: phone, email, medical/legal flags, waiver type
and status, marital status, dependents, tattoos, latest note, notes,
`physicalHealth`/`legalIssues`, survey provenance, school, previous stage.
The allowlist is enforced twice: by `sanitizeForKiosk()` in
`pibase-util.js` (client) and by `validKioskApplicant()` in
`firestore.rules` (server, via a key whitelist — even the owner cannot put
a phone number into a mirror through the client).

Kiosk rendering changes:

- Pi detail view: the Contact section (phone + email) and the waiver badge
  are removed. Cards show name, age/area/prior service/education, stage
  rail, and the staleness-based Review badge only.
- Pi events screen and iPad events slide: `resultNotes` (unrestricted free
  text) is no longer rendered. Counts (leads/appointments/qualified/
  contracts) are unchanged.
- iPad cards: waiver badge and latest note removed.
- The territory screen was also fixed: it used to read the minimal
  Boudreaux feed (no `generalArea`), so every active applicant showed as
  Unassigned. It now reads the full applicant globals.

The kiosk role still reads `events`, `eventResults`, `settings/mission`,
and the daily `inputAppointments-*` reminder — it needs all four. It cannot
read `applicants`, notes, `surveyLeadDedupes`, `surveyLeadImports`, or
`recruiterMappings`.

### Mirrors: how they stay in sync

The editor writes the mirror on every applicant save (create + update),
archive, restore, and survey "create separate" action, via
`writeKioskMirror()` in `firebase-config.js`. The mirror write is a full
replace (no merge), so a field removed from the applicant cannot linger in
the kiosk copy, and it is fire-and-forget: a failed mirror never fails the
applicant save. A stale mirror is repaired by the next save or by
**Rebuild kiosk data** on the phone list screen, which rewrites every
mirror from the already-loaded applicant list in batches of 500.

The external SURVEY sync worker creates applicants directly and does not
yet write mirrors, so its leads appear on the kiosk only after the next
edit or rebuild. The rules already allow the sync role to create mirrors
for its own deterministic `survey-{uuid}` IDs, so the worker can adopt
mirroring without another rules deploy.

### Attribution (section 6 fix)

Applicant, note, and event writes now set `updatedBy` (and `updatedAt`
where the rules require it). Previously the editor never set `updatedBy`,
so under the rules' `attributed()` requirement assistants were effectively
read-only for applicants, notes, and events in practice. Assistants with
the write switch can now actually write; the owner path is unchanged.

Mirror writes are attributed by `updatedBy` alone. A mirror's `updatedAt`
is copied applicant data, not the mirror's write time: a rebuild must
preserve it, or every Review badge would clear. The rules reflect that
(`mirrorAttributed`).

### Offline storage: persistence off

Firestore IndexedDB persistence is disabled (`enableIndexedDbPersistence`
removed from `firebase-config.js`). The cache is memory-only:

- Live updates, startup, auth, and create/edit all work exactly as before
  while the page is open.
- A browser restart while offline now shows **no applicant data** (the app
  shell still loads from the service worker). Previously the last cached
  records survived a restart.
- Offline writes can no longer queue across a restart: a write made
  offline exists only in memory while the page stays open. Do not close
  the app before reconnecting if an offline save is pending.
- The phone status line and the offline page now say this plainly.

The service worker caches only the app shell, SDK, fonts, and
`calendar.ics`; Firestore traffic is cross-origin and its fetch handler
returns early for non-same-origin URLs, so no applicant data is cached by
the service worker. localStorage holds only mascot preferences, mission
snapshots, the iPad refresh token + UID, the SFS PDF template, and the
calendar feed URL — no applicant PII.

## 2. Deployment sequence

Order matters. The rules deploy and the code deploy must be close
together; either order has a short gap (old code + new rules = kiosk
denied; new code + old rules = unknown collection denied). There is no
fallback to full applicants.

1. **Save a private copy of the currently deployed rules** (Firebase
   console → Firestore → Rules → copy the text) so you can roll back.
2. **Deploy the new rules first.** Canonical file:
   `security/muse/firestore.rules` (root `firestore.rules` is a
   byte-identical mirror; both are updated in this PR).
   - Console: paste the canonical file into Build → Firestore Database →
     Rules → Publish.
   - CLI: `cd security/muse && firebase deploy --project pi-base-a3a09 --only firestore:rules`
3. **Merge PR #34** (after CI is green) and wait for GitHub Pages to
   publish. The kiosk picks up the new code within about an hour via its
   idle reload, or reload the Pi browser manually.
4. **Run the backfill from the phone:** open the Applicants list, tap
   **Rebuild kiosk data**, confirm. The collection starts empty — without
   this step the kiosk shows no applicants. The button reports how many
   records were rebuilt and how many failed.
5. **Verify the kiosk:** roster, Today, pipeline mission count, territory
   areas, and events all populate; no phone numbers, emails, waiver types,
   or notes appear anywhere. Verify the iPad the same way.

If the kiosk shows "Connection error" or an empty roster after step 3 but
before step 4, that is the expected empty-collection state, not a broken
kiosk — run the backfill.

## 3. Clearing historical IndexedDB data

Persistence is off going forward, but devices that ran the old code still
hold a Firestore IndexedDB database with full applicant documents cached.

**Phone (PWA / Safari):**

1. Go online first and confirm the app loads live data, so any pending
   in-memory writes sync. Do not close the app while a save is pending.
2. Remove the PWA from the Home Screen and re-add it, or go to
   Settings → Safari → Advanced → Website Data and remove the PIBASE site
   data. Then sign in again.

**Pi kiosk (Chromium):**

1. Go online first and confirm live data on the board.
2. Open DevTools (F12) → Application → IndexedDB → delete **only** the
   `firestore/` database.
3. **Do not clear all site data.** The kiosk's anonymous UID is enrolled
   under `access/<KIOSK_UID>` with role `kiosk`; clearing all storage
   generates a new anonymous UID that must be re-enrolled per
   `security/muse/README.md` steps 2 and 4. Deleting only the Firestore
   IndexedDB database preserves the auth session in
   `firebaseLocalStorageDb` and localStorage.

**Legacy iPad:** `ipad.html` uses REST, not the Firestore SDK, and never
created a Firestore IndexedDB database. Nothing to clear there beyond its
localStorage refresh token (see section 6).

## 4. Remaining risks

- **Notes and event text are still free text.** The keyword dialog is a
  speed bump. Anything sensitive typed into a note, an event description,
  or a calendar event summary/location is still stored and (for event
  summaries) still shown on the kiosk. The ICS sync emits no DESCRIPTION,
  but a sensitive SUMMARY or LOCATION reaches the kiosk.
- **The iPad refresh token.** `ipad.html` stores a refresh token in
  localStorage (`pibase.ipad.v1.session`). The token carries whatever role
  the signed-in account has: if the iPad signs in as a recruiter, that
  token can read full applicant documents via the REST API even though
  the page itself only polls `kioskApplicants`. Recommendation: create a
  dedicated display account enrolled with role `kiosk` and sign the iPad
  in with that, so a stolen token only ever yields sanitized data.
- **Assistants still read full applicant documents.** That is by design
  (they need phone/email to do recruiting work); the rules keep them out
  of archiving, restoring, mission settings, access management, and
  hard deletes, and `updatedBy`/`updatedAt` now attribute their writes.
  Revocation prevents future access; it cannot erase data an assistant
  already fetched or cached.
- **The public `calendar.ics` feed** is outside the Firestore rules and
  remains public. Do not put applicant names or sensitive detail in event
  summaries or locations.
- **The kiosk still shows applicant names, ages, areas, and next actions.**
  That is the minimum the board needs to function. Anyone who can see the
  TV can see it.
- **`updatedBy`/`updatedAt` are not an immutable audit log.** They record
  the latest writer, not every change. Notes are append-only for
  assistants, and survey review decisions are server-enforced, but
  applicant field history is not versioned.

## 5. Retention decision needed (Joel)

Two things need Joel's call in the console; no code in this PR touches
production data.

1. **`physicalHealth` / `legalIssues` values in existing applicant
   documents.** The fields are frozen by the rules and invisible in the
   app, but any historical values still sit in Firestore. Proposed
   process: Joel inspects the affected records in the console, decides
   which (if any) values must be kept for a legal or medical hold, then
   removes the rest with a one-time console/Admin delete of just those
   two fields (the console and Admin SDK bypass the client-side freeze).
   Do not use the phone app to clear them — the rules will reject it.
2. **IndexedDB history on the phone and Pi.** Follow section 3 when ready.
   There is no deadline: the cached data is only reachable on those two
   devices, and it stops growing the moment the new code loads.

## 6. Interaction with PR #32 (Enlisted folder)

PR #32 merged into main (9611a1f) and is in this branch. The mirror
copies `archived`, `archiveFolder`, `archivedFiscalYear`, and
`statusStage`, so the kiosk mission count (`countEnlisted`) and the iPad
mission totals work from mirrors exactly as they did from full documents.

Known open item (found by a Codex review of #32 after merge, fix underway
on #32's follow-up): changing an Enlisted-folder applicant to another
stage via the phone stage rail preserves `archiveFolder: 'enlisted'` in a
partial `updateDoc`, and the iPad's territory/mission counting classifies
by `statusStage` only, so such a record is mis-filed and undercounted on
the iPad. The mirror faithfully copies whatever the applicant document
says, so this PR neither fixes nor worsens it; once the #32 follow-up
lands in main, rebase this branch before merging.

## 7. Tests

- `scripts/smoke.mjs`: `sanitizeForKiosk` allowlist (exact 15 keys, all
  sensitive fields dropped), flag validation, legacy-field detection,
  notes keyword screen, and static checks that kiosk files contain no PII
  references and read `kioskApplicants`.
- `scripts/ipad-smoke.mjs`: 19 synthetic tests, including a poll that
  reads only `kioskApplicants` and a card that never renders a note or
  waiver type even when the fixture carries them.
- `scripts/ipad-browser-smoke.mjs`: Playwright fixture updated to the
  sanitized collection; asserts no note/waiver rendering.
- `security/muse/tests/rules.test.mjs` (emulator, CI only): kiosk reads
  mirrors but not applicants/notes/survey data; kiosk still reads events,
  results, mission, and the daily reminder; mirror key-whitelist
  enforcement (including owner rejection of phone/email/flags/notes);
  syncer/reviewer mirror ID fences; tri-state flag validation; legacy
  freeze (create/update rejection, legacy-doc edit still allowed).
- The Firestore emulator cannot run on the development VM (sandbox RSTs
  loopback HTTP/2), so the rules suite is authoritative only in CI.
