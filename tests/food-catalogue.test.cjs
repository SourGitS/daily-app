const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {extract,extractConst,Store,Cloud}=require('./harness.cjs');
const raw=fs.readFileSync(path.join(__dirname,'../catalogue/food-catalogue.json'),'utf8');
const catalogue=fs.readFileSync(path.join(__dirname,'../js/food-catalogue.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function fixture(saved){
  const store=new Store(saved===undefined?{}:{kitchen_recipes:JSON.stringify(saved)});
  const status=[],cloud=new Cloud();let fetches=0;
  const context=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,JSON,Math,Date,
    document:{baseURI:'https://daily.test/app/',getElementById:()=>null,querySelector:()=>null},
    localStorage:store,kitRecipes:saved||[],profileData:{},S:{view:'home',sessions:[]},
    _bootPhase:false,_syncApplying:0,_cloudWorkoutReady:true,_cloudReadFailed:false,
    firebaseReady:false,auth:{currentUser:null},db:null,
    dailyAccountMatches:()=>true,foodRefreshActive:()=>{},foodRefreshSupport:()=>{},
    setSyncStatus:()=>{},showToast:()=>{},
    fetch:async()=>{fetches++;return {ok:true,text:async()=>raw};},
  });
  const tables=['KIT_VULGAR_FRACTIONS','KIT_IMPORT_CATS'].map(extractConst).join('\n');
  const helpers=['kitQtyValue','kitQtyParse','kitQtyStore','kitIsProteinStep','kitProteinStepProblem','kitParseImport','kitLoadRecipes','fbRef','fbSeedIfEmpty','kitSaveRecipes','lsSave','stampFor'].map(extract).join('\n');
  vm.runInContext(tables+'\n'+helpers+'\n'+catalogue+'\n;globalThis.state=foodCatalogueState;',context);
  context.foodCatalogueStatus=message=>status.push(message);
  return {c:context,store,status,cloud,get fetches(){return fetches;}};
}

test('the original bundle validates unchanged; unknown quantities and source units survive',async()=>{
  const f=fixture(),recipes=await f.c.foodCatalogueLoad(),original=JSON.parse(raw).recipes;
  assert.equal(recipes.length,6);
  recipes.forEach((r,i)=>{
    assert.equal(r.name,original[i].name);assert.deepEqual(plain(r.steps),original[i].steps);
    r.ingredients.forEach((ing,j)=>{
      assert.equal(ing.amount,original[i].ingredients[j].amount);
      assert.equal(ing.unit,original[i].ingredients[j].unit);
    });
  });
  assert.equal(f.c.foodCatalogueAmount(recipes[0].ingredients.find(i=>i.name==='Limes')),'Amount unspecified');
  assert.match(f.c.foodCatalogueTime(recipes[5],5),/plus prep and marinating/);
  await f.c.foodCatalogueLoad();assert.equal(f.fetches,1);
  assert.equal(f.store.getItem('kitchen_recipes'),null,'preview never writes recipes');
});

test('opening a fresh book returns empty without seeding legacy sample recipes',()=>{
  const f=fixture();assert.deepEqual(plain(f.c.kitLoadRecipes()),[]);
  assert.equal(f.store.getItem('kitchen_recipes'),null);
});

test('new-user detection excludes established profiles, deliberately empty books and loading accounts',()=>{
  const f=fixture();assert.equal(f.c.foodCatalogueNewUser(),true);
  f.c.profileData.onboardingVersion=2;assert.equal(f.c.foodCatalogueNewUser(),false);
  f.c.profileData={};f.store.setItem('kitchen_recipes','[]');assert.equal(f.c.foodCatalogueNewUser(),false);
  f.store.removeItem('kitchen_recipes');f.c.auth.currentUser={uid:'u'};f.c._cloudWorkoutReady=false;
  assert.equal(f.c.foodCatalogueNewUser(),false);
  f.c._cloudWorkoutReady=true;f.c._cloudReadFailed=true;assert.equal(f.c.foodCatalogueNewUser(),false);
});

test('explicit pending new-user setup installs exactly six; deleting them does not reseed',async()=>{
  const f=fixture();await f.c.foodCatalogueEnsureStarter();assert.equal(f.store.getItem('kitchen_recipes'),null);
  f.c.profileData={onboardingVersion:2,foodCatalogueStarter:1};
  await f.c.foodCatalogueEnsureStarter();
  assert.equal(JSON.parse(f.store.getItem('kitchen_recipes')).length,6);
  assert.equal(f.c.profileData.foodCatalogueStarter,2);
  f.store.setItem('kitchen_recipes','[]');f.c.kitRecipes=[];
  await f.c.foodCatalogueEnsureStarter();assert.equal(f.store.getItem('kitchen_recipes'),'[]');
});

