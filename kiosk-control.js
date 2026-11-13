// PIBASE kiosk remote: shared Firebase control plane; no applicant data in commands.
import { db, auth, authReady, doc, onSnapshot, setDoc, serverTimestamp, onAuthStateChanged } from './firebase-config.js';
const labels=['Applicant Board','Today','Calendar','Pipeline / Mission','Recruiting Events','Territory Analytics','Video'];
const isKiosk=/\/display\.html$/.test(location.pathname);
const controlRef=doc(db,'settings','kioskControl');
if(isKiosk){
  const style=document.createElement('style');
  style.textContent='#pibaseVideoOverlay{position:fixed;inset:0;z-index:90;background:#000;display:none}#pibaseVideoOverlay.active{display:block}#pibaseVideoOverlay video{width:100%;height:100%;object-fit:contain;background:#000}body.pibase-video-active #pibaseKioskNav,body.pibase-video-active #pibaseStatusStrip,body.pibase-video-active #pibaseScreenIndicator{display:none!important}';
  document.head.appendChild(style);
  const overlay=document.createElement('div');overlay.id='pibaseVideoOverlay';
  const video=document.createElement('video');video.src='./assets/kiosk-1080p.mp4';video.autoplay=false;video.loop=true;video.muted=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label','Idaho National Guard kiosk video');overlay.appendChild(video);
  const install=()=>document.body.appendChild(overlay);
  if(document.body)install();else document.addEventListener('DOMContentLoaded',install,{once:true});
  let current=-1;
  function select(index){
    if(!Number.isInteger(index)||index<0||index>=labels.length)return;
    if(index===current)return;
    const wasVideo=current===6;current=index;
    if(index===6){
      document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
      document.getElementById('detailView')?.classList.remove('open');
      overlay.classList.add('active');document.body.classList.add('pibase-video-active');
      video.play().catch(()=>{console.warn('Video autoplay blocked; waiting for interaction');});
      window.dispatchEvent(new CustomEvent('pibase:screen-change',{detail:{id:'videoScreen',title:'Video'}}));
    }else{
      overlay.classList.remove('active');document.body.classList.remove('pibase-video-active');
      if(wasVideo){video.pause();video.currentTime=0;}
      window.dispatchEvent(new CustomEvent('pibase:remote-screen',{detail:{index}}));
    }
  }
  document.addEventListener('keydown',e=>{if(current!==6)return;if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopImmediatePropagation();select(e.key==='ArrowUp'?5:0);}},true);
  authReady.then(()=>onSnapshot(controlRef,snap=>{if(snap.exists())select(snap.data().screen);},error=>console.warn('Kiosk remote unavailable:',error.code||error)));
}else{
  const host=document.getElementById('listScreen');
  if(host){
    const panel=document.createElement('details');panel.className='mission-card';panel.id='kioskRemotePanel';
    panel.innerHTML='<summary style="cursor:pointer;font-weight:600;padding:8px 0">Kiosk screen control</summary><div class="helper" style="margin:8px 0">Choose the screen shown on the Raspberry Pi kiosk. Changes sync live.</div><label for="kioskRemoteSelect">Kiosk screen</label><select id="kioskRemoteSelect" style="width:100%;min-height:44px;margin:8px 0"></select><button type="button" class="btn btn-secondary" id="kioskRemoteSend">Show on kiosk</button><div class="helper" id="kioskRemoteStatus" role="status" style="margin-top:8px">Connecting…</div>';
    host.insertBefore(panel,host.querySelector('#folderNav'));
    const select=panel.querySelector('select'),status=panel.querySelector('#kioskRemoteStatus'),button=panel.querySelector('button');
    labels.forEach((label,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=label;select.appendChild(option);});
    let stop=()=>{};
    onAuthStateChanged(auth,user=>{
      stop();button.disabled=!user;
      if(!user){status.textContent='Sign in to control the kiosk.';return;}
      stop=onSnapshot(controlRef,snap=>{if(snap.exists()){const n=snap.data().screen;if(Number.isInteger(n)&&n>=0&&n<labels.length){select.value=String(n);status.textContent='Current kiosk selection: '+labels[n];}}else{select.value='3';status.textContent='Kiosk defaults to Pipeline / Mission.';}button.disabled=false;},error=>{status.textContent='Remote unavailable: '+(error.code||'permission error');button.disabled=true;});
    });
    button.addEventListener('click',async()=>{const n=Number(select.value);if(!auth.currentUser||!Number.isInteger(n)||n<0||n>=labels.length)return;button.disabled=true;status.textContent='Sending…';try{await setDoc(controlRef,{screen:n,updatedBy:auth.currentUser.uid,updatedAt:serverTimestamp()});status.textContent='Sent: '+labels[n];}catch(error){status.textContent='Could not change kiosk: '+(error.code||'connection error');}finally{button.disabled=false;}});
  }
}
