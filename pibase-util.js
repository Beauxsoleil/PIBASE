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
