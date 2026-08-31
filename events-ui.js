export function initEventsUi({ db, collection, doc, updateDoc, serverTimestamp, onSnapshot, query, orderBy }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const path = window.location.pathname;
  const isEdit = path.endsWith('/index.html') || path.endsWith('/') || path === '';
  const isKiosk = path.endsWith('/display.html');
  const currentFY = () => { const n=new Date(); return n.getMonth()>=9?n.getFullYear()+1:n.getFullYear(); };
  const missionFromDocs = docs => docs.find(a => Number(a.pibaseMissionTarget)>0 || Number(a.pibaseMissionFiscalYear)>0) || null;

  if (isEdit) {
    const startEdit = () => {
      const addBtn=document.getElementById('addBtn');
      if (addBtn && !document.getElementById('eventsLink')) {
        const link=document.createElement('a');
        link.id='eventsLink'; link.href='events.html'; link.className='add-btn';
        link.style.cssText='display:block;text-align:center;text-decoration:none;margin-bottom:10px;';
        link.textContent='Recruiting events →'; addBtn.parentNode.insertBefore(link,addBtn);
      }

      const fy=document.getElementById('missionFiscalYear'), target=document.getElementById('missionTarget'), save=document.getElementById('saveMissionBtn'), status=document.getElementById('missionStatus');
      if (!fy || !target || !save || !status) return;
      let applicantDocs=[];
      onSnapshot(query(collection(db,'applicants'),orderBy('updatedAt','desc')), snap => {
        applicantDocs=snap.docs.map(d=>({id:d.id,...d.data()}));
        const source=missionFromDocs(applicantDocs);
        if (source) {
          fy.value=Number(source.pibaseMissionFiscalYear)||currentFY();
          target.value=Number(source.pibaseMissionTarget)||'';
        }
      });

      save.addEventListener('click', async e => {
        e.preventDefault(); e.stopImmediatePropagation();
        const fiscalYear=Math.max(2020,Math.min(2100,Number(fy.value)||currentFY()));
        const missionTarget=Math.max(0,Math.round(Number(target.value)||0));
        const host=applicantDocs.find(a=>a.id && a.statusStage) || applicantDocs[0];
        if (!host) { status.style.color='#E08B77'; status.textContent='Add an applicant first, then save mission.'; return; }
        status.textContent='Saving…';
        try {
          await updateDoc(doc(db,'applicants',host.id),{
            pibaseMissionFiscalYear:fiscalYear,
            pibaseMissionTarget:missionTarget,
            pibaseMissionUpdatedAt:serverTimestamp()
          });
          status.style.color=''; status.textContent='Saved.';
          setTimeout(()=>{ if(status.textContent==='Saved.') status.textContent=''; },1800);
        } catch (err) {
          console.error('Mission save failed',err);
          status.style.color='#E08B77';
          status.textContent=err?.code==='permission-denied'?'Mission save blocked by Firebase rules.':'Save failed.';
        }
      }, true);
    };
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',startEdit,{once:true}); else startEdit();
  }

  if (!isKiosk) return;

  const start = () => {
    const board=document.querySelector('.board'),detailView=document.getElementById('detailView'),boardScreen=document.getElementById('boardScreen'),pipelineScreen=document.getElementById('pipelineScreen'),screenTitle=document.getElementById('screenTitle');
    if(!board||!detailView||!boardScreen||!pipelineScreen||!screenTitle||document.getElementById('eventsScreen'))return;

    const style=document.createElement('style');
    style.textContent=`
      .events-layout,.territory-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:18px;flex:1 1 auto;min-height:0;overflow:hidden}
      .events-panel,.territory-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
      .events-head,.territory-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--line);flex:0 0 auto}
      .events-title,.territory-title{font-family:var(--font-display);font-size:1.15rem;font-weight:500}.events-meta,.territory-meta{font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em}
      .events-list{flex:1 1 auto;min-height:0;overflow:hidden}.event-kiosk-row{padding:12px 0;border-bottom:1px solid var(--line)}.event-kiosk-top{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:12px}.event-kiosk-date{font-family:var(--font-mono);font-size:.68rem;color:var(--brass);text-transform:uppercase}.event-kiosk-name{font-weight:500}.event-kiosk-type{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase}.event-kiosk-sub,.event-note{font-size:.72rem;color:var(--text-dim);margin-top:3px}.event-kiosk-results{display:flex;gap:13px;flex-wrap:wrap;margin-top:7px;font-family:var(--font-mono);font-size:.62rem;color:var(--text-muted)}
      .event-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:16px}.event-stat{border-top:1px solid var(--line-bright);padding-top:10px}.event-stat-value{font-family:var(--font-display);font-size:1.7rem}.event-stat-label{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase}.events-empty{font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);padding:18px 0}
      .territory-list{display:flex;flex-direction:column;justify-content:space-between;gap:12px;flex:1 1 auto;min-height:0;padding-top:12px}.territory-row{display:grid;grid-template-columns:130px 46px minmax(0,1fr);gap:12px;align-items:center}.territory-name{font-family:var(--font-mono);font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}.territory-count{font-family:var(--font-display);font-size:1.35rem;text-align:right}.territory-bar{height:10px;border:1px solid var(--line);background:var(--bg-raised);border-radius:999px;overflow:hidden}.territory-fill{height:100%;background:var(--brass)}
      .territory-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:14px 0 16px}.territory-stat{border-top:1px solid var(--line-bright);padding-top:10px}.territory-stat-value{font-family:var(--font-display);font-size:1.7rem}.territory-stat-label{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.07em}
      .territory-matrix{display:grid;grid-template-columns:minmax(100px,1.25fr) repeat(4,minmax(54px,.7fr));gap:0;overflow:hidden;border-top:1px solid var(--line);border-left:1px solid var(--line)}.territory-cell{padding:8px 7px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);font-family:var(--font-mono);font-size:.6rem;color:var(--text-muted);text-align:center;white-space:nowrap}.territory-cell.label{text-align:left;color:var(--text)}.territory-cell.head{color:var(--text-dim);text-transform:uppercase;font-size:.54rem;letter-spacing:.04em}.territory-note{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);line-height:1.45;margin-top:12px}
      @media(max-width:1000px){.events-layout,.territory-layout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const eventsScreen=document.createElement('section');eventsScreen.className='screen';eventsScreen.id='eventsScreen';eventsScreen.innerHTML=`<div class="events-layout"><div class="events-panel"><div class="events-head"><div class="events-title">Upcoming Recruiting Events</div><div class="events-meta" id="eventsUpcomingCount">0 upcoming</div></div><div class="events-list" id="eventsUpcoming"></div></div><div class="events-panel"><div class="events-head"><div class="events-title">Event Results</div><div class="events-meta">Live totals</div></div><div class="event-stats"><div class="event-stat"><div class="event-stat-value" id="eventTotalEvents">0</div><div class="event-stat-label">Tracked events</div></div><div class="event-stat"><div class="event-stat-value" id="eventTotalLeads">0</div><div class="event-stat-label">Leads</div></div><div class="event-stat"><div class="event-stat-value" id="eventTotalAppointments">0</div><div class="event-stat-label">Appointments</div></div><div class="event-stat"><div class="event-stat-value" id="eventTotalQualified">0</div><div class="event-stat-label">Qualified</div></div></div><div class="events-list" id="eventsRecent" style="margin-top:12px"></div></div></div><div class="kiosk-hint">↑ ↓ screens · manage results from phone</div>`;board.insertBefore(eventsScreen,detailView);

    const territoryScreen=document.createElement('section');territoryScreen.className='screen';territoryScreen.id='territoryScreen';territoryScreen.innerHTML=`<div class="territory-layout"><div class="territory-panel"><div class="territory-head"><div class="territory-title">Applicants by Area</div><div class="territory-meta" id="territoryAssigned">0 assigned</div></div><div class="territory-list" id="territoryList"></div></div><div class="territory-panel"><div class="territory-head"><div class="territory-title">Territory Picture</div><div class="territory-meta">Live pipeline</div></div><div class="territory-stats"><div class="territory-stat"><div class="territory-stat-value" id="territoryLargest">—</div><div class="territory-stat-label">Largest area</div></div><div class="territory-stat"><div class="territory-stat-value" id="territoryUnassigned">0</div><div class="territory-stat-label">Unassigned</div></div><div class="territory-stat"><div class="territory-stat-value" id="territoryActive">0</div><div class="territory-stat-label">Active</div></div><div class="territory-stat"><div class="territory-stat-value" id="territoryEnlisted">0</div><div class="territory-stat-label">Enlisted</div></div></div><div class="territory-matrix" id="territoryMatrix"></div><div class="territory-note">Stage mix groups early pipeline, processing, Q&amp;E, and enlisted applicants by their saved general area.</div></div></div><div class="kiosk-hint">↑ ↓ screens</div>`;board.insertBefore(territoryScreen,detailView);

    let eventDocs=[], applicantDocs=[], enhancementScreen=null;
    const esc=v=>{const d=document.createElement('div');d.textContent=v==null?'':String(v);return d.innerHTML},num=v=>Math.max(0,Number(v)||0),parseDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;const[y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d)},today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
    const row=(e,results=false)=>{const d=parseDate(e.date),date=d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';return `<div class="event-kiosk-row"><div class="event-kiosk-top"><div class="event-kiosk-date">${esc(date)}</div><div><div class="event-kiosk-name">${esc(e.name||'Unnamed event')}</div><div class="event-kiosk-sub">${[e.location,e.poc].filter(Boolean).map(esc).join(' · ')}</div></div><div class="event-kiosk-type">${esc(e.type||'Event')}</div></div>${results?`<div class="event-kiosk-results"><span>${num(e.leads)} leads</span><span>${num(e.appointments)} appts</span><span>${num(e.qualified)} qualified</span><span>${num(e.contracts)} contracts</span></div>`:''}${results&&e.resultNotes?`<div class="event-note">${esc(e.resultNotes)}</div>`:''}</div>`};
    function renderEvents(){const now=today(),up=eventDocs.filter(e=>{const d=parseDate(e.date);return d&&d>=now}).sort((a,b)=>(a.date||'').localeCompare(b.date||'')),past=eventDocs.filter(e=>{const d=parseDate(e.date);return d&&d<now}).sort((a,b)=>(b.date||'').localeCompare(a.date||''));document.getElementById('eventsUpcomingCount').textContent=`${up.length} upcoming`;document.getElementById('eventTotalEvents').textContent=eventDocs.length;document.getElementById('eventTotalLeads').textContent=eventDocs.reduce((s,e)=>s+num(e.leads),0);document.getElementById('eventTotalAppointments').textContent=eventDocs.reduce((s,e)=>s+num(e.appointments),0);document.getElementById('eventTotalQualified').textContent=eventDocs.reduce((s,e)=>s+num(e.qualified),0);document.getElementById('eventsUpcoming').innerHTML=up.length?up.slice(0,6).map(e=>row(e)).join(''):'<div class="events-empty">No upcoming recruiting events entered in PIBASE.</div>';document.getElementById('eventsRecent').innerHTML=past.length?past.slice(0,4).map(e=>row(e,true)).join(''):'<div class="events-empty">No completed event results yet.</div>';}

    const AREAS=['Twin Falls','Burley','Rupert','Filer','Other'];
    function areaOf(a){const raw=(a.generalArea||a.area||a.location||'').trim();return AREAS.includes(raw)?raw:(raw?'Other':'Unassigned');}
    function stageGroup(a){const s=a.statusStage||'';if(s==='Enlisted')return'Enlisted';if(s==='Q&E'||s==='DEP')return'Q&E';if(s==='Processing Authorized'||s==='Processing Scheduled'||s==='Waiver')return'Processing';return'Early';}
    function renderTerritory(){const counts=AREAS.map(area=>({area,count:applicantDocs.filter(a=>areaOf(a)===area).length})),assigned=counts.reduce((s,x)=>s+x.count,0),unassigned=applicantDocs.filter(a=>areaOf(a)==='Unassigned').length,max=Math.max(1,...counts.map(x=>x.count)),largest=[...counts].sort((a,b)=>b.count-a.count)[0];document.getElementById('territoryAssigned').textContent=`${assigned} assigned`;document.getElementById('territoryUnassigned').textContent=unassigned;document.getElementById('territoryActive').textContent=applicantDocs.filter(a=>a.statusStage!=='Enlisted').length;document.getElementById('territoryEnlisted').textContent=applicantDocs.filter(a=>a.statusStage==='Enlisted').length;document.getElementById('territoryLargest').textContent=largest&&largest.count?largest.area:'—';document.getElementById('territoryList').innerHTML=counts.map(x=>`<div class="territory-row"><div class="territory-name">${esc(x.area)}</div><div class="territory-count">${x.count}</div><div class="territory-bar"><div class="territory-fill" style="width:${x.count/max*100}%"></div></div></div>`).join('');const groups=['Early','Processing','Q&E','Enlisted'];document.getElementById('territoryMatrix').innerHTML=`<div class="territory-cell head label">Area</div>${groups.map(g=>`<div class="territory-cell head">${esc(g)}</div>`).join('')}${AREAS.map(area=>`<div class="territory-cell label">${esc(area)}</div>${groups.map(g=>`<div class="territory-cell">${applicantDocs.filter(a=>areaOf(a)===area&&stageGroup(a)===g).length}</div>`).join('')}`).join('')}`;}

    function monthsRemaining(fy){const end=new Date(fy,8,30,23,59,59);return Math.max(1,(end-Date.now())/(1000*60*60*24*30.4375));}
    function applyMission(){const source=missionFromDocs(applicantDocs);if(!source)return;const fy=Number(source.pibaseMissionFiscalYear)||currentFY(),target=Math.max(0,Number(source.pibaseMissionTarget)||0),enlisted=applicantDocs.filter(a=>a.statusStage==='Enlisted').length,remaining=target?Math.max(0,target-enlisted):null,percent=target?Math.round(enlisted/target*100):null,active=applicantDocs.filter(a=>a.statusStage!=='Enlisted').length,pace=target&&remaining?remaining/monthsRemaining(fy):0;const set=(id,val)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(val))el.textContent=val};set('missionTitle',`FY${String(fy).slice(-2)} Recruiting Mission`);const number=document.getElementById('missionNumber');if(number)number.innerHTML=`${enlisted} <span>/ ${target||'—'}</span>`;const progress=document.getElementById('missionProgress');if(progress)progress.style.width=`${target?Math.min(100,enlisted/target*100):0}%`;set('missionRemaining',remaining===null?'—':remaining);set('missionPercent',percent===null?'—':`${percent}%`);set('missionActive',active);set('missionPace',target?(remaining===0?'0':pace.toFixed(1)):'—');}

    const observer=new MutationObserver(()=>requestAnimationFrame(applyMission));observer.observe(pipelineScreen,{subtree:true,childList:true,characterData:true,attributes:true});
    onSnapshot(query(collection(db,'applicants'),orderBy('updatedAt','desc')),snap=>{applicantDocs=snap.docs.map(d=>({id:d.id,...d.data()}));applyMission();renderTerritory();});
    onSnapshot(query(collection(db,'events'),orderBy('date','asc')),snap=>{eventDocs=snap.docs.map(d=>({id:d.id,...d.data()}));renderEvents();},err=>{console.warn('Recruiting events unavailable',err);document.getElementById('eventsUpcoming').innerHTML='<div class="events-empty">Unable to load recruiting events.</div>';});

    function activate(screen,title){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));screen.classList.add('active');screenTitle.textContent=title;enhancementScreen=screen;if(screen===eventsScreen)renderEvents();if(screen===territoryScreen)renderTerritory();}
    function leaveTo(screen,title){eventsScreen.classList.remove('active');territoryScreen.classList.remove('active');screen.classList.add('active');screenTitle.textContent=title;enhancementScreen=null;requestAnimationFrame(applyMission);}
    document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
      if(enhancementScreen===eventsScreen){if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();leaveTo(pipelineScreen,'Pipeline / Mission');}else if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();activate(territoryScreen,'Territory Analytics');}return;}
      if(enhancementScreen===territoryScreen){if(e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();activate(eventsScreen,'Recruiting Events');}else if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();leaveTo(boardScreen,'Applicant Board');}return;}
      if(e.key==='ArrowDown'&&pipelineScreen.classList.contains('active')){e.preventDefault();e.stopPropagation();activate(eventsScreen,'Recruiting Events');}
      else if(e.key==='ArrowUp'&&boardScreen.classList.contains('active')){e.preventDefault();e.stopPropagation();activate(territoryScreen,'Territory Analytics');}
    },true);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
