/* ═══ CONFIG ═══ */
const SUPABASE_URL='https://rorpaiigbmhssjosupqw.supabase.co';
const SUPABASE_KEY='sb_publishable_tfkjoO-gpHWP24kBMTnXog_vU8FHYEm';
const THEME_KEY='webwynk-theme', SESSION_KEY='webwynk-session';

const {createClient}=supabase;
const db=createClient(SUPABASE_URL,SUPABASE_KEY);

/* ═══ STATE ═══ */
let session=null, allLeads=[], allStatuses={}, allCallers=[], allCampaigns=[];
let filteredLeads=[], currentPage=1, pageSize=20;
let currentCampaignId=null, currentStatusTab='all';
let myCurrentCampaignId=null, myCurrentStatusTab='all';
let myLeadsFiltered=[], myLeadsPage=1;
let currentDrawerLeadId=null, editingCallerId=null;
let filterTimeout=null, realtimeChannel=null;
let activityPage=1, callerProgressPage=1;
const ACTIVITY_PER_PAGE=5, CALLERS_PER_PAGE=5;

/* ═══ THEME ═══ */
(function initTheme(){
  const t=localStorage.getItem(THEME_KEY)||'light';
  document.documentElement.setAttribute('data-theme',t);
  updateThemeIcons(t);
})();

