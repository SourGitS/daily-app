const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const model=require('../js/home-category-model.js');
const {categoryProfile,categoryVisible,categoryCells,categoryPaceModel,categoryMealModel}=model;
test('category layout defaults on, honours explicit legacy choice and does not mutate input',()=>{
 const input={enabled:true,order:['food','bogus','food','training'],hidden:['weather','weather','bogus']},before=JSON.stringify(input);
 const p=categoryProfile(input,'mobile');assert.equal(JSON.stringify(input),before);assert.deepEqual(p.order.slice(0,2),['food','training']);assert.equal(p.order.length,12);assert.deepEqual(p.hidden,['weather']);assert.equal(categoryProfile('{bad','mobile').enabled,true);assert.equal(categoryProfile(null,'desktop').enabled,true);assert.equal(categoryProfile({enabled:false},'mobile').enabled,false);
});
test('combining Budget retains its standalone placement and hidden choice',()=>{
 const p=categoryProfile({enabled:true,order:['food','budget','training']},'desktop');assert.ok(!categoryVisible(p).includes('budget'));p.hidden.push('training');assert.deepEqual(categoryVisible(p).slice(0,2),['food','budget']);p.hidden.push('budget');assert.ok(!categoryVisible(p).includes('budget'));
});
test('every reordered and hidden card packs in source order without grid holes',()=>{
 for(const mode of ['mobile','desktop'])for(let offset=0;offset<12;offset++){
  const p=categoryProfile(null,mode);p.order=p.order.slice(offset).concat(p.order.slice(0,offset));p.hidden=p.order.filter((_,i)=>i%3===0);const ids=categoryVisible(p),cells=categoryCells(ids,mode);let previous=0;const rows={};
  ids.forEach(id=>{assert.ok(cells[id].row>=previous);previous=cells[id].row;rows[previous]=(rows[previous]||0)+cells[id].span;});Object.values(rows).forEach(total=>assert.equal(total,mode==='mobile'?2:12));
 }
 assert.deepEqual(categoryCells([],'mobile'),{});
});
function pace(extra={}){return categoryPaceModel({dates:['2026-10-19','2026-10-20','2026-10-21'],today:'2026-10-21',weekly:{'2026-10-19':{goal:140}},transactions:[{date:'2026-10-19',amount:30},{date:'2026-10-20',amount:5}],habitLog:{},habitCount:6,...extra});}
test('spending is cumulative weekly pace, allowing recovery after an expensive day',()=>{assert.deepEqual(pace().map(d=>d.state),['over','on','no-entries']);assert.deepEqual(pace().map(d=>d.allowance),[20,40,60]);});
test('missing targets, undated totals, invalid amounts and future days cannot imply success',()=>{
 assert.equal(pace({weekly:{}})[0].state,'no-target');assert.equal(pace({weekly:{'2026-10-19':{goal:140,incomplete:true}}})[0].state,'unknown');
 for(const amount of [null,undefined,'',NaN,-1])assert.equal(pace({transactions:[{date:'2026-10-19',amount}]})[0].state,'unknown');
 assert.equal(pace({today:'2026-10-19'})[1].state,'future');
});
test('each week resets pace, including Australian daylight-saving week',()=>{
 const r=pace({dates:['2026-10-04','2026-10-05'],today:'2026-10-05',weekly:{'2026-09-28':{goal:70},'2026-10-05':{goal:140}},transactions:[{date:'2026-10-04',amount:65},{date:'2026-10-05',amount:15}]});assert.deepEqual(r.map(d=>d.spent),[65,15]);assert.deepEqual(r.map(d=>d.allowance),[70,20]);
});
test('habit logs distinguish absent days, explicit zero, duplicates and deleted indices',()=>{
 const r=pace({habitLog:{'2026-10-19':[],'2026-10-20':[0,0,1,5,6,-1,'2']}});assert.deepEqual(r.map(d=>d.habits),[0,3,null]);
});
test('meal totals distinguish unknown calories, missing meals and a real zero',()=>{
 const entries=[{meal:'breakfast',nutritionStatus:'known',nutrition:{calories:480}},{meal:'lunch',nutritionStatus:'known',nutrition:{calories:300}},{meal:'lunch',nutritionStatus:'unknown',nutrition:{}},{meal:'snacks',nutritionStatus:'known',nutrition:{calories:0}}];
 const r=categoryMealModel({entries},[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snacks','Snacks']]);assert.deepEqual(r.map(x=>x.calories),[480,300,null,0]);assert.equal(r[1].unknown,1);assert.equal(r[2].count,0);
});
function context(){const memory=new Map(),pushes=[],toasts=[];let fail=false;const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(fail&&k.endsWith('_ts')){fail=false;throw Error('full');}memory.set(k,String(v));},removeItem:k=>memory.delete(k)};
 const c=vm.createContext({...model,localStorage:storage,_bootPhase:false,_syncApplying:0,syncBlobPush:(...a)=>pushes.push(a),showToast:s=>toasts.push(s),document:{addEventListener(){}},window:{addEventListener(){}}});vm.runInContext(fs.readFileSync(require.resolve('../js/home-category.js'),'utf8'),c);return {c,memory,pushes,toasts,fail:()=>fail=true};}
