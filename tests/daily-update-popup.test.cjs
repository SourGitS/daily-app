const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {extract}=require('./harness.cjs');
function fixture({profile={name:'Sample user',onboardingVersion:2,budgetRhythmSeen:2},stored=profile,cloud=2,scope='user:A',uid='A',ready=true}={}){
 const stores=new Map([['daily_profile',JSON.stringify(stored)],['wt_split','saved neutral split']]),writes=[],remote=[],state={cloud,popup:null,blocked:false,overlays:[],onboardingHidden:true};
 const context=vm.createContext({console,Date,Math,Number,Set,JSON,profileData:JSON.parse(JSON.stringify(profile)),
  auth:{currentUser:uid?{uid}:null},_cloudWorkoutReady:ready,
  localStorage:{scope,getItem:key=>stores.get(key)??null,setItem:(key,value)=>{writes.push(key);stores.set(key,String(value));}},
  document:{body:{},getElementById:id=>id==='daily-update-dialog'?state.popup:id==='onboarding-overlay'?{classList:{contains:()=>state.onboardingHidden,add:()=>{state.onboardingHidden=true;}}}:null,
   querySelector:()=>state.blocked?{}:null,querySelectorAll:selector=>selector==='.daily-update-banner'?[]:state.overlays},
  getComputedStyle:el=>({visibility:el.visibility||'visible'}),
  fbRef:path=>({child:key=>({transaction:fn=>{state.cloud=fn(state.cloud);remote.push({path:path+'/'+key,value:state.cloud});return Promise.resolve();}})}),
  cancelAnimationFrame(){}});
 vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),context);
 const popup=(owner=context.dailyUpdateIdentity(),preview=false)=>state.popup={dataset:{owner,...(preview?{preview:'true'}:{})},open:true,close(){this.open=false;},remove(){state.popup=null;}};
 return {context,stores,writes,remote,state,popup};
}
test('version3 is offered to existing version2 profiles and suppressed for version3 or later',()=>{
 const {context:c}=fixture();assert.equal(c.dailyUpdatePopupEligible(),true);
 c.profileData.budgetRhythmSeen=3;assert.equal(c.dailyUpdatePopupEligible(),false);c.profileData.budgetRhythmSeen=8;assert.equal(c.dailyUpdatePopupEligible(),false);
 c.profileData.budgetRhythmSeen=0;assert.equal(c.dailyUpdatePopupEligible(),true);
});
test('new onboarding and signed-in or account-scoped restores cannot be interrupted',()=>{
 const {context:c,state}=fixture({profile:{name:'New user'},ready:true});assert.equal(c.dailyUpdateReady(),false);assert.equal(c.dailyUpdatePopupEligible(),false);
 c.profileData.onboardingVersion=2;c._cloudWorkoutReady=false;assert.equal(c.dailyUpdateReady(),false);
 c.auth.currentUser=null;assert.equal(c.dailyUpdateReady(),false,'a user-scoped document still waits before auth settles');
 c.localStorage.scope='guest';assert.equal(c.dailyUpdateReady(),true,'completed local onboarding can receive the update');
 state.onboardingHidden=false;assert.equal(c.dailyUpdatePopupBlocked(),true);
});
test('an existing dialog or visible editor postpones the popup without storing an acknowledgement',()=>{
 const {context:c,state,writes}=fixture();state.blocked=true;assert.equal(c.dailyUpdatePopupBlocked(),true);
 state.blocked=false;state.overlays=[{getClientRects:()=>[{}],visibility:'visible'}];assert.equal(c.dailyUpdatePopupBlocked(),true);
 state.overlays[0].visibility='hidden';assert.equal(c.dailyUpdatePopupBlocked(),false);
 state.overlays=[{getClientRects:()=>[],visibility:'visible'}];assert.equal(c.dailyUpdatePopupBlocked(),false);assert.deepEqual(writes,[]);
});
test('dismissal acknowledges only the existing profile marker and preserves other profile values',()=>{
 const f=fixture();f.popup();f.context.dailyUpdateDismiss();
 assert.equal(f.context.profileData.budgetRhythmSeen,3);assert.equal(JSON.parse(f.stores.get('daily_profile')).name,'Sample user');
 assert.deepEqual(f.writes,['daily_profile']);assert.deepEqual(f.remote,[{path:'profile/budgetRhythmSeen',value:3}]);assert.equal(f.state.popup,null);
 assert.deepEqual(Object.keys(JSON.parse(f.stores.get('daily_profile'))).sort(),['budgetRhythmSeen','name','onboardingVersion']);
});
test('dismissal never lowers newer in-memory, locally stored or cloud acknowledgements',()=>{
 for(const [current,stored,cloud,expectedLocal,expectedCloud] of [[5,2,2,5,5],[2,6,2,6,6],[2,2,7,3,7]]){
  const f=fixture({profile:{name:'User',onboardingVersion:2,budgetRhythmSeen:current},stored:{name:'User',onboardingVersion:2,budgetRhythmSeen:stored},cloud});f.popup();f.context.dailyUpdateDismiss();
  assert.equal(f.context.profileData.budgetRhythmSeen,expectedLocal);assert.equal(JSON.parse(f.stores.get('daily_profile')).budgetRhythmSeen,expectedLocal);assert.equal(f.state.cloud,expectedCloud);
 }
});
test('a stale popup after an account or storage-scope change closes without acknowledging the new account',()=>{
 for(const change of ['uid','scope']){
  const f=fixture();f.popup();if(change==='uid')f.context.auth.currentUser={uid:'B'};else f.context.localStorage.scope='user:B';
  f.context.profileData={name:'Other user',onboardingVersion:2,budgetRhythmSeen:2};f.context.dailyUpdateDismiss();
  assert.equal(f.state.popup,null);assert.equal(f.context.profileData.budgetRhythmSeen,2);assert.deepEqual(f.writes,[]);assert.deepEqual(f.remote,[]);
 }
});
test('a restored cloud acknowledgement removes the ordinary popup without another write',()=>{
 const f=fixture();f.popup();f.context.profileData.budgetRhythmSeen=3;f.context.dailyUpdateRefresh();
 assert.equal(f.state.popup,null);assert.deepEqual(f.writes,[]);assert.deepEqual(f.remote,[]);
 const preview=fixture({profile:{name:'User',onboardingVersion:2,budgetRhythmSeen:3}});preview.popup(undefined,true);preview.context.dailyUpdatePopupCheck();assert.ok(preview.state.popup,'explicit review previews remain open');
});
test('onboarding completion starts caught up with the current update and preserves a higher version',()=>{
 for(const seen of [undefined,7]){
  const f=fixture({profile:{name:'New user',...(seen?{budgetRhythmSeen:seen}:{})}}),c=f.context;
  Object.assign(c,{obCaptureCurrent(){},obData:{name:'New user',splitSkipped:true},OB_VERSION:2,WHATS_NEW_VERSION:4,
   syncProfileToFirebase(){},budDefaults:{},syncBudDefaultsToFirebase(){},seedBudgetCategoriesFromConfig(){},S:{sessions:[]},obStepShown:()=>false,obDetachAuthWatch(){},renderHome(){}});
  vm.runInContext(extract('finishOnboarding'),c);c.finishOnboarding();
  assert.equal(c.profileData.budgetRhythmSeen,seen||3);assert.equal(c.dailyUpdatePopupEligible(),false);
 }
});
