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
textareas are gone from the form. No code displays or writes those fields;
the only read is `hasLegacySensitiveFields()` in `pibase-util.js`, which
checks presence (to show the notice below) and never returns the content.

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

The mirror carries exactly these 14 fields:

`name`, `statusStage`, `age`, `generalArea`, `priorService`,
`educationLevel`, `nextAction`, `nextActionDate`, `precedence`, `updatedAt`,
`createdAt`, `archived`, `archiveFolder`, `updatedBy`

Everything else is excluded: phone, email, medical/legal flags, waiver type
and status, marital status, dependents, tattoos, latest note, notes,
`physicalHealth`/`legalIssues`, survey provenance, school, previous stage,
and `archivedFiscalYear` (cut in Nov 2026 — no kiosk screen reads it;
Previous FY grouping is editor-only). `age`, `priorService`, and
`educationLevel` stay because both kiosk card layouts render them;
`updatedBy` stays because the rules use it to attribute mirror writes
(`mirrorAttributed`) — it is never rendered. The allowlist is enforced
twice: by `sanitizeForKiosk()` in `pibase-util.js` (client) and by
`validKioskApplicant()` in `firestore.rules` (server, via a key whitelist
— even the owner cannot put a phone number into a mirror through the
client).

Kiosk rendering changes:

- Pi detail view: the Contact section (phone + email) and the waiver badge
  are removed. Cards show name, age/area/prior service/education, stage
  rail, and the staleness-based Review badge only.
- Pi events screen and iPad events slide: `resultNotes` (unrestricted free
  text) is no longer rendered, and event notes are no longer stored in the
  kiosk-readable parent docs at all — they live in reader-only
  `events/{id}/notes/*` and `eventResults/{id}/notes/*` subcollections
  (see below). Counts (leads/appointments/qualified/contracts) are
  unchanged.
- Events whose name, summary, location, or POC contains a medical/legal
  keyword never reach a kiosk screen: the calendar sync workflow redacts
  them in `calendar.ics` (SUMMARY becomes "Private event", LOCATION is
  dropped), and the Pi, iPad, and events screen filter the same word stems
  at render time as defense in depth. See "Sensitive event text" below.
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
`requestMirrorSync()` in `firebase-config.js`. The mirror write is a full
replace (no merge), so a field removed from the applicant cannot linger in
the kiosk copy, and it is best-effort: a failed mirror never fails the
applicant save.

A failed mirror is now **detectable and recoverable**, not a silent
console warning:

- Failures are recorded in an in-memory sync queue
  (`createMirrorSyncQueue` in `pibase-util.js`, wired in
  `firebase-config.js`). The queue is never persisted, so no applicant PII
  is written to storage.
- While the queue is non-empty, the Applicants list shows a banner —
  "Kiosk copy failed for N record(s)" — with a **Retry failed kiosk
  copies** button. Retry re-reads the current applicant record, so a retry
  never overwrites a mirror with data made stale by a later edit. The
  detail screen also notes "Saved, but the kiosk copy failed" when the
  failure lands while an applicant is open.
- **Rebuild kiosk data** on the phone list screen rewrites every mirror
  from the already-loaded applicant list in batches of 500. A failed batch
  no longer fails all 500 records: each document is retried on its own, so
  only the genuinely failing records stay broken, and those are queued for
  retry. A successful rebuild clears the queue for the records it rewrote.
- Once per load, after the first applicant list arrives, the editor runs a
  **drift check** (`checkKioskMirrorDrift`): it compares the loaded
  applicants against the stored mirrors and reports how many are missing
  or stale. Content is compared field by field; timestamps compare with a
  5-minute tolerance, because the applicant save and its mirror write
  resolve independent `serverTimestamp()` sentinels and differ by seconds
  even on a healthy save. Mirrors with no applicant are reported as extra
  and never auto-deleted — orphan cleanup is a console-only delete.

If the page closes with pending mirrors, the queue is lost — but the next
load's drift check flags those records as missing or stale, so nothing
fails silently for long.

### SURVEY leads and mirrors

The external SURVEY sync worker creates applicants directly and does not
yet write mirrors. Until it does, its leads are caught by the drift check
above: they show up as `missing` the first time the phone editor loads
after a sync, and the banner tells the user to rebuild. The rules already
allow the sync role to create mirrors for its own deterministic
`survey-{uuid}` IDs, so the worker can adopt mirroring without another
rules deploy.

