// PIBASE shared helpers — loaded as an ES module by index.html (edit),
// display.html (kiosk) and events.html. Keep these pure and DOM-free except
// for escapeHtml, which is safe to call in any browser context.

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

// US fiscal year: October 1 (month index 9) starts the next FY.
export function currentFiscalYear() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

export function timestampMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export const REVIEW_STALE_DAYS = 30;

// Applicants become review candidates only after their last meaningful update
// is 30 full days old. Fall back to createdAt for legacy records; if neither
// timestamp exists, do not show a misleading stale flag.
export function applicantStaleDays(applicant, now = Date.now()) {
  const updated = timestampMillis(applicant?.updatedAt)
    || timestampMillis(applicant?.createdAt);
  if (!updated) return 0;
  return Math.max(0, Math.floor((now - updated) / 86_400_000));
}

export function applicantNeedsReview(applicant, now = Date.now()) {
  return applicantStaleDays(applicant, now) >= REVIEW_STALE_DAYS;
}

// Missing flags are active by default. Legacy archive-folder records remain
// archived even if they predate the explicit boolean field.
export function isArchived(applicant) {
  return applicant?.archived === true || Boolean(applicant?.archiveFolder) || applicant?.statusStage === 'Enlisted';
}

// Enlisted-folder membership, shared by the phone list, the kiosk mission
// count, and the territory screen: filed in the Enlisted folder, or at the
// Enlisted stage unless deliberately filed in Cowards / Previous FY. (A
// deliberate folder placement always wins over the stage.)
export function isEnlisted(applicant) {
  return applicant?.archiveFolder === 'enlisted'
    || (applicant?.statusStage === 'Enlisted'
      && applicant?.archiveFolder !== 'cowards'
      && applicant?.archiveFolder !== 'previousFY');
}

export function countEnlisted(applicants) {
  return (applicants || []).filter(isEnlisted).length;
}

// Filing decision for the Enlisted folder, shared by the phone editor's save
// path so the rule is unit-tested in one place. Returns the archive fields to
// merge into the save payload, or null when the applicant is deliberately
// filed elsewhere (Cowards / Previous FY keep their folder even at the
// Enlisted stage). archivedAt is null when the caller must stamp it, and
// previousStage is null for a brand-new applicant with no prior stage.
export function enlistedFileUpdate(previous) {
  if (previous?.archiveFolder && previous.archiveFolder !== 'enlisted') return null;
  return {
    archived: true,
    archiveFolder: 'enlisted',
    archivedAt: previous?.archivedAt ?? null,
    previousStage: previous ? (previous.previousStage || previous.statusStage || 'Q&E') : null,
    archivedFiscalYear: null,
  };
}

// Unfiling decision: when an Enlisted-folder applicant is edited to a
// non-Enlisted stage, clear the folder fields so stage and folder cannot
// disagree (updateDoc is a partial update, so omitting them would preserve
// the stale filing). Staying at the Enlisted stage keeps the folder.
// Cowards / Previous FY folders are deliberate placements and are never
// cleared by a stage edit. previousStage is cleared too: it records the
// stage before enlistment, and once unfiled it is stale — a later re-file
// then records the then-current stage instead. Returns the archive fields
// to merge into the save payload, or null.
export function enlistedUnfileUpdate(previous, newStage) {
  if (newStage === 'Enlisted' || previous?.archiveFolder !== 'enlisted') return null;
  return {
    archived: false,
    archiveFolder: null,
    archivedAt: null,
    previousStage: null,
    archivedFiscalYear: null,
  };
}

// Stage an enlisted applicant returns to on restore: their previous stage
// when it was a real recruiting stage, otherwise Q&E (the stage before
// enlistment). Never returns 'Enlisted', so a restore cannot re-file.
// Returns undefined when there is no stage to restore (the caller omits it).
export function restoreStageFor(applicant) {
  if (applicant?.statusStage === 'Enlisted') {
    const prev = applicant?.previousStage;
    return prev && prev !== 'Enlisted' ? prev : 'Q&E';
  }
  return applicant?.statusStage || undefined;
}

