'use strict';
/* ================= v.21 AUTH — Supabase accounts, sync, save-gating =================
   Concatenated after app.js by build_v21.py. Everything here uses `var` +
   function declarations on purpose: app.js boots (applyRoute) before this
   section's top-level statements run, so TDZ-free globals keep the first
   render safe. All UI re-renders once auth state resolves. */
var SUPABASE_URL='https://vzcgjuqxwsadbpslaujr.supabase.co';
var SUPABASE_KEY='sb_publishable_nXqTuX9CzxLa4bk5JgJGxQ_QVjJ2XU5';
var TERMS_VERSION='2026-07-02';
var POSTHOG_PROJECT_URL='https://us.posthog.com/project/494794';

var sbClient=null;          /* supabase client (null => accounts unavailable, app falls back to v.20 local-only behavior) */
var authUser=null;          /* supabase auth user or null */
var authProfile=null;       /* row from public.profiles or null */
var authReady=false;        /* first auth state resolved */
var _authSource='direct';   /* which prompt opened the modal (signup_source analytics) */
var _authLastUid=null;
var _pendingSaveId=null;    /* debrief save retried after login completes */
var _confirmToastPending=false;

function accountsOn(){return !!sbClient;}
function isLoggedIn(){return !!authUser;}
function emailVerified(){return !!(authUser&&authUser.email_confirmed_at);}
function isAdmin(){return !!(authProfile&&authProfile.role==='admin');}
function authName(){return (authProfile&&authProfile.name)||(authUser&&((authUser.user_metadata||{}).name||authUser.email))||'';}
function accountInitial(){
  var n=(authName()||authUser&&authUser.email||'?').trim();
  return (n.charAt(0)||'?').toUpperCase();
}

/* ---------- boot ---------- */
function initAuthClient(){
  try{
    if(FILE_MODE||!window.supabase||!window.supabase.createClient){renderNavAuth();return;}
    sbClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    sbClient.auth.onAuthStateChange(function(event,session){
      /* defer: never await supabase calls inside the callback itself */
      setTimeout(function(){handleAuthChange(event,session);},0);
    });
  }catch(e){sbClient=null;}
  renderNavAuth();
}
async function handleAuthChange(event,session){
  authUser=(session&&session.user)||null;
  authReady=true;
  if(event==='PASSWORD_RECOVERY'){renderNavAuth();openAuth('reset','recovery');return;}
  if(authUser){
    if(_authLastUid!==authUser.id){
      _authLastUid=authUser.id;
      identifyAnalytics();
      await loadProfile();
      if(emailVerified()){
        await syncAccount();
        if(_confirmToastPending){_confirmToastPending=false;toast('Email verified — your data now syncs to your account');}
        if(_pendingSaveId){var pid=_pendingSaveId;_pendingSaveId=null;if(!isSaved(pid))toggleSave(pid);}
      }
    }else if(event==='USER_UPDATED'){await loadProfile();}
  }else{
    if(_authLastUid){
      _authLastUid=null;authProfile=null;
      try{if(window.posthog&&typeof posthog.reset==='function')posthog.reset();}catch(e){}
    }
  }
  renderNavAuth();updateAdminNav();refreshAuthUI();
}
function identifyAnalytics(){
  try{
    if(window.posthog&&typeof posthog.identify==='function'&&authUser)
      posthog.identify(authUser.id,{email:authUser.email,name:(authUser.user_metadata||{}).name||''});
  }catch(e){}
}
/* re-render whatever view is on screen so auth-dependent chrome updates */
function refreshAuthUI(){
  try{
    if(currentView==='me')renderMe(currentMeSub);
    else if(currentView==='admin'&&typeof renderAdmin==='function')renderAdmin(currentAdminSub);
    else if(currentView==='account'&&typeof renderAccount==='function')renderAccount(parseRoute().accountSub||'profile');
    else if(currentView==='about')refreshAboutFeedback();
    else if(currentView==='path')renderPlanView();
  }catch(e){}
}

/* ---------- profile ---------- */
async function loadProfile(){
  if(!sbClient||!authUser)return;
  try{
    var res=await sbClient.from('profiles').select('*').eq('id',authUser.id).maybeSingle();
    var data=res.data;
    if(!data&&!res.error){
      /* trigger fallback: create the row client-side if setup.sql ran after this signup */
      var meta=authUser.user_metadata||{};
      var ins=await sbClient.from('profiles').upsert({
        id:authUser.id,email:authUser.email,name:meta.name||'',
        marketing_opt_in:!!meta.marketing_opt_in,
        signup_source:meta.signup_source||null,terms_version:meta.terms_version||TERMS_VERSION
      }).select().maybeSingle();
      data=ins.data;
    }
    authProfile=data||null;
  }catch(e){authProfile=null;}
  updateAdminNav();
}
async function saveProfilePatch(patch){
  if(!sbClient||!authUser)return false;
  patch.updated_at=new Date().toISOString();
  try{
    var res=await sbClient.from('profiles').update(patch).eq('id',authUser.id);
    if(res.error)return false;
    authProfile=Object.assign(authProfile||{},patch);
    return true;
  }catch(e){return false;}
}
/* fill target/timeline/weak-area from plan answers — collected "as the user uses the site" */
function updateProfileFromPlan(){
  if(!sbClient||!authUser||!emailVerified()||!planComplete())return;
  var b=bandOf(plan.tgt),c=curBucketOf(plan.cur),wk=wkBucketOf(plan.wk),f=focusOf(plan.focus);
  var patch={target_score:b?b.label:null,current_score:c?c.label:null,test_timeline:wk?wk.label:null};
  if(f&&f.key!=='unsure')patch.weak_area=f.label;
  saveProfilePatch(patch);
}
function setPrepStage(v){
  saveProfilePatch({prep_stage:v}).then(function(ok){
    if(ok){track('prep_stage_set',{stage:v});toast('Saved');refreshAuthUI();}
  });
}

