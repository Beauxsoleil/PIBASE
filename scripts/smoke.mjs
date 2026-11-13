// CI smoke test for pibase-util.js — no browser or Firebase required.
import assert from 'node:assert';
import { readFile, stat } from 'node:fs/promises';
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

// Unfiling decision: editing an Enlisted-folder applicant to a non-Enlisted
// stage clears the folder (a partial updateDoc would otherwise preserve the
// stale filing); staying Enlisted keeps it; Cowards / Previous FY placements
// and unfiled records are untouched.
assert.deepStrictEqual(util.enlistedUnfileUpdate({ archiveFolder: 'enlisted', statusStage: 'Enlisted', archived: true, archivedAt: '2026-11-01', previousStage: 'Q&E', archivedFiscalYear: 2027 }, 'Q&E'), { archived: false, archiveFolder: null, archivedAt: null, previousStage: null, archivedFiscalYear: null });
assert.strictEqual(util.enlistedUnfileUpdate({ archiveFolder: 'enlisted', statusStage: 'Enlisted' }, 'Enlisted'), null);
assert.strictEqual(util.enlistedUnfileUpdate({ archiveFolder: 'cowards', statusStage: 'Q&E' }, 'Q&E'), null);
assert.strictEqual(util.enlistedUnfileUpdate({ archiveFolder: 'previousFY', statusStage: 'Q&E' }, 'Q&E'), null);
assert.strictEqual(util.enlistedUnfileUpdate({ statusStage: 'Q&E' }, 'Q&E'), null);
assert.strictEqual(util.enlistedUnfileUpdate(null, 'Q&E'), null);