// ---- Kiosk privacy: sanitized applicant data ---------------------------
// The Pi kiosk and legacy iPad display only ever need the fields below.
// Everything else (contact details, medical/legal flags, waiver data,
// notes, tattoos, marital/dependent data, survey provenance) stays in the
// full applicant document, which kiosk authentication cannot read.
// Keep this list in sync with validKioskApplicant() in firestore.rules
// and with the kioskApplicants tests.
//
// Minimization notes (Nov 2026 review): archivedFiscalYear was dropped —
// no kiosk screen reads it (Previous FY grouping is editor-only).
// updatedBy stays because the rules use it to attribute mirror writes
// (mirrorAttributed); it is never rendered. age, priorService, and
// educationLevel stay because both kiosk card layouts render them.
export const KIOSK_APPLICANT_FIELDS = [
  'name', 'statusStage', 'age', 'generalArea', 'priorService',
  'educationLevel', 'nextAction', 'nextActionDate', 'precedence',
  'updatedAt', 'createdAt', 'archived', 'archiveFolder',
  'updatedBy'
];

// Build the sanitized kiosk copy of an applicant: only allowlisted fields,
// never a reference to the source object. Missing fields resolve to the
// neutral value the kiosk screens already handle ('' / null / false).
// updatedAt is always present on a written mirror (the caller stamps it);
// createdAt may be null for legacy records.
export function sanitizeForKiosk(applicant) {
  const a = applicant || {};
  return {
    name: a.name ?? '',
    statusStage: a.statusStage ?? null,
    age: a.age ?? null,
    generalArea: a.generalArea ?? '',
    priorService: a.priorService ?? '',
    educationLevel: a.educationLevel ?? '',
    nextAction: a.nextAction ?? '',
    nextActionDate: a.nextActionDate ?? '',
    precedence: a.precedence ?? 'normal',
    updatedAt: a.updatedAt ?? null,
    createdAt: a.createdAt ?? null,
    archived: a.archived === true,
    archiveFolder: a.archiveFolder ?? null,
    updatedBy: a.updatedBy ?? ''
  };
}

// Display fields compared when deciding whether a mirror is in sync.
// updatedBy is attribution, not display data, and is excluded; timestamps
// are compared separately with a tolerance (see mirrorMatchesApplicant).
const MIRROR_DISPLAY_FIELDS = ['name', 'statusStage', 'age', 'generalArea',
  'priorService', 'educationLevel', 'nextAction', 'nextActionDate',
  'precedence', 'archived', 'archiveFolder'];

// True when a stored mirror shows the same data as the applicant.
// Timestamps compare with a tolerance: the applicant save and its mirror
// write resolve independent serverTimestamp() sentinels, so they differ
// by seconds even on a healthy save. Five minutes is far above that
// skew and far below the 30-day Review window the timestamps drive.
// Extra keys on an old mirror (e.g. a field cut from the allowlist later)
// do not count as drift: the kiosk ignores unknown fields, and the next
// save or rebuild rewrites the mirror without them.
export function mirrorMatchesApplicant(mirror, applicant, toleranceMs = 300000) {
  if (!mirror || !applicant) return false;
  const m = sanitizeForKiosk(mirror);
  const a = sanitizeForKiosk(applicant);
  for (const key of MIRROR_DISPLAY_FIELDS) {
    if (m[key] !== a[key]) return false;
  }
  for (const key of ['updatedAt', 'createdAt']) {
    const mt = timestampMillis(m[key]);
    const at = timestampMillis(a[key]);
    if (mt === 0 && at === 0) continue;
    if (Math.abs(mt - at) > toleranceMs) return false;
  }
  return true;
}

// Compare a loaded applicant list against stored mirrors (both plain
// arrays of {id, ...}). Returns {checked, mirrorCount, missing, stale,
// extra}: missing = applicant with no mirror (e.g. a SURVEY lead created
// by the external worker before it learned to mirror), stale = mirror
// exists but its content is behind, extra = mirror with no applicant
// (orphan; mirrors are never deleted client-side, so an extra needs a
// console delete — it is reported, never auto-fixed).
export function findMirrorDrift(applicants, mirrors) {
  const apps = Array.isArray(applicants) ? applicants : [];
  const mirs = Array.isArray(mirrors) ? mirrors : [];
  const byId = new Map();
  for (const m of mirs) if (m?.id) byId.set(m.id, m);
  const missing = [];
  const stale = [];
  const seen = new Set();
  for (const a of apps) {
    if (!a?.id) continue;
    seen.add(a.id);
    const m = byId.get(a.id);
    if (!m) missing.push(a.id);
    else if (!mirrorMatchesApplicant(m, a)) stale.push(a.id);
  }
  const extra = [];
  for (const id of byId.keys()) if (!seen.has(id)) extra.push(id);
  return { checked: seen.size, mirrorCount: byId.size, missing, stale, extra };
}