/* ---------- gating: save actions need a verified account ---------- */
function requireAuth(source,title,msg,opts){
  if(!accountsOn())return true;              /* offline / file:// — keep v.20 local behavior */
  if(isLoggedIn()&&emailVerified())return true;
  if(opts&&opts.saveId)_pendingSaveId=opts.saveId;
  if(isLoggedIn()&&!emailVerified())openAuth('verify',source);
  else openAuth('signup',source,{title:title,msg:msg});
  track('auth_prompt',{source:source});
  return false;
}

/* ---------- cloud writes (fire-and-forget; localStorage stays the cache) ---------- */
function cloudOK(){return !!(sbClient&&authUser&&emailVerified());}
function cloudSavePlan(){
  if(!cloudOK()||!planComplete())return;
  sbClient.from('plans').upsert({user_id:authUser.id,cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus||'unsure',updated_at:new Date().toISOString()}).then(function(){});
}
function cloudSaveChecks(){
  if(!cloudOK())return;
  sbClient.from('checklists').upsert({user_id:authUser.id,sig:planSig(),done:loadChecks(),updated_at:new Date().toISOString()}).then(function(){});
}
function cloudSaveDebrief(id,on){
  if(!cloudOK())return;
  if(on)sbClient.from('saved_debriefs').upsert({user_id:authUser.id,debrief_id:id},{onConflict:'user_id,debrief_id',ignoreDuplicates:true}).then(function(){});
  else sbClient.from('saved_debriefs').delete().eq('user_id',authUser.id).eq('debrief_id',id).then(function(){});
}
function cloudSaveProgress(){
  if(!cloudOK())return;
  var uid=authUser.id,rows=loadProg().map(function(e){return{
    user_id:uid,date:e.date,kind:e.kind,total:e.total,q:e.q,v:e.v,di:e.di,
    section_focus:e.section_focus||null,review_tags:Array.isArray(e.review_tags)?e.review_tags:[],notes:e.notes||null
  };});
  sbClient.from('progress_entries').delete().eq('user_id',uid).then(function(){
    if(rows.length)sbClient.from('progress_entries').insert(rows).then(function(){});
  });
}

/* ---------- sync: local -> cloud merge (first login migrates v.20 data), then cloud -> local ---------- */
async function syncAccount(){
  if(!cloudOK())return;
  var uid=authUser.id;
  try{
    var got=await Promise.all([
      sbClient.from('plans').select('*').eq('user_id',uid).maybeSingle(),
      sbClient.from('checklists').select('*').eq('user_id',uid).maybeSingle(),
      sbClient.from('saved_debriefs').select('debrief_id').eq('user_id',uid),
      sbClient.from('progress_entries').select('date,kind,total,q,v,di,section_focus,review_tags,notes').eq('user_id',uid).order('date')
    ]);
    var cPlan=got[0].data,cChecks=got[1].data,cSaved=(got[2].data||[]).map(function(r){return r.debrief_id;}),cProg=got[3].data||[];

    /* plan: cloud wins if it exists; otherwise migrate local up */
    if(cPlan&&CURB.find(function(c){return c.key===cPlan.cur;})&&BANDS.find(function(b){return b.key===cPlan.tgt;})){
      plan={cur:cPlan.cur,tgt:cPlan.tgt,wk:cPlan.wk,focus:cPlan.focus||'unsure'};showIntakeForm=false;savePlanLS();
    }else if(planComplete()){
      await sbClient.from('plans').upsert({user_id:uid,cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus||'unsure'});
    }
    /* checklist: cloud row for the current plan sig wins; otherwise migrate local */
    var localChecks=loadChecks();
    if(cChecks&&cChecks.sig===planSig()&&Array.isArray(cChecks.done)){saveChecks(cChecks.done);}
    else if(localChecks.some(Boolean)){await sbClient.from('checklists').upsert({user_id:uid,sig:planSig(),done:localChecks});}
    /* saved debriefs: union */
    var localSaved=loadSaved();
    var missing=localSaved.filter(function(id){return cSaved.indexOf(id)<0;}).map(function(id){return{user_id:uid,debrief_id:id};});
    if(missing.length)await sbClient.from('saved_debriefs').upsert(missing,{onConflict:'user_id,debrief_id',ignoreDuplicates:true});
    var savedUnion=localSaved.concat(cSaved.filter(function(id){return localSaved.indexOf(id)<0;}));
    saveSaved(savedUnion);
    /* progress: union on (date,kind,total) */
    var key=function(e){return [e.date,e.kind,e.total].join('|');};
    var cloudKeys=new Set(cProg.map(key));
    var newRows=loadProg().filter(function(e){return !cloudKeys.has(key(e));})
      .map(function(e){return{user_id:uid,date:e.date,kind:e.kind,total:e.total,q:e.q,v:e.v,di:e.di,
        section_focus:e.section_focus||null,review_tags:Array.isArray(e.review_tags)?e.review_tags:[],notes:e.notes||null};});
    if(newRows.length)await sbClient.from('progress_entries').insert(newRows);
    var localKeys=new Set(loadProg().map(key));
    var merged=loadProg().concat(cProg.filter(function(e){return !localKeys.has(key(e));}).map(function(e){
      return{date:e.date,kind:e.kind,total:e.total,q:e.q,v:e.v,di:e.di,
        section_focus:e.section_focus||null,review_tags:Array.isArray(e.review_tags)?e.review_tags:[],notes:e.notes||null};}));
    merged.sort(function(x,y){return String(x.date).localeCompare(String(y.date));});
    saveProg(merged);
    track('account_synced',{saved:savedUnion.length,progress:merged.length});
  }catch(e){}
  refreshAuthUI();
}

