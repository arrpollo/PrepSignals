'use strict';
/* data is loaded by data.js (deferred before this file) as window.__PS_DATA__ */
const PSD=window.__PS_DATA__;
const DEB=PSD.DEB, DETAILS=PSD.DETAILS, BANDS=PSD.BANDS, CURB=PSD.CURB, WEEKB=PSD.WEEKB, GAINB=PSD.GAINB, PREPB=PSD.PREPB, TT=PSD.TT;
const RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const BANDC={b1:{c:'var(--blue)',d:'var(--blue)',l:'var(--blue-l)'},
            b2:{c:'var(--primary)',d:'var(--primary-d)',l:'var(--primary-l)'},
            b3:{c:'var(--violet)',d:'var(--violet)',l:'var(--violet-l)'}};
const FOCUS=[
  {key:'q',label:'Quant',sub:'Math accuracy, speed, or concepts',sec:'q'},
  {key:'v',label:'Verbal',sub:'CR, RC, or answer-choice traps',sec:'v'},
  {key:'di',label:'Data Insights',sub:'DS, tables, graphs, or MSR',sec:'di'},
  {key:'timing',label:'Timing / test day',sub:'Pacing, stamina, or execution',sec:null},
  {key:'unsure',label:'Not sure',sub:'Use the cohort signal',sec:null},
];
const MIN_PEERS=6;
const LS_KEY='ps_plan_v1';
let state={band:'b2',focus:'auto'};
let plan={cur:null,tgt:null,wk:null,focus:null};
let showIntakeForm=true;
let exploreInit=false;
let _justBuilt=false;