// Save-path wiring: the phone editor clears the Enlisted folder when the
// stage moves away from Enlisted, and the kiosk territory screen counts by
// folder, not by stage alone.
const indexHtml = await readFile(join(root, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('enlistedUnfileUpdate(previous,payload.statusStage)'), 'save handler must unfile on a stage change away from Enlisted');
const eventsUi = await readFile(join(root, 'events-ui.js'), 'utf8');
assert.ok(eventsUi.includes("if(isEnlisted(a))enlisted++;else active++;"), 'territory aggregate must count by folder, not stage');
assert.ok(eventsUi.includes("if(isEnlisted(a))return'Enlisted';"), 'territory matrix must group by folder, not stage');

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
// sanitizeForKiosk keeps exactly the 11 allowlisted fields and drops
// everything sensitive, even when the source record carries it.
// archivedFiscalYear was cut from the allowlist in Nov 2026: no kiosk
// screen reads it (Previous FY grouping is editor-only). age,
// priorService, and educationLevel were cut in Nov 2026 too: neither
// kiosk card layout renders them anymore. generalArea stays only for
// the iPad's aggregate territory counts.
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
assert.strictEqual(util.KIOSK_APPLICANT_FIELDS.length, 11);
assert.strictEqual(mirror.name, 'Jane Doe');
assert.strictEqual(mirror.statusStage, 'Q&E');
assert.strictEqual(mirror.generalArea, 'Twin Falls');
assert.strictEqual(mirror.updatedBy, 'uid-owner');
assert.strictEqual(mirror.precedence, 'high');
for (const dropped of ['phone', 'email', 'medicalIssueFlag', 'legalIssueFlag',
  'physicalHealth', 'legalIssues', 'waiverType', 'waiverStatus', 'latestNote',
  'tattoosBrandsPiercings', 'maritalStatus', 'dependents', 'source',
  'surveyResponseId', 'recruiterSlug', 'school', 'previousStage',
  'archivedAt', 'restoredAt', 'flagNeedsReview', 'notes', 'id',
  'archivedFiscalYear', 'age', 'priorService', 'educationLevel']) {
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

// Mirror comparison: content equality with timestamp tolerance, and the
// drift report that powers the SURVEY reconcile path (a lead created by
// the external sync worker has no mirror, so it shows up as `missing`).
const t1 = { seconds: 1700000000 };
const t2 = { seconds: 1700000060 }; // 60s later — same save, separate sentinels
const tOld = { seconds: 1690000000 };
const appA = { id: 'a1', name: 'Jane Doe', statusStage: 'Q&E', age: 22, generalArea: 'Twin Falls', updatedAt: t1, createdAt: tOld, archived: false, archiveFolder: null };
const appB = { id: 'b2', name: 'John Smith', statusStage: 'New Lead', updatedAt: t1, createdAt: t1 };
assert.strictEqual(util.mirrorMatchesApplicant({ ...appA, updatedAt: t2 }, appA), true, 'sentinel skew within tolerance must match');
assert.strictEqual(util.mirrorMatchesApplicant({ ...appA, updatedAt: tOld }, appA), false, 'stale timestamp must not match');
assert.strictEqual(util.mirrorMatchesApplicant({ ...appA, name: 'Janet Doe' }, appA), false, 'changed name must not match');
assert.strictEqual(util.mirrorMatchesApplicant({ ...appA, archivedFiscalYear: 2026 }, appA), true, 'extra key on an old mirror must not count as drift');
// A SURVEY-written mirror still carries the pre-cut fields (age,
// priorService, educationLevel) until the worker is updated; those
// extra keys must not flag the mirror as stale.
const surveyMirror = { id: 'a1', name: 'Jane Doe', statusStage: 'Q&E', age: 22, generalArea: 'Twin Falls', priorService: 'None', educationLevel: 'HS', updatedAt: t2, createdAt: tOld, archived: false, archiveFolder: null };
assert.strictEqual(util.mirrorMatchesApplicant(surveyMirror, appA), true, 'SURVEY mirror with cut fields must not count as drift');
const appWithoutCutFields = { id: 'a1', name: 'Jane Doe', statusStage: 'Q&E', generalArea: 'Twin Falls', updatedAt: t1, createdAt: tOld, archived: false, archiveFolder: null };
assert.strictEqual(util.mirrorMatchesApplicant(surveyMirror, appWithoutCutFields), true, 'SURVEY mirror with fields the applicant lacks must not count as drift');
assert.strictEqual(util.mirrorMatchesApplicant(null, appA), false);
assert.strictEqual(util.mirrorMatchesApplicant(appA, null), false);
const drift = util.findMirrorDrift([appA, appB], [{ ...appA, updatedAt: t2 }, { id: 'orphan', name: 'Ghost' }]);
assert.deepStrictEqual(drift, { checked: 2, mirrorCount: 2, missing: ['b2'], stale: [], extra: ['orphan'] });
const driftStale = util.findMirrorDrift([appA], [{ ...appA, name: 'Janet Doe' }]);
assert.deepStrictEqual(driftStale.stale, ['a1']);
assert.deepStrictEqual(util.findMirrorDrift([], []), { checked: 0, mirrorCount: 0, missing: [], stale: [], extra: [] });

// Mirror sync queue: failures are recorded and retried, never silent.
{
  const seen = [];
  const realWarn = console.warn;
  console.warn = () => {}; // the queue's diagnostic warn is expected here
  try {
    const queue = util.createMirrorSyncQueue({
      write: async (id, data) => { seen.push(id); if (data.fail) throw Object.assign(new Error('boom'), { code: 'unavailable' }); },
      onChange: () => {}
    });
    await queue.request('ok1', { name: 'Ok' });
    assert.deepStrictEqual(queue.status(), { pending: [], count: 0 });
    await queue.request('bad1', { name: 'Bad', fail: true });
    assert.deepStrictEqual(queue.status(), { pending: ['bad1'], count: 1 });
    // Retry with fresh data repairs it.
    const repaired = await queue.retry((id) => (id === 'bad1' ? { name: 'Bad', fail: false } : null), 'uid-1');
    assert.deepStrictEqual(repaired, { repaired: 1, failed: 0 });
    assert.deepStrictEqual(queue.status(), { pending: [], count: 0 });
    // Retry without fresh data retries the failed snapshot and stays queued.
    await queue.request('bad2', { name: 'Bad2', fail: true });
    const still = await queue.retry(null, 'uid-1');
    assert.deepStrictEqual(still, { repaired: 0, failed: 1 });
    assert.deepStrictEqual(queue.status(), { pending: ['bad2'], count: 1 });
    // markFailed (rebuild fallback) + clear.
    queue.markFailed('bad3', { name: 'Bad3' }, Object.assign(new Error('x'), { code: 'permission-denied' }));
    assert.strictEqual(queue.status().count, 2);
    queue.clear(['bad2']);
    assert.deepStrictEqual(queue.status(), { pending: ['bad3'], count: 1 });
    queue.clear();
    assert.deepStrictEqual(queue.status(), { pending: [], count: 0 });
    assert.ok(seen.includes('ok1') && seen.includes('bad1'));
  } finally {
    console.warn = realWarn;
  }
}

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
  'physicalHealth', 'legalIssues', 'medicalIssueFlag', 'legalIssueFlag',
  'a.age', 'a.generalArea', 'a.priorService', 'a.educationLevel']) {
  assert.ok(!displayHtml.includes(leak), `display.html must not reference ${leak}`);
}
assert.ok(displayHtml.includes("collection(db,'kioskApplicants')"), 'display.html must read kioskApplicants');
assert.ok(!displayHtml.includes("collection(db,'applicants')"), 'display.html must not read applicants');
assert.ok(displayHtml.includes('containsSensitiveNotePattern'), 'display.html must filter sensitive calendar events');
const ipadHtml = await readFile(join(root, 'ipad.html'), 'utf8');
for (const leak of ['waiverType', 'latestNote', 'resultNotes', 'physicalHealth', 'legalIssues',
  'a.age', 'a.priorService', 'a.educationLevel']) {
  assert.ok(!ipadHtml.includes(leak), `ipad.html must not reference ${leak}`);
}
// generalArea survives on the iPad only as the aggregate territory
// count (v.generalArea); no card may render an applicant's area.
assert.ok(!ipadHtml.includes('a.generalArea'), 'ipad.html cards must not render generalArea');
assert.ok(ipadHtml.includes('v.generalArea'), 'ipad.html territory matrix still counts areas in aggregate');
assert.ok(ipadHtml.includes('Applicants by area'), 'ipad.html must keep the territory screen');
assert.ok(ipadHtml.includes("readCollection,'kioskApplicants'"), 'ipad.html must poll kioskApplicants');
assert.ok(!ipadHtml.includes("readCollection,'applicants'"), 'ipad.html must not poll applicants');
assert.ok(ipadHtml.includes('sensitiveEvent'), 'ipad.html must filter sensitive events');
assert.ok(ipadHtml.includes('SENSITIVE_WORDS'), 'ipad.html must carry the sensitive-word list');
assert.ok(!eventsUi.includes('resultNotes'), 'events-ui.js must not render resultNotes');
assert.ok(eventsUi.includes('window.__PIBASE_APPLICANTS__'), 'territory must read applicant globals');
assert.ok(eventsUi.includes('containsSensitiveNotePattern'), 'events-ui.js must filter sensitive events');
const fbConfig = await readFile(join(root, 'firebase-config.js'), 'utf8');
assert.ok(!fbConfig.includes('enableIndexedDbPersistence'), 'Firestore persistence must stay disabled');
assert.ok(fbConfig.includes('writeKioskMirror'), 'firebase-config.js must expose writeKioskMirror');
assert.ok(fbConfig.includes('rebuildKioskMirrors'), 'firebase-config.js must expose rebuildKioskMirrors');
assert.ok(fbConfig.includes('requestMirrorSync'), 'firebase-config.js must expose requestMirrorSync');
assert.ok(fbConfig.includes('checkKioskMirrorDrift'), 'firebase-config.js must expose checkKioskMirrorDrift');
assert.ok(fbConfig.includes('createMirrorSyncQueue'), 'firebase-config.js must wire the mirror sync queue');
assert.ok(fbConfig.includes('pibase:mirror-sync'), 'firebase-config.js must dispatch mirror-sync events');
const eventsHtml = await readFile(join(root, 'events.html'), 'utf8');
assert.ok(eventsHtml.includes('savePrivateNote'), 'events.html must save notes to the private subcollection');
assert.ok(eventsHtml.includes('loadPrivateNote'), 'events.html must load notes from the private subcollection');
assert.ok(eventsHtml.includes("'notes',noteId"), 'events.html must address the notes subcollection');
assert.ok(!eventsHtml.includes("notes:el('eventNotes').value.trim()"), 'events.html must not write notes into the parent event doc');
assert.ok(!eventsHtml.includes('...numbers,resultNotes'), 'events.html must not write resultNotes into the parent doc');
const syncWorkflow = await readFile(join(root, '.github/workflows/sync-calendar.yml'), 'utf8');
assert.ok(syncWorkflow.includes('SENSITIVE_RE'), 'sync-calendar.yml must redact sensitive summaries');
assert.ok(syncWorkflow.includes("'Private event'"), 'sync-calendar.yml must replace sensitive summaries');
const pwaRuntime = await readFile(join(root, 'pwa-runtime.js'), 'utf8');
assert.ok(pwaRuntime.includes('records stay available until you close the app'), 'offline message must describe memory-only cache');
assert.ok(!pwaRuntime.includes('cached data remains available'), 'stale offline message must be gone');
const kioskRuntime = await readFile(join(root, 'kiosk-runtime.js'), 'utf8');
assert.ok(!kioskRuntime.includes('Cached data'), 'kiosk offline label must not promise disk-cached data');
assert.ok(kioskRuntime.includes('No data until reconnected'), 'kiosk must say plainly when offline with no data');
for (const marker of ['requestMirrorSync', 'retryFailedMirrors', 'checkKioskMirrorDrift',
  'mirrorSyncStatus', 'retryMirrorBtn', 'rebuildKioskMirrors', 'legacySensitiveNotice',
  'containsSensitiveNotePattern', 'updatedBy:auth.currentUser']) {
  assert.ok(indexHtml.includes(marker), `index.html must include ${marker}`);
}
assert.ok(!indexHtml.includes('writeKioskMirror('), 'index.html must route mirror writes through the sync queue');
assert.ok(!indexHtml.includes('PIBASE kiosk mirror update failed — rebuild kiosk data'),
  'index.html must not use the old silent mirror-failure warning');