/* ---------- header chip ---------- */
function renderNavAuth(){
  var el=document.getElementById('navAuth');if(!el)return;
  if(!accountsOn()){el.innerHTML='';return;}
  if(isLoggedIn()){
    var n=authName(),init=accountInitial();
    el.innerHTML='<span class="acctmenuwrap">'+
      '<button type="button" id="accountMenuBtn" class="userchip'+(emailVerified()?'':' unverified')+'" title="'+esc(n)+(emailVerified()?'':' — email not verified yet')+'" aria-label="Open account menu" aria-haspopup="menu" aria-expanded="false" onclick="toggleAccountMenu()">'+esc(init)+'</button>'+
      '<div class="acctmenu" id="accountMenu" role="menu" aria-label="Account menu">'+
      '<div class="acctmenutop"><b>'+esc(n||'Account')+'</b><span>'+esc(authUser.email||'')+'</span></div>'+
      '<a role="menuitem" href="/me" data-nav onclick="closeAccountMenu()">Study Planner</a>'+
      '<a role="menuitem" href="/account/profile" data-nav onclick="closeAccountMenu()">Profile</a>'+
      '<a role="menuitem" href="/account/security" data-nav onclick="closeAccountMenu()">Password &amp; security</a>'+
      (isAdmin()?'<a role="menuitem" href="/admin" data-nav onclick="closeAccountMenu()">Admin dashboard</a>':'')+
      '<button type="button" role="menuitem" onclick="closeAccountMenu();doLogout()">Sign out</button>'+
      '</div></span>';
  }else{
    el.innerHTML='<button type="button" class="loginbtn" onclick="openAuth(\'login\',\'nav\')" aria-label="Log in or create account">Log in</button>';
  }
}
function toggleAccountMenu(){
  var m=document.getElementById('accountMenu'),b=document.getElementById('accountMenuBtn');
  if(!m||!b)return;
  var on=!m.classList.contains('on');
  m.classList.toggle('on',on);
  b.setAttribute('aria-expanded',on?'true':'false');
  if(on)track('account_menu_open',{admin:isAdmin()});
}
function closeAccountMenu(){
  var m=document.getElementById('accountMenu'),b=document.getElementById('accountMenuBtn');
  if(m)m.classList.remove('on');
  if(b)b.setAttribute('aria-expanded','false');
}
function updateAdminNav(){
  var a=document.getElementById('nav-admin');if(a)a.classList.toggle('hidden',!isAdmin());
}

/* ---------- deep links: /auth/confirm (email verified) · /auth/reset (recovery) ---------- */
function onAuthDeepLink(sub){
  if(sub==='confirm'){
    _confirmToastPending=true;
    /* if the token was already processed before routing, the toast fires from handleAuthChange;
       if the link was opened in another browser, verification already happened server-side */
    setTimeout(function(){
      if(_confirmToastPending&&!isLoggedIn()){
        _confirmToastPending=false;
        toast('Email verified — log in to start syncing');
        openAuth('login','confirm');
      }
    },1600);
  }else if(sub==='reset'){
    /* PASSWORD_RECOVERY fires once supabase-js consumes the hash; this is the direct-visit fallback */
    setTimeout(function(){
      var m=document.getElementById('authModal');
      if(m&&!m.classList.contains('on'))openAuth('reset','recovery');
    },900);
  }
}