function track(name,props){
  try{if(typeof window.va==='function')window.va('event',{name,data:props||{}});}catch(e){}
  try{if(window.posthog&&typeof posthog.capture==='function')posthog.capture(name,props||{});}catch(e){}
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function inBand(d,b){return d.total!=null&&d.total>=b.lo&&d.total<=b.hi;}
function bandOf(key){return BANDS.find(b=>b.key===key);}
function curBucketOf(key){return CURB.find(c=>c.key===key);}
function wkBucketOf(key){return WEEKB.find(w=>w.key===key);}
function focusOf(key){return FOCUS.find(f=>f.key===key)||FOCUS.find(f=>f.key==='unsure');}
function debsIn(b){return DEB.filter(d=>inBand(d,b));}
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function pct(n,d){return d?Math.round(100*n/d):0;}
function fmt(v){return v==null?'—':(Number.isInteger(v)?String(v):String(Math.round(v*10)/10));}
function sampleText(n,label){return `<span><b>${n}</b> ${label||'debriefs'}</span>`;}
function richScore(d){
  const det=DETAILS[d.id]||{};
  const notes=(det.overall||[]).length+Object.values(det.sections||{}).reduce((a,x)=>a+x.length,0);
  return (d.strat||[]).length*1.5+notes+Math.min(d.nreplies||0,20)*0.3+(d.gain?2:0)+(d.prep_weeks?1:0);
}
function countBy(rows,fn){
  const out={};rows.forEach(d=>(fn(d)||[]).forEach(k=>{if(k)out[k]=(out[k]||0)+1;}));
  return Object.entries(out).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function topStrats(rows,sec,limit){
  return countBy(rows,d=>(d.strat||[]).map(parseStrat).filter(p=>p.sec===sec).map(p=>p.label)).slice(0,limit||5);
}
function topResources(rows,limit){return countBy(rows,d=>d.resources||[]).slice(0,limit||6);}
function sectionMedians(rows){
  return {q:median(rows.map(d=>d.q).filter(x=>x!=null)),
    v:median(rows.map(d=>d.v).filter(x=>x!=null)),
    di:median(rows.map(d=>d.di).filter(x=>x!=null))};
}
function sectionLabel(k){return k==='q'?'Quant':k==='v'?'Verbal':'Data Insights';}
function sectionShort(k){return k==='q'?'Q':k==='v'?'V':'DI';}
function sectionCode(k){return k==='q'?'Q':k==='v'?'V':'DI';}
function weakestSection(rows){
  const m=sectionMedians(rows),pairs=Object.entries(m).filter(([,v])=>v!=null);
  if(!pairs.length)return null;
  pairs.sort((a,b)=>a[1]-b[1]);
  return {key:pairs[0][0],name:sectionLabel(pairs[0][0]),score:Math.round(pairs[0][1])};
}
function rowsForSection(rows,key){
  const prefix=key==='q'?'Q':key==='v'?'V':'DI';
  return rows.filter(d=>d[key]!=null||((d.strat||[]).some(s=>s.startsWith(prefix+':'))));
}
function rowsForStrat(rows,sec,label){
  const prefix=sec==='G'?'General':sec;
  return rows.filter(d=>(d.strat||[]).includes(prefix+': '+label));
}
function bestExamples(rows,n){return rows.slice().sort((a,b)=>richScore(b)-richScore(a)||(b.total||0)-(a.total||0)).slice(0,n||6);}

/* ---- deterministic per-section insights: top tactics + representative verbatim notes ----
   `exclude` is shared across Q/V/DI within one render pass: some source posts repeat the same
   sentence across multiple section-note arrays, so without this a single duplicated line could
   surface as the "representative quote" for two different sections. */
function sectionQuotes(rows,secCode,limit,exclude){
  const seen=new Set(),out=[];
  rows.slice().sort((a,b)=>richScore(b)-richScore(a)).forEach(d=>{
    if(out.length>=(limit||3)||seen.has(d.id))return;
    const notes=(DETAILS[d.id]&&DETAILS[d.id].sections&&DETAILS[d.id].sections[secCode])||[];
    const pick=notes.find(n=>!exclude.has(n));
    if(!pick)return;
    seen.add(d.id);exclude.add(pick);out.push({id:d.id,text:pick});
  });
  return out;
}
function sectionInsight(rows,key,exclude){
  const secCode=sectionCode(key),med=sectionMedians(rows)[key];
  const withNotes=rows.filter(d=>((DETAILS[d.id]&&DETAILS[d.id].sections&&DETAILS[d.id].sections[secCode])||[]).length).length;
  return{key,name:sectionLabel(key),med,top:topStrats(rows,secCode,3),quotes:sectionQuotes(rows,secCode,3,exclude),withNotes};
}
function overallQuotes(rows,limit){
  const seen=new Set(),out=[];
  rows.slice().sort((a,b)=>richScore(b)-richScore(a)).forEach(d=>{
    if(out.length>=(limit||3)||seen.has(d.id))return;
    const notes=(DETAILS[d.id]&&DETAILS[d.id].overall)||[];
    const pick=notes.find(n=>n&&!out.some(q=>q.text===n));
    if(!pick)return;
    seen.add(d.id);out.push({id:d.id,text:pick});
  });
  return out;
}
function topParsedStrats(rows,predicate,limit){
  return countBy(rows,d=>(d.strat||[]).map(parseStrat).filter(predicate).map(p=>p.sec+'|'+p.label))
    .slice(0,limit||5).map(([k,n])=>{const i=k.indexOf('|');return {sec:k.slice(0,i),label:k.slice(i+1),n};});
}
function rowsForParsed(rows,item){return item?rowsForStrat(rows,item.sec,item.label):rows;}
const SECCOL={q:['--blue','--blue-l'],v:['--violet','--violet-l'],di:['--teal','--teal-l']};
function renderSectionInsights(containerId,rows){
  const el=document.getElementById(containerId);if(!el)return;
  const exclude=new Set();
  el.innerHTML=['q','v','di'].map(key=>{
    const ins=sectionInsight(rows,key,exclude),[c,cl]=SECCOL[key];
    const tacHTML=ins.top.length?`<div class="tacwrap">${ins.top.map(([t,n])=>
      `<span class="tacchip" style="background:var(${cl});color:var(${c})">${esc(t)} <b>${pct(n,rows.length)}%</b></span>`).join('')}</div>`:'';
    const quoteHTML=ins.quotes.length?`<ul class="notelist" style="--bullet:var(${c})">${ins.quotes.map(q=>`<li>${esc(q.text)}</li>`).join('')}</ul>`
      :`<div class="empty2">Not enough detailed notes for ${esc(ins.name)} in this range yet.</div>`;
    return `<div class="seccard">
      <h4 style="color:var(${c})">${esc(ins.name)}${ins.med!=null?`<span class="n">typical ${Math.round(ins.med)}</span>`:''}</h4>
      <div class="secn">${ins.withNotes} of ${rows.length} debriefs have detailed ${esc(ins.name)} notes</div>
      ${tacHTML}${quoteHTML}
    </div>`;
  }).join('');
}
function activeFocusKey(rows){
  if(['q','v','di'].includes(state.focus))return state.focus;
  const weak=weakestSection(rows);
  return weak&&weak.key?weak.key:'di';
}

/* strategy item "DI: DI targeted practice" -> {sec:'DI', label:'DI targeted practice'} */
function parseStrat(s){const i=s.indexOf(':');if(i<0)return{sec:'G',label:s};
  let sec=s.slice(0,i).trim(),label=s.slice(i+1).trim();
  if(sec==='General')sec='G'; if(!['Q','V','DI','G'].includes(sec))sec='G';
  return{sec,label};}
const SECNAME={Q:'Quant',V:'Verbal',DI:'Data',G:'General'};

/* ================= YOUR PLAN (personalized) ================= */
function loadPlanLS(){
  try{const raw=localStorage.getItem(LS_KEY);if(!raw)return null;
    const o=JSON.parse(raw);
    if(o&&CURB.find(c=>c.key===o.cur)&&BANDS.find(b=>b.key===o.tgt)&&WEEKB.find(w=>w.key===o.wk)){
      return {cur:o.cur,tgt:o.tgt,wk:o.wk,focus:FOCUS.find(f=>f.key===o.focus)?o.focus:'unsure'};
    }
  }catch(e){}
  return null;
}
function savePlanLS(){
  try{localStorage.setItem(LS_KEY,JSON.stringify({cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus||'unsure'}));}catch(e){}
  try{if(typeof cloudSavePlan==='function')cloudSavePlan();}catch(e){}
}

function peersFor(tgtKey,curKey){
  const b=bandOf(tgtKey),rows=debsIn(b),cur=curBucketOf(curKey);
  let peers=cur?rows.filter(d=>d.start!=null&&d.start>=cur.lo&&d.start<=cur.hi):[];
  const matched=peers.length>=MIN_PEERS;
  if(!matched)peers=rows;
  return{rows,peers,matched};
}
function paceNote(peers,wk){
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null);
  if(!prep.length)return null;
  const med=median(prep);
  if(wk.hi<med*0.7)return `Your timeline (<b>${esc(wk.label)}</b>) is tighter than the median <b>${fmt(med)}w</b> prep in this cohort — lean on official mocks and the resource stack below rather than broad review.`;
  if(wk.lo>med*1.5)return `You have more runway than the median <b>${fmt(med)}w</b> prep in this cohort — a good case for deeper section-by-section work instead of a sprint.`;
  return `Your timeline lines up with the median <b>${fmt(med)}w</b> prep reported in this cohort.`;
}
function selectedSectionKey(peers){
  const f=focusOf(plan.focus);
  if(f&&f.sec)return f.sec;
  const weak=weakestSection(peers);
  return weak?weak.key:'di';
}
function primaryRecommendation(peers,wk){
  const f=focusOf(plan.focus),weak=weakestSection(peers),genTop=topStrats(peers,'G',1)[0];
  if(f.key==='timing'){
    const label=genTop?genTop[0]:'timed review loop';
    return {
      h:'Tighten your timed review loop',
      p:`You said timing or test day feels hardest. Make the next block about timed sets, official-mock review, and move-on rules before adding broad content review.${weak?` Keep ${weak.name} as your checkpoint because it is the lowest median split in this cohort.`:''}`,
      m:genTop?`<b>${pct(genTop[1],peers.length)}%</b> of matching debriefs mention ${esc(label)}.`:`Use the insight drawer examples to copy concrete pacing rules.`,
      a:'See the evidence',
      kind:'timing'
    };
  }
  const secKey=selectedSectionKey(peers),secName=sectionLabel(secKey),top=topStrats(peers,sectionCode(secKey),1)[0];
  const because=f.sec
    ?`You said ${secName} feels hardest, so start there even if another section also looks noisy.`
    :weak?`${weak.name} is the lowest median split among debriefs like yours.`
      :'The cohort does not have enough complete section splits, so start with one section at a time.';
  return {
    h:`Start with ${secName}`,
    p:`${because} Use your next study block to sort misses by concept, timing, and careless errors, then drill the pattern that repeats.`,
    m:top?`<b>${pct(top[1],peers.length)}%</b> of matching debriefs mention ${esc(top[0])}.`:`<b>${rowsForSection(peers,secKey).length}</b> matching examples include ${esc(secName)} details.`,
    a:'See the evidence',
    kind:'section'
  };
}

let quizStep=0;
const STEPQ=[
  {f:'cur',ico:'📍',t:'Where are you scoring now?',s:'Your latest practice test or diagnostic total — a guess is fine.',wide:true,
    opts:()=>CURB.map(c=>({k:c.key,l:c.label,s:c.name||''}))},
  {f:'tgt',ico:'🎯',t:'What score are you aiming for?',s:'Pick your target band.',wide:true,
    opts:()=>BANDS.map(b=>({k:b.key,l:b.label,s:b.name+' · '+b.count+' stories'}))},
  {f:'wk',ico:'🗓️',t:'How long until test day?',s:'Roughly — this only shapes pacing advice, not the target.',wide:false,
    opts:()=>WEEKB.map(w=>({k:w.key,l:w.label,s:''}))},
  {f:'focus',ico:'🧩',t:'What feels hardest right now?',s:'Your plan starts there. Pick “Not sure” and the data will choose.',wide:true,
    opts:()=>FOCUS.map(f=>({k:f.key,l:f.label,s:f.sub}))},
];
function pickPlan(field,key){
  plan[field]=key;
  const last=quizStep>=STEPQ.length-1;
  renderQuiz(false);
  if(!last)setTimeout(()=>{quizStep=Math.min(quizStep+1,STEPQ.length-1);renderQuiz(true);},RM?0:230);
}
function stepBack(){if(quizStep>0){quizStep--;renderQuiz(true);}}
function renderQuiz(animate){
  const el=document.getElementById('quiz');if(!el)return;
  const q=STEPQ[quizStep],answered=STEPQ.filter(st=>plan[st.f]).length;
  const match=(plan.tgt&&plan.cur)?peersFor(plan.tgt,plan.cur):null;
  const ready=plan.cur&&plan.tgt&&plan.wk&&plan.focus;
  el.innerHTML=`
    <div class="stepcard">
      <div class="stepbar">
        <div class="track"><div class="fill" style="width:${Math.round(100*answered/STEPQ.length)}%"></div></div>
        <span class="stepct">${quizStep+1} of ${STEPQ.length}</span>
      </div>
      <div class="${animate&&!RM?'stepin':''}">
        <div class="qtitle"><span class="qico">${q.ico}</span> ${q.t}</div>
        <div class="qsub">${q.s}</div>
        <div class="qopts${q.wide?' wide':''}">${q.opts().map(o=>`<button type="button" class="qopt ${plan[q.f]===o.k?'on':''}" onclick="pickPlan('${q.f}','${o.k}')"><div class="ol">${esc(o.l)}</div>${o.s?`<div class="os">${esc(o.s)}</div>`:''}</button>`).join('')}</div>
      </div>
      <div class="stepnav">
        ${quizStep>0?`<button type="button" class="stepback" onclick="stepBack()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M11 18l-6-6 6-6"/></svg> Back</button>`:'<span></span>'}
        ${quizStep===STEPQ.length-1?`<button type="button" class="quizsubmit" id="quizSubmit" ${ready?'':'disabled'} onclick="submitPlan()">Build my plan
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`:''}
      </div>
      ${match?`<div class="quizmatch"><span class="pulse"></span>${match.matched?`<b>${match.peers.length}</b> stories closely match your path so far.`:`Not many exact matches yet — we'll use all <b>${match.rows.length}</b> stories at your target instead.`}</div>`:''}
    </div>`;
}
function submitPlan(){
  if(!(plan.cur&&plan.tgt&&plan.wk&&plan.focus))return;
  savePlanLS();showIntakeForm=false;_justBuilt=true;
  try{if(typeof updateProfileFromPlan==='function')updateProfileFromPlan();}catch(e){}
  track('intake_submit',{cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus});
  nav(planPath());
}
function editPlan(){showIntakeForm=true;quizStep=0;track('intake_edit',{});nav('/path');}

function renderPlanView(){
  const q=document.getElementById('quiz'),r=document.getElementById('planResult');
  if(!plan.cur||!plan.tgt||!plan.wk||!plan.focus||showIntakeForm){
    q.classList.remove('hidden');renderQuiz();r.innerHTML='';
  }else{
    q.classList.add('hidden');renderPlanResult();
  }
}
function renderPlanResult(){
  const{rows,peers,matched}=peersFor(plan.tgt,plan.cur);
  const b=bandOf(plan.tgt),cur=curBucketOf(plan.cur),wk=wkBucketOf(plan.wk);
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null),gains=peers.map(d=>d.gain).filter(x=>x!=null);
  const pace=paceNote(peers,wk),rec=primaryRecommendation(peers,wk);
  // score-band jump framing: how the current bucket reaches the target band
  const startersCur=DEB.filter(d=>d.start!=null&&cur&&d.start>=cur.lo&&d.start<=cur.hi);
  const reachedTgt=startersCur.filter(d=>inBand(d,b));
  const reachPct=startersCur.length>=5?pct(reachedTgt.length,startersCur.length):null;
  const pStart=peers.map(d=>d.start).filter(x=>x!=null),pTot=peers.map(d=>d.total).filter(x=>x!=null);
  const medStart=pStart.length?Math.round(median(pStart)):null,medTot=pTot.length?Math.round(median(pTot)):null;
  const medGain=gains.length?Math.round(median(gains)):null,medPrep=prep.length?fmt(median(prep)):null;
  let jnote='';
  if(reachPct!=null)jnote+=`Of <b>${startersCur.length}</b> people who started in ${esc(cur.label)}, <b>${reachPct}%</b> reached ${esc(b.label)}. `;
  if(medStart&&medTot)jnote+=`The typical path for people like you was <b>${medStart} → ${medTot}</b>${medGain?` (+${medGain})`:''}${medPrep?` over <b>${medPrep} weeks</b>`:''}.`;
  if(!jnote)jnote=`Few stories report a start score in ${esc(cur.label)} yet — lean on the ${esc(b.label)} insights below.`;
  const tkstats=[
    reachPct!=null?{v:reachPct,suf:'%',l:'made this exact jump'}:null,
    medGain!=null?{v:medGain,pre:'+',l:'typical score gain'}:null,
    medPrep!=null?{v:medPrep,suf:'w',l:'typical prep time'}:null,
    {v:peers.length,l:matched?'stories match your path':'stories at your target'},
  ].filter(Boolean).slice(0,3);
  // "do this first" card is colored by what it recommends (see color system)
  const secKey=selectedSectionKey(peers);
  const prPair=rec.kind==='timing'?['--green','--green-l']:SECCOL[secKey];

  document.getElementById('planResult').innerHTML=`
    <section class="ticket rise" id="ticket">
      <div class="tktop">
        <span class="ey">✦ Your score path</span>
        <button class="tkedit" type="button" onclick="editPlan()">Change answers</button>
      </div>
      <div class="jumprow">
        <div class="jumpnode"><div class="jn">${esc(cur.label)}</div><div class="jl">You now</div></div>
        <div class="jumparrow"><div class="jtrack"></div><div class="jhead"></div>${medGain?`<div class="jgain">+${medGain} typical</div>`:''}</div>
        <div class="jumpnode target"><div class="jn">${esc(b.label)}</div><div class="jl">Target</div></div>
      </div>
      <div class="tkstats" style="grid-template-columns:repeat(${tkstats.length},1fr)">${tkstats.map(st=>`<div class="tkstat"><div class="n">${st.pre||''}<span data-cnt="${st.v}">${st.v}</span>${st.suf?`<small>${st.suf}</small>`:''}</div><div class="l">${st.l}</div></div>`).join('')}</div>
      <p class="tknote">${jnote}</p>
      ${pace?`<div class="tkpace">${pace}</div>`:''}
      ${!matched?`<span class="tkflag">Few exact starting-score matches — showing everyone at your target</span>`:''}
    </section>
    ${planSyncCardHTML()}
    <section class="primaryrec rise" id="doFirst" style="--pr:var(${prPair[0]});--pr-l:var(${prPair[1]})">
      <div>
        <span class="ey">Step 1 · Today</span>
        <h3>${esc(rec.h)}</h3>
        <p>${rec.p}</p>
        <div class="metric">${rec.m}</div>
      </div>
      <button class="actbtn" type="button" onclick="handlePlanAction('${rec.kind}')">${esc(rec.a)}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </section>
    <section class="block" id="planWeek" style="padding-bottom:0">
      <div class="checkwrap rise">
        <div class="checkhead">
          <div><h3 style="font-size:19px">Step 2 · Your first week</h3>
            <p style="font-size:13.5px;color:var(--ink-2);margin-top:3px">Four tasks pulled from what worked for people on your path.</p></div>
          <span class="chkcount" id="chkCount"></span>
        </div>
        <div class="checklist" id="planChecklist"></div>
        <div class="chknote">${checkNoteHTML()}</div>
      </div>
    </section>
    <section class="block" id="planLevers">
      <div class="shead"><div><h2>Step 3 · Where your points will come from</h2><p class="sub">Three focus areas, ranked by the data. Tap “See the evidence” for the charts, tactics, and quotes behind each one.</p></div></div>
      <div class="actiongrid" id="planActions"></div>
    </section>
    <details class="evidence" id="planEvidence">
      <summary>
        <div><h2>Stories like yours</h2>
          <p class="sumsub">Six debriefs from people closest to your start, target, and timeline — worth a skim tonight.</p></div>
        <span class="sumicon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <div class="evidencebody">
        <div class="cards" id="planCards"></div>
        <button class="morebtn" onclick="openTargetExplore()">Explore all ${esc(b.label)} data <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </div>
    </details>
    <details class="evidence" id="planAnalytics">
      <summary>
        <div><h2>Dig into the numbers</h2>
          <p class="sumsub">Charts built from all <b>${rows.length}</b> ${esc(b.label)} debriefs — open this when you want the data behind the plan.</p></div>
        <span class="sumicon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <div class="evidencebody">
        <section class="block" id="planInsights" style="padding-top:0">
          <div class="shead"><div><h2>Section evidence</h2><p class="sub" id="planInsSub"></p></div></div>
          <div class="secinsights" id="planSecInsights"></div>
        </section>
        <section class="block" style="padding-top:0">
          <div class="shead"><div><h2>Inside the ${esc(b.label)} range</h2>
            <p class="sub">Score-band insights from all <b>${rows.length}</b> debriefs at your target — where scores land, section balance, resources, and tactic adoption.</p></div></div>
          <div class="panel">
            <h3>Where scores land <span class="hint">your target band highlighted</span></h3>
            <div class="chartbox" id="planDist" style="margin-top:8px"></div>
          </div>
          <div class="grid2" style="margin-top:16px">
            <div class="panel insightcard">
              <h3>Typical section split</h3>
              <p class="psub">Median Q / V / DI among ${esc(b.label)} debriefs with complete splits.</p>
              <div class="seccompare growfill" id="planSplit" style="margin-top:4px"></div>
              <div class="callout" id="planSplitCall"></div>
            </div>
            <div class="panel insightcard">
              <h3>What they studied with</h3>
              <p class="psub">Most-named resources in this range — popularity, not proof.</p>
              <div class="growfill" id="planRes"></div>
            </div>
          </div>
          <div class="grid2" style="margin-top:16px">
            <div class="panel insightcard">
              <h3>Prep &amp; gain context</h3>
              <p class="psub">Only some debriefs report these, so treat them as planning bounds.</p>
              <div class="minirow" id="planPrep"></div>
            </div>
            <div class="panel insightcard">
              <h3>Tactic adoption by band <span class="hint">tap a cell for examples</span></h3>
              <p class="psub">How often each recurring tactic shows up across score bands.</p>
              <div class="heatmap growfill" id="planHeat"></div>
            </div>
          </div>
        </section>
      </div>
    </details>`;
  renderPlanActions(peers,b);
  renderChecklist(peers);
  document.getElementById('planInsSub').innerHTML=`Aggregated from the same <b>${peers.length}</b> stories behind your plan — no need to open each one.`;
  renderSectionInsights('planSecInsights',peers);
  renderPlanAnalytics();
  document.getElementById('planCards').innerHTML=bestExamples(peers,6).map(debCardHTML).join('');
  observeGrow(document.getElementById('planResult'));
  animateCounts(document.getElementById('ticket'));
  if(_justBuilt){_justBuilt=false;confettiBurst(document.getElementById('ticket'));}
  track('plan_view',{cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus,matched,sample:peers.length});
}
function planAnalyticsShown(){
  return !!(plan.cur&&plan.tgt&&plan.wk&&plan.focus&&!showIntakeForm&&document.getElementById('planDist')
    &&!document.getElementById('view-path').classList.contains('hidden'));
}
function renderPlanAnalytics(){
  if(!plan.tgt)return;
  const b=bandOf(plan.tgt),rows=debsIn(b);
  if(document.getElementById('planDist'))paint('planDist',svgHist(DEB,{highlight:new Set([b.key])}));
  const split=document.getElementById('planSplit');
  if(split){
    const cm={q:'var(--blue)',v:'var(--violet)',di:'var(--teal)'};
    const slo=55,shi=90,sscale=v=>Math.max(2,Math.min(100,Math.round(100*(v-slo)/(shi-slo))));
    const med=sectionMedians(rows),weak=weakestSection(rows);
    split.innerHTML=[['q','Quant'],['v','Verbal'],['di','Data Insights']].map(([k,name])=>{
      const m=med[k]!=null?Math.round(med[k]):null;if(m==null)return '';
      return `<div class="cmp"><div class="cl">${name}</div><div class="ctrack"><div class="cbar" style="--w:${sscale(m)}%;background:${cm[k]}"></div></div><div class="cscore" style="color:${cm[k]}">${m}</div></div>`;}).join('')
      ||'<div class="empty2" style="color:var(--ink-3);font-size:13px">No complete section splits in this range.</div>';
    if(!RM)requestAnimationFrame(()=>split.classList.add('grown'));else split.classList.add('grown');
    const call=document.getElementById('planSplitCall');
    if(call)call.innerHTML=weak?`<b>${weak.name}</b> is the lowest median split in ${esc(b.label)}. Treat it as your first diagnostic checkpoint, not a verdict.`:`Not enough complete section splits to name a bottleneck confidently.`;
  }
  const resEl=document.getElementById('planRes');
  if(resEl){const top=topResources(rows,6);
    paint('planRes',top.length?hBarsHTML(top,rows.length,{color:'var(--amber)'}):'<div class="chartempty" style="height:auto;min-height:0;padding:12px 0">No named resources in this range.</div>');}
  const prepEl=document.getElementById('planPrep');
  if(prepEl){const pp=rows.map(d=>d.prep_weeks).filter(x=>x!=null),gg=rows.map(d=>d.gain).filter(x=>x!=null),aa=rows.map(d=>d.attempts).filter(x=>x!=null),self=rows.filter(d=>(d.tags||[]).includes('Self Study')).length;
    prepEl.innerHTML=[
      ['Median prep',pp.length?fmt(median(pp))+'w':'—',pp.length],
      ['Median gain',gg.length?'+'+fmt(median(gg)):'—',gg.length],
      ['Median attempts',aa.length?fmt(median(aa)):'—',aa.length],
      ['Self-study',self?pct(self,rows.length)+'%':'—',rows.length],
    ].map(([l,n,s])=>`<div class="ministat"><div class="n">${n}</div><div class="l">${l}<br><span style="color:var(--ink-3);font-weight:650">n=${s}</span></div></div>`).join('');}
  const heatEl=document.getElementById('planHeat');
  if(heatEl){
    const cand=countBy(rows,d=>(d.strat||[]).map(parseStrat).map(p=>p.sec+'|'+p.label)).slice(0,isCompact()?4:5)
      .map(([k])=>{const i=k.indexOf('|');return {sec:k.slice(0,i),label:k.slice(i+1)};});
    const cells=['<div class="hmhead"></div>'];
    BANDS.forEach(bd=>cells.push(`<div class="hmhead">${bd.label.replace(' – ','-')}</div>`));
    cand.forEach(item=>{cells.push(`<div class="hmlabel">${esc(item.label)}</div>`);
      BANDS.forEach(bd=>{const br=debsIn(bd),pool=rowsForStrat(br,item.sec,item.label),p=pct(pool.length,br.length),a=Math.max(.06,Math.min(.6,p/100*.9));
        cells.push(`<div class="hmcell" style="--a:${a.toFixed(2)}"><button type="button" onclick='openHeatCohort(${JSON.stringify(item.sec)},${JSON.stringify(item.label)},${JSON.stringify(bd.key)})'>${p}%</button></div>`);});});
    heatEl.innerHTML=cells.join('');
  }
}
function insightStatsHTML(items){
  return `<div class="insightstats">${items.map(x=>`<div class="insightstat"><div class="n">${x.v}</div><div class="l">${esc(x.l)}</div></div>`).join('')}</div>`;
}
function takeawaysHTML(items){
  return `<ul class="takeaways">${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
}
function noteHTML(quotes,color){
  if(!quotes.length)return '<div class="empty2" style="color:var(--ink-3);font-size:13px">Not enough detailed notes in this slice yet.</div>';
  return `<ul class="notelist" style="--bullet:${color||'var(--primary)'}">${quotes.map(q=>`<li>${esc(q.text)}</li>`).join('')}</ul>`;
}
function sectionBalanceHTML(rows,highlight){
  const med=sectionMedians(rows),cm={q:'var(--blue)',v:'var(--violet)',di:'var(--teal)'};
  const slo=55,shi=90,scale=v=>Math.max(2,Math.min(100,Math.round(100*(v-slo)/(shi-slo))));
  const html=[['q','Quant'],['v','Verbal'],['di','Data Insights']].map(([k,name])=>{
    const m=med[k]!=null?Math.round(med[k]):null;if(m==null)return '';
    return `<div class="cmp"><div class="cl">${name}${k===highlight?'<small>your focus</small>':''}</div>
      <div class="ctrack"><div class="cbar" style="--w:${scale(m)}%;background:${cm[k]}"></div></div>
      <div class="cscore" style="color:${cm[k]}">${m}</div></div>`;
  }).join('');
  return html?`<div class="seccompare">${html}</div>`:'<div class="empty2" style="color:var(--ink-3);font-size:13px">No complete section splits in this cohort.</div>';
}
function planSectionInsight(peers,b){
  const key=selectedSectionKey(peers),secName=sectionLabel(key),secCode=sectionCode(key),[c,cl]=SECCOL[key];
  const ins=sectionInsight(peers,key,new Set()),pool=rowsForSection(peers,key),top=ins.top[0];
  const med=ins.med!=null?Math.round(ins.med):'—';
  const topPct=top?pct(top[1],peers.length):0;
  const take=[
    top?`<b>${esc(top[0])}</b> is the clearest repeated ${esc(secName)} tactic in this peer set (${topPct}% mention it).`:`The peer set is thin on repeated ${esc(secName)} tactics, so use the notes and examples as qualitative guidance.`,
    ins.med!=null?`The typical ${esc(secName)} split is <b>${med}</b>, so treat your next mock as a diagnostic against that benchmark.`:`Not enough complete ${esc(secName)} scores appear here to set a reliable numeric benchmark.`,
    `<b>${ins.withNotes}</b> of ${peers.length} matching debriefs include detailed ${esc(secName)} notes; copy the error-review behavior, not just the resource names.`,
  ];
  const next=`Next move: run one timed ${esc(secName)} set, tag every miss as concept / timing / careless, then drill only the top repeated miss type before your next mock.`;
  return {
    title:`${secName} insight`,
    sub:`The pattern behind “Start with ${secName}.”`,
    rows:bestExamples(pool,12),
    meta:{kind:'section',band:b.label,section:secName,sample:pool.length},
    html:`
      <div class="draweranswer" style="--drawer:var(${c});--drawer-l:var(${cl})">
        <span class="ey">Short answer</span>
        <h3>Make ${esc(secName)} a feedback loop, not a broad review plan.</h3>
        <p>The useful signal is where repeated misses cluster. Your first job is to convert those misses into targeted drills and pacing rules.</p>
      </div>
      ${insightStatsHTML([
        {v:med,l:`typical ${secName}`},
        {v:top?topPct+'%':'—',l:'top tactic share'},
        {v:ins.withNotes,l:'detailed notes'},
        {v:pool.length,l:'matching examples'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Section balance</h3>${sectionBalanceHTML(peers,key)}</div>
        <div class="insightpanel"><h3>Top ${esc(secName)} tactics</h3>${ins.top.length?hBarsHTML(ins.top,peers.length,{color:`var(${c})`}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No repeated tactics yet.</div>'}</div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(ins.quotes,`var(${c})`)}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> ${next}</div>`
  };
}
function planHabitInsight(peers,b){
  const top=topStrats(peers,'G',5),main=top[0],pool=main?rowsForStrat(peers,'G',main[0]):peers;
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null),gains=peers.map(d=>d.gain).filter(x=>x!=null);
  const quotes=overallQuotes(pool.length?pool:peers,3);
  const take=[
    main?`<b>${esc(main[0])}</b> is the strongest repeated habit (${pct(main[1],peers.length)}% of matching debriefs).`:'No single habit dominates, so use the closest debriefs to copy process details.',
    'The recurring pattern is a loop: mock or timed set, review, targeted drill, then retest the same weakness.',
    'Treat this as an operating rhythm. More questions only help when the review loop changes what you do next.',
  ];
  return {
    title:'Practice-loop insight',
    sub:'What people repeatedly did between mocks and drills.',
    rows:bestExamples(pool.length?pool:peers,12),
    meta:{kind:'habit',band:b.label,tactic:main&&main[0],sample:pool.length||peers.length},
    html:`
      <div class="draweranswer">
        <span class="ey">Short answer</span>
        <h3>Build a loop you can repeat every week.</h3>
        <p>The debriefs rarely point to “just do more.” They point to repeated review behavior: timed work, error logging, targeted drills, and test-day execution rules.</p>
      </div>
      ${insightStatsHTML([
        {v:main?pct(main[1],peers.length)+'%':'—',l:'top habit share'},
        {v:prep.length?fmt(median(prep))+'w':'—',l:'median prep'},
        {v:gains.length?'+'+fmt(median(gains)):'—',l:'median gain'},
        {v:top.length,l:'repeated habits'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Common practice habits</h3>${top.length?hBarsHTML(top,peers.length,{color:'var(--primary)'}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No repeated habits yet.</div>'}</div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(quotes,'var(--primary)')}</div>
        <div class="insightpanel"><h3>Simple weekly loop</h3>${takeawaysHTML(['One timed set or mock block.','Review every miss and every slow solve.','Drill the top repeated error.','Retest the same pattern before changing focus.'])}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> Pick one recurring habit above and run it for seven days before adding another resource or topic.</div>`
  };
}
function planResourceInsight(peers,b){
  const top=topResources(peers,6),main=top[0],pool=main?peers.filter(d=>(d.resources||[]).includes(main[0])):peers;
  const named=peers.filter(d=>(d.resources||[]).length),self=peers.filter(d=>(d.tags||[]).includes('Self Study')).length;
  const quotes=overallQuotes(pool.length?pool:peers,3);
  const chips=top.slice(0,5).map(([r])=>`<span>${esc(r)}</span>`).join('');
  const take=[
    main?`<b>${esc(main[0])}</b> is the most-mentioned resource, but that is a popularity signal, not proof of causality.`:'This peer slice does not name resources consistently, so lean more on process than brand choice.',
    'The useful pattern is the stack: official calibration, targeted practice, and careful review.',
    'Avoid copying every product name. Copy how students combined resources around their weakest section and mock review.',
  ];
  return {
    title:'Resource-stack insight',
    sub:'How matching debriefs talk about materials without treating popularity as causality.',
    rows:bestExamples(pool.length?pool:peers,12),
    meta:{kind:'resource',band:b.label,resource:main&&main[0],sample:pool.length||peers.length},
    html:`
      <div class="draweranswer" style="--drawer:var(--amber);--drawer-l:var(--amber-l)">
        <span class="ey">Short answer</span>
        <h3>Use resources as a stack, not a shopping list.</h3>
        <p>The signal is not “buy the most-mentioned thing.” It is how students combined official material, practice banks, mocks, and review around a specific bottleneck.</p>
      </div>
      ${insightStatsHTML([
        {v:main?pct(main[1],peers.length)+'%':'—',l:'top resource share'},
        {v:named.length,l:'name resources'},
        {v:self?pct(self,peers.length)+'%':'—',l:'self-study'},
        {v:top.length,l:'resource signals'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Most-mentioned resources</h3>${top.length?hBarsHTML(top,peers.length,{color:'var(--amber)'}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No named resources yet.</div>'}</div>
        <div class="insightpanel"><h3>Likely stack to inspect</h3><div class="stackchips">${chips||'<span>No clear stack yet</span>'}</div></div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(quotes,'var(--amber)')}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> Choose one core resource for your weakest lever, then use official mocks or official-style review to decide whether it is working.</div>`
  };
}
function planTimingInsight(peers,b){
  const timing=topParsedStrats(peers,p=>/mock|review|timing|test-day|section-order|routine|mindset|error log|move/i.test(p.label),5);
  const top=timing.length?timing:topParsedStrats(peers,p=>p.sec==='G',5),main=top[0],pool=main?rowsForParsed(peers,main):peers;
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null),quotes=overallQuotes(pool.length?pool:peers,3);
  const barData=top.map(x=>[x.label,x.n]);
  const take=[
    main?`<b>${esc(main.label)}</b> is the clearest execution signal (${pct(main.n,peers.length)}% mention it).`:'The peer set does not have one dominant execution habit, so use the examples for specific pacing rules.',
    'Timing work should produce rules: when to move on, when to guess, and which section order keeps you calm.',
    'A mock only helps if the review changes the next timed set.',
  ];
  return {
    title:'Timing and test-day insight',
    sub:'What to copy when pacing or execution feels like the hard part.',
    rows:bestExamples(pool.length?pool:peers,12),
    meta:{kind:'timing',band:b.label,tactic:main&&main.label,sample:pool.length||peers.length},
    html:`
      <div class="draweranswer" style="--drawer:var(--green);--drawer-l:var(--green-l)">
        <span class="ey">Short answer</span>
        <h3>Turn timing into rules before test day.</h3>
        <p>The strongest execution debriefs describe decisions they made before the clock got stressful: section order, move-on rules, and how they reviewed mocks.</p>
      </div>
      ${insightStatsHTML([
        {v:main?pct(main.n,peers.length)+'%':'—',l:'top timing signal'},
        {v:prep.length?fmt(median(prep))+'w':'—',l:'median prep'},
        {v:top.length,l:'execution signals'},
        {v:pool.length||peers.length,l:'matching examples'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Execution habits</h3>${barData.length?hBarsHTML(barData,peers.length,{color:'var(--green)'}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No repeated timing habits yet.</div>'}</div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(quotes,'var(--green)')}</div>
        <div class="insightpanel"><h3>Rules to write down</h3>${takeawaysHTML(['What is my section order?','How long before I move on?','Which mistakes mean content, timing, or stress?','What will I review after each mock?'])}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> Write one move-on rule and one review rule, then test both in your next timed block.</div>`
  };
}
function buildPlanInsight(kind,peers,b){
  if(kind==='section')return planSectionInsight(peers,b);
  if(kind==='resource')return planResourceInsight(peers,b);
  if(kind==='timing')return planTimingInsight(peers,b);
  return planHabitInsight(peers,b);
}
/* ---- Step 2: weekly checklist (persisted per plan in localStorage) ---- */
const LS_CHECKS='ps_checks_v1';
function planSig(){return [plan.cur,plan.tgt,plan.wk,plan.focus].join('-');}
function loadChecks(){try{const o=JSON.parse(localStorage.getItem(LS_CHECKS));if(o&&o.sig===planSig()&&Array.isArray(o.done))return o.done;}catch(e){}return [];}
function saveChecks(done){try{localStorage.setItem(LS_CHECKS,JSON.stringify({sig:planSig(),done}));}catch(e){}}
function checklistItems(peers){
  const secName=sectionLabel(selectedSectionKey(peers));
  const genTop=topStrats(peers,'G',1)[0],resTop=topResources(peers,1)[0];
  return [
    `Take one timed <b>${esc(secName)}</b> set and tag every miss: concept, timing, or careless.`,
    genTop?`Set up your review loop — <b>${esc(genTop[0])}</b> shows up in ${pct(genTop[1],peers.length)}% of stories like yours.`:'Set up a weekly loop: timed set → review misses → drill the repeat offender.',
    resTop?`Pick one core resource and commit for two weeks — <b>${esc(resTop[0])}</b> is the most-named here (${pct(resTop[1],peers.length)}%).`:'Pick one core resource and commit to it for two weeks.',
    'Book a full-length mock for the end of the week — real timing data beats guessing.',
  ];
}
function renderChecklist(peers){
  const el=document.getElementById('planChecklist');if(!el)return;
  if(!peers)peers=peersFor(plan.tgt,plan.cur).peers;
  const items=checklistItems(peers),done=loadChecks();
  const n=items.reduce((a,_,i)=>a+(done[i]?1:0),0);
  const ct=document.getElementById('chkCount');
  if(ct)ct.textContent=n+' of '+items.length+' done';
  el.innerHTML=items.map((t,i)=>`<button type="button" class="chk ${done[i]?'done':''}" onclick="toggleCheck(${i})" aria-pressed="${!!done[i]}">
    <span class="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M4.5 12.5l5 5L19.5 7"/></svg></span>
    <span class="txt">${t}</span></button>`).join('');
}
function toggleCheck(i){
  if(!requireAuth('checklist','Create account to save checklist','Keep checklist progress synced across devices.'))return;
  const done=loadChecks();done[i]=!done[i];saveChecks(done);renderChecklist();
  try{cloudSaveChecks();}catch(e){}
  track('check_toggle',{i,on:!!done[i]});
  if(done[i]&&[0,1,2,3].every(k=>done[k]))confettiBurst(document.querySelector('.checkwrap'));
}

/* ---- playful bits: count-up numbers + confetti ---- */
function animateCounts(root){
  if(!root)return;
  root.querySelectorAll('[data-cnt]').forEach(el=>{
    const end=parseFloat(el.getAttribute('data-cnt'));
    if(RM||!isFinite(end))return;
    const t0=performance.now(),dur=750,dec=String(end).includes('.')?1:0;
    const step=t=>{const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
      el.textContent=(end*e).toFixed(dec);
      if(p<1)requestAnimationFrame(step);else el.textContent=String(end);};
    requestAnimationFrame(step);
  });
}
function confettiBurst(host){
  if(RM||!host)return;
  const colors=['#5b5bd6','#7c5cf0','#ff6b5b','#15a34a','#e08a00','#0d9488','#ffffff'];
  const w=document.createElement('div');w.className='confetti';
  let bits='';
  for(let i=0;i<26;i++){
    const a=Math.random()*Math.PI*2,r=90+Math.random()*150;
    bits+=`<i style="background:${colors[i%colors.length]};--cx:${Math.round(Math.cos(a)*r)}px;--cy:${Math.round(Math.sin(a)*r-40)}px;--cr:${Math.round(Math.random()*540-270)}deg;--cd:${Math.round(Math.random()*140)}ms"></i>`;
  }
  w.innerHTML=bits;host.appendChild(w);setTimeout(()=>w.remove(),1500);
}
function renderPlanActions(peers,b){
  const focus=focusOf(plan.focus),weak=weakestSection(peers),secKey=selectedSectionKey(peers),secName=sectionLabel(secKey);
  const secTop=topStrats(peers,sectionCode(secKey),1)[0];
  const genTop=topStrats(peers,'G',3);
  const resTop=topResources(peers,3);
  const sectionCopy=focus.sec
    ?`${secName} is the difficulty you chose. Keep the first study block narrow enough that every miss can become a repeatable drill.`
    :weak?`${weak.name} is the lowest median split among debriefs like yours. Use it as the first diagnostic checkpoint.`
      :'Not enough full section splits in this cohort — separate Quant, Verbal, and DI practice from the start.';
  const cards=[
    {k:'Section focus',c:'var(--blue)',l:'var(--blue-l)',
      h:`Start with ${secName}`,
      p:sectionCopy,
      m:secTop?`<b>${pct(secTop[1],peers.length)}%</b> mention ${esc(secTop[0])}`:`<b>${peers.length}</b> examples`,
      a:'See the evidence',kind:'section'},
    {k:'Practice loop',c:'var(--primary)',l:'var(--primary-l)',
      h:genTop[0]?esc(genTop[0][0]):'Build a review loop',
      p:'The repeated pattern is not just doing more questions. People describe a loop of mocks, review, targeted drills, and test-day execution.',
      m:genTop[0]?`<b>${pct(genTop[0][1],peers.length)}%</b> name this habit`:`<b>${peers.length}</b> debriefs sampled`,
      a:'See the evidence',kind:'habit'},
    {k:'Resource stack',c:'var(--amber)',l:'var(--amber-l)',
      h:resTop[0]?esc(resTop[0][0]):'Use named materials deliberately',
      p:'Resources are popularity signals, not proof of causality. The useful move is seeing how students combined official material, practice banks, and review.',
      m:resTop[0]?`<b>${pct(resTop[0][1],peers.length)}%</b> mention the top resource`:`<b>0</b> named resources`,
      a:'See the evidence',kind:'resource'},
  ];
  document.getElementById('planActions').innerHTML=cards.map(x=>`
    <div class="actioncard rise" style="--ac:${x.c};--acl:${x.l}">
      <span class="k">${x.k}</span>
      <h3>${x.h}</h3>
      <p>${x.p}</p>
      <div class="metric">${x.m}</div>
      <button class="actbtn" type="button" onclick="handlePlanAction('${x.kind}')">${x.a}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>`).join('');
}
function handlePlanAction(kind){
  const{peers}=peersFor(plan.tgt,plan.cur),b=bandOf(plan.tgt);
  track('plan_action_click',{kind,band:b.label});
  if(kind==='proof'){jumpPlanEvidence();return;}
  openPlanInsight(buildPlanInsight(kind,peers,b));
}
function jumpPlanEvidence(){const t=document.getElementById('planEvidence');
  scrollTo({top:t.getBoundingClientRect().top+scrollY-70,behavior:RM?'auto':'smooth'});}

/* ================= SVG CHART PRIMITIVES (themed, no chart library) ================= */
let _uid=0;
function uid(){return 'g'+(++_uid);}
function isCompact(){return window.innerWidth<520;}
function niceTicks(min,max,count){
  if(max<=min)max=min+1;
  const step0=(max-min)/(count||4),mag=Math.pow(10,Math.floor(Math.log10(step0)||0)),norm=step0/mag;
  let step=(norm<1.5?1:norm<3?2:norm<7?5:10)*mag;
  const lo=Math.ceil(min/step)*step,out=[];
  for(let v=lo;v<=max+1e-9;v+=step)out.push(Math.round(v*100)/100);
  return out.length?out:[min,max];
}
/* re-run the grow animation each render: reset, reflow, then add .grown */
function paint(id,html){
  const el=document.getElementById(id);if(!el)return;
  el.classList.remove('grown');el.innerHTML=html;
  if(RM){el.classList.add('grown');return;}
  void el.offsetWidth;requestAnimationFrame(()=>el.classList.add('grown'));
}
function svgVBars(data,opt){
  opt=opt||{};const cmp=isCompact();
  const W=opt.W||(cmp?360:560),H=opt.H||(cmp?240:284),padL=cmp?32:42,padR=cmp?12:16,padT=20,padB=40;
  const base=H-padB,plotH=H-padT-padB,plotW=W-padL-padR;
  const yMin=opt.yMin!=null?opt.yMin:0,yMax=opt.yMax!=null?opt.yMax:Math.max(1,...data.map(d=>d.value||0));
  const sc=v=>base-(Math.max(yMin,Math.min(yMax,v))-yMin)/((yMax-yMin)||1)*plotH;
  const grid=niceTicks(yMin,yMax,4).map(t=>{const y=sc(t);
    return `<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axlabel" x="${padL-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${opt.fmtTick?opt.fmtTick(t):t}</text>`;}).join('');
  const n=data.length,slot=plotW/n,bw=Math.min(cmp?30:56,slot*.62);
  const bars=data.map((d,i)=>{
    const v=d.value||0,y=sc(v),h=Math.max(0,base-y),x=padL+i*slot+(slot-bw)/2;
    const hit=d.click?`<rect x="${(padL+i*slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${(base-padT).toFixed(1)}" fill="transparent" style="cursor:pointer" onclick="${d.click}"><title>${esc(d.label)}: ${esc(String(d.tip!=null?d.tip:v))} — tap for the stories</title></rect>`:'';
    return `<rect class="vbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${d.color||opt.color||'var(--primary)'}"><title>${esc(d.label)}: ${esc(String(d.tip!=null?d.tip:v))}</title></rect>
      ${(d.valLabel!==''&&(v||d.valLabel!=null))?`<text class="vcount" x="${(x+bw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle">${d.valLabel!=null?d.valLabel:v}</text>`:''}
      <text class="axlabel" x="${(x+bw/2).toFixed(1)}" y="${H-13}" text-anchor="middle">${esc(d.label)}</text>${hit}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opt.aria||'bar chart')}">${grid}<line class="axis" x1="${padL}" x2="${W-padR}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}
function svgGroupedBars(groups,series,opt){
  opt=opt||{};const cmp=isCompact();
  const W=opt.W||(cmp?360:560),H=opt.H||(cmp?240:284),padL=cmp?30:40,padR=cmp?12:16,padT=16,padB=40;
  const base=H-padB,plotH=H-padT-padB,plotW=W-padL-padR;
  const yMin=opt.yMin!=null?opt.yMin:0,yMax=opt.yMax!=null?opt.yMax:90;
  const sc=v=>base-(Math.max(yMin,Math.min(yMax,v))-yMin)/((yMax-yMin)||1)*plotH;
  const grid=niceTicks(yMin,yMax,4).map(t=>{const y=sc(t);
    return `<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axlabel" x="${padL-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${t}</text>`;}).join('');
  const gN=groups.length,gslot=plotW/gN,sN=series.length,gpad=gslot*.16,innerW=gslot-gpad*2;
  const bw=Math.min(cmp?15:30,(innerW/sN)*.82),gap=(innerW-bw*sN)/(sN+1);
  const bars=groups.map((g,gi)=>{
    const gx=padL+gi*gslot+gpad;
    const inner=series.map((s,si)=>{const v=g.values[s.key];if(v==null)return '';
      const x=gx+gap+si*(bw+gap),y=sc(v),h=Math.max(0,base-y);
      return `<rect class="vbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${s.color}"><title>${esc(g.label)} · ${esc(s.label)}: ${Math.round(v)}</title></rect>`;}).join('');
    return inner+`<text class="axlabel" x="${(gx+innerW/2).toFixed(1)}" y="${H-13}" text-anchor="middle">${esc(g.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opt.aria||'grouped bar chart')}">${grid}<line class="axis" x1="${padL}" x2="${W-padR}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}
function svgScatter(points,opt){
  opt=opt||{};const cmp=isCompact();if(!points.length)return '';
  const W=opt.W||(cmp?360:600),H=opt.H||(cmp?280:330),padL=cmp?34:44,padR=cmp?14:18,padT=14,padB=44;
  const base=H-padB,plotH=H-padT-padB,plotW=W-padL-padR;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const xMin=0,xMax=opt.xMax!=null?opt.xMax:Math.max(1,...xs),yMin=Math.min(0,...ys),yMax=opt.yMax!=null?opt.yMax:Math.max(1,...ys);
  const sx=v=>padL+(v-xMin)/((xMax-xMin)||1)*plotW,sy=v=>base-(v-yMin)/((yMax-yMin)||1)*plotH;
  const grid=niceTicks(yMin,yMax,4).map(t=>{const y=sy(t);
    return `<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axlabel" x="${padL-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${t}</text>`;}).join('');
  const xax=niceTicks(xMin,xMax,5).map(t=>`<text class="axlabel" x="${sx(t).toFixed(1)}" y="${H-26}" text-anchor="middle">${t}</text>`).join('');
  let trend='';
  if(points.length>=4){
    const n=points.length,sX=xs.reduce((a,b)=>a+b,0),sY=ys.reduce((a,b)=>a+b,0),
      sXY=points.reduce((a,p)=>a+p.x*p.y,0),sXX=points.reduce((a,p)=>a+p.x*p.x,0),den=n*sXX-sX*sX;
    if(den){const m=(n*sXY-sX*sY)/den,b0=(sY-m*sX)/n,cl=v=>Math.max(yMin,Math.min(yMax,v));
      trend=`<line class="trend" x1="${sx(xMin).toFixed(1)}" y1="${sy(cl(m*xMin+b0)).toFixed(1)}" x2="${sx(xMax).toFixed(1)}" y2="${sy(cl(m*xMax+b0)).toFixed(1)}" stroke="var(--ink-3)"/>`;}
  }
  const dots=points.map(p=>`<circle class="dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${cmp?4:5}" fill="${p.color||'var(--primary)'}" fill-opacity=".72"><title>${esc(p.tip||'')}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opt.aria||'scatter plot')}">${grid}${xax}<line class="axis" x1="${padL}" x2="${W-padR}" y1="${base}" y2="${base}"/><line class="axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${base}"/>${trend}${dots}<text class="axtitle" x="${(padL+plotW/2).toFixed(1)}" y="${H-7}" text-anchor="middle">${esc(opt.xTitle||'')}</text></svg>`;
}
function svgHist(rows,opt){
  opt=opt||{};const cmp=isCompact(),g=uid(),cnt={};
  rows.forEach(d=>{if(d.total!=null)cnt[d.total]=(cnt[d.total]||0)+1;});
  const pts=[];for(let s=655;s<=805;s+=10)pts.push(s);
  const max=Math.max(1,...pts.map(s=>cnt[s]||0));
  const W=cmp?360:600,H=cmp?248:296,padX=cmp?18:28,padT=24,padB=42,base=H-padB,plotH=H-padT-padB;
  const step=(W-padX*2)/pts.length,bw=Math.min(cmp?16:30,step*.72),hl=opt.highlight;
  const bars=pts.map((s,i)=>{
    const n=cnt[s]||0,band=BANDS.find(b=>s>=b.lo&&s<=b.hi),inb=hl?(band&&hl.has(band.key)):true;
    const h=n?Math.max(4,n/max*plotH):0,x=padX+i*step+(step-bw)/2,y=base-h,show=(s%20===15)||s===655||s===805;
    return `<rect class="vbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${inb?`url(#${g})`:'#d7d8e7'}"><title>${s}: ${n} debriefs</title></rect>
      ${n>=(cmp?18:9)?`<text class="vcount" x="${(x+bw/2).toFixed(1)}" y="${Math.max(15,y-6).toFixed(1)}" text-anchor="middle">${n}</text>`:''}
      ${show?`<text class="axlabel" x="${(x+bw/2).toFixed(1)}" y="${H-14}" text-anchor="middle">${s}</text>`:''}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score distribution">
    <defs><linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7c5cf0"/><stop offset="1" stop-color="#5b5bd6"/></linearGradient></defs>
    <line class="axis" x1="${padX}" x2="${W-padX}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}
function hBarsHTML(data,total,opt){
  opt=opt||{};const mx=data.length?data[0][1]:1;
  return '<div class="bars">'+data.map(([label,n],i)=>{const p=Math.round(100*n/(total||1));
    const inner=`<div class="blabel"><span class="bname"><span class="txt">${esc(label)}</span></span><span class="bpct">${p}%</span></div>
      <div class="bartrack"><div class="barfill" style="--w:${Math.round(100*n/mx)}%${opt.color?';background:'+opt.color:''}"></div></div>`;
    return opt.click?`<button type="button" class="barrow barbtn" onclick="${opt.click}(${i})">${inner}</button>`
      :`<div class="barrow">${inner}</div>`;}).join('')+'</div>';
}

/* ================= EXPLORE THE DATA (global, filterable charts) ================= */
let xf={bands:new Set(),src:'',res:'',self:false};
let xLimit=12,xq='',xsort='score';
let _xrestop=[],_xatt=[];
function xFiltered(ignoreBand){
  let rows=DEB.slice();
  if(!ignoreBand&&xf.bands.size)rows=rows.filter(d=>{const b=BANDS.find(x=>inBand(d,x));return b&&xf.bands.has(b.key);});
  if(xf.src)rows=rows.filter(d=>d.source===xf.src);
  if(xf.res)rows=rows.filter(d=>(d.resources||[]).includes(xf.res));
  if(xf.self)rows=rows.filter(d=>(d.tags||[]).includes('Self Study'));
  return rows;
}
function renderFilterBar(){
  const fb=document.getElementById('filterbar');if(!fb)return;
  const srcs=[...new Set(DEB.map(d=>d.source))].sort();
  const resAll=topResources(DEB,14).map(r=>r[0]);
  fb.innerHTML=`
    <div class="fgroup"><span class="flabel">Score</span><div class="chiprow">
      ${BANDS.map(b=>`<button class="fchip ${xf.bands.has(b.key)?'on':''}" onclick="xToggleBand('${b.key}')">${b.label}</button>`).join('')}</div></div>
    <div class="fgroup"><span class="flabel">Source</span>
      <select class="pick" id="xfSrc"><option value="">All</option>${srcs.map(s=>`<option ${xf.src===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
    <div class="fgroup"><span class="flabel">Resource</span>
      <select class="pick" id="xfRes"><option value="">All</option>${resAll.map(r=>`<option ${xf.res===r?'selected':''}>${esc(r)}</option>`).join('')}</select></div>
    <button class="fchip ${xf.self?'on':''}" onclick="xToggleSelf()">Self-study only</button>
    <div class="spacer"></div>
    <span class="fcount" id="xfCount"></span>
    <button class="freset" onclick="xReset()">Reset</button>`;
  document.getElementById('xfSrc').onchange=e=>{xf.src=e.target.value;xLimit=12;renderExplore();};
  document.getElementById('xfRes').onchange=e=>{xf.res=e.target.value;xLimit=12;renderExplore();};
}
function xToggleBand(k){xf.bands.has(k)?xf.bands.delete(k):xf.bands.add(k);xLimit=12;renderFilterBar();renderExplore();track('x_filter',{band:k});}
function xToggleSelf(){xf.self=!xf.self;xLimit=12;renderFilterBar();renderExplore();}
function xReset(){xf={bands:new Set(),src:'',res:'',self:false};xLimit=12;renderFilterBar();renderExplore();}
function openTargetExplore(){
  const b=bandOf(plan.tgt);
  if(b){xf={bands:new Set([b.key]),src:'',res:'',self:false};state.band=b.key;xLimit=12;}
  const was=exploreInit;
  nav(b?'/explore/'+BAND_SLUG[b.key]:'/explore');
  if(was){renderFilterBar();renderExplore();}
  if(b)track('plan_explore_target',{band:b.label});
}
function renderXStat(rows){
  const tot=rows.map(d=>d.total).filter(x=>x!=null),g=rows.map(d=>d.gain).filter(x=>x!=null),p=rows.map(d=>d.prep_weeks).filter(x=>x!=null);
  const stats=[
    {v:rows.length,l:'debriefs',cls:''},
    {v:tot.length?median(tot):null,l:'median score',cls:'green'},
    {v:g.length?'+'+median(g):null,l:'median gain',cls:'coral'},
    {v:p.length?median(p)+'w':null,l:'median prep',cls:''},
  ];
  document.getElementById('xstat').innerHTML=stats.map(s=>`<div class="stat ${s.cls}"><div class="v">${s.v==null?'—':s.v}</div><div class="l">${s.l}</div></div>`).join('');
}
function renderXSection(rows){
  const groups=BANDS.map(b=>{const br=rows.filter(d=>inBand(d,b)),m=sectionMedians(br);return {label:b.label.replace(' – ','–'),values:{q:m.q,v:m.v,di:m.di}};});
  const allv=groups.flatMap(g=>Object.values(g.values)).filter(x=>x!=null);
  const box=document.getElementById('xsection'),leg=document.getElementById('xsectionLeg');
  if(!allv.length){box.innerHTML='<div class="chartempty">No complete section splits in this selection.</div>';leg.innerHTML='';setTake('xsectionTake','');return;}
  const series=[{key:'q',label:'Quant',color:'var(--blue)'},{key:'v',label:'Verbal',color:'var(--violet)'},{key:'di',label:'Data Insights',color:'var(--teal)'}];
  const yMin=Math.max(60,Math.floor((Math.min(...allv)-4)/5)*5);
  paint('xsection',svgGroupedBars(groups,series,{yMin,yMax:90,aria:'Median section score by band'}));
  leg.innerHTML=series.map(s=>`<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  const wq=weakestSection(rows);
  setTake('xsectionTake',wq?`In this view, <b>${wq.name}</b> is the lowest typical section (<b>${wq.score}</b>) — the common bottleneck.`:'');
}
function setTake(id,html){const el=document.getElementById(id);if(!el)return;
  el.classList.toggle('hidden',!html);
  el.innerHTML=html?`<span class="tico">✦</span><span>${html}</span>`:'';}
function renderXGain(rows){
  const gains=rows.map(d=>d.gain).filter(x=>x!=null),box=document.getElementById('xgain');
  if(!gains.length){box.innerHTML='<div class="chartempty">Only some debriefs report a start score, so no point-gain data in this selection.</div>';setTake('xgainTake','');return;}
  const data=GAINB.map((g,i)=>({label:g.label,value:gains.filter(v=>v>=g.lo&&v<=g.hi).length,color:'var(--coral)',click:`xOpenGain(${i})`}));
  paint('xgain',svgVBars(data,{aria:'Point gain distribution'}));
  const mg=Math.round(median(gains)),big=pct(gains.filter(v=>v>=100).length,gains.length);
  setTake('xgainTake',`Median gain <b>+${mg}</b> — and <b>${big}%</b> of reported jumps are 100+ points.`);
}
function xOpenGain(i){
  const g=GAINB[i],rows=xFiltered().filter(d=>d.gain!=null&&d.gain>=g.lo&&d.gain<=g.hi);
  track('x_bar_open',{kind:'gain',b:g.label});
  openCohort(`Gained ${g.label} points`,`${rows.length} filtered debriefs reported a ${g.label}-point jump from their start score.`,bestExamples(rows,12),{kind:'gain',tactic:g.label+' pts',sample:rows.length});
}
function renderXRes(rows){
  const top=topResources(rows,isCompact()?7:10),box=document.getElementById('xres');
  _xrestop=top;
  if(!top.length){box.innerHTML='<div class="chartempty">No named resources in this selection.</div>';setTake('xresTake','');return;}
  paint('xres',hBarsHTML(top,rows.length,{color:'var(--amber)',click:'xOpenRes'}));
  setTake('xresTake',`<b>${esc(top[0][0])}</b> shows up in <b>${pct(top[0][1],rows.length)}%</b> of this view — popularity, not proof.`);
}
function xOpenRes(i){
  const r=_xrestop[i];if(!r)return;
  const rows=xFiltered().filter(d=>(d.resources||[]).includes(r[0]));
  track('x_bar_open',{kind:'res',b:r[0]});
  openCohort(`Used ${r[0]}`,`${rows.length} filtered debriefs name ${r[0]}. Popularity, not proof — read how they used it.`,bestExamples(rows,12),{kind:'resource',resource:r[0],sample:rows.length});
}
function renderXScatter(rows){
  const raw=rows.filter(d=>d.prep_weeks!=null&&d.gain!=null),box=document.getElementById('xscatter');
  if(raw.length<3){box.innerHTML='<div class="chartempty">Not enough debriefs report both prep time and a start score in this selection.</div>';setTake('xscatterTake','');return;}
  const xMax=Math.min(Math.max(...raw.map(d=>d.prep_weeks)),52);
  const pts=raw.map(d=>{const b=BANDS.find(x=>inBand(d,x)),c=b?BANDC[b.key].c:'var(--primary)';
    return {x:Math.min(d.prep_weeks,xMax),y:d.gain,color:c,tip:`${d.prep_weeks}w → +${d.gain} (${d.total})`};});
  paint('xscatter',svgScatter(pts,{xMax,xTitle:'weeks of prep',aria:'Prep time vs score gain'}));
  const n=pts.length,sX=pts.reduce((a,p)=>a+p.x,0),sY=pts.reduce((a,p)=>a+p.y,0),
    sXY=pts.reduce((a,p)=>a+p.x*p.y,0),sXX=pts.reduce((a,p)=>a+p.x*p.x,0),den=n*sXX-sX*sX;
  if(den){const m4=Math.round(((n*sXY-sX*sY)/den)*4);
    setTake('xscatterTake',Math.abs(m4)<3?`The trend line is nearly flat here — extra weeks alone don't buy points; what you do with them does.`:`On trend, four extra prep weeks ≈ <b>${m4>0?'+':''}${m4} points</b> of gain here — correlation, not causation.`);}
  else setTake('xscatterTake','');
}
function renderXPrep(rows){
  const data=PREPB.map(p=>{const br=rows.filter(d=>d.prep_weeks!=null&&d.prep_weeks>=p.lo&&d.prep_weeks<=p.hi),m=median(br.map(d=>d.total).filter(x=>x!=null));return {label:p.label,med:m!=null?Math.round(m):null,n:br.length};});
  const has=data.filter(d=>d.med!=null),box=document.getElementById('xprep');
  if(has.length<2){box.innerHTML='<div class="chartempty">Not enough prep-time data in this selection.</div>';setTake('xprepTake','');return;}
  const vals=has.map(d=>d.med),yMin=Math.max(600,Math.floor((Math.min(...vals)-15)/10)*10),yMax=Math.min(805,Math.ceil((Math.max(...vals)+15)/10)*10);
  paint('xprep',svgVBars(data.map((d,i)=>({label:d.label,value:d.med!=null?d.med:yMin,valLabel:d.med!=null?d.med:'',tip:d.med!=null?`median ${d.med} · n=${d.n}`:'no data',color:'var(--primary)',click:d.n?`xOpenPrep(${i})`:null})),{yMin,yMax,aria:'Median score by prep time'}));
  const best=has.slice().sort((a,b)=>b.med-a.med)[0];
  setTake('xprepTake',`The <b>${esc(best.label)}</b> group posts the highest median (<b>${best.med}</b>, n=${best.n}) — small samples, so read gently.`);
}
function xOpenPrep(i){
  const p=PREPB[i],rows=xFiltered().filter(d=>d.prep_weeks!=null&&d.prep_weeks>=p.lo&&d.prep_weeks<=p.hi);
  track('x_bar_open',{kind:'prep',b:p.label});
  openCohort(`Prepped for ${p.label}`,`${rows.length} filtered debriefs reported ${p.label} of prep.`,bestExamples(rows,12),{kind:'prep',tactic:p.label,sample:rows.length});
}
function renderXAttempts(rows){
  const box=document.getElementById('xattempts');if(!box)return;
  const withA=rows.filter(d=>d.attempts!=null);
  const buckets=[{label:'1st try',f:d=>d.attempts===1},{label:'2nd try',f:d=>d.attempts===2},{label:'3rd+',f:d=>d.attempts>=3}];
  _xatt=buckets.map(bk=>{const br=withA.filter(bk.f),m=median(br.map(d=>d.total).filter(x=>x!=null));
    return{label:bk.label,med:m!=null?Math.round(m):null,n:br.length,rows:br};});
  const has=_xatt.filter(d=>d.med!=null&&d.n>=2);
  if(has.length<2){box.innerHTML='<div class="chartempty">Not enough attempt data in this selection.</div>';setTake('xattemptsTake','');return;}
  const vals=has.map(d=>d.med),yMin=Math.max(600,Math.floor((Math.min(...vals)-15)/10)*10),yMax=Math.min(805,Math.ceil((Math.max(...vals)+15)/10)*10);
  paint('xattempts',svgVBars(_xatt.map((d,i)=>({label:d.label,value:d.med!=null?d.med:yMin,valLabel:d.med!=null?d.med:'',tip:d.med!=null?`median ${d.med} · n=${d.n}`:'no data',color:'var(--green)',click:d.n?`xOpenAttempts(${i})`:null})),{yMin,yMax,aria:'Median score by attempt number'}));
  const retak=withA.filter(d=>d.attempts>=2),rg=retak.map(d=>d.gain).filter(x=>x!=null);
  setTake('xattemptsTake',`<b>${pct(retak.length,withA.length)}%</b> of these stories are retakes${rg.length?`, with a median retake gain of <b>+${Math.round(median(rg))}</b>`:''}.`);
}
function xOpenAttempts(i){
  const a=_xatt[i];if(!a||!a.rows.length)return;
  track('x_bar_open',{kind:'attempts',b:a.label});
  openCohort(`${a.label} stories`,`${a.rows.length} filtered debriefs took the test ${a.label==='3rd+'?'three or more times':a.label==='2nd try'?'twice':'once'}.`,bestExamples(a.rows,12),{kind:'attempts',tactic:a.label,sample:a.rows.length});
}
function renderXCompare(rows){
  const el=document.getElementById('xcompare');if(!el)return;
  const selfR=rows.filter(d=>(d.tags||[]).includes('Self Study')),courseR=rows.filter(d=>!(d.tags||[]).includes('Self Study'));
  const agg=r=>({n:r.length,score:median(r.map(d=>d.total).filter(x=>x!=null)),gain:median(r.map(d=>d.gain).filter(x=>x!=null)),prep:median(r.map(d=>d.prep_weeks).filter(x=>x!=null))});
  const a=agg(selfR),c=agg(courseR);
  if(a.n<3||c.n<3){el.innerHTML='<div class="chartempty" style="grid-column:1/-1">Not enough of both groups in this selection to compare.</div>';setTake('xcompareTake','');return;}
  const col=(x,title,cc,cl,isSelf)=>`<button type="button" class="duelcol" onclick="xOpenSelf(${isSelf})">
    <span class="dh" style="background:var(${cl});color:var(${cc})">${title} · ${x.n}</span>
    <div class="duelrow" style="border-top:none">median score<span class="dn">${x.score!=null?Math.round(x.score):'—'}</span></div>
    <div class="duelrow">median gain<span class="dn">${x.gain!=null?'+'+Math.round(x.gain):'—'}</span></div>
    <div class="duelrow">median prep<span class="dn">${x.prep!=null?fmt(x.prep)+'w':'—'}</span></div>
  </button>`;
  el.innerHTML=col(a,'Self-study','--green-d','--green-l',true)+col(c,'Paid course','--amber','--amber-l',false);
  const diff=(a.score!=null&&c.score!=null)?Math.round(a.score-c.score):null;
  setTake('xcompareTake',diff==null?'':diff===0?'Identical median scores for both groups in this view.':`Self-study medians run <b>${Math.abs(diff)} point${Math.abs(diff)===1?'':'s'} ${diff>0?'higher':'lower'}</b> here — selection effects included, so not a verdict on courses.`);
}
function xOpenSelf(isSelf){
  const rows=xFiltered().filter(d=>((d.tags||[]).includes('Self Study'))===!!isSelf);
  track('x_bar_open',{kind:'self',b:isSelf?'self':'course'});
  openCohort(isSelf?'Self-study stories':'Paid-course stories',`${rows.length} filtered debriefs ${isSelf?'used only free material':'mention paid prep'}.`,bestExamples(rows,12),{kind:'selfstudy',sample:rows.length});
}
function renderXHeat(){
  const base=xFiltered(true);
  const cand=countBy(base,d=>(d.strat||[]).map(parseStrat).map(p=>p.sec+'|'+p.label)).slice(0,isCompact()?5:7)
    .map(([k])=>{const i=k.indexOf('|');return {sec:k.slice(0,i),label:k.slice(i+1)};});
  const cells=['<div class="hmhead"></div>'];
  BANDS.forEach(b=>cells.push(`<div class="hmhead">${b.label.replace(' – ','-')}</div>`));
  cand.forEach(item=>{
    cells.push(`<div class="hmlabel">${esc(item.label)}</div>`);
    BANDS.forEach(b=>{const br=base.filter(d=>inBand(d,b)),pool=rowsForStrat(br,item.sec,item.label),p=pct(pool.length,br.length),a=Math.max(.06,Math.min(.6,p/100*.9));
      cells.push(`<div class="hmcell" style="--a:${a.toFixed(2)}"><button type="button" onclick='openHeatCohort(${JSON.stringify(item.sec)},${JSON.stringify(item.label)},${JSON.stringify(b.key)})'>${p}%</button></div>`);});
  });
  document.getElementById('xheat').innerHTML=cells.join('');
  if(cand.length){const top=cand[0],pool=rowsForStrat(base,top.sec,top.label);
    setTake('xheatTake',`Darker = more common. <b>${esc(top.label)}</b> is the most-adopted tactic overall (<b>${pct(pool.length,base.length)}%</b> of everyone in this view).`);}
  else setTake('xheatTake','');
}
function renderXBrowse(rows){
  let sorted=rows.slice();
  if(xq){const q=xq.toLowerCase();sorted=sorted.filter(d=>(d.title||'').toLowerCase().includes(q)||(d.resources||[]).some(r=>r.toLowerCase().includes(q)));}
  const cmps={score:(a,b)=>(b.total||0)-(a.total||0),new:(a,b)=>String(b.date||'').localeCompare(String(a.date||'')),
    gain:(a,b)=>(b.gain||0)-(a.gain||0),detail:(a,b)=>richScore(b)-richScore(a)};
  sorted.sort(cmps[xsort]||cmps.score);
  const slabels={score:'highest score first',new:'newest first',gain:'biggest gain first',detail:'most detailed first'};
  const shown=sorted.slice(0,xLimit);
  document.getElementById('xbrowseSub').innerHTML=`Showing <b>${Math.min(xLimit,sorted.length)}</b> of <b>${sorted.length}</b>, ${slabels[xsort]||''}${xq?` · matching “${esc(xq)}”`:''}.`;
  document.getElementById('xbrowseList').innerHTML=shown.map(debCardHTML).join('');
  document.getElementById('xbrowseEmpty').classList.toggle('hidden',sorted.length>0);
  document.getElementById('xbrowseMore').classList.toggle('hidden',sorted.length<=xLimit);
}
function xShowMore(){xLimit+=12;renderXBrowse(xFiltered());track('x_more',{n:xLimit});}
function renderExplore(){
  syncExploreURL();
  const rows=xFiltered();
  const cnt=document.getElementById('xfCount');if(cnt)cnt.innerHTML=`<b>${rows.length}</b> of ${DEB.length}`;
  renderXStat(rows);
  paint('xdist',svgHist(rows,{highlight:xf.bands.size?xf.bands:null}));
  const dh=document.getElementById('xdistHint');if(dh)dh.textContent=xf.bands.size?'selected bands highlighted':'';
  const xtot=rows.map(d=>d.total).filter(x=>x!=null);
  setTake('xdistTake',xtot.length?`Median <b>${median(xtot)}</b> in this view; <b>${pct(xtot.filter(v=>v>=705).length,xtot.length)}%</b> land at 705 or above.`:'');
  renderXSection(rows);renderXGain(rows);renderXRes(rows);renderXScatter(rows);renderXPrep(rows);renderXAttempts(rows);renderXCompare(rows);renderXHeat();renderXBrowse(rows);
}
function debCardHTML(d){
  const top=(d.strat||[]).slice(0,3).map(s=>{const{sec,label}=parseStrat(s);
    const cm={Q:'var(--blue)',V:'var(--violet)',DI:'var(--teal)',G:'var(--primary)'};
    return `<span class="minichip"><span class="d" style="background:${cm[sec]}"></span>${esc(label)}</span>`;}).join('');
  const flags=(d.tags||[]).map(t=>t==='Maybe Promo'?'<span class="tag promo">Maybe&nbsp;promo</span>':t==='Self Study'?'<span class="tag self">Self&nbsp;study</span>':'').join('');
  const meta=[];
  if(d.prep_weeks)meta.push(`<b>${d.prep_weeks}w</b> prep`);
  if(d.attempts)meta.push(`<b>${d.attempts}</b> attempt${d.attempts>1?'s':''}`);
  if(d.gain)meta.push(`<b>+${d.gain}</b> gain`);
  return `<button class="card" onclick="openDebrief('${d.id}',true)" aria-label="Read: ${esc(d.title)}">
    <div class="ctop"><span class="score-badge">${d.total}<small>/805</small></span>
      <span class="src">${esc(d.source)}</span></div>
    <div class="ctitle">${esc(d.title)}</div>
    <div class="ctags">${top}${flags}</div>
    ${meta.length?`<div class="cmeta">${meta.join('')}</div>`:''}
  </button>`;
}
/* legacy band-scoped explore renderers removed in v19.2 (see EXPLORE THE DATA + plan analytics) */

/* ---------- cohort proof drawer ---------- */
function openPlanInsight(insight){
  const c=document.getElementById('cohort'),m=insight.meta||{},rows=insight.rows||[];
  document.getElementById('cohortTitle').textContent=insight.title;
  document.getElementById('cohortSub').textContent=insight.sub;
  document.getElementById('cohortMeta').innerHTML=[
    sampleText(rows.length,'examples'),
    m.band?`<span>${esc(m.band)}</span>`:'',
    m.section?`<span>${esc(m.section)}</span>`:'',
    m.resource?`<span>${esc(m.resource)}</span>`:'',
    m.tactic?`<span>${esc(m.tactic)}</span>`:'',
  ].filter(Boolean).join('');
  const insightEl=document.getElementById('cohortInsight');
  insightEl.classList.remove('hidden');
  insightEl.innerHTML=insight.html;
  const ex=document.getElementById('cohortExamples');
  ex.open=false;
  document.getElementById('cohortExamplesTitle').textContent='Example debriefs';
  document.getElementById('cohortExamplesSub').textContent='Optional supporting stories behind this pattern.';
  document.getElementById('cohortCards').innerHTML=rows.length
    ?rows.map(debCardHTML).join('')
    :'<div class="empty">No matching examples in this slice yet.</div>';
  c.classList.add('on');document.body.style.overflow='hidden';c.scrollTop=0;
  observeGrow(c);
  track('plan_insight_open',m);
}
function openCohort(title,sub,rows,meta){
  const c=document.getElementById('cohort'),m=meta||{};
  document.getElementById('cohortTitle').textContent=title;
  document.getElementById('cohortSub').textContent=sub;
  document.getElementById('cohortMeta').innerHTML=[
    sampleText(rows.length,'shown'),
    m.band?`<span>${esc(m.band)}</span>`:'',
    m.section?`<span>${esc(m.section)}</span>`:'',
    m.resource?`<span>${esc(m.resource)}</span>`:'',
    m.tactic?`<span>${esc(m.tactic)}</span>`:'',
  ].filter(Boolean).join('');
  const insightEl=document.getElementById('cohortInsight');
  insightEl.classList.add('hidden');
  insightEl.innerHTML='';
  const ex=document.getElementById('cohortExamples');
  ex.open=true;
  document.getElementById('cohortExamplesTitle').textContent='Matching debriefs';
  document.getElementById('cohortExamplesSub').textContent='Open any card to read the summarized debrief and source link.';
  document.getElementById('cohortCards').innerHTML=rows.length
    ?rows.map(debCardHTML).join('')
    :'<div class="empty">No matching examples in this slice yet.</div>';
  c.classList.add('on');document.body.style.overflow='hidden';c.scrollTop=0;
  track('cohort_open',m);
}
function closeCohort(){
  const c=document.getElementById('cohort');
  c.classList.remove('on');
  if(!document.getElementById('detail').classList.contains('on'))document.body.style.overflow='';
}
function openHeatCohort(sec,label,bandKey){
  const b=bandOf(bandKey),rows=debsIn(b),pool=rowsForStrat(rows,sec,label);
  track('insight_open',{kind:'heatmap',band:b.label,tactic:label});
  openCohort(`${label} examples`,`${pool.length} ${b.label} debriefs mention this tactic. Use them as context, not causal proof.`,bestExamples(pool,12),{kind:'heatmap',band:b.label,tactic:label,sample:pool.length});
}

/* ---------- detail ---------- */
function sectionCompare(d){
  const b=BANDS.find(x=>inBand(d,x))||bandOf(state.band),peers=debsIn(b);
  const cm={q:'var(--blue)',v:'var(--violet)',di:'var(--teal)'};
  const lo=55,hi=90,scale=v=>Math.max(2,Math.min(100,Math.round(100*(v-lo)/(hi-lo))));
  const secs=[['q','Quant'],['v','Verbal'],['di','Data Insights']];
  let anyTyp=false;
  const rows=secs.map(([k,name])=>{
    const you=d[k];if(you==null)return '';
    const typ=median(peers.map(p=>p[k]).filter(x=>x!=null));
    if(typ!=null)anyTyp=true;
    return `<div class="cmp"><div class="cl">${name}${typ!=null?`<small>typical ${Math.round(typ)}</small>`:''}</div>
      <div class="ctrack"><div class="cbar" style="--w:${scale(you)}%;background:${cm[k]}"></div>
        ${typ!=null?`<span class="ctyp" style="left:${scale(typ)}%"></span>`:''}</div>
      <div class="cscore" style="color:${cm[k]}">${you}</div></div>`;}).join('');
  return rows?`<div class="panel dsection"><h3>Section scores <span class="hint">your result vs a typical ${b.label} debrief</span></h3>
    <div class="seccompare" style="margin-top:16px">${rows}</div>
    ${anyTyp?'<div class="cmpkey"><i></i> marks the typical score in this range</div>':''}</div>`:'';
}
function timelineSVG(det){
  const tl=(det.timeline||[]).filter(p=>p.score!=null);
  if(tl.length<2)return '';
  const W=760,H=320,padL=48,padR=30,padT=38,padB=48,xs=(i)=>padL+i*(W-padL-padR)/(tl.length-1);
  const vals=tl.map(p=>p.score),rawLo=Math.min(...vals),rawHi=Math.max(...vals),mid=(rawLo+rawHi)/2;
  const span=Math.max(60,rawHi-rawLo+36),lo=Math.max(400,Math.floor((mid-span/2)/10)*10),hi=Math.ceil((mid+span/2)/10)*10;
  const ys=(v)=>H-padB-(v-lo)/(hi-lo)*(H-padT-padB);
  const pts=tl.map((p,i)=>[xs(i),ys(p.score)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=`${line} L ${pts[pts.length-1][0].toFixed(1)} ${H-padB} L ${pts[0][0].toFixed(1)} ${H-padB} Z`;
  const ticks=[lo,Math.round((lo+hi)/20)*10,hi].filter((v,i,a)=>a.indexOf(v)===i);
  const grid=ticks.map(v=>`<line class="timelinegrid" x1="${padL}" x2="${W-padR}" y1="${ys(v).toFixed(1)}" y2="${ys(v).toFixed(1)}"/><text class="dlabel" x="10" y="${(ys(v)+4).toFixed(1)}">${v}</text>`).join('');
  const dots=pts.map((p,i)=>`<circle class="timelinepoint" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7"/><text class="timelabel" x="${p[0].toFixed(1)}" y="${Math.max(15,p[1]-14).toFixed(1)}" text-anchor="middle">${tl[i].score}</text>`).join('');
  return `<div class="panel dsection timelinecard"><h3>Score path over ${tl.length} attempts</h3>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="margin-top:8px" role="img" aria-label="Score path over attempts">
      ${grid}<path class="timelinearea" d="${area}"/><path class="timelinepath" d="${line}"/>${dots}</svg></div>`;
}
function openDebrief(id,push){
  if(push){nav('/debrief/'+id);return;}  /* the route is the source of truth */
  const d=DEB.find(x=>x.id===id);if(!d)return;
  const det=DETAILS[id]||{};
  const cm={Q:'var(--blue)',V:'var(--violet)',DI:'var(--teal)',G:'var(--primary)'};
  const cml={Q:'var(--blue-l)',V:'var(--violet-l)',DI:'var(--teal-l)',G:'var(--primary-l)'};
  const meta=[];
  if(d.prep_weeks)meta.push(`<span class="m"><b>${d.prep_weeks}</b> weeks prep</span>`);
  if(d.attempts)meta.push(`<span class="m"><b>${d.attempts}</b> attempt${d.attempts>1?'s':''}</span>`);
  if(d.gain&&d.start)meta.push(`<span class="m"><b>${d.start} → ${d.total}</b></span>`);
  meta.push(`<span class="m">${esc(d.source)}</span>`);

  const overall=(det.overall||[]);
  const overallHTML=overall.length?`<div class="panel dsection"><h3>How they approached it</h3>
    <ul class="notelist" style="margin-top:12px">${overall.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';

  const secBlocks=['Q','V','DI'].map(s=>{
    const tac=(det.tactics&&det.tactics[s])||[],notes=(det.sections&&det.sections[s])||[];
    if(!tac.length&&!notes.length)return '';
    const tacH=tac.length?`<div class="tacwrap" style="margin-top:6px">${tac.map(t=>`<span class="tacchip" style="background:${cml[s]};color:${cm[s]}"><span style="width:6px;height:6px;border-radius:50%;background:${cm[s]}"></span>${esc(t)}</span>`).join('')}</div>`:'';
    const noteH=notes.length?`<ul class="notelist" style="margin-top:12px;--bullet:${cm[s]}">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:'';
    return `<div style="margin-top:18px"><h3 style="font-size:15px;color:${cm[s]}">${s==='DI'?'Data Insights':SECNAME[s]}</h3>${tacH}${noteH}</div>`;
  }).join('');
  const secWrap=secBlocks.trim()?`<div class="panel dsection"><h3>Section by section</h3>${secBlocks}</div>`:'';

  const resH=(d.resources||[]).length?`<div class="panel dsection"><h3>Resources used</h3>
    <div class="reslist" style="margin-top:12px">${d.resources.map(r=>`<span class="reschip"><span class="d"></span>${esc(r)}</span>`).join('')}</div></div>`:'';

  document.getElementById('detailBody').innerHTML=`
    <div class="dhero">
      <div class="dscore"><span class="big">${d.total}<small>/ 805</small></span>
        ${(d.tags||[]).map(t=>t==='Maybe Promo'?'<span class="tag promo">Maybe promo</span>':t==='Self Study'?'<span class="tag self">Self study</span>':'').join('')}
        <button class="savebtn ${isSaved(id)?'on':''}" id="saveBtn-${id}" onclick="toggleSave('${id}')" style="margin-left:auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 3.5h12V21l-6-4.2L6 21z"/></svg>
          <span>${isSaved(id)?'Saved':'Save'}</span></button></div>
      <h1>${esc(d.title)}</h1>
      <div class="dmeta">${meta.join('')}</div>
    </div>
    ${det.overview?`<p style="font-size:16px;color:var(--ink-2);max-width:64ch;margin:6px 0 4px;line-height:1.6">${esc(det.overview)}</p>`:''}
    ${sectionCompare(d)}
    ${timelineSVG(det)}
    ${overallHTML}
    ${secWrap}
    ${resH}
    <div class="dsection" style="margin-bottom:50px">
      <a class="origin" href="${esc(d.permalink)}" target="_blank" rel="noopener" onclick="track('origin_click',{id:'${d.id}'})">
        Read the full post on ${esc(d.source)}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 17L17 7M7 7h10v10"/></svg></a>
    </div>`;
  const dt=document.getElementById('detail');
  dt.classList.add('on');document.body.style.overflow='hidden';
  dt.scrollTop=0;
  observeGrow(dt);
  track('debrief_open',{id,score:d.total,source:d.source});
}
function closeDebrief(){
  if(_detailPushed){history.back();}  /* popstate → applyRoute closes the overlay */
  else nav(_lastBasePath||'/explore',{replace:true});
}
function doClose(){
  const dt=document.getElementById('detail');
  if(!dt.classList.contains('on'))return;
  dt.classList.remove('on');
  document.body.style.overflow=document.getElementById('cohort').classList.contains('on')?'hidden':'';
  setTimeout(()=>{if(!dt.classList.contains('on'))document.getElementById('detailBody').innerHTML='';},300);
}

/* ---------- views + routing ---------- */
function initExplore(){
  if(exploreInit)return;exploreInit=true;
  const q=document.getElementById('xq');let qt;
  if(q)q.oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>{xq=e.target.value.trim();xLimit=12;renderXBrowse(xFiltered());},160);};
  const so=document.getElementById('xsort');
  if(so)so.onchange=e=>{xsort=e.target.value;xLimit=12;renderXBrowse(xFiltered());track('x_sort',{by:xsort});};
  renderFilterBar();renderExplore();
  observeGrow(document.getElementById('view-explore'));
}
/* ================= v.20 ROUTER — real paths, pushState, back/forward ================= */
const FILE_MODE=location.protocol==='file:';
const CUR_SLUG={c1:'under-605',c2:'605',c3:'655',c4:'695-plus'};
const TGT_SLUG={b1:'655',b2:'705',b3:'755'};
const WK_SLUG={w1:'under-4-weeks',w2:'4-7-weeks',w3:'8-12-weeks',w4:'13-plus-weeks'};
const FOCUS_SLUG={q:'quant',v:'verbal',di:'data-insights',timing:'timing',unsure:'not-sure'};
const BAND_SLUG={b1:'655-695',b2:'705-745',b3:'755-805'};
let currentView='path',currentMeSub=null,_lastBasePath=null,_lastBaseSig=null,_detailPushed=false,_firstRoute=true;

function keyBySlug(map,slug){for(const k in map)if(map[k]===slug)return k;return null;}
function planComplete(){return !!(plan.cur&&plan.tgt&&plan.wk&&plan.focus);}
function planPath(){return '/path/'+CUR_SLUG[plan.cur]+'-to-'+TGT_SLUG[plan.tgt]+'/'+WK_SLUG[plan.wk]+'/'+FOCUS_SLUG[plan.focus||'unsure'];}
function bandBySlug(slug){
  let k=keyBySlug(BAND_SLUG,slug);
  if(!k){const lo=parseInt(slug,10);const b=BANDS.find(x=>x.lo===lo);if(b)k=b.key;} /* accepts /explore/705 and /explore/705-anything */
  return k?bandOf(k):null;
}
function currentPath(){
  if(FILE_MODE)return location.hash.replace(/^#/,'')||'/';
  let p=location.pathname||'/';
  if(/\.html$/i.test(p))p='/';
  return p;
}
function parseRoute(){
  const raw=currentPath().split('/').filter(Boolean).map(decodeURIComponent);
  const segs=raw.map(s=>s.toLowerCase());
  const r={view:'path',plan:null,band:null,debrief:null,meSub:null};
  if(!segs.length)return r;
  if(segs[0]==='debrief'&&raw[1]){r.view='debrief';r.debrief=raw[1];return r;}
  if(segs[0]==='explore'){r.view='explore';if(segs[1])r.band=bandBySlug(segs[1]);return r;}
  if(segs[0]==='about'){r.view='about';return r;}
  if(segs[0]==='terms'){r.view='terms';return r;}
  if(segs[0]==='privacy'){r.view='privacy';return r;}
  if(segs[0]==='auth'){r.view='auth';r.authSub=segs[1]||'';return r;}
  if(segs[0]==='admin'){r.view='admin';r.adminSub=(segs[1]==='funnels'?'events':segs[1])||'';return r;}
  if(segs[0]==='me'){r.view='me';if(segs[1]==='progress'||segs[1]==='saved')r.meSub=segs[1];return r;}
  if(segs[0]==='path'&&segs[1]&&segs[1].includes('-to-')){
    const i=segs[1].lastIndexOf('-to-');
    const cur=keyBySlug(CUR_SLUG,segs[1].slice(0,i)),tgt=keyBySlug(TGT_SLUG,segs[1].slice(i+4));
    const wk=segs[2]?keyBySlug(WK_SLUG,segs[2]):null,f=segs[3]?keyBySlug(FOCUS_SLUG,segs[3]):null;
    if(cur&&tgt)r.plan={cur,tgt,wk:wk||'w3',focus:f||'unsure'};
  }
  return r;
}
function baseSig(r){
  if(r.view==='path')return 'path|'+(r.plan?[r.plan.cur,r.plan.tgt,r.plan.wk,r.plan.focus].join('-'):'intake');
  if(r.view==='explore')return 'explore|'+(r.band?r.band.key:'');
  if(r.view==='me')return 'me|'+(r.meSub||'');
  if(r.view==='admin')return 'admin|'+(r.adminSub||'');
  return r.view;
}
function routeTitle(r){
  if(r.view==='debrief'){const d=DEB.find(x=>x.id===r.debrief);
    return d?d.total+' GMAT debrief — PrepSignals':'PrepSignals';}
  if(r.view==='explore')return r.band?'Explore '+r.band.label+' — PrepSignals':'Explore the data — PrepSignals';
  if(r.view==='about')return 'About — PrepSignals';
  if(r.view==='terms')return 'Terms of Service — PrepSignals';
  if(r.view==='privacy')return 'Privacy Policy — PrepSignals';
  if(r.view==='admin')return 'Admin — PrepSignals';
  if(r.view==='me')return r.meSub==='progress'?'Progress log — PrepSignals':r.meSub==='saved'?'Saved debriefs — PrepSignals':'Workspace — PrepSignals';
  if(r.plan){const c=curBucketOf(r.plan.cur),b=bandOf(r.plan.tgt);
    if(c&&b)return c.label+' → '+b.label+' score path — PrepSignals';}
  return 'PrepSignals — your personal GMAT score plan';
}
function writeURL(path,replace){
  if(FILE_MODE){ /* opened as a local file: fall back to #/hash routing */
    if(replace)location.replace(location.pathname+location.search+'#'+path);
    else location.hash=path;
    return;
  }
  try{if(replace)history.replaceState({},'',path);else history.pushState({},'',path);}catch(e){}
}
function nav(path,opts){
  opts=opts||{};
  writeURL(path,opts.replace);
  if(!FILE_MODE)applyRoute();  /* FILE_MODE: the hashchange event triggers applyRoute */
}
function applyRoute(){
  let r=parseRoute();
  closeCohort();
  if(r.view==='debrief'){
    if(!DEB.some(x=>x.id===r.debrief)){nav('/explore',{replace:true});return;}
    document.title=routeTitle(r);
    if(_firstRoute){showView('explore');_lastBaseSig='explore|';_lastBasePath='/explore';}
    _detailPushed=!_firstRoute;
    _firstRoute=false;
    openDebrief(r.debrief,false);
    return;
  }
  doClose();
  /* /auth/confirm and /auth/reset are side-effect routes: land on /me, let auth.js take over */
  if(r.view==='auth'){
    const sub=r.authSub;
    writeURL('/me',true);
    if(typeof onAuthDeepLink==='function')onAuthDeepLink(sub);
    r=parseRoute();
  }
  /* canonicalize bare / and /path: a complete plan gets its shareable URL back */
  if(r.view==='path'){
    if(r.plan){plan={cur:r.plan.cur,tgt:r.plan.tgt,wk:r.plan.wk,focus:r.plan.focus};showIntakeForm=false;savePlanLS();}
    else if(planComplete()&&!showIntakeForm)writeURL(planPath(),true);
    else if(currentPath()!=='/path')writeURL('/path',true);
    r=parseRoute();
  }
  document.title=routeTitle(r);
  const sig=baseSig(r);
  if(sig!==_lastBaseSig){ /* skip re-render when only an overlay opened/closed above this view */
    if(r.view==='explore'){
      if(r.band&&!(xf.bands.size===1&&xf.bands.has(r.band.key))){
        xf.bands=new Set([r.band.key]);state.band=r.band.key;xLimit=12;
        if(exploreInit){renderFilterBar();renderExplore();}
      }
      showView('explore');
    }else if(r.view==='me'){
      showView('me');renderMe(r.meSub);
    }else if(r.view==='admin'){
      showView('admin');if(typeof renderAdmin==='function')renderAdmin(r.adminSub);
    }else if(r.view==='terms'||r.view==='privacy'){
      showView(r.view);
    }else if(r.view==='about'){
      showView('about');if(!_firstRoute)track('about_open',{});
    }else{
      showView('path');
    }
    if(!_firstRoute)scrollTo(0,0);
  }
  _lastBaseSig=sig;
  _lastBasePath=currentPath();
  _firstRoute=false;
}
function syncExploreURL(){ /* keep the URL honest as filters change: one band ⇒ /explore/<band> */
  if(currentView!=='explore')return;
  if(parseRoute().view==='debrief')return; /* explore is only the base under a debrief overlay — keep its URL */
  const want=xf.bands.size===1?'/explore/'+BAND_SLUG[[...xf.bands][0]]:'/explore';
  if(currentPath()!==want){
    writeURL(want,true);
    const r=parseRoute();
    document.title=routeTitle(r);
    _lastBaseSig=baseSig(r);
    _lastBasePath=want;
  }
}
const VIEWS=['path','explore','me','about','terms','privacy','admin'];
function showView(v){
  currentView=v;
  VIEWS.forEach(k=>{
    const el=document.getElementById('view-'+k);
    if(el){
      const active=k===v;
      el.classList.toggle('hidden',!active);
      el.hidden=!active;
      el.setAttribute('aria-hidden',active?'false':'true');
      if(active)el.removeAttribute('inert');else el.setAttribute('inert','');
    }
    const nb=document.getElementById('nav-'+k);if(nb)nb.classList.toggle('on',k===v);
  });
  if(v==='explore')initExplore();
  if(v==='path')renderPlanView();
}
/* intercept in-app links; real hrefs keep cmd/ctrl-click and open-in-new-tab working */
document.addEventListener('click',e=>{
  const a=e.target.closest('a[data-nav]');
  if(!a)return;
  if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.defaultPrevented||e.button!==0)return;
  e.preventDefault();
  nav(a.getAttribute('href'));
});
if(FILE_MODE)window.addEventListener('hashchange',applyRoute);
else window.addEventListener('popstate',applyRoute);

/* re-render explore charts when crossing the compact breakpoint on resize/rotate */
let _rsz;
window.addEventListener('resize',()=>{clearTimeout(_rsz);_rsz=setTimeout(()=>{
  if(exploreInit&&!document.getElementById('view-explore').classList.contains('hidden'))renderExplore();
  if(planAnalyticsShown())renderPlanAnalytics();
},220);});

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.getElementById('detail').classList.contains('on'))closeDebrief();
  else if(document.getElementById('cohort').classList.contains('on'))closeCohort();
});

/* ================= WORKSPACE — local-first library (no account required) ================= */
const LS_SAVED='ps_saved_v1',LS_PROG='ps_progress_v1';
let _toastT;
function toast(msg){
  const t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.classList.add('on');
  clearTimeout(_toastT);_toastT=setTimeout(()=>t.classList.remove('on'),2600);
}
function loadSaved(){try{const a=JSON.parse(localStorage.getItem(LS_SAVED));
  return Array.isArray(a)?a.filter(id=>DEB.some(d=>d.id===id)):[];}catch(e){return [];}}
function saveSaved(a){try{localStorage.setItem(LS_SAVED,JSON.stringify(a));}catch(e){}}
function isSaved(id){return loadSaved().includes(id);}
function toggleSave(id){
  if(!requireAuth('save_debrief','Create account to save debriefs','Save this debrief to a synced reading list.',{saveId:id}))return;
  let a=loadSaved();const was=a.includes(id);
  a=was?a.filter(x=>x!==id):[id].concat(a);
  saveSaved(a);
  try{cloudSaveDebrief(id,!was);}catch(e){}
  const btn=document.getElementById('saveBtn-'+id);
  if(btn){btn.classList.toggle('on',!was);const sp=btn.querySelector('span');if(sp)sp.textContent=was?'Save':'Saved';}
  if(currentView==='me'&&currentMeSub==='saved')renderMe('saved');
  toast(was?'Removed from your saved debriefs':(typeof cloudOK==='function'&&cloudOK()?'Saved to your account — find it in Workspace':'Saved — find it in Workspace'));
  track('save_toggle',{id,on:!was});
}
function unsaveFromList(id){toggleSave(id);}
function loadProg(){try{const a=JSON.parse(localStorage.getItem(LS_PROG));
  return Array.isArray(a)?a.filter(x=>x&&x.total):[];}catch(e){return [];}}
function saveProg(a){try{localStorage.setItem(LS_PROG,JSON.stringify(a));}catch(e){}}
function addProgress(){
  if(!requireAuth('progress','Create account to save scores','Log mocks and official scores across devices.'))return;
  const g=id=>document.getElementById(id);
  const total=parseInt(g('pgTotal').value,10);
  if(!(total>=205&&total<=805)){toast('Total score should be between 205 and 805');return;}
  const sec=k=>{const v=parseInt(g(k).value,10);return v>=60&&v<=90?v:null;};
  const e={date:g('pgDate').value||new Date().toISOString().slice(0,10),
    kind:g('pgKind').value==='official'?'official':'mock',
    total,q:sec('pgQ'),v:sec('pgV'),di:sec('pgDI')};
  const a=loadProg();a.push(e);a.sort((x,y)=>String(x.date).localeCompare(String(y.date)));saveProg(a);
  try{cloudSaveProgress();}catch(e2){}
  track('progress_add',{kind:e.kind,total:e.total,n:a.length});
  toast('Logged');
  renderMe('progress');
}
function delProgress(i){const a=loadProg();a.splice(i,1);saveProg(a);try{cloudSaveProgress();}catch(e){}renderMe('progress');}
function fmtDate(s){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));if(!m)return esc(String(s||''));
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2]-1]+' '+(+m[3]);
}
const ARROW_SM='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const CHECK_SM='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';
function renderMe(sub){
  currentMeSub=sub||null;
  const el=document.getElementById('meBody');if(!el)return;
  const gate=(typeof meAuthGateHTML==='function')?meAuthGateHTML(sub):null;
  el.innerHTML=gate?gate:(sub==='progress'?meProgressHTML():sub==='saved'?meSavedHTML():meHomeHTML());
  if(sub==='progress'){const d=document.getElementById('pgDate');if(d&&!d.value)d.value=new Date().toISOString().slice(0,10);}
  observeGrow(el);
}
function meHomeHTML(){
  const saved=loadSaved(),prog=loadProg(),has=planComplete();
  const b=has?bandOf(plan.tgt):null,c=has?curBucketOf(plan.cur):null,wk=has?wkBucketOf(plan.wk):null,f=has?focusOf(plan.focus):null;
  const done=has?loadChecks().filter(Boolean).length:0;
  const last=prog.length?prog[prog.length-1]:null;
  const planCard=has
    ?`<a class="mecard rise" href="${planPath()}" data-nav style="--mc:var(--primary);--mcl:var(--primary-l)">
        <span class="k">Score path</span>
        <h3>${esc(c.label)} → ${esc(b.label)}</h3>
        <p>${esc(f.label)} focus · ${esc(wk.label.toLowerCase())} until test day. Your plan has its own link — bookmark or share it.</p>
        <span class="foot">Open my plan ${ARROW_SM}</span></a>`
    :`<a class="mecard rise" href="/path" data-nav style="--mc:var(--primary);--mcl:var(--primary-l)">
        <span class="k">Score path</span>
        <h3>No score path yet</h3>
        <p>Four quick taps and we match you with real stories from people who made your exact jump.</p>
        <span class="foot">Build my plan ${ARROW_SM}</span></a>`;
  const checkCard=has
    ?`<a class="mecard rise" href="${planPath()}" data-nav style="--mc:var(--green);--mcl:var(--green-l)">
        <span class="k">First week</span>
        <h3>${done} of 4 done</h3>
        <p>Your week-one checklist, built from what worked for people on your path. Progress stays synced.</p>
        <span class="foot">Open the checklist ${ARROW_SM}</span></a>`
    :`<a class="mecard rise" href="/path" data-nav style="--mc:var(--green);--mcl:var(--green-l)">
        <span class="k">First week</span>
        <h3>Unlocks with your plan</h3>
        <p>Build your score path first — a four-task first week comes with it.</p>
        <span class="foot">Start ${ARROW_SM}</span></a>`;
  const savedCard=`<a class="mecard rise" href="${saved.length?'/me/saved':'/explore'}" data-nav style="--mc:var(--amber);--mcl:var(--amber-l)">
        <span class="k">Saved debriefs</span>
        <h3>${saved.length?saved.length+' saved':'Nothing saved yet'}</h3>
        <p>${saved.length?'Your reading list of debriefs worth revisiting.':'Tap Save on any debrief to build a reading list for later.'}</p>
        <span class="foot">${saved.length?'Open saved':'Find stories'} ${ARROW_SM}</span></a>`;
  const progCard=`<a class="mecard rise" href="/me/progress" data-nav style="--mc:var(--coral);--mcl:var(--coral-l)">
        <span class="k">Progress log</span>
        <h3>${last?last.total+' · '+fmtDate(last.date):'No scores logged'}</h3>
        <p>${prog.length?prog.length+(prog.length===1?' entry':' entries')+' — log every mock to see your trend.':'Log your mocks and official scores to watch the line move.'}</p>
        <span class="foot">${prog.length?'Open the log':'Log a score'} ${ARROW_SM}</span></a>`;
  const avatar=(typeof isLoggedIn==='function'&&isLoggedIn()&&typeof accountInitial==='function')?`<span class="meavatar" aria-hidden="true">${esc(accountInitial())}</span>`:'';
  return `<section class="mehead"><div class="mehero">${avatar}<div><h1>Workspace</h1>
      <p>${meHeadSub()}</p></div></div></section>
    ${mePrepStageHTML()}
    <div class="megrid">${planCard}${checkCard}${savedCard}${progCard}</div>
    ${meRecsHTML()}
    ${meAccountHTML()}
    <div style="height:46px"></div>`;
}
function meSavedHTML(){
  const saved=loadSaved(),has=planComplete();
  const b=has?bandOf(plan.tgt):null,c=has?curBucketOf(plan.cur):null;
  const planRow=has?`<div class="synccard" style="margin-top:18px">
      <span class="sico">${CHECK_SM}</span>
      <span class="grow"><b>Saved score path:</b> ${esc(c.label)} → ${esc(b.label)}.</span>
      <a href="${planPath()}" data-nav>Open plan</a></div>`:'';
  const cells=saved.map(id=>{const d=DEB.find(x=>x.id===id);if(!d)return '';
    return `<div class="savedcell rise">${debCardHTML(d)}
      <button class="unsave" onclick="unsaveFromList('${id}')" aria-label="Remove from saved">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;}).join('');
  return `<a class="mecrumb" href="/me" data-nav>← Workspace</a>
    <section class="mehead" style="padding-top:18px"><h1>Saved debriefs</h1>
      <p>Debriefs you bookmarked to revisit${(typeof cloudOK==='function'&&cloudOK())?' — synced to your account':''}.</p></section>
    ${planRow}
    ${saved.length?`<div class="savedgrid">${cells}</div>`
      :`<div class="panel meempty" style="margin-top:18px"><div class="big">🔖</div>
        Nothing saved yet. Open any debrief and tap <b>Save</b> — it lands here.<br><br>
        <a class="morebtn" href="/explore" data-nav style="margin-top:0">Explore the data ${ARROW_SM}</a></div>`}
    <div style="height:46px"></div>`;
}
function meProgressHTML(){
  const a=loadProg();
  const entries=a.map((e,i)=>({e,i})).reverse().map(({e,i})=>{
    const secs=[['q','Q'],['v','V'],['di','DI']].map(([k,lab])=>e[k]?`<b>${e[k]}</b> ${lab}`:'').filter(Boolean).join(' · ');
    return `<div class="pentry">
      <span class="pscore">${e.total}</span>
      <span class="pkind ${e.kind==='official'?'official':'mock'}">${e.kind==='official'?'Official':'Mock'}</span>
      <span class="pmeta">${fmtDate(e.date)}${secs?' · '+secs:''}</span>
      <button class="pdel" onclick="delProgress(${i})" aria-label="Delete entry">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"/></svg></button>
    </div>`;}).join('');
  let target='';
  if(planComplete()&&a.length){
    const b=bandOf(plan.tgt),lastT=a[a.length-1].total,diff=b.lo-lastT;
    target=`<div class="takeaway" style="margin-top:14px"><span class="tico">✦</span><span>${
      diff>0?`Latest score <b>${lastT}</b> — <b>${diff} points</b> below your ${esc(b.label)} target band.`
      :lastT>b.hi?`Latest score <b>${lastT}</b> — above your ${esc(b.label)} target band. Time to raise the target?`
      :`Latest score <b>${lastT}</b> — inside your ${esc(b.label)} target band. Hold your level.`}</span></div>`;
  }
  return `<a class="mecrumb" href="/me" data-nav>← Workspace</a>
    <section class="mehead" style="padding-top:18px"><h1>Progress log</h1>
      <p>Log every mock and official score. The trend matters more than any single number.</p></section>
    <div class="panel" style="margin-top:16px">
      <h3>Log a score</h3>
      <p class="psub">Total is required; section splits are optional.</p>
      <div class="pform">
        <label class="pfield">Date<input type="date" id="pgDate"></label>
        <label class="pfield">Type<select id="pgKind"><option value="mock">Mock</option><option value="official">Official</option></select></label>
        <label class="pfield">Total<input type="number" id="pgTotal" min="205" max="805" step="10" placeholder="645" inputmode="numeric"></label>
        <label class="pfield">Q<input type="number" id="pgQ" min="60" max="90" placeholder="—" inputmode="numeric"></label>
        <label class="pfield">V<input type="number" id="pgV" min="60" max="90" placeholder="—" inputmode="numeric"></label>
        <label class="pfield">DI<input type="number" id="pgDI" min="60" max="90" placeholder="—" inputmode="numeric"></label>
      </div>
      <button class="paddbtn" style="margin-top:12px;width:100%" onclick="addProgress()">Add to my log</button>
      ${target}
    </div>
    ${a.length>=2?progressChartHTML(a):''}
    ${a.length?`<div class="panel" style="margin-top:16px"><h3>${a.length} ${a.length===1?'entry':'entries'}</h3>
      <p class="psub">Newest first. Entries save in this browser.</p>
      <div class="pentries">${entries}</div></div>`
      :`<div class="panel meempty" style="margin-top:16px"><div class="big">📈</div>
        No entries yet. Log your latest mock above — two entries draw your trend line.</div>`}
    <div class="synccard"><span class="sico">${CHECK_SM}</span>
      <span class="grow">${(typeof cloudOK==='function'&&cloudOK())?'<b>Your progress log is saved to your account</b> — the trend follows you across devices.':'<b>Your progress log is saved on this device.</b>'}</span></div>
    <div style="height:46px"></div>`;
}
function progressChartHTML(a){
  const W=760,H=300,padL=48,padR=30,padT=36,padB=44;
  const xs=i=>padL+i*(W-padL-padR)/(a.length-1);
  const vals=a.map(e=>e.total),rawLo=Math.min(...vals),rawHi=Math.max(...vals),mid=(rawLo+rawHi)/2;
  const span=Math.max(60,rawHi-rawLo+36);
  const lo=Math.max(205,Math.floor((mid-span/2)/10)*10),hi=Math.min(805,Math.ceil((mid+span/2)/10)*10);
  const ys=v=>H-padB-(v-lo)/((hi-lo)||1)*(H-padT-padB);
  const pts=a.map((e,i)=>[xs(i),ys(e.total)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+' L '+pts[pts.length-1][0].toFixed(1)+' '+(H-padB)+' L '+pts[0][0].toFixed(1)+' '+(H-padB)+' Z';
  const ticks=[lo,Math.round((lo+hi)/20)*10,hi].filter((v,i,arr)=>arr.indexOf(v)===i);
  const grid=ticks.map(v=>`<line class="timelinegrid" x1="${padL}" x2="${W-padR}" y1="${ys(v).toFixed(1)}" y2="${ys(v).toFixed(1)}"/><text class="dlabel" x="10" y="${(ys(v)+4).toFixed(1)}">${v}</text>`).join('');
  const step=Math.max(1,Math.ceil(a.length/8));
  const xlab=pts.map((p,i)=>(i%step===0||i===a.length-1)?`<text class="dlabel" x="${p[0].toFixed(1)}" y="${H-16}" text-anchor="middle">${fmtDate(a[i].date)}</text>`:'').join('');
  const dots=pts.map((p,i)=>`<circle class="timelinepoint" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7"${a[i].kind==='official'?' style="stroke:var(--green)"':''}/><text class="timelabel" x="${p[0].toFixed(1)}" y="${Math.max(15,p[1]-14).toFixed(1)}" text-anchor="middle">${a[i].total}</text>`).join('');
  return `<div class="panel timelinecard" style="margin-top:16px"><h3>Your score trend <span class="hint">green ring = official test</span></h3>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="margin-top:8px" role="img" aria-label="Your logged scores over time">
      ${grid}<path class="timelinearea" d="${area}"/><path class="timelinepath" d="${line}"/>${dots}${xlab}</svg></div>`;
}

/* ---------- scroll-in animation ---------- */
let io;
function observeGrow(root){
  if(RM||!('IntersectionObserver' in window)){document.querySelectorAll('.bars,.dist,.seccompare,.rise').forEach(el=>el.classList.add('grown'));return;}
  if(!io)io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add('grown');io.unobserve(en.target);}}),{threshold:.18});
  (root||document).querySelectorAll('.bars,.dist,.seccompare,.rise').forEach(el=>{if(!el.classList.contains('grown'))io.observe(el);});
  /* safety net: never leave above-the-fold content invisible if IO lags */
  setTimeout(()=>{(root||document).querySelectorAll('.rise:not(.grown)').forEach(el=>{
    const r=el.getBoundingClientRect();if(r.top<innerHeight+40)el.classList.add('grown');});},1200);
}

/* ---------- init: legacy v.19 ?p / ?band / ?d deep links redirect to clean routes ---------- */
(function init(){
  if(!FILE_MODE&&'scrollRestoration' in history)history.scrollRestoration='manual';
  const saved=loadPlanLS();
  if(saved){plan=saved;showIntakeForm=false;}
  const q=new URLSearchParams(location.search);
  const pp=q.get('p');
  if(pp){
    const parts=pp.split('-');
    if((parts.length===3||parts.length===4)&&CURB.find(c=>c.key===parts[0])&&BANDS.find(b=>b.key===parts[1])&&WEEKB.find(w=>w.key===parts[2])){
      const focus=FOCUS.find(f=>f.key===parts[3])?parts[3]:'unsure';
      plan={cur:parts[0],tgt:parts[1],wk:parts[2],focus};showIntakeForm=false;savePlanLS();
      writeURL(planPath(),true);
    }
  }else if(q.get('band')){
    const b=BANDS.find(x=>String(x.lo)===q.get('band'));
    if(b)writeURL('/explore/'+BAND_SLUG[b.key],true);
  }else if(q.get('d')){
    const id=q.get('d');
    if(DEB.some(x=>x.id===id))writeURL('/debrief/'+id,true);
  }
  applyRoute();
})();

'use strict';
/* ================= v.20.2 AUTH — Supabase accounts, sync, save-gating =================
   Concatenated after app.js by build_v202.py. Everything here uses `var` +
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
  var uid=authUser.id,rows=loadProg().map(function(e){return{user_id:uid,date:e.date,kind:e.kind,total:e.total,q:e.q,v:e.v,di:e.di};});
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
      sbClient.from('progress_entries').select('date,kind,total,q,v,di').eq('user_id',uid).order('date')
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
      .map(function(e){return{user_id:uid,date:e.date,kind:e.kind,total:e.total,q:e.q,v:e.v,di:e.di};});
    if(newRows.length)await sbClient.from('progress_entries').insert(newRows);
    var localKeys=new Set(loadProg().map(key));
    var merged=loadProg().concat(cProg.filter(function(e){return !localKeys.has(key(e));}).map(function(e){
      return{date:e.date,kind:e.kind,total:e.total,q:e.q,v:e.v,di:e.di};}));
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
    el.innerHTML='<a class="userchip'+(emailVerified()?'':' unverified')+'" href="/me" data-nav title="'+esc(n)+(emailVerified()?'':' — email not verified yet')+'" aria-label="Account">'+esc(init)+'</a>';
  }else{
    el.innerHTML='<button type="button" class="loginbtn" onclick="openAuth(\'login\',\'nav\')" aria-label="Log in or create account">Log in</button>';
  }
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
      '<h3>Welcome back</h3><p class="asub">Log in to your PrepSignals workspace.</p>'+err+
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
  if(currentView==='me'||currentView==='admin')nav('/me');else refreshAuthUI();
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
    return '<div class="synccard rise"><span class="sico">'+CHECK+'</span><span class="grow"><b>Saved on this device</b> — this path has a shareable link.</span><a href="/me" data-nav>Open workspace</a></div>';
  if(isLoggedIn()&&emailVerified())
    return '<div class="synccard rise"><span class="sico">'+CHECK+'</span><span class="grow"><b>Saved to your account</b> — this path syncs across devices.</span><a href="/me" data-nav>Open workspace</a></div>';
  if(isLoggedIn())
    return '<div class="synccard rise warn"><span class="sico">!</span><span class="grow"><b>Verify your email to save this path.</b> The link is in your inbox.</span><button type="button" class="alink" onclick="openAuth(\'verify\',\'plan\')">Resend</button></div>';
  return '<div class="synccard rise cta"><span class="sico">'+CHECK+'</span><span class="grow"><b>Save this path.</b> Create a free account to sync your plan, checklist, and progress.</span><button type="button" class="syncbtn" onclick="openAuth(\'signup\',\'plan\')">Create account</button></div>';
}
function checkNoteHTML(){
  if(!accountsOn())return 'Checklist progress saves in this browser · <a href="/me" data-nav>open workspace</a>';
  if(isLoggedIn()&&emailVerified())return 'Checklist progress syncs to your account · <a href="/me" data-nav>open workspace</a>';
  return 'Create a free account to keep checklist progress · <button type="button" class="alink" onclick="openAuth(\'signup\',\'checklist\')">create account</button>';
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
  return '<section class="mehead"><h1>Workspace</h1><p>Your plan, checklist, saved debriefs and progress in one place.</p></section>'+
    '<div class="lockcard rise">'+
    '<div class="lockbadge">Free account</div>'+
    '<h3>Save your prep workspace</h3>'+
    '<p>Create a free account when you want your study data to follow you across devices.</p>'+
    '<div class="lockpreview" aria-label="Workspace preview">'+
    '<div><span>Saved</span><b>Debriefs to revisit</b></div>'+
    '<div><span>Checklist</span><b>Progress synced</b></div>'+
    '<div><span>Score log</span><b>Mocks on one trend</b></div>'+
    '</div>'+
    '<ul class="locklist">'+
    '<li><b>Score path</b> — keep your plan and reopen it anywhere</li>'+
    '<li><b>Week-one checklist</b> — checklist progress that stays synced</li>'+
    '<li><b>Saved debriefs</b> — a reading list of stories worth revisiting</li>'+
    '<li><b>Progress log</b> — every mock on one trend line</li>'+
    '<li><b>Recommendations</b> — debriefs matched to your target and weak area</li>'+
    '</ul>'+
    (hasLegacy?'<p class="locknote">You already have data saved on this device from before — it moves into your account automatically when you sign up.</p>':'')+
    '<div class="lockbtns"><button type="button" class="abtn" onclick="openAuth(\'signup\',\'me\')">Create free account</button>'+
    '<button type="button" class="alink" onclick="openAuth(\'login\',\'me\')">I already have one — log in</button></div>'+
    '</div>'+
    '<div style="height:46px"></div>';
}
function meVerifyHTML(){
  var em=(authUser&&authUser.email)||'';
  return '<section class="mehead"><h1>Workspace</h1><p>One step left before your workspace unlocks.</p></section>'+
    '<div class="lockcard rise">'+
    '<div class="lockbadge amber">Verify email</div>'+
    '<h3>Confirm '+esc(em)+' to start syncing</h3>'+
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
function meAccountHTML(){
  if(!accountsOn())
    return '<div class="acctcard rise"><h3>Use PrepSignals without an account</h3><p>You’re offline or accounts are unreachable, so everything on this page lives in this browser for now.</p></div>';
  if(!isLoggedIn())return '';
  var p=authProfile||{};
  var bandOpts=['<option value="">—</option>'].concat(BANDS.map(function(b){
    return '<option'+(p.target_score===b.label?' selected':'')+'>'+esc(b.label)+'</option>';})).join('');
  var weakOpts=['<option value="">—</option>'].concat(['Quant','Verbal','Data Insights','Timing / test day'].map(function(w){
    return '<option'+(p.weak_area===w?' selected':'')+'>'+esc(w)+'</option>';})).join('');
  var stageOpts=['<option value="">—</option>'].concat(PREP_STAGES.map(function(s){
    return '<option value="'+s[0]+'"'+(p.prep_stage===s[0]?' selected':'')+'>'+s[1]+'</option>';})).join('');
  return '<div class="panel acctpanel rise" id="acctPanel" style="margin-top:26px">'+
    '<div class="accthead"><h3>Account</h3>'+
    '<span class="verifybadge'+(emailVerified()?'':' off')+'">'+(emailVerified()?'✓ verified':'not verified')+'</span></div>'+
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
    '<button type="button" class="paddbtn" onclick="saveAccountForm()">Save account settings</button>'+
    '<button type="button" class="ghostbtn" onclick="doLogout()">Sign out</button>'+
    '<button type="button" class="dangerlink" onclick="doDeleteAccount()">Delete my account</button>'+
    '</div></div>';
}
async function saveAccountForm(){
  var g=function(id){var el=document.getElementById(id);return el?el.value:'';};
  var mkt=(document.getElementById('acMkt')||{}).checked;
  var patch={name:g('acName').trim(),target_score:g('acTarget')||null,test_month:g('acMonth')||null,
    weak_area:g('acWeak')||null,prep_stage:g('acStage')||null,marketing_opt_in:!!mkt};
  var ok=await saveProfilePatch(patch);
  track('profile_updated',{marketing_opt_in:!!mkt,has_target:!!patch.target_score,stage:patch.prep_stage||''});
  toast(ok?'Account settings saved':'Could not save — try again');
  if(ok)refreshAuthUI();
}
function meHeadSub(){
  if(cloudOK())return 'Signed in as '+esc(authUser.email)+'. Saves sync to your account.';
  return 'Your plan, checklist, saved debriefs and progress — saved in this browser.';
}

/* Escape closes the auth modal first */
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  var m=document.getElementById('authModal');
  if(m&&m.classList.contains('on')){e.stopImmediatePropagation();closeAuth();}
},true);