// ---- Mirror sync queue --------------------------------------------------
// A failed mirror write must be detectable and recoverable, not a silent
// console warning. The queue records failures (in memory only — never
// persisted, so no applicant PII is written to storage), notifies the UI
// through onChange, and retries with fresh applicant data when asked.
// The write function is injected so the queue stays pure and unit-testable;
// firebase-config.js wires it to writeKioskMirror and dispatches a
// 'pibase:mirror-sync' DOM event from onChange.
export function createMirrorSyncQueue({ write, onChange } = {}) {
  const pending = new Map(); // id -> {data, attempts, lastError, lastTry}
  const notify = () => {
    if (typeof onChange !== 'function') return;
    try { onChange(status()); } catch (_) { /* UI listener must never break sync */ }
  };
  function status() {
    return { pending: [...pending.keys()], count: pending.size };
  }
  // Best-effort mirror write: resolves even on failure (a failed mirror
  // must never fail the applicant save that triggered it).
  async function request(id, data) {
    if (!id) return;
    try {
      await write(id, data);
      if (pending.delete(id)) notify();
    } catch (error) {
      const prev = pending.get(id);
      pending.set(id, {
        data,
        attempts: (prev?.attempts || 0) + 1,
        lastError: error?.code || 'unknown',
        lastTry: Date.now()
      });
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('PIBASE kiosk mirror update failed — retry from the applicant list.', error);
      }
      notify();
    }
  }
  // Retry every pending mirror. resolveData(id) returns the current
  // applicant record when available, so a retry never overwrites a mirror
  // with data made stale by a later edit; without fresh data the failed
  // snapshot is retried as-is.
  async function retry(resolveData, uid) {
    let repaired = 0;
    let failed = 0;
    for (const id of [...pending.keys()]) {
      const entry = pending.get(id);
      if (!entry) continue;
      const fresh = typeof resolveData === 'function' ? resolveData(id) : null;
      const data = fresh
        ? { ...fresh, updatedBy: uid || fresh.updatedBy || '' }
        : entry.data;
      try {
        await write(id, data);
        pending.delete(id);
        repaired++;
      } catch (error) {
        entry.attempts++;
        entry.lastError = error?.code || 'unknown';
        entry.lastTry = Date.now();
        failed++;
      }
    }
    notify();
    return { repaired, failed };
  }
  // Record a failure without attempting a write (used by the rebuild
  // fallback when a single-document retry fails).
  function markFailed(id, data, error) {
    if (!id) return;
    const prev = pending.get(id);
    pending.set(id, {
      data,
      attempts: (prev?.attempts || 0) + 1,
      lastError: error?.code || 'unknown',
      lastTry: Date.now()
    });
    notify();
  }
  // Clear pending entries: all of them, or just the given ids (a
  // successful rebuild clears the ids it rewrote).
  function clear(ids) {
    if (ids === undefined) pending.clear();
    else for (const id of ids) pending.delete(id);
    notify();
  }
  return { request, retry, status, clear, markFailed };
}

// ---- Medical / legal tri-state flags ------------------------------------
// The editor stores only yes / no / unknown. Legacy records predate the
// flags and carry null until first edited; null is valid, anything else
// is not. Mirrors validApplicant() in firestore.rules.
export const ISSUE_FLAG_VALUES = ['yes', 'no', 'unknown'];

export function isValidIssueFlag(value) {
  return value == null || ISSUE_FLAG_VALUES.includes(value);
}