test('loading or drafting a layout writes nothing and stores remain independent',()=>{const f=context();f.c.categoryLoad('mobile');f.c.categoryDraft('desktop');assert.equal(f.memory.size,0);assert.equal(f.pushes.length,0);assert.equal(f.c.categorySave('mobile',{enabled:false}),true);assert.equal(f.c.categoryLoad('desktop').enabled,true);assert.equal(f.c.categoryLoad('mobile').enabled,false);assert.equal(f.memory.has('daily_category_home_desktop'),false);assert.deepEqual(f.pushes[0],['categoryHomeMobile','daily_category_home_mobile']);});
test('layout save failure rolls back both value and timestamp without pushing',()=>{const f=context();f.memory.set('daily_category_home_mobile','old');f.memory.set('daily_category_home_mobile_ts','123');f.fail();assert.equal(f.c.categorySave('mobile',{enabled:true}),false);assert.equal(f.memory.get('daily_category_home_mobile'),'old');assert.equal(f.memory.get('daily_category_home_mobile_ts'),'123');assert.equal(f.pushes.length,0);assert.equal(f.toasts.length,1);});
test('cloud application and boot cannot persist layout drafts',()=>{const f=context();f.c._bootPhase=true;assert.equal(f.c.categorySave('mobile',{enabled:true}),false);f.c._bootPhase=false;f.c._syncApplying=1;assert.equal(f.c.categorySave('mobile',{enabled:true}),false);assert.equal(f.memory.size,0);});
test('saved timestamps advance even when the clock moves backwards',()=>{const f=context(),future=Date.now()+100000;f.memory.set('daily_category_home_desktop_ts',String(future));f.c.categorySave('desktop',{enabled:true});assert.equal(Number(f.memory.get('daily_category_home_desktop_ts')),future+1);});
test('Stats comparisons describe change without inventing progress or judging weight',()=>{
 const compare=model.categoryStatsComparison;
 assert.match(compare([],'strength','kg'),/first record/);
 assert.match(compare([{value:60}],'strength','kg'),/First reading/);
 assert.equal(compare([{value:60},{value:62.5}],'strength','kg × 8 reps'),'+2.5 kg across 2 recorded sessions');
 assert.equal(compare([{value:81.4},{value:80.8}],'weight','kg'),'-0.6 kg across 2 weigh-ins');
 assert.equal(compare([{value:60},{value:60}],'strength','kg'),'No change across 2 recorded sessions');
 assert.equal(compare([{value:6},{value:5},{value:3},{value:2}],'consistency','days'),'1 fewer day with workouts than the previous week');
});
