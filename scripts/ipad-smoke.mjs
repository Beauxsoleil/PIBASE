// No Firebase calls: synthetic XHR + DOM, Node built-ins only.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = fs.readFileSync(new URL('../ipad.html', import.meta.url),'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(saved, storageFails=false) {
  const elements={}, requests=[], timers=[], disk={...saved};
  const element = id => elements[id] ||= {value:'',checked:true,hidden:id==='signout',textContent:'',innerHTML:'',disabled:false,scrollTop:0,scrollHeight:500,clientHeight:500,attrs:{},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},removeAttribute(k){delete this.attrs[k]}};
  class XHR {
    open(method,url){this.method=method;this.url=url;this.headers={}}
    setRequestHeader(k,v){this.headers[k]=v}
    send(body){this.body=body;requests.push(this)}
    respond(status,value){this.status=status;this.responseText=typeof value==='string'?value:JSON.stringify(value);this.onload()}
  }
  const context={document:{getElementById:element},XMLHttpRequest:XHR,localStorage:{getItem:k=>disk[k]||null,setItem(k,v){if(storageFails)throw Error('storage');disk[k]=v},removeItem:k=>delete disk[k]},setInterval:(fn,ms)=>timers.push({fn,ms}),window:{location:{reload(){context.reloaded=true}}},Date,JSON,Object,Number,String,Math,isNaN,encodeURIComponent};
  vm.createContext(context);
  vm.runInContext(source.replace('}());','window.test = {decode:decode,fields:fields,poll:poll,rotate:rotate,parseCalendar:parseCalendar,mountainNow:mountainNow,dailyReload:dailyReload,getState:function(){return state;}};}());'),context);
  return {context,el:element,requests,disk,timers,api:context.window.test};
}
const key='pibase.ipad.v1.session';
function login(b){b.el('email').value='test@example.invalid';b.el('password').value='test-password';b.el('login').onsubmit({preventDefault(){}});const req=b.requests.shift();assert.match(req.url,/signInWithPassword/);req.respond(200,{idToken:'fake-id',refreshToken:'fake-refresh',localId:'fake-user',expiresIn:'3600'});assert.equal(b.el('password').value,'');}
const doc=(id, fields)=>({name:'projects/demo/databases/(default)/documents/applicants/'+id,fields});
const applicant=(id,name,extra={})=>doc(id,{name:{stringValue:name},updatedAt:{timestampValue:'2026-10-01T00:00:00Z'},statusStage:{stringValue:'DEP'},...extra});
function complete(b,apps=[applicant('A','Synthetic Alpha')]){
  const pending=b.requests.splice(0);
  for(const req of pending){
    if(req.url.includes('/applicants?'))req.respond(200,{documents:apps});
    else if(/\/(events|eventResults)\?/.test(req.url))req.respond(200,{documents:[]});
    else if(req.url.includes('/settings/'))req.respond(404,{});
    else if(req.url.includes('calendar.ics'))req.respond(200,'BEGIN:VCALENDAR\nEND:VCALENDAR');
    else throw Error('Unexpected request '+req.url);
  }
}
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS '+name)}
test('standalone assets and legacy CSS constraints',()=>{
 assert.equal((html.match(/<script/g)||[]).length,1);assert.ok(!/<script[^>]+src=/.test(html));
 assert.ok(!/display:\s*grid|var\(--|clamp\(|position:\s*sticky|\bgap\s*:/.test(html));
 assert.ok(!/\bfetch\s*\(|\bPromise\b|\.includes\(|\.find\(|Object\.assign\(/.test(source));
});
test('typed values preserve unsafe integers and nested types',()=>{
 const b=boot();const d=b.api.decode({mapValue:{fields:{a:{arrayValue:{values:[{integerValue:'12'},{booleanValue:false},{nullValue:null}]}},big:{integerValue:'9007199254740993'},geo:{geoPointValue:{latitude:1,longitude:2}},timestamp:{timestampValue:'2026-01-01T00:00:00.123456Z'}}}});
 assert.equal(JSON.stringify(d.a),'[12,false,null]');assert.equal(d.big,'9007199254740993');assert.equal(d.geo.latitude,1);assert.equal(d.timestamp,'2026-01-01T00:00:00.123456Z');
});
test('login, archive filter, stage alias, escaping and read-only requests',()=>{
 const b=boot();login(b);complete(b,[applicant('A','<img onerror=alert(1)>',{latestNote:{stringValue:'<script>secret</script>'}}),applicant('B','Archived',{archiveFolder:{stringValue:'Previous FY'}})]);
 assert.equal(b.api.getState().applicants.length,1);assert.equal(b.api.getState().applicants[0].statusStage,'Q&E');
 assert.match(b.el('inner').innerHTML,/&lt;img/);assert.match(b.el('inner').innerHTML,/&lt;script/);assert.ok(!b.disk[key].includes('test-password'));assert.ok(!b.disk[key].includes('fake-id'));
 b.api.poll();assert.ok(b.requests.every(r=>r.method==='GET' && r.headers.Authorization==='Bearer fake-id'));
});
test('enlisted applicants count toward the mission but leave the active roster',()=>{
 const b=boot();login(b);complete(b,[
  applicant('A','Active One'),
  applicant('B','Filed Enlisted',{statusStage:{stringValue:'Enlisted'},archived:{booleanValue:true},archiveFolder:{stringValue:'enlisted'}}),
  applicant('C','Legacy Enlisted',{statusStage:{stringValue:'Enlisted'}}),
  applicant('D','Cowards Enlisted',{statusStage:{stringValue:'Enlisted'},archived:{booleanValue:true},archiveFolder:{stringValue:'cowards'}}),
 ]);
 assert.match(b.el('section').textContent,/Applicants \(2\)/);
 assert.equal(b.api.getState().applicants.length,2);
 assert.equal(b.api.getState().enlistedDocs.length,2);
 for(let i=0;i<360;i++)b.api.rotate();
 assert.match(b.el('section').textContent,/Pipeline \/ Mission/);
 assert.match(b.el('inner').innerHTML,/2 \/ —/);
 assert.match(b.el('inner').innerHTML,/1 active/);
 for(let i=0;i<240;i++)b.api.rotate();
 assert.match(b.el('section').textContent,/Territory/);
 assert.match(b.el('inner').innerHTML,/Unassigned<\/td><td>0<\/td><td>0<\/td><td>1<\/td><td>2<\/td>/);
});
test('all pages are collected before replacing visible data',()=>{
 const b=boot();login(b);const first=b.requests.find(r=>r.url.includes('/applicants?'));b.requests.splice(b.requests.indexOf(first),1);
 first.respond(200,{documents:[applicant('A','Page one')],nextPageToken:'cursor &?'});const second=b.requests.pop();assert.match(second.url,/pageToken=cursor%20%26%3F/);
 complete(b);assert.equal(b.api.getState().applicants.length,0);second.respond(200,{documents:[applicant('B','Page two')]});assert.equal(b.api.getState().applicants.length,2);
});
test('failed pagination retains last complete data and poll can recover',()=>{
 const b=boot();login(b);complete(b);const before=b.el('inner').innerHTML;b.api.poll();const req=b.requests.shift();req.respond(200,{documents:[applicant('B','Partial')],nextPageToken:'x'});const page=b.requests.pop();complete(b);page.respond(503,{});assert.equal(b.el('inner').innerHTML,before);assert.match(b.el('status').textContent,/Offline, retrying/);b.api.poll();complete(b);assert.match(b.el('status').textContent,/Connected/);
});
test('permission rejection retains screen and labels error honestly',()=>{
 const b=boot();login(b);complete(b);const before=b.el('inner').innerHTML;b.api.poll();b.requests.shift().respond(403,{});complete(b);assert.equal(b.el('inner').innerHTML,before);assert.match(b.el('status').textContent,/Access denied/);
});
test('sign-out clears local token/data and ignores in-flight response',()=>{
 const b=boot();login(b);const pending=b.requests.splice(0);b.el('signout').onclick();for(const r of pending)r.respond(200,{documents:[applicant('A','Late')]});assert.equal(b.disk[key],undefined);assert.match(b.el('inner').innerHTML,/Signed out/);assert.equal(b.api.getState().applicants.length,0);
});
test('saved refresh token restores without password and rotates token',()=>{
 const b=boot({[key]:JSON.stringify({uid:'fake-user',refreshToken:'old',remember:true})});const r=b.requests.shift();assert.match(r.url,/securetoken/);r.respond(200,{id_token:'new-id',refresh_token:'new-refresh',user_id:'fake-user',expires_in:'3600'});assert.match(b.disk[key],/new-refresh/);complete(b);assert.match(b.el('status').textContent,/Connected/);
});
test('revoked refresh requires login without request storm',()=>{
 const b=boot({[key]:JSON.stringify({uid:'fake-user',refreshToken:'old',remember:true})});b.requests.shift().respond(400,{error:{message:'TOKEN_EXPIRED'}});assert.equal(b.el('login').hidden,false);assert.equal(b.disk[key],undefined);const n=b.requests.length;b.api.poll();assert.equal(b.requests.length,n);
});
test('storage failure remains usable but warns that session is temporary',()=>{
 const b=boot({},true);login(b);complete(b);assert.match(b.el('status').textContent,/Session cannot be saved/);
});
test('overlapping polls suppressed',()=>{const b=boot();login(b);const n=b.requests.length;b.api.poll();assert.equal(b.requests.length,n)});
test('calendar UTC parsing and escaped text',()=>{
 const b=boot();const rows=b.api.parseCalendar('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261102T180000Z\nSUMMARY:School\\, visit\nLOCATION:Room\\nTwo\nEND:VEVENT\nEND:VCALENDAR');assert.equal(rows[0].time,Date.UTC(2026,10,2,18));assert.equal(rows[0].title,'School, visit');assert.equal(rows[0].location,'Room Two');
});
test('overflow scrolls before rotating; ordinary slides rotate automatically',()=>{
 const b=boot();login(b);complete(b);b.el('viewport').scrollHeight=700;for(let i=0;i<32;i++)b.api.rotate();assert.ok(b.el('viewport').scrollTop>0);assert.match(b.el('section').textContent,/Applicants/);
 b.el('viewport').scrollTop=200;for(let i=0;i<45;i++)b.api.rotate();assert.match(b.el('section').textContent,/Today/);
});
test('duplicate page tokens fail safely without an endless pagination loop',()=>{
 const b=boot();login(b);const first=b.requests.shift();first.respond(200,{documents:[],nextPageToken:'repeat'});const second=b.requests.pop();second.respond(200,{documents:[],nextPageToken:'repeat'});complete(b);assert.match(b.el('status').textContent,/Offline, retrying/);assert.equal(b.requests.length,0);
});
test('network timeout releases the polling lock',()=>{
 const b=boot();login(b);b.requests.shift().ontimeout();complete(b);assert.match(b.el('status').textContent,/Offline, retrying/);b.api.poll();assert.equal(b.requests.length,5);
});
test('Mountain reminder day and DST transition independent of device timezone',()=>{
 const b=boot();const setDate=iso=>{b.context.Date=class extends Date{constructor(...args){super(...(args.length?args:[iso]))}}};
 setDate('2026-11-01T07:59:00Z');assert.equal(b.api.mountainNow().hour,1);
 setDate('2026-11-01T08:00:00Z');assert.equal(b.api.mountainNow().hour,1);
 setDate('2026-11-02T06:30:00Z');assert.equal(b.api.mountainNow().day,'2026-11-01');
 setDate('2026-03-08T08:59:00Z');assert.equal(b.api.mountainNow().hour,1);
 setDate('2026-03-08T09:00:00Z');assert.equal(b.api.mountainNow().hour,3);
});
test('daily reload requires successful data and remembered session, once per date',()=>{
 const b=boot({[key+'.reload']:'2000-01-01'});login(b);complete(b);b.context.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-02T12:00:00']))}};
 b.api.dailyReload();assert.equal(b.context.reloaded,true);b.context.reloaded=false;b.api.dailyReload();assert.equal(b.context.reloaded,false);
 const offline=boot({[key+'.reload']:'2000-01-01'});login(offline);complete(offline);offline.api.poll();offline.requests.shift().respond(503,{});complete(offline);offline.api.dailyReload();assert.ok(!offline.context.reloaded);
});
console.log(tests+' iPad synthetic tests passed. Physical Safari 9 remains unverified.');
