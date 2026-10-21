const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./harness.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(names,values={}){
  const ctx=vm.createContext({console,Set,escText:s=>String(s),...values});
  vm.runInContext(names.map(extract).join('\n'),ctx);return ctx;
}

test('shared widgets reuse existing Budget and Weather content and leave other widgets alone',()=>{
  const ctx=fixture(['buildHomeWidget']);
  const brief=Object.freeze({title:'Saved split'});
  for(const id of ['session','budget','weather','notes']){
    const html=ctx.buildHomeWidget(id,'<p>Original '+id+'</p>',brief);
    if(id==='notes')assert.equal(html,'<p>Original notes</p>');
    else assert.match(html,new RegExp('home-widget-'+id));
    assert.match(html,new RegExp('Original '+id));
  }
});

test('widget moves remain drafts and retain saved visibility and widths',()=>{
  for(const mode of ['mobile','desktop'])for(const id of ['session','budget','weather']){
    const draft={order:['notes',id,'review'],hidden:['review'],wide:['session'],updatedAt:25};
    const ctx=fixture(['homeWidgetMove'],{hlDraftOf:m=>{assert.equal(m,mode);return draft;},homeLayoutOrderIds:l=>l.order.slice(),renderHomeLayoutSection:()=>{},_hlFocus:null});
    ctx.homeWidgetMove(id,-1,mode);
    assert.deepEqual(plain(draft.order),[id,'notes','review']);
    ctx.homeWidgetMove(id,1,mode);
    assert.deepEqual(plain(draft.order),['notes',id,'review']);
    assert.deepEqual(draft.hidden,['review']);assert.deepEqual(draft.wide,['session']);assert.equal(draft.updatedAt,25);
  }
});

test('drag saving keeps hidden positions, widths and the untouched profile',()=>{
  for(const mode of ['mobile','desktop']){
    const layout={order:['session','weather','review','hidden','budget','notes'],hidden:['hidden'],wide:['session','weather'],updatedAt:25};
    const other={order:['budget','notes','session'],hidden:['weather'],updatedAt:99};let saved;
    const before=JSON.stringify(other);
    const ctx=fixture(['saveHomeOrder','homeDashMergeAbsent'],{
      layoutMode:()=>mode,homeLayout:m=>m===mode?layout:other,homeDashOn:()=>false,homeLayoutOrderIds:l=>l.order,
      document:{querySelectorAll:()=>['weather','budget','review','session','notes'].map(cardId=>({dataset:{cardId}}))},
      saveHomeLayout:(l,m)=>{saved={l,m};}
    });
    ctx.saveHomeOrder();
    assert.deepEqual(plain(layout.order),['weather','budget','review','hidden','session','notes']);
    assert.deepEqual(layout.wide,['session','weather']);assert.deepEqual(layout.hidden,['hidden']);
    assert.equal(saved.m,mode);assert.equal(JSON.stringify(other),before);
  }
});

test('Dashboard widget moves keep the unused Grid arrangement',()=>{
  const draft={order:['session','budget','weather','notes'],wide:['session'],dashboard:{main:['session','notes'],summary:['weather','budget']}};
  const before=JSON.stringify({order:draft.order,wide:draft.wide});
  const ctx=fixture(['homeDashMove'],{hlDraftOf:()=>draft,homeDashColumns:l=>plain(l.dashboard),HOME_DASH_COLS:[{id:'main'},{id:'summary'}],renderHomeLayoutSection:()=>{},_hlFocus:null});
  ctx.homeDashMove('session',1);ctx.homeDashMove('budget',-1);
  assert.deepEqual(plain(draft.dashboard),{main:['notes','session'],summary:['budget','weather']});
  assert.equal(JSON.stringify({order:draft.order,wide:draft.wide}),before);
});

test('Home Layout retains visibility and exposes Budget placement when it is standalone',()=>{
  const widgets=['session','budget','weather'].map(id=>({id,label:id,tab:'Home'}));
  const ctx=fixture(['hlWidgetRow'],{HOME_WIDGETS:widgets});
  const state={hidden:new Set(['weather']),wide:new Set(['session']),dash:false,col:null};
  for(const mode of ['mobile','desktop'])for(const id of ['session','budget','weather']){
    const html=ctx.hlWidgetRow(id,1,3,mode,state);
    if(mode==='desktop'&&id==='budget')assert.match(html,/Shown inside the blue Training card/);
    else if(mode==='mobile'&&id!=='budget')assert.match(html,/compact daily overview/);
    else assert.match(html,new RegExp('Move '+id+' up'));
    assert.match(html,/homeWidgetToggle/);
    assert.equal(html.includes('hl-width-btn'),mode==='desktop'&&id!=='budget');
    assert.equal(html.includes('is-hidden'),id==='weather');
    assert.doesNotMatch(html,/Home hero|saved position.*retained/);
  }
  for(const mode of ['mobile','desktop']){
    const html=ctx.hlWidgetRow('budget',1,3,mode,{...state,hidden:new Set(['session'])});
    assert.match(html,/Move budget up/);assert.equal(html.includes('hl-width-btn'),mode==='desktop');
  }
});

