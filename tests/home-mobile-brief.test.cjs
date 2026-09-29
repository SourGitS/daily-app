const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract,extractConst}=require('./harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=Date.parse('2026-09-29T02:00:00Z');
const cache={city:'Sydney',code:0,tempC:19,fetchedAt:now,observedAt:now};
const brief={title:'Chest & Back',eyebrow:'UP NEXT',action:'Open workout',date:'Tue, 29 Sept',meta:'8 exercises',remaining:263.45};
function fixture(overrides={}){
  const from=new Date(2026,8,29),to=new Date(2026,9,12);
  const ctx=vm.createContext({
    console,Number,Date:class extends Date{static now(){return now;}},
    navigator:{onLine:true},S:{sessions:[]},getLocalDate:()=> '2026-09-29',
    escText:escape,escAttr:escape,cardIcon:name=>'<svg data-icon="'+name+'"></svg>',
    weatherIcon:name=>'<i data-icon="'+name+'"></i>',weatherLook:()=>['sun','Clear sky'],
    weatherIsFresh:entry=>entry.fetchedAt===now,loadWeatherCache:()=>cache,
    fmtMoneyExact:value=>'$'+value.toFixed(2),budTimelineWindow:()=>({from,to}),
    billOccurrences:()=>[],homeTrainingDays:()=>[],...overrides
  });
  vm.runInContext(extractConst('HOME_HERO_IDS')+'\n'+[
    'homeHeroIds','homeRegularWidgetIds','homeBriefRows','buildHomeMobileBrief','buildHomeMegaHero'
  ].map(extract).join('\n'),ctx);
  return ctx;
}

test('mobile shares one surface between priorities and weather, respecting all hidden flags',()=>{
  const ctx=fixture(),cards={session:'Full workout strip',weather:'<div id="home-weather-temp">Full forecast</div>',budget:'Budget'};
  for(let mask=0;mask<8;mask++){
    const visible=['session','weather','budget'].filter((id,i)=>mask&(1<<i));
    const before=JSON.stringify({visible,cards,brief});
    const html=ctx.buildHomeMegaHero(cards,visible,'mobile',brief);
    assert.equal((html.match(/<section /g)||[]).length,visible.includes('session')||visible.includes('weather')?1:0);
    assert.equal((html.match(/id="home-weather-temp"/g)||[]).length,visible.includes('weather')?1:0);
    assert.equal(html.includes('id="hero-day-name"'),visible.includes('session'));
    assert.doesNotMatch(html,/home-weather-standalone|home-brief-weather/);
    assert.doesNotMatch(html,/Full workout strip|home-training-days|hero-progress-fill/);
    assert.equal(JSON.stringify({visible,cards,brief}),before);
  }
});

test('canonical workout copy and actions survive ready, active, partial-save and empty states',()=>{
  const ctx=fixture();
  const states=[brief,
    {...brief,eyebrow:'IN PROGRESS',action:'Continue workout',meta:'8 exercises · 2 done'},
    {...brief,title:'Previously saved split',eyebrow:'SAVED TODAY',action:'Review workout',meta:'25 min · 2 exercises saved · 4 working sets'},
    {...brief,title:'Training',eyebrow:'NO EXERCISES YET',action:'Set up split',meta:'No exercises configured'}];
  for(const state of states){
    const html=ctx.buildHomeMobileBrief(state,['session']);
    for(const value of [state.title,state.eyebrow,state.action,state.meta])assert.ok(html.includes(escape(value)));
    assert.match(html,/onclick="setView\('log'\)"/);
    assert.doesNotMatch(html,/logOpenSession|logOpenPlannedDay|saveSession|COMPLETED TODAY|hero-progress/);
  }
});

test('finance summaries keep exact cents, distinguish missing income and overspend, and respect visibility',()=>{
  const ctx=fixture({homeTrainingDays:()=>[{count:2},{count:1},{count:0}]});
  assert.equal(ctx.homeBriefRows(['budget'],263.45)[0].text,'$263.45 left this week');
  assert.equal(ctx.homeBriefRows(['budget'],-.49)[0].text,'$0.49 over budget');
  assert.equal(ctx.homeBriefRows(['budget'],0)[0].text,'$0.00 left this week');
  assert.equal(ctx.homeBriefRows(['budget'],null)[0].text,'No income recorded this week');
  const rows=plain(ctx.homeBriefRows(['session'],263.45));
  assert.deepEqual(rows,[{run:"setView('log')",title:'2 days trained',detail:'Last 7 days',text:'Last 7 days · 2 days trained'}]);
});

test('nearest scheduled occurrence occupies the second row without claiming payment status',()=>{
  const bill={name:'Internet',date:new Date(2026,8,30),kind:'charge'};
  const ctx=fixture({billOccurrences:(from,to)=>{
    assert.equal(from.getDate(),29);assert.equal(to.getMonth(),9);return [bill];
  }});
  let rows=plain(ctx.homeBriefRows(['budget'],45));
  assert.equal(rows.length,2);assert.equal(rows[1].text,'Internet scheduled tomorrow');
  assert.equal(rows[1].run,'openBillsCalendar()');
  bill.kind='statement';bill.date=new Date(2026,8,29);
  rows=plain(ctx.homeBriefRows(['budget'],45));
  assert.equal(rows[1].text,'Internet statement due today');
  bill.kind='charge';bill.date=new Date(2026,9,2);
  assert.match(ctx.homeBriefRows(['budget'],45)[1].text,/scheduled 2 Oct/);
  assert.doesNotMatch(JSON.stringify(rows),/unpaid|overdue|paid today/);
});

test('task-like or bill names are escaped and never become markup or an inline action',()=>{
  const ctx=fixture({billOccurrences:()=>[{name:'<img src=x onerror=alert(1)>',kind:'charge',date:new Date(2026,8,29)}]});
  const html=ctx.buildHomeMobileBrief({...brief,title:'<script>bad</script>'},['session','budget']);
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<script>|<img /);
});

test('desktop keeps the existing three-section hero even when supplied the phone briefing data',()=>{
  const ctx=fixture();
  const html=ctx.buildHomeMegaHero({session:'Original workout',budget:'Original budget',weather:'Original weather'},['session','budget','weather'],'desktop',brief);
  assert.match(html,/Original workout/);assert.match(html,/Original budget/);assert.match(html,/Original weather/);
  assert.doesNotMatch(html,/home-brief|home-weather-standalone/);
});
