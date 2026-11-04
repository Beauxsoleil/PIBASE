/* Thibideaux 2.1: animated raccoon rival. Monthly mission only.
 * Counts are explicitly confirmed enlistments, never inferred from applicant stages.
 * No direct Firebase access or record writes. */
(function(){
'use strict';
if(!/\/(?:index\.html)?$/.test(location.pathname)||window.__PIBASE_THIBIDEAUX__)return;
window.__PIBASE_THIBIDEAUX__=true;

/* ---------- persistent prefs ---------- */
var prefs={quiet:false,enabled:true};
try{var _p=JSON.parse(localStorage.getItem('pibase-thibideaux')||'{}');prefs.quiet=!!_p.quiet;if(_p.enabled===false)prefs.enabled=false;}catch(e){}
function save(){try{localStorage.setItem('pibase-thibideaux',JSON.stringify(prefs));}catch(e){}}

var reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- mission state (from pibase:thibideaux-mission event) ---------- */
var mission={target:0,confirmed:0,month:'',ready:false};
function monthNow(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function calc(){
  var d=new Date(),days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(),
      left=days-d.getDate()+1,remaining=Math.max(0,mission.target-mission.confirmed);
  if(!mission.ready||mission.month!==monthNow()||mission.target<=0)
    return {status:'unconfigured',distance:0,left:left,remaining:0};
  if(!remaining)return {status:'achieved',distance:0,left:left,remaining:0};
  var urgency=Math.min(1,(remaining/mission.target)*(0.35+0.65*d.getDate()/days));
  return {status:urgency>=0.65?'risk':urgency>=0.35?'close':'track',
          distance:urgency,left:left,remaining:remaining};
}

/* ---------- sprite poses: 4x3 atlas, frames 0-11 ----------
 * 0 idle  1 laugh  2 wave  3 salute | 4 walk-a  5 walk-b  6 point  7 tablet |
 * 8 celebrate  9 think  10 taunt  11 sleep */
var poses={
  idle:[0,0,0,0,1,0],
  walk:[4,5,4,5],
  sneak:[4,5],
  taunt:[6,6,10,6,10,6],
  think:[9,9,7,9,7,9],
  celebrate:[8,8,2,8,2,8],
  sleep:[11,11,11,11],
  react:[2,2,0,2,0],
  salute:[3,0,3,0],
  catch:[2,6,8,8,8,0],
  defeat:[10,9,10,11,11,0]
};
var current='idle',until=0,ticks=0,lastActivity=Date.now(),panelOpen=false;
var lastStatus='',lastConfirmed=null,achievedAt=0,assetReady=false;
var host,button,sprite,fallback,panel,restore;
var previousSnapshot=null,finaleKey='pibase-thibideaux-finale-v1';
try{previousSnapshot=JSON.parse(localStorage.getItem('pibase-thibideaux-last-month')||'null');}catch(e){}
function persistSnapshot(){if(mission.ready&&mission.month===monthNow()&&mission.target>0){previousSnapshot={month:mission.month,target:mission.target,confirmed:mission.confirmed};try{localStorage.setItem('pibase-thibideaux-last-month',JSON.stringify(previousSnapshot));}catch(e){}}}
function finale(kind,month){var key=month+':'+kind;try{if(localStorage.getItem(finaleKey)===key)return;localStorage.setItem(finaleKey,key);}catch(e){}play(kind==='catch'?'catch':'defeat',4200);window.dispatchEvent(new CustomEvent('pibase:rivalry-finale',{detail:{kind:kind,month:month}}));}
function checkPreviousMonth(){if(!previousSnapshot||!mission.ready||mission.month!==monthNow()||previousSnapshot.month===monthNow())return;var old=previousSnapshot;if(!/^\d{4}-\d{2}$/.test(old.month))return;var now=new Date(),prior=new Date(now.getFullYear(),now.getMonth()-1,1);var expected=prior.getFullYear()+'-'+String(prior.getMonth()+1).padStart(2,'0');if(old.month!==expected)return;finale(old.confirmed>=old.target?'win':'catch',old.month);previousSnapshot=null;try{localStorage.removeItem('pibase-thibideaux-last-month');}catch(e){}}

function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function btn(label,action){var b=el('button','th-btn',label);b.type='button';b.addEventListener('click',action);return b;}
function frame(i){
  if(!sprite||!assetReady)return;
  sprite.style.backgroundPosition=(i%4*100/3)+'% '+(Math.floor(i/4)*50)+'%';
}
/* One-shot behavior: plays for `duration` ms, then falls back to the base pose. */
function play(name,duration){
  if(!poses[name])return;
  current=name;until=Date.now()+(duration||1800);ticks=0;
  frame(poses[name][0]);
  if(host){
    host.setAttribute('data-mood',name);
    if(name==='celebrate'&&!reduce){host.classList.remove('th-pop');void host.offsetWidth;host.classList.add('th-pop');}
  }
}
/* Base pose from mission status. Rivalry: approach as the deadline nears with the
 * mission unfinished; retreat (far + celebrate, then sleep) when it is achieved. */
function basePose(){
  var s=calc().status;
  if(s==='achieved')return (Date.now()-achievedAt<9000)?'defeat':'sleep';
  if(s==='risk')return 'sneak';
  if(s==='close')return 'walk';
  return 'idle';
}
function onList(){
  return ['listScreen','leadsScreen'].some(function(id){var n=document.getElementById(id);return n&&!n.classList.contains('hidden');});
}
function renderVisibility(){
  var show=prefs.enabled&&!document.hidden&&window.innerWidth<800&&onList()&&
            !document.querySelector('input:focus,textarea:focus,select:focus');
  host.hidden=!show;
  restore.hidden=prefs.enabled||window.innerWidth>=800||document.hidden;
  if(!show&&panelOpen)closePanel();
}
function closePanel(){panelOpen=false;panel.hidden=true;button.setAttribute('aria-expanded','false');}
function openPanel(){panelOpen=true;panel.hidden=false;button.setAttribute('aria-expanded','true');renderPanel();if(!prefs.quiet)play('salute',1200);}
function renderPanel(){
  panel.replaceChildren();
  var c=calc(),head=el('div','th-header');
  head.appendChild(el('strong','','Thibideaux'));
  head.appendChild(btn('Close',closePanel));panel.appendChild(head);
  if(c.status==='unconfigured'){
    panel.appendChild(el('p','','Monthly mission not configured for '+monthNow()+'. Set a target and confirmed enlistments in the Recruiting mission card.'));
    panel.appendChild(btn('Open mission settings',function(){closePanel();window.dispatchEvent(new CustomEvent('pibase:boudreaux-navigate',{detail:{action:'mission'}}));}));
  }else{
    panel.appendChild(el('p','',c.status==='achieved'?'Well done, cher! Mission accomplished. I will mosey on.':
      c.status==='risk'?'I am right on your tail, cher! The deadline is coming!':
      c.status==='close'?'Getting closer now, boss! I can smell that quota.':'Just patrolling, cher.'));
    [['Monthly goal',mission.target],['Confirmed enlistments',mission.confirmed],
     ['Remaining',c.remaining],['Days left',c.left]].forEach(function(r){
      var x=el('div','th-stat');x.appendChild(el('span','',r[0]));x.appendChild(el('strong','',String(r[1])));panel.appendChild(x);});
    panel.appendChild(el('p','th-muted','Only explicitly confirmed enlistments count. This is a playful indicator, not a prediction.'));
  }
  panel.appendChild(btn(prefs.quiet?'Enable reactions':'Quiet reactions',function(){prefs.quiet=!prefs.quiet;save();renderPanel();}));
  panel.appendChild(btn('Hide Thibideaux',function(){prefs.enabled=false;save();closePanel();renderVisibility();}));
}
/* Position: near Boudreaux when the mission is at risk, far when achieved/unconfigured. */
function layout(){
  var c=calc();
  host.dataset.status=c.status;
  var b=document.getElementById('boudreauxMobile');
  var right=b&&b.classList.contains('bd-right');
  var width=Math.max(0,window.innerWidth-100);
  var near=Math.min(width,90),far=Math.max(near,width-80);
  var position=(c.status==='unconfigured'||c.status==='achieved')?far:
    Math.round(far-(far-near)*c.distance);
  host.style.left=Math.max(8,Math.min(window.innerWidth-82,(right?Math.max(8,window.innerWidth-position-74):position)))+'px';
  host.style.right='auto';
  host.classList.toggle('th-near-left',position<window.innerWidth/2);
  if(panelOpen)renderPanel();
}
function refresh(){renderVisibility();if(host.hidden)return;layout();}

function init(){
  var css=el('style');css.textContent=
  '#thibideaux{position:fixed;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:43;width:74px;height:82px;transition:left 2s ease-in-out;user-select:none}'+
  '#thibideaux[hidden],#thibideauxPanel[hidden],#thibideauxRestore[hidden]{display:none!important}'+
  '#thibideauxButton{display:block;width:74px;height:82px;border:0;padding:0;background:none;touch-action:manipulation;cursor:pointer}'+
  '#thibideauxButton:focus-visible{outline:2px solid #dfbf7b}'+
  '#thibideauxFallback{width:74px;height:82px;display:block;filter:drop-shadow(0 3px 7px rgba(0,0,0,.45))}'+
  '#thibideauxArt{width:74px;height:82px;background-image:url("./assets/thibideaux-sprites.webp");background-size:400% 300%;background-repeat:no-repeat;filter:drop-shadow(0 3px 7px rgba(0,0,0,.45))}'+
  '#thibideaux:not(.th-panel-open) #thibideauxArt{animation:th-breathe 3.2s ease-in-out infinite;transform-origin:50% 90%}'+
  '#thibideaux[data-mood="walk"]:not(.th-panel-open) #thibideauxArt{animation:th-walk .55s ease-in-out infinite}'+
  '#thibideaux[data-mood="sneak"]:not(.th-panel-open) #thibideauxArt{animation:th-sneak 1.1s ease-in-out infinite}'+
  '#thibideaux[data-mood="sleep"]:not(.th-panel-open) #thibideauxArt{animation:th-sleep 4.8s ease-in-out infinite}'+
  '#thibideaux[data-mood="think"]:not(.th-panel-open) #thibideauxArt{animation:th-think 1.8s ease-in-out infinite}'+
  '#thibideaux.th-pop #thibideauxArt{animation:th-celebrate .55s ease-in-out 3!important}'+
  '#thibideaux[data-mood="catch"] #thibideauxArt{animation:th-celebrate .55s ease-in-out 4!important}'+
  '#thibideaux[data-mood="defeat"] #thibideauxArt{animation:th-defeat .9s ease-out 2!important}'+
  '@keyframes th-defeat{0%{transform:translateY(0) rotate(0)}35%{transform:translateY(-5px) rotate(-12deg)}70%{transform:translateY(3px) rotate(12deg)}100%{transform:translateY(0) rotate(0)}}'+
  '@keyframes th-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.025)}}'+
  '@keyframes th-walk{0%,100%{transform:translate(0,0) rotate(-2deg)}50%{transform:translate(12px,-3px) rotate(2deg)}}'+
  '@keyframes th-sneak{0%,100%{transform:translateY(0) rotate(-3deg) scale(1)}50%{transform:translateY(-4px) rotate(3deg) scale(.97)}}'+
  '@keyframes th-sleep{0%,100%{transform:translateY(2px) rotate(-3deg)}50%{transform:translateY(3px) rotate(-5deg) scale(.98)}}'+
  '@keyframes th-think{0%,100%{transform:rotate(0)}50%{transform:rotate(-6deg)}}'+
  '@keyframes th-celebrate{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-11px) rotate(7deg)}}'+
  '@media(prefers-reduced-motion:reduce){#thibideauxArt{animation:none!important;transition:none!important}}'+
  '#thibideauxPanel{position:fixed;bottom:calc(108px + env(safe-area-inset-bottom,0px));right:12px;width:min(300px,calc(100vw - 24px));box-sizing:border-box;max-height:min(60dvh,510px);overflow:auto;overflow-wrap:anywhere;overscroll-behavior:contain;background:#17231d;border:1px solid #ae9158;border-radius:12px;padding:12px;color:#f2f2e8;font:13px/1.5 system-ui;box-shadow:0 8px 30px #0008}'+
  '.th-near-left #thibideauxPanel{right:auto;left:12px}'+
  '.th-header,.th-stat{display:flex;justify-content:space-between;align-items:center;gap:8px}.th-header{color:#e0c27f;font-size:16px}.th-stat{border-bottom:1px solid #3e4c42;padding:5px 0}.th-btn{border:1px solid #53644f;border-radius:6px;background:#2b3a30;color:#f2f2e8;padding:8px;margin-top:8px;cursor:pointer}.th-muted{color:#b6c2b7;font-size:11px}'+
  '#thibideauxRestore{position:fixed;right:8px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:46;background:#17231d;color:#dfbf7b;border:1px solid #806e4a;border-radius:7px;padding:8px 10px;font:12px system-ui}'+
  '@media(min-width:800px),print{#thibideaux,#thibideauxRestore{display:none!important}}';
  document.head.appendChild(css);

  host=el('aside');host.id='thibideaux';host.hidden=true;
  button=el('button');button.id='thibideauxButton';button.type='button';
  button.setAttribute('aria-label','Open Thibideaux monthly mission');button.setAttribute('aria-expanded','false');
  fallback=el('img');fallback.id='thibideauxFallback';fallback.src='./assets/thibideaux.svg';fallback.alt='';
  sprite=el('span');sprite.id='thibideauxArt';sprite.setAttribute('aria-hidden','true');sprite.style.display='none';
  button.appendChild(fallback);button.appendChild(sprite);host.appendChild(button);
  panel=el('section');panel.id='thibideauxPanel';panel.hidden=true;panel.setAttribute('aria-label','Thibideaux mission status');
  host.appendChild(panel);document.body.appendChild(host);
  restore=btn('Show Thibideaux',function(){prefs.enabled=true;save();refresh();});
  restore.id='thibideauxRestore';restore.hidden=true;document.body.appendChild(restore);

  button.addEventListener('click',function(){lastActivity=Date.now();panelOpen?closePanel():openPanel();});
  document.addEventListener('pointerdown',function(e){lastActivity=Date.now();if(panelOpen&&!host.contains(e.target))closePanel();},{passive:true});
  document.addEventListener('focusin',refresh);
  document.addEventListener('focusout',function(){setTimeout(refresh,150);});
  window.addEventListener('resize',refresh);
  window.addEventListener('visibilitychange',refresh);

  /* Event bridge: monthly mission data comes only from the manually-entered
   * settings/mission.monthlyMission — never from applicant stages. */
  window.addEventListener('pibase:thibideaux-mission',function(e){
    var x=e.detail||{};
    mission={target:Number(x.target)||0,confirmed:Number(x.confirmed)||0,month:x.month||'',ready:!!x.ready};
    checkPreviousMonth();persistSnapshot();
    var c=calc();
    if(c.status==='achieved'&&lastStatus!=='achieved')achievedAt=Date.now();
    if(c.status==='achieved'&&lastStatus!=='achieved'&&mission.month===monthNow())finale('win',mission.month);
    else if(lastConfirmed!==null&&mission.confirmed>lastConfirmed&&!prefs.quiet)play('react',2000);
    else if(lastStatus&&lastStatus!==c.status&&c.status!=='achieved'&&!prefs.quiet)play('react',1500);
    lastStatus=c.status;lastConfirmed=mission.confirmed;
    refresh();
  });
  window.addEventListener('pibase:thibideaux-toggle',function(){prefs.enabled=!prefs.enabled;save();refresh();});

  /* Asset probe: detailed sprite when it loads, SVG fallback otherwise. */
  var probe=new Image();
  probe.onload=function(){assetReady=true;fallback.style.display='none';sprite.style.display='block';frame(poses[current][0]);};
  probe.onerror=function(){assetReady=false;};
  probe.src='./assets/thibideaux-sprites.webp';

  frame(0);host.setAttribute('data-mood','idle');refresh();

  /* Animation loop: 450ms tick, Boudreaux-compatible cadence.
   * Visibility is cheap-checked here; layout + panel re-render stay on the
   * slower refresh (mission events, resize, 20s) so open panels are not
   * rebuilt under the user's finger. */
  window.setInterval(function(){
    renderVisibility();
    if(host.hidden||reduce||!assetReady)return;
    ticks++;
    if(Date.now()>until){
      var base=basePose();
      if(base==='idle'&&(Date.now()-lastActivity>180000))base='sleep';
      else if(!prefs.quiet&&!panelOpen){
        var st=calc().status;
        if(st==='risk'&&ticks%47===0){play('taunt',2200);return;}
        if(st==='track'&&ticks%61===0){play('think',2600);return;}
      }
      if(base!==current){current=base;ticks=0;host.setAttribute('data-mood',base);}
    }
    var seq=poses[current]||poses.idle;
    frame(seq[ticks%seq.length]);
  },450);
  window.setInterval(refresh,20000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
}());
