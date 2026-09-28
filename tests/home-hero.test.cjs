const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract,extractConst}=require('./harness.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(names,values={}){
  const ctx=vm.createContext({console,Set,...values});
  vm.runInContext(extractConst('HOME_HERO_IDS')+'\n'+['homeHeroIds','homeRegularWidgetIds',...names].map(extract).join('\n'),ctx);
  return ctx;
}
test('desktop hero respects all eight visibility combinations without rewriting cards or saved order',()=>{
  const ctx=fixture(['buildHomeMegaHero']);
  const cards={session:'<p>Workout</p>',budget:'<p>Budget</p>',weather:'<p>Weather</p>',notes:'<p>Notes</p>'};
  for(let mask=0;mask<8;mask++){
    const visible=['weather','notes','budget','session'].filter(id=>id==='notes'||(mask&(1<<['session','budget','weather'].indexOf(id))));
    const before=JSON.stringify({cards,visible});
    const html=ctx.buildHomeMegaHero(cards,visible,'desktop');
    const expected=['session','budget','weather'].filter((id,i)=>mask&(1<<i));
    assert.deepEqual([...html.matchAll(/data-hero-section="([^"]+)"/g)].map(m=>m[1]),expected);
    assert.equal(html.includes('Notes'),false);
    assert.equal(JSON.stringify({cards,visible}),before);
    if(!mask)assert.equal(html,'');
  }
});
test('dragging remaining Grid widgets retains hero slots, hidden widgets and the other profile',()=>{
  const desktop={order:['session','budget','weather','notes','hidden','review'],wide:['session','weather'],hidden:['hidden']};
  const mobile={order:['budget','session'],hidden:['weather'],updatedAt:25};
  let saved;
  const ctx=fixture(['saveHomeOrder','homeDashMergeAbsent'],{
    layoutMode:()=> 'desktop',homeLayout:()=>desktop,homeDashOn:()=>false,homeLayoutOrderIds:l=>l.order,
    document:{querySelectorAll:()=>['review','notes'].map(cardId=>({dataset:{cardId}}))},
    saveHomeLayout:(l,mode)=>{saved={l,mode};}
  });
  ctx.saveHomeOrder();
  assert.deepEqual(plain(desktop.order.slice(0,3)),['session','budget','weather']);
  assert.deepEqual(plain(desktop.order.filter(id=>id==='notes'||id==='review')),['review','notes']);
  assert.ok(desktop.order.includes('hidden'));
  assert.deepEqual(desktop.wide,['session','weather']);
  assert.deepEqual(mobile,{order:['budget','session'],hidden:['weather'],updatedAt:25});
  assert.equal(saved.mode,'desktop');
});
test('layout editor moves skip grouped hero slots, without moving those slots or saving a draft',()=>{
  const draft={order:['notes','session','budget','review','weather','habits']};
  const ctx=fixture(['homeWidgetMove'],{hlDraftOf:()=>draft,homeLayoutOrderIds:l=>l.order.slice(),renderHomeLayoutSection:()=>{},_hlFocus:null});
  ctx.homeWidgetMove('review',-1,'desktop');
  assert.deepEqual(plain(draft.order),['review','session','budget','notes','weather','habits']);
  ctx.homeWidgetMove('notes',1,'desktop');
  assert.deepEqual(plain(draft.order),['review','session','budget','habits','weather','notes']);
});
test('Home’s Finance link resets only the viewed week, then uses the existing Week entry point',()=>{
  let call;
  const ctx=fixture(['homeOpenBudgetWeek'],{currentWeekIdx:-5,budPastEdit:true,openBudgetWeek:()=>{call=true;}});
  ctx.homeOpenBudgetWeek();assert.equal(ctx.currentWeekIdx,0);assert.equal(ctx.budPastEdit,false);assert.equal(call,true);
});
test('weather disclosure choices are independent per viewport and detached toggles cannot overwrite them',()=>{
  const ctx=fixture(['homeWeatherToggle'],{_homeWeatherExpanded:{desktop:true,mobile:null}});
  ctx.homeWeatherToggle({isConnected:true,dataset:{mode:'mobile'},open:false});
  assert.deepEqual(plain(ctx._homeWeatherExpanded),{desktop:true,mobile:false});
  ctx.homeWeatherToggle({isConnected:false,dataset:{mode:'mobile'},open:true});
  assert.equal(ctx._homeWeatherExpanded.mobile,false);
});


test('phone hero keeps only workout and weather; Finance appears once in the saved ordinary-card order',()=>{
  const ctx=fixture(['buildHomeMegaHero']);
  const cards={session:'Workout',budget:'Budget',weather:'Weather',review:'Review',habits:'Habits',notes:'Notes'};
  for(let mask=0;mask<8;mask++){
    const visible=['session','review','weather','habits','budget','notes'].filter(id=>
      !['session','budget','weather'].includes(id)||(mask&(1<<['session','budget','weather'].indexOf(id))));
    const before=JSON.stringify({cards,visible});
    const html=ctx.buildHomeMegaHero(cards,visible,'mobile');
    const hero=[...html.matchAll(/data-hero-section="([^"]+)"/g)].map(m=>m[1]);
    const ordinary=plain(ctx.homeRegularWidgetIds(visible,'mobile'));
    assert.deepEqual(hero,['session','weather'].filter(id=>visible.includes(id)));
    assert.deepEqual(ordinary,visible.filter(id=>id!=='session'&&id!=='weather'));
    assert.equal(hero.concat(ordinary).filter(id=>id==='budget').length,mask&2?1:0);
    assert.doesNotMatch(html,/home-mega-budget|home-mega-footer|Add expense/);
    if(!hero.length)assert.equal(html,'');
    assert.equal(JSON.stringify({cards,visible}),before);
  }
});

test('mobile Budget can be moved between regular cards while workout and weather keep their slots',()=>{
  const draft={order:['notes','session','budget','review','weather','habits']};
  const ctx=fixture(['homeWidgetMove'],{hlDraftOf:()=>draft,homeLayoutOrderIds:l=>l.order.slice(),renderHomeLayoutSection:()=>{},_hlFocus:null});
  ctx.homeWidgetMove('budget',1,'mobile');
  assert.deepEqual(plain(draft.order),['notes','session','review','budget','weather','habits']);
  ctx.homeWidgetMove('budget',1,'mobile');
  assert.deepEqual(plain(draft.order),['notes','session','review','habits','weather','budget']);
});

test('saving a phone drag includes Budget while retaining hidden slots and leaving desktop untouched',()=>{
  const mobile={order:['session','weather','review','hidden','budget','habits'],hidden:['hidden']};
  const desktop={order:['budget','session','weather','notes'],wide:['weather'],updatedAt:99};
  const before=JSON.stringify(desktop);let saved;
  const ctx=fixture(['saveHomeOrder','homeDashMergeAbsent'],{
    layoutMode:()=> 'mobile',homeLayout:mode=>mode==='mobile'?mobile:desktop,homeLayoutOrderIds:l=>l.order,
    document:{querySelectorAll:()=>['review','habits','budget'].map(cardId=>({dataset:{cardId}}))},
    saveHomeLayout:(l,mode)=>{saved={l,mode};}
  });
  ctx.saveHomeOrder();
  assert.deepEqual(plain(mobile.order),['session','weather','review','hidden','habits','budget']);
  assert.equal(saved.mode,'mobile');
  assert.equal(JSON.stringify(desktop),before);
});

test('layout editor treats Budget as a regular phone card and a desktop hero section',()=>{
  const widgets=[{id:'session',label:'Workout'},{id:'weather',label:'Weather'},{id:'budget',label:'Weekly Budget',tab:'Finance'}];
  const ctx=fixture(['hlWidgetRow','hlPreview','hlPvShown','hlPvTile'],{
    HOME_WIDGETS:widgets,homeLayoutOrderIds:l=>l.order,homeDashOn:()=>false
  });
  const state={hidden:new Set(),wide:new Set(),dash:false,col:null};
  const mobile=ctx.hlWidgetRow('budget',1,3,'mobile',state);
  const desktop=ctx.hlWidgetRow('budget',1,3,'desktop',state);
  assert.match(mobile,/Move Weekly Budget up/);
  assert.doesNotMatch(mobile,/appears in the Home hero/);
  assert.match(desktop,/appears in the Home hero/);
  const layout={order:['session','weather','budget'],hidden:[],wide:[]};
  const preview=ctx.hlPreview('mobile',layout);
  assert.doesNotMatch(preview.slice(0,preview.indexOf('hl-pv-stack')),/Weekly Budget/);
  assert.match(preview.slice(preview.indexOf('hl-pv-stack')),/Weekly Budget/);
});
