// One shared calendar day for the phone and kiosk, including DST changes.
export function appointmentDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Boise', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function appointmentDue(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Boise', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).find(part => part.type === 'hour').value;
  return Number(hour) >= 8;
}

export function initAppointmentReminder({ db, auth, isKiosk, doc, onSnapshot, setDoc, onAuthStateChanged }) {
  const host = isKiosk ? document.body : document.getElementById('listScreen');
  if (!host) return;
  const panel = document.createElement('section');
  panel.id = 'appointmentReminder';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Daily appointment reminder');
  panel.innerHTML = isKiosk
    ? '<div class="appointment-warning"><h2>INPUT APPOINTMENTS</h2><p>Dismiss today’s warning from PIBASE on your phone.</p><p class="appointment-status" role="status"></p></div>'
    : '<h2>INPUT APPOINTMENTS</h2><p>Daily kiosk reminder · 8 AM Mountain time</p><button type="button" class="btn btn-secondary">Dismiss for today</button><p class="appointment-status" role="status"></p>';
  host.prepend(panel);
  const style = document.createElement('style');
  style.textContent = `
    #appointmentReminder[hidden]{display:none!important}
    #appointmentReminder{border:2px solid #d9a441;background:var(--surface,#202020);color:var(--text,#fff);border-radius:12px;padding:20px;margin-bottom:18px}
    #appointmentReminder h2{margin:0 0 12px;color:#f1bd54}
    #appointmentReminder p{line-height:1.5}
    #appointmentReminder .appointment-status{font-size:.85rem}
    ${isKiosk ? '#appointmentReminder{position:fixed;inset:0;z-index:1000;margin:0;border-radius:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;text-align:center}.appointment-warning{padding:48px;border:3px solid #d9a441;border-radius:16px;background:#181818;max-width:90vw}#appointmentReminder h2{font-size:clamp(32px,6vw,84px)}#appointmentReminder p{font-size:22px}' : ''}
  `;
  document.head.appendChild(style);
  const button = panel.querySelector('button');
  const status = panel.querySelector('.appointment-status');
  let user = null, day = '', stop = null, generation = 0;
  let loaded = false, dismissed = false, pending = false, failure = '';
  function render() {
    panel.hidden = !appointmentDue() || !user || (!isKiosk && user.isAnonymous) || (loaded && dismissed && !pending);
    if (button) button.disabled = !appointmentDue() || !loaded || pending || dismissed;
    status.textContent = failure || (pending
      ? 'Dismissal waiting to sync. Keep this app open until connected.'
      : !loaded ? 'Checking today’s reminder…' : '');
  }
  function watchDay(force = false) {
    const next = appointmentDay();
    if (!force && day === next) { render(); return; }
    stop?.();
    stop = null;
    const token = ++generation;
    day = next;
    loaded = false;
    dismissed = false;
    pending = false;
    failure = '';
    render();
    if (!user || (!isKiosk && user.isAnonymous)) return;
    // Separate documents prevent yesterday's queued offline dismissal from
    // overwriting today's acknowledgment.
    stop = onSnapshot(doc(db, 'settings', 'inputAppointments-' + day),
      { includeMetadataChanges: true }, snapshot => {
        if (token !== generation) return;
        loaded = true;
        dismissed = snapshot.exists() && snapshot.data().dismissed === true;
        pending = Boolean(snapshot.metadata?.hasPendingWrites);
        failure = '';
        render();
      }, error => {
        if (token !== generation) return;
        failure = 'Reminder sync unavailable. Check your connection and try signing in again.';
        console.warn('Appointment reminder unavailable', error);
        render();
      });
  }
  button?.addEventListener('click', async () => {
    watchDay();
    if (!appointmentDue() || !loaded || pending || dismissed || !user || user.isAnonymous) return;
    const token = generation;
    const dismissedDay = day;
    pending = true;
    failure = '';
    render();
    try {
      await setDoc(doc(db, 'settings', 'inputAppointments-' + dismissedDay), { dismissed: true });
      if (token !== generation) return;
      dismissed = true;
      pending = false;
    } catch (error) {
      if (token !== generation) return;
      pending = false;
      failure = 'Dismissal failed. Check your connection and tap again.';
      console.warn('Appointment dismissal failed', error);
    }
    render();
  });
  onAuthStateChanged(auth, next => { user = next; watchDay(true); });
  // Covers midnight, 8 AM, an overnight sleeping phone, and reconnects.
  setInterval(() => watchDay(), 15000);
  document.addEventListener('visibilitychange', () => watchDay());
  window.addEventListener('focus', () => watchDay());
}