**Worker change still needed** (in the sync-leads service, not this repo):
after the worker creates `applicants/survey-{uuid}`, it should also create
`kioskApplicants/survey-{uuid}` with the same 14 allowlisted fields the
editor writes (`sanitizeForKiosk` output: `name`, `statusStage`, `age`,
`generalArea`, `priorService`, `educationLevel`, `nextAction`,
`nextActionDate`, `precedence`, `updatedAt`, `createdAt`, `archived`,
`archiveFolder`, `updatedBy`), with `updatedBy` set to the sync role's own
UID. Create-only, same deterministic ID — the worker never updates
records, and the rules enforce that (the mirror create allow for `syncer`
requires the `survey-{uuid}` ID pattern and `mirrorAttributed`). Until
that lands, the drift check + rebuild path above is the reliable reconcile.

### Event notes are reader-only

Planning notes and result notes used to live inside `events` and
`eventResults` documents, which the kiosk role can read — the kiosk never
rendered them, but every snapshot carried them. They now live in
`events/{id}/notes/planning`, `events/{id}/notes/results`, and
`eventResults/{id}/notes/results`, each a `{text, updatedAt, updatedBy}`
document. The rules give the kiosk role no allow on those subcollections
at all, and they freeze the parent docs: a create must not carry `notes`
or `resultNotes`, and an update must not touch them (same diff pattern as
the legacy-field freeze). The editor (`events.html`) loads the private
note when an event opens — falling back to the legacy in-doc value if no
private note exists yet — and saves the parent doc and the note together,
reporting "Saved, but notes did not save" if only the note write fails.
`hasResults` is now counts-only, so a notes-only result no longer flips
the "Edit results" label. Legacy in-doc values stay readable until the
console cleanup in section 5, item 3.

### Sensitive event text

A sensitive SUMMARY or LOCATION used to reach the kiosk through the public
`calendar.ics` feed and through events entered directly in PIBASE. Two
layers now block it, using the same medical/legal word stems as the notes
keyword screen (`containsSensitiveNotePattern` in `pibase-util.js`):

1. **Upstream redaction:** the `sync-calendar.yml` workflow checks each
   event's SUMMARY and LOCATION against the stem list before publishing
   `calendar.ics`. A match publishes the time slot as "Private event" with
   no location, so the day is not silently empty but no detail leaks. The
   feed still emits no DESCRIPTION.
2. **Render-side filtering:** the Pi (`display.html`, `events-ui.js`) and
   the iPad (`ipad.html`, a compact ES5 copy of the stem list — the page
   is standalone by design) drop any matching event entirely: not
   rendered, and not counted in the events totals. This covers events
   entered directly in PIBASE, which never pass through the workflow.

