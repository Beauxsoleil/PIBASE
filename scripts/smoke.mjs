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

console.log(`smoke OK (${committed.length} committed events)`);
