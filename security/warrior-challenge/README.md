# Warrior Challenge in the PIBASE Firebase project

Prepared 2026-10-31 for `pi-base-a3a09`, using the existing `(default)` Firestore
database and Authentication service. This is repository preparation, NOT a live
deployment or an assertion about current project billing or deployed Rules.

## Data and permissions

Warrior data lives only under `warriorChallenges/{competitionId}`: teams, events,
members, journal, and future approved controls/publications. PIBASE keeps its
existing applicants, nested notes, recruiting events, eventResults and settings.
There is no participant/applicant data copy and no new Firebase database.

PIBASE authorization remains `access/{uid}`. Warrior authorization is
`warriorChallenges/{competitionId}/members/{uid}`. A Warrior scorer/admin has
zero PIBASE access unless the owner separately creates a PIBASE access record.
A PIBASE owner/assistant/kiosk has no Warrior role until explicitly enrolled.
Use separate volunteer accounts; never lend the recruiting owner login.

Canonical shared Rules: `security/muse/firestore.rules`, already selected by the
root firebase.json. Root firestore.rules is now an exact safe mirror; an emulator
test prevents drift. The old signed-in-only root policy has been removed because
it would let any Warrior account access recruiting records if accidentally used.
All existing PIBASE role restrictions are retained. New Warrior helpers are
prefixed `wc` to avoid collisions with PIBASE's `active` and other functions.

Warrior's repo includes an exact copy for emulator tests. Any future rule change
must keep both repos aligned and pass both suites; never deploy its earlier
standalone M1 Rules into PIBASE (that would deny all recruiting access).

## Activation gate — do not skip on a live recruiting project

1. Save the currently deployed Rules privately and compare them to this shared
   candidate. We inspected repository main `1a28b17e2f51006a040a4f852f2d2a73460100be`,
   NOT the console's deployed version. Reconcile any live-only changes first.
2. Confirm every phone owner and kiosk already has the correct enabled PIBASE
   `access/{uid}` document. See `security/muse/README.md`. If live Rules are still
   the old permissive policy, deploying strict Rules before enrollment will
   interrupt those devices. Do not loosen Rules to hide missing enrollment.
3. Check the console billing plan and usage. Same database means shared quota;
   if PIBASE is Blaze, adding a collection does not give Warrior an independent
   Spark/no-billing boundary. Do not change billing automatically. Project plan,
   live usage and App Check enforcement have not been inspected here.
4. Obtain owner approval for the exact live shared-Rules release and run the
   emulator suites. Then deploy ONLY Rules from PIBASE, with explicit target:
   `firebase deploy --project pi-base-a3a09 --only firestore:rules`.
   This command is documented for that approved step; it has not been executed.
5. Verify phone reads/writes, enrolled kiosk reads, assistant restrictions and
   volunteer denial of recruiting data using a synthetic record. Preserve the
   current site/hosting target. This change does not deploy or replace a site.
6. Through controlled owner console setup, pre-create dedicated email/password
   Warrior accounts and only their Warrior membership records. Never run the
   emulator seed against PIBASE or grant volunteers `access` records.
7. When authorized for a live PRACTICE setup, create a `practice` competition,
   synthetic roster/events and memberships using the contract in Warrior repo.
   The app still supports only the M1 practice slice; official capture is denied.
8. Build Warrior separately using its documented PIBASE target. Use a distinct
   app URL/origin for operational clarity, and verify Auth authorized domains and
   any App Check requirements before sign-in. No hosting target was created here.

Do not roll back to the legacy allow-any-authenticated policy while Warrior
accounts exist. Rollback should preserve PIBASE strict access and deny the
Warrior namespace until reviewed, rather than weakening recruiting protection.
No automatic rollback script is supplied because deployed state is unverified.

## Tests

Existing 11 PIBASE emulator cases remain; four new cases cover both access
directions, explicit dual membership/revocation, and root/canonical Rules parity.
The Warrior suite also validates its journal under this exact combined policy.
Only synthetic demo emulator projects are used. Live phone/kiosk checks remain
pending; emulator results cannot certify current production enrollment.

Actual local validation on 2026-10-31: 15 PIBASE Rules cases passed using the
existing SDK 11.10.0 suite and CLI 15.34.2 / Java 21; Warrior shared-Rules suite
9 passed, unit 10 passed, local-store integration 7 passed, Chromium 5 passed.
PIBASE helper/PWA/reminder smoke scripts passed. Both Warrior default and explicit
PIBASE-target builds passed. The configured CI retains its pinned CLI 14.17.0;
remote CI results must be checked separately. WebKit/physical devices and live
phone/kiosk enrollment were not tested. No production command was executed.
