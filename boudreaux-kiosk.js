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
  var CELL = 362;
  var cols = 4;
  var preferenceKey = 'pibase-boudreaux-kiosk-visible-v1';
  var hidden = false;
  try { hidden = localStorage.getItem(preferenceKey) === 'hidden'; } catch (e) {}
  function setHidden(value) {
    hidden = !!value;
    var host = document.getElementById('boudreauxCompanion');
    if (host) host.hidden = hidden;
    var restore = document.getElementById('boudreauxRestore');
    if (restore) restore.hidden = !hidden;
    try { localStorage.setItem(preferenceKey, hidden ? 'hidden' : 'visible'); } catch (e) {}
  }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lastInteraction = Date.now();
  var animation = null;
  var animationEnd = 0;
  var frameIndex = -1;
  var ticks = 0;
  var lastReadyCelebration = 0;
  var poses = {
    idle: [0, 0, 0, 0, 1, 0],
    wave: [2, 0, 2, 0, 2, 0],
    salute: [3, 0, 3, 0],
    walk: [4, 5, 4, 5],
    point: [6, 0, 6, 0],
    working: [7, 7, 9, 7],
    celebrate: [8, 0, 8, 0],
    think: [9, 9, 7, 9],
    sleepy: [10, 11, 11, 11]
  };

  function init() {
    if (document.getElementById('boudreauxCompanion')) return;
    var style = document.createElement('style');
    style.textContent = '\
      #boudreauxCompanion{position:fixed;right:24px;bottom:55px;z-index:15;width:172px;max-width:25vw;text-align:center;pointer-events:none;user-select:none;opacity:.98}\
      #boudreauxCompanion[hidden]{display:none!important}\
      #boudreauxSprite{width:162px;height:162px;max-width:100%;margin:0 auto;background-repeat:no-repeat;background-image:url("'+sheetUrl+'");background-size:400% 300%;filter:drop-shadow(0 5px 10px rgba(0,0,0,.25))}\
      #boudreauxRestore{position:fixed;right:12px;bottom:12px;z-index:16;background:#17231f;color:#e4c47c;border:1px solid #826b3c;border-radius:5px;padding:7px 10px;font:12px monospace;cursor:pointer}\
      #boudreauxRestore[hidden]{display:none!important}\
      @media(max-width:1100px){#boudreauxCompanion{right:12px;bottom:48px;width:116px}#boudreauxSprite{width:108px;height:108px}}\
      @media(max-width:700px){#boudreauxCompanion{display:none!important}}\
      @media print{#boudreauxCompanion{display:none!important}}';
    document.head.appendChild(style);
    var host = document.createElement('aside');
    host.id = 'boudreauxCompanion';
    host.setAttribute('aria-hidden', 'true');
    var sprite = document.createElement('div'); sprite.id = 'boudreauxSprite';
    host.appendChild(sprite);
    document.body.appendChild(host);
    var restore = document.createElement('button');
    restore.id = 'boudreauxRestore'; restore.type = 'button'; restore.textContent = 'Show Boudreaux';
    restore.addEventListener('click', function () { setHidden(false); });
    document.body.appendChild(restore);
    setHidden(hidden);
    setFrame(0);
    // Optional graceful failure if assets were not uploaded with the JavaScript.
    var probe = new Image();
    probe.onerror = function () { host.hidden = true; };
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
    window.addEventListener('pibase:applicants-snapshot', function () {
      if (Date.now() - lastReadyCelebration > 300000) {
        lastReadyCelebration = Date.now(); play('celebrate', 2500);
      }
    });
    window.addEventListener('offline', function () { play('think', 4000); });
    window.addEventListener('online', function () { play('wave', 2500); });
    window.setInterval(tick, 450);
    window.Boudreaux = { play: play, hide: function () { setHidden(true); }, show: function () { setHidden(false); } }; // Optional read-only demo or future integrations.
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
    if (!poses[name]) return;
    animation = name;
    animationEnd = Date.now() + (duration || 1800);
    ticks = 0;
    if (!reduceMotion) setFrame(poses[name][0]);
  }
  function tick() {
    var host = document.getElementById('boudreauxCompanion');
    if (!host || host.hidden || document.hidden) return;
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
    setFrame(ticks % 15 === 0 ? 1 : 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
}());
