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

// "YYYY-MM-DD" -> local-midnight Date, or null when malformed/empty.
export function parseDateOnly(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
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
        start: parseICSDate(get('DTSTART')),
        end: parseICSDate(get('DTEND'))
      };
    })
    .filter(e => e.start);
}
