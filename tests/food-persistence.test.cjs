const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Store}=require('./harness.cjs');
const src=fs.readFileSync(path.resolve(__dirname,'../js/nutrition.js'),'utf8'),today='2026-11-16';
function devices(seed={}){
  const store=new Store(seed);let queue=Promise.resolve();
  const locks={request:(key,work)=>{const result=queue.then(work);queue=result.catch(()=>{});return result;}};
  const device=()=>{
    const messages=[],form={qty:'1',cal:'200',measure:'serving',meal:'breakfast'};
    const d=vm.createContext({document:{getElementById:id=>id==='nutrition-food-overlay'
      ?{classList:{add:()=>{d.closed=true}}}:{value:form[id.slice(8)]||'',checked:false}},
      getLocalDate:()=>today,localStorage:store,showToast:m=>messages.push(m),navigator:{locks},confirm:()=>true});
    vm.runInContext(src,d);d.nutRefreshConsumers=()=>{};d.nutInit();
    return {d,messages,add:name=>{form.name=name;d.closed=false;return d.nutSaveManual();}};
  };
  return {store,device,settle:()=>queue};
}
test('concurrent offline tabs persist both independently logged meals; same-tab double tap saves once',async()=>{
  const {store,device}=devices(),a=device(),b=device();
  await Promise.all([a.add('Toast'),b.add('Oats'),a.add('Toast')]);
  assert.deepEqual(Object.values(JSON.parse(store.getItem('daily_nutrition_log')).entries).map(r=>r.name).sort(),['Oats','Toast']);
  assert.equal(a.messages.filter(m=>m==='Food logged').length,1);assert.equal(b.d.closed,true);
});
test('failed local meal write keeps the draft and recipe save returns no receipt; retry saves once',async()=>{
  const {store,device}=devices(),a=device();await a.add('Saved');
  store.fail=true;await a.add('Retry');assert.equal(a.d.closed,false);assert.match(a.messages.at(-1),/could not be saved/);
  assert.equal(a.d.nutEntries(today).length,1);
  assert.equal(await a.d.nutLogRecipeSnapshot({id:'r',name:'Soup'},{nutrition:{calories:25}},1,'lunch'),null);
  store.fail=false;await a.add('Retry');assert.equal(a.d.nutEntries(today).length,2);
});
test('deleted last migrated meal stays deleted after reload while total-only days remain visible',async()=>{
  const {device,settle}=devices({wt_calories:JSON.stringify({date:today,entries:[{name:'Toast',kcal:200}]}),
    daily_cal_history:JSON.stringify({[today]:200,'2026-11-15':350})});
  const a=device();await settle();await a.d.nutDeleteEntry(a.d.nutEntries(today)[0].id);
  const b=device();await settle();assert.equal(b.d.nutDaySummary(today).status,'missing');
  assert.equal(b.d.nutDaySummary('2026-11-15').calories,350);
});
test('an authoritative nutrition restore excludes pre-restore peer meals and totals but accepts later activity',async()=>{
  const {device}=devices(),a=device();
  const old={entries:{old:{date:today,name:'old',updatedAt:99},new:{date:today,name:'new',updatedAt:101}},legacyTotals:{[today]:{calories:900}}};
  const restored=a.d.nutCloudLog({v:JSON.stringify({entries:{keep:{date:today,name:'keep',updatedAt:100}}}),restoreAt:100});
  for(const result of [a.d.nutMergeLogs(old,restored),a.d.nutMergeLogs(restored,old)]){
    assert.deepEqual(Object.keys(result.entries).sort(),['keep','new']);assert.equal(Object.keys(result.legacyTotals).length,0);
    assert.equal(a.d.nutEnvelope(result).restoreAt,100);
  }
});
test('receiving an empty restored food log on a new device survives reload and blocks legacy re-import',async()=>{
  const {device,store}=devices(),a=device();
  a.d.nutCommitLog(()=>a.d.nutCloudLog({v:'{"entries":{},"legacyTotals":{}}',restoreAt:100}));
  store.setItem('daily_cal_history',JSON.stringify({[today]:500}));
  const b=device();assert.equal(b.d.nutDaySummary(today).status,'missing');
  assert.equal(JSON.parse(store.getItem('daily_nutrition_log')).restoreAt,100);
});