initAuthClient();

'use strict';
/* ================= v.20.2 ADMIN — /admin dashboard (role='admin' only) =================
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
      '<br><br>'+(isLoggedIn()?'<a class="morebtn" href="/me" data-nav style="margin-top:0">Back to Workspace</a>'
        :'<button class="morebtn" style="margin-top:0" onclick="openAuth(\'login\',\'admin\')">Log in</button>')+'</div>';
    return;
  }
  el.innerHTML=admShell('<div class="panel meempty" style="margin-top:18px"><div class="big">📊</div>Loading data…</div>');
  track('admin_view',{tab:currentAdminSub||'overview'});
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
  var tabs=[['','Overview'],['users','Users'],['content','Content'],['events','Events & funnels']];
  return '<section class="mehead" style="padding-bottom:6px"><h1>Admin</h1>'+
    '<p>Signups and saved-content live here (Supabase); behavior funnels live in <a href="'+POSTHOG_PROJECT_URL+'" target="_blank" rel="noopener">PostHog</a>.</p></section>'+
    '<div class="admtabs">'+tabs.map(function(t){
      var on=(currentAdminSub||'')===t[0]||(t[0]==='events'&&currentAdminSub==='funnels');
      return '<a href="/admin'+(t[0]?'/'+t[0]:'')+'" data-nav class="admtab'+(on?' on':'')+'">'+t[1]+'</a>';}).join('')+'</div>'+
    inner+'<div style="height:46px"></div>';
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
  ];
  var funnels=[
    'Visitor → plan completed:  $pageview → intake_submit → plan_view',
    'Plan completed → signup:  plan_view → auth_modal_open (source=plan) → signup_completed',
    'Save-click → signup:  auth_prompt (source=save_debrief) → signup_completed',
    'Return rate 1/7/30 days:  PostHog → Retention on $pageview',
    'Most-opened debriefs:  Trends on debrief_open, break down by "id"',
    'Resource interest:  Trends on x_filter / x_bar_open, break down by properties',
  ];
  return admPanel('Product events this site sends','Definitions live in app.js/auth.js; every event goes to PostHog and Vercel Analytics.',
      '<ul class="admlist">'+events.map(function(e){return '<li><code>'+esc(e[0])+'</code> — '+esc(e[1])+'</li>';}).join('')+'</ul>')
    +admPanel('Funnels to build in PostHog','One-time setup in the PostHog UI — these cover the metrics wishlist.',
      '<ul class="admlist">'+funnels.map(function(f){return '<li>'+esc(f)+'</li>';}).join('')+'</ul>'
      +'<a class="morebtn" href="'+POSTHOG_PROJECT_URL+'" target="_blank" rel="noopener" style="margin-top:14px">Open PostHog project '+ARROW_SM+'</a>')
    +admPanel('Raw data','Signups and saved rows live in Supabase; use the table editor for anything this page doesn’t show.',
      '<a class="morebtn" href="https://supabase.com/dashboard/project/vzcgjuqxwsadbpslaujr" target="_blank" rel="noopener" style="margin-top:4px">Open Supabase dashboard '+ARROW_SM+'</a>');
}
