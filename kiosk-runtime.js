export function initKioskRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!/\/display\.html$/.test(window.location.pathname)) return;
  if (window.__PIBASE_KIOSK_RUNTIME__) return;
  window.__PIBASE_KIOSK_RUNTIME__ = true;

  const state = {
    online: navigator.onLine,
    applicants: Array.isArray(window.__PIBASE_APPLICANTS__) ? 'cache' : 'loading',
    calendar: 'loading',
    errors: 0,
    lastInteraction: Date.now(),
    recoveryPending: false
  };

  const style = document.createElement('style');
  style.textContent = `
    #pibaseBoot{position:fixed;inset:0;z-index:1000;background:var(--bg,#0D1210);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono,monospace);transition:opacity .16s linear}
    #pibaseBoot.done{opacity:0;pointer-events:none}
    .pibase-boot-card{width:min(430px,80vw);border:1px solid var(--line-bright,#3D4C41);background:var(--surface,#1A231D);padding:24px;border-radius:8px}
    .pibase-boot-title{font-size:1rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text,#E9E6DC);margin-bottom:16px}
    .pibase-boot-row{display:flex;justify-content:space-between;gap:20px;padding:8px 0;border-top:1px solid var(--line,#2A362E);font-size:.7rem;color:var(--text-muted,#8FA096)}
    .pibase-boot-state{color:var(--brass,#C6A15B)}
    #pibaseStatusStrip{position:fixed;left:14px;bottom:10px;z-index:45;display:flex;align-items:center;gap:8px;min-height:34px;padding:0 10px;border:1px solid var(--line,#2A362E);border-radius:5px;background:rgba(20,27,23,.94);font-family:var(--font-mono,monospace);font-size:.56rem;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#8FA096)}
    #pibaseStatusStrip .dot{width:7px;height:7px;border-radius:50%;background:var(--teal,#4FA88A)}
    #pibaseStatusStrip.degraded .dot{background:var(--brass,#C6A15B)}
    #pibaseStatusStrip.offline .dot{background:var(--rust,#C1543E)}
    #pibaseScreenIndicator{position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:45;min-height:34px;display:flex;align-items:center;padding:0 11px;border:1px solid var(--line,#2A362E);border-radius:5px;background:rgba(20,27,23,.94);font-family:var(--font-mono,monospace);font-size:.58rem;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted,#8FA096)}
    @media(max-width:1100px){
      .board{padding:14px 16px 50px!important}
      .board-header{grid-template-columns:minmax(225px,.9fr) minmax(260px,1.15fr) minmax(160px,.75fr)!important;gap:14px!important;margin-bottom:12px!important;padding-bottom:10px!important}
      .board-header .seal{width:46px!important;height:46px!important}.board-header h1{font-size:1.55rem!important}.verse-banner{font-size:.52rem!important}.board-header .count{font-size:.78rem!important}.clock{font-size:.72rem!important}
      .grid{grid-template-columns:repeat(auto-fill,minmax(285px,1fr))!important;gap:10px!important}
      .card{padding:12px 14px!important}.card-top .name{font-size:1rem!important}.meta-line{margin-bottom:9px!important}
      .today-layout{grid-template-columns:minmax(0,1.15fr) minmax(290px,.85fr)!important;gap:12px!important}
      .pipeline-layout{grid-template-columns:minmax(285px,.85fr) minmax(0,1.45fr)!important;gap:12px!important}
      .calendar-layout{grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:5px!important}.day-column{padding:8px 6px!important}.calendar-event{padding:6px 0!important}.calendar-event-title{font-size:.68rem!important}.calendar-event-location{font-size:.58rem!important}
      .panel{padding:13px 14px!important}.pipeline-row{grid-template-columns:140px 38px minmax(0,1fr)!important;gap:8px!important}.pipeline-stage{font-size:.58rem!important}.mission-number{font-size:3rem!important}
    }
    @media(max-height:720px){
      .board{padding-top:10px!important}.board-header{margin-bottom:8px!important;padding-bottom:8px!important}.kiosk-hint{margin-top:4px!important;min-height:14px!important}
      .panel{padding-top:10px!important;padding-bottom:10px!important}.panel-head{padding-bottom:8px!important}.agenda-row,.action-row{padding:8px 0!important}.metric-strip{margin-top:8px!important}.mission-stats{margin-top:10px!important;gap:9px!important}
    }
  `;
  document.head.appendChild(style);

  const installUi = () => {
    if (!document.body) return;
    if (!document.getElementById('pibaseBoot')) {
      const boot = document.createElement('div');
      boot.id = 'pibaseBoot';
      boot.innerHTML = `<div class="pibase-boot-card"><div class="pibase-boot-title">PIBASE Initializing</div><div class="pibase-boot-row"><span>Network</span><span class="pibase-boot-state" data-boot="network">Checking</span></div><div class="pibase-boot-row"><span>Applicants</span><span class="pibase-boot-state" data-boot="applicants">Loading</span></div><div class="pibase-boot-row"><span>Calendar</span><span class="pibase-boot-state" data-boot="calendar">Loading</span></div></div>`;
      document.body.appendChild(boot);
      // A kiosk must always fail open. Even if one data source never answers,
      // never leave a human trapped behind the initialization overlay.
      setTimeout(() => dismissBoot(true), 5000);
    }
    if (!document.getElementById('pibaseStatusStrip')) {
      const status = document.createElement('div');
      status.id = 'pibaseStatusStrip';
      status.innerHTML = '<span class="dot"></span><span id="pibaseStatusText">Connecting</span>';
      document.body.appendChild(status);
    }
    if (!document.getElementById('pibaseScreenIndicator')) {
      const indicator = document.createElement('div');
      indicator.id = 'pibaseScreenIndicator';
      indicator.textContent = '1 / 6 · Applicant Board';
      document.body.appendChild(indicator);
    }
    renderStatus();
    updateScreenIndicator();
  };

  if (document.body) installUi();
  else document.addEventListener('DOMContentLoaded', installUi, { once: true });

  const setBoot = (key, value) => {
    const el = document.querySelector(`[data-boot="${key}"]`);
    if (el) el.textContent = value;
  };

  function dismissBoot(force = false) {
    const boot = document.getElementById('pibaseBoot');
    if (!boot || boot.classList.contains('done')) return;
    const usableApplicants = state.applicants === 'ready' || state.applicants === 'cache';
    const usableCalendar = state.calendar === 'ready' || !state.online;
    if (!force && !(usableApplicants && usableCalendar)) return;
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 220);
  }

  function renderStatus() {
    const strip = document.getElementById('pibaseStatusStrip');
    const text = document.getElementById('pibaseStatusText');
    if (!strip || !text) return;
    strip.classList.remove('offline', 'degraded');
    let label = 'Online · Data live';
    if (!state.online) { strip.classList.add('offline'); label = 'Offline · Cached data'; }
    else if (state.applicants !== 'ready' || state.calendar !== 'ready') { strip.classList.add('degraded'); label = 'Online · Syncing'; }
    if (state.calendar === 'error') label += ' · Calendar retry';
    text.textContent = label;
    setBoot('network', state.online ? 'Online' : 'Offline');
    setBoot('applicants', state.applicants === 'ready' ? 'Ready' : state.applicants === 'cache' ? 'Cached' : state.applicants === 'error' ? 'Retrying' : 'Loading');
    setBoot('calendar', state.calendar === 'ready' ? 'Ready' : state.calendar === 'error' ? 'Retrying' : 'Loading');
    dismissBoot(false);
  }

  function updateScreenIndicator() {
    const indicator = document.getElementById('pibaseScreenIndicator');
    if (!indicator) return;
    const detail = document.getElementById('detailView');
    if (detail?.classList.contains('open')) { indicator.textContent = 'Applicant Detail'; return; }
    const order = [
      ['boardScreen', 'Applicant Board'], ['todayScreen', 'Today'], ['calendarScreen', 'Calendar'],
      ['pipelineScreen', 'Pipeline / Mission'], ['eventsScreen', 'Recruiting Events'], ['territoryScreen', 'Territory Analytics']
    ];
    const index = order.findIndex(([id]) => document.getElementById(id)?.classList.contains('active'));
    const resolved = index >= 0 ? index : 0;
    indicator.textContent = `${resolved + 1} / ${order.length} · ${order[resolved][1]}`;
  }

  const scheduleIndicator = () => requestAnimationFrame(updateScreenIndicator);
  document.addEventListener('keydown', scheduleIndicator, true);
  document.addEventListener('click', scheduleIndicator, true);
  window.addEventListener('pibase:screen-change', scheduleIndicator);

  const noteInteraction = () => { state.lastInteraction = Date.now(); };
  document.addEventListener('keydown', noteInteraction, { passive: true });
  document.addEventListener('pointerdown', noteInteraction, { passive: true });
  const idleFor = ms => Date.now() - state.lastInteraction >= ms;
  const safeReload = reason => {
    if (state.recoveryPending) return;
    state.recoveryPending = true;
    const attempt = () => { if (idleFor(60_000)) window.location.reload(); else setTimeout(attempt, 60_000); };
    console.warn('PIBASE scheduled recovery reload:', reason);
    setTimeout(attempt, 15_000);
  };

  window.addEventListener('online', () => { const wasOffline = !state.online; state.online = true; renderStatus(); if (wasOffline) safeReload('connection restored'); });
  window.addEventListener('offline', () => { state.online = false; renderStatus(); dismissBoot(true); });
  window.addEventListener('pibase:firebase-status', e => { const value = e.detail?.state || 'ready'; state.applicants = value === 'cache' ? 'cache' : value === 'error' ? 'error' : 'ready'; renderStatus(); });
  window.addEventListener('pibase:applicants-snapshot', () => { state.applicants = state.online ? 'ready' : 'cache'; renderStatus(); });

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const isCalendar = /calendar\.ics(?:\?|$)/.test(url);
    try {
      const response = await nativeFetch(...args);
      if (isCalendar) { state.calendar = response.ok ? 'ready' : 'error'; renderStatus(); }
      return response;
    } catch (error) {
      if (isCalendar) { state.calendar = 'error'; renderStatus(); retryCalendar(); }
      throw error;
    }
  };

  let calendarRetries = 0;
  function retryCalendar() {
    if (!state.online || calendarRetries >= 3) return;
    calendarRetries++;
    setTimeout(async () => {
      try {
        const res = await nativeFetch('./calendar.ics', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.calendar = 'ready'; renderStatus(); safeReload('calendar recovered');
      } catch (_) { retryCalendar(); }
    }, 15_000 * calendarRetries);
  }

  window.addEventListener('error', () => { state.errors++; if (state.errors >= 3) safeReload('repeated script errors'); });
  window.addEventListener('unhandledrejection', () => { state.errors++; if (state.errors >= 3) safeReload('repeated promise errors'); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(error => console.warn('PIBASE offline cache unavailable', error));
}