/* ---------- modal ---------- */
function openAuth(mode,source,opts){
  if(!accountsOn()){toast('Accounts need a network connection');return;}
  closeAccountMenu();
  _authSource=source||_authSource||'direct';
  var m=document.getElementById('authModal');if(!m)return;
  m.innerHTML=authCardHTML(mode,opts||{});
  m.classList.add('on');document.body.style.overflow='hidden';
  track('auth_modal_open',{mode:mode,source:_authSource});
  var f=m.querySelector('input');if(f)setTimeout(function(){try{f.focus();}catch(e){}},60);
}
function closeAuth(){
  var m=document.getElementById('authModal');if(!m)return;
  m.classList.remove('on');
  document.body.style.overflow=(document.getElementById('detail').classList.contains('on')||document.getElementById('cohort').classList.contains('on'))?'hidden':'';
  setTimeout(function(){if(!m.classList.contains('on'))m.innerHTML='';},250);
}
function authErr(msg){
  var e=document.getElementById('authErr');
  if(e){e.textContent=msg;e.classList.remove('hidden');}
}
function authClearError(){
  var e=document.getElementById('authErr');
  if(e){e.textContent='';e.classList.add('hidden');}
}
function authFieldName(id){
  return {auName:'Name',auEmail:'Email',auPw:'Password',auPw2:'Password confirmation',auTerms:'Terms'}[id]||'This field';
}
function authFieldMsg(el){
  if(!el)return '';
  var id=el.id,name=authFieldName(id);
  if(el.validity&&el.validity.valueMissing)return id==='auTerms'?'Please accept the Terms to continue.':name+' is required.';
  if(el.validity&&el.validity.typeMismatch)return 'Enter a valid email address.';
  if(el.validity&&el.validity.tooShort)return name+' needs at least '+el.getAttribute('minlength')+' characters.';
  return '';
}
function authSetFieldError(id,msg){
  var el=document.getElementById(id),err=document.getElementById(id+'Err');
  if(el){el.setAttribute('aria-invalid','true');}
  if(err){err.textContent=msg;err.classList.remove('hidden');}
  var wrap=el&&el.closest('.afield,.acheck');
  if(wrap)wrap.classList.add('bad');
}
function authClearFieldError(id){
  var el=document.getElementById(id),err=document.getElementById(id+'Err');
  if(el){el.removeAttribute('aria-invalid');}
  if(err){err.textContent='';err.classList.add('hidden');}
  var wrap=el&&el.closest('.afield,.acheck');
  if(wrap)wrap.classList.remove('bad');
}
function authClearAllFieldErrors(){
  ['auName','auEmail','auPw','auPw2','auTerms'].forEach(authClearFieldError);
}
function authNativeInvalid(ev){
  if(!ev||!ev.target)return;
  ev.preventDefault();
  authSetFieldError(ev.target.id,authFieldMsg(ev.target));
}
function authFieldInput(ev){
  if(ev&&ev.target)authClearFieldError(ev.target.id);
}
function authStopAt(id,msg){
  authSetFieldError(id,msg);
  var el=document.getElementById(id);
  if(el)try{el.focus();}catch(e){}
  return false;
}
function authBusy(on){
  var b=document.getElementById('authGo');
  if(b){b.disabled=!!on;b.classList.toggle('busy',!!on);}
}
function togglePassword(id,btn){
  var input=document.getElementById(id);
  if(!input)return;
  var showing=input.type==='text';
  input.type=showing?'password':'text';
  if(btn){
    btn.textContent=showing?'Show':'Hide';
    btn.setAttribute('aria-label',(showing?'Show':'Hide')+' password');
    btn.setAttribute('aria-pressed',showing?'false':'true');
  }
  try{input.focus();}catch(e){}
}
function pwFieldHTML(label,id,autocomplete,placeholder){
  return '<label class="afield"><span class="alabel">'+esc(label)+' <span class="req">required</span></span>'+
    '<span class="apw"><input type="password" id="'+esc(id)+'" autocomplete="'+esc(autocomplete)+'" minlength="8" placeholder="'+esc(placeholder)+'" required aria-describedby="'+esc(id)+'Err" oninvalid="authNativeInvalid(event)" oninput="authFieldInput(event)">'+
    '<button type="button" class="apwbtn" onclick="togglePassword(\''+esc(id)+'\',this)" aria-label="Show password" aria-pressed="false">Show</button></span>'+
    '<span class="aferr hidden" id="'+esc(id)+'Err"></span></label>';
}
function authCardHTML(mode,opts){
  var close='<button type="button" class="aclose" onclick="closeAuth()" aria-label="Close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  var err='<div class="aerr hidden" id="authErr"></div>';
  var logo='<div class="alogo">Prep<b>Signals</b><span class="dot"></span></div>';
  if(mode==='signup'){
    var title=(opts&&opts.title)||'Create your free account';
    var msg=(opts&&opts.msg)||'Save your plan, checklist, debriefs, and progress across devices.';
    return '<div class="authcard">'+close+logo+
      '<h3>'+esc(title)+'</h3><p class="asub">'+esc(msg)+'</p>'+err+
      '<form onsubmit="doSignup(event)">'+
      '<label class="afield"><span class="alabel">Name <span class="req">required</span></span><input type="text" id="auName" autocomplete="name" maxlength="80" placeholder="Your name" required aria-describedby="auNameErr" oninvalid="authNativeInvalid(event)" oninput="authFieldInput(event)"><span class="aferr hidden" id="auNameErr"></span></label>'+
      '<label class="afield"><span class="alabel">Email <span class="req">required</span></span><input type="email" id="auEmail" autocomplete="email" placeholder="you@example.com" required aria-describedby="auEmailErr" oninvalid="authNativeInvalid(event)" oninput="authFieldInput(event)"><span class="aferr hidden" id="auEmailErr"></span></label>'+
      pwFieldHTML('Password','auPw','new-password','8+ characters')+
      '<label class="acheck"><input type="checkbox" id="auTerms" required aria-describedby="auTermsErr" oninvalid="authNativeInvalid(event)" onchange="authFieldInput(event)"><span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> <b class="req reqinline">required</b></span></label><span class="aferr checkerr hidden" id="auTermsErr"></span>'+
      '<label class="acheck optional"><input type="checkbox" id="auMkt"><span>Send me prep offers, product updates, and study tips</span></label>'+
      '<p class="atrust">Optional. No prep offers unless you check this.</p>'+
      '<details class="whyacct"><summary>Why create an account?</summary><p>Only saving needs signup, so your plan, checklist, saved debriefs, and score log can sync.</p></details>'+
      '<button type="submit" class="abtn" id="authGo">Create free account</button></form>'+
      '<div class="aswap">Already have an account? <button type="button" class="alink" onclick="openAuth(\'login\',_authSource)">Log in</button></div></div>';
  }
  if(mode==='login'){
    return '<div class="authcard">'+close+logo+
      '<h3>Welcome back</h3><p class="asub">Log in to your PrepSignals planner.</p>'+err+
      '<form onsubmit="doLogin(event)">'+
      '<label class="afield"><span class="alabel">Email <span class="req">required</span></span><input type="email" id="auEmail" autocomplete="email" placeholder="you@example.com" required aria-describedby="auEmailErr" oninvalid="authNativeInvalid(event)" oninput="authFieldInput(event)"><span class="aferr hidden" id="auEmailErr"></span></label>'+
      pwFieldHTML('Password','auPw','current-password','Your password')+
      '<button type="submit" class="abtn" id="authGo">Log in</button></form>'+
      '<div class="aswap"><button type="button" class="alink" onclick="openAuth(\'forgot\',_authSource)">Forgot password?</button></div>'+
      '<div class="aswap">New here? <button type="button" class="alink" onclick="openAuth(\'signup\',_authSource)">Create a free account</button></div></div>';
  }
  if(mode==='forgot'){
    return '<div class="authcard">'+close+logo+
      '<h3>Reset your password</h3><p class="asub">Enter your account email and we’ll send a reset link.</p>'+err+
      '<form onsubmit="doForgot(event)">'+
      '<label class="afield"><span class="alabel">Email <span class="req">required</span></span><input type="email" id="auEmail" autocomplete="email" placeholder="you@example.com" required aria-describedby="auEmailErr" oninvalid="authNativeInvalid(event)" oninput="authFieldInput(event)"><span class="aferr hidden" id="auEmailErr"></span></label>'+
      '<button type="submit" class="abtn" id="authGo">Send reset link</button></form>'+
      '<div class="aswap"><button type="button" class="alink" onclick="openAuth(\'login\',_authSource)">Back to log in</button></div></div>';
  }
  if(mode==='reset'){
    return '<div class="authcard">'+close+logo+
      '<h3>Choose a new password</h3><p class="asub">You’re resetting the password for this account.</p>'+err+
      '<form onsubmit="doReset(event)">'+
      pwFieldHTML('New password','auPw','new-password','8+ characters')+
      pwFieldHTML('Repeat it','auPw2','new-password','Same password again')+
      '<button type="submit" class="abtn" id="authGo">Set new password</button></form></div>';
  }
  if(mode==='checkmail'){
    var em=(opts&&opts.email)||'';
    return '<div class="authcard">'+close+logo+
      '<div class="abig">📬</div><h3>Check your email</h3>'+
      '<p class="asub">We sent a verification link to <b>'+esc(em)+'</b>. You can keep this tab open.</p>'+
      '<ol class="mailsteps"><li>Check your inbox.</li><li>Click the verification link.</li><li>Return to PrepSignals; your saves will sync.</li></ol>'+err+
      '<button type="button" class="abtn ghost" id="authGo" onclick="doResend(\''+esc(em)+'\')">Resend the email</button>'+
      '<div class="aswap">Wrong address? <button type="button" class="alink" onclick="openAuth(\'signup\',_authSource)">Sign up again</button></div></div>';
  }
  if(mode==='verify'){
    var em2=(authUser&&authUser.email)||'';
    return '<div class="authcard">'+close+logo+
      '<div class="abig">✉️</div><h3>Verify your email first</h3>'+
      '<p class="asub">Saving unlocks after you verify <b>'+esc(em2)+'</b>. Keep this tab open, click the email link, then come back here.</p>'+err+
      '<button type="button" class="abtn ghost" id="authGo" onclick="doResend(\''+esc(em2)+'\')">Resend verification email</button>'+
      '<div class="aswap"><button type="button" class="alink" onclick="doLogout();closeAuth()">Sign out</button></div></div>';
  }
  return '';
}

