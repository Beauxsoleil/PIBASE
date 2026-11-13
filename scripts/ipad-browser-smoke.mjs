// Run with Playwright available, or PIBASE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs.
// All external requests are intercepted. Never signs in to or reads live Firebase.
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PIBASE_PLAYWRIGHT_MODULE || 'playwright');
const root=new URL('../',import.meta.url);
const server=http.createServer(async(req,res)=>{
  const path=req.url.split('?')[0];
  const file=path==='/ipad.html'?'ipad.html':path==='/icons/pibase-192.png'?'icons/pibase-192.png':null;
  if(!file){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',file.endsWith('.png')?'image/png':'text/html');res.end(await fs.readFile(new URL(file,root)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
try{
 const context=await browser.newContext({viewport:{width:1024,height:768}});
 let fail=false,pages=0,refreshes=0,authCalls=0;
 const errors=[];
 await context.route('**/*',async route=>{
   const r=route.request(),u=r.url();
   if(u.startsWith(origin)&&!u.includes('calendar.ics'))return route.continue();
   if(u.startsWith(origin)&&u.includes('calendar.ics'))return route.fulfill({body:'BEGIN:VCALENDAR\nEND:VCALENDAR'});
   let data;
   if(u.includes('accounts:signInWithPassword')){authCalls++;data={idToken:'synthetic-token',refreshToken:'synthetic-refresh',localId:'synthetic-user',expiresIn:'3600'}}
   else if(u.includes('securetoken.googleapis.com')){refreshes++;data={id_token:'synthetic-token',refresh_token:'synthetic-refresh2',user_id:'synthetic-user',expires_in:'3600'}}
   else if(u.startsWith('https://firestore.googleapis.com/')){
     assert.equal(r.method(),'GET');assert.equal(r.headers().authorization,'Bearer synthetic-token');
     if(fail)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
     if(u.includes('/kioskApplicants?')){
       pages++;const second=u.includes('pageToken=');const number=second?2:1;
       // Privacy fixture: the mirror would never carry waiverType or
       // latestNote, but even if it did, the display must not render them.
       // Overflow is forced by a long rendered name, not by a note.
       data={documents:[{name:'projects/demo/databases/(default)/documents/kioskApplicants/'+number,fields:{name:{stringValue:number===1?'SYNTHETIC Applicant 1 '+'Long synthetic name. '.repeat(100):'<img src=x onerror=alert(1)> safely displayed as text.'},updatedAt:{timestampValue:'2026-10-01T00:00:00Z'},statusStage:{stringValue:number===1?'Waiver':'DEP'},waiverType:{stringValue:'Practice only'},age:{integerValue:'22'},generalArea:{stringValue:'Twin Falls'},latestNote:{stringValue:'Long synthetic note. '.repeat(150)}}}]};
       if(!second)data.nextPageToken='page2';
     }else if(u.includes('/settings/'))return route.fulfill({status:404,contentType:'application/json',body:'{}'});
     else data={documents:[]};
   }else throw Error('Unexpected external request');
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/ipad.html');
 await page.locator('#email').fill('synthetic@example.invalid');await page.locator('#password').fill('synthetic-only');await page.locator('#signin').click();
 await page.waitForFunction(()=>document.getElementById('status').textContent.indexOf('Connected')>=0);
 assert.equal(await page.locator('.card').count(),2);assert.equal(pages,2);
 assert.equal(await page.locator('.card img').count(),0);
 const bodyText=await page.evaluate(()=>document.body.innerText);
 assert.ok(!bodyText.includes('Practice only'),'waiver type must not render');
 assert.ok(!bodyText.includes('Long synthetic note'),'latest note must not render');
 const bounds=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,inner:document.getElementById('viewport').scrollHeight,available:document.getElementById('viewport').clientHeight}));
 assert.equal(bounds.w,1024);assert.equal(bounds.h,768);assert.ok(bounds.inner>bounds.available);
 await page.screenshot({path:process.env.PIBASE_IPAD_SCREENSHOT || '/tmp/pibase-ipad-synthetic.png'});
 await page.waitForFunction(()=>document.getElementById('viewport').scrollTop>0);
 fail=true;await page.waitForFunction(()=>document.getElementById('status').textContent.indexOf('Offline, retrying')>=0,{},{timeout:20000});
 assert.equal(await page.locator('.card').count(),2);
 fail=false;await page.reload();await page.waitForFunction(()=>document.getElementById('status').textContent.indexOf('Connected')>=0);
 assert.equal(authCalls,1);assert.equal(refreshes,1);
 await page.locator('#signout').click();assert.equal(await page.locator('.card').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('pibase.ipad.v1.session')),null);
 assert.deepEqual(errors,[]);
 console.log('PASS Chromium 1024x768: pagination, rendering, escaped names, no note/waiver rendering, overflow scroll, outage retention, refresh after reload, sign-out. No live requests.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
