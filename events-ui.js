export function initEventsUi({ db, collection, doc, updateDoc, serverTimestamp, onSnapshot, query, orderBy }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const path = window.location.pathname;
  const isEdit = path.endsWith('/index.html') || path.endsWith('/') || path === '';
  const isKiosk = path.endsWith('/display.html');
  const currentFY = () => { const n=new Date(); return n.getMonth()>=9?n.getFullYear()+1:n.getFullYear(); };
  const docsOf = value => Array.isArray(value) ? value : (value?.docs?.map(d=>({id:d.id,...d.data()})) || []);
  const missionDoc = docs => docs.find(a=>Number(a.pibaseMissionTarget)>0 || Number(a.pibaseMissionFiscalYear)>0) || null;

  if (isEdit) {
    const start = () => {
      const addBtn=document.getElementById('addBtn');
      if(addBtn&&!document.getElementById('eventsLink')){
        const link=document.createElement('a'); link.id='eventsLink'; link.href='events.html'; link.className='add-btn';
        link.style.cssText='display:block;text-align:center;text-decoration:none;margin-bottom:10px;'; link.textContent='Recruiting events →';
        addBtn.parentNode.insertBefore(link,addBtn);
      }
      const fy=document.getElementById('missionFiscalYear'),target=document.getElementById('missionTarget'),save=document.getElementById('saveMissionBtn'),status=document.getElementById('missionStatus');
      if(!fy||!target||!save||!status)return;
      let applicants=docsOf(window.__PIBASE_APPLICANTS__);
      const fill=()=>{const m=missionDoc(applicants);if(!m)return;fy.value=Number(m.pibaseMissionFiscalYear)||currentFY();target.value=Number(m.pibaseMissionTarget)||'';};
      fill(); window.addEventListener('pibase:applicants-snapshot',e=>{applicants=docsOf(e.detail);fill();});
      save.addEventListener('click',async e=>{
        e.preventDefault();e.stopImmediatePropagation();
        const fiscalYear=Math.max(2020,Math.min(2100,Number(fy.value)||currentFY())),missionTarget=Math.max(0,Math.round(Number(target.value)||0));
        const host=applicants.find(a=>a.id&&a.statusStage)||applicants[0];
        if(!host){status.style.color='#E08B77';status.textContent='Add an applicant first, then save mission.';return;}
        status.textContent='Saving…';
        try{await updateDoc(doc(db,'applicants',host.id),{pibaseMissionFiscalYear:fiscalYear,pibaseMissionTarget:missionTarget,pibaseMissionUpdatedAt:serverTimestamp()});status.style.color='';status.textContent='Saved.';setTimeout(()=>{if(status.textContent==='Saved.')status.textContent='';},1800);}
        catch(err){console.error('Mission save failed',err);status.style.color='#E08B77';status.textContent=err?.code==='permission-denied'?'Mission save blocked by Firebase rules.':'Save failed.';}
      },true);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  }

  if(!isKiosk)return;
  const start=()=>{
    const board=document.querySelector('.board'),detail=document.getElementById('detailView'),boardScreen=document.getElementById('boardScreen'),pipelineScreen=document.getElementById('pipelineScreen'),title=document.getElementById('screenTitle');
    if(!board||!detail||!boardScreen||!pipelineScreen||!title||document.getElementById('eventsScreen'))return;

    const style=document.createElement('style');
    style.textContent=`
      .events-layout,.territory-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr);gap:18px;flex:1 1 auto;min-height:0;overflow:hidden}
      .events-panel,.territory-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
      .events-head,.territory-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--line)}
      .events-title,.territory-title{font-family:var(--font-display);font-size:1.15rem;font-weight:600}.events-meta,.territory-meta{font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em}
      .events-list{flex:1 1 auto;min-height:0;overflow:hidden}.event-kiosk-row{padding:12px 0;border-bottom:1px solid var(--line)}.event-kiosk-top{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:12px}.event-kiosk-date{font-family:var(--font-mono);font-size:.68rem;color:var(--brass);text-transform:uppercase}.event-kiosk-name{font-weight:600}.event-kiosk-type{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase}.event-kiosk-sub,.event-note{font-size:.72rem;color:var(--text-dim);margin-top:3px}.event-kiosk-results{display:flex;gap:13px;flex-wrap:wrap;margin-top:7px;font-family:var(--font-mono);font-size:.62rem;color:var(--text-muted)}
      .event-stats,.territory-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:16px}.event-stat,.territory-stat{border-top:1px solid var(--line-bright);padding-top:10px}.event-stat-value,.territory-stat-value{font-family:var(--font-display);font-size:1.7rem}.event-stat-label,.territory-stat-label{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase}.events-empty{font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);padding:18px 0}
      .territory-list{display:flex;flex-direction:column;justify-content:space-between;gap:12px;flex:1 1 auto;min-height:0;padding-top:12px}.territory-row{display:grid;grid-template-columns:130px 46px minmax(0,1fr);gap:12px;align-items:center}.territory-name{font-family:var(--font-mono);font-size:.7rem;color:var(--text-muted);text-transform:uppercase}.territory-count{font-family:var(--font-display);font-size:1.35rem;text-align:right}.territory-bar{height:10px;border:1px solid var(--line);background:var(--bg-raised);border-radius:999px;overflow:hidden}.territory-fill{height:100%;background:var(--brass)}
      .territory-stats{margin-bottom:16px}.territory-matrix{display:grid;grid-template-columns:minmax(100px,1.25fr) repeat(4,minmax(54px,.7fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}.territory-cell{padding:8px 7px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-family:var(--font-mono);font-size:.6rem;color:var(--text-muted);text-align:center;white-space:nowrap}.territory-cell.label{text-align:left;color:var(--text)}.territory-cell.head{color:var(--text-dim);text-transform:uppercase;font-size:.54rem}.territory-note{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);line-height:1.45;margin-top:12px}
      @media(max-width:1100px){.events-layout,.territory-layout{grid-template-columns:minmax(0,1.15fr) minmax(285px,.85fr)!important;gap:12px!important}.events-panel,.territory-panel{padding:13px 14px!important}.territory-row{grid-template-columns:105px 36px minmax(0,1fr)!important;gap:8px!important}.territory-cell{padding:6px 4px!important;font-size:.54rem!important}}
      @media(max-height:720px){.event-kiosk-row{padding:8px 0!important}.event-stats,.territory-stats{margin-top:8px!important;margin-bottom:8px!important;gap:8px!important}.territory-list{gap:7px!important;padding-top:7px!important}}
    `;document.head.appendChild(style);

    const events=document.createElement('section');events.className='screen';events.id='eventsScreen';events.innerHTML=`<div class="events-layout"><div class="events-panel"><div class="events-head"><div class="events-title">Upcoming Recruiting Events</div><div class="events-meta" id="eventsUpcomingCount">0 upcoming</div></div><div class="events-list" id="eventsUpcoming"></div></div><div class="events-panel"><div class="events-head"><div class="events-title">Event Results</div><div class="events-meta">Live totals</div></div><div class="event-stats"><div class="event-stat"><div class="event-stat-value" id="eventTotalEvents">0</div><div class="event-stat-label">Tracked events</div></div><div class="event-stat"><div class="event-stat-value" id="eventTotalLeads">0</div><div class="event-stat-label">Leads</div></div><div class="event-stat"><div class="event-stat-value" id="eventTotalAppointments">0</div><div class="event-stat-label">Appointments</div></div><div class="event-stat"><div class="event-stat-value" id="eventTotalQualified">0</div><div class="event-stat-label">Qualified</div></div></div><div class="events-list" id="eventsRecent" style="margin-top:12px"></div></div></div><div class="kiosk-hint">↑ ↓ screens · manage results from phone</div>`;board.insertBefore(events,detail);
    const territory=document.createElement('section');territory.className='screen';territory.id='territoryScreen';territory.innerHTML=`<div class="territory-layout"><div class="territory-panel"><div class="territory-head"><div class="territory-title">Applicants by Area</div><div class="territory-meta" id="territoryAssigned">0 assigned</div></div><div class="territory-list" id="territoryList"></div></div><div class="territory-panel"><div class="territory-head"><div class="territory-title">Territory Picture</div><div class="territory-meta">Live pipeline</div></div><div class="territory-stats"><div class="territory-stat"><div class="territory-stat-value" id="territoryLargest">—</div><div class="territory-stat-label">Largest area</div></div><div class="territory-stat"><div class="territory-stat-value" id="territoryUnassigned">0</div><div class="territory-stat-label">Unassigned</div></div><div class="territory-stat"><div class="territory-stat-value" id="territoryActive">0</div><div class="territory-stat-label">Active</div></div><div class="territory-stat"><div class="territory-stat-value" id="territoryEnlisted">0</div><div class="territory-stat-label">Enlisted</div></div></div><div class="territory-matrix" id="territoryMatrix"></div><div class="territory-note">Stage mix groups early pipeline, processing, Q&amp;E, and enlisted applicants by saved general area.</div></div></div><div class="kiosk-hint">↑ ↓ screens</div>`;board.insertBefore(territory,detail);

    let eventDocs=[],applicants=docsOf(window.__PIBASE_APPLICANTS__),activeExtra=null,routeOrigin=null,eventKey='',territoryKey='',missionKey='';
    const AREAS=['Twin Falls','Burley','Rupert','Filer','Other'],GROUPS=['Early','Processing','Q&E','Enlisted'];
    const esc=v=>{const d=document.createElement('div');d.textContent=v==null?'':String(v);return d.innerHTML},num=v=>Math.max(0,Number(v)||0),parseDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;const[y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d)},today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
    const areaOf=a=>{const raw=(a.generalArea||a.area||a.location||'').trim();return AREAS.includes(raw)?raw:(raw?'Other':'Unassigned')};
    const groupOf=a=>{const s=a.statusStage||'';if(s==='Enlisted')return'Enlisted';if(s==='Q&E'||s==='DEP')return'Q&E';if(s==='Processing Authorized'||s==='Processing Scheduled'||s==='Waiver')return'Processing';return'Early'};
    const setText=(id,v)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(v))el.textContent=v};
    const announce=(id,name)=>window.dispatchEvent(new CustomEvent('pibase:screen-change',{detail:{id,title:name}}));

    const eventRow=(e,results=false)=>{const d=parseDate(e.date),date=d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';return`<div class="event-kiosk-row"><div class="event-kiosk-top"><div class="event-kiosk-date">${esc(date)}</div><div><div class="event-kiosk-name">${esc(e.name||'Unnamed event')}</div><div class="event-kiosk-sub">${[e.location,e.poc].filter(Boolean).map(esc).join(' · ')}</div></div><div class="event-kiosk-type">${esc(e.type||'Event')}</div></div>${results?`<div class="event-kiosk-results"><span>${num(e.leads)} leads</span><span>${num(e.appointments)} appts</span><span>${num(e.qualified)} qualified</span><span>${num(e.contracts)} contracts</span></div>`:''}${results&&e.resultNotes?`<div class="event-note">${esc(e.resultNotes)}</div>`:''}</div>`};
    function renderEvents(force=false){const key=eventDocs.map(e=>[e.id,e.date,e.name,e.location,e.poc,e.type,e.leads,e.appointments,e.qualified,e.contracts,e.resultNotes].join('|')).join('~');if(!force&&key===eventKey)return;eventKey=key;const now=today(),up=[],past=[];let leads=0,appts=0,qualified=0;for(const e of eventDocs){const d=parseDate(e.date);if(d)(d>=now?up:past).push(e);leads+=num(e.leads);appts+=num(e.appointments);qualified+=num(e.qualified)}up.sort((a,b)=>(a.date||'').localeCompare(b.date||''));past.sort((a,b)=>(b.date||'').localeCompare(a.date||''));setText('eventsUpcomingCount',`${up.length} upcoming`);setText('eventTotalEvents',eventDocs.length);setText('eventTotalLeads',leads);setText('eventTotalAppointments',appts);setText('eventTotalQualified',qualified);const u=up.length?up.slice(0,6).map(e=>eventRow(e)).join(''):'<div class="events-empty">No upcoming recruiting events entered in PIBASE.</div>',r=past.length?past.slice(0,4).map(e=>eventRow(e,true)).join(''):'<div class="events-empty">No completed event results yet.</div>';const ue=document.getElementById('eventsUpcoming'),re=document.getElementById('eventsRecent');if(ue&&ue.innerHTML!==u)ue.innerHTML=u;if(re&&re.innerHTML!==r)re.innerHTML=r;}
    function aggregate(){const counts=Object.fromEntries([...AREAS,'Unassigned'].map(a=>[a,0])),matrix=Object.fromEntries(AREAS.map(a=>[a,Object.fromEntries(GROUPS.map(g=>[g,0]))]));let active=0,enlisted=0;for(const a of applicants){const area=areaOf(a);counts[area]=(counts[area]||0)+1;if(a.statusStage==='Enlisted')enlisted++;else active++;if(area!=='Unassigned')matrix[area][groupOf(a)]++;}return{counts,matrix,active,enlisted};}
    function renderTerritory(force=false){const{counts,matrix,active,enlisted}=aggregate(),key=`${AREAS.map(a=>counts[a])}|${counts.Unassigned}|${active}|${enlisted}|${AREAS.flatMap(a=>GROUPS.map(g=>matrix[a][g]))}`;if(!force&&key===territoryKey)return;territoryKey=key;const assigned=AREAS.reduce((s,a)=>s+counts[a],0),max=Math.max(1,...AREAS.map(a=>counts[a]));let largest='—',n=0;for(const a of AREAS)if(counts[a]>n){largest=a;n=counts[a]}setText('territoryAssigned',`${assigned} assigned`);setText('territoryUnassigned',counts.Unassigned);setText('territoryActive',active);setText('territoryEnlisted',enlisted);setText('territoryLargest',largest);const l=AREAS.map(a=>`<div class="territory-row"><div class="territory-name">${esc(a)}</div><div class="territory-count">${counts[a]}</div><div class="territory-bar"><div class="territory-fill" style="width:${counts[a]/max*100}%"></div></div></div>`).join(''),m=`<div class="territory-cell head label">Area</div>${GROUPS.map(g=>`<div class="territory-cell head">${esc(g)}</div>`).join('')}${AREAS.map(a=>`<div class="territory-cell label">${esc(a)}</div>${GROUPS.map(g=>`<div class="territory-cell">${matrix[a][g]}</div>`).join('')}`).join('')}`;const le=document.getElementById('territoryList'),me=document.getElementById('territoryMatrix');if(le&&le.innerHTML!==l)le.innerHTML=l;if(me&&me.innerHTML!==m)me.innerHTML=m;}
    function applyMission(force=false){const m=missionDoc(applicants);if(!m||!pipelineScreen.classList.contains('active'))return;const fy=Number(m.pibaseMissionFiscalYear)||currentFY(),target=Math.max(0,Number(m.pibaseMissionTarget)||0);let enlisted=0,active=0;for(const a of applicants)a.statusStage==='Enlisted'?enlisted++:active++;const remaining=target?Math.max(0,target-enlisted):null,percent=target?Math.round(enlisted/target*100):null,months=Math.max(1,(new Date(fy,8,30,23,59,59)-Date.now())/(1000*60*60*24*30.4375)),pace=target&&remaining?remaining/months:0,key=`${fy}|${target}|${enlisted}|${active}|${remaining}|${percent}|${pace.toFixed(2)}`;if(!force&&key===missionKey)return;missionKey=key;setText('missionTitle',`FY${String(fy).slice(-2)} Recruiting Mission`);const ne=document.getElementById('missionNumber'),html=`${enlisted} <span>/ ${target||'—'}</span>`;if(ne&&ne.innerHTML!==html)ne.innerHTML=html;const p=document.getElementById('missionProgress');if(p)p.style.width=`${target?Math.min(100,enlisted/target*100):0}%`;setText('missionRemaining',remaining===null?'—':remaining);setText('missionPercent',percent===null?'—':`${percent}%`);setText('missionActive',active);setText('missionPace',target?(remaining===0?'0':pace.toFixed(1)):'—');}

    const receive=value=>{applicants=docsOf(value);if(territory.classList.contains('active'))renderTerritory();requestAnimationFrame(()=>applyMission())};if(window.__PIBASE_APPLICANTS__)receive(window.__PIBASE_APPLICANTS__);window.addEventListener('pibase:applicants-snapshot',e=>receive(e.detail));
    onSnapshot(query(collection(db,'events'),orderBy('date','asc')),snap=>{eventDocs=docsOf(snap);if(events.classList.contains('active'))renderEvents();},err=>{console.warn('Recruiting events unavailable',err);const el=document.getElementById('eventsUpcoming');if(el)el.innerHTML='<div class="events-empty">Unable to load recruiting events.</div>';});

    function showExtra(screen,name,origin=routeOrigin){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));screen.classList.add('active');title.textContent=name;activeExtra=screen;routeOrigin=origin;if(screen===events)renderEvents(true);else renderTerritory(true);announce(screen.id,name);}
    function showNative(screen,name){events.classList.remove('active');territory.classList.remove('active');screen.classList.add('active');title.textContent=name;activeExtra=null;if(screen===pipelineScreen)requestAnimationFrame(()=>applyMission(true));announce(screen.id,name);}
    function hideForNative(){events.classList.remove('active');territory.classList.remove('active');activeExtra=null;requestAnimationFrame(()=>announce(document.querySelector('.screen.active')?.id||'',title.textContent));}

    document.addEventListener('keydown',e=>{
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
      if(activeExtra===events){
        if(e.key==='ArrowUp'){
          if(routeOrigin==='pipeline'){e.preventDefault();e.stopPropagation();showNative(pipelineScreen,'Pipeline / Mission');}
          else{hideForNative();}
        }else if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();showExtra(territory,'Territory Analytics');}
        return;
      }
      if(activeExtra===territory){
        if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();showExtra(events,'Recruiting Events');}
        else if(e.key==='ArrowDown'){
          if(routeOrigin==='board'){e.preventDefault();e.stopPropagation();showNative(boardScreen,'Applicant Board');}
          else{hideForNative();}
        }
        return;
      }
      if(e.key==='ArrowDown'&&pipelineScreen.classList.contains('active')){e.preventDefault();e.stopPropagation();showExtra(events,'Recruiting Events','pipeline');}
      else if(e.key==='ArrowUp'&&boardScreen.classList.contains('active')){e.preventDefault();e.stopPropagation();showExtra(territory,'Territory Analytics','board');}
      else if(e.key==='ArrowUp'||e.key==='ArrowDown'){requestAnimationFrame(()=>{applyMission();announce(document.querySelector('.screen.active')?.id||'',title.textContent);});}
    },true);
    window.addEventListener('resize',()=>{if(events.classList.contains('active'))renderEvents();else if(territory.classList.contains('active'))renderTerritory();else requestAnimationFrame(()=>applyMission());});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
