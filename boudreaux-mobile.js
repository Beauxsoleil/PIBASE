/* Boudreaux v2.1: mobile companion. No direct Firebase access or record writes. */
(function(){
'use strict';
if(!/\/(?:index\.html)?$/.test(location.pathname)||window.__PIBASE_BOUDREAUX_MOBILE__)return;
window.__PIBASE_BOUDREAUX_MOBILE__=true;
var prefs={corner:'left',quiet:false,hidden:false};
try{var saved=JSON.parse(localStorage.getItem('pibase-boudreaux-v21')||'{}');if(saved&&typeof saved==='object'){prefs.corner=saved.corner==='right'?'right':'left';prefs.quiet=!!saved.quiet;prefs.hidden=!!saved.hidden;}}catch(e){}
function save(){try{localStorage.setItem('pibase-boudreaux-v21',JSON.stringify(prefs));}catch(e){}}
var reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var poses={idle:[0,0,0,1,0,0],wave:[2,0,2,0],salute:[3,0,3,0],think:[9,9,0],sleep:[10,11,11],celebrate:[8,0,8,0],walk:[4,5,4,5],point:[6,0,6,0],work:[7,9,7,9]};
var current='idle',until=0,ticks=0,lastActivity=Date.now(),data={items:[],target:0,fiscalYear:null,active:0},panelOpen=false,tab='brief',host,sprite,panel,launcher;
function el(tag,cls,content){var n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=content;return n;}
function play(name,duration){if(!poses[name])return;current=name;until=Date.now()+(duration||1800);ticks=0;frame(poses[name][0]);if(host){host.setAttribute('data-mood',name);if(name==='celebrate'&&!reduce){host.classList.remove('bd-pop');void host.offsetWidth;host.classList.add('bd-pop');}}}
function frame(i){if(!sprite)return;sprite.style.backgroundPosition=(i%4*100/3)+'% '+(Math.floor(i/4)*50)+'%';}
function onList(){return ['listScreen','leadsScreen'].some(function(id){var n=document.getElementById(id);return n&&!n.classList.contains('hidden');});}
function renderVisibility(){var show=onList()&&!document.hidden&&!prefs.hidden&&window.innerWidth<800&&!document.querySelector('input:focus,textarea:focus,select:focus');host.hidden=!show;if(!show&&panelOpen)closePanel();}
function closePanel(){panelOpen=false;panel.hidden=true;launcher.setAttribute('aria-expanded','false');host.classList.remove('bd-panel-open');}
function openPanel(){panelOpen=true;panel.hidden=false;launcher.setAttribute('aria-expanded','true');host.classList.add('bd-panel-open');renderPanel();play('salute',1200);}
function btn(label,action){var b=el('button','bd-btn',label);b.type='button';b.addEventListener('click',action);return b;}
function line(text){return el('p','bd-copy',text);}
function row(label,value){var r=el('div','bd-row');r.appendChild(el('span','',label));r.appendChild(el('strong','',String(value)));return r;}
function renderPanel(){
panel.replaceChildren();
var top=el('div','bd-head');top.appendChild(el('strong','', 'Boudreaux'));top.appendChild(btn('Close',closePanel));panel.appendChild(top);
var tabs=el('div','bd-tabs');[['brief','Briefing'],['actions','Actions'],['pet','Companion']].forEach(function(pair){var b=btn(pair[1],function(){tab=pair[0];renderPanel();});b.setAttribute('aria-pressed',String(tab===pair[0]));tabs.appendChild(b);});panel.appendChild(tabs);
var body=el('div','bd-body');panel.appendChild(body);
if(tab==='brief'){
body.appendChild(line('Morning formation. Here is what needs your attention.'));
var today=new Date();today.setHours(0,0,0,0);
var overdue=data.items.filter(function(a){return a.due&&new Date(a.due+'T00:00:00')<today;});
var dueToday=data.items.filter(function(a){return a.due&&new Date(a.due+'T00:00:00').getTime()===today.getTime();});
body.appendChild(row('Overdue follow-ups',overdue.length));body.appendChild(row('Due today',dueToday.length));body.appendChild(row('Active applicants',data.active));
if(data.target)body.appendChild(line('FY '+(data.fiscalYear||'')+' mission target: '+data.target+'. Applicant counts are not enlistment totals.'));
var items=overdue.concat(dueToday).slice(0,5);
if(items.length){body.appendChild(el('h3','bd-sub','Priority follow-ups'));items.forEach(function(a){var b=btn((a.name||'Applicant')+' · '+(a.action||'Follow up'),function(){navigate('applicant',a.id);});b.className+=' bd-item';body.appendChild(b);});}
else body.appendChild(line('No overdue or due-today next actions found.'));
body.appendChild(line('Based on saved next-action dates. Calendar appointments are not included yet.'));
}else if(tab==='actions'){
body.appendChild(btn('New applicant',function(){navigate('new');}));
body.appendChild(btn('Applicant list',function(){navigate('list');}));
body.appendChild(btn('Survey leads',function(){navigate('leads');}));
body.appendChild(btn('Mission settings',function(){navigate('mission');}));
body.appendChild(btn('Open calendar',function(){window.location.href='./events.html';}));
}else{
body.appendChild(line('A battle buddy, not another chore. No streaks or penalties.'));
body.appendChild(btn('Wave hello',function(){closePanel();play('wave',2200);}));
body.appendChild(btn('Take a stroll',function(){closePanel();play('walk',2800);}));
body.appendChild(btn('Victory dance',function(){closePanel();play('celebrate',2400);}));
body.appendChild(btn('Move to '+(prefs.corner==='left'?'right':'left')+' corner',function(){prefs.corner=prefs.corner==='left'?'right':'left';save();applyPrefs();renderPanel();}));
body.appendChild(btn(prefs.quiet?'Enable reactions':'Quiet mode',function(){prefs.quiet=!prefs.quiet;save();renderPanel();}));
body.appendChild(btn('Toggle Thibideaux visibility',function(){window.dispatchEvent(new Event('pibase:thibideaux-toggle'));}));
body.appendChild(btn('Hide Boudreaux',function(){prefs.hidden=true;save();applyPrefs();closePanel();}));
body.appendChild(line('To restore after hiding, use the Boudreaux setting in this page: see the floating restore control.'));
}
}
function navigate(action,id){closePanel();window.dispatchEvent(new CustomEvent('pibase:boudreaux-navigate',{detail:{action:action,id:id||null}}));}
function applyPrefs(){host.classList.toggle('bd-right',prefs.corner==='right');host.classList.toggle('bd-disabled',prefs.hidden);restore.hidden=!prefs.hidden;renderVisibility();}
var restore;
function init(){
var css=el('style');css.textContent=
'#boudreauxMobile{position:fixed;left:10px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:45;width:82px;user-select:none}'+
'#boudreauxMobile.bd-right{left:auto;right:10px}#boudreauxMobile[hidden],#boudreauxPanel[hidden],#boudreauxRestore[hidden]{display:none!important}'+
'#boudreauxLaunch{display:block;width:82px;height:82px;padding:0;border:0;background:transparent;touch-action:manipulation;cursor:pointer}'+
'#boudreauxMobileSprite{display:block;width:80px;height:80px;background-image:url("./assets/boudreaux-sprites.webp");background-size:400% 300%;background-repeat:no-repeat;filter:drop-shadow(0 3px 7px rgba(0,0,0,.45))}'+
'#boudreauxMobile:not(.bd-panel-open) #boudreauxMobileSprite{animation:bd-breathe 3.2s ease-in-out infinite;transform-origin:50% 90%}'+
'#boudreauxMobile[data-mood="walk"]:not(.bd-panel-open) #boudreauxMobileSprite{animation:bd-walk 0.55s ease-in-out infinite}'+
'#boudreauxMobile[data-mood="sleep"]:not(.bd-panel-open) #boudreauxMobileSprite{animation:bd-sleep 4.8s ease-in-out infinite}'+
'#boudreauxMobile[data-mood="think"]:not(.bd-panel-open) #boudreauxMobileSprite{animation:bd-think 1.8s ease-in-out infinite}'+
'#boudreauxMobile.bd-pop #boudreauxMobileSprite{animation:bd-celebrate .55s ease-in-out 3!important}'+
'@keyframes bd-breathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.025)}}'+
'@keyframes bd-walk{0%,100%{transform:translate(0,0) rotate(-2deg)}50%{transform:translate(12px,-3px) rotate(2deg)}}'+
'@keyframes bd-sleep{0%,100%{transform:translateY(2px) rotate(-3deg)}50%{transform:translateY(3px) rotate(-5deg) scale(.98)}}'+
'@keyframes bd-think{0%,100%{transform:rotate(0)}50%{transform:rotate(-6deg)}}'+
'@keyframes bd-celebrate{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-11px) rotate(7deg)}}'+
'@media(prefers-reduced-motion:reduce){#boudreauxMobileSprite{animation:none!important;transition:none!important}}'+
'#boudreauxPanel{position:absolute;bottom:92px;left:0;width:min(330px,calc(100vw - 22px));max-height:min(65vh,510px);overflow:auto;background:#17231d;color:#f2f2e8;border:1px solid #806e4a;border-radius:12px;padding:14px;box-shadow:0 10px 40px #0009;font:13px/1.5 system-ui,sans-serif;user-select:text}'+
'.bd-right #boudreauxPanel{left:auto;right:0}.bd-head,.bd-row{display:flex;justify-content:space-between;align-items:center;gap:8px}.bd-head{font-size:16px;color:#dfbf7b}.bd-tabs{display:flex;gap:5px;margin:12px 0}.bd-btn{background:#2b3a30;color:#f2f2e8;border:1px solid #50604e;border-radius:6px;padding:9px 10px;font:inherit;cursor:pointer;text-align:left}.bd-btn:focus-visible,#boudreauxLaunch:focus-visible{outline:2px solid #dfbf7b}.bd-tabs .bd-btn{flex:1;text-align:center;font-size:11px;padding:8px 4px}.bd-tabs [aria-pressed=true]{border-color:#dfbf7b;color:#dfbf7b}.bd-body{display:grid;gap:8px}.bd-copy{margin:3px 0;color:#c8d1c6}.bd-row{border-bottom:1px solid #3c4b40;padding:7px 0}.bd-sub{font-size:12px;color:#dfbf7b;margin:8px 0 0}.bd-item{width:100%;font-size:12px}.bd-body>.bd-btn{width:100%}'+
'#boudreauxRestore{position:fixed;bottom:calc(10px + env(safe-area-inset-bottom,0px));left:8px;z-index:44;border:1px solid #806e4a;border-radius:6px;background:#17231d;color:#dfbf7b;padding:6px 9px;font:11px system-ui}'+
'@media(min-width:800px){#boudreauxMobile,#boudreauxRestore{display:none!important}}@media print{#boudreauxMobile,#boudreauxRestore{display:none!important}}';
document.head.appendChild(css);
host=el('aside');host.id='boudreauxMobile';host.hidden=true;
launcher=el('button');launcher.id='boudreauxLaunch';launcher.type='button';launcher.setAttribute('aria-label','Open Boudreaux recruiting assistant');launcher.setAttribute('aria-expanded','false');
sprite=el('span');sprite.id='boudreauxMobileSprite';launcher.appendChild(sprite);host.appendChild(launcher);
panel=el('section');panel.id='boudreauxPanel';panel.hidden=true;panel.setAttribute('aria-label','Boudreaux assistant');host.appendChild(panel);document.body.appendChild(host);
restore=btn('Show Boudreaux',function(){prefs.hidden=false;save();applyPrefs();});restore.id='boudreauxRestore';restore.hidden=true;document.body.appendChild(restore);
launcher.addEventListener('click',function(){lastActivity=Date.now();panelOpen?closePanel():openPanel();});
document.addEventListener('pointerdown',function(e){lastActivity=Date.now();if(panelOpen&&!host.contains(e.target))closePanel();},{passive:true});
document.addEventListener('focusin',renderVisibility);document.addEventListener('focusout',function(){setTimeout(renderVisibility,150);});
window.addEventListener('resize',renderVisibility);
window.addEventListener('pibase:boudreaux-data',function(e){if(!e.detail)return;data=e.detail; if(panelOpen)renderPanel();});
window.addEventListener('pibase:boudreaux-celebrate',function(){if(!prefs.quiet)play('celebrate',2000);});
window.addEventListener('offline',function(){if(!prefs.quiet)play('think',2500);});
window.addEventListener('online',function(){if(!prefs.quiet)play('wave',2000);});
var probe=new Image();probe.onerror=function(){host.hidden=true;restore.hidden=true;};probe.src='./assets/boudreaux-sprites.webp';
frame(0);host.setAttribute('data-mood','idle');applyPrefs();
window.setInterval(function(){renderVisibility();if(host.hidden||reduce)return;ticks++;if(Date.now()>until){var idleFor=Date.now()-lastActivity;if(idleFor>180000)current='sleep';else if(!prefs.quiet&&!panelOpen&&ticks%37===0){play('walk',2400);}else current='idle';}host.setAttribute('data-mood',current);var seq=poses[current];frame(seq[ticks%seq.length]);},450);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
}());
