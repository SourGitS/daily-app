const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {extract}=require('./harness.cjs');
const nutrition=fs.readFileSync(path.join(__dirname,'../js/nutrition.js'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function nutritionFunction(name){
  const start=nutrition.indexOf('function '+name+'('),end=nutrition.indexOf('\n',start);
  assert.ok(start>=0,name+' exists');
  return nutrition.slice(start,end);
}

function fixture(){
  const elements=new Map(),writes=[],renders=[],history=[];
  const get=id=>{
    if(!elements.has(id)){
      const classes=new Set();
      elements.set(id,{id,style:{display:'none'},scrollTop:23,classList:{
        toggle:(key,on)=>on?classes.add(key):classes.delete(key),
        add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)
      }});
    }
    return elements.get(id);
  };
  const c=vm.createContext({
    console,S:{view:'food'},_bootPhase:false,FOOD_TABS:['today','recipes','shopping','pantry'],
    foodState:{tab:'today',todayView:'overview'},foodOverviewState:{search:'rice',category:'lunch',maxMinutes:'30',maxCalories:'600',compareId:'r1'},
    FOOD_SUPPORT:{library:{el:'view-food-library',parent:'today'},review:{el:'view-nutrition-review',parent:'recipes'}},foodSupportReturn:{},
    kitState:{tab:'recipes',search:'kept',cat:'dinner',selectedId:null,scaleServings:null,proteinOptionId:null},
    kitRecipes:[{id:'r1',name:'Rice',servings:4,proteinOptions:[{id:'chicken'},{id:'beef'}]}],
    document:{getElementById:get,querySelector:()=>null},
    localStorage:{setItem:(...a)=>writes.push(a),removeItem:(...a)=>writes.push(a)},lsSave:(...a)=>writes.push(a),
    history:{pushState:(state,_,url)=>history.push({state:copy(state),url})},location:{pathname:'/daily/',search:''},
    setNavActive(){},segSetOn(){},segScrollToTab(){},updateKitFab(){},kitShopRenderAddBar(){},
    closeMenu(){},aiHidePeerOverlays(){},layoutIsDesktop:()=>true,isLandscapePhone:()=>false,
    foodRenderOverview:()=>renders.push('overview'),nutRender:()=>renders.push('log'),
    kitRenderList:()=>renders.push('recipes'),kitShopRender:()=>renders.push('shopping'),kitPantryRender:()=>renders.push('pantry'),
    nutRenderFoods:()=>renders.push('library'),nutRenderRecipes:()=>renders.push('review'),
    kitFindOption:(r,id)=>r.proteinOptions.find(x=>x.id===id),kitDefaultOption:r=>r.proteinOptions[0],
    kitRenderDetail:(id,el)=>{el.recipeId=id;},
    kitCookState:{tickId:null,wakeLock:null,recipeId:null},kitCookRender:()=>renders.push('cook'),navigator:{},clearInterval(){},
    kitResolve:(r,id)=>({variant:true,optionId:id||'chicken'}),showToast(){},kitCookChooseProtein(){},
    setTimeout:fn=>fn(),nutMeal:'snacks'
  });
  c.setView=(view,_,opts={})=>{c.S.view=view;if(view==='food')c.foodSetTab(opts.foodTab||c.foodState.tab,{todayView:opts.foodTodayView||c.foodState.todayView,skipHistory:true});};
  const functions=['dailyHistorySub','dailyHistoryUrl','foodSetTab','foodRenderSection','foodRenderToday','foodSetTodayView','foodOpenLog','foodOpenOverview','foodRefreshToday','foodShowing','foodRefreshActive','foodSyncChrome','foodOpenSupport','foodCloseSupport','foodSupportOpen','foodRenderSupport','foodRefreshSupport','foodCloseSupportKey','foodOpenLibrary','foodCloseLibrary','foodOpenReview','foodCloseReview','foodGo','openFoodToday','kitUsesSplitPane','kitOpenDetail','kitCloseDetail','kitRehomeForLayout','kitRefreshOpenDetail','kitStartCooking','kitExitCooking'];
  vm.runInContext(functions.map(extract).join('\n'),c);
  return {c,get,writes,renders,history};
}

test('Today opens the overview, explicit food-log shortcuts open the one logger, and Back restores overview',()=>{
  const {c,get,renders,history,writes}=fixture(),filters=copy(c.foodOverviewState),recipeFilters=copy(c.kitState);
  c.foodSetTab('today');
  assert.equal(renders.at(-1),'overview');
  assert.equal(get('food-log').classList.contains('hidden'),true);
  c.openFoodToday();
  assert.equal(renders.at(-1),'log');
  assert.equal(get('food-overview').classList.contains('hidden'),true);
  assert.equal(history.at(-1).url,'/daily/#food/log');
  c.foodOpenOverview();
  assert.equal(renders.at(-1),'overview');
  assert.equal(history.at(-1).url,'/daily/#food');
  assert.deepEqual(copy(c.foodOverviewState),filters);
  assert.deepEqual(copy(c.kitState),recipeFilters);
  assert.deepEqual(writes,[]);
});

test('Food section memory survives leaving while primary Today selection deliberately opens overview',()=>{
  const {c}=fixture();
  c.foodSetTab('pantry');
  c.S.view='home';
  c.setView('food');
  assert.equal(c.foodState.tab,'pantry');
  c.foodOpenLog();
  assert.equal(c.foodState.todayView,'log');
  c.foodSetTab('today');
  assert.equal(c.foodState.todayView,'overview');
});

test('browser Back and Forward restore the explicit Today screen without adding history or storage writes',()=>{
  const {c,history,writes}=fixture();
  vm.runInContext(extract('dailyApplyHistoryView'),c);
  c.dailyHistoryTarget=(_raw,state)=>({view:'food',foodTab:state.dailyFoodTab,foodTodayView:state.dailyFoodTodayView});
  c.foodOpenLog();
  const count=history.length;
  c.dailyApplyHistoryView({dailyView:'food',dailyFoodTab:'today',dailyFoodTodayView:'overview'});
  assert.equal(c.foodState.todayView,'overview');
  c.dailyApplyHistoryView({dailyView:'food',dailyFoodTab:'today',dailyFoodTodayView:'log'});
  assert.equal(c.foodState.todayView,'log');
  assert.equal(history.length,count);
  assert.deepEqual(writes,[]);
});

test('incoming nutrition refresh preserves the active Today screen and filter state',()=>{
  const {c,renders,writes}=fixture(),filters=copy(c.foodOverviewState);
  const start=nutrition.indexOf('function nutRefreshConsumers('),end=nutrition.indexOf('\n',start);
  vm.runInContext(nutrition.slice(start,end),c);
  c.nutRefreshLegacyViews=()=>{};
  c.nutRefreshConsumers();
  assert.equal(renders.at(-1),'overview');
  c.foodOpenLog();
  c.nutRefreshConsumers();
  assert.equal(renders.at(-1),'log');
  c.foodSetTab('shopping');
  const before=renders.length;
  c.nutRefreshConsumers();
  assert.equal(renders.length,before,'an inactive Today does not render');
  assert.deepEqual(copy(c.foodOverviewState),filters);
  assert.deepEqual(writes,[]);
});

test('nutOpen retains its explicit logger and entry-highlight contract',()=>{
  const {c}=fixture();
  const start=nutrition.indexOf('function nutOpen('),end=nutrition.indexOf('// The day log.',start);
  vm.runInContext(nutrition.slice(start,end),c);
  c.foodSetTab('recipes');
  let highlighted=null;
  c.document.querySelector=selector=>({selector});
  c.safeScrollIntoView=el=>{highlighted=el.selector;};
  c.nutOpen('lunch','food-42');
  assert.equal(c.foodState.tab,'today');
  assert.equal(c.foodState.todayView,'log');
  assert.equal(c.nutMeal,'lunch');
  assert.equal(highlighted,'[data-nut-entry="food-42"]');
});

test('logging a selected catalogue/custom/recipe food returns to the detailed logger and saves one unchanged snapshot',()=>{
  ['catalog','custom','recipe'].forEach(kind=>{
    const {c,get,renders,writes,history}=fixture();
    vm.runInContext(nutritionFunction('nutLogSelected')+'\n'+nutritionFunction('nutCloseFoodSheet'),c);
    c.nutSelected={id:kind==='recipe'?'recipe:r1':'f1',kind,name:'Selected food',recipe:{id:'r1'}};
    const selected={quantity:2,measure:{id:'serve',label:'serving'},grams:null,nutrition:{calories:420,protein:28,carbs:null,fat:null},status:'known'};
    c.nutSelectionNutrition=()=>selected;
    c.nutSelectedBasis=()=>kind==='recipe'?{optionId:'beef',optionLabel:'Beef'}:{};
    c.nutLog={entries:{existing:{id:'existing',name:'Earlier food'}}};c.nutPrefs={recent:['other','f1']};
    c.nutId=()=> 'food-new';c.getLocalDate=()=> '2026-09-13';
    let saves=0,prefs=0;
    c.nutSaveLog=()=>{saves++;};c.nutSavePrefs=()=>{prefs++;};c.nutRefreshConsumers=()=>c.foodRefreshToday();
    get('nut-log-meal').value='lunch';
    c.foodOpenLog();
    if(kind==='custom')c.foodOpenLibrary();
    c.nutLogSelected();
    assert.equal(c.foodState.todayView,'log');
    assert.equal(c.foodState.tab,'today');
    assert.equal(history.at(-1).url,'/daily/#food/log');
    assert.equal(renders.at(-1),'log');
    assert.equal(c.foodSupportOpen('library'),false);
    assert.equal(get('nutrition-food-overlay').classList.contains('hidden'),true);
    assert.equal(saves,1);assert.equal(prefs,1);
    assert.deepEqual(copy(c.nutLog.entries.existing),{id:'existing',name:'Earlier food'});
    assert.deepEqual(copy(c.nutLog.entries['food-new'].nutrition),selected.nutrition);
    assert.equal(c.nutLog.entries['food-new'].quantity,2);
    assert.equal(c.nutLog.entries['food-new'].meal,'lunch');
    assert.equal(c.nutLog.entries['food-new'].proteinOptionId,kind==='recipe'?'beef':null);
    assert.deepEqual(writes,[],'routing adds no writes beyond the explicitly invoked existing save helpers');
  });
});

test('manual and Unknown entry saves retain the active logger without changing existing snapshot fields',()=>{
  [false,true].forEach(unknown=>{
    const {c,get,renders,history,writes}=fixture();
    vm.runInContext(nutritionFunction('nutSaveManual')+'\n'+nutritionFunction('nutCloseFoodSheet'),c);
    c.nutPos=v=>Number(v)>0?Number(v):null;c.nutNum=v=>v===''||v==null?null:Number(v);c.nutRound=(v,d)=>Math.round(v*10**d)/10**d;
    c.nutId=()=> 'food-manual';c.getLocalDate=()=> '2026-09-13';c.nutEditId=null;c.nutLog={entries:{}};
    let saves=0;c.nutSaveLog=()=>{saves++;};c.nutRefreshConsumers=()=>c.foodRefreshToday();
    const inputs={'name':'Lunch','qty':'1','cal':'350','pro':'20','carb':'','fat':'','meal':'lunch','measure':'bowl'};
    Object.entries(inputs).forEach(([key,value])=>{get('nut-man-'+key).value=value;});
    get('nut-man-unknown').checked=unknown;
    c.foodOpenLog();c.nutSaveManual();
    assert.equal(c.foodState.todayView,'log');
    assert.equal(history.at(-1).url,'/daily/#food/log');
    assert.equal(renders.at(-1),'log');assert.equal(saves,1);
    assert.equal(c.nutLog.entries['food-manual'].nutritionStatus,unknown?'unknown':'known');
    assert.equal(c.nutLog.entries['food-manual'].nutrition.calories,unknown?null:350);
    assert.equal(c.nutLog.entries['food-manual'].measureLabel,'bowl');
    assert.deepEqual(writes,[]);
  });
});

test('Nutrition Review opened from Today returns to its overview and preserves chooser state',()=>{
  const {c,writes}=fixture(),filters=copy(c.foodOverviewState);
  c.foodOpenReview();
  assert.equal(c.foodState.tab,'today');
  assert.equal(c.foodSupportOpen('review'),true);
  c.foodCloseReview();
  assert.equal(c.foodState.tab,'today');
  assert.equal(c.foodState.todayView,'overview');
  assert.deepEqual(copy(c.foodOverviewState),filters);
  assert.deepEqual(writes,[]);
});

test('Food library returns to the logger it was opened from; canonical supporting routes use their parents',()=>{
  const {c,writes}=fixture();
  c.foodOpenLog();c.foodOpenLibrary();c.foodCloseLibrary();
  assert.equal(c.foodState.todayView,'log');
  c.foodOpenSupport('review',{canonical:true});
  assert.equal(c.foodState.tab,'recipes');
  c.foodCloseReview();
  assert.equal(c.foodState.tab,'recipes');
  assert.deepEqual(writes,[]);
});

test('Today recipe details use an overlay on desktop and open the advertised protein option',()=>{
  const {c,get,writes}=fixture(),recipes=copy(c.kitRecipes),filters=copy(c.foodOverviewState);
  c.kitOpenDetail('r1','beef');
  assert.equal(c.kitState.proteinOptionId,'beef');
  assert.equal(c.kitUsesSplitPane(),false);
  assert.equal(get('kit-detail-overlay').style.display,'flex');
  assert.equal(get('kit-detail-overlay').classList.contains('kit-detail-from-today'),true);
  c.kitCloseDetail();
  assert.equal(c.foodState.tab,'today');
  assert.equal(c.foodState.todayView,'overview');
  assert.deepEqual(copy(c.foodOverviewState),filters);
  assert.deepEqual(copy(c.kitRecipes),recipes);
  assert.deepEqual(writes,[]);
});

test('ordinary recipe details retain a selected option when no explicit option is advertised',()=>{
  const {c}=fixture();
  c.foodSetTab('recipes');
  c.kitOpenDetail('r1','beef');
  c.kitOpenDetail('r1');
  assert.equal(c.kitState.proteinOptionId,'beef');
  assert.equal(c.kitUsesSplitPane(),true);
});

test('layout changes on Today never reopen a hidden stale Recipes detail',()=>{
  const {c,get}=fixture();
  c.kitState.selectedId='r1';
  c.kitRehomeForLayout();
  assert.equal(get('kit-detail-overlay').style.display,'none');
  c.kitOpenDetail('r1','beef');
  c.kitRehomeForLayout();
  assert.equal(get('kit-detail-overlay').style.display,'flex');
  assert.equal(c.kitState.proteinOptionId,'beef');
});

test('cooking from Today locks the advertised option and ignores stale hidden detail scaling',()=>{
  const {c,get,writes}=fixture(),recipes=copy(c.kitRecipes),filters=copy(c.foodOverviewState);
  c.kitState.selectedId='r1';c.kitState.scaleServings=10;
  c.kitStartCooking('r1','beef');
  assert.equal(c.kitCookState.proteinOptionId,'beef');
  assert.equal(c.kitCookState.servings,4);
  c.kitExitCooking();
  assert.equal(get('kit-cook-overlay').style.display,'none');
  assert.equal(c.foodState.tab,'today');
  assert.deepEqual(copy(c.foodOverviewState),filters);
  assert.deepEqual(copy(c.kitRecipes),recipes);
  assert.deepEqual(writes,[]);
});

test('cooking from a visible recipe detail retains its deliberate servings choice',()=>{
  const {c}=fixture();
  c.kitOpenDetail('r1','beef');c.kitState.scaleServings=6;
  c.kitStartCooking('r1','beef');
  assert.equal(c.kitCookState.servings,6);
});
