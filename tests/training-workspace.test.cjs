const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {extract}=require('./harness.cjs');
const helper=fs.readFileSync(path.join(__dirname,'../js/training.js'),'utf8');
function fixture(){
  const writes=[],data=new Map();
  const c=vm.createContext({console,document:{addEventListener(){}},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>{writes.push(k);data.set(k,v);}},
    S:{dayIdx:0,swaps:{Bench:'Dumbbell press'},checked:new Set([0]),sessionAdds:[],sessions:[],setData:{Bench:[{weight:'60',reps:'8',type:'working',done:true}],Row:[{weight:'30',reps:'9',type:'working',done:false}],Squat:[{weight:'80',reps:'6',type:'warmup',done:false}]},sessionStart:12345,sessionNote:'Keep this note'},
    dayCustom:{},exCollapsed:new Set([0,2]),activeExIdx:1,getLocalDate:()=> '2026-11-08',
    loadExerciseLib:()=>[],loadLibHidden:()=>[],typeForDayIdx:()=>({id:'upper',name:'Upper',exercises:[{name:'Bench'},{name:'Row'},{name:'Squat'}]}),
    saveDayCustom:()=>writes.push('dayCustom')});
  vm.runInContext(helper,c);
  vm.runInContext(['libGuessMuscle','effectiveExercises','type','dayCustomFor','logSetExerciseOrder','saveSetData','statsIsWorkingSet'].map(extract).join('\n'),c);
  return {c,writes,data};
}
const plain=v=>JSON.parse(JSON.stringify(v));
test('search ignores punctuation, word order, case and common exercise abbreviations',()=>{
  const {c}=fixture(),items=[{name:'Low-incline Smith chest press',muscle:'chest'},{name:'Dumbbell biceps curl',muscle:'Biceps'},{name:'Lat pulldown',muscle:'back'},{name:'Romanian deadlift',muscle:'hamstrings'},{name:'Pullups',muscle:'back'}];
  for(const [query,name] of [['SMITH incline','Low-incline Smith chest press'],['db curls','Dumbbell biceps curl'],['lat pull down','Lat pulldown'],['RDL','Romanian deadlift'],['pull-ups','Pullups'],['hamstring','Romanian deadlift']]){
    assert.equal(c.trainingFilterExercises(items,query)[0]?.name,name,query);
  }
  assert.equal(c.trainingFilterExercises(items,'','back').length,2);
});
test('category aliases are consistent without mutating stored exercises',()=>{
  const {c}=fixture(),items=[{name:'Curl',muscle:' Biceps '},{name:'Cable extension',muscle:'TRICEPS'},{name:'Squat',muscle:'legs'},{name:'Ab wheel',muscle:'abs'},{name:'Odd movement',muscle:'My group'}],before=plain(items);
  assert.deepEqual(Array.from(items,e=>c.trainingMuscle(e)),['arms','arms','quads','core','my group']);
  assert.deepEqual(items,before);
  assert.equal(c.libGuessMuscle('Leg extension'),'quads');
  assert.equal(c.libGuessMuscle('Reverse fly'),'shoulders');
});
test('catalog includes earlier workouts and replacements, deduplicates and respects hidden entries',()=>{
  const {c,writes}=fixture();
  c.loadExerciseLib=()=>[{id:'a',name:'Bench',muscle:'chest'}];
  c.loadLibHidden=()=>['ex_def_hidden_curl'];
  c.S.sessions=[{exercises:[{name:'Earlier movement',muscle:'forearms',unit:'secs'},{name:'bench',muscle:'arms'},{name:'Hidden curl'}]}];
  const before=JSON.stringify(c.S.sessions),catalog=c.exerciseSearchCatalog();
  assert.deepEqual(Array.from(catalog,e=>e.name),['Bench','Earlier movement','Dumbbell press']);
  assert.equal(catalog[1].unit,'secs');assert.equal(JSON.stringify(c.S.sessions),before);assert.deepEqual(writes,[]);
});
test('coverage separates planned sets from dated working sets and preserves saved classifications',()=>{
  const {c,writes}=fixture();
  const planned=[{name:'Bench',sets:4,muscle:'chest'}],set={weight:0,reps:10,type:'working'};
  const sessions=[{date:'2026-11-02',exercises:[{name:'Squat',muscle:'legs',sets:[set,{...set,type:'warmup'},{}]}]},
    {date:'2026-11-08',exercises:[{name:'Curl',muscle:'Biceps',sets:[set]},{name:'Plank',sets:[{reps:30,type:'working'}]}]},
    {date:'2026-11-09',exercises:[{name:'Bench',sets:[set]}]},{date:'2026-11-01',exercises:[{name:'Bench',sets:[set]}]},
    {exercises:[{name:'Bench',sets:[set]}]},{date:'2026-11-08',deletedAt:1,exercises:[{name:'Bench',sets:[set]}]}];
  const before=JSON.stringify(sessions),recorded=c.trainingCoverageModel(planned,sessions,'2026-11-08','week');
  assert.equal(recorded.total,3);assert.deepEqual(plain(recorded.groups),{legs:1,arms:1,core:1});assert.equal(recorded.inferred,1);
  assert.equal(c.trainingCoverageModel(planned,sessions,'2026-11-08','workout').total,4);
  assert.equal(JSON.stringify(sessions),before);assert.deepEqual(writes,[]);
});
test('reordering retains sets, swaps, completed exercises, collapse, focus, timer and note by identity',()=>{
  const {c,writes,data}=fixture(),sets=c.S.setData,history=JSON.stringify(c.S.sessions);
  assert.equal(c.logSetExerciseOrder(['Squat','Bench','Row']),true);
  assert.equal(c.S.setData,sets);assert.deepEqual(Array.from(c.S.checked),[1]);assert.deepEqual(Array.from(c.exCollapsed),[0,1]);assert.equal(c.activeExIdx,2);
  assert.equal(c.S.sessionStart,12345);assert.equal(c.S.sessionNote,'Keep this note');assert.equal(c.S.swaps.Bench,'Dumbbell press');
  const saved=JSON.parse(data.get('wt_setdata'));assert.deepEqual(saved.checked,[1]);assert.deepEqual(saved.setData,plain(sets));
  assert.equal(JSON.stringify(c.S.sessions),history);assert.deepEqual(Array.from(c.type(0).exercises,e=>e.name),['Squat','Bench','Row']);
  assert.deepEqual(writes,['dayCustom','wt_setdata']);
});
test('stale, duplicate or incomplete reorder lists do not write or drop any exercise',()=>{
  const {c,writes}=fixture(),before=JSON.stringify(c.S.setData);
  for(const names of [['Bench'],['Bench','Bench','Squat'],['Bench','Row','Unknown']])assert.equal(c.logSetExerciseOrder(names),false);
  assert.equal(JSON.stringify(c.S.setData),before);assert.deepEqual(writes,[]);
});
test('custom classifications override generated defaults and plan measurement flags survive',()=>{
  const {c,writes,data}=fixture();
  c.splitTypes=()=>[{exercises:[{name:'Bench'},{name:'Dead hangs',unit:'secs'},{name:'Pullups',allowNegative:true}]}];
  c.allExerciseNames=()=>['Bench','Dead hangs','Pullups'];
  data.set('wt_exercise_lib',JSON.stringify([{id:'own-bench',name:'Bench',muscle:'shoulder',custom:true}]));
  vm.runInContext(extract('loadExerciseLib'),c);
  const entries=c.loadExerciseLib();
  assert.equal(entries.filter(e=>e.name==='Bench').length,1);assert.equal(entries.find(e=>e.name==='Bench').muscle,'shoulders');
  assert.equal(entries.find(e=>e.name==='Dead hangs').unit,'secs');assert.equal(entries.find(e=>e.name==='Pullups').allowNegative,true);assert.deepEqual(writes,[]);
});
test('historical metadata remains available after selecting an exercise as a replacement',()=>{
  const {c}=fixture();c.S.sessions=[{date:'2026-11-02',exercises:[{name:'Prior hold',muscle:'forearms',unit:'secs'}]}];c.S.swaps.Bench='Prior hold';
  const entry=c.exerciseSearchCatalog().find(e=>e.name==='Prior hold');assert.equal(entry.muscle,'forearms');assert.equal(entry.unit,'secs');
  const model=c.trainingCoverageModel([{name:'Custom move',muscle:'constructor',sets:2}],[],'2026-11-08','workout');assert.equal(model.total,2);
});
test('coverage retains legacy numeric set text while skipping warmups and missing exercises',()=>{
  const {c}=fixture();
  const model=c.trainingCoverageModel([],[{date:'2026-11-08',exercises:[null,
    {name:'Assisted curl',muscle:'arms',sets:[{weight:'-15 kg',reps:'8'},{weight:75,reps:0},{weight:30,reps:8,type:'warmup'}]},
    {name:'Plank',muscle:'core',sets:[{reps:'30s'},{}]}]}],'2026-11-08','week');
  assert.equal(model.total,2);assert.deepEqual(plain(model.groups),{arms:1,core:1});
});
