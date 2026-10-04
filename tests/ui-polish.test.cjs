const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./harness.cjs');

test('weight chart is rendered only after the editor is visible, including reopen',()=>{
  const dialog={open:false,showModal(){this.open=true;},onclose:null};
  const fields={'log-weight-dialog':dialog,'health-weight-section':{},'health-weight-goal-section':{},'log-weight-dialog-title':{},'weight-input':{focus(){}},'wg-target':{focus(){}}};
  const renders=[];
  const ctx=vm.createContext({document:{getElementById:id=>fields[id]},closeSettingsSection(){},logGoto(){},renderLogToday(){},
    renderWeightSection(){assert.equal(dialog.open,true);assert.equal(fields['health-weight-section'].hidden,false);renders.push('weight');},
    renderWeightGoal(){assert.equal(dialog.open,true);assert.equal(fields['health-weight-goal-section'].hidden,false);renders.push('goal');}});
  vm.runInContext(extract('openLogWeight'),ctx);
  ctx.openLogWeight();dialog.open=false;ctx.openLogWeight('goal');dialog.open=false;ctx.openLogWeight();
  assert.deepEqual(renders,['weight','goal','weight']);
});

function weightFixture(weights=[],goal={},calorieGoal='maintain'){
  const ctx=vm.createContext({S:{weights,personalInfo:{goal:calorieGoal}},weightGoal:goal,Date,Math,Number,String,parseFloat,isNaN,
    getLocalDate:()=> '2026-10-04',localMidnight:d=>new Date(d+'T00:00:00'),
    escText:String,fmtDate:String,cardHeader:(icon,label,action)=>label+action,
    calcGoalCals:()=>calorieGoal?{goal:calorieGoal}:null});
  vm.runInContext(['weightGoalAnalysis','logWeightSummaryHtml'].map(extract).join('\n'),ctx);
  return ctx;
}
for(const count of [0,1,2,3,4]) test('weight hero uses only the latest real readings: '+count,()=>{
  const weights=Array.from({length:count},(_,i)=>({date:'2026-09-'+(20+i),weight:80+i})).reverse();
  const before=JSON.stringify(weights),ctx=weightFixture(weights);
  const html=ctx.logWeightSummaryHtml();
  assert.equal(JSON.stringify(weights),before,'presentation never sorts stored records');
  if(!count){assert.match(html,/Log your first weigh-in/);assert.doesNotMatch(html,/lg-weight-readings/);}
  else {
    const row=html.split('class="lg-weight-readings">')[1].split('<div class="lg-weight-goal">')[0];
    assert.equal((row.match(/<strong>/g)||[]).length,Math.min(3,count));
    const dates=[...row.matchAll(/2026-09-\d+/g)].map(m=>m[0]);
    assert.deepEqual(dates,[...dates].sort());
    assert.equal((row.match(/class="latest"/g)||[]).length,1);
  }
  assert.match(html,/Set goal/);
});
test('saved calorie mode stays independent of target direction; legacy goals do not invent progress',()=>{
  const ctx=weightFixture([{date:'2026-09-20',weight:80}],{target:70},'bulk');
  const html=ctx.logWeightSummaryHtml();
  assert.match(html,/Target <strong>70 kg/);
  assert.match(html,/Calorie plan · Bulk/);
  assert.doesNotMatch(html,/pace|%|Remaining|to go/);
});
test('no saved calorie selection produces no calorie claim',()=>{
  assert.doesNotMatch(weightFixture([],{},null).logWeightSummaryHtml(),/Calorie plan/);
});
test('Journal local-save status stays visible and distinguishes an untouched entry',()=>{
  const el={textContent:'',style:{}},timers=[];
  const ctx=vm.createContext({document:{getElementById:()=>el},jrnEdStatusTimer:null,jrnEdPending:{},
    clearTimeout:()=>{},setTimeout:fn=>{timers.push(fn);return 1;}});
  vm.runInContext(extract('jrnEdStatus'),ctx);
  ctx.jrnEdStatus('Not saved yet');assert.equal(el.textContent,'Not saved yet');
  ctx.jrnEdStatus('Saved');assert.equal(el.textContent,'Saved on this device');
  assert.equal(timers.length,0,'ordinary autosave never queues a fading status');
  ctx.jrnEdStatus('Copied');assert.equal(timers.length,1);
  timers[0]();assert.equal(el.textContent,'Saved on this device');
});
test('Journal only claims saved when the local record contains the edit',()=>{
  let status='';
  const ctx=vm.createContext({jrnEdId:'entry',loadNotes:()=>[{id:'entry',body:'old'}],
    jrnEdStatus:s=>{status=s;},Object,JSON});
  vm.runInContext(extract('jrnEdSaved'),ctx);
  ctx.jrnEdSaved({body:'new'});assert.equal(status,'Couldn’t save on this device');
  ctx.jrnEdSaved({body:'old'});assert.equal(status,'Saved');
});
