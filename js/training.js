// Shared, read-only exercise vocabulary. Original names remain the history join keys.
let logChromeObserver=null;
function logObserveChrome(){
 const view=document.getElementById('view-log'),nav=document.getElementById('log-topnav'),header=document.querySelector('.lib-header');
 if(!view||!nav||!header) return;
 const measure=()=>{const n=nav.getBoundingClientRect().height,h=header.getBoundingClientRect().height;if(n)view.style.setProperty('--log-nav-height',n+'px');if(h)view.style.setProperty('--lib-header-height',h+'px');};
 if(!logChromeObserver&&typeof ResizeObserver!=='undefined'){
  logChromeObserver=new ResizeObserver(measure);logChromeObserver.observe(nav);logChromeObserver.observe(header);
 }
 measure();
}
function trainingSearchText(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/pull[ -]?ups?/g,'pull up').replace(/push[ -]?ups?/g,'push up')
    .replace(/chin[ -]?ups?/g,'chin up').replace(/pull[ -]?downs?/g,'pull down').replace(/dumbbells?|\bdb\b/g,'dumbbell')
    .replace(/barbells?|\bbb\b/g,'barbell').replace(/\brdl\b/g,'romanian deadlift')
    .replace(/\b(rows|curls|squats|raises|extensions)\b/g,w=>w.slice(0,-1)).replace(/\bpresses\b/g,'press').replace(/\bflies\b/g,'fly')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function trainingMuscleKey(value){
  const key=String(value||'').trim().toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
  const aliases={abs:'core',abdominals:'core',abdominal:'core',pecs:'chest',pectorals:'chest',
    shoulder:'shoulders',delts:'shoulders',deltoids:'shoulders',bicep:'arms',biceps:'arms',tricep:'arms',triceps:'arms',arm:'arms',
    quadriceps:'quads',quad:'quads',hamstring:'hamstrings',calf:'calves',glute:'glutes',forearm:'forearms',
    'low back':'lower back',lowerback:'lower back',lats:'back',lat:'back',leg:'legs','lower body':'legs'};
  return Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:(key||'other');
}
function trainingMuscle(ex){
  const key=trainingMuscleKey(ex&&ex.muscle);
  // Old "legs" entries predate the split into specific groups; an unresolved one stays Legs.
  if(key==='legs'){
    const inferred=libGuessMuscle(ex.name);
    return inferred==='other'?'legs':inferred;
  }
  return ex&&ex.muscle?key:libGuessMuscle(ex&&ex.name);
}
function trainingFilterExercises(catalog,query,muscle){
  const q=trainingSearchText(query), words=q.split(' ').filter(Boolean);
  return catalog.filter(e=>{
    const group=trainingMuscle(e);
    if(muscle&&muscle!=='all'&&group!==muscle) return false;
    const hay=trainingSearchText(e.name+' '+group);
    return words.every(w=>hay.includes(w));
  }).slice().sort((a,b)=>{
    const score=e=>{const n=trainingSearchText(e.name);return n===q?0:n.startsWith(q)?1:2;};
    return (q?score(a)-score(b):0)||a.name.localeCompare(b.name,undefined,{sensitivity:'base'});
  });
}
function exerciseSearchCatalog(){
  const lib=loadExerciseLib(), hidden=new Set(loadLibHidden()), names=new Set(), out=[];
  const add=e=>{
    if(!e||typeof e.name!=='string'||!e.name.trim()) return;
    const key=e.name.trim().toLowerCase();
    const id=e.id||'ex_def_'+e.name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
    if(names.has(key)||hidden.has(id)) return;
    names.add(key);out.push({...e,id,muscle:trainingMuscle(e)});
  };
  lib.forEach(add);
  Object.values(dayCustom||{}).forEach(c=>(c.added||[]).forEach(add));
  (S.sessionAdds||[]).forEach(add);
  // Recent metadata wins for entries no longer in the split or custom library.
  (S.sessions||[]).slice().reverse().forEach(s=>(s.exercises||[]).forEach(add));
  Object.values(S.swaps||{}).forEach(name=>add({name}));
  return out;
}
function trainingCoverageModel(exercises,sessions,today,mode){
  const groups=Object.create(null), rows=[];let inferred=0;
  const add=(ex,sets,date,planned)=>{
    if(!sets) return;
    const muscle=planned?trainingMuscle(ex):(ex.muscle?trainingMuscleKey(ex.muscle):libGuessMuscle(ex.name));
    groups[muscle]=(groups[muscle]||0)+sets;
    rows.push({name:ex.name,muscle,sets,date:date||'',planned});
    if(!ex.muscle||ex.muscleSource==='inferred') inferred+=sets;
  };
  if(mode==='week'){
    const d=new Date(today+'T12:00:00');d.setDate(d.getDate()-6);
    const from=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    (sessions||[]).forEach(s=>{
      if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||s.date<from||s.date>today||s.deletedAt) return;
      (s.exercises||[]).filter(Boolean).forEach(ex=>add(ex,(ex.sets||[]).filter(statsIsWorkingSet).length,s.date,false));
    });
  }else{
    (exercises||[]).forEach(ex=>add(ex,Math.max(1,parseInt(ex.sets)||1),'',true));
  }
  return {groups,rows,inferred,total:Object.values(groups).reduce((n,v)=>n+v,0)};
}

