/* Lightweight Thibodeaux companion for the Pi 2 display only.
 * No Firebase listener, applicant data, or invented monthly-goal calculation.
 * The mobile rivalry implementation remains separate.
 */
(function () {
  'use strict';
  if (!/\/display\.html$/.test(location.pathname)) return;
  if (window.__PIBASE_THIBODEAUX_KIOSK__) return;
  window.__PIBASE_THIBODEAUX_KIOSK__ = true;
  var key = 'pibase-thibodeaux-kiosk-visible-v1';
  var hidden = false, frame = -1, tickCount = 0, until = 0, pose = 'idle';
  var mission = { month: '', target: 0, confirmed: 0 };
  var lastStatus = '';
  var lastConfirmed = null;
  var lastMonth = '';
  var lastTarget = 0;
  var assetReady = false;
  var snapshotKey = 'pibase-thibodeaux-kiosk-last-month-v1';
  var finaleKey = 'pibase-thibodeaux-kiosk-finale-v1';
  var prior = null;
  try { prior = JSON.parse(localStorage.getItem(snapshotKey) || 'null'); } catch (e) {}
  var finaleTimer = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var poses = {
    idle: [0], talk: [1, 0], think: [2], work: [3, 4],
    hat: [5, 0], laugh: [6, 0], point: [7, 0],
    sneak: [8, 9], run: [9, 8], win: [10, 6, 10], defeat: [5, 9, 11], catch: [10, 6, 10, 6], sleep: [11]
  };
  try { hidden = localStorage.getItem(key) === 'hidden'; } catch (e) {}
  function setVisible(show) {
    hidden = !show;
    var host = document.getElementById('thibodeauxKiosk');
    var toggle = document.getElementById('thibodeauxKioskToggle');
    if (host) host.hidden = hidden || !assetReady;
    if (toggle) { toggle.textContent = hidden ? 'Show Thibodeaux' : 'Hide'; toggle.setAttribute('aria-label', hidden ? 'Show Thibodeaux' : 'Hide Thibodeaux'); }
    if (hidden) { pose = 'idle'; until = 0; }
    if (assetReady) positionToggle();
    try { localStorage.setItem(key, hidden ? 'hidden' : 'visible'); } catch (e) {}
  }
  function setFrame(n) {
    if (n === frame) return;
    frame = n;
    var el = document.getElementById('thibodeauxKioskSprite');
    if (!el) return;
    el.style.backgroundPosition = (n % 4 * 100 / 3) + '% ' + (Math.floor(n / 4) * 50) + '%';
  }
  function play(name, ms) {
    if (hidden || !poses[name]) return;
    pose = name;
    until = Date.now() + (ms || 2200);
    tickCount = 0;
    if (!reduced) setFrame(poses[name][0]);
  }
  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function rivalryStatus() {
    if (mission.month !== currentMonth() || mission.target <= 0) return 'unconfigured';
    if (mission.confirmed >= mission.target) return 'achieved';
    var d = new Date();
    var days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var urgency = Math.min(1, (Math.max(0, mission.target - mission.confirmed) / mission.target) *
      (0.35 + 0.65 * d.getDate() / days));
    return urgency >= 0.65 ? 'risk' : urgency >= 0.35 ? 'close' : 'track';
  }
  function saveSnapshot() {
    if (mission.month !== currentMonth() || mission.target <= 0) return;
    prior = {month:mission.month, target:mission.target, confirmed:mission.confirmed};
    try { localStorage.setItem(snapshotKey, JSON.stringify(prior)); } catch (e) {}
  }
  function previousMonth() {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  function playFinale(kind, month) {
    var identity = month + ':' + kind;
    try {
      if (localStorage.getItem(finaleKey) === identity) return;
      localStorage.setItem(finaleKey, identity);
    } catch (e) {}
    if (hidden || reduced || !assetReady) return;
    play(kind === 'catch' ? 'catch' : 'defeat', 4200);
    if (window.Boudreaux && window.Boudreaux.play)
      window.Boudreaux.play(kind === 'catch' ? 'think' : 'celebrate', 4200);
    if (finaleTimer) window.clearTimeout(finaleTimer);
    finaleTimer = window.setTimeout(function () { finaleTimer = 0; }, 4200);
  }
  function checkMonthEnd() {
    if (!prior || !/^\\d{4}-\\d{2}$/.test(prior.month)) return;
    if (prior.month === currentMonth()) return;
    // Only close the immediately preceding month; older saved state is stale.
    if (prior.month === previousMonth() && prior.target > 0)
      playFinale(prior.confirmed >= prior.target ? 'win' : 'catch', prior.month);
    prior = null;
    try { localStorage.removeItem(snapshotKey); } catch (e) {}
  }
  function updateRivalry() {
    checkMonthEnd();
    var status = rivalryStatus();
    var host = document.getElementById('thibodeauxKiosk');
    if (!host) return;
    var badge = document.getElementById('thibodeauxKioskMission');
    if (badge) {
      badge.hidden = status === 'unconfigured';
      badge.textContent = status === 'achieved' ? 'GOAL MET' :
        status === 'unconfigured' ? '' : Math.max(0, mission.target - mission.confirmed) + ' TO GO';
    }
    // Keep Thibodeaux on the left side of the display. Only change position
    // on mission updates or calendar changes; never animate CSS layout per tick.
    var shift = status === 'risk' ? 22 : status === 'close' ? 12 : 0;
    // Keep the character in the left half; avoid the right-side mascot and TV edge.
    var width = window.innerWidth || document.documentElement.clientWidth || 1024;
    var spriteWidth = width <= 1100 ? 100 : 144;
    var wanted = 10 + width * shift / 100;
    host.style.left = Math.max(8, Math.min(wanted, width / 2 - spriteWidth - 12)) + 'px';
    positionToggle();
    var confirmedIncrease = lastMonth === mission.month && lastTarget === mission.target &&
      lastConfirmed !== null && mission.confirmed > lastConfirmed;
    if (lastStatus !== status) {
      if (status === 'achieved' && confirmedIncrease) {
        play('think', 2600);
        if (window.Boudreaux && window.Boudreaux.play) window.Boudreaux.play('celebrate', 2600);
      } else if (status === 'risk') play('sneak', 2400);
    }
    // A confirmed count increase is an explicit event, unlike a page refresh.
    if (confirmedIncrease && mission.month === currentMonth() && status !== 'achieved') play('think', 1800);
    lastConfirmed = mission.month === currentMonth() ? mission.confirmed : null;
    lastMonth = mission.month;
    lastTarget = mission.target;
    lastStatus = status;
    saveSnapshot();
  }
  function positionToggle() {
    var host = document.getElementById('thibodeauxKiosk');
    var button = document.getElementById('thibodeauxKioskToggle');
    if (!host || !button) return;
    // Anchor the control above both the sprite and its optional mission badge.
    // The mascot moves with the rivalry, so a fixed CSS offset is insufficient.
    var rect = host.getBoundingClientRect();
    var badge = document.getElementById('thibodeauxKioskMission');
    var badgeHeight = badge && !badge.hidden ? badge.offsetHeight + 5 : 0;
    var top = Math.max(6, rect.top - badgeHeight - button.offsetHeight - 7);
    button.style.top = top + 'px';
    button.style.bottom = 'auto';
    button.style.left = Math.max(6, rect.left) + 'px';
  }
  function init() {
    if (document.getElementById('thibodeauxKiosk')) return;
    var style = document.createElement('style');
    style.textContent =
      '#thibodeauxKiosk{position:fixed;left:18px;bottom:54px;width:144px;height:144px;z-index:15;pointer-events:none;user-select:none}' +
      '#thibodeauxKiosk[hidden]{display:none!important}' +
      '#thibodeauxKioskMission{position:absolute;left:0;bottom:100%;background:#17231f;color:#e4c47c;border:1px solid #826b3c;border-radius:4px;padding:4px 6px;font:11px monospace;white-space:nowrap}' +
      '#thibodeauxKioskMission[hidden]{display:none!important}' +
      '#thibodeauxKioskSprite{width:100%;height:100%;background-image:url("./assets/thibideaux-sprites.webp");background-size:400% 300%;background-repeat:no-repeat}' +
      '#thibodeauxKioskToggle{position:fixed;left:8px;top:8px;z-index:40;background:#17231f;color:#e4c47c;border:1px solid #826b3c;border-radius:5px;padding:6px 8px;font:11px monospace;cursor:pointer}' +
      '@media(max-width:1100px){#thibodeauxKiosk{width:100px;height:100px;left:10px;bottom:45px}}' +
      '@media(max-height:500px){#thibodeauxKiosk{width:80px;height:80px;bottom:42px}}' +
      '@media(max-width:700px){#thibodeauxKiosk,#thibodeauxKioskToggle{display:none!important}}' +
      '@media print{#thibodeauxKiosk,#thibodeauxKioskToggle{display:none!important}}';
    document.head.appendChild(style);
    var host = document.createElement('aside');
    host.id = 'thibodeauxKiosk';
    host.setAttribute('aria-hidden', 'true');
    var sprite = document.createElement('div');
    sprite.id = 'thibodeauxKioskSprite';
    host.appendChild(sprite);
    var badge = document.createElement('div');
    badge.id = 'thibodeauxKioskMission'; badge.hidden = true;
    host.appendChild(badge);
    document.body.appendChild(host);
    var button = document.createElement('button');
    button.id = 'thibodeauxKioskToggle';
    button.type = 'button';
    button.addEventListener('click', function () { setVisible(hidden); });
    document.body.appendChild(button);
    setFrame(0);
    host.hidden = true;
    var probe = new Image();
    probe.onload = function () { assetReady = true; setVisible(!hidden); positionToggle(); };
    probe.onerror = function () { assetReady = false; host.hidden = true; button.hidden = true; };
    probe.src = './assets/thibideaux-sprites.webp';
    window.addEventListener('pibase:thibodeaux-mission', function (event) {
      var data = event.detail || {};
      mission = { month: String(data.month || ''), target: Math.max(0, Number(data.target) || 0),
        confirmed: Math.max(0, Number(data.confirmed) || 0) };
      updateRivalry();
    });
    // Keyboard fallback for kiosk installations with a keyboard but no mouse.
    document.addEventListener('keydown', function (event) {
      if (event.altKey && (event.key === 't' || event.key === 'T')) {
        event.preventDefault();
        setVisible(hidden);
      }
    });
    window.addEventListener('resize', updateRivalry);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) updateRivalry(); });
    updateRivalry();
    window.addEventListener('pibase:screen-change', function () { play('point', 1800); });
    window.addEventListener('offline', function () { play('think', 2400); });
    window.addEventListener('online', function () { play('hat', 1800); });
    window.setInterval(function () {
      if (hidden || !assetReady || document.hidden) return;
      var detail = document.getElementById('detailView');
      host.style.visibility = detail && detail.classList.contains('open') ? 'hidden' : 'visible';
      if (reduced) { setFrame(0); return; }
      tickCount++;
      if (Date.now() >= until) pose = 'idle';
      var sequence = poses[pose];
      setFrame(sequence[tickCount % sequence.length]);
    }, 750);
    window.setInterval(updateRivalry, 60000);
    window.ThibodeauxKiosk = {
      play: play,
      hide: function () { setVisible(false); },
      show: function () { setVisible(true); }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
