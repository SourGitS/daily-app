const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./harness.cjs');
process.env.TZ='Australia/Sydney';

function fixture(sessions=[],today='2026-09-28'){
  const ctx=vm.createContext({Date,Map,S:{sessions},getLocalDate:()=>today,
    fmtDate:date=>date,escAttr:s=>s,escText:s=>s});
  vm.runInContext(['localMidnight','dateStr','homeTrainingDays','homeTrainingStrip'].map(extract).join('\n'),ctx);
  return ctx;
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('Home shows seven local calendar days ending today across DST, month, year and leap-day boundaries',()=>{
  const ctx=fixture();
  const cases=[
    ['2026-09-28',['2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28']],
    ['2026-10-06',['2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06']],
    ['2026-04-07',['2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-07']],
    ['2027-01-02',['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02']],
    ['2024-03-02',['2024-02-25','2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02']]
  ];
  for(const [today,dates] of cases){
    const days=plain(ctx.homeTrainingDays([],today));
    assert.deepEqual(days.map(d=>d.date),dates);
    assert.deepEqual(days.filter(d=>d.isToday).map(d=>d.date),[today]);
  }
});

test('saved partial workouts count; multiple workouts count as one training day and out-of-range dates do not count',()=>{
  const sessions=Object.freeze([
    {id:'today-partial',date:'2026-09-28',completed:false},
    {id:'past',date:'2026-09-24',completed:true},
    {id:'same-day',date:'2026-09-24',completed:false},
    {id:'old',date:'2026-09-21'},{id:'future',date:'2026-09-29'},null,{}
  ].map(s=>s?Object.freeze(s):s));
  const before=JSON.stringify(sessions),ctx=fixture(sessions);
  const days=plain(ctx.homeTrainingDays(sessions,'2026-09-28'));
  assert.equal(days.filter(d=>d.count).length,2);
  assert.equal(days.find(d=>d.date==='2026-09-24').count,2);
  assert.equal(days.at(-1).count,1);
  assert.equal(JSON.stringify(sessions),before);
  assert.match(ctx.homeTrainingStrip(),/2 days trained/);
});

test('empty history stays neutral, a draft does not mark attendance, and each square exposes its date and saved-workout count',()=>{
  const ctx=fixture();
  ctx.S.checked=new Set(['Squat']);
  ctx.S.exercises=[{name:'Squat',sets:[{weight:100,reps:5}]}];
  const html=ctx.homeTrainingStrip();
  assert.match(html,/0 days trained/);
  assert.equal((html.match(/role="img"/g)||[]).length,7);
  assert.equal((html.match(/aria-current="date"/g)||[]).length,1);
  assert.match(html,/aria-label="2026-09-28 \(today\): No workout logged"/);
  assert.doesNotMatch(html,/class="home-training-day trained|missed|failed|streak|\/ 7/i);
  ctx.S.sessions=[{date:'2026-09-27'}];
  assert.match(ctx.homeTrainingStrip(),/1 day trained/);
  assert.match(ctx.homeTrainingStrip(),/aria-label="2026-09-27: 1 saved workout"/);
  ctx.S.sessions=[];
  assert.match(ctx.homeTrainingStrip(),/0 days trained/);
});
