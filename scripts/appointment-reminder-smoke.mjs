import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../appointment-reminder.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
function surface(isKiosk) {
  let now = '2026-10-27T12:00:00Z', authChanged, next, fail, tick, click, activeRef, resolveWrite, rejectWrite;
  let stopped = 0;
  const button = { disabled: false, addEventListener: (_, fn) => { click = fn; } };
  const status = {};
  const panel = { hidden: true, setAttribute() {}, querySelector: q => q === 'button' ? (isKiosk ? null : button) : status };
  const context = vm.createContext({
    Intl, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
    document: { body: { prepend() {} }, head: { appendChild() {} }, getElementById: () => ({ prepend() {} }), createElement: tag => tag === 'section' ? panel : {}, addEventListener() {} },
    window: { addEventListener() {} }, console: { warn() {} }, setInterval: fn => { tick = fn; }
  });
  vm.runInContext(source, context);
  context.initAppointmentReminder({ db: {}, auth: {}, isKiosk,
    doc: (_, collection, id) => collection + '/' + id,
    onAuthStateChanged: (_, fn) => { authChanged = fn; },
    onSnapshot: (ref, options, fn, err) => { activeRef = ref; next = fn; fail = err; return () => { stopped++; }; },
    setDoc: () => new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; })
  });
  return { panel, button, status, context, login: u => authChanged(u), snapshot: (dismissed, pending = false) => next({ exists: () => dismissed !== undefined, data: () => ({ dismissed }), metadata: { hasPendingWrites: pending } }), click: () => click(), resolve: () => resolveWrite(), reject: () => rejectWrite(new Error('offline')), fail: () => fail(new Error('denied')), advance: value => { now = value; tick(); }, ref: () => activeRef, stopped: () => stopped };
}
const phone = surface(false);
phone.login({ isAnonymous: false });
assert.equal(phone.ref(), 'settings/inputAppointments-2026-10-27');
phone.snapshot(undefined);
assert.equal(phone.panel.hidden, false);
assert.equal(phone.button.disabled, false);
let write = phone.click();
phone.snapshot(true, true);
assert.equal(phone.panel.hidden, false);
assert.match(phone.status.textContent, /waiting to sync/);
phone.snapshot(true);
phone.resolve();
await write;
assert.equal(phone.panel.hidden, true);
phone.advance('2026-10-28T06:00:01Z');
assert.equal(phone.ref(), 'settings/inputAppointments-2026-10-28');
phone.snapshot(undefined);
assert.equal(phone.panel.hidden, false);
write = phone.click(); phone.reject(); await write;
assert.match(phone.status.textContent, /failed/);
assert.equal(phone.button.disabled, false);
phone.login(null);
assert.equal(phone.panel.hidden, true);
assert.ok(phone.stopped() >= 2);
phone.login({ isAnonymous: true });
assert.equal(phone.panel.hidden, true);
const kiosk = surface(true);
kiosk.login({ isAnonymous: true });
kiosk.snapshot(undefined);
assert.equal(kiosk.panel.hidden, false);
kiosk.snapshot(true);
assert.equal(kiosk.panel.hidden, true);
kiosk.advance('2026-10-28T06:00:01Z');
kiosk.fail();
assert.equal(kiosk.panel.hidden, false);
assert.match(kiosk.status.textContent, /unavailable/);
// DST fall-back repeats an hour, but not a reminder day.
for (const instant of ['2026-11-01T07:30:00Z', '2026-11-01T08:30:00Z']) {
  assert.equal(kiosk.context.appointmentDay(new Date(instant)), '2026-11-01');
}
assert.equal(kiosk.context.appointmentDay(new Date('2026-10-28T05:59:59Z')), '2026-10-27');
console.log('Appointment reminder smoke OK');