The three stem lists (JS helper, iPad ES5 copy, workflow Python) must stay
in sync; `scripts/smoke.mjs` asserts the workflow and the renderers carry
the filter, and `scripts/ipad-smoke.mjs` tests the iPad filtering
directly. The filter is stem-based: it cannot catch paraphrases or
abbreviations, and it is deliberately broad (a "drug-free zone" event is
redacted too). Do not put applicant names or sensitive detail in event
summaries or locations regardless.

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
fallback to full applicants. **Deploying the rules needs Joel's explicit
approval — it is a separate gate from merging the PR.**

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
   idle reload, or reload the Pi browser manually. The service-worker
   cache is v38 in this PR, so clients already on v37 (PR #36) refresh.
4. **Run the backfill from the phone:** open the Applicants list, tap
   **Rebuild kiosk data**, confirm. The collection starts empty — without
   this step the kiosk shows no applicants. The button reports how many
   records were rebuilt and how many failed. If any failed, the retry
   button appears on the list — tap it, or rebuild again.
5. **Check the drift banner.** The first load after the backfill runs a
   drift check and reports any applicants still missing or stale (for
   example SURVEY leads created since the backfill). If it reports any,
   rebuild again.
6. **Verify the kiosk:** roster, Today, pipeline mission count, territory
   areas, and events all populate; no phone numbers, emails, waiver types,
   or notes appear anywhere; events with a medical/legal keyword in the
   name or location do not appear at all. Verify the iPad the same way.
7. **Verify the editor:** save one applicant and confirm no mirror-failure
   banner appears on the list; open one event, edit its notes, save, and
   reopen it to confirm the notes round-trip through the private
   subcollection.

If the kiosk shows "Connection error" or an empty roster after step 3 but
before step 4, that is the expected empty-collection state, not a broken
kiosk — run the backfill.

### Rollback procedure

If anything is wrong after the deploy, roll back in this order — rules
first, then code. Rolling back only the code leaves the old kiosk (which
reads `applicants`) denied by the new rules.

1. **Restore the old rules.** Paste the copy saved in step 1 above into
   the console Rules editor and Publish, or deploy from a checkout of
   main's rules (`firebase deploy --project pi-base-a3a09
   --only firestore:rules`). The old editor and old kiosk work again
   immediately; no data migration is needed.
2. **Revert the code.** Revert the PR #34 merge commit on main (GitHub →
   the merge commit → Revert) and wait for GitHub Pages to publish. The
   kiosk and phone pick up the reverted code on their next reload (the
   service worker serves the new shell version; reload the Pi browser
   manually to hurry it).
3. **Verify:** kiosk roster populates from `applicants` again, the editor
   saves normally, and events show their in-doc notes again.

**What survives a rollback, and what does not:**

- **Applicant data is untouched by the deploy and the rollback.** The
  tri-state flag fields are extra fields the old code ignores; the old
  editor's free-text fields were frozen by the new rules but are writable
  again under the old rules.
- **Event notes edited while the new code was live are stranded, not
  lost.** The new editor writes notes only to the `notes` subcollections,
  which the old rules do not allow clients to read, and the old editor
  reads the in-doc fields the new editor stopped updating. After a
  rollback those edits are invisible until the new rules are deployed
  again. If the rollback is permanent, copy the subcollection notes back
  into the parent docs from the console before deleting the subcollections.
- **Mirrors stay in Firestore.** Under the old rules there is no
  `kioskApplicants` match, so no client can read them; they are sanitized
  data only, so there is no urgency. Delete the collection from the
  console later if you want it gone — it is never deleted by the app.
- **Backfill interrupted:** the rebuild is idempotent and safe to
  re-run. Each mirror is a full `setDoc` replace, so a mirror is either
  fully written or not written at all — there is no half-written state.
  Re-tap **Rebuild kiosk data**; it rewrites every mirror from the loaded
  list, retries failed batches document by document, and queues any still
  failing records for retry. The next load's drift check flags anything
  still missing or stale. If the phone goes offline mid-rebuild, the
  records already written stay written; reconnect and rebuild again.
- **Device cleanup on rollback:** none is needed. The mirrors and note
  subcollections are server-side; the kiosk and phone simply read
  whichever collection the deployed code points at. The IndexedDB cleanup
  in section 3 is a forward-deploy task only, and it is safe to skip on a
  rollback (the old code re-populates its cache from the live reads).

**When not to roll back:** a single failed mirror, a drift banner, or an
empty kiosk before the backfill are all expected states with in-app
fixes (retry, rebuild) — see section 1. Roll back only for a rules
error that blocks the editor, a kiosk that stays broken after a
successful rebuild, or a data-integrity concern.

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
localStorage refresh token (see section 4).

## 4. Remaining risks

- **Applicant notes are still free text.** The keyword dialog is a speed
  bump. Anything sensitive typed into a note is still stored — but notes
  live in a reader-only subcollection the kiosk role cannot read, so a
  sensitive note can no longer leak to a kiosk screen. Event notes moved
  to the same pattern (see section 1). The keyword lists are stem-based
  and cannot catch paraphrases or abbreviations.
- **Legacy in-doc event notes are still kiosk-readable until cleaned up.**
  Events and results written before this PR may still carry `notes` /
  `resultNotes` in the parent document, which the kiosk role can read
  (the kiosk never renders them, but snapshots carry them). The rules
  freeze those fields, and the editor no longer writes them, but the
  values stay until the console cleanup in section 5, item 3.
- **Sensitive calendar text relies on keyword matching.** The workflow
  redaction and the render-side filters share a stem list; a paraphrase
  ("the hearing", an abbreviation, a misspelling) passes through. Do not
  put applicant names or sensitive detail in event summaries or locations
  regardless.
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
  remains public. Sensitive SUMMARY/LOCATION values are now redacted by
  the sync workflow, but the feed is still world-readable — treat every
  summary as public.
- **The kiosk still shows applicant names, ages, areas, and next actions.**
  That is the minimum the board needs to function. Anyone who can see the
  TV can see it.
- **`updatedBy`/`updatedAt` are not an immutable audit log.** They record
  the latest writer, not every change. Notes are append-only for
  assistants, and survey review decisions are server-enforced, but
  applicant field history is not versioned.
- **The mirror sync queue is in-memory only.** If the phone page closes
  with pending mirrors, the queue is lost — but the next load's drift
  check flags those records as missing or stale, so the failure surfaces
  again on the next sign-in.

## 5. Retention decision needed (Joel)

Three things need Joel's call in the console; no code in this PR touches
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
3. **Legacy in-doc event notes.** `events` and `eventResults` documents
   written before this PR may still carry `notes` / `resultNotes` in the
   parent doc, which the kiosk role can read. The editor shows those
   values as a fallback until they are removed, so do not delete them
   until the notes have been moved: open each affected event in the
   editor and save it once (the save writes the note into the private
   subcollection and leaves the in-doc value untouched), then delete just
   the `notes` / `resultNotes` fields from the parent docs in the console
   (the console bypasses the client-side freeze, same as item 1). After
   that the notes live only in the reader-only subcollections.

## 6. Interaction with PR #32 / PR #36 (Enlisted folder)

PR #32 merged into main (9611a1f) and its follow-up fix merged as PR #36
(265ec32); this branch is rebased onto 265ec32. The mirror copies
`archived`, `archiveFolder`, and `statusStage`, so the kiosk mission count
(`countEnlisted`) and the iPad mission totals work from mirrors exactly as
they did from full documents. (`archivedFiscalYear` is no longer mirrored
— see section 1; Previous FY grouping is editor-only and never needed the
kiosk copy.)

The #32 follow-up bug (changing an Enlisted-folder applicant to another
stage via the phone stage rail preserved `archiveFolder: 'enlisted'`, and
the iPad's territory/mission counting classified by `statusStage` only)
is fixed on main by PR #36: the save handler clears the folder on a stage
change away from Enlisted, and the iPad + kiosk territory counting is
folder-aware. This branch keeps both sides of that fix (the rebase
preserved #36's `enlistedUnfileUpdate` logic alongside the mirror writes).

## 7. Tests

- `scripts/smoke.mjs`: `sanitizeForKiosk` allowlist (exact 14 keys, all
  sensitive fields dropped, including the cut `archivedFiscalYear`),
  mirror comparison with timestamp tolerance, drift detection (missing /
  stale / extra), the mirror sync queue (failure recording, retry with
  fresh data, markFailed/clear), flag validation, legacy-field detection,
  notes keyword screen, and static checks that kiosk files contain no PII
  references and read `kioskApplicants`, that the editor routes mirror
  writes through the queue, that event notes live in the private
  subcollection, and that the calendar workflow redacts sensitive
  summaries.
- `scripts/ipad-smoke.mjs`: 22 synthetic tests, including a poll that
  reads only `kioskApplicants`, a card that never renders a note or
  waiver type even when the fixture carries them, and two sensitive-event
  tests (the calendar parser drops a DUI hearing and a probation-office
  check-in; the events slide drops a sensitive event and a sensitive
  result).
- `scripts/ipad-browser-smoke.mjs`: Playwright fixture updated to the
  sanitized collection; asserts no note/waiver rendering.
- `security/muse/tests/rules.test.mjs` (emulator, CI only — 29 tests):
  kiosk reads mirrors but not applicants/notes/survey data (including no
  list access to `surveyLeadImports` and no access to event-notes
  subcollections); kiosk still reads events, results, mission, and the
  daily reminder; mirror key-whitelist enforcement (including owner
  rejection of phone/email/flags/notes and of the cut
  `archivedFiscalYear`); syncer/reviewer mirror ID fences; `/access`
  deny-all for every client role; event-notes subcollections
  (reader-only, attributed writes, parent-doc note freeze, legacy in-doc
  notes survive edits); tri-state flag validation; legacy freeze
  (create/update rejection, legacy-doc edit still allowed, frozen values
  read back unchanged after edits, assistant clear attempts rejected).
- The Firestore emulator cannot run on the development VM (sandbox RSTs
  loopback HTTP/2), so the rules suite is authoritative only in CI.