assert.ok(!indexHtml.includes('physicalHealth') && !indexHtml.includes('legalIssues'),
  'index.html must not read or write legacy free-text fields');

// Rules: both copies stay synchronized, and the kiosk collection exists.
const rootRules = await readFile(join(root, 'firestore.rules'), 'utf8');
const museRules = await readFile(join(root, 'security/muse/firestore.rules'), 'utf8');
assert.strictEqual(rootRules, museRules, 'firestore.rules copies must stay identical');
for (const marker of ['kioskApplicants', 'validKioskApplicant', 'mirrorAttributed',
  'noNewLegacyFields', 'legacyFieldsUnchanged', "function kiosk()",
  'match /notes/{noteId}']) {
  assert.ok(museRules.includes(marker), `firestore.rules must include ${marker}`);
}
// The mirror whitelist must not include archivedFiscalYear (still allowed
// on applicants — the freeze list there is separate and must stay).
const mirrorFn = museRules.slice(museRules.indexOf('function validKioskApplicant()'), museRules.indexOf('function mirrorAttributed()'));
assert.ok(!mirrorFn.includes('archivedFiscalYear'), 'validKioskApplicant must not allow archivedFiscalYear');

// ---- Kiosk remote control (PR #43) -----------------------------------
// The phone remote drives the Pi through settings/kioskControl; the
// kiosk listens and switches screens. These are static checks — the
// navigation behavior itself is exercised by kiosk-remote-smoke.mjs,
// imported below so it runs under this same CI step.
const controlSrc = await readFile(join(root, 'kiosk-control.js'), 'utf8');
const swSrc = await readFile(join(root, 'service-worker.js'), 'utf8');
assert.ok(controlSrc.includes("doc(db,'settings','kioskControl')"), 'remote must address settings/kioskControl');
assert.ok(controlSrc.includes("video.addEventListener('error'"), 'video load failure must be surfaced');
assert.ok(controlSrc.includes('__PIBASE_VIDEO_ERROR__'), 'video error flag must exist for diagnosis');
assert.ok(controlSrc.includes('Still sending — will apply when the phone reconnects.'), 'offline send must not hang the button');
assert.ok(controlSrc.includes('video.play().then('), 'successful playback must clear the video error flag');
// Seven screens, same order on both sides of the remote.
assert.ok(controlSrc.includes("['Applicant Board','Today','Calendar','Pipeline / Mission','Recruiting Events','Territory Analytics','Video']"), 'remote labels must list all seven screens');
assert.ok(kioskRuntime.includes("'7 / 7 · Video'"), 'screen indicator must label the video screen');
assert.ok(kioskRuntime.includes('pibaseVideoOverlay'), 'screen indicator must detect the video overlay');
assert.ok(kioskRuntime.includes("'4 / 7 · Pipeline / Mission'"), 'screen indicator default must match the launch screen');
// The remote-screen handler must close any open applicant detail even
// for the extra screens (4/5), or the detail stays open over them.
assert.ok(displayHtml.includes('if(!Number.isInteger(n)||n<0||n>5)return;'), 'remote-screen handler must accept 0-5 and reset the detail view');
// Exiting a remotely selected extra screen must return to a native
// screen through the canonical path, never to a blank kiosk.
assert.ok(eventsUi.includes('lastNativeIndex'), 'events-ui must remember the last native screen');
assert.ok(eventsUi.includes("pibase:remote-screen',{detail:{index:lastNativeIndex}}"), 'extra-screen exit must request the last native screen');
assert.ok(eventsUi.includes('routeOrigin=null'), 'leaving an extra screen must clear the stale route');
// The service worker must serve kiosk-control.js network-first like
// the other app code, and the cache version must match the pin in
// sfs-smoke.mjs.
assert.ok(swSrc.includes('kiosk-control\\.js'), 'service worker must route kiosk-control.js as app code');
assert.ok(swSrc.includes("const CACHE_NAME = 'pibase-app-v43';"), 'service worker cache must be v43');
// Rules: the control document exists, owner-write only, screen 0-6.
assert.ok(museRules.includes('match /settings/kioskControl'), 'rules must cover settings/kioskControl');
assert.ok(museRules.includes('request.resource.data.screen <= 6'), 'rules must bound the screen index');
// The remote loads on the phone editor and the Pi kiosk only — never on
// the legacy iPad, whose ES5 page must not gain module scripts.
assert.ok(indexHtml.includes('<script type="module" src="./kiosk-control.js"></script>'), 'index.html must load the remote');
assert.ok(displayHtml.includes('<script type="module" src="./kiosk-control.js"></script>'), 'display.html must load the remote');
assert.ok(!ipadHtml.includes('kiosk-control.js'), 'ipad.html must not load the remote');
// Companions stay disabled on the kiosk, with source files preserved.
assert.ok(!displayHtml.includes('src="./boudreaux-kiosk.js"'), 'kiosk must not load Boudreaux');
assert.ok(!displayHtml.includes('src="./thibodeaux-kiosk.js"'), 'kiosk must not load Thibodeaux');
for (const companion of ['boudreaux-kiosk.js', 'thibodeaux-kiosk.js', 'boudreaux-mobile.js', 'thibideaux-mobile.js']) {
  assert.ok((await stat(join(root, companion))).size > 0, `${companion} must be preserved`);
}
// The kiosk video asset is in the repo and non-empty.
assert.ok((await stat(join(root, 'assets', 'kiosk-1080p.mp4'))).size > 1000000, 'kiosk-1080p.mp4 must be present');

await import('./kiosk-remote-smoke.mjs');

console.log(`smoke OK (${committed.length} committed events)`);
