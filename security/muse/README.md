# Connect Muse to PIBASE

This is an opt-in replacement for the root Firestore rules. It does not create a
Firebase login, deploy rules, configure Muse's vault, or read live applicant data.
The existing phone and kiosk keep their current behavior until you deploy it.

## Permissions

| Role | Reads | Writes |
| --- | --- | --- |
| Owner | Applicants, notes, events, results, mission | Existing phone operations; no hard deletes |
| Assistant with `read: true` | Entire applicant documents, notes, events, results, mission | None until `write: true` |
| Assistant with both switches | Same reads | Active applicants, new notes, events/results; attribution required |
| Enrolled kiosk UID | Same reads | None |
| Unknown, disabled, or unenrolled anonymous UID | None | None |

Muse cannot archive/restore applicants, edit archived applicants, rewrite existing
notes, change mission settings, modify roles, or hard-delete records. Owner and
assistant identities must not be anonymous. Assistants must use Email/Password.
An assistant can edit all other applicant fields, including sensitive fields.
`updatedBy` records the authenticated UID and `updatedAt` must be a server
timestamp. This identifies the latest writer; it is **not** an immutable audit log
of every applicant or event change.

Reads expose full documents, including health/legal notes and contact details.
Do not grant this access unless that data sharing is appropriate for your work.
If Muse needs only scheduling, use a separate sanitized collection and a
different policy before connecting. Revocation prevents future server access;
it cannot erase records already fetched, cached, or copied by an assistant.
The public `calendar.ics` feed is outside these rules and remains public.

## Setup in the Firebase console

Open https://console.firebase.google.com/project/pi-base-a3a09.

1. **Authentication → Users:** copy the UID of your existing phone login.
2. Open the kiosk on the Pi while it is online. In its browser console evaluate
   `import('./firebase-config.js').then(m => console.log(m.auth.currentUser?.uid))`.
   Copy that UID. This runs on the kiosk itself, not on your phone. If it is
   undefined, wait for sign-in and try again. A UID is an identifier, not a secret.
3. **Firestore Database → Data:** create collection `access`, using your phone
   UID as the document ID. Add `role` (string) = `owner`, `enabled` (boolean) =
   `true`. Repeat for every authorized phone login.
4. Create `access/<KIOSK_UID>` with `role` = `kiosk`, `enabled` = `true`.
   Only provision UIDs you obtained from your own device. The existing anonymous
   kiosk session persists through reloads; clearing browser storage or switching
   browser profiles generates a new UID that must be enrolled again.
5. **Authentication → Sign-in method:** ensure Email/Password is enabled.
   **Authentication → Users → Add user:** create a separate Muse account using an
   email address you control and a unique generated password. Do not reuse your
   personal login. Copy this account's UID.
6. Create `access/<MUSE_UID>` with these typed fields:

   | Field | Type | Initial value |
   | --- | --- | --- |
   | role | string | assistant |
   | enabled | boolean | true |
   | read | boolean | true |
   | write | boolean | false |

7. Wait for the **Muse access rules** GitHub check to pass. Save a private copy of
   your currently deployed rules for rollback. In **Firestore Database → Rules**,
   paste **this directory's `firestore.rules`**, then Publish. The root file is the
   older policy, so do not paste it for this setup.
8. Verify the phone still loads applicants and can save, and the Pi loads its
   live board. An error usually means a missing/mistyped UID or role document.
9. Enter the Muse account credential only through Muse's secure credential-entry
   flow. Confirm Muse supports storing and using a custom Firebase credential;
   general support for secure credentials does not prove this particular flow.
   Never paste a password or token into chat, repo files, GitHub issues, logs,
   screenshots, command-line arguments, or a public code example. Do not give
   Muse a Firebase Admin service-account key; Admin bypasses these rules.
10. Have Muse verify read access. If you want edits, change `write` to boolean
    `true`, then use a clearly labeled synthetic applicant to verify one write
    and a new note. Archive the synthetic applicant yourself afterward. Have
    Muse confirm your approval before editing actual applicant data.

If you prefer CLI deployment after provisioning:

```sh
cd security/muse
firebase deploy --project pi-base-a3a09 --only firestore:rules
```

The root `firebase.json` still deploys the old rules. Once the new policy is
verified, change its rules path to `security/muse/firestore.rules` so later root
deployments cannot revert it accidentally. Do not change that path before the
access documents are provisioned.

## Instructions to give Muse (contains no credentials)

> Use my dedicated Firebase Email/Password identity from your secure credential
> store. Project: pi-base-a3a09. Public Firebase client configuration is in
> firebase-config.js in Beauxsoleil/PIBASE. Use the Firebase client SDK, or the
> Firebase Auth REST API and Firestore REST API with the resulting Firebase ID
> token. Never use Admin SDK credentials or Google service-account tokens.
> Never print or store passwords, ID tokens, or refresh tokens in files or logs.
> Start by confirming read access. Ask me before edits to actual applicant data.
> Every applicant/event/result write must include updatedBy equal to your own
> authenticated UID and updatedAt as serverTimestamp(). For new notes include
> text, createdAt as serverTimestamp(), updatedAt as serverTimestamp(), and
> updatedBy equal to your UID. Notes are append-only. After adding a note, update
> the parent applicant's latestNote and updatedAt, with updatedBy, preferably in
> one client batch. New applicants need name and createdAt as serverTimestamp()
> as well as the attribution fields so the live board orders them correctly.
> Never archive, restore, modify archived applicants, change mission settings,
> delete records, or change permissions. Do not export applicant data to GitHub.
> Stop if permission is denied; do not switch credentials or bypass the rules.

SDK calls must use actual server timestamp sentinels, not timestamp strings.
REST callers should use `documents:commit` with `updateMask` for partial edits
and `updateTransforms` with `setToServerValue: REQUEST_TIME` for timestamp fields.
Use document existence preconditions when updating; avoid blind replacement of
existing applicant documents. A Firebase API key identifies the project and is
not authorization. ID tokens are bearer secrets and normally expire in one hour.

## Revoke access

In Firestore Data, set `access/<MUSE_UID>.enabled` to boolean `false`. Keep that
document, so the disabled state is explicit. Rules recheck it for subsequent
server operations even if an ID token is still valid. Then disable the Firebase
Authentication user. Set only `write: false` if you want reads to continue.
Disabling/deleting the Auth user alone is not a guarantee of immediate rejection
of an already-issued ID token. Cached/copied data remains available to its holder.

## Tests

Tests use synthetic data and the local Firestore emulator only; no production
credentials or applicant data are required.

```sh
cd security/muse/tests
npm install --ignore-scripts
cd ..
npx --yes firebase-tools@14.17.0 emulators:exec --project demo-pibase-muse --only firestore 'npm --prefix tests test'
```

Use Node 22 and Java 21. CI runs these checks for changes to this directory. Tests
cover unknown/disabled identities, enrolled kiosk reads, anonymous write denial,
owner compatibility, optional applicant fields, attribution, append-only notes,
archive restrictions, read-only mode, access escalation, revocation with an
existing client context, and hard-delete denial.

References:
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/security/rules-fields
- https://firebase.google.com/docs/auth/admin/manage-sessions
- https://firebase.google.com/docs/firestore/security/test-rules-emulator
- https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse
