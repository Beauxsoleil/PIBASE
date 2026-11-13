// CI smoke test for pibase-util.js — no browser or Firebase required.
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Minimal DOM shim so escapeHtml works under Node.
globalThis.document = {
  createElement() {
    return {
      set textContent(v) { this._v = v; },
      get innerHTML() {
        return String(this._v ?? '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }
    };
  }
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const util = await import(join(root, 'pibase-util.js'));

// Archive compatibility: missing is active; either modern boolean or legacy
// folder metadata is archived.
assert.strictEqual(util.isArchived({ name: 'Active' }), false);
assert.strictEqual(util.isArchived({ archived: false, archiveFolder: null }), false);
assert.strictEqual(util.isArchived({ archived: true }), true);
assert.strictEqual(util.isArchived({ archived: false, archiveFolder: 'previousFY' }), true);

// Enlisted-stage applicants are archived too: they live in the Enlisted
// folder, never in the active lists, even if the record predates the folder.
assert.strictEqual(util.isArchived({ statusStage: 'Enlisted' }), true);
assert.strictEqual(util.isArchived({ statusStage: 'Q&E' }), false);

// Enlisted-folder membership: filed in the folder, or at the Enlisted stage
// unless deliberately filed in Cowards / Previous FY (placement wins).
assert.strictEqual(util.isEnlisted({ archiveFolder: 'enlisted', statusStage: 'Enlisted' }), true);
assert.strictEqual(util.isEnlisted({ statusStage: 'Enlisted' }), true);
assert.strictEqual(util.isEnlisted({ archiveFolder: 'enlisted', statusStage: 'Q&E' }), true);
assert.strictEqual(util.isEnlisted({ archiveFolder: 'cowards', statusStage: 'Enlisted' }), false);
assert.strictEqual(util.isEnlisted({ archiveFolder: 'previousFY', statusStage: 'Enlisted' }), false);
assert.strictEqual(util.isEnlisted({ statusStage: 'Q&E' }), false);
assert.strictEqual(util.isEnlisted({}), false);
assert.strictEqual(util.countEnlisted([
  { statusStage: 'Enlisted' },
  { archiveFolder: 'enlisted', statusStage: 'Enlisted' },
  { archiveFolder: 'cowards', statusStage: 'Enlisted' },
  { statusStage: 'Q&E' },
]), 2);

// Filing decision: files new/active/legacy records; never overrides a
// deliberate Cowards / Previous FY placement; preserves an existing stamp.
assert.strictEqual(util.enlistedFileUpdate({ archiveFolder: 'cowards', statusStage: 'Q&E' }), null);
assert.strictEqual(util.enlistedFileUpdate({ archiveFolder: 'previousFY', statusStage: 'Enlisted' }), null);
assert.deepStrictEqual(util.enlistedFileUpdate(null), { archived: true, archiveFolder: 'enlisted', archivedAt: null, previousStage: null, archivedFiscalYear: null });
const filed = util.enlistedFileUpdate({ statusStage: 'Q&E', archivedAt: '2026-11-01' });
assert.strictEqual(filed.archived, true);
assert.strictEqual(filed.archiveFolder, 'enlisted');
assert.strictEqual(filed.archivedAt, '2026-11-01');
assert.strictEqual(filed.previousStage, 'Q&E');
assert.strictEqual(filed.archivedFiscalYear, null);
assert.strictEqual(util.enlistedFileUpdate({ archiveFolder: 'enlisted', statusStage: 'Enlisted', previousStage: 'Q&E' }).previousStage, 'Q&E');
// Legacy Enlisted-stage record with no folder is filed on save.
assert.strictEqual(util.enlistedFileUpdate({ statusStage: 'Enlisted' }).archiveFolder, 'enlisted');

// Restore: returns the previous stage, never re-files into Enlisted.
assert.strictEqual(util.restoreStageFor({ statusStage: 'Enlisted', previousStage: 'Q&E' }), 'Q&E');
assert.strictEqual(util.restoreStageFor({ statusStage: 'Enlisted', previousStage: 'Enlisted' }), 'Q&E');
assert.strictEqual(util.restoreStageFor({ statusStage: 'Enlisted' }), 'Q&E');
assert.strictEqual(util.restoreStageFor({ statusStage: 'Q&E' }), 'Q&E');
assert.strictEqual(util.restoreStageFor({ archiveFolder: 'cowards', statusStage: 'Packet Prep' }), 'Packet Prep');
assert.strictEqual(util.restoreStageFor({}), undefined);

// Review flags are derived from the last update, with a precise 30-day
// boundary and a createdAt fallback for legacy applicants.
const now = Date.UTC(2026, 8, 8, 12);
const daysAgo = days => ({ seconds: Math.floor((now - days * 86_400_000) / 1000) });
assert.strictEqual(util.applicantNeedsReview({ updatedAt: daysAgo(29) }, now), false);
assert.strictEqual(util.applicantNeedsReview({ updatedAt: daysAgo(30) }, now), true);
assert.strictEqual(util.applicantStaleDays({ updatedAt: daysAgo(45) }, now), 45);
assert.strictEqual(util.applicantNeedsReview({ createdAt: daysAgo(31) }, now), true);
assert.strictEqual(util.applicantNeedsReview({}, now), false);

// escapeHtml
assert.strictEqual(util.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(util.escapeHtml(null), '');
assert.strictEqual(util.escapeHtml('a&b'), 'a&amp;b');

// unfoldICS — only continuation lines (leading space/tab) are folded.
assert.strictEqual(util.unfoldICS('A\r\n B\r\nC'), 'AB\r\nC');
assert.strictEqual(util.unfoldICS('X\n Y\nZ'), 'XY\nZ');

// unescapeICS
assert.strictEqual(util.unescapeICS('a\\nb\\,c\\;d\\\\e'), 'a b,c;d\\e');

// parseICSDate — UTC
assert.strictEqual(util.parseICSDate('20260624T170000Z').toISOString(), '2026-06-24T17:00:00.000Z');
// parseICSDate — naive local wall-clock
const local = util.parseICSDate('20260624T110000');
assert.strictEqual(local.getFullYear(), 2026);
assert.strictEqual(local.getHours(), 11);
// parseICSDate — all-day DATE
const allDay = util.parseICSDate('20260624');
assert.strictEqual(allDay.getFullYear(), 2026);
assert.strictEqual(allDay.getMonth(), 5);
assert.strictEqual(allDay.getDate(), 24);
// parseICSDate — invalid
assert.strictEqual(util.parseICSDate('garbage'), null);
assert.strictEqual(util.parseICSDate(''), null);

// parseICS with a small fixture
const fixture = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTSTART:20260901T230000Z',
  'DTEND:20260902T020000Z',
  'SUMMARY:Ice Breaker / BBQ',
  'UID:1A2B3C4D-1234-5678',
  'LOCATION:Hotel\\, Downtown',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');
const events = util.parseICS(fixture);
assert.strictEqual(events.length, 1);
assert.strictEqual(events[0].summary, 'Ice Breaker / BBQ');
assert.strictEqual(events[0].location, 'Hotel, Downtown');
assert.strictEqual(events[0].uid, '1A2B3C4D-1234-5678');
assert.strictEqual(events[0].start.toISOString(), '2026-09-01T23:00:00.000Z');

// calendarEventKey — UID-based, stable, Firestore-safe doc id
const key = util.calendarEventKey(events[0]);
assert.ok(key.startsWith('1A2B3C4D-1234-5678'), `key should use UID, got ${key}`);
assert.ok(key.endsWith('20260901'), `key should embed the start date, got ${key}`);
assert.ok(!key.includes('/'), 'key must not contain "/"');
assert.ok(key.length > 0 && key.length <= 480, 'key length sane');
// no UID -> falls back to summary/location, still non-empty and safe
const noUid = util.calendarEventKey({ summary: 'Career Fair', location: 'Gym', start: events[0].start });
assert.ok(noUid.length > 0 && !noUid.includes('/'));

// toDateInput
assert.strictEqual(util.toDateInput(new Date(2026, 8, 5)), '2026-09-05');
assert.strictEqual(util.toDateInput('invalid'), '');

// Integration: the committed calendar parses to valid events.
const ics = await readFile(join(root, 'calendar.ics'), 'utf8');
const committed = util.parseICS(ics);
assert.ok(committed.length > 0, 'committed calendar.ics should contain events');
for (const e of committed) assert.ok(!Number.isNaN(e.start.getTime()), 'event must have a valid start');

// ---- Privacy hardening: sanitized kiosk data --------------------------
// sanitizeForKiosk keeps exactly the 15 allowlisted fields and drops
// everything sensitive, even when the source record carries it.
const fullApplicant = {
  id: 'a1', name: 'Jane Doe', statusStage: 'Q&E', age: 22,
  generalArea: 'Twin Falls', priorService: 'None', educationLevel: 'HS',
  nextAction: 'Call back', nextActionDate: '2026-11-20', precedence: 'high',
  updatedAt: { seconds: 1700000000 }, createdAt: { seconds: 1690000000 },
  archived: false, archiveFolder: null, archivedFiscalYear: null,
  updatedBy: 'uid-owner',
  phone: '208-555-0100', email: 'jane@example.com',
  medicalIssueFlag: 'yes', legalIssueFlag: 'no',
  physicalHealth: 'asthma, inhaler', legalIssues: 'DUI 2024',
  waiverType: 'Medical', waiverStatus: 'Approved', latestNote: 'called mom',
  tattoosBrandsPiercings: 'sleeve', maritalStatus: 'Single', dependents: 1,
  source: 'SURVEY', surveyResponseId: 'resp-1', recruiterSlug: 'joel',
  school: 'TFHS', previousStage: 'Packet Prep', archivedAt: null,
  restoredAt: null, flagNeedsReview: true, notes: [{ text: 'secret' }]
};
const mirror = util.sanitizeForKiosk(fullApplicant);
assert.deepStrictEqual(Object.keys(mirror).sort(), [...util.KIOSK_APPLICANT_FIELDS].sort());
assert.strictEqual(util.KIOSK_APPLICANT_FIELDS.length, 15);
assert.strictEqual(mirror.name, 'Jane Doe');
assert.strictEqual(mirror.statusStage, 'Q&E');
assert.strictEqual(mirror.updatedBy, 'uid-owner');
assert.strictEqual(mirror.precedence, 'high');
for (const dropped of ['phone', 'email', 'medicalIssueFlag', 'legalIssueFlag',
  'physicalHealth', 'legalIssues', 'waiverType', 'waiverStatus', 'latestNote',
  'tattoosBrandsPiercings', 'maritalStatus', 'dependents', 'source',
  'surveyResponseId', 'recruiterSlug', 'school', 'previousStage',
  'archivedAt', 'restoredAt', 'flagNeedsReview', 'notes', 'id']) {
  assert.ok(!(dropped in mirror), `mirror must not carry ${dropped}`);
}
// Defaults for missing fields; never mutates the source.
const emptyMirror = util.sanitizeForKiosk({});
assert.strictEqual(emptyMirror.name, '');
assert.strictEqual(emptyMirror.statusStage, null);
assert.strictEqual(emptyMirror.precedence, 'normal');
assert.strictEqual(emptyMirror.archived, false);
assert.strictEqual(emptyMirror.updatedAt, null);
mirror.name = 'Changed';
assert.strictEqual(fullApplicant.name, 'Jane Doe');

// Tri-state issue flags: only yes / no / unknown, or null for legacy.
for (const v of [null, undefined, 'yes', 'no', 'unknown']) assert.strictEqual(util.isValidIssueFlag(v), true);
for (const v of ['', 'maybe', 'Yes', true, 0]) assert.strictEqual(util.isValidIssueFlag(v), false);

// Legacy free-text detection: presence only, never the content.
assert.strictEqual(util.hasLegacySensitiveFields({ physicalHealth: 'asthma' }), true);
assert.strictEqual(util.hasLegacySensitiveFields({ legalIssues: 'DUI' }), true);
assert.strictEqual(util.hasLegacySensitiveFields({ physicalHealth: '   ' }), false);
assert.strictEqual(util.hasLegacySensitiveFields({ physicalHealth: null }), false);
assert.strictEqual(util.hasLegacySensitiveFields({ medicalIssueFlag: 'yes' }), false);
assert.strictEqual(util.hasLegacySensitiveFields({}), false);
assert.strictEqual(util.hasLegacySensitiveFields(null), false);

// Notes keyword screen: a speed bump, not a guarantee.
for (const text of ['He was diagnosed with asthma', 'takes medication daily',
  'arrested last year', 'DUI in 2024', 'failed drug test', 'on probation',
  'seeing a therapist', 'PTSD screening', 'prescribed insulin']) {
  assert.strictEqual(util.containsSensitiveNotePattern(text), true, `should flag: ${text}`);
}
for (const text of ['Called to schedule MEPS', 'Great attitude, wants 11B',
  'Follow up next Tuesday', 'lives in Twin Falls', '', 'No issues, all good']) {
  assert.strictEqual(util.containsSensitiveNotePattern(text), false, `should not flag: ${text}`);
}

// Static checks: kiosk screens must not render applicant PII, and the
// kiosk must read the sanitized collection, not full applicants.
const displayHtml = await readFile(join(root, 'display.html'), 'utf8');
for (const leak of ['a.phone', 'a.email', 'waiverType', 'latestNote', 'resultNotes',
  'physicalHealth', 'legalIssues', 'medicalIssueFlag', 'legalIssueFlag']) {
  assert.ok(!displayHtml.includes(leak), `display.html must not reference ${leak}`);
}
assert.ok(displayHtml.includes("collection(db,'kioskApplicants')"), 'display.html must read kioskApplicants');
assert.ok(!displayHtml.includes("collection(db,'applicants')"), 'display.html must not read applicants');
const ipadHtml = await readFile(join(root, 'ipad.html'), 'utf8');
for (const leak of ['waiverType', 'latestNote', 'resultNotes', 'physicalHealth', 'legalIssues']) {
  assert.ok(!ipadHtml.includes(leak), `ipad.html must not reference ${leak}`);
}
assert.ok(ipadHtml.includes("readCollection,'kioskApplicants'"), 'ipad.html must poll kioskApplicants');
assert.ok(!ipadHtml.includes("readCollection,'applicants'"), 'ipad.html must not poll applicants');
const eventsUi = await readFile(join(root, 'events-ui.js'), 'utf8');
assert.ok(!eventsUi.includes('resultNotes'), 'events-ui.js must not render resultNotes');
assert.ok(eventsUi.includes('window.__PIBASE_APPLICANTS__'), 'territory must read applicant globals');
const fbConfig = await readFile(join(root, 'firebase-config.js'), 'utf8');
assert.ok(!fbConfig.includes('enableIndexedDbPersistence'), 'Firestore persistence must stay disabled');
assert.ok(fbConfig.includes('writeKioskMirror'), 'firebase-config.js must expose writeKioskMirror');
assert.ok(fbConfig.includes('rebuildKioskMirrors'), 'firebase-config.js must expose rebuildKioskMirrors');
const pwaRuntime = await readFile(join(root, 'pwa-runtime.js'), 'utf8');
assert.ok(pwaRuntime.includes('records stay available until you close the app'), 'offline message must describe memory-only cache');
assert.ok(!pwaRuntime.includes('cached data remains available'), 'stale offline message must be gone');
const kioskRuntime = await readFile(join(root, 'kiosk-runtime.js'), 'utf8');
assert.ok(!kioskRuntime.includes('Cached data'), 'kiosk offline label must not promise disk-cached data');
assert.ok(kioskRuntime.includes('No data until reconnected'), 'kiosk must say plainly when offline with no data');
const indexHtml = await readFile(join(root, 'index.html'), 'utf8');
for (const marker of ['writeKioskMirror', 'rebuildKioskMirrors', 'legacySensitiveNotice',
  'containsSensitiveNotePattern', 'updatedBy:auth.currentUser']) {
  assert.ok(indexHtml.includes(marker), `index.html must include ${marker}`);
}
assert.ok(!indexHtml.includes('physicalHealth') && !indexHtml.includes('legalIssues'),
  'index.html must not read or write legacy free-text fields');

// Rules: both copies stay synchronized, and the kiosk collection exists.
const rootRules = await readFile(join(root, 'firestore.rules'), 'utf8');
const museRules = await readFile(join(root, 'security/muse/firestore.rules'), 'utf8');
assert.strictEqual(rootRules, museRules, 'firestore.rules copies must stay identical');
for (const marker of ['kioskApplicants', 'validKioskApplicant', 'mirrorAttributed',
  'noNewLegacyFields', 'legacyFieldsUnchanged', "function kiosk()"]) {
  assert.ok(museRules.includes(marker), `firestore.rules must include ${marker}`);
}

console.log(`smoke OK (${committed.length} committed events)`);