let logCoverageMode='workout',logCoverageMuscle='',swapTargetName='',swapTargetDay=-1,swapPointerActive=false;
function logSetCoverage(mode){
  if(mode==='week'||mode==='workout') logCoverageMode=mode;
  logCoverageMuscle='';renderLogCoverage();
}
function logSelectMuscle(muscle){ logCoverageMuscle=muscle;renderLogCoverage(); }
function logCoverageExercises(b){
  const idx=b.state==='saved'?b.nextIdx:b.dayIdx;
  let exs=[];try{exs=type(idx).exercises;}catch(e){}
  const lib=exerciseSearchCatalog();
  return exs.map(ex=>{
    const name=dn(ex.name),match=lib.find(e=>e.name===name);
    return {...ex,name,muscle:match?match.muscle:libGuessMuscle(name)};
  });
}
function logBodySvg(model,back,options){
  options=options||{};
  const selectedMuscle=options.selected==null?logCoverageMuscle:options.selected;
  const recorded=options.recorded||logCoverageMode==='week';
  const action=options.sessionKey==null?'logSelectMuscle(this.dataset.muscle)':'logHistorySelectMuscle(this.dataset.sessionKey,this.dataset.muscle,this)';
  const context=options.sessionKey==null?'':' data-session-key="'+escAttr(options.sessionKey)+'"';
  const pair=d=>[d,{d,mirror:true}];
  const shapes={
    shoulders:pair('M57 68 C48 67 40 74 39 84 C38 91 41 97 47 98 C52 89 57 83 63 79Z'),
    arms:pair(back?'M40 97 C46 99 49 98 52 94 C51 108 49 121 44 131 C38 128 35 119 36 111Z':'M41 98 C46 100 50 96 53 92 C54 106 49 123 43 131 C37 126 36 115 38 106Z'),
    forearms:pair('M35 132 C39 135 42 135 44 132 C43 144 37 161 29 177 L23 176 C25 161 29 145 35 132Z'),
    calves:['M62 268 C64 262 69 261 72 265 C77 278 75 295 72 308 L69 326 C65 318 63 302 62 291Z',
      ...pair('M75 267 C78 262 81 265 82 272 C82 287 78 303 75 318 L73 328 C71 313 76 293 74 282Z'),
      {d:'M62 268 C64 262 69 261 72 265 C77 278 75 295 72 308 L69 326 C65 318 63 302 62 291Z',mirror:true}]
  };
  if(back){
    shapes.back=[
      ...pair('M81 61 L89 63 88 98 C77 94 66 83 61 72Z'),
      ...pair('M59 83 C66 88 77 99 87 103 L87 138 C76 135 66 126 61 115 C57 105 55 94 59 83Z'),
      ...pair('M61 117 C67 127 77 139 86 142 L83 157 65 155Z')
    ];
    shapes['lower back']=pair('M87 141 L89 159 87 174 78 168 68 167 66 158 C76 160 83 155 87 141Z');
    shapes.glutes=pair('M65 172 C73 168 81 173 88 178 L87 197 C80 203 67 200 59 194 C59 183 61 177 65 172Z');
    shapes.hamstrings=[
      ...pair('M60 200 C66 204 70 204 73 204 L75 234 70 259 64 259 C60 243 57 217 60 200Z'),
      ...pair('M77 204 L87 199 C87 220 84 246 77 260 L73 259 78 231Z')
    ];
  }else{
    shapes.chest=pair('M65 73 C73 69 80 70 88 74 L88 108 C79 111 67 105 58 97 C58 87 60 79 65 73Z');
    shapes.core=[
      ...pair('M61 104 C65 111 70 116 76 120 L71 151 64 164 C61 149 58 120 61 104Z'),
      ...pair('M78 115 Q83 112 88 115 L88 127 78 127Z'),
      ...pair('M77 131 L88 131 88 143 76 143Z'),
      ...pair('M76 147 L88 147 88 159 77 159Z'),
      ...pair('M78 163 L88 163 87 176 81 171Z')
    ];
    shapes.quads=[
      ...pair('M63 181 C68 182 71 187 72 194 L69 225 65 248 C59 239 56 210 59 194Z'),
      ...pair('M74 187 C80 186 85 189 86 198 L83 229 76 251 71 245 75 220Z'),
      ...pair('M81 232 C84 241 82 254 76 261 C70 257 72 250 75 244Z')
    ];
  }
  const max=Math.max(1,...Object.values(model.groups));
  const half='M90 57 L80 54 C81 61 72 64 60 65 C47 65 39 71 36 83 C32 96 34 110 31 123 L26 143 19 173 C16 177 15 184 16 191 L20 201 Q23 205 25 201 L27 188 32 179 C39 161 43 145 46 130 L51 110 C52 126 57 141 59 151 L58 174 C53 185 53 203 56 223 L60 258 C58 274 61 296 65 315 L67 330 61 339 Q58 345 66 346 L78 343 Q83 341 81 334 L80 309 C82 291 86 277 86 260 L89 215 90 191Z';
  return '<svg class="lg-body-svg" viewBox="0 0 180 368" aria-label="'+(back?'Back':'Front')+' muscle groups">'+
    '<g class="lg-body-outline"><path d="M77 14 C83 8 97 8 103 14 C108 21 107 36 102 44 L96 51 84 51 78 44 C73 36 72 22 77 14Z"/>'+
    '<path d="'+half+'"/><path d="'+half+'" transform="translate(180 0) scale(-1 1)"/></g>'+
    Object.entries(shapes).map(([muscle,paths])=>{
      const count=model.groups[muscle]||0,selected=muscle===selectedMuscle;
      return '<g role="button" tabindex="0" class="lg-body-muscle'+(count?' has-work':'')+(selected?' selected':'')+'" '+
        'style="--coverage-opacity:'+(count?(.38+.62*count/max).toFixed(2):0)+'" aria-label="'+escAttr(muscleLabel(muscle)+', '+count+' '+(recorded?'recorded':'planned')+' sets')+'" aria-pressed="'+selected+'" '+
        'data-muscle="'+escAttr(muscle)+'"'+context+' onclick="'+action+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+action+'}">'+
        paths.map(p=>'<path d="'+(typeof p==='string'?p:p.d)+'"'+(p.mirror?' transform="translate(180 0) scale(-1 1)"':'')+'/>').join('')+'</g>';
    }).join('')+
    '<g class="lg-body-definition"><path d="'+(back?'M90 67V172 M60 202Q74 210 88 203 M92 203Q106 210 120 202':'M90 73V176 M64 169Q74 175 79 181 M116 169Q106 175 101 181')+'"/>'+
    '<path d="M17 184L22 193 M163 184L158 193 M64 334L75 337 M116 334L105 337"/></g>'+
    '<text x="90" y="365" text-anchor="middle">'+(back?'Back':'Front')+'</text></svg>';
}
function logCoverageHtml(b){
  const model=trainingCoverageModel(logCoverageExercises(b),S.sessions,getLocalDate(),logCoverageMode);
  const keys=Object.keys(model.groups).sort((a,b)=>model.groups[b]-model.groups[a]||a.localeCompare(b));
  if(!logCoverageMuscle) logCoverageMuscle=keys[0]||'';
  const selected=logCoverageMuscle,rows=model.rows.filter(r=>r.muscle===selected);
  const label=logCoverageMode==='week'?'recorded working sets':'planned sets';
  const max=Math.max(1,...Object.values(model.groups));
  const exercises=new Set(rows.map(r=>r.name)).size;
  return '<div class="lg-coverage-heading">'+cardHeader('target','Training coverage')+
    '<div class="seg-tabs seg-fill lg-coverage-tabs" role="group" aria-label="Training coverage period">'+
    '<button type="button" class="'+(logCoverageMode==='workout'?'on':'')+'" aria-pressed="'+(logCoverageMode==='workout')+'" onclick="logSetCoverage(\'workout\')">'+(b.state==='saved'?'Next workout':'This workout')+'</button>'+
    '<button type="button" class="'+(logCoverageMode==='week'?'on':'')+'" aria-pressed="'+(logCoverageMode==='week')+'" onclick="logSetCoverage(\'week\')">Last 7 days</button></div></div>'+
    '<div class="lg-coverage-layout"><div class="lg-body-panel"><div class="lg-body-pair">'+logBodySvg(model,false)+logBodySvg(model,true)+'</div>'+
    '<div class="lg-coverage-key"><i></i> More sets <span>Gray · no mapped sets</span></div></div>'+
    '<div class="lg-coverage-data"><div class="lg-coverage-summary"><div><strong>'+model.total+'</strong> '+label+'</div><div><strong>'+keys.length+'</strong> muscle groups</div></div>'+
    '<div class="lg-muscle-list" role="group" aria-label="Muscle groups">'+keys.map(m=>
      '<button type="button" class="lg-muscle-chip'+(m===selected?' on':'')+'" aria-pressed="'+(m===selected)+'" aria-label="'+escAttr(muscleLabel(m)+', '+model.groups[m]+' '+(logCoverageMode==='week'?'recorded':'planned')+' sets')+'" data-muscle="'+escAttr(m)+'" onclick="logSelectMuscle(this.dataset.muscle)"><span>'+escText(muscleLabel(m))+'</span><strong>'+model.groups[m]+' <small>sets</small></strong><span class="lg-muscle-meter" aria-hidden="true"><i style="width:'+(100*model.groups[m]/max).toFixed(1)+'%"></i></span></button>').join('')+'</div>'+
    (keys.length?'<div class="lg-muscle-detail"><h3><span>'+escText(muscleLabel(selected))+'</span><small>'+exercises+' exercise'+(exercises===1?'':'s')+' · '+(model.groups[selected]||0)+' sets</small></h3>'+rows.map(r=>
      '<button type="button" class="lg-row" data-exercise="'+escAttr(r.name)+'" onclick="openExerciseDetail(this.dataset.exercise)"><span class="lg-row-l"><span class="lg-row-name">'+escText(r.name)+'</span><span class="lg-row-meta">'+(r.date?escText(fmtDate(r.date)):'Planned')+'</span></span><span class="lg-row-v">'+r.sets+' sets</span></button>').join('')+(!model.groups[selected]?'<div class="lg-blank">No '+(logCoverageMode==='week'?'recorded':'planned')+' sets for this group.</div>':'')+'</div>':
      '<div class="lg-blank">'+(logCoverageMode==='week'?'No working sets recorded in the last seven days.':'Add exercises to your split to see its coverage.')+'</div>')+'</div></div>'+
    '<details class="lg-coverage-note"><summary>About this map'+(model.inferred?' · includes inferred groups':'')+'</summary><p>Each exercise counts toward its saved primary muscle group. Older records without a specific group use the exercise name. Custom groups remain in the list. This shows coverage, not recovery.</p></details>';
}
function renderLogCoverage(){
  const el=document.getElementById('log-coverage');if(!el) return;
  const focus=document.activeElement, muscle=focus&&focus.dataset&&focus.dataset.muscle;
  const onMap=focus&&focus.classList.contains('lg-body-muscle');
  const period=focus&&focus.closest('.lg-coverage-tabs')?focus.textContent:null;
  el.innerHTML=logCoverageHtml(logTodayBrief());
  if(muscle){const button=Array.from(el.querySelectorAll(onMap?'.lg-body-muscle':'.lg-muscle-chip')).find(b=>b.dataset.muscle===muscle)||Array.from(el.querySelectorAll('.lg-body-muscle')).find(b=>b.dataset.muscle===muscle);if(button)button.focus({preventScroll:true});}
  else if(period){const button=Array.from(el.querySelectorAll('.lg-coverage-tabs button')).find(b=>b.textContent===period);if(button)button.focus({preventScroll:true});}
}

