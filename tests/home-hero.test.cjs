const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract,extractConst}=require('./harness.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(names,values={}){
  const ctx=vm.createContext({console,Set,...values});
  vm.runInContext(extractConst('HOME_HERO_IDS')+'\n'+names.map(extract).join('\n'),ctx);
  return ctx;
}
test('hero respects all eight visibility combinations without rewriting cards or saved order',()=>{
  const ctx=fixture(['buildHomeMegaHero']);
  const cards={session:'<p>Workout</p>',budget:'<p>Budget</p>',weather:'<p>Weather</p>',notes:'<p>Notes</p>'};
  for(let mask=0;mask<8;mask++){
    const visible=['weather','notes','budget','session'].filter(id=>id==='notes'||(mask&(1<<['session','budget','weather'].indexOf(id))));
    const before=JSON.stringify({cards,visible});
    const html=ctx.buildHomeMegaHero(cards,visible);
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
  ctx.homeWidgetMove('review',-1,'mobile');
  assert.deepEqual(plain(draft.order),['review','session','budget','notes','weather','habits']);
  ctx.homeWidgetMove('notes',1,'mobile');
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