/* ---------- actions ---------- */
function validEmail(s){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s||'');}
async function doSignup(ev){
  if(ev)ev.preventDefault();
  authClearError();authClearAllFieldErrors();
  var g=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var name=g('auName'),email=g('auEmail'),pw=(document.getElementById('auPw')||{}).value||'';
  var terms=(document.getElementById('auTerms')||{}).checked,mkt=(document.getElementById('auMkt')||{}).checked;
  if(!name)return authStopAt('auName','Name is required.');
  if(!email)return authStopAt('auEmail','Email is required.');
  if(!validEmail(email))return authStopAt('auEmail','Enter a valid email address.');
  if(!pw)return authStopAt('auPw','Password is required.');
  if(pw.length<8)return authStopAt('auPw','Password needs at least 8 characters.');
  if(!terms)return authStopAt('auTerms','Please accept the Terms to continue.');
  authBusy(true);
  try{
    var res=await sbClient.auth.signUp({email:email,password:pw,options:{
      emailRedirectTo:location.origin+'/auth/confirm',
      data:{name:name,marketing_opt_in:!!mkt,signup_source:_authSource||'direct',terms_version:TERMS_VERSION}
    }});
    authBusy(false);
    if(res.error)return authErr(res.error.message);
    var u=res.data&&res.data.user;
    if(u&&Array.isArray(u.identities)&&u.identities.length===0){
      authErr('That email is already registered — log in instead.');return;
    }
    track('signup_completed',{source:_authSource||'direct',marketing_opt_in:!!mkt});
    if(res.data&&res.data.session){closeAuth();toast('Welcome to PrepSignals!');}
    else openAuth('checkmail',_authSource,{email:email});
  }catch(e){authBusy(false);authErr('Could not reach the account service — try again.');}
}
async function doLogin(ev){
  if(ev)ev.preventDefault();
  authClearError();authClearAllFieldErrors();
  var email=((document.getElementById('auEmail')||{}).value||'').trim();
  var pw=(document.getElementById('auPw')||{}).value||'';
  if(!email)return authStopAt('auEmail','Email is required.');
  if(!validEmail(email))return authStopAt('auEmail','Enter a valid email address.');
  if(!pw)return authStopAt('auPw','Password is required.');
  authBusy(true);
  try{
    var res=await sbClient.auth.signInWithPassword({email:email,password:pw});
    authBusy(false);
    if(res.error){
      if(/confirm/i.test(res.error.message)){openAuth('checkmail',_authSource,{email:email});authErr('Verify your email first — you can resend the link below.');return;}
      return authErr(res.error.message==='Invalid login credentials'?'Wrong email or password.':res.error.message);
    }
    track('login',{source:_authSource||'direct'});
    closeAuth();toast('Welcome back!');
  }catch(e){authBusy(false);authErr('Could not reach the account service — try again.');}
}
async function doForgot(ev){
  if(ev)ev.preventDefault();
  authClearError();authClearAllFieldErrors();
  var email=((document.getElementById('auEmail')||{}).value||'').trim();
  if(!email)return authStopAt('auEmail','Email is required.');
  if(!validEmail(email))return authStopAt('auEmail','Enter a valid email address.');
  authBusy(true);
  try{
    var res=await sbClient.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/auth/reset'});
    authBusy(false);
    if(res.error)return authErr(res.error.message);
    track('password_reset_requested',{});
    openAuth('checkmail',_authSource,{email:email});
    var sub=document.querySelector('#authModal .asub');
    if(sub)sub.innerHTML='We sent a <b>password reset link</b> to <b>'+esc(email)+'</b>. Open it on this device to choose a new password.';
  }catch(e){authBusy(false);authErr('Could not reach the account service — try again.');}
}
async function doReset(ev){
  if(ev)ev.preventDefault();
  authClearError();authClearAllFieldErrors();
  var pw=(document.getElementById('auPw')||{}).value||'',pw2=(document.getElementById('auPw2')||{}).value||'';
  if(!pw)return authStopAt('auPw','Password is required.');
  if(pw.length<8)return authStopAt('auPw','Password needs at least 8 characters.');
  if(!pw2)return authStopAt('auPw2','Password confirmation is required.');
  if(pw!==pw2)return authStopAt('auPw2','The two passwords don’t match.');
  authBusy(true);
  try{
    var res=await sbClient.auth.updateUser({password:pw});
    authBusy(false);
    if(res.error)return authErr(/session|logged/i.test(res.error.message)?'Open the reset link from your email first, then set the new password here.':res.error.message);
    track('password_reset_done',{});
    closeAuth();toast('Password updated — you’re logged in');nav('/me');
  }catch(e){authBusy(false);authErr('Could not reach the account service — try again.');}
}
async function doResend(email){
  if(!email)return;
  authBusy(true);
  try{
    var res=await sbClient.auth.resend({type:'signup',email:email});
    authBusy(false);
    if(res.error)return authErr(res.error.message);
    toast('Verification email sent to '+email);
  }catch(e){authBusy(false);authErr('Could not resend — try again in a minute.');}
}
async function doLogout(){
  try{await sbClient.auth.signOut();}catch(e){}
  /* local ps_* keys are account data now — clear so the next user on this device starts clean */
  try{['ps_plan_v1','ps_checks_v1','ps_saved_v1','ps_progress_v1'].forEach(function(k){localStorage.removeItem(k);});}catch(e){}
  plan={cur:null,tgt:null,wk:null,focus:null};showIntakeForm=true;
  track('logout',{});
  toast('Signed out');
  if(currentView==='me'||currentView==='admin'||currentView==='account')nav('/me');else refreshAuthUI();
}
async function doDeleteAccount(){
  if(!sbClient||!authUser)return;
  var sure=window.confirm('Delete your PrepSignals account?\n\nThis permanently removes your profile, saved debriefs, checklist and progress log from our database. This cannot be undone.');
  if(!sure)return;
  try{
    var res=await sbClient.rpc('delete_user');
    if(res.error){toast('Could not delete the account — email prepsignals@gmail.com and we’ll do it for you');return;}
    track('account_deleted',{});
    try{await sbClient.auth.signOut();}catch(e){}
    try{['ps_plan_v1','ps_checks_v1','ps_saved_v1','ps_progress_v1'].forEach(function(k){localStorage.removeItem(k);});}catch(e){}
    plan={cur:null,tgt:null,wk:null,focus:null};showIntakeForm=true;authUser=null;authProfile=null;
    toast('Account deleted — thanks for trying PrepSignals');
    nav('/path');
  }catch(e){toast('Could not delete the account — email prepsignals@gmail.com');}
}