test('layout previews keep saved order, hidden flags and desktop full-row choices',()=>{
  const widgets=['session','budget','weather','notes'].map(id=>({id,label:id}));
  const ctx=fixture(['hlPreview','hlPvShown','hlPvTile'],{HOME_WIDGETS:widgets,homeLayoutOrderIds:l=>l.order,homeDashOn:()=>false});
  const layout=Object.freeze({order:Object.freeze(['notes','weather','budget','session']),hidden:Object.freeze(['weather']),wide:Object.freeze(['session'])});
  const before=JSON.stringify(layout);
  for(const mode of ['mobile','desktop']){
    const html=ctx.hlPreview(mode,layout);
    if(mode==='desktop'){
      assert.ok(html.indexOf('notes')<html.indexOf('Training & Budget'));
      assert.equal((html.match(/hl-pv-name/g)||[]).length,2);
      assert.doesNotMatch(html,/hl-pv-mega/);
    }else{
      assert.match(html,/hl-pv-mega/);assert.ok(html.indexOf('Daily overview')<html.indexOf('notes'));
      assert.ok(html.indexOf('notes')<html.indexOf('budget'));assert.equal((html.match(/hl-pv-name/g)||[]).length,3);
    }
    assert.doesNotMatch(html,/weather|hl-pv-featured/);
    assert.equal(html.includes('is-wide'),mode==='desktop');
  }
  assert.equal(JSON.stringify(layout),before);
});

test('phone and desktop grouping retain every input slot and hidden choice',()=>{
  const ctx=fixture(['homePresentedWidgetIds']);
  for(const mode of ['mobile','desktop'])for(let mask=0;mask<8;mask++){
    const ids=Object.freeze(['weather','notes','budget','session'].filter(id=>id==='notes'||(mask&(1<<['session','budget','weather'].indexOf(id)))));
    const before=JSON.stringify(ids),actual=plain(ctx.homePresentedWidgetIds(ids,mode));
    assert.deepEqual(actual,mode==='mobile'?ids.filter(id=>!['session','weather'].includes(id)):ids.includes('session')&&ids.includes('budget')?ids.filter(id=>id!=='budget'):[...ids]);
    assert.equal(JSON.stringify(ids),before);
  }
});

test('combined training reuses Budget content once above the real dark history footer',()=>{
  const ctx=fixture(['buildHomeTrainingCard','homeOverviewTools'],{homeTrainingStrip:()=>'<div class="home-training-strip">Saved history</div>'});
  const brief=Object.freeze({title:'Full body',eyebrow:'UP NEXT',meta:'4 exercises',action:'Open workout',date:'Wednesday <21> October'});
  const budget='<div class="home-budget-card">Existing money and actions</div>';
  const html=ctx.buildHomeTrainingCard(brief,budget);
  assert.equal((html.match(/Existing money and actions/g)||[]).length,1);
  assert.equal((html.match(/Saved history/g)||[]).length,1);
  assert.ok(html.indexOf('home-overview-tools')<html.indexOf('home-training-focus'));
  assert.ok(html.indexOf('Existing money and actions')<html.indexOf('home-training-strip'));
  assert.match(html,/data-embedded-widget="budget"/);assert.match(html,/aria-label="Customise Home"/);
});

test('Home Finance link still opens current Week through its existing entry point',()=>{
  let called=false;
  const ctx=fixture(['homeOpenBudgetWeek'],{currentWeekIdx:-5,budPastEdit:true,openBudgetWeek:()=>{called=true;}});
  ctx.homeOpenBudgetWeek();assert.equal(ctx.currentWeekIdx,0);assert.equal(ctx.budPastEdit,false);assert.equal(called,true);
});


test('moving ordinary phone cards preserves the grouped overview slots and every saved choice',()=>{
  const draft={order:['notes','session','weather','budget','review'],hidden:['weather'],wide:['budget'],updatedAt:25};
  const ctx=fixture(['homeWidgetMove'],{hlDraftOf:()=>draft,homeLayoutOrderIds:l=>l.order.slice(),renderHomeLayoutSection:()=>{},_hlFocus:null});
  ctx.homeWidgetMove('budget',-1,'mobile');
  assert.deepEqual(plain(draft.order),['budget','session','weather','notes','review']);
  assert.deepEqual(draft.hidden,['weather']);assert.deepEqual(draft.wide,['budget']);assert.equal(draft.updatedAt,25);
});
