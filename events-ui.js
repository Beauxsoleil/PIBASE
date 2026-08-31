export function initEventsUi({ db, collection, onSnapshot, query, orderBy }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const path = window.location.pathname;
  const isEdit = path.endsWith('/index.html') || path.endsWith('/') || path === '';
  const isKiosk = path.endsWith('/display.html');

  if (isEdit) {
    const installLink = () => {
      const listScreen = document.getElementById('listScreen');
      const addBtn = document.getElementById('addBtn');
      if (!listScreen || !addBtn || document.getElementById('eventsLink')) return;
      const link = document.createElement('a');
      link.id = 'eventsLink';
      link.href = 'events.html';
      link.className = 'add-btn';
      link.style.cssText = 'display:block;text-align:center;text-decoration:none;margin-bottom:10px;';
      link.textContent = 'Recruiting events →';
      addBtn.parentNode.insertBefore(link, addBtn);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLink, { once:true });
    else installLink();
  }

  if (!isKiosk) return;

  const start = () => {
    const board = document.querySelector('.board');
    const detailView = document.getElementById('detailView');
    const boardScreen = document.getElementById('boardScreen');
    const pipelineScreen = document.getElementById('pipelineScreen');
    const screenTitle = document.getElementById('screenTitle');
    if (!board || !detailView || !boardScreen || !pipelineScreen || !screenTitle || document.getElementById('eventsScreen')) return;

    const style = document.createElement('style');
    style.textContent = `
      .events-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:18px;flex:1 1 auto;min-height:0;overflow:hidden}
      .events-panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
      .events-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--line);flex:0 0 auto}
      .events-title{font-family:var(--font-display);font-size:1.15rem;font-weight:500}.events-meta{font-family:var(--font-mono);font-size:.62rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em}
      .events-list{flex:1 1 auto;min-height:0;overflow:hidden}.event-kiosk-row{padding:12px 0;border-bottom:1px solid var(--line)}.event-kiosk-row:last-child{border-bottom:0}
      .event-kiosk-top{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:12px;align-items:start}.event-kiosk-date{font-family:var(--font-mono);font-size:.68rem;color:var(--brass);text-transform:uppercase}.event-kiosk-name{font-weight:500;color:var(--text);line-height:1.3}.event-kiosk-type{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em}.event-kiosk-sub{font-size:.72rem;color:var(--text-dim);margin-top:3px}.event-kiosk-results{display:flex;gap:13px;flex-wrap:wrap;margin-top:7px;font-family:var(--font-mono);font-size:.62rem;color:var(--text-muted)}
      .event-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:16px}.event-stat{border-top:1px solid var(--line-bright);padding-top:10px}.event-stat-value{font-family:var(--font-display);font-size:1.7rem;color:var(--text)}.event-stat-label{font-family:var(--font-mono);font-size:.58rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em}
      .events-empty{font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim);padding:18px 0}.event-note{font-size:.76rem;color:var(--text-muted);line-height:1.4;margin-top:7px}
      @media(max-width:1000px){.events-layout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const screen = document.createElement('section');
    screen.className = 'screen';
    screen.id = 'eventsScreen';
    screen.innerHTML = `
      <div class="events-layout">
        <div class="events-panel">
          <div class="events-head"><div class="events-title">Upcoming Recruiting Events</div><div class="events-meta" id="eventsUpcomingCount">0 upcoming</div></div>
          <div class="events-list" id="eventsUpcoming"></div>
        </div>
        <div class="events-panel">
          <div class="events-head"><div class="events-title">Event Results</div><div class="events-meta" id="eventsResultsMeta">Live totals</div></div>
          <div class="event-stats">
            <div class="event-stat"><div class="event-stat-value" id="eventTotalEvents">0</div><div class="event-stat-label">Tracked events</div></div>
            <div class="event-stat"><div class="event-stat-value" id="eventTotalLeads">0</div><div class="event-stat-label">Leads</div></div>
            <div class="event-stat"><div class="event-stat-value" id="eventTotalAppointments">0</div><div class="event-stat-label">Appointments</div></div>
            <div class="event-stat"><div class="event-stat-value" id="eventTotalQualified">0</div><div class="event-stat-label">Qualified</div></div>
          </div>
          <div class="events-list" id="eventsRecent" style="margin-top:12px"></div>
        </div>
      </div>
      <div class="kiosk-hint">↑ ↓ screens · manage results from phone</div>`;
    board.insertBefore(screen, detailView);

    let docs = [];
    let eventsActive = false;
    let origin = 'pipeline';

    const escapeHtml = value => { const d=document.createElement('div'); d.textContent=value==null?'':String(value); return d.innerHTML; };
    const parseDate = value => { if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return null; const [y,m,d]=value.split('-').map(Number); return new Date(y,m-1,d); };
    const today = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
    const num = value => Math.max(0, Number(value)||0);
    const visibleRows = (container, selector) => {
      const row=container.querySelector(selector); if(!row) return 1;
      const h=row.getBoundingClientRect().height || 1;
      return Math.max(1,Math.floor(container.getBoundingClientRect().height/h));
    };
    const eventRow = (e, showResults=false) => {
      const d=parseDate(e.date); const date=d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
      const results = num(e.leads)+num(e.appointments)+num(e.qualified)+num(e.contracts);
      return `<div class="event-kiosk-row"><div class="event-kiosk-top"><div class="event-kiosk-date">${escapeHtml(date)}</div><div><div class="event-kiosk-name">${escapeHtml(e.name||'Unnamed event')}</div><div class="event-kiosk-sub">${[e.location,e.poc].filter(Boolean).map(escapeHtml).join(' · ')}</div></div><div class="event-kiosk-type">${escapeHtml(e.type||'Event')}</div></div>${showResults&&results?`<div class="event-kiosk-results"><span>${num(e.leads)} leads</span><span>${num(e.appointments)} appts</span><span>${num(e.qualified)} qualified</span><span>${num(e.contracts)} contracts</span></div>`:''}${showResults&&e.resultNotes?`<div class="event-note">${escapeHtml(e.resultNotes)}</div>`:''}</div>`;
    };

    function renderEvents() {
      const now=today();
      const upcoming=docs.filter(e=>{const d=parseDate(e.date);return d&&d>=now}).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      const recent=docs.filter(e=>{const d=parseDate(e.date);return d&&d<now}).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      const up=document.getElementById('eventsUpcoming'), rec=document.getElementById('eventsRecent');
      document.getElementById('eventsUpcomingCount').textContent=`${upcoming.length} upcoming`;
      document.getElementById('eventTotalEvents').textContent=docs.length;
      document.getElementById('eventTotalLeads').textContent=docs.reduce((s,e)=>s+num(e.leads),0);
      document.getElementById('eventTotalAppointments').textContent=docs.reduce((s,e)=>s+num(e.appointments),0);
      document.getElementById('eventTotalQualified').textContent=docs.reduce((s,e)=>s+num(e.qualified),0);
      up.innerHTML=upcoming.length?upcoming.map(e=>eventRow(e,false)).join(''):'<div class="events-empty">No upcoming recruiting events entered in PIBASE.</div>';
      rec.innerHTML=recent.length?recent.map(e=>eventRow(e,true)).join(''):'<div class="events-empty">No completed event results yet.</div>';
      requestAnimationFrame(()=>{
        if(upcoming.length){const count=visibleRows(up,'.event-kiosk-row');up.innerHTML=upcoming.slice(0,count).map(e=>eventRow(e,false)).join('')}
        if(recent.length){const count=visibleRows(rec,'.event-kiosk-row');rec.innerHTML=recent.slice(0,count).map(e=>eventRow(e,true)).join('')}
      });
    }

    function showEvents(from) {
      origin=from;
      document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
      screen.classList.add('active');
      screenTitle.textContent='Recruiting Events';
      eventsActive=true;
      renderEvents();
    }
    function showPipeline() {
      screen.classList.remove('active');
      pipelineScreen.classList.add('active');
      screenTitle.textContent='Pipeline / Mission';
      eventsActive=false;
    }
    function showBoard() {
      screen.classList.remove('active');
      boardScreen.classList.add('active');
      screenTitle.textContent='Applicant Board';
      eventsActive=false;
    }
    function hideForNativeNavigation(){screen.classList.remove('active');eventsActive=false;}

    document.addEventListener('keydown', e => {
      if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey) return;
      if(eventsActive){
        if(e.key==='ArrowUp'){
          if(origin==='pipeline'){e.preventDefault();e.stopPropagation();showPipeline();}
          else {hideForNativeNavigation();}
        } else if(e.key==='ArrowDown'){
          if(origin==='board'){e.preventDefault();e.stopPropagation();showBoard();}
          else {hideForNativeNavigation();}
        }
        return;
      }
      if(e.key==='ArrowDown'&&pipelineScreen.classList.contains('active')){e.preventDefault();e.stopPropagation();showEvents('pipeline');}
      else if(e.key==='ArrowUp'&&boardScreen.classList.contains('active')){e.preventDefault();e.stopPropagation();showEvents('board');}
    }, true);

    window.addEventListener('resize',()=>{if(eventsActive)renderEvents()});
    onSnapshot(query(collection(db,'events'),orderBy('date','asc')), snap => { docs=snap.docs.map(d=>({id:d.id,...d.data()})); renderEvents(); }, err => { console.warn('Recruiting events unavailable',err); document.getElementById('eventsUpcoming').innerHTML='<div class="events-empty">Unable to load recruiting events.</div>'; });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
}
