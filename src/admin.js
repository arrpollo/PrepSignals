'use strict';
/* ================= v.21 ADMIN — /admin dashboard (role='admin' only) =================
   Client-side rendering, server-side protection: every query below runs through
   Supabase row-level security, so a non-admin session gets zero rows back no
   matter what URL they open. The route guard here is UX, not the security layer. */
var currentAdminSub='';
var _admCache=null,_admCacheAt=0;

function renderAdmin(sub){
  currentAdminSub=sub||'';
  var el=document.getElementById('adminBody');if(!el)return;
  if(!accountsOn()){el.innerHTML=admShell('<div class="panel meempty" style="margin-top:18px"><div class="big">📡</div>Admin needs a network connection.</div>');return;}
  if(!authReady){el.innerHTML=admShell('<div class="panel meempty" style="margin-top:18px"><div class="big">⏳</div>Checking access…</div>');return;}
  if(!isLoggedIn()||!isAdmin()){
    el.innerHTML='<section class="mehead"><h1>Admin</h1><p>This area is for the PrepSignals admin account.</p></section>'+
      '<div class="panel meempty" style="margin-top:18px"><div class="big">🔐</div>'+
      (isLoggedIn()?'Your account doesn’t have admin access.':'Log in with the admin account to continue.')+
      '<br><br>'+(isLoggedIn()?'<a class="morebtn" href="/me" data-nav style="margin-top:0">Back to Planner</a>'
        :'<button class="morebtn" style="margin-top:0" onclick="openAuth(\'login\',\'admin\')">Log in</button>')+'</div>';
    return;
  }
  el.innerHTML=admShell('<div class="panel meempty" style="margin-top:18px"><div class="big">📊</div>Loading data…</div>');
  track('admin_view',{tab:currentAdminSub||'overview'});
  if(currentAdminSub==='feedback'){
    track('feedback_admin_view',{});
    admFeedbackData().then(function(rows){
      if(currentView!=='admin')return;
      el.innerHTML=admShell(admFeedbackHTML(rows));
      observeGrow(el);
    }).catch(function(){
      el.innerHTML=admShell('<div class="panel meempty" style="margin-top:18px"><div class="big">⚠️</div>Could not load feedback — check the v.21 Supabase setup.</div>');
    });
    return;
  }
  admData().then(function(D){
    if(currentView!=='admin')return;
    var body=currentAdminSub==='users'?admUsersHTML(D)
      :currentAdminSub==='content'?admContentHTML(D)
      :currentAdminSub==='events'||currentAdminSub==='funnels'?admEventsHTML()
      :admOverviewHTML(D);
    el.innerHTML=admShell(body);
    observeGrow(el);
  }).catch(function(){
    el.innerHTML=admShell('<div class="panel meempty" style="margin-top:18px"><div class="big">⚠️</div>Could not load admin data — check that supabase/setup.sql ran and this account has role=admin.</div>');
  });
}
function admShell(inner){
  var tabs=[['','Overview'],['users','Users'],['content','Content'],['feedback','Feedback'],['events','Events & funnels']];
  return '<section class="mehead" style="padding-bottom:6px"><h1>Admin</h1>'+
    '<p>Signups and saved-content live here (Supabase); behavior funnels live in <a href="'+POSTHOG_PROJECT_URL+'" target="_blank" rel="noopener">PostHog</a>.</p></section>'+
    '<div class="admtabs">'+tabs.map(function(t){
      var on=(currentAdminSub||'')===t[0]||(t[0]==='events'&&currentAdminSub==='funnels');
      return '<a href="/admin'+(t[0]?'/'+t[0]:'')+'" data-nav class="admtab'+(on?' on':'')+'">'+t[1]+'</a>';}).join('')+'</div>'+
    inner+'<div style="height:46px"></div>';
}
async function admFeedbackData(){
  var res=await sbClient.from('feedback_messages').select('id,user_id,email,title,body,status,created_at,updated_at').order('created_at',{ascending:false}).limit(100);
  if(res.error)throw res.error;
  return res.data||[];
}
function admFeedbackHTML(rows){
  var counts=admDist(rows,'status','new');
  var html=admStatCards([
    {v:rows.length,l:'messages'},
    {v:rows.filter(function(r){return r.status==='new';}).length,l:'new',cls:'coral'},
    {v:rows.filter(function(r){return r.status==='reviewing';}).length,l:'reviewing',cls:'green'},
    {v:rows.filter(function(r){return r.status==='closed';}).length,l:'closed'}
  ]);
  html+=admPanel('Feedback status','Latest 100 messages from the About page.',
    counts.length?hBarsHTML(counts,rows.length||1,{color:'var(--primary)'}):'<div class="empty2">No feedback yet.</div>');
  html+=admPanel('Messages','Use status buttons to triage messages after reading.',
    rows.length?'<div class="feedbacklist">'+rows.map(admFeedbackCard).join('')+'</div>':'<div class="empty2">No feedback yet.</div>');
  return html;
}
function admFeedbackCard(r){
  var statuses=['new','reviewing','closed'];
  return '<article class="fbcard rise"><div class="fbtop"><div><h3>'+esc(r.title||'(untitled)')+'</h3>'+
    '<p>'+esc((r.created_at||'').slice(0,10))+' · '+esc(r.email||'—')+'</p></div>'+
    '<span class="fbstatus '+esc(r.status||'new')+'">'+esc(r.status||'new')+'</span></div>'+
    '<p class="fbbody">'+esc(r.body||'')+'</p>'+
    '<div class="fbactions">'+statuses.map(function(s){
      return '<button type="button" class="'+((r.status||'new')===s?'on':'')+'" onclick="setFeedbackStatus('+Number(r.id)+',\''+s+'\')">'+esc(s)+'</button>';
    }).join('')+'</div></article>';
}
async function setFeedbackStatus(id,status){
  if(!sbClient||!isAdmin())return;
  try{
    var res=await sbClient.from('feedback_messages').update({status:status,updated_at:new Date().toISOString()}).eq('id',id);
    if(res.error){toast('Could not update feedback');return;}
    _admCache=null;
    renderAdmin('feedback');
  }catch(e){toast('Could not update feedback');}
}
async function admData(){
  var now=Date.now();
  if(_admCache&&now-_admCacheAt<60000)return _admCache;
  var got=await Promise.all([
    sbClient.from('profiles').select('id,email,name,role,marketing_opt_in,signup_source,target_score,weak_area,prep_stage,test_timeline,test_month,created_at').order('created_at',{ascending:false}),
    sbClient.from('saved_debriefs').select('user_id,debrief_id'),
    sbClient.from('progress_entries').select('user_id'),
    sbClient.from('checklists').select('user_id,done')
  ]);
  for(var i=0;i<got.length;i++)if(got[i].error)throw got[i].error;
  _admCache={profiles:got[0].data||[],saved:got[1].data||[],progress:got[2].data||[],checks:got[3].data||[]};
  _admCacheAt=now;
  return _admCache;
}
function admStatCards(items){
  return '<div class="statrow" style="margin-top:16px">'+items.map(function(s){
    return '<div class="stat '+(s.cls||'')+'"><div class="v">'+s.v+'</div><div class="l">'+esc(s.l)+'</div></div>';}).join('')+'</div>';
}
function admDist(rows,field,fallback){
  var counts={};
  rows.forEach(function(r){var v=r[field]||fallback;counts[v]=(counts[v]||0)+1;});
  return Object.entries(counts).sort(function(a,b){return b[1]-a[1];});
}
function admPanel(title,sub,inner){
  return '<div class="panel rise" style="margin-top:16px"><h3>'+esc(title)+'</h3>'+
    (sub?'<p class="psub">'+esc(sub)+'</p>':'')+inner+'</div>';
}
function admSince(profiles,days){
  var cut=Date.now()-days*86400000;
  return profiles.filter(function(p){return new Date(p.created_at).getTime()>=cut;}).length;
}
function admOverviewHTML(D){
  var P=D.profiles,n=P.length||0;
  var optIn=P.filter(function(p){return p.marketing_opt_in;}).length;
  var savers=new Set(D.saved.map(function(r){return r.user_id;})).size;
  var loggers=new Set(D.progress.map(function(r){return r.user_id;})).size;
  var doneTicks=0,totTicks=0;
  D.checks.forEach(function(c){var d=Array.isArray(c.done)?c.done:[];totTicks+=4;doneTicks+=d.filter(Boolean).length;});
  var html=admStatCards([
    {v:n,l:'accounts'},
    {v:admSince(P,7),l:'new · 7 days',cls:'green'},
    {v:admSince(P,30),l:'new · 30 days'},
    {v:n?pct(optIn,n)+'%':'—',l:'promo opt-in',cls:'coral'}
  ]);
  html+=admStatCards([
    {v:D.saved.length,l:'debriefs saved'},
    {v:n?pct(savers,n)+'%':'—',l:'users who save',cls:'green'},
    {v:D.progress.length,l:'progress entries'},
    {v:totTicks?pct(doneTicks,totTicks)+'%':'—',l:'checklist completion'}
  ]);
  var src=admDist(P,'signup_source','(unknown)');
  html+=admPanel('Where signups come from','Which prompt converted — plan, save_debrief, checklist, progress, me, nav.',
    src.length?hBarsHTML(src,n,{color:'var(--primary)'}):'<div class="empty2">No signups yet.</div>');
  html+=admPanel('Latest signups','Newest 8 accounts — the full list is under Users.',admUserTable(P.slice(0,8)));
  return html;
}
function admUsersHTML(D){
  var P=D.profiles,n=P.length;
  var html=admStatCards([
    {v:n,l:'accounts'},
    {v:P.filter(function(p){return p.role==='admin';}).length,l:'admins'},
    {v:n?pct(P.filter(function(p){return p.marketing_opt_in;}).length,n)+'%':'—',l:'promo opt-in',cls:'coral'},
    {v:n?pct(P.filter(function(p){return p.target_score;}).length,n)+'%':'—',l:'profiled target',cls:'green'}
  ]);
  html+='<div class="grid2" style="margin-top:16px">'
    +admPanel('Target score','', admBars(admDist(P.filter(function(p){return p.target_score;}),'target_score'),n,'var(--primary)'))
    +admPanel('Main weak area','',admBars(admDist(P.filter(function(p){return p.weak_area;}),'weak_area'),n,'var(--blue)'))
    +'</div><div class="grid2" style="margin-top:16px">'
    +admPanel('Test timeline','',admBars(admDist(P.filter(function(p){return p.test_timeline;}),'test_timeline'),n,'var(--green)'))
    +admPanel('Prep stage','',admBars(admDist(P.filter(function(p){return p.prep_stage;}),'prep_stage'),n,'var(--amber)'))
    +'</div>';
  html+=admPanel('All users','Sorted newest first.',admUserTable(P));
  return html;
}
function admBars(dist,total,color){
  return dist.length?hBarsHTML(dist,total,{color:color}):'<div class="empty2">No data yet.</div>';
}
function admUserTable(rows){
  if(!rows.length)return '<div class="empty2">No accounts yet.</div>';
  var tr=rows.map(function(p){
    return '<tr><td>'+esc((p.created_at||'').slice(0,10))+'</td><td>'+esc(p.name||'—')+'</td>'+
      '<td>'+esc(p.email||'—')+(p.role==='admin'?' <span class="admrole">admin</span>':'')+'</td>'+
      '<td>'+(p.marketing_opt_in?'✓':'—')+'</td><td>'+esc(p.target_score||'—')+'</td>'+
      '<td>'+esc(p.weak_area||'—')+'</td><td>'+esc(p.prep_stage||'—')+'</td><td>'+esc(p.signup_source||'—')+'</td></tr>';
  }).join('');
  return '<div class="admtablewrap"><table class="admtable"><thead><tr>'+
    '<th>Joined</th><th>Name</th><th>Email</th><th>Promo</th><th>Target</th><th>Weak area</th><th>Stage</th><th>Source</th>'+
    '</tr></thead><tbody>'+tr+'</tbody></table></div>';
}
function admContentHTML(D){
  var byDeb={};
  D.saved.forEach(function(r){byDeb[r.debrief_id]=(byDeb[r.debrief_id]||0)+1;});
  var top=Object.entries(byDeb).sort(function(a,b){return b[1]-a[1];}).slice(0,12)
    .map(function(e){var d=DEB.find(function(x){return x.id===e[0];});
      return [(d?d.total+' · '+d.title:e[0]).slice(0,70),e[1]];});
  var perUser={};
  D.saved.forEach(function(r){perUser[r.user_id]=(perUser[r.user_id]||0)+1;});
  var savedCounts=Object.values(perUser);
  var progPer={};
  D.progress.forEach(function(r){progPer[r.user_id]=(progPer[r.user_id]||0)+1;});
  var progCounts=Object.values(progPer);
  var html=admStatCards([
    {v:D.saved.length,l:'saves total'},
    {v:savedCounts.length?fmt(median(savedCounts)):'—',l:'saves / saver',cls:'green'},
    {v:D.progress.length,l:'progress entries'},
    {v:progCounts.length?fmt(median(progCounts)):'—',l:'entries / logger',cls:'coral'}
  ]);
  html+=admPanel('Most-saved debriefs','Save counts across all users; open PostHog for most-viewed.',
    top.length?hBarsHTML(top,Math.max.apply(null,top.map(function(t){return t[1];})),{color:'var(--amber)'}):'<div class="empty2">Nothing saved yet.</div>');
  html+=admPanel('Checklist state','Each account keeps one active 4-tick checklist per plan.',
    D.checks.length?hBarsHTML([['0 checks',D.checks.filter(function(c){return !(c.done||[]).filter(Boolean).length;}).length],
      ['1–3 checks',D.checks.filter(function(c){var k=(c.done||[]).filter(Boolean).length;return k>0&&k<4;}).length],
      ['all 4 done',D.checks.filter(function(c){return (c.done||[]).filter(Boolean).length>=4;}).length]],
      D.checks.length,{color:'var(--green)'}):'<div class="empty2">No checklists yet.</div>');
  return html;
}
function admEventsHTML(){
  var events=[
    ['$pageview','every route change (path, explore, debrief, me, admin…)'],
    ['intake_submit / plan_view','plan generation funnel start'],
    ['auth_prompt / auth_modal_open','signup prompts by source (plan, save_debrief, checklist, progress, me, nav)'],
    ['signup_completed / login / logout','account funnel'],
    ['save_toggle / check_toggle / progress_add','save-action engagement'],
    ['debrief_open / origin_click','content reads + clicks out to Reddit / GMAT Club'],
    ['x_filter / x_bar_open / x_sort / x_more','Explore engagement (incl. resource interest via filters)'],
    ['profile_updated / prep_stage_set / account_synced','profile completeness'],
    ['password_reset_requested / password_reset_done','recovery flow'],
    ['account_menu_open / password_change_done','account menu and security actions'],
    ['planner_prompt_click / planner_task_click','Study Planner assistant prompts and next-step clicks'],
    ['feedback_submit / feedback_admin_view','About-page feedback and admin triage'],
  ];
  var funnels=[
    'Visitor → plan completed:  $pageview → intake_submit → plan_view',
    'Plan completed → signup:  plan_view → auth_modal_open (source=plan) → signup_completed',
    'Save-click → signup:  auth_prompt (source=save_debrief) → signup_completed',
    'Return rate 1/7/30 days:  PostHog → Retention on $pageview',
    'Most-opened debriefs:  Trends on debrief_open, break down by "id"',
    'Resource interest:  Trends on x_filter / x_bar_open, break down by properties',
    'Planner value:  planner_prompt_click → planner_task_click → progress_add',
    'Feedback loop:  feedback_submit → feedback_admin_view',
  ];
  return admPanel('Product events this site sends','Definitions live in app.js/auth.js; every event goes to PostHog and Vercel Analytics.',
      '<ul class="admlist">'+events.map(function(e){return '<li><code>'+esc(e[0])+'</code> — '+esc(e[1])+'</li>';}).join('')+'</ul>')
    +admPanel('Funnels to build in PostHog','One-time setup in the PostHog UI — these cover the metrics wishlist.',
      '<ul class="admlist">'+funnels.map(function(f){return '<li>'+esc(f)+'</li>';}).join('')+'</ul>'
      +'<a class="morebtn" href="'+POSTHOG_PROJECT_URL+'" target="_blank" rel="noopener" style="margin-top:14px">Open PostHog project '+ARROW_SM+'</a>')
    +admPanel('Raw data','Signups and saved rows live in Supabase; use the table editor for anything this page doesn’t show.',
      '<a class="morebtn" href="https://supabase.com/dashboard/project/vzcgjuqxwsadbpslaujr" target="_blank" rel="noopener" style="margin-top:4px">Open Supabase dashboard '+ARROW_SM+'</a>');
}
