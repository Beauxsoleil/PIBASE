/* Boudreaux visual kiosk companion for PIBASE.
 * No network calls, applicant data reads/writes, Firebase dependencies, or external libraries.
 * Include only in display.html (not ipad.html or index.html).
 */
(function () {
  'use strict';
  if (!/\/display\.html$/.test(location.pathname) &&
      !document.documentElement.hasAttribute('data-boudreaux-demo')) return;
  if (window.__PIBASE_BOUDREAUX__) return;
  window.__PIBASE_BOUDREAUX__ = true;

  var sheetUrl = './assets/boudreaux-sprites.webp';
  var cols = 4;
  var preferenceKey = 'pibase-boudreaux-kiosk-visible-v1';
  var hidden = false;
  try { hidden = localStorage.getItem(preferenceKey) === 'hidden'; } catch (e) {}
  function setHidden(value) {
    hidden = !!value;
    var host = document.getElementById('boudreauxCompanion');
    if (host) host.hidden = hidden;
    if (hidden) { animation = null; animationEnd = 0; }
    var restore = document.getElementById('boudreauxRestore');
    if (restore) restore.hidden = !hidden;
    if (restore) restore.textContent = 'Show Boudreaux';
    var hideButton = document.getElementById('boudreauxHide');
    if (hideButton) hideButton.hidden = hidden;
    try { localStorage.setItem(preferenceKey, hidden ? 'hidden' : 'visible'); } catch (e) {}
  }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lastInteraction = Date.now();
  var animation = null;
  var animationEnd = 0;
  var frameIndex = -1;
  var ticks = 0;
  var lastEnlistedIds = null;
  var lastDataReaction = 0;
  var lastWorkReaction = 0;
  var latestDueCount = -1;
  var latestRecords = null;
  var lastDueDay = '';
  var poses = {
    idle: [0],
    talk: [1, 0],
    salute: [5],
    walk: [8, 9],
    point: [7],
    working: [3, 4],
    celebrate: [6, 10],
    think: [2],
    sleepy: [11]
  };

  function init() {
    if (document.getElementById('boudreauxCompanion')) return;
    var style = document.createElement('style');
    style.textContent = '\
      #boudreauxCompanion{position:fixed;right:24px;bottom:55px;z-index:15;width:172px;max-width:25vw;max-height:calc(100vh - 110px);text-align:center;pointer-events:none;user-select:none;opacity:.98}\
      #boudreauxCompanion[hidden]{display:none!important}\
      #boudreauxSprite{width:162px;height:162px;max-width:100%;margin:0 auto;background-repeat:no-repeat;background-image:url("'+sheetUrl+'");background-size:400% 300%;image-rendering:auto}\
      #boudreauxStatus{position:absolute;right:0;bottom:100%;max-width:min(220px,calc(100vw - 24px));min-width:120px;max-height:80px;overflow:hidden;padding:6px 9px;border:1px solid #826b3c;border-radius:5px;background:#17231f;color:#e4c47c;font:12px/1.4 monospace;white-space:normal;text-align:left;box-sizing:border-box}\
      #boudreauxStatus[hidden]{display:none!important}\
      #boudreauxHide{position:fixed;right:8px;bottom:125px;z-index:40;background:rgba(23,35,31,.92);color:#e4c47c;border:1px solid #826b3c;border-radius:5px;padding:6px 8px;font:11px monospace;cursor:pointer}\
      #boudreauxHide[hidden]{display:none!important}\
      #boudreauxRestore{position:fixed;right:8px;bottom:125px;z-index:40;background:#17231f;color:#e4c47c;border:1px solid #826b3c;border-radius:5px;padding:7px 10px;font:12px monospace;cursor:pointer}\
      #boudreauxRestore[hidden]{display:none!important}\
      @media(max-height:500px){#boudreauxHide{bottom:105px}#boudreauxRestore{bottom:105px}}\
      @media(max-height:500px){#boudreauxCompanion{bottom:42px;width:92px}#boudreauxSprite{width:88px;height:88px}#boudreauxStatus{font-size:10px;max-height:46px}}\
      @media(max-width:1100px){#boudreauxCompanion{right:12px;bottom:48px;width:116px}#boudreauxSprite{width:108px;height:108px}}\
      @media(max-width:700px){#boudreauxCompanion{display:none!important}}\
      @media print{#boudreauxCompanion,#boudreauxHide,#boudreauxRestore{display:none!important}}';
    document.head.appendChild(style);
    var host = document.createElement('aside');
    host.id = 'boudreauxCompanion';
    host.setAttribute('aria-hidden', 'true');
    var sprite = document.createElement('div'); sprite.id = 'boudreauxSprite';
    host.appendChild(sprite);
    var status = document.createElement('div');
    status.id = 'boudreauxStatus'; status.hidden = true;
    host.appendChild(status);
    document.body.appendChild(host);
    var restore = document.createElement('button');
    restore.id = 'boudreauxRestore'; restore.type = 'button'; restore.textContent = 'Show Boudreaux';
    restore.addEventListener('click', function () { setHidden(false); });
    document.body.appendChild(restore);
    var hideButton = document.createElement('button');
    hideButton.id = 'boudreauxHide'; hideButton.type = 'button'; hideButton.textContent = 'Hide';
    hideButton.addEventListener('click', function () { setHidden(true); });
    document.body.appendChild(hideButton);
    setHidden(hidden);
    setFrame(0);
    // Optional graceful failure if assets were not uploaded with the JavaScript.
    var probe = new Image();
    probe.onerror = function () { host.hidden = true; hideButton.hidden = true; restore.hidden = true; };
    probe.src = sheetUrl;
    document.addEventListener('keydown', function (event) {
      if (event.altKey && (event.key === 'b' || event.key === 'B')) {
        setHidden(!hidden); return;
      }
      if (event.key && event.key.indexOf('Arrow') === 0) {
        lastInteraction = Date.now(); play('point', 1900);
      }
    });
    document.addEventListener('pointerdown', function (event) {
      lastInteraction = Date.now();
      if (event.target && event.target.closest && event.target.closest('[data-applicant-id]'))
        play('salute', 1500);
    });
    window.addEventListener('pibase:screen-change', function () {
      lastInteraction = Date.now(); play('point', 2000);
    });
    window.addEventListener('pibase:firebase-status', function (event) {
      if (event.detail && event.detail.state === 'error') play('think', 3600);
    });
    window.addEventListener('pibase:applicants-snapshot', function (event) {
      // A Firestore refresh is not an enlistment. Only react to an actual
      // newly observed enlisted record after the first successful snapshot.
      var records = event.detail;
      if (!Array.isArray(records)) return;
      var ids = {};
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (!record || !record.id) continue;
        var stage = String(record.statusStage || '').toLowerCase();
        if (stage === 'enlisted') ids[String(record.id)] = true;
      }
      if (lastEnlistedIds !== null) {
        var newlyEnlisted = false;
        for (var id in ids) {
          if (Object.prototype.hasOwnProperty.call(ids, id) && !lastEnlistedIds[id])
            newlyEnlisted = true;
        }
        if (newlyEnlisted && Date.now() - lastDataReaction > 30000) {
          lastDataReaction = Date.now();
          play('celebrate', 2600);
        }
      }
      lastEnlistedIds = ids;
      latestRecords = records;
      updateDueStatus(true);
    });
    window.addEventListener('offline', function () { play('think', 4000); });
    window.addEventListener('online', function () { play('talk', 2500); });
    // Keep a low fixed animation cadence for the Raspberry Pi 2 CPU/GPU.
    window.setInterval(tick, 650);
    window.Boudreaux = { play: play, hide: function () { setHidden(true); }, show: function () { setHidden(false); } }; // Optional read-only demo or future integrations.
  }

  function updateDueStatus(react) {
    if (!latestRecords) return;
    // Recalculate after midnight even if Firestore has not emitted a new snapshot.
    var now = new Date();
    var day = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
    if (!react && day === lastDueDay) return;
    lastDueDay = day;
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var due = 0;
    for (var j = 0; j < latestRecords.length; j++) {
      var item = latestRecords[j];
      if (!item || !item.nextAction || !/^\d{4}-\d{2}-\d{2}$/.test(item.nextActionDate || '')) continue;
      var parts = item.nextActionDate.split('-');
      var deadline = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      // Reject rolled-over invalid dates, e.g. February 30.
      if (deadline.getFullYear() !== +parts[0] || deadline.getMonth() !== +parts[1] - 1 ||
          deadline.getDate() !== +parts[2]) continue;
      if (deadline.getTime() <= today) due++;
    }
    var badge = document.getElementById('boudreauxStatus');
    if (badge) {
      badge.hidden = due === 0;
      badge.textContent = due ? due + (due === 1 ? ' follow-up due' : ' follow-ups due') : '';
    }
    if (react && due > latestDueCount && latestDueCount >= 0 &&
        Date.now() - lastWorkReaction > 60000 && !hidden) {
      lastWorkReaction = Date.now();
      play('working', 2500);
    }
    latestDueCount = due;
  }

  function setFrame(index) {
    if (index === frameIndex) return;
    frameIndex = index;
    var node = document.getElementById('boudreauxSprite');
    if (!node) return;
    var col = index % cols;
    var row = Math.floor(index / cols);
    // Percentage positions align exactly to each of the 4 x 3 cells.
    node.style.backgroundPosition = (col * 100 / (cols - 1)) + '% ' + (row * 50) + '%';
  }
  function play(name, duration) {
    if (!poses[name] || hidden) return;
    animation = name;
    animationEnd = Date.now() + (duration || 1800);
    ticks = 0;
    if (!reduceMotion) setFrame(poses[name][0]);
  }
  function tick() {
    var host = document.getElementById('boudreauxCompanion');
    if (!host || document.hidden) return;
    updateDueStatus(false);
    if (host.hidden) return;
    // Hide when applicant detail is open, so the mascot never covers records.
    var detail = document.getElementById('detailView');
    host.style.visibility = detail && detail.classList.contains('open') ? 'hidden' : 'visible';
    if (reduceMotion) { setFrame(0); return; }
    ticks++;
    if (Date.now() < animationEnd && animation) {
      var sequence = poses[animation];
      setFrame(sequence[ticks % sequence.length]);
      return;
    }
    animation = null;
    if (Date.now() - lastInteraction > 3 * 60 * 1000) {
      setFrame(poses.sleepy[Math.floor(ticks / 8) % poses.sleepy.length]);
      return;
    }
    // Quiet idle breathing / blink — does not run a costly per-pixel animation.
    setFrame(0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
}());