function trainingSessionCoverage(session){
  const groups=Object.create(null),rows=[];let inferred=0;
  (Array.isArray(session&&session.exercises)?session.exercises:[]).forEach((ex,index)=>{
    if(!ex||typeof ex.name!=='string') return;
    const sets=(Array.isArray(ex.sets)?ex.sets:[]).filter(s=>s&&typeof s==='object');
    const working=sets.filter(statsIsWorkingSet).length;
    const muscle=ex.muscle?trainingMuscleKey(ex.muscle):libGuessMuscle(ex.name);
    rows.push({index,name:ex.name,muscle,sets,working,unit:ex.unit});
    if(working) groups[muscle]=(groups[muscle]||0)+working;
    if(!ex.muscle||ex.muscleSource==='inferred') inferred+=working;
  });
  return {groups,rows,inferred,total:Object.values(groups).reduce((n,v)=>n+v,0)};
}
const logHistoryState=new Map();
function logHistoryKey(session,index){ return session.id==null?'legacy-'+index:String(session.id); }
function logHistoryRecord(key){ return (S.sessions||[]).find((s,i)=>s&&logHistoryKey(s,i)===key); }
function logHistoryDisclosure(details){
  const key=details.dataset.sessionKey,state=logHistoryState.get(key)||{muscle:''};
  state.open=details.open;logHistoryState.set(key,state);
  if(details.open){
    const session=logHistoryRecord(key),body=details.querySelector('.hist-preview');
    if(session&&body) body.innerHTML=logHistoryPreviewHTML(session,key,state.muscle);
  }
}
function logHistorySelectMuscle(key,muscle,source){
  const session=logHistoryRecord(key);if(!session) return;
  const detail=Array.from(document.querySelectorAll('#history-list .session-card')).find(e=>e.dataset.sessionKey===key);
  if(!detail||!detail.open) return;
  const onMap=source&&source.classList.contains('lg-body-muscle');
  logHistoryState.set(key,{open:true,muscle});
  detail.querySelector('.hist-preview').innerHTML=logHistoryPreviewHTML(session,key,muscle);
  const next=Array.from(detail.querySelectorAll(onMap?'.lg-body-muscle':'.hist-muscle')).find(e=>e.dataset.muscle===muscle);
  if(next) next.focus({preventScroll:true});
}
function logHistoryPreviewHTML(session,key,selected){
  const model=trainingSessionCoverage(session),keys=Object.keys(model.groups).sort((a,b)=>model.groups[b]-model.groups[a]||a.localeCompare(b));
  const rows=selected?model.rows.filter(r=>r.muscle===selected):model.rows;
  const options={selected:selected||'',recorded:true,sessionKey:key};
  const chips=['',...keys].map(m=>'<button type="button" class="hist-muscle'+(m===(selected||'')?' on':'')+'" aria-pressed="'+(m===(selected||''))+'" data-session-key="'+escAttr(key)+'" data-muscle="'+escAttr(m)+'" onclick="logHistorySelectMuscle(this.dataset.sessionKey,this.dataset.muscle,this)">'+escText(m?muscleLabel(m):'All exercises')+(m?'<strong>'+model.groups[m]+'</strong>':'')+'</button>').join('');
  const exercises=rows.map(row=>{
    const unit=row.unit||((typeof _secsNames!=='undefined'&&_secsNames.has(row.name))?'secs':'reps');
    let working=0,warmup=0;
    return '<section class="hist-exercise"><h4>'+escText(row.name)+'</h4><div class="hist-exercise-meta">'+escText(muscleLabel(row.muscle))+' · '+row.working+' working '+(row.working===1?'set':'sets')+'</div>'+
      row.sets.map(set=>'<div class="hist-set-line"><span>'+(set.type==='warmup'?'Warm-up '+(++warmup):'Set '+(++working))+'</span><strong>'+escText(fmtLoggedSet(set,unit))+'</strong></div>').join('')+'</section>';
  }).join('');
  return '<div class="hist-preview-layout"><section class="hist-coverage">'+cardHeader('target','Muscles worked')+
    '<div class="lg-body-panel"><div class="lg-body-pair">'+logBodySvg(model,false,options)+logBodySvg(model,true,options)+'</div><div class="lg-coverage-key"><i></i> Working sets</div></div>'+
    '<div class="hist-muscles" role="group" aria-label="Filter session exercises by muscle">'+chips+'</div>'+
    '<details class="hist-map-note"><summary>About this map'+(model.inferred?' · estimated groups':'')+'</summary><p>Saved primary muscle groups and recorded working sets. Warm-ups are excluded. Older entries without a group use the exercise name. Custom and broad groups stay in the list. This shows coverage, not recovery.</p></details></section>'+
    '<section class="hist-sets">'+cardHeader('list',selected?escText(muscleLabel(selected))+' exercises':'Recorded sets')+(exercises||'<p class="hist-empty">No exercises recorded for this muscle group.</p>')+'</section></div>'+
    (session.note?'<section class="hist-note"><h4>Session notes</h4><p>'+escText(session.note)+'</p></section>':'')+
    (session.id==null?'':'<footer class="hist-preview-footer"><button type="button" class="stg-btn hist-delete" data-session-id="'+escAttr(session.id)+'" onclick="deleteSession(this.dataset.sessionId)">Delete session</button></footer>');
}
function logHistoryCardHTML(session,index){
  const key=logHistoryKey(session,index),state=logHistoryState.get(key)||{open:false,muscle:''};
  const model=trainingSessionCoverage(session),keys=Object.keys(model.groups).sort((a,b)=>model.groups[b]-model.groups[a]||a.localeCompare(b));
  const status=session.completed===true?'Completed':session.completed===false?'Partial workout':'Saved workout';
  const effort=session.effort&&effortMeta(session.effort);
  const day=Number(session.dayNum),duration=Number(session.duration);
  const meta=[Number.isFinite(day)&&day>0?'Day '+day:'',Number.isFinite(duration)&&duration>0?fmtDuration(duration):'',status].filter(Boolean).join(' · ');
  return '<details class="session-card hist-session" data-session-key="'+escAttr(key)+'" data-session-date="'+escAttr(session.date||'')+'" ontoggle="logHistoryDisclosure(this)"'+(state.open?' open':'')+'><summary class="hist-preview-toggle">'+
    cardHeader('calendar',escText(session.date?fmtDate(session.date):'Date not recorded'))+
    '<div class="hist-title-row"><h3>'+escText(session.sessionType||'Workout')+'</h3><span class="hist-chevron" aria-hidden="true">⌄</span></div>'+
    '<p class="hist-meta">'+escText(meta)+(effort?' · '+escText(effort.label):'')+'</p>'+
    '<div class="hist-card-bottom"><span>'+model.rows.length+' '+(model.rows.length===1?'exercise':'exercises')+'<span aria-hidden="true"> · </span>'+model.total+' working '+(model.total===1?'set':'sets')+'</span><span class="hist-preview-label">View workout</span></div>'+
    (keys.length?'<div class="hist-group-tags">'+keys.slice(0,4).map(m=>'<span>'+escText(muscleLabel(m))+'</span>').join('')+(keys.length>4?'<span>+'+(keys.length-4)+'</span>':'')+'</div>':'')+
    '</summary><div class="hist-preview">'+(state.open?logHistoryPreviewHTML(session,key,state.muscle):'')+'</div></details>';
}
document.addEventListener('keydown',function(event){
  const modal=document.getElementById('swap-modal');if(!modal||modal.classList.contains('hidden'))return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeSwapModal();return;}
  if(event.key==='Tab'){
    const items=Array.from(modal.querySelectorAll('button:not(:disabled),input,select')).filter(e=>e.getClientRects().length);
    const index=items.indexOf(document.activeElement);
    if(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===items.length-1){
      event.preventDefault();items[event.shiftKey?items.length-1:0]?.focus();
    }
  }
});
// Blurring search starts keyboard dismissal. Keep the tapped row still until its click fires.
document.addEventListener('pointerdown',function(event){if(event.target.closest('#swap-modal'))swapPointerActive=true;},true);
document.addEventListener('pointerup',function(){if(swapPointerActive)setTimeout(()=>{swapPointerActive=false;swapSyncKeyboard();},0);},true);
document.addEventListener('pointercancel',function(){swapPointerActive=false;swapSyncKeyboard();},true);