function toggleTheme(){
  const c=document.documentElement.getAttribute('data-theme');
  const n=c==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',n);
  localStorage.setItem(THEME_KEY,n);
  updateThemeIcons(n);
}
function updateThemeIcons(t){
  const moon=`<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>`;
  const sun=`<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
  const icon=t==='dark'?sun:moon;
  ['theme-icon-login','theme-icon-app'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=icon;});
}

/* ═══ SCREENS ═══ */
function showScreen(n){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-'+n).classList.add('active');}

/* ═══ AUTH ═══ */
function switchLoginTab(t){
  document.getElementById('tab-admin').classList.toggle('active',t==='admin');
  document.getElementById('tab-caller').classList.toggle('active',t==='caller');
  document.getElementById('login-username').value='';
  document.getElementById('login-password').value='';
  hideLoginError();
}
function togglePwVisibility(){const i=document.getElementById('login-password');i.type=i.type==='password'?'text':'password';}
function showLoginError(m){const e=document.getElementById('login-error');e.textContent=m;e.classList.add('show');}
function hideLoginError(){document.getElementById('login-error').classList.remove('show');}

async function handleLogin(){
  hideLoginError();
  const isAdmin=document.getElementById('tab-admin').classList.contains('active');
  const username=document.getElementById('login-username').value.trim();
  const password=document.getElementById('login-password').value;
  if(!username||!password){showLoginError('Please enter username and password.');return;}
  setLoginLoading(true);
  try{
    if(isAdmin){
      const{data,error}=await db.from('callers').select('*').eq('username',username).eq('password',password).eq('role','admin').eq('is_active',true).maybeSingle();
      if(error||!data)showLoginError('Invalid admin credentials.');
      else{session={role:'admin',id:data.id,name:data.name,username:data.username};saveSession();await initApp();showScreen('app');}
    } else {
      const{data,error}=await db.from('callers').select('*').eq('username',username).eq('password',password).eq('role','caller').eq('is_active',true).maybeSingle();
      if(error||!data)showLoginError('Invalid credentials or account inactive.');
      else{session={role:'caller',id:data.id,name:data.name,username:data.username};saveSession();await initApp();showScreen('app');}
    }
  }catch(e){console.error('Login error details:',e);showLoginError('Connection error. Please try again.');}
  finally{setLoginLoading(false);}
}
function setLoginLoading(l){
  document.getElementById('btn-login').disabled=l;
  document.getElementById('login-btn-text').textContent=l?'Signing in…':'Sign In';
  document.getElementById('login-spinner').style.display=l?'block':'none';
}
function saveSession(){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}
function loadSession(){return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}
function logout(){sessionStorage.removeItem(SESSION_KEY);session=null;allLeads=[];allStatuses={};allCallers=[];allCampaigns=[];if(realtimeChannel)db.removeChannel(realtimeChannel);history.replaceState(null,'',window.location.pathname);showScreen('login');}

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('screen-login').classList.contains('active'))handleLogin();});

/* ═══ APP INIT ═══ */
async function initApp(){
  applyRoleUI();updateUserBadge();
  await Promise.all([loadCampaigns(),loadCallers()]);
  await loadLeads();
  setupRealtime();
  if(session.role==='caller')loadMyLeads();
}
function applyRoleUI(){
  const isAdmin=session.role==='admin';
  document.querySelectorAll('.admin-only').forEach(el=>el.style.display=isAdmin?'':'none');
  const myNav=document.getElementById('nav-my-leads');
  if(myNav)myNav.style.display=isAdmin?'none':'';
  document.getElementById('role-dot').style.background=isAdmin?'var(--purple)':'var(--green)';
}
function updateUserBadge(){
  const initials=session.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent=initials;
  document.getElementById('user-display-name').textContent=session.name+(session.role==='admin'?' (Admin)':'');
}

/* ═══ DATA LOADING ═══ */
async function loadCampaigns(){
  const{data}=await db.from('campaigns').select('*').order('added_date',{ascending:true});
  allCampaigns=data||[];
  document.getElementById('nav-count-campaigns').textContent=allCampaigns.length;
  if(allCampaigns.length>0&&!currentCampaignId)currentCampaignId=allCampaigns[0].id;
  if(allCampaigns.length>0&&!myCurrentCampaignId)myCurrentCampaignId=allCampaigns[0].id;
}
async function loadLeads(){
  const{data:leads}=await db.from('leads').select('*').order('lead_num');
  const{data:statuses}=await db.from('lead_status').select('*, callers(name,id)');
  allLeads=leads||[];
  allStatuses={};
  (statuses||[]).forEach(s=>{allStatuses[s.lead_id]=s;});
  document.getElementById('nav-count-leads').textContent=allLeads.length;
  filteredLeads=[...allLeads];
  renderCampaignTabs();
  applyFilters();
}
async function loadCallers(){
  const{data}=await db.from('callers').select('*').eq('role','caller').order('name');
  allCallers=data||[];
  document.getElementById('nav-count-callers').textContent=allCallers.length;
  const fcEl=document.getElementById('filter-caller');
  fcEl.innerHTML='<option value="">All Callers</option>';
  allCallers.forEach(c=>{fcEl.innerHTML+=`<option value="${c.id}">${esc(c.name)}</option>`;});
  const dsEl=document.getElementById('drawer-caller-select');
  if(dsEl){
    dsEl.innerHTML='<option value="">Unassigned</option>';
    allCallers.forEach(c=>{dsEl.innerHTML+=`<option value="${c.id}">${esc(c.name)}</option>`;});
  }
}

/* ═══ REALTIME ═══ */
function setupRealtime(){
  realtimeChannel=db.channel('lead_status_rt')
    .on('postgres_changes',{event:'*',schema:'public',table:'lead_status'},(payload)=>{
      handleRealtimeUpdate(payload);
    })
    .subscribe();
}
async function handleRealtimeUpdate(payload){
  const record=payload.new||{};
  if(!record.lead_id)return;
  // Refresh the status from DB
  const{data}=await db.from('lead_status').select('*,callers(name,id)').eq('lead_id',record.lead_id).single();
  if(data)allStatuses[record.lead_id]=data;
  updateStatusTabCounts();
  renderLeadsTable();
  if(session?.role==='caller')applyMyFilters();
  loadDashboard();
}

/* ═══ VIEW SWITCHING + HASH ROUTING ═══ */
const VALID_VIEWS=['dashboard','all-leads','my-leads','campaigns','callers'];

function showView(v,{updateHash=true}={}){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const vEl=document.getElementById('view-'+v);if(vEl)vEl.classList.add('active');
  const nEl=document.getElementById('nav-'+v);if(nEl)nEl.classList.add('active');
  if(v==='dashboard')loadDashboard();
  if(v==='callers')renderCallersTable();
  if(v==='campaigns')renderCampaignsTable();
  if(v==='all-leads'){renderCampaignTabs();applyFilters();}
  if(v==='my-leads'){renderMyCampaignTabs();applyMyFilters();}
  if(updateHash){
    const newHash='#/'+v;
    if(window.location.hash!==newHash)history.pushState(null,'',newHash);
  }
  if(window.innerWidth<768)closeSidebar();
}

function navigateFromHash(){
  const hash=window.location.hash||'';
  const match=hash.match(/^#\/(.+)$/);
  const view=match&&VALID_VIEWS.includes(match[1])?match[1]:'dashboard';
  // Only navigate if the view is accessible for this role
  if((view==='callers'||view==='campaigns')&&session?.role!=='admin')return showView('dashboard',{updateHash:true});
  if(view==='my-leads'&&session?.role!=='caller')return showView('dashboard',{updateHash:true});
  showView(view,{updateHash:true});
}

window.addEventListener('popstate',()=>{
  if(document.getElementById('screen-app').classList.contains('active'))navigateFromHash();
});

/* ═══ CAMPAIGN TABS ═══ */
function renderCampaignTabs(){
  const bar=document.getElementById('campaign-tabs-bar');
  const isAdmin=session&&session.role==='admin';
  bar.innerHTML=allCampaigns.map(c=>{
    const cLeads=allLeads.filter(l=>l.campaign_id===c.id);
    const dateLabel=formatDate(c.added_date);
    return `<button class="campaign-tab ${c.id===currentCampaignId?'active':''}" onclick="selectCampaign('${c.id}')">
      <span class="campaign-tab-name">${esc(c.name)}</span>
      <span class="campaign-tab-meta">${dateLabel} <span class="campaign-tab-count">${cLeads.length}</span></span>
    </button>`;
  }).join('')+(isAdmin?`<button class="campaign-tab-add" onclick="openCreateCampaignModal()">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New
  </button>`:'');
  updateCampaignInfoRow();
  updateStatusTabCounts();
}

function renderMyCampaignTabs(){
  const bar=document.getElementById('my-campaign-tabs-bar');
  bar.innerHTML=allCampaigns.map(c=>{
    const cLeads=allLeads.filter(l=>l.campaign_id===c.id&&(allStatuses[l.id]?.caller_id===session.id));
    const dateLabel=formatDate(c.added_date);
    return `<button class="campaign-tab ${c.id===myCurrentCampaignId?'active':''}" onclick="selectMyCampaign('${c.id}')">
      <span class="campaign-tab-name">${esc(c.name)}</span>
      <span class="campaign-tab-meta">${dateLabel} <span class="campaign-tab-count">${cLeads.length}</span></span>
    </button>`;
  }).join('');
  updateMyStatusTabCounts();
}

function selectCampaign(id){
  currentCampaignId=id;currentPage=1;currentStatusTab='all';
  renderCampaignTabs();setStatusTab('all');
}
function selectMyCampaign(id){
  myCurrentCampaignId=id;myLeadsPage=1;myCurrentStatusTab='all';
  renderMyCampaignTabs();setMyStatusTab('all');
}

function updateCampaignInfoRow(){
  const c=allCampaigns.find(c=>c.id===currentCampaignId);
  const el=document.getElementById('campaign-industry-label');
  if(c)el.textContent=c.industry||c.name;
  else el.textContent='';
}

/* ═══ STATUS TABS ═══ */
function setStatusTab(s){
  currentStatusTab=s;currentPage=1;
  document.querySelectorAll('#status-tabs-bar .status-tab').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.status===s);
  });
  applyFilters();
}

function setMyStatusTab(s){
  myCurrentStatusTab=s;myLeadsPage=1;
  document.querySelectorAll('#my-status-tabs-bar .status-tab').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.status===s);
  });
  applyMyFilters();
}

function updateStatusTabCounts(){
  if(!currentCampaignId)return;
  const cLeads=allLeads.filter(l=>l.campaign_id===currentCampaignId);
  const total=cLeads.length;
  const called=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='called').length;
  const voicemail=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='voicemail').length;
  const notRespond=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='not_respond').length;
  const fu=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='follow_up').length;
  const interested=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='interested').length;
  const onboard=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='onboard').length;
  const nc=total-called-voicemail-notRespond-fu-interested-onboard;
  document.getElementById('stab-all').textContent=total;
  document.getElementById('stab-not-called').textContent=nc;
  document.getElementById('stab-called').textContent=called;
  const sv=document.getElementById('stab-voicemail');if(sv)sv.textContent=voicemail;
  const snr=document.getElementById('stab-not-respond');if(snr)snr.textContent=notRespond;
  document.getElementById('stab-follow-up').textContent=fu;
  const si=document.getElementById('stab-interested');if(si)si.textContent=interested;
  const so=document.getElementById('stab-onboard');if(so)so.textContent=onboard;
}

function updateMyStatusTabCounts(){
  if(!myCurrentCampaignId||!session)return;
  const cLeads=allLeads.filter(l=>l.campaign_id===myCurrentCampaignId&&allStatuses[l.id]?.caller_id===session.id);
  const total=cLeads.length;
  const called=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='called').length;
  const voicemail=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='voicemail').length;
  const notRespond=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='not_respond').length;
  const fu=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='follow_up').length;
  const interested=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='interested').length;
  const onboard=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='onboard').length;
  const nc=total-called-voicemail-notRespond-fu-interested-onboard;
  document.getElementById('my-stab-all').textContent=total;
  document.getElementById('my-stab-not-called').textContent=nc;
  document.getElementById('my-stab-called').textContent=called;
  const sv=document.getElementById('my-stab-voicemail');if(sv)sv.textContent=voicemail;
  const snr=document.getElementById('my-stab-not-respond');if(snr)snr.textContent=notRespond;
  document.getElementById('my-stab-follow-up').textContent=fu;
  const si=document.getElementById('my-stab-interested');if(si)si.textContent=interested;
  const so=document.getElementById('my-stab-onboard');if(so)so.textContent=onboard;
}

/* ═══ FILTER & RENDER LEADS ═══ */
function applyFilters(){
  const search=document.getElementById('search-leads').value.toLowerCase().trim();
  const callerF=document.getElementById('filter-caller').value;
  const serviceF=document.getElementById('filter-service').value;
  const sevF=document.getElementById('filter-severity').value;
  const sortV=document.getElementById('sort-leads').value;

  let base=currentCampaignId?allLeads.filter(l=>l.campaign_id===currentCampaignId):allLeads;

  // Status tab filter
  if(currentStatusTab!=='all'){
    base=base.filter(l=>(allStatuses[l.id]?.status||'not_called')===currentStatusTab);
  }

  filteredLeads=base.filter(lead=>{
    const ls=allStatuses[lead.id]||{};
    if(search&&!lead.name.toLowerCase().includes(search)&&!lead.phone?.includes(search)&&!lead.website?.toLowerCase().includes(search))return false;
    if(callerF&&ls.caller_id!==callerF)return false;
    if(serviceF&&!(lead.services||[]).includes(serviceF))return false;
    if(sevF){
      const sev=lead.severity_score;
      if(sevF==='critical'&&sev<9)return false;
      if(sevF==='high'&&(sev<7||sev>8))return false;
      if(sevF==='medium'&&(sev<5||sev>6))return false;
      if(sevF==='low'&&sev>4)return false;
    }
    return true;
  });

  filteredLeads.sort((a,b)=>{
    if(sortV==='sev-desc')return b.severity_score-a.severity_score;
    if(sortV==='name-asc')return a.name.localeCompare(b.name);
    if(sortV==='date-desc')return new Date(b.added_date)-new Date(a.added_date);
    return a.lead_num-b.lead_num;
  });

  currentPage=1;
  renderLeadsTable();
  updateStatusTabCounts();
}
function debounceFilter(){clearTimeout(filterTimeout);filterTimeout=setTimeout(applyFilters,300);}
function clearFilters(){
  document.getElementById('search-leads').value='';
  document.getElementById('filter-caller').value='';
  document.getElementById('filter-service').value='';
  document.getElementById('filter-severity').value='';
  document.getElementById('sort-leads').value='num-asc';
  applyFilters();
}
function changePageSize(sz){pageSize=parseInt(sz);currentPage=1;renderLeadsTable();}

function renderLeadsTable(){
  const tbody=document.getElementById('leads-tbody');
  const total=filteredLeads.length;
  const totalPages=Math.ceil(total/pageSize)||1;
  const start=(currentPage-1)*pageSize;
  const end=Math.min(start+pageSize,total);
  const pageLeads=filteredLeads.slice(start,end);

  document.getElementById('results-count').textContent=total+' leads';

  if(total===0){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No leads found</div><div class="empty-desc">Try adjusting your search or switch tabs</div></div></td></tr>`;
  } else {
    const today=new Date().toISOString().split('T')[0];
    tbody.innerHTML=pageLeads.map(lead=>{
      const ls=allStatuses[lead.id]||{};
      const status=ls.status||'not_called';
      const isNew=lead.added_date===today;
      const rowClass=status==='called'?'row-called':status==='voicemail'?'row-voicemail':status==='not_respond'?'row-notrespond':status==='follow_up'?'row-followup':status==='interested'?'row-interested':status==='onboard'?'row-onboard':isNew?'row-new':'';
      return `<tr class="${rowClass}" id="lead-row-${lead.id}" onclick="openDrawer(${lead.id})">
        <td class="td-mono">${String(lead.lead_num).padStart(3,'0')}</td>
        <td><div class="td-name" title="${esc(lead.name)}">${esc(lead.name)}</div></td>
        <td class="td-phone"><a href="tel:${lead.phone}" onclick="event.stopPropagation()">${esc(lead.phone_display||lead.phone||'–')}</a></td>
        <td class="col-date td-mono" style="font-size:11px;color:var(--text-muted)">${lead.added_date||'–'}</td>
        <td>${statusBadgeHtml(status)}</td>
        <td class="col-caller">${session?.role==='admin'?`<select class="caller-select" onclick="event.stopPropagation()" onchange="quickAssignCaller(${lead.id},this.value)"><option value="">Unassigned</option>${allCallers.map(c=>`<option value="${c.id}" ${ls.caller_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:esc(ls.callers?.name||'–')}</td>
        <td class="col-sev">${sevBadgeHtml(lead.severity_score)}</td>
        <td onclick="event.stopPropagation()"><div class="td-actions">
          <button class="action-icon-btn" onclick="openDrawer(${lead.id})" title="View">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          ${lead.phone?`<a href="tel:${lead.phone}" class="action-icon-btn" title="Call" onclick="event.stopPropagation()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 8.09a16 16 0 006 6l1.45-1.45a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg></a>`:''}
        </div></td>
      </tr>`;
    }).join('');
  }

  document.getElementById('page-info-text').textContent=total>0?`Showing ${start+1}–${end} of ${total}`:'No results';
  renderPagination('pagination',currentPage,Math.ceil(total/pageSize)||1,(p)=>{currentPage=p;renderLeadsTable();});
}

/* ═══ MY LEADS ═══ */
function loadMyLeads(){renderMyCampaignTabs();applyMyFilters();}
function applyMyFilters(){
  if(!session)return;
  const search=document.getElementById('search-my-leads').value.toLowerCase().trim();
  myLeadsFiltered=allLeads.filter(lead=>{
    const ls=allStatuses[lead.id]||{};
    if(myCurrentCampaignId&&lead.campaign_id!==myCurrentCampaignId)return false;
    if(ls.caller_id!==session.id)return false;
    if(myCurrentStatusTab!=='all'&&(ls.status||'not_called')!==myCurrentStatusTab)return false;
    if(search&&!lead.name.toLowerCase().includes(search)&&!lead.phone?.includes(search))return false;
    return true;
  });
  document.getElementById('nav-count-my').textContent=Object.values(allStatuses).filter(s=>s.caller_id===session.id).length;
  document.getElementById('my-results-count').textContent=myLeadsFiltered.length+' leads';
  myLeadsPage=1;renderMyLeadsTable();updateMyStatusTabCounts();
}
function renderMyLeadsTable(){
  const tbody=document.getElementById('my-leads-tbody');
  const total=myLeadsFiltered.length;
  const start=(myLeadsPage-1)*20;const end=Math.min(start+20,total);
  const today=new Date().toISOString().split('T')[0];
  if(total===0){
    tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No leads assigned to you yet</div><div class="empty-desc">Ask your admin to assign leads to your account</div></div></td></tr>`;
  } else {
    tbody.innerHTML=myLeadsFiltered.slice(start,end).map(lead=>{
      const ls=allStatuses[lead.id]||{};const status=ls.status||'not_called';const isNew=lead.added_date===today;
      const rc=status==='called'?'row-called':status==='voicemail'?'row-voicemail':status==='not_respond'?'row-notrespond':status==='follow_up'?'row-followup':status==='interested'?'row-interested':status==='onboard'?'row-onboard':isNew?'row-new':'';
      return `<tr class="${rc}" id="my-row-${lead.id}" onclick="openDrawer(${lead.id})">
        <td class="td-mono">${String(lead.lead_num).padStart(3,'0')}</td>
        <td><div class="td-name">${esc(lead.name)}</div></td>
        <td class="td-phone"><a href="tel:${lead.phone}" onclick="event.stopPropagation()">${esc(lead.phone_display||lead.phone||'–')}</a></td>
        <td class="col-date td-mono" style="font-size:11px;color:var(--text-muted)">${lead.added_date||'–'}</td>
        <td>${statusBadgeHtml(status)}</td><td class="col-sev">${sevBadgeHtml(lead.severity_score)}</td>
        <td onclick="event.stopPropagation()"><div class="td-actions"><button class="action-icon-btn" onclick="openDrawer(${lead.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div></td>
      </tr>`;
    }).join('');
  }
  document.getElementById('my-page-info-text').textContent=total>0?`Showing ${start+1}–${end} of ${total}`:'';
  renderPagination('my-pagination',myLeadsPage,Math.ceil(total/20)||1,(p)=>{myLeadsPage=p;renderMyLeadsTable();});
}

/* ═══ DRAWER ═══ */
function openDrawer(leadId){
  const lead=allLeads.find(l=>l.id===leadId);if(!lead)return;
  currentDrawerLeadId=leadId;
  const ls=allStatuses[leadId]||{};
  const today=new Date().toISOString().split('T')[0];

  document.getElementById('d-num').textContent=String(lead.lead_num).padStart(3,'0');
  document.getElementById('d-name').textContent=lead.name;

  const sev=lead.severity_score;
  const sevEl=document.getElementById('d-sev-badge');
  sevEl.className='badge '+(sev>=9?'badge-red':sev>=7?'badge-orange':sev>=5?'badge-yellow':sev>=3?'badge-teal':'badge-green');
  sevEl.textContent=(sev>=9?'CRITICAL':sev>=7?'HIGH':sev>=5?'MEDIUM':sev>=3?'LOW':'MINOR')+` · ${sev}/10`;

  const siteEl=document.getElementById('d-site-badge');
  const siteMap={up:'🟢 Site Up',down:'🔴 Site Down',nosite:'⚫ No Website',none:'⚫ No Website'};
  const siteCls={up:'badge-green',down:'badge-red',nosite:'badge-neutral',none:'badge-neutral'};
  siteEl.className='badge '+(siteCls[lead.site_status]||'badge-neutral');
  siteEl.textContent=siteMap[lead.site_status]||'–';
  document.getElementById('d-new-badge').style.display=lead.added_date===today?'':'none';

  const phoneEl=document.getElementById('d-phone-link');
  phoneEl.href=lead.phone?`tel:${lead.phone}`:'#';
  phoneEl.textContent=lead.phone_display||lead.phone||'No phone';
  document.getElementById('d-phone-text').textContent=lead.phone_display||lead.phone||'';

  const webEl=document.getElementById('d-website-link');
  const webRow=document.getElementById('d-website-row');
  webEl.href='';
  if(lead.website&&lead.website!==''){webEl.href=lead.website;webEl.textContent=lead.website.replace(/^https?:\/\//,'').replace(/\/$/,'');webRow.style.display='';}
  else{webEl.textContent='–';webRow.style.display='none';}

  document.getElementById('d-date').textContent=lead.added_date||'–';
  updateDrawerStatusButtons(ls.status||'not_called');

  const assignWrap = document.getElementById('d-caller-assign-wrap');
  const isAdmin = session.role === 'admin';
  const assignedCallerId = ls.caller_id || '';
  const assignedCallerName = ls.callers?.name || '';
  
  if (assignWrap) {
    if (isAdmin) {
      assignWrap.innerHTML = `
        <label for="drawer-caller-select">Assigned:</label>
        <select class="caller-assign-select" id="drawer-caller-select" onchange="assignCaller(this.value)">
          <option value="">Unassigned</option>
          ${allCallers.map(c => `<option value="${c.id}" ${assignedCallerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      `;
    } else {
      if (!assignedCallerId) {
        assignWrap.innerHTML = `
          <label>Assigned:</label>
          <span style="font-size:12.5px;color:var(--text-muted);margin-right:8px">Unassigned</span>
          <button class="btn-sm btn-ghost" onclick="assignCaller('${session.id}')" style="padding:4px 10px;font-size:11px">+ Claim Lead</button>
        `;
      } else if (assignedCallerId === session.id) {
        assignWrap.innerHTML = `
          <label>Assigned:</label>
          <span style="font-size:12.5px;color:var(--green);font-weight:600;margin-right:8px">✓ You</span>
          <button class="btn-sm btn-danger" onclick="assignCaller('')" style="padding:4px 10px;font-size:11px;background:none;border:1px solid var(--red-border);color:var(--red)">Release</button>
        `;
      } else {
        assignWrap.innerHTML = `
          <label>Assigned:</label>
          <span style="font-size:12.5px;color:var(--text-primary);font-weight:500">${esc(assignedCallerName)}</span>
        `;
      }
    }
  }

  const notesEl=document.getElementById('d-notes');
  notesEl.value=ls.notes||'';
  document.getElementById('d-notes-status').textContent='Auto-saved';
  document.getElementById('d-notes-count').textContent=(ls.notes||'').length+' / 1000';

  const services=lead.services||[];
  document.getElementById('d-services').innerHTML=services.map(s=>`<span class="service-tag">${esc(s)}</span>`).join('')||'<span style="color:var(--text-dim);font-size:12px">No services tagged</span>';

  const issues=Array.isArray(lead.issues)?lead.issues:(typeof lead.issues==='string'?JSON.parse(lead.issues||'[]'):[]);
  document.getElementById('d-issues-count').textContent=issues.length;
  document.getElementById('d-issues').innerHTML=issues.map(issue=>`<div class="issue-item"><div class="issue-cat">${esc(issue.cat||'')}</div><div class="issue-text">${esc(issue.text||'')}</div><div class="issue-tag tag-${issue.tag||'minor'}">${issue.tag||'minor'}</div></div>`).join('')||'<div style="color:var(--text-dim);font-size:12px;padding:8px">No issues recorded</div>';

  document.getElementById('d-pitch').textContent=lead.pitch||'No pitch script available.';
  document.getElementById('pitch-copy-btn').classList.remove('ok');
  document.getElementById('pitch-copy-btn').textContent='Copy 📋';

  document.getElementById('drawer-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeDrawer(e){
  if(e&&e.target!==document.getElementById('drawer-overlay'))return;
  document.getElementById('drawer-overlay').classList.remove('open');
  document.body.style.overflow='';currentDrawerLeadId=null;
}
function updateDrawerStatusButtons(status){
  const map={
    'not_called':'sbtn-not-called','called':'sbtn-called',
    'voicemail':'sbtn-voicemail','not_respond':'sbtn-not-respond',
    'follow_up':'sbtn-follow-up','interested':'sbtn-interested','onboard':'sbtn-onboard'
  };
  const classMap={
    'not_called':'active-not-called','called':'active-called',
    'voicemail':'active-voicemail','not_respond':'active-not-respond',
    'follow_up':'active-follow-up','interested':'active-interested','onboard':'active-onboard'
  };
  ['not_called','called','voicemail','not_respond','follow_up','interested','onboard'].forEach(s=>{
    const btn=document.getElementById(map[s]);
    if(!btn)return;
    btn.classList.remove('active-not-called','active-called','active-voicemail','active-not-respond','active-follow-up','active-interested','active-onboard');
    if(s===status)btn.classList.add(classMap[s]);
  });
}

async function setDrawerStatus(status){
  if(!currentDrawerLeadId)return;
  const leadId=currentDrawerLeadId;
  const prevStatus=(allStatuses[leadId]?.status)||'not_called';
  updateDrawerStatusButtons(status);

  const payload={lead_id:leadId,status,updated_at:new Date().toISOString()};
  if(status==='called')payload.called_at=new Date().toISOString();
  if(session.role==='caller')payload.caller_id=session.id;

  try{
    const{error}=await db.from('lead_status').upsert(payload,{onConflict:'lead_id'});
    if(error)throw error;

    const existing=allStatuses[leadId]||{};
    allStatuses[leadId]={...existing,...payload};
    if(session.role==='caller')allStatuses[leadId].caller_id=session.id;

    // Animate row movement
    animateRowMove(leadId,status);
    updateStatusTabCounts();
    loadDashboard();
    showToast('Status updated to '+status.replace(/_/g,' '),'success');
  }catch(e){
    // Rollback optimistic UI update
    updateDrawerStatusButtons(prevStatus);
    console.error('setDrawerStatus error:',e);
    showToast('Failed to update status: '+(e.message||'unknown error'),'error');
  }
}

function animateRowMove(leadId,newStatus){
  // Which view is active?
  const allLeadsActive=document.getElementById('view-all-leads')?.classList.contains('active');
  const myLeadsActive=document.getElementById('view-my-leads')?.classList.contains('active');
  if(!allLeadsActive&&!myLeadsActive)return;

  const activeTab=allLeadsActive?currentStatusTab:(typeof myCurrentStatusTab!=='undefined'?myCurrentStatusTab:'all');

  // Same status tab → lead stays in place, no animation needed
  if(activeTab===newStatus)return;

  const rowPrefix=allLeadsActive?'lead-row-':'my-row-';
  const row=document.getElementById(rowPrefix+leadId);
  if(!row)return;

  const flashColors={
    called:    'rgba(22,163,74,.18)',
    voicemail: 'rgba(79,110,247,.18)',
    not_respond:'rgba(234,88,12,.18)',
    follow_up: 'rgba(180,83,9,.18)',
    interested:'rgba(147,51,234,.18)',
    onboard:   'rgba(13,148,136,.18)',
    not_called:'rgba(79,110,247,.12)'
  };
  const flashColor=flashColors[newStatus]||'rgba(79,110,247,.14)';
  const onAllTab=(activeTab==='all');

  // Lock the row height so collapse transition works
  row.style.maxHeight=row.offsetHeight+'px';
  row.style.overflow='hidden';
  row.style.pointerEvents='none';

  // PHASE 1: Flash (only on "All" tab)
  if(onAllTab){
    row.style.setProperty('--row-flash-color',flashColor);
    row.classList.add('lead-row-exiting');
  }

  // PHASE 2: Slide left (after flash delay on All tab, immediately on specific tab)
  setTimeout(()=>{
    row.classList.remove('lead-row-exiting');
    if(onAllTab)Array.from(row.cells).forEach(td=>{td.style.backgroundColor=flashColor;});
    row.classList.add('lead-row-sliding');

    // PHASE 3: Collapse height after slide
    setTimeout(()=>{
      row.classList.remove('lead-row-sliding');
      row.classList.add('lead-row-collapsing');
      // Re-render after collapse completes
      setTimeout(()=>{
        applyFilters();
        if(session?.role==='caller')applyMyFilters();
      },220);
    },390);
  },onAllTab?470:0);
}

async function assignCaller(callerId){if(!currentDrawerLeadId)return;await quickAssignCaller(currentDrawerLeadId,callerId);}
async function quickAssignCaller(leadId,callerId){
  const ls=allStatuses[leadId]||{};
  const currentCallerId=ls.caller_id||'';
  
  if (session.role === 'caller') {
    const targetCallerId = callerId || '';
    if (targetCallerId === session.id) {
      if (currentCallerId && currentCallerId !== session.id) {
        showToast('Lead is already assigned to another caller','error');
        return;
      }
    } else if (targetCallerId === '') {
      if (currentCallerId !== session.id) {
        showToast('You can only release your own leads','error');
        return;
      }
    } else {
      showToast('Unauthorized assignment operation','error');
      return;
    }
  }
  
  try{
    const{error}=await db.from('lead_status').upsert({lead_id:leadId,caller_id:callerId||null,updated_at:new Date().toISOString()},{onConflict:'lead_id'});
    if(error)throw error;
    
    ls.caller_id=callerId||null;
    ls.callers=callerId?{name:allCallers.find(c=>c.id===callerId)?.name,id:callerId}:null;
    allStatuses[leadId]=ls;
    
    if (currentDrawerLeadId === leadId) {
      openDrawer(leadId);
    }
    
    renderLeadsTable();
    if(session?.role==='caller')applyMyFilters();
    loadDashboard();
    showToast(callerId?'Lead claimed':'Lead released','success');
  }catch(e){console.error('quickAssignCaller error:',e);showToast('Failed to assign: '+(e.message||'error'),'error');}
}

function updateNotesCount(){
  const v=document.getElementById('d-notes').value;
  document.getElementById('d-notes-count').textContent=v.length+' / 1000';
  document.getElementById('d-notes-status').textContent='Unsaved';
}
async function saveNotes(){
  if(!currentDrawerLeadId)return;
  const notes=document.getElementById('d-notes').value;
  document.getElementById('d-notes-status').textContent='Saving…';
  try{
    const{error}=await db.from('lead_status').upsert({lead_id:currentDrawerLeadId,notes,updated_at:new Date().toISOString()},{onConflict:'lead_id'});
    if(error)throw error;
    const ls=allStatuses[currentDrawerLeadId]||{};ls.notes=notes;allStatuses[currentDrawerLeadId]=ls;
    document.getElementById('d-notes-status').textContent='Saved ✓';
    setTimeout(()=>{document.getElementById('d-notes-status').textContent='Auto-saved';},2000);
  }catch(e){document.getElementById('d-notes-status').textContent='Save failed';}
}
function copyPitch(){
  navigator.clipboard.writeText(document.getElementById('d-pitch').textContent).then(()=>{
    const btn=document.getElementById('pitch-copy-btn');btn.textContent='✓ Copied!';btn.classList.add('ok');
    setTimeout(()=>{btn.textContent='Copy 📋';btn.classList.remove('ok');},2000);
  });
}

/* ═══ CAMPAIGN INFO PANEL ═══ */
function switchCPanelTab(tabName) {
  document.querySelectorAll('.cpanel-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'cptab-' + tabName);
  });
  document.querySelectorAll('.cpanel-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === 'cppane-' + tabName);
  });
}

function copyCampaignPitch() {
  const guideText = document.getElementById('cp-pitch-textarea')?.value || '';
  navigator.clipboard.writeText(guideText).then(() => {
    const btn = document.getElementById('cp-pitch-copy-btn');
    btn.textContent = '✓ Copied!';
    btn.classList.add('ok');
    setTimeout(() => {
      btn.textContent = 'Copy Guide 📋';
      btn.classList.remove('ok');
    }, 2000);
  });
}

function togglePitchGuideMode(mode) {
  const isPreview = mode === 'preview';
  const btnPreview = document.getElementById('btn-pitch-preview');
  const btnEdit = document.getElementById('btn-pitch-edit');
  if (btnPreview) btnPreview.classList.toggle('active', isPreview);
  if (btnEdit) btnEdit.classList.toggle('active', !isPreview);
  
  const previewPane = document.getElementById('cp-pitch-preview');
  const editPane = document.getElementById('cp-pitch-edit');
  if (previewPane) previewPane.style.display = isPreview ? '' : 'none';
  if (editPane) editPane.style.display = isPreview ? 'none' : 'flex';
  
  // Re-render preview live when switching to it
  if (isPreview) {
    const textarea = document.getElementById('cp-pitch-textarea');
    if (textarea && previewPane) {
      previewPane.innerHTML = parsePitchGuideMarkdown(textarea.value);
    }
  }
}

function togglePitchQA(id) {
  const card = document.getElementById(id);
  if (card) {
    card.classList.toggle('open');
  }
}

function copyTextToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 2000);
  });
}

// Client-side Markdown-to-HTML Parser for the Pitch Guide
function parsePitchGuideMarkdown(md) {
  if (!md) return '<div style="color:var(--text-dim);font-style:italic;padding:8px">No pitch guide added yet.</div>';

  const lines = md.split('\n');
  let html = '';
  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inBlockquote = false;
  let blockquoteText = [];

  function closeList() {
    if (inList) {
      html += `</${listType}>`;
      inList = false;
      listType = null;
    }
  }

  function closeBlockquote() {
    if (inBlockquote) {
      const text = blockquoteText.join('\n').trim();
      
      // Check if this blockquote belongs to an objection Q&A
      const objectionMatch = html.match(/<div class="objection-header-pending">([\s\S]*?)<\/div>$/);
      if (objectionMatch) {
        const headerText = objectionMatch[1];
        // Remove the temporary placeholder
        html = html.replace(/<div class="objection-header-pending">([\s\S]*?)<\/div>$/, '');
        
        const uniqueId = 'qa-' + Math.random().toString(36).substring(2, 9);
        html += `
          <div class="pitch-qa-card" id="${uniqueId}">
            <div class="pitch-qa-header" onclick="togglePitchQA('${uniqueId}')">${headerText}</div>
            <div class="pitch-qa-body">
              <p>${inlineFormatter(text)}</p>
              <button class="blockquote-copy-btn" onclick="copyTextToClipboard('${escQuote(text)}', this)">Copy Response 📋</button>
            </div>
          </div>
        `;
      } else {
        // Standard Pitch script block
        html += `
          <blockquote>
            <p>${inlineFormatter(text)}</p>
            <button class="blockquote-copy-btn" onclick="copyTextToClipboard('${escQuote(text)}', this)">Copy Pitch 📋</button>
          </blockquote>
        `;
      }
      
      inBlockquote = false;
      blockquoteText = [];
    }
  }

  function escQuote(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
  }

  function inlineFormatter(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="td-mono" style="font-size:11.5px;background:var(--bg-page);padding:2px 4px;border-radius:3px">$1</code>');
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line === '---' || line === '***' || line === '___') {
      closeList();
      closeBlockquote();
      html += '<hr />';
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      closeBlockquote();
      html += `<h1>${inlineFormatter(line.substring(2))}</h1>`;
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      closeBlockquote();
      html += `<h2>${inlineFormatter(line.substring(3))}</h2>`;
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      closeBlockquote();
      html += `<h3>${inlineFormatter(line.substring(4))}</h3>`;
      continue;
    }

    if (line.startsWith('>')) {
      closeList();
      inBlockquote = true;
      blockquoteText.push(line.substring(1).trim());
      continue;
    }

    closeBlockquote();

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
        html += '<ul>';
      }
      html += `<li>${inlineFormatter(line.substring(2))}</li>`;
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
        html += '<ol>';
      }
      html += `<li>${inlineFormatter(olMatch[2])}</li>`;
      continue;
    }

    if (line === '') {
      closeList();
      continue;
    }

    closeList();

    // Check if this line looks like an objection question header
    if (line.startsWith('**') && line.endsWith('**')) {
      let hasNextBlockquote = false;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine === '') continue;
        if (nextLine.startsWith('>')) {
          hasNextBlockquote = true;
        }
        break;
      }
      if (hasNextBlockquote) {
        const headerText = line.replace(/^\*\*/, '').replace(/\*\*$/, '');
        html += `<div class="objection-header-pending">${inlineFormatter(headerText)}</div>`;
        continue;
      }
    }

    html += `<p>${inlineFormatter(line)}</p>`;
  }

  closeList();
  closeBlockquote();

  return html;
}

function openCampaignPanel(){
  const c=allCampaigns.find(c=>c.id===currentCampaignId);
  if(!c)return;
  const isAdmin=session&&session.role==='admin';

  switchCPanelTab('overview');

  document.getElementById('cp-name').value=c.name||'';
  document.getElementById('cp-name').readOnly=!isAdmin;
  document.getElementById('cp-industry').value=c.industry||'';
  document.getElementById('cp-industry').readOnly=!isAdmin;
  
  // Set raw pitch guide in the edit textarea
  const textarea = document.getElementById('cp-pitch-textarea');
  if (textarea) {
    textarea.value = c.pitch_guide || '';
  }
  
  // Render formatted pitch guide preview
  const previewEl = document.getElementById('cp-pitch-preview');
  if (previewEl) {
    previewEl.innerHTML = parsePitchGuideMarkdown(c.pitch_guide);
  }
  
  // Show mode toggles only to Admin
  const toggleBar = document.getElementById('pitch-mode-toggle-bar');
  if (toggleBar) {
    toggleBar.style.display = isAdmin ? 'flex' : 'none';
  }
  togglePitchGuideMode('preview');

  renderRefUrls(c.reference_urls||[]);

  // Calculate campaign specific statistics
  const cLeads=allLeads.filter(l=>l.campaign_id===c.id);
  const totalLeads=cLeads.length;
  const calledLeads=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='called').length;
  const interestedLeads=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='interested').length;
  const pct=totalLeads>0?Math.round(calledLeads/totalLeads*100):0;

  document.getElementById('cp-stat-total').textContent=totalLeads;
  document.getElementById('cp-stat-called').textContent=calledLeads;
  document.getElementById('cp-stat-interested').textContent=interestedLeads;
  document.getElementById('cp-stat-pct').textContent=pct+'%';

  document.getElementById('cpanel-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeCampaignPanel(e){
  if(e&&e.target!==document.getElementById('cpanel-overlay'))return;
  document.getElementById('cpanel-overlay').classList.remove('open');
  document.body.style.overflow='';
}

function renderRefUrls(urls){
  const isAdmin=session&&session.role==='admin';
  document.getElementById('cp-urls-list').innerHTML=urls.map((url,i)=>`
    <div class="ref-url-item">
      <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
      ${isAdmin?`<button class="ref-url-remove" onclick="removeRefUrl(${i})" title="Remove">×</button>`:''}
    </div>
  `).join('')||'<div style="font-size:12px;color:var(--text-dim);padding:6px 0">No reference URLs added</div>';
}

function addRefUrl(){
  const input=document.getElementById('cp-new-url');
  const url=input.value.trim();
  if(!url)return;
  const c=allCampaigns.find(c=>c.id===currentCampaignId);
  if(!c)return;
  c.reference_urls=[...(c.reference_urls||[]),url];
  renderRefUrls(c.reference_urls);
  input.value='';
}
function removeRefUrl(i){
  const c=allCampaigns.find(c=>c.id===currentCampaignId);
  if(!c)return;
  c.reference_urls=(c.reference_urls||[]).filter((_,idx)=>idx!==i);
  renderRefUrls(c.reference_urls);
}

async function saveCampaignPanel(){
  const c=allCampaigns.find(c=>c.id===currentCampaignId);
  if(!c)return;
  const name=document.getElementById('cp-name').value.trim();
  const industry=document.getElementById('cp-industry').value.trim();
  const pitch_guide=document.getElementById('cp-pitch-textarea')?.value || '';
  if(!name){showToast('Campaign name is required','error');return;}
  try{
    await db.from('campaigns').update({name,industry,pitch_guide,reference_urls:c.reference_urls||[]}).eq('id',c.id);
    c.name=name;c.industry=industry;c.pitch_guide=pitch_guide;
    renderCampaignTabs();updateCampaignInfoRow();
    showToast('Campaign saved','success');closeCampaignPanel();
  }catch(e){showToast('Failed to save campaign','error');}
}

/* ═══ CAMPAIGNS TABLE (Admin view) ═══ */
function renderCampaignsTable(){
  const tbody=document.getElementById('campaigns-tbody');
  if(allCampaigns.length===0){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No campaigns yet</div><button class="btn-sm btn-primary" style="margin-top:12px" onclick="openCreateCampaignModal()">Create First Campaign</button></div></td></tr>`;
    return;
  }
  tbody.innerHTML=allCampaigns.map(c=>{
    const cLeads=allLeads.filter(l=>l.campaign_id===c.id);
    const total=cLeads.length;
    const called=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='called').length;
    const fu=cLeads.filter(l=>(allStatuses[l.id]?.status||'not_called')==='follow_up').length;
    const pct=total>0?Math.round(called/total*100):0;
    return `<tr>
      <td style="font-weight:600;color:var(--text-primary)">${esc(c.name)}</td>
      <td><span class="badge badge-teal">${esc(c.industry||'—')}</span></td>
      <td class="td-mono" style="font-size:11px;color:var(--text-muted)">${c.added_date||'–'}</td>
      <td class="td-mono" style="color:var(--accent)">${total}</td>
      <td class="td-mono" style="color:var(--green)">${called}</td>
      <td class="td-mono" style="color:var(--yellow)">${fu}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--bg-surface-3);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--green);border-radius:3px;transition:width .3s"></div></div><span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text-muted)">${pct}%</span></div></td>
      <td onclick="event.stopPropagation()"><div class="td-actions">
        <button class="action-icon-btn" onclick="viewCampaignLeads('${c.id}')" title="View leads">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="action-icon-btn" onclick="deleteCampaign('${c.id}')" title="Delete campaign" style="color:var(--red)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
}
function viewCampaignLeads(campaignId){currentCampaignId=campaignId;showView('all-leads');}
function deleteCampaign(id){
  const campaign=allCampaigns.find(c=>c.id===id);
  if(!campaign)return;
  const name=campaign.name;
  showConfirm(
    'Delete Campaign',
    `Are you sure you want to delete campaign <strong>${esc(name)}</strong>?<br><br>⚠️ <strong>All leads and their call history inside this campaign will be permanently deleted.</strong> This cannot be undone.`,
    async()=>{
      try{
        // Get all lead IDs in this campaign
        const campaignLeadIds=allLeads.filter(l=>l.campaign_id===id).map(l=>l.id);
        if(campaignLeadIds.length>0){
          // Delete lead_status rows first
          await db.from('lead_status').delete().in('lead_id',campaignLeadIds);
          // Delete leads
          await db.from('leads').delete().eq('campaign_id',id);
        }
        // Delete campaign
        const{error}=await db.from('campaigns').delete().eq('id',id);
        if(error)throw error;
        // Update local state
        allLeads=allLeads.filter(l=>l.campaign_id!==id);
        campaignLeadIds.forEach(lid=>{delete allStatuses[lid];});
        allCampaigns=allCampaigns.filter(c=>c.id!==id);
        if(currentCampaignId===id)currentCampaignId=allCampaigns[0]?.id||null;
        document.getElementById('nav-count-campaigns').textContent=allCampaigns.length;
        document.getElementById('nav-count-leads').textContent=allLeads.length;
        filteredLeads=[...allLeads];
        renderCampaignsTable();
        renderCampaignTabs();
        loadDashboard();
        showToast(`Campaign "${name}" deleted`,'success');
      }catch(e){console.error('deleteCampaign error:',e);showToast('Failed to delete campaign: '+(e.message||'error'),'error');}
    }
  );
}

/* ═══ CREATE CAMPAIGN MODAL ═══ */
function openCreateCampaignModal(){
  document.getElementById('nc-name').value='';
  document.getElementById('nc-industry').value='';
  document.getElementById('nc-pitch').value='';
  document.getElementById('campaign-modal-error').classList.remove('show');
  document.getElementById('campaign-modal').classList.add('open');
}
function closeCampaignModal(e){
  if(e&&e.target!==document.getElementById('campaign-modal'))return;
  document.getElementById('campaign-modal').classList.remove('open');
}
async function submitCreateCampaign(){
  const name=document.getElementById('nc-name').value.trim();
  const industry=document.getElementById('nc-industry').value.trim();
  const pitch_guide=document.getElementById('nc-pitch').value;
  const errEl=document.getElementById('campaign-modal-error');
  if(!name){errEl.textContent='Campaign name is required.';errEl.classList.add('show');return;}
  try{
    const{data,error}=await db.from('campaigns').insert({name,industry,pitch_guide}).select().single();
    if(error)throw error;
    allCampaigns.push(data);
    currentCampaignId=data.id;
    document.getElementById('nav-count-campaigns').textContent=allCampaigns.length;
    closeCampaignModal();
    renderCampaignTabs();renderCampaignsTable();
    showView('all-leads');
    showToast(`Campaign "${name}" created`,'success');
  }catch(e){errEl.textContent=e.message||'Error creating campaign.';errEl.classList.add('show');}
}

/* ═══ CALLERS ═══ */
function renderCallersTable(){
  const tbody=document.getElementById('callers-tbody');
  if(allCallers.length===0){tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No callers yet</div><button class="btn-sm btn-primary" style="margin-top:12px" onclick="openCallerModal()">Add Caller</button></div></td></tr>`;return;}
  tbody.innerHTML=allCallers.map(caller=>{
    const callerStatuses=Object.values(allStatuses).filter(s=>s.caller_id===caller.id);
    const called=callerStatuses.filter(s=>s.status==='called').length;
    const fu=callerStatuses.filter(s=>s.status==='follow_up').length;
    const assigned=callerStatuses.length;
    const initials=caller.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `<tr>
      <td><div class="caller-row-name"><div class="caller-avatar">${initials}</div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">${esc(caller.name)}</div></div></td>
      <td class="td-mono" style="font-size:12px">${esc(caller.username)}</td>
      <td class="td-mono" style="font-size:12px"><span id="pw-${caller.id}">••••••••</span><button onclick="togglePw('${caller.id}','${esc(caller.password)}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:10px;margin-left:4px">show</button></td>
      <td class="td-mono" style="color:var(--accent)">${assigned}</td>
      <td class="td-mono" style="color:var(--green)">${called}</td>
      <td class="td-mono" style="color:var(--yellow)">${fu}</td>
      <td><span class="badge ${caller.is_active?'badge-green':'badge-neutral'}">${caller.is_active?'Active':'Inactive'}</span></td>
      <td><div class="td-actions">
        <button class="action-icon-btn" onclick="editCaller('${caller.id}')" title="Edit"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-icon-btn" onclick="toggleCallerStatus('${caller.id}',${caller.is_active})" title="${caller.is_active?'Deactivate':'Activate'}" style="color:${caller.is_active?'var(--red)':'var(--green)'}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/>${caller.is_active?'<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>':'<polyline points="20 6 9 17 4 12"/>'}</svg></button>
        <button class="action-icon-btn" onclick="deleteCaller('${caller.id}')" title="Delete" style="color:var(--red)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
}
function togglePw(id,pw){const el=document.getElementById('pw-'+id);if(el)el.textContent=el.textContent==='••••••••'?pw:'••••••••';}
function openCallerModal(id){
  editingCallerId=id||null;
  document.getElementById('caller-name').value='';document.getElementById('caller-username').value='';document.getElementById('caller-password').value='';
  document.getElementById('caller-modal-error').classList.remove('show');
  if(id){const c=allCallers.find(c=>c.id===id);if(c){document.getElementById('caller-name').value=c.name;document.getElementById('caller-username').value=c.username;document.getElementById('caller-password').value=c.password;}}
  document.getElementById('caller-modal-title').textContent=id?'Edit Caller':'Add Caller';
  document.getElementById('caller-modal-submit').textContent=id?'Save Changes':'Add Caller';
  document.getElementById('caller-modal').classList.add('open');
}
function editCaller(id){openCallerModal(id);}
function closeCallerModal(e){if(e&&e.target!==document.getElementById('caller-modal'))return;document.getElementById('caller-modal').classList.remove('open');editingCallerId=null;}
async function submitCaller(){
  const name=document.getElementById('caller-name').value.trim();
  const username=document.getElementById('caller-username').value.trim();
  const password=document.getElementById('caller-password').value.trim();
  const errEl=document.getElementById('caller-modal-error');
  if(!name||!username||!password){errEl.textContent='All fields are required.';errEl.classList.add('show');return;}
  try{
    if(editingCallerId){
      const{error}=await db.from('callers').update({name,username,password}).eq('id',editingCallerId);
      if(error)throw error;
      const idx=allCallers.findIndex(c=>c.id===editingCallerId);
      if(idx>-1)allCallers[idx]={...allCallers[idx],name,username,password};
      showToast('Caller updated','success');
    } else {
      const{data:existing}=await db.from('callers').select('id').eq('username',username).maybeSingle();
      if(existing){errEl.textContent='Username already taken.';errEl.classList.add('show');return;}
      const{data,error}=await db.from('callers').insert({name,username,password,role:'caller'}).select().single();
      if(error)throw error;
      allCallers.push(data);showToast(`"${name}" added`,'success');
    }
    closeCallerModal();renderCallersTable();loadCallers();
  }catch(e){errEl.textContent=e.message||'Error.';errEl.classList.add('show');}
}
async function toggleCallerStatus(id,isActive){
  try{await db.from('callers').update({is_active:!isActive}).eq('id',id);const idx=allCallers.findIndex(c=>c.id===id);if(idx>-1)allCallers[idx].is_active=!isActive;renderCallersTable();showToast(isActive?'Caller deactivated':'Caller reactivated','success');}
  catch(e){showToast('Error','error');}
}
function deleteCaller(id){
  const caller=allCallers.find(c=>c.id===id);
  if(!caller)return;
  const name=caller.name;
  showConfirm(
    'Delete Caller',
    `Are you sure you want to delete <strong>${esc(name)}</strong>? All their assigned leads will be unassigned. This cannot be undone.`,
    async()=>{
      try{
        // Nullify caller_id in lead_status first to avoid FK constraint
        await db.from('lead_status').update({caller_id:null}).eq('caller_id',id);
        const{error}=await db.from('callers').delete().eq('id',id);
        if(error)throw error;
        // Remove from local state
        allCallers=allCallers.filter(c=>c.id!==id);
        Object.values(allStatuses).forEach(s=>{if(s.caller_id===id){s.caller_id=null;s.callers=null;}});
        document.getElementById('nav-count-callers').textContent=allCallers.length;
        renderCallersTable();
        loadCallers();
        loadDashboard();
        showToast(`"${name}" deleted`,'success');
      }catch(e){console.error('deleteCaller error:',e);showToast('Failed to delete: '+(e.message||'error'),'error');}
    }
  );
}

/* ═══ DASHBOARD ═══ */
function loadDashboard(){
  // Populate Campaign filter select once
  const dcEl=document.getElementById('dash-filter-campaign');
  if(dcEl && dcEl.options.length===1){
    allCampaigns.forEach(c=>{
      const opt=document.createElement('option');
      opt.value=c.id;
      opt.textContent='📁 '+c.name;
      dcEl.appendChild(opt);
    });
  }

  const campaignFilter = document.getElementById('dash-filter-campaign')?.value || 'all';
  const dateFilter = document.getElementById('dash-filter-date')?.value || 'all';

  // Filter leads by campaign
  let dashboardLeads = allLeads;
  if (campaignFilter !== 'all') {
    dashboardLeads = allLeads.filter(l => l.campaign_id === campaignFilter);
  }
  const total = dashboardLeads.length;
  const todayStr=new Date().toISOString().split('T')[0];

  // Filter statuses by campaign & date
  const sList = Object.values(allStatuses).filter(s => {
    const lead = allLeads.find(l => l.id === s.lead_id);
    if (!lead || (campaignFilter !== 'all' && lead.campaign_id !== campaignFilter)) return false;
    
    if (dateFilter === 'today') {
      return isToday(s.updated_at);
    } else if (dateFilter === 'past') {
      return s.updated_at && !isToday(s.updated_at);
    }
    return true;
  });

  const called=sList.filter(s=>s.status==='called').length;
  const voicemail=sList.filter(s=>s.status==='voicemail').length;
  const notRespond=sList.filter(s=>s.status==='not_respond').length;
  const fu=sList.filter(s=>s.status==='follow_up').length;
  const interested=sList.filter(s=>s.status==='interested').length;
  const onboard=sList.filter(s=>s.status==='onboard').length;
  const nc=total-called-voicemail-notRespond-fu-interested-onboard;

  document.getElementById('stats-grid').innerHTML=`
    <div class="stat-card fade-in-el"><div class="stat-label">Total Leads</div><div class="stat-value c-accent">${total}</div><div class="stat-delta">${campaignFilter==='all'?allCampaigns.length:1} campaign${campaignFilter==='all'&&allCampaigns.length!==1?'s':''}</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">Not Called</div><div class="stat-value">${nc}</div><div class="stat-delta">${total>0?Math.round(nc/total*100):0}% remaining</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">Called</div><div class="stat-value c-green">${called}</div><div class="stat-delta">${total>0?Math.round(called/total*100):0}% complete</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">Voicemail</div><div class="stat-value c-accent">${voicemail}</div><div class="stat-delta">${total>0?Math.round(voicemail/total*100):0}% left message</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">Not Respond</div><div class="stat-value c-orange">${notRespond}</div><div class="stat-delta">${total>0?Math.round(notRespond/total*100):0}% no response</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">Follow Up</div><div class="stat-value c-yellow">${fu}</div><div class="stat-delta">Needs callback</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">⭐ Interested</div><div class="stat-value c-purple">${interested}</div><div class="stat-delta">${total>0?Math.round(interested/total*100):0}% warm leads</div></div>
    <div class="stat-card fade-in-el"><div class="stat-label">🚀 Onboard</div><div class="stat-value c-teal">${onboard}</div><div class="stat-delta">Converted clients</div></div>
  `;

  // Recent Activity — filtered & paginated
  const allRecentStatuses = Object.values(allStatuses).filter(s => {
    if (s.status === 'not_called' || !s.updated_at) return false;
    
    const lead = allLeads.find(l => l.id === s.lead_id);
    if (!lead || (campaignFilter !== 'all' && lead.campaign_id !== campaignFilter)) return false;
    
    if (dateFilter === 'today') {
      return isToday(s.updated_at);
    } else if (dateFilter === 'past') {
      return !isToday(s.updated_at);
    }
    return true;
  }).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));

  const activityPerPage = window.innerWidth >= 1024 ? 10 : 5;
  const actTotalPages=Math.ceil(allRecentStatuses.length/activityPerPage)||1;
  if(activityPage>actTotalPages)activityPage=actTotalPages;
  const recentStatuses=allRecentStatuses.slice((activityPage-1)*activityPerPage,activityPage*activityPerPage);
  
  const actEl=document.getElementById('recent-activity');
  if(allRecentStatuses.length===0){
    actEl.innerHTML='<div class="empty-state" style="padding:30px"><div class="empty-icon">📋</div><div class="empty-title">No activity yet</div></div>';
  } else {
    actEl.innerHTML=recentStatuses.map(s=>{
      const lead=allLeads.find(l=>l.id===s.lead_id);if(!lead)return'';
      const campaign=allCampaigns.find(c=>c.id===lead.campaign_id);
      const campaignLabel=campaign?`<span class="activity-campaign-tag">${esc(campaign.name)}</span>`:'';
      const callerName=s.callers?.name||'Unknown';
      const statusMeta={
        called:{label:'called',color:'var(--green)'},
        voicemail:{label:'left voicemail for',color:'var(--accent)'},
        not_respond:{label:'marked not responding for',color:'var(--orange)'},
        follow_up:{label:'marked follow-up on',color:'var(--yellow)'},
        interested:{label:'marked interested in',color:'var(--purple)'},
        onboard:{label:'onboarded',color:'var(--teal)'}
      };
      const meta=statusMeta[s.status]||{label:'updated',color:'var(--accent)'};
      return`<div class="activity-item fade-in-el"><div class="activity-dot" style="background:${meta.color}"></div><div class="activity-text"><strong>${esc(callerName)}</strong> ${meta.label} <strong>${esc(lead.name)}</strong>${campaignLabel}</div><div class="activity-time" title="${formatDateTime(s.updated_at)}">${formatDate(s.updated_at)} · ${formatTimeAgo(s.updated_at)}</div></div>`;
    }).join('');
  }
  renderDashPagination('activity-pagination',activityPage,actTotalPages,(p)=>{activityPage=p;loadDashboard();});

  // Caller Progress / My Today's Progress — filtered & dynamic by role
  const panelTitleEl=document.getElementById('dash-right-panel-title');
  const paginationEl=document.getElementById('caller-progress-pagination');
  const isAdmin = session?.role === 'admin';
  
  if (isAdmin) {
    if (panelTitleEl) panelTitleEl.textContent = 'Caller Progress';
    if (paginationEl) paginationEl.style.display = '';
    
    const activeCallers=allCallers.filter(c=>c.is_active);
    const cpTotalPages=Math.ceil(activeCallers.length/CALLERS_PER_PAGE)||1;
    if(callerProgressPage>cpTotalPages)callerProgressPage=cpTotalPages;
    const pageCallers=activeCallers.slice((callerProgressPage-1)*CALLERS_PER_PAGE,callerProgressPage*CALLERS_PER_PAGE);
    const progressEl=document.getElementById('caller-progress');
    
    if(allCallers.length===0){
      progressEl.innerHTML='<div class="empty-state" style="padding:24px"><div class="empty-title">No callers yet</div><button class="btn-sm btn-primary" style="margin-top:8px" onclick="showView(\'callers\')">Add Callers</button></div>';
    } else {
      progressEl.innerHTML=pageCallers.map(c=>{
        const cs=Object.values(allStatuses).filter(s=>s.caller_id===c.id);
        
        // Filter statuses by campaign
        let callerLeads=cs;
        if (campaignFilter !== 'all') {
          callerLeads = cs.filter(s => {
            const lead = allLeads.find(l => l.id === s.lead_id);
            return lead && lead.campaign_id === campaignFilter;
          });
        }
        
        // Find unique campaigns this caller has touched
        const callerCampaignIds = [...new Set(cs.map(s => {
          const lead = allLeads.find(l => l.id === s.lead_id);
          return lead ? lead.campaign_id : null;
        }).filter(Boolean))];
        
        const callerCampaignNames = callerCampaignIds.map(cid => {
          const camp = allCampaigns.find(camp => camp.id === cid);
          return camp ? camp.name : '';
        }).filter(Boolean).join(', ');

        // Filter by date
        if (dateFilter === 'today') {
          callerLeads = callerLeads.filter(s => isToday(s.updated_at));
        } else if (dateFilter === 'past') {
          callerLeads = callerLeads.filter(s => s.updated_at && !isToday(s.updated_at));
        }

        const cc=callerLeads.filter(s=>s.status==='called').length;
        const voicemail=callerLeads.filter(s=>s.status==='voicemail').length;
        const notRespond=callerLeads.filter(s=>s.status==='not_respond').length;
        const fu=callerLeads.filter(s=>s.status==='follow_up').length;
        const interested=callerLeads.filter(s=>s.status==='interested').length;
        const onboard=callerLeads.filter(s=>s.status==='onboard').length;
        const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        
        const activeCampText = campaignFilter === 'all' ? (callerCampaignNames || 'No active campaigns') : (allCampaigns.find(camp=>camp.id===campaignFilter)?.name || '');
        const datePeriodLabel = dateFilter === 'today' ? 'Today' : dateFilter === 'past' ? 'Past History' : 'All Time';

        return `
          <div class="caller-progress-item fade-in-el">
            <div class="caller-avatar">${initials}</div>
            <div style="flex:1">
              <div class="caller-progress-header">
                <span class="caller-progress-name">${esc(c.name)}</span>
                <span class="caller-progress-campaign" title="${esc(activeCampText)}">${esc(activeCampText)}</span>
              </div>
              <div class="caller-progress-stats">
                Called: <b style="color:var(--green)">${cc}</b> &nbsp; Voicemail: <b style="color:var(--accent)">${voicemail}</b> &nbsp; Not Respond: <b style="color:var(--orange)">${notRespond}</b> &nbsp; Follow Up: <b style="color:var(--yellow)">${fu}</b> &nbsp; Interested: <b style="color:var(--purple)">${interested}</b> &nbsp; Onboard: <b style="color:var(--teal)">${onboard}</b>
              </div>
              <div class="caller-progress-meta">
                Period: <strong>${datePeriodLabel}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    renderDashPagination('caller-progress-pagination',callerProgressPage,cpTotalPages,(p)=>{callerProgressPage=p;loadDashboard();});
  } else {
    if (panelTitleEl) panelTitleEl.textContent = "My Today's Progress";
    if (paginationEl) paginationEl.innerHTML = '';
    const progressEl=document.getElementById('caller-progress');
    
    const myStatuses = Object.values(allStatuses).filter(s => s.caller_id === session.id);
    const todayStatuses = myStatuses.filter(s => isToday(s.updated_at));
    
    // Filter by campaign
    let filteredTodayStatuses = todayStatuses;
    if (campaignFilter !== 'all') {
      filteredTodayStatuses = todayStatuses.filter(s => {
        const lead = allLeads.find(l => l.id === s.lead_id);
        return lead && lead.campaign_id === campaignFilter;
      });
    }
    
    const cc = filteredTodayStatuses.filter(s => s.status === 'called').length;
    const voicemail = filteredTodayStatuses.filter(s => s.status === 'voicemail').length;
    const notRespond = filteredTodayStatuses.filter(s => s.status === 'not_respond').length;
    const fu = filteredTodayStatuses.filter(s => s.status === 'follow_up').length;
    const interested = filteredTodayStatuses.filter(s => s.status === 'interested').length;
    const onboard = filteredTodayStatuses.filter(s => s.status === 'onboard').length;
    const totalActions = filteredTodayStatuses.length;
    
    const todayDateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const selectedCampaignName = campaignFilter === 'all' ? 'All Campaigns' : (allCampaigns.find(c=>c.id===campaignFilter)?.name || '');
    
    progressEl.innerHTML = `
      <div class="caller-my-progress fade-in-el" style="padding:16px; display:flex; flex-direction:column; gap:12px">
        <div style="font-size:12px; color:var(--text-muted); font-weight:500; display:flex; justify-content:space-between">
          <span>Date: <strong>${todayDateLabel}</strong></span>
          <span style="max-width: 140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${esc(selectedCampaignName)}"><strong>${esc(selectedCampaignName)}</strong></span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
          <div class="stat-card-mini" style="background:var(--green-subtle); border:1px solid var(--green-border); padding:12px; border-radius:var(--radius-sm); display:flex; flex-direction:column">
            <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--green); letter-spacing:.02em">Called</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; color:var(--green); margin-top:4px">${cc}</div>
          </div>
          <div class="stat-card-mini" style="background:var(--accent-subtle); border:1px solid var(--accent-border); padding:12px; border-radius:var(--radius-sm); display:flex; flex-direction:column">
            <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--accent); letter-spacing:.02em">Voicemail</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; color:var(--accent); margin-top:4px">${voicemail}</div>
          </div>
          <div class="stat-card-mini" style="background:var(--orange-subtle); border:1px solid var(--orange-border); padding:12px; border-radius:var(--radius-sm); display:flex; flex-direction:column">
            <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--orange); letter-spacing:.02em">Not Respond</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; color:var(--orange); margin-top:4px">${notRespond}</div>
          </div>
          <div class="stat-card-mini" style="background:var(--yellow-subtle); border:1px solid var(--yellow-border); padding:12px; border-radius:var(--radius-sm); display:flex; flex-direction:column">
            <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--yellow); letter-spacing:.02em">Follow Up</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; color:var(--yellow); margin-top:4px">${fu}</div>
          </div>
          <div class="stat-card-mini" style="background:var(--purple-subtle); border:1px solid var(--purple-border); padding:12px; border-radius:var(--radius-sm); display:flex; flex-direction:column">
            <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--purple); letter-spacing:.02em">Interested</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; color:var(--purple); margin-top:4px">${interested}</div>
          </div>
          <div class="stat-card-mini" style="background:var(--teal-subtle); border:1px solid var(--teal-border); padding:12px; border-radius:var(--radius-sm); display:flex; flex-direction:column">
            <div style="font-size:10px; font-weight:600; text-transform:uppercase; color:var(--teal); letter-spacing:.02em">Onboard</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:22px; font-weight:700; color:var(--teal); margin-top:4px">${onboard}</div>
          </div>
        </div>
        <div style="margin-top:8px; padding-top:12px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center">
          <span style="font-size:12.5px; font-weight:600; color:var(--text-secondary)">Total Actions Today</span>
          <span style="font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:700; color:var(--accent)">${totalActions}</span>
        </div>
      </div>
    `;
  }
}

/* ═══ SIDEBAR ═══ */
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-backdrop').style.display=document.getElementById('sidebar').classList.contains('open')?'block':'';}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-backdrop').style.display='';}

/* ═══ DASH PANEL PAGINATION ═══ */
function renderDashPagination(containerId,page,total,onPage){
  const c=document.getElementById(containerId);if(!c)return;
  if(total<=1){c.innerHTML='';return;}
  c.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-top:1px solid var(--border)">
    <button class="page-btn" onclick="(${onPage.toString()})(${page-1})" ${page===1?'disabled':''}>‹ Prev</button>
    <span style="font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${page} / ${total}</span>
    <button class="page-btn" onclick="(${onPage.toString()})(${page+1})" ${page===total?'disabled':''}>Next ›</button>
  </div>`;
}

/* ═══ BADGE HELPERS ═══ */
function statusBadgeHtml(s){const m={
  not_called:'<span class="badge badge-neutral dot-badge">Not Called</span>',
  called:'<span class="badge badge-green dot-badge">Called</span>',
  voicemail:'<span class="badge badge-blue dot-badge">Voicemail</span>',
  not_respond:'<span class="badge badge-orange dot-badge">Not Respond</span>',
  follow_up:'<span class="badge badge-yellow dot-badge">Follow Up</span>',
  interested:'<span class="badge badge-purple dot-badge">Interested</span>',
  onboard:'<span class="badge badge-teal dot-badge">Onboard</span>'
};return m[s]||m.not_called;}
function sevBadgeHtml(s){if(s>=9)return`<span class="badge badge-red">${s}/10</span>`;if(s>=7)return`<span class="badge badge-orange">${s}/10</span>`;if(s>=5)return`<span class="badge badge-yellow">${s}/10</span>`;if(s>=3)return`<span class="badge badge-teal">${s}/10</span>`;return`<span class="badge badge-green">${s}/10</span>`;}

/* ═══ PAGINATION ═══ */
function renderPagination(cid,page,total,onPage){
  const c=document.getElementById(cid);if(!c)return;
  if(total<=1){c.innerHTML='';return;}
  let h=`<button class="page-btn" onclick="(${onPage.toString()})(${page-1})" ${page===1?'disabled':''}>‹</button>`;
  paginationRange(page,total).forEach(p=>{if(p==='…')h+=`<button class="page-btn ellipsis page-num">…</button>`;else h+=`<button class="page-btn page-num ${p===page?'active':''}" onclick="(${onPage.toString()})(${p})">${p}</button>`;});
  h+=`<button class="page-btn" onclick="(${onPage.toString()})(${page+1})" ${page===total?'disabled':''}>›</button>`;
  c.innerHTML=h;
}
function paginationRange(c,t){if(t<=7)return Array.from({length:t},(_,i)=>i+1);if(c<=4)return[1,2,3,4,5,'…',t];if(c>=t-3)return[1,'…',t-4,t-3,t-2,t-1,t];return[1,'…',c-1,c,c+1,'…',t];}

/* ═══ CONFIRM MODAL ═══ */
let _confirmCallback=null;
function showConfirm(title,htmlMessage,onConfirm){
  _confirmCallback=onConfirm;
  document.getElementById('confirm-modal-title').textContent=title;
  document.getElementById('confirm-modal-message').innerHTML=htmlMessage;
  document.getElementById('confirm-modal-ok').onclick=()=>{const cb=_confirmCallback;closeConfirmModal();if(cb)cb();};
  document.getElementById('confirm-modal').classList.add('open');
}
function closeConfirmModal(e){
  if(e&&e.target!==document.getElementById('confirm-modal'))return;
  document.getElementById('confirm-modal').classList.remove('open');
  _confirmCallback=null;
}

/* ═══ UTILS ═══ */
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function copyText(t,btn){navigator.clipboard.writeText(t).then(()=>{btn.classList.add('ok');setTimeout(()=>btn.classList.remove('ok'),2000);});}
function formatTimeAgo(d){if(!d)return'–';const diff=Date.now()-new Date(d);const m=Math.floor(diff/60000);const h=Math.floor(m/60);const day=Math.floor(h/24);if(m<1)return'just now';if(m<60)return m+'m ago';if(h<24)return h+'h ago';return day+'d ago';}
function formatDate(d){if(!d)return'–';const dt=new Date(d);return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});}
function isToday(dateStr) {
  if(!dateStr)return false;
  const d=new Date(dateStr);
  const today=new Date();
  return d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
}
function formatDateTime(d){
  if(!d)return'–';
  const dt=new Date(d);
  return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + dt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

function showToast(msg,type='info'){
  const icons={success:'✓',error:'✕',info:'ℹ'};
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');t.className=`toast ${type}`;
  
  const iconSpan=document.createElement('span');
  iconSpan.style.flexShrink='0';
  iconSpan.textContent=icons[type]||'•';
  
  const textSpan=document.createElement('span');
  textSpan.textContent=msg;
  
  t.appendChild(iconSpan);
  t.appendChild(textSpan);
  c.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut .25s ease forwards';setTimeout(()=>t.remove(),250);},3000);
}

/* ═══ INIT ═══ */
(function init(){
  const saved=loadSession();
  if(saved){
    session=saved;
    showScreen('app');
    // Eagerly switch to correct view skeleton BEFORE data loads
    // so refresh shows the right skeleton (not always Dashboard)
    const hash=window.location.hash||'';
    const match=hash.match(/^#\/(.+)$/);
    const eagerView=match&&VALID_VIEWS.includes(match[1])?match[1]:'dashboard';
    document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
    const vEl=document.getElementById('view-'+eagerView);
    if(vEl)vEl.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const nEl=document.getElementById('nav-'+eagerView);
    if(nEl)nEl.classList.add('active');
    // Then load data and route properly (writes correct hash)
    initApp().then(()=>navigateFromHash());
  } else {
    showScreen('login');
  }
})();

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (document.getElementById('view-dashboard')?.classList.contains('active')) {
      loadDashboard();
    }
  }, 250);
});
