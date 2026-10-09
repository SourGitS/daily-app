const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const schedule=require('../js/notification-schedule.js');
const {manage,deliver,subscription}=require('../functions/service.cjs');
const now=Date.parse('2026-10-09T07:00:00Z'),day=schedule.clock(new Date(now),'UTC').day;
const prefs={workout:{enabled:true,time:'07:00',days:[5]}};
function database(seed={}){
  const values=structuredClone(seed);let queue=Promise.resolve();
  const ref=key=>({
    child:k=>ref(key?key+'/'+k:k),
    once:async()=>({val:()=>structuredClone(values[key]??null)}),
    transaction:fn=>{const p=queue.then(()=>{const next=fn(structuredClone(values[key]??null));if(next!==undefined)values[key]=structuredClone(next);return {committed:next!==undefined,snapshot:{val:()=>values[key]}};});queue=p.catch(()=>{});return p;}
  });return {root:ref(''),ref,values};
}
const sub={endpoint:'https://web.push.apple.com/example',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}};
const token='11111111-1111-4111-8111-111111111111';
const record={uid:'A',token,subscription:sub,zone:'UTC',preferences:prefs,enabled:true,revision:1,expiresAt:now+100000,last:{}};
test('new categories stay off; legacy budget day and workout time survive without modifying source',()=>{
  const raw={workout:{enabled:true,time:'06:15',custom:'retained'},budget:{enabled:true,day:2,time:'19:45'}};
  const before=JSON.stringify(raw),r=schedule.normalise(raw);
  assert.equal(r.workout.time,'06:15');assert.deepEqual(r.budget.days,[2]);assert.equal(r.budget.time,'19:45');
  for(const k of ['workoutPrompt','budgetPrompt','weeklyReport'])assert.equal(r[k].enabled,false);
  assert.equal(JSON.stringify(raw),before);
});
test('selected weekdays, empty selections and a 15-minute catch-up window are respected',()=>{
  assert.equal(schedule.due(prefs,new Date(now),'UTC',{},{}).length,1);
  assert.equal(schedule.due(prefs,new Date(now-60000),'UTC',{},{}).length,0);
  assert.equal(schedule.due(prefs,new Date(now+14*60000),'UTC',{},{}).length,1);
  assert.equal(schedule.due(prefs,new Date(now+15*60000),'UTC',{},{}).length,0);
  assert.equal(schedule.due({...prefs,workout:{...prefs.workout,days:[]}},new Date(now),'UTC',{},{}).length,0);
  assert.equal(schedule.due({...prefs,workout:{...prefs.workout,days:[4]}},new Date(now),'UTC',{},{}).length,0);
});
test('saved workout suppresses both workout categories; deleted and previous-day records do not',()=>{
  const p={workoutPrompt:{enabled:true,time:'07:00',days:[5]}};
  assert.equal(schedule.due(p,new Date(now),'UTC',{a:{date:'2026-10-09'}},{}).length,0);
  assert.equal(schedule.due(p,new Date(now),'UTC',{a:{date:'2026-10-09',deletedAt:1},b:{date:'2026-10-08'}},{}).length,1);
});
test('quiet hours cover midnight and daytime; equal endpoints mean all day',()=>{
  for(const q of [{start:'22:00',end:'08:00'},{start:'06:00',end:'08:00'},{start:'07:00',end:'07:00'}])assert.equal(schedule.due({...prefs,quiet:{enabled:true,...q}},new Date(now),'UTC',{},{}).length,0);
  assert.equal(schedule.due({...prefs,quiet:{enabled:true,start:'22:00',end:'07:00'}},new Date(now),'UTC',{},{}).length,1);
});
test('frequency limits use calendar days and prevent repeated daily sends',()=>{
  assert.equal(schedule.due(prefs,new Date(now),'UTC',{}, {workout:{day}}).length,0);
  assert.equal(schedule.due({...prefs,workout:{...prefs.workout,frequency:3}},new Date(now),'UTC',{}, {workout:{day:day-2}}).length,0);
  assert.equal(schedule.due({...prefs,workout:{...prefs.workout,frequency:3}},new Date(now),'UTC',{}, {workout:{day:day-3}}).length,1);
});
test('a custom reminder takes precedence over matching automated prompts',()=>{
  assert.deepEqual(schedule.due({...prefs,workoutPrompt:{enabled:true,time:'07:00'}},new Date(now),'UTC',{},{}).map(e=>e.channel),['workout']);
});
test('calendar dates follow the saved time zone across midnight and Sydney DST',()=>{
  const c=schedule.clock(new Date('2026-10-08T20:00:00Z'),'Australia/Sydney');assert.equal(c.date,'2026-10-09');assert.equal(c.minutes,7*60);
  assert.equal(schedule.clock(new Date('2026-10-03T16:00:00Z'),'Australia/Sydney').minutes,3*60);
});
test('repeated fall-back hour keeps one event identity and missing spring hour is skipped',()=>{
  const p={budget:{enabled:true,days:[0],time:'01:30'}};
  const a=schedule.due(p,new Date('2026-11-01T05:30:00Z'),'America/New_York',{},{});
  const b=schedule.due(p,new Date('2026-11-01T06:30:00Z'),'America/New_York',{},{});
  assert.equal(a[0].id,b[0].id);
  assert.equal(schedule.due({budget:{enabled:true,days:[0],time:'02:30'}},new Date('2026-03-08T07:00:00Z'),'America/New_York',{},{}).length,0);
});
test('all channels have safe destinations and wording varies by date',()=>{
  for(const k of schedule.channels)assert.ok(['log','budget','stats'].includes(schedule.message({channel:k,day,id:'x'}).route));
  assert.notEqual(schedule.message({channel:'workout',day}).body,schedule.message({channel:'workout',day:day+1}).body);
});
test('wording changes even for a frequency that is a multiple of the message count',async()=>{
  const p={workout:{enabled:true,time:'07:00',frequency:3}},d=database({device:{...record,preferences:p}}),bodies=[];
  for(const offset of [0,3,6]){
    await deliver(d.ref('device'),d.values.device,{},async(s,payload)=>bodies.push(JSON.parse(payload).body),schedule,now+offset*86400000);
    d.values.device.expiresAt=now+30*86400000;
  }
  assert.equal(new Set(bodies).size,3);
});
test('endpoint validation rejects HTTP, arbitrary hosts, credentials, ports and malformed keys',()=>{
  for(const endpoint of ['http://web.push.apple.com/x','https://localhost/x','https://web.push.apple.com.evil.test/x','https://user@web.push.apple.com/x','https://web.push.apple.com:444/x'])assert.throws(()=>subscription({...sub,endpoint}));
  assert.throws(()=>subscription({...sub,keys:{auth:'bad',p256dh:'bad'}}));assert.deepEqual(subscription(sub),sub);
});
test('registration needs authentication and rebinds a device without carrying another account history',async()=>{
  const d=database();await assert.rejects(manage(d.root,null,{action:'register'},schedule,now));
  const {device}=await manage(d.root,'A',{action:'register',token,subscription:sub,zone:'UTC',preferences:prefs},schedule,now);
  d.values[device].last={workout:{day}};
  await manage(d.root,'B',{action:'register',token,subscription:sub,zone:'UTC',preferences:{}},schedule,now);
  assert.equal(d.values[device].uid,'B');assert.deepEqual(d.values[device].last,{});
  await assert.rejects(manage(d.root,'A',{action:'disable',device,token},schedule,now));
});
test('updates, opt-out, renew and device ownership are enforced',async()=>{
  const d=database();const {device}=await manage(d.root,'A',{action:'register',token,subscription:sub,zone:'UTC',preferences:prefs},schedule,now);
  await manage(d.root,'A',{action:'disable',device,token},schedule,now);assert.equal(d.values[device].enabled,false);
  await manage(d.root,'A',{action:'renew',device,token,zone:'UTC'},schedule,now);assert.equal(d.values[device].enabled,false);
  await manage(d.root,'A',{action:'update',device,token,zone:'UTC',preferences:{}},schedule,now);assert.equal(d.values[device].preferences.workout.enabled,false);
  await assert.rejects(manage(d.root,'B',{action:'update',device,token,zone:'UTC',preferences:prefs},schedule,now));
  await assert.rejects(manage(d.root,'A',{action:'renew',device,token,zone:'invented'},schedule,now));
});
test('legacy and foreground acknowledgements survive connecting closed-app delivery',async()=>{
  const d=database();const {device}=await manage(d.root,'A',{action:'register',token,subscription:sub,zone:'UTC',preferences:prefs,acknowledged:{workout:{day},budget:{day:day+20}}},schedule,now);
  assert.equal(d.values[device].last.workout.day,day);assert.equal(d.values[device].last.budget,undefined);
  let sent=0;await deliver(d.ref(device),d.values[device],{},async()=>sent++,schedule,now);assert.equal(sent,0);
});
test('overlapping scheduler invocations claim and send once',async()=>{
  const d=database({device:record});let sent=0;
  await Promise.all([deliver(d.ref('device'),record,{},async()=>sent++,schedule,now),deliver(d.ref('device'),record,{},async()=>sent++,schedule,now)]);
  assert.equal(sent,1);assert.equal(d.values.device.last.workout.day,day);
});
test('disabled, expired, quiet and already-trained devices send nothing',async()=>{
  for(const r of [{...record,enabled:false},{...record,expiresAt:now},{...record,trainedDate:'2026-10-09'},{...record,preferences:{...prefs,quiet:{enabled:true,start:'00:00',end:'23:59'}}}]){
    const d=database({device:r});let sent=0;await deliver(d.ref('device'),r,{},async()=>sent++,schedule,now);assert.equal(sent,0);
  }
});
test('opt-out or revision change during a scheduling run cancels dispatch',async()=>{
  const d=database({device:{...record,enabled:false}});let sent=0;await deliver(d.ref('device'),record,{},async()=>sent++,schedule,now);assert.equal(sent,0);
  d.values.device={...record,revision:2};await deliver(d.ref('device'),record,{},async()=>sent++,schedule,now);assert.equal(sent,0);
});
test('ambiguous transport failure is never retried; an expired subscription is disabled',async()=>{
  for(const statusCode of [undefined,410]){
    const d=database({device:record});let sent=0;const send=async()=>{sent++;throw {statusCode};};
    await deliver(d.ref('device'),record,{},send,schedule,now);await deliver(d.ref('device'),d.values.device,{},send,schedule,now);
    assert.equal(sent,1);if(statusCode)assert.equal(d.values.device.enabled,false);
  }
});
function client(permission='default'){
  let requested=0,binding=null,status='',timers=0;
  const listeners={},store=new Map();
  const c=vm.createContext({console,URL,URLSearchParams,Intl,Date,Promise,Set,Math,Number,JSON,Uint8Array,AbortSignal,crypto:require('node:crypto').webcrypto,
    DAILY_PUSH_CONFIG:{enabled:true,publicKey:'test',region:'australia-southeast1'},DailyNotificationSchedule:schedule,
    window:{Notification:{},PushManager:{},indexedDB:{},addEventListener:(k,f)=>listeners[k]=f},
    Notification:{permission,requestPermission:async()=>{requested++;return 'denied';}},navigator:{userAgent:'Desktop',serviceWorker:{ready:Promise.resolve({}),addEventListener:()=>{}}},
    document:{hidden:false,addEventListener:(k,f)=>listeners[k]=f,getElementById:()=>null},matchMedia:()=>({matches:false}),
    localStorage:{scope:'user:A',getItem:k=>store.get(k)||null},auth:{currentUser:{uid:'A',getIdToken:async()=>''}},
    dailyNotifyBinding:async()=>binding,dailyNotifyBind:async b=>binding=b,dailyNotifyPatch:async(scope,token,p)=>{if(binding?.scope===scope&&binding?.token===token)binding={...binding,...p};},
    lsLoad:(k,d)=>store.has(k)?JSON.parse(store.get(k)):d,lsSave:(k,v)=>store.set(k,JSON.stringify(v)),
    setInterval:()=>++timers,clearInterval:()=>{},load:()=>[],setView:v=>status=v,setStatsTab:v=>status+=':'+v,
    history:{state:null,replaceState:()=>{}},location:{href:'https://example.test/'},kitEsc:s=>s});
  vm.runInContext(fs.readFileSync('js/notifications.js','utf8'),c);
  return {c,store,set binding(v){binding=v;},get binding(){return binding;},get requested(){return requested;},get status(){return status;},get timers(){return timers;}};
}
test('startup, resume and enabling a category never request notification permission',async()=>{
  const f=client();f.c.checkReminders();f.c.checkReminders();f.c.saveReminderField('workout','enabled',true);await f.c.dailyNotifyResume();await f.c.dailyNotifyTick();
  assert.equal(f.requested,0);assert.equal(f.timers,1);
});
test('permission denial writes no binding and an explicit denied retry does not prompt again',async()=>{
  const f=client();await f.c.dailyNotifyEnable();assert.equal(f.requested,1);assert.equal(f.binding,null);
  const denied=client('denied');await denied.c.dailyNotifyEnable();assert.equal(denied.requested,0);
});
test('failed server updates pause delivery and retry restores it without a permission prompt',async()=>{
  const f=client('granted');f.binding={scope:'user:A',token,enabled:true,remote:true,device:'a'.repeat(64)};
  f.c.dailyNotifyCall=async()=>{throw new Error('offline');};
  assert.equal(await f.c.dailyNotifyUpdate(),false);assert.equal(f.binding.enabled,false);assert.equal(f.binding.pending,true);
  f.c.dailyNotifyCall=async()=>({});
  assert.equal(await f.c.dailyNotifyUpdate(),true);assert.equal(f.binding.enabled,true);assert.equal(f.binding.pending,false);assert.equal(f.requested,0);
});
test('master opt-out revokes the token, unsubscribes, disables the server and preserves chosen settings',async()=>{
  const f=client('granted');f.binding={scope:'user:A',token,enabled:true,remote:true,device:'a'.repeat(64)};
  f.store.set('daily_reminders',JSON.stringify(prefs));let unsubscribed=0,disabled=0;
  f.c.navigator.serviceWorker.getRegistration=async()=>({pushManager:{getSubscription:async()=>({unsubscribe:async()=>unsubscribed++})},getNotifications:async()=>[]});
  f.c.dailyNotifyCall=async action=>{if(action==='disable')disabled++;return {};};
  await f.c.dailyNotifyStop();assert.equal(f.binding.enabled,false);assert.equal(f.binding.remote,false);assert.notEqual(f.binding.token,token);
  assert.equal(unsubscribed,1);assert.equal(disabled,1);assert.deepEqual(JSON.parse(f.store.get('daily_reminders')),prefs);assert.equal(f.requested,0);
});
test('iPhone permission is requested only from the installed Home Screen app',async()=>{
  const f=client();f.c.navigator.userAgent='iPhone';await f.c.dailyNotifyEnable();assert.equal(f.requested,0);
  f.c.navigator.standalone=true;await f.c.dailyNotifyEnable();assert.equal(f.requested,1);
});
test('an opt-out during an in-flight update cannot reactivate the device',async()=>{
  const f=client('granted');f.binding={scope:'user:A',token,enabled:true,remote:true,device:'a'.repeat(64)};
  let release,started;const running=new Promise(r=>started=r);
  f.c.dailyNotifyCall=async action=>{if(action==='update'){started();await new Promise(r=>release=r);}return {};};
  f.c.navigator.serviceWorker.getRegistration=async()=>undefined;
  const update=f.c.dailyNotifyUpdate();await running;
  const stop=f.c.dailyNotifyStop();await new Promise(r=>setImmediate(r));release();await Promise.all([stop,update]);
  assert.equal(f.binding.enabled,false);assert.equal(f.binding.remote,false);assert.notEqual(f.binding.token,token);
});
test('notification click reaches weekly review and rejects stale account tokens or unsafe routes',async()=>{
  const f=client('granted');f.binding={scope:'user:A',token,enabled:true};
  await f.c.dailyNotifyOpen({scope:'user:B',token,route:'log'});assert.equal(f.status,'');
  await f.c.dailyNotifyOpen({scope:'user:A',token:'other',route:'log'});assert.equal(f.status,'');
  await f.c.dailyNotifyOpen({scope:'user:A',token,route:'https://evil.test'});assert.equal(f.status,'');
  await f.c.dailyNotifyOpen({scope:'user:A',token,route:'stats'});assert.equal(f.status,'stats:review');
});