test('pending starter preserves an existing or explicitly empty local book',async()=>{
  for(const saved of [[],[{id:'my-recipe',name:'My recipe',ingredients:[]}]]){
    const f=fixture(saved);f.c.profileData.foodCatalogueStarter=1;
    await f.c.foodCatalogueEnsureStarter();assert.deepEqual(JSON.parse(f.store.getItem('kitchen_recipes')),saved);
    assert.equal(f.c.profileData.foodCatalogueStarter,2);
  }
});

test('new-user seeding uses an empty-cloud transaction and does not overwrite a competing recipe book',async()=>{
  const f=fixture();f.c.profileData.foodCatalogueStarter=1;f.c.auth.currentUser={uid:'u'};
  f.c.firebaseReady=true;f.c.db={ref:p=>f.cloud.ref(p)};
  const existing={v:JSON.stringify([{id:'other-device',name:'Saved elsewhere'}]),t:500};
  f.cloud.put('users/u/kitRecipes',existing);
  await f.c.foodCatalogueEnsureStarter();
  assert.deepEqual(f.cloud.get('users/u/kitRecipes'),existing);
  assert.equal(f.store.getItem('kitchen_recipes'),null);
  assert.equal(f.cloud.writes.filter(w=>w.path.endsWith('/kitRecipes')).length,0);
});

test('new-user seeding succeeds into a verified empty cloud book',async()=>{
  const f=fixture();f.c.profileData.foodCatalogueStarter=1;f.c.auth.currentUser={uid:'u'};
  f.c.firebaseReady=true;f.c.db={ref:p=>f.cloud.ref(p)};
  await f.c.foodCatalogueEnsureStarter();
  assert.equal(JSON.parse(f.cloud.get('users/u/kitRecipes').v).length,6);
  assert.equal(f.store.getItem('kitchen_recipes'),f.cloud.get('users/u/kitRecipes').v);
});

test('name matching keeps edited existing recipes; catalogue identity survives a rename',async()=>{
  const f=fixture(),recipes=await f.c.foodCatalogueLoad();
  const edited={id:'mine',name:'  BIRRIA   TACOS ',description:'My own version',ingredients:[{name:'Beef',amount:999,unit:'g'}]};
  const first=f.c.foodCatalogueBuild(recipes,[edited],[0,1,2,3,4,5]);
  assert.equal(first.added,5);assert.deepEqual(plain(first.recipes[0]),edited);
  first.recipes[1].name='My own Alfredo';
  const again=f.c.foodCatalogueBuild(recipes,first.recipes,[0,1,2,3,4,5]);
  assert.equal(again.added,0);assert.deepEqual(plain(again.recipes),plain(first.recipes));
});

test('adding keeps unrelated recipes and repeating the action does not duplicate them',async()=>{
  const saved=[{id:'mine',name:'My lunch',favourite:true}],f=fixture(saved);
  await f.c.foodCatalogueAdd([0,1]);await f.c.foodCatalogueAdd([0,1]);
  const result=JSON.parse(f.store.getItem('kitchen_recipes'));
  assert.equal(result.length,3);assert.deepEqual(result[0],saved[0]);
  assert.match(f.status.at(-1),/already in your recipe book/);
});

test('loading failure, full storage and account changes cannot report a successful addition',async()=>{
  const f=fixture([{id:'mine',name:'My lunch'}]);
  f.c.fetch=async()=>{throw new Error('offline');};await f.c.foodCatalogueAdd([0]);
  assert.equal(f.c.kitRecipes.length,1);assert.match(f.status.at(-1),/offline/);
  f.c.fetch=async()=>({ok:true,text:async()=>raw});await f.c.foodCatalogueLoad();
  f.store.fail=true;await f.c.foodCatalogueAdd([0]);
  assert.equal(f.c.kitRecipes.length,1);assert.match(f.status.at(-1),/could not be saved/);
  const switched=fixture();let resolve;
  switched.c.fetch=()=>new Promise(r=>{resolve=r;});
  const add=switched.c.foodCatalogueAdd([0]);switched.c.auth.currentUser={uid:'next'};
  resolve({ok:true,text:async()=>raw});await add;
  assert.equal(switched.store.getItem('kitchen_recipes'),null);
});

test('catalogue acknowledgement is monotonic and only explicit acknowledgement writes it',()=>{
  const f=fixture();assert.equal(f.store.getItem('daily_profile'),null);
  f.c.foodCatalogueAcknowledge();assert.equal(f.c.profileData.foodCatalogueSeen,1);
  f.c.foodCatalogueFlag('foodCatalogueSeen',0);assert.equal(f.c.profileData.foodCatalogueSeen,1);
});
