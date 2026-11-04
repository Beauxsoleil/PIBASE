/* Boudreaux on PIBASE's signed-in mobile list and leads screens.
 * Decorative only: no Firebase access or applicant data handling.
 */
(function () {
  'use strict';
  if (!/\/(?:index\.html)?$/.test(location.pathname)) return;
  if (window.__PIBASE_BOUDREAUX_MOBILE__) return;
  window.__PIBASE_BOUDREAUX_MOBILE__ = true;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var poses = { idle:[0,0,0,1,0,0], wave:[2,0,2,0], salute:[3,0,3,0], think:[9,9,0], sleep:[10,11,11], celebrate:[8,0,8,0] };
  var current = 'idle', until = 0, tickCount = 0, lastTouch = Date.now();
  var host, sprite;
  function frame(index) {
    var col = index % 4, row = Math.floor(index / 4);
    sprite.style.backgroundPosition = (col * 100 / 3) + '% ' + (row * 50) + '%';
  }
  function play(name, duration) {
    if (!poses[name]) return;
    current = name;
    until = Date.now() + (duration || 1800);
    tickCount = 0;
    if (!reduceMotion) frame(poses[name][0]);
  }
  function visible() {
    var list = document.getElementById('listScreen');
    var leads = document.getElementById('leadsScreen');
    return !document.hidden && !!((list && !list.classList.contains('hidden')) ||
      (leads && !leads.classList.contains('hidden')));
  }
  function update() {
    if (!host) return;
    host.hidden = !visible();
    if (host.hidden) return;
    if (reduceMotion) { frame(0); return; }
    tickCount++;
    if (Date.now() >= until) current = Date.now() - lastTouch > 180000 ? 'sleep' : 'idle';
    var sequence = poses[current];
    frame(sequence[tickCount % sequence.length]);
  }
  function init() {
    var style = document.createElement('style');
    style.textContent =
      '#boudreauxMobile{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:18;width:82px;pointer-events:none;user-select:none;text-align:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,.35))}' +
      '#boudreauxMobile[hidden]{display:none!important}' +
      '#boudreauxMobileSprite{width:80px;height:80px;background-image:url("./assets/boudreaux-sprites.webp");background-size:400% 300%;background-repeat:no-repeat}' +
      '#boudreauxMobileName{display:inline-block;font:600 8px/1.4 monospace;letter-spacing:.04em;color:var(--brass,#c6a15b);background:rgba(13,18,16,.9);padding:2px 4px;border-radius:3px}' +
      '@media(min-width:800px){#boudreauxMobile{display:none!important}}' +
      '@media print{#boudreauxMobile{display:none!important}}';
    document.head.appendChild(style);
    host = document.createElement('aside');
    host.id = 'boudreauxMobile';
    host.hidden = true;
    host.setAttribute('aria-hidden','true');
    sprite = document.createElement('div');
    sprite.id = 'boudreauxMobileSprite';
    var name = document.createElement('div');
    name.id = 'boudreauxMobileName';
    name.textContent = 'BOUDREAUX';
    host.appendChild(sprite);
    host.appendChild(name);
    document.body.appendChild(host);
    var probe = new Image();
    probe.onerror = function () { host.style.display = 'none'; };
    probe.src = './assets/boudreaux-sprites.webp';
    document.addEventListener('pointerdown', function () {
      lastTouch = Date.now();
      if (visible()) play('wave', 1800);
    }, {passive:true});
    window.addEventListener('offline', function () { play('think', 3000); });
    window.addEventListener('online', function () { play('salute', 2000); });
    frame(0);
    update();
    window.setInterval(update, 450);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
}());
