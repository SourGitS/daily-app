'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {app,Cloud,session}=require('./harness.cjs');

test('a syntactically valid backup with one malformed store never starts a partial replacement',()=>{
  const cases=[
    ['wt_sessions',[{id:'incomplete'}]],
    ['wt_sessions',[{...session('s'),exercises:[{name:'Squat',sets:[null]}]}]],
    ['wt_sessions',[session('same'),session('same')]],
    ['wt_weight',[{date:'2026-02-29',weight:81}]],
    ['wt_weight',[{date:'2024-02-29',weight:'unknown'}]],
    ['daily_savings_log',[{date:'2026-11-02'}]],
    ['daily_cc_log',[{date:'2026-11-02',balance:null}]],
    ['daily_weight_log',[{date:'2026-11-02',kg:'missing'}]],
    ['daily_habits_log',{'2026-11-02':'complete'}],
    ['daily_budget',{'2026-99-99':{}}],
    ['daily_reviews',{'2026-02-31':{}}],
    ['daily_budget_config',{incomeStreams:[]}],
    ['daily_budget_var_cats','unreadable'],
    ['daily_budget_fix_cats',[null]],
    ['wt_split','123'],
    ['wt_split',{types:[null]}],
    ['wt_plans',{plans:34}],
    ['daily_home_layout',{schemaVersion:2,mobile:{order:[]}}],
    ['daily_nutrition_log',{entries:{x:{date:'2026-04-31'}}}],
    ['daily_nutrition_log',{entries:{x:{date:'2026-04-30',nutrition:'missing'}}}],
    ['daily_nutrition_log',{entries:{},legacyTotals:{'2023-02-29':{calories:300}}}],
    ['daily_accounts',[{id:'damaged'}]],
    ['daily_transactions',[{id:'t',date:'2026-11-02',amount:'missing'}]],
    ['daily_ledger',[{id:'l',date:'2026-11-31',amount:10}]],
    ['kitchen_recipes',[{}]]
  ];
  for(const [key,value] of cases){
    const cloud=new Cloud(),a=app(cloud);
    a.localStorage.setItem('daily_profile','{"name":"retained"}');
    let warning;
    a.confirm=()=>true;
    const accepted=a.restoreFromText(JSON.stringify({data:{daily_profile:{name:'replacement'},[key]:value}}),message=>warning=message);
    assert.equal(accepted,false,key);
    assert.ok(warning,key);
    assert.equal(a.localStorage.getItem('daily_profile'),'{"name":"retained"}',key);
    assert.equal(a.localStorage.getItem(key),null,key);
    assert.equal(cloud.writes.length,0,key);
  }
});

test('staging retains old-format records, explicit empties, tombstones and raw settings',()=>{
  const a=app(),time=1000;
  const plan=a.dailyRestoreStage({
    wt_sessions:[session(27,0),{id:35,deletedAt:2}],
    wt_weight:[{date:'2024-02-29',weight:'80.5'},{date:'2024-03-01',deletedAt:3}],
    daily_savings_log:[{date:'2024-03-01',balance:'-32.50'}],
    daily_weight_log:[{date:'2024-03-01',kg:84},{date:'2024-03-02',weight:83}],
    wt_plans:[{id:'legacy',name:'Schedule'}],wt_split:{types:[{name:'Recovery'}]},
    daily_transactions:[{id:'refund',date:'2024-03-01',amount:'-3.50'}],
    daily_ledger:[{id:'zero',date:'2024-03-01',kind:'balance_note',amount:0},{id:'removed',deletedAt:2}],
    daily_habits:[],daily_reviews:{},daily_nutrition_log:{entries:{},legacyTotals:{}},
    daily_cal_history:{'2024-03-01':{calories:1300},'2024-03-02':1400},
    wt_theme:'dark',daily_dynamic_colours:'false'
  },time);
  assert.equal(plan.updates.sessions['27'].id,27);
  assert.equal(plan.updates.sessions['35'].deletedAt,time);
  assert.equal(plan.updates.weights['20240229'].weight,'80.5');
  assert.equal(plan.updates.weights['20240301'].deletedAt,time);
  assert.equal(plan.updates.savingsLog['20240301'].balance,'-32.50');
  assert.equal(JSON.parse(plan.writes.get('wt_plans'))[0].id,'legacy');
  assert.equal(plan.writes.get('daily_habits'),'[]');
  assert.equal(JSON.parse(plan.writes.get('daily_cal_history'))['2024-03-01'].calories,1300);
  assert.equal(plan.writes.get('wt_theme'),'dark');
  assert.equal(plan.writes.get('daily_dynamic_colours'),'false');
  assert.equal(plan.writes.has('daily_profile'),false);
});

test('device-local weather and sync metadata from an old backup are ignored',()=>{
  const a=app(),plan=a.dailyRestoreStage({wt_theme:'dark',daily_weather_cache:'{}',daily_weather_forecast_mobile:'closed',
    daily_finance_seen_transactions:'100',daily_finance_pending_ledger_1:'{}',daily_budget_ui:'{}'},101);
  assert.deepEqual([...plan.writes.keys()],['wt_theme','wt_theme_ts']);
});
