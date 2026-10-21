const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./harness.cjs');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(){
  const ctx=vm.createContext({escText:escape,homeTrainingStrip:()=>'<div class="home-training-strip">Real saved history</div>'});
  vm.runInContext(['buildHomeWidget','buildHomeTrainingCard'].map(extract).join('\n'),ctx);return ctx;
}
test('shared training preserves canonical ready, active, partial-save and empty states',()=>{
  const ctx=fixture();
  const states=[
    {title:'Chest & Back',eyebrow:'UP NEXT',action:'Open workout',meta:'8 exercises'},
    {title:'Chest & Back',eyebrow:'IN PROGRESS',action:'Continue workout',meta:'8 exercises · 2 done'},
    {title:'Previously saved split',eyebrow:'SAVED TODAY',action:'Review workout',meta:'25 min · 2 exercises saved · 4 working sets'},
    {title:'Training',eyebrow:'NO EXERCISES YET',action:'Set up split',meta:'No exercises configured'}
  ];
  for(const brief of states){
    const before=JSON.stringify(brief),html=ctx.buildHomeWidget('session',ctx.buildHomeTrainingCard(brief));
    for(const value of Object.values(brief))assert.ok(html.includes(escape(value)));
    assert.match(html,/onclick="setView\('log'\)"/);
    assert.equal((html.match(/Real saved history/g)||[]).length,1);
    assert.doesNotMatch(html,/Unused old hero|logOpenSession|saveSession|COMPLETED TODAY|hero-progress/);
    assert.equal(JSON.stringify(brief),before);
  }
});
test('training text is escaped and cannot create a new inline action',()=>{
  const ctx=fixture(),value='<img src=x onerror=alert(1)>';
  const html=ctx.buildHomeTrainingCard({title:value,eyebrow:value,meta:value,action:value});
  assert.doesNotMatch(html,/<img /);assert.equal((html.match(/&lt;img/g)||[]).length,4);
  assert.equal((html.match(/onclick=/g)||[]).length,1);
});

function phoneFixture(){
  const ctx=vm.createContext({escText:escape,escAttr:escape,cardIcon:()=>'<svg></svg>',
    budPeriodMoney:()=>({available:120,range:{}}),budPeriodLabel:()=> '19–25 Oct',fmtMoneyExact:n=>'$'+n,
    budTimelineWindow:()=>({from:new Date('2026-10-21T00:00:00')}),billOccurrences:()=>[],
    homeTrainingDays:()=>[{count:1},{count:0}],S:{sessions:[]},getLocalDate:()=> '2026-10-21'});
  vm.runInContext(['homeBriefRows','buildHomeMobileBrief','buildHomePhoneOverview'].map(extract).join('\n'),ctx);return ctx;
}

test('compact phone overview retains canonical workout actions and safely escapes user text',()=>{
  const ctx=phoneFixture();
  for(const [eyebrow,action,meta] of [
    ['UP NEXT','Open workout','8 exercises'],['IN PROGRESS','Continue workout','8 exercises · 2 done'],
    ['SAVED TODAY','Review workout','25 min · 2 exercises saved'],['NO EXERCISES YET','Set up split','No exercises configured']]){
    const brief=Object.freeze({date:'Wed, 21 Oct',title:'Chest <img src=x> & Back',eyebrow,action,meta,remaining:120});
    const before=JSON.stringify(brief),html=ctx.buildHomePhoneOverview({session:'unused desktop training',weather:'Weather'},['session','budget','weather'],brief);
    for(const value of Object.values(brief).filter(v=>typeof v==='string'))assert.ok(html.includes(escape(value)));
    assert.match(html,/setView\('log'\)/);assert.match(html,/home-brief-action/);
    assert.doesNotMatch(html,/<img|unused desktop training|home-training-strip|data-embedded-widget/);
    assert.equal(JSON.stringify(brief),before);
  }
});

test('phone overview respects all visibility choices and leaves Budget out of the grouped surface',()=>{
  const ctx=phoneFixture(),cards=Object.freeze({session:'Training',budget:'Full Budget content',weather:'Weather content'});
  for(let mask=0;mask<8;mask++){
    const ids=Object.freeze(['session','budget','weather'].filter((_,i)=>mask&(1<<i))),before=JSON.stringify(ids);
    const html=ctx.buildHomePhoneOverview(cards,ids,{date:'Today',title:'Workout',eyebrow:'UP NEXT',action:'Open workout',meta:'4 exercises'});
    assert.equal(html.includes('data-hero-section="session"'),!!(mask&1));
    assert.equal(html.includes('data-hero-section="weather"'),!!(mask&4));
    assert.doesNotMatch(html,/Full Budget content|data-hero-section="budget"/);
    assert.equal(Boolean(html),!!(mask&5));assert.equal(JSON.stringify(ids),before);
  }
});

test('phone summaries distinguish scheduled bills from statement obligations without changing records',()=>{
  const ctx=phoneFixture();
  const bill=Object.freeze({name:'Phone bill <test>',date:new Date('2026-10-21T00:00:00'),kind:'bill'});
  ctx.billOccurrences=()=>[bill];
  const before=JSON.stringify(bill),rows=ctx.homeBriefRows(['budget'],null);
  assert.match(rows[1].text,/scheduled today/);assert.doesNotMatch(rows[1].text,/unpaid|overdue/);
  ctx.billOccurrences=()=>[{...bill,kind:'statement'}];assert.match(ctx.homeBriefRows(['budget'],null)[1].text,/statement due today/);
  ctx.budPeriodMoney=()=>null;assert.equal(ctx.homeBriefRows(['budget'],null)[0].title,'Choose your budget dates');
  assert.equal(JSON.stringify(bill),before);
});