// True when a legacy applicant still carries free-text medical or legal
// narrative. The editor no longer shows or edits these fields; the value
// is preserved untouched until the approved retention process removes it.
export function hasLegacySensitiveFields(applicant) {
  const physical = applicant?.physicalHealth;
  const legal = applicant?.legalIssues;
  return (typeof physical === 'string' && physical.trim().length > 0)
    || (typeof legal === 'string' && legal.trim().length > 0);
}

// ---- Notes hygiene ------------------------------------------------------
// Keyword screen for the notes box: a speed bump, not a guarantee. It
// cannot catch paraphrases, abbreviations, or sensitive detail that
// avoids these words, so it only prompts a confirm dialog; the recruiter
// can still save. Never use this list to block a save outright.
const SENSITIVE_NOTE_WORDS = [
  // Medical
  'diagnos', 'medication', 'prescri', 'dosage', 'surgery', 'therapist',
  'psychiatr', 'psycholog', 'adhd', 'asthma', 'diabetes', 'seizure',
  'depression', 'anxiety', 'ptsd', 'bipolar', 'insulin', 'inhaler',
  // Legal
  'arrest', 'convict', 'felony', 'misdemeanor', 'probation', 'parole',
  'jail', 'prison', 'dui', 'dwi', 'lawsuit', 'warrant', 'theft',
  'assault', 'burglary', 'robbery', 'drug', 'marijuana', 'cocaine'
];
const SENSITIVE_NOTE_PATTERN = new RegExp(
  `\\b(${SENSITIVE_NOTE_WORDS.join('|')})\\w*\\b`, 'i');

export function containsSensitiveNotePattern(text) {
  return SENSITIVE_NOTE_PATTERN.test(String(text || ''));
}

// "YYYY-MM-DD" -> local-midnight Date, or null when malformed/empty.
export function parseDateOnly(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date -> local "YYYY-MM-DD" string for <input type="date"> values.
export function toDateInput(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Stable Firestore doc id for a parsed iCloud calendar event. UID (when the
// feed provides one) survives renames/moves; otherwise we fall back to the
// event identity. Start date is appended so recurring-series instances stay
// distinct.
export function calendarEventKey(event) {
  const start = event.start ? toDateInput(event.start).replace(/-/g, '') : 'nodate';
  const idPart = (event.uid || '').trim() || `${event.summary || 'event'}|${event.location || ''}`;
  const raw = `${idPart}|${start}`;
  const safe = raw.replace(/[^a-zA-Z0-9._@+-]/g, '_');
  return safe.slice(0, 480);
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Firestore timestamp -> compact display string ('' when unset).
export function formatTime(ts) {
  return ts?.toDate
    ? ts.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
}

/* ---------------- iCalendar parsing ---------------- */

// Undo RFC 5545 line folding (continuation lines start with a space/tab).
export function unfoldICS(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

// Undo the escaping the sync workflow emits for SUMMARY/LOCATION.
export function unescapeICS(value) {
  return (value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Parse a DTSTART/DTEND value. The sync workflow emits UTC ("...Z"); the
// legacy TZID=America/Boise files and all-day DATE values are still handled:
// a Z suffix is parsed as UTC, a bare datetime as local wall-clock time.
export function parseICSDate(value) {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    return new Date(Number(v.slice(0, 4)), Number(v.slice(4, 6)) - 1, Number(v.slice(6, 8)));
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00', z] = m;
  return z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

// Parse an unfolded .ics body into {summary, location, start, end} events.
export function parseICS(text) {
  const clean = unfoldICS(text);
  const blocks = clean
    .split('BEGIN:VEVENT')
    .slice(1)
    .map(x => x.split('END:VEVENT')[0]);
  return blocks
    .map(block => {
      const lines = block.split(/\r?\n/);
      const get = name => {
        const line = lines.find(l => l.startsWith(name + ':') || l.startsWith(name + ';'));
        return line ? line.slice(line.indexOf(':') + 1) : '';
      };
      return {
        summary: unescapeICS(get('SUMMARY')) || 'Untitled event',
        location: unescapeICS(get('LOCATION')),
        uid: (get('UID') || '').trim(),
        start: parseICSDate(get('DTSTART')),
        end: parseICSDate(get('DTEND'))
      };
    })
    .filter(e => e.start);
}