/* ---------- auth-aware fragments used by app.js renders ---------- */
function planSyncCardHTML(){
  var CHECK='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';
  if(!accountsOn())
    return '<div class="synccard rise"><span class="sico">'+CHECK+'</span><span class="grow"><b>Saved on this device</b> — this path has a shareable link.</span><a href="/me" data-nav>Open planner</a></div>';
  if(isLoggedIn()&&emailVerified())
    return '<div class="synccard rise"><span class="sico">'+CHECK+'</span><span class="grow"><b>Saved to your account</b> — this path syncs across devices.</span><a href="/me" data-nav>Open planner</a></div>';
  if(isLoggedIn())
    return '<div class="synccard rise warn"><span class="sico">!</span><span class="grow"><b>Verify your email to save this path.</b> The link is in your inbox.</span><button type="button" class="alink" onclick="openAuth(\'verify\',\'plan\')">Resend</button></div>';
  return '<div class="synccard rise cta"><span class="sico">'+CHECK+'</span><span class="grow"><b>Keep this path.</b> Sync your plan, checklist, and progress when you come back.</span><button type="button" class="syncbtn" onclick="openAuth(\'signup\',\'plan\')">Sync my planner</button></div>';
}
function checkNoteHTML(){
  if(!accountsOn())return 'Checklist progress saves in this browser · <a href="/me" data-nav>open planner</a>';
  if(isLoggedIn()&&emailVerified())return 'Checklist progress syncs to your account · <a href="/me" data-nav>open planner</a>';
  return 'Keep checklist progress for next time · <button type="button" class="alink" onclick="openAuth(\'signup\',\'checklist\')">sync planner</button>';
}
/* /me gate: returns HTML when the workspace is locked, null when app.js should render normally */
function meAuthGateHTML(sub){
  if(!accountsOn())return null;                 /* offline fallback: old local workspace */
  if(isLoggedIn()&&emailVerified())return null;
  if(isLoggedIn())return meVerifyHTML();
  return meLockedHTML();
}
function meLockedHTML(){
  var hasLegacy=false;
  try{hasLegacy=!!(localStorage.getItem('ps_saved_v1')||localStorage.getItem('ps_progress_v1')||localStorage.getItem('ps_plan_v1'));}catch(e){}
  return '<section class="mehead"><h1>Study Planner</h1><p>Your plan, checklist, saved debriefs and progress in one place.</p></section>'+
    '<div class="lockcard rise">'+
    '<div class="lockbadge">Free account</div>'+
    '<h3>Sync your study planner</h3>'+
    '<p>Create a free account when you want your study data to follow you across devices.</p>'+
    '<div class="lockpreview" aria-label="Study planner preview">'+
    '<div><span>Saved</span><b>Debriefs to revisit</b></div>'+
    '<div><span>Checklist</span><b>Next task ready</b></div>'+
    '<div><span>Review log</span><b>Mocks on one trend</b></div>'+
    '</div>'+
    '<ul class="locklist">'+
    '<li><b>Score path</b> — keep your plan and reopen it anywhere</li>'+
    '<li><b>Week-one checklist</b> — checklist progress that stays synced</li>'+
    '<li><b>Saved debriefs</b> — a reading list of stories worth revisiting</li>'+
    '<li><b>Review log</b> — every mock and note on one trend line</li>'+
    '<li><b>Planner assistant</b> — next steps from your path, saves, and progress</li>'+
    '</ul>'+
    (hasLegacy?'<p class="locknote">You already have data saved on this device from before — it moves into your account automatically when you sign up.</p>':'')+
    '<div class="lockbtns"><button type="button" class="abtn" onclick="openAuth(\'signup\',\'me\')">Create free account</button>'+
    '<button type="button" class="alink" onclick="openAuth(\'login\',\'me\')">I already have one — log in</button></div>'+
    '</div>'+
    '<div style="height:46px"></div>';
}
function meVerifyHTML(){
  var em=(authUser&&authUser.email)||'';
  return '<section class="mehead"><h1>Study Planner</h1><p>One step left before your planner unlocks.</p></section>'+
    '<div class="lockcard rise">'+
    '<div class="lockbadge amber">Verify email</div>'+
    '<h3>Confirm '+esc(em)+' to sync your planner</h3>'+
    '<p>Check your email, click the verification link, then return to PrepSignals. You can keep this tab open; your saves start syncing after verification.</p>'+
    '<div class="lockbtns"><button type="button" class="abtn" onclick="doResend(\''+esc(em)+'\')">Resend verification email</button>'+
    '<button type="button" class="alink" onclick="doLogout()">Sign out</button></div>'+
    '</div>'+
    '<div style="height:46px"></div>';
}
/* recommendations for verified users with a plan — the "personalized recommendations" perk */
function meRecsHTML(){
  if(!cloudOK()||!planComplete())return '';
  var peers=peersFor(plan.tgt,plan.cur).peers,saved=loadSaved();
  var picks=bestExamples(peers.filter(function(d){return saved.indexOf(d.id)<0;}),3);
  if(!picks.length)return '';
  return '<section class="block" style="padding-bottom:0"><div class="shead"><div>'+
    '<h2 style="font-size:20px">Recommended for you</h2>'+
    '<p class="sub">Debriefs matched to your path'+(authProfile&&authProfile.weak_area?' and your '+esc(authProfile.weak_area)+' focus':'')+' that aren’t in your saved list yet.</p>'+
    '</div></div><div class="cards">'+picks.map(debCardHTML).join('')+'</div></section>';
}
var PREP_STAGES=[['researching','Researching'],['studying','Actively studying'],['retaking','Retaking soon']];
function mePrepStageHTML(){
  if(!cloudOK())return '';
  var cur=authProfile&&authProfile.prep_stage;
  if(cur)return '';
  return '<div class="stagecard rise"><span class="grow"><b>Where are you in your prep?</b> Helps us tune what you see.</span>'+
    '<span class="stagechips">'+PREP_STAGES.map(function(s){
      return '<button type="button" class="stagechip" onclick="setPrepStage(\''+s[0]+'\')">'+s[1]+'</button>';}).join('')+'</span></div>';
}
function accountLockedHTML(){
  return '<section class="mehead"><h1>Account</h1><p>Log in to manage your profile and password.</p></section>'+
    '<div class="lockcard rise"><div class="lockbadge">Account</div><h3>Your planner stays private</h3>'+
    '<p>Profile and password controls are available after you log in.</p>'+
    '<div class="lockbtns"><button type="button" class="abtn" onclick="openAuth(\'login\',\'account\')">Log in</button>'+
    '<button type="button" class="alink" onclick="openAuth(\'signup\',\'account\')">Create a free account</button></div></div><div style="height:46px"></div>';
}
function renderAccount(sub){
  var el=document.getElementById('accountBody');if(!el)return;
  sub=sub==='security'?'security':'profile';
  if(!accountsOn()){
    el.innerHTML='<section class="mehead"><h1>Account</h1><p>Accounts need a network connection.</p></section>'+
      '<div class="acctcard rise"><h3>Account controls unavailable</h3><p>You can still use the local planner in this browser.</p></div><div style="height:46px"></div>';
    return;
  }
  if(!isLoggedIn()){el.innerHTML=accountLockedHTML();return;}
  el.innerHTML=sub==='security'?accountSecurityHTML():accountProfileHTML();
  observeGrow(el);
}
function meAccountHTML(){
  return '';
}
function accountTabsHTML(active){
  return '<div class="accounttabs">'+
    '<a href="/account/profile" data-nav class="'+(active==='profile'?'on':'')+'">Profile</a>'+
    '<a href="/account/security" data-nav class="'+(active==='security'?'on':'')+'">Password &amp; security</a>'+
    '</div>';
}
function accountProfileHTML(){
  var p=authProfile||{};
  var bandOpts=['<option value="">—</option>'].concat(BANDS.map(function(b){
    return '<option'+(p.target_score===b.label?' selected':'')+'>'+esc(b.label)+'</option>';})).join('');
  var weakOpts=['<option value="">—</option>'].concat(['Quant','Verbal','Data Insights','Timing / test day'].map(function(w){
    return '<option'+(p.weak_area===w?' selected':'')+'>'+esc(w)+'</option>';})).join('');
  var stageOpts=['<option value="">—</option>'].concat(PREP_STAGES.map(function(s){
    return '<option value="'+s[0]+'"'+(p.prep_stage===s[0]?' selected':'')+'>'+s[1]+'</option>';})).join('');
  return '<section class="mehead"><h1>Profile</h1><p>Keep your planner inputs current so recommendations stay useful.</p></section>'+
    accountTabsHTML('profile')+
    '<div class="panel acctpanel rise" id="acctPanel" style="margin-top:16px">'+
    '<div class="accthead"><h3>Profile details</h3>'+
    '<span class="verifybadge'+(emailVerified()?'':' off')+'">'+(emailVerified()?'verified':'not verified')+'</span></div>'+
    '<p class="psub">Signed in as <b>'+esc(authUser.email)+'</b>'+(isAdmin()?' · <a href="/admin" data-nav>Admin dashboard</a>':'')+'</p>'+
    '<div class="pform acctform">'+
    '<label class="pfield">Name<input type="text" id="acName" maxlength="80" value="'+esc(p.name||(authUser.user_metadata||{}).name||'')+'"></label>'+
    '<label class="pfield">Target score<select id="acTarget">'+bandOpts+'</select></label>'+
    '<label class="pfield">Test month<input type="month" id="acMonth" value="'+esc(p.test_month||'')+'"></label>'+
    '<label class="pfield">Main weak area<select id="acWeak">'+weakOpts+'</select></label>'+
    '<label class="pfield">Prep stage<select id="acStage">'+stageOpts+'</select></label>'+
    '</div>'+
    '<label class="acheck" style="margin-top:12px"><input type="checkbox" id="acMkt"'+(p.marketing_opt_in?' checked':'')+'><span>Send me prep offers, product updates, and study tips</span></label>'+
    '<p class="atrust">Optional. No prep offers unless you check this.</p>'+
    '<div class="acctbtns">'+
    '<button type="button" class="paddbtn" onclick="saveAccountForm()">Save profile</button>'+
    '<a class="ghostbtn linkbtn" href="/me" data-nav>Back to planner</a>'+
    '<button type="button" class="dangerlink" onclick="doDeleteAccount()">Delete my account</button>'+
    '</div></div><div style="height:46px"></div>';
}
function accountSecurityHTML(){
  return '<section class="mehead"><h1>Password &amp; security</h1><p>Manage login details for <b>'+esc(authUser.email||'')+'</b>.</p></section>'+
    accountTabsHTML('security')+
    '<div class="panel acctpanel rise" style="margin-top:16px">'+
    '<div class="accthead"><h3>Change password</h3><span class="verifybadge'+(emailVerified()?'':' off')+'">'+(emailVerified()?'verified':'not verified')+'</span></div>'+
    '<p class="psub">Use at least 8 characters. If you forgot the current password, sign out and use the reset link from the login modal.</p>'+
    '<div class="pform acctform securityform">'+
    '<label class="pfield">New password<input type="password" id="secPw" autocomplete="new-password" minlength="8" placeholder="8+ characters"></label>'+
    '<label class="pfield">Repeat password<input type="password" id="secPw2" autocomplete="new-password" minlength="8" placeholder="Same password again"></label>'+
    '</div><div class="aerr hidden" id="secErr" style="margin-top:12px"></div>'+
    '<div class="acctbtns"><button type="button" class="paddbtn" id="secSave" onclick="saveSecurityForm()">Update password</button>'+
    '<button type="button" class="ghostbtn" onclick="doLogout()">Sign out</button></div>'+
    '</div><div style="height:46px"></div>';
}
function securityErr(msg){
  var e=document.getElementById('secErr');if(e){e.textContent=msg;e.classList.remove('hidden');}
}
async function saveSecurityForm(){
  if(!sbClient||!authUser)return;
  var pw=(document.getElementById('secPw')||{}).value||'',pw2=(document.getElementById('secPw2')||{}).value||'';
  var err=document.getElementById('secErr');if(err){err.textContent='';err.classList.add('hidden');}
  if(!pw)return securityErr('Password is required.');
  if(pw.length<8)return securityErr('Password needs at least 8 characters.');
  if(pw!==pw2)return securityErr('The two passwords do not match.');
  var b=document.getElementById('secSave');if(b){b.disabled=true;b.classList.add('busy');}
  try{
    var res=await sbClient.auth.updateUser({password:pw});
    if(b){b.disabled=false;b.classList.remove('busy');}
    if(res.error)return securityErr(/session|logged/i.test(res.error.message)?'Log in again, then change your password.':res.error.message);
    track('password_change_done',{});
    toast('Password updated');
    var p1=document.getElementById('secPw'),p2=document.getElementById('secPw2');if(p1)p1.value='';if(p2)p2.value='';
  }catch(e){
    if(b){b.disabled=false;b.classList.remove('busy');}
    securityErr('Could not update password — try again.');
  }
}
function refreshAboutFeedback(){
  var email=document.getElementById('fbEmail');
  if(email&&isLoggedIn()&&!email.value)email.value=authUser.email||'';
}
function feedbackMailto(email,title,body){
  var subject=title||'PrepSignals feedback';
  var mail='mailto:prepsignals@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent((body||'')+'\n\nFrom: '+(email||''));
  window.location.href=mail;
}
async function submitFeedback(ev){
  if(ev)ev.preventDefault();
  var email=((document.getElementById('fbEmail')||{}).value||'').trim();
  var title=((document.getElementById('fbTitle')||{}).value||'').trim();
  var body=((document.getElementById('fbBody')||{}).value||'').trim();
  if(!email||!title||!body){toast('Please fill in email, title, and message');return;}
  var btn=document.getElementById('fbGo');if(btn){btn.disabled=true;btn.classList.add('busy');}
  if(!accountsOn()){
    if(btn){btn.disabled=false;btn.classList.remove('busy');}
    track('feedback_submit',{logged_in:!!authUser,mode:'mailto'});
    feedbackMailto(email,title,body);return;
  }
  try{
    var row={user_id:(authUser&&authUser.id)||null,email:email,title:title,body:body};
    var res=await sbClient.from('feedback_messages').insert(row);
    if(btn){btn.disabled=false;btn.classList.remove('busy');}
    if(res.error){track('feedback_submit',{logged_in:!!authUser,mode:'mailto'});feedbackMailto(email,title,body);return;}
    track('feedback_submit',{logged_in:!!authUser,mode:'supabase'});
    toast('Feedback sent — thank you');
    var t=document.getElementById('fbTitle'),b=document.getElementById('fbBody');if(t)t.value='';if(b)b.value='';
  }catch(e){
    if(btn){btn.disabled=false;btn.classList.remove('busy');}
    track('feedback_submit',{logged_in:!!authUser,mode:'mailto'});
    feedbackMailto(email,title,body);
  }
}
async function saveAccountForm(){
  var g=function(id){var el=document.getElementById(id);return el?el.value:'';};
  var mkt=(document.getElementById('acMkt')||{}).checked;
  var patch={name:g('acName').trim(),target_score:g('acTarget')||null,test_month:g('acMonth')||null,
    weak_area:g('acWeak')||null,prep_stage:g('acStage')||null,marketing_opt_in:!!mkt};
  var ok=await saveProfilePatch(patch);
  track('profile_updated',{marketing_opt_in:!!mkt,has_target:!!patch.target_score,stage:patch.prep_stage||''});
  toast(ok?'Account settings saved':'Could not save — try again');
  if(ok){renderNavAuth();refreshAuthUI();}
}
function meHeadSub(){
  if(cloudOK())return 'Signed in as '+esc(authUser.email)+'. Your planner syncs across devices.';
  return 'Your plan, checklist, saved debriefs and progress — saved in this browser.';
}

/* Escape closes the auth modal first */
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  closeAccountMenu();
  var m=document.getElementById('authModal');
  if(m&&m.classList.contains('on')){e.stopImmediatePropagation();closeAuth();}
},true);
document.addEventListener('click',function(e){
  var wrap=e.target&&e.target.closest&&e.target.closest('.acctmenuwrap');
  if(!wrap)closeAccountMenu();
},true);

initAuthClient();
