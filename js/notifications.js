'use strict';
let dailyNotifyTimer=null,dailyNotifyBusy=false,dailyNotifyStarted=false,dailyNotifyStatus='';
let dailyNotifyQueue=Promise.resolve();
function dailyNotifyScope(){return localStorage.scope||'legacy';}
function dailyNotifyZone(){return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
function dailyNotifyUser(){return typeof auth!=='undefined'&&auth?auth.currentUser:null;}
function dailyNotifySupported(){return 'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window&&'indexedDB' in window;}
async function dailyNotifyCall(action,data){
  const user=dailyNotifyUser();
  if(!DAILY_PUSH_CONFIG.enabled||!user)throw new Error('Closed-app delivery needs the push service and a signed-in account.');
  const token=await user.getIdToken();
  const response=await fetch('https://'+DAILY_PUSH_CONFIG.region+'-'+firebaseConfig.projectId+'.cloudfunctions.net/dailyNotifications',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data:{action,...data}}),signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  if(!response.ok||result.error)throw new Error(result.error?.message||'The push service could not save this change.');
  if(dailyNotifyUser()?.uid!==user.uid)throw new Error('Account changed. Try again in the current account.');
  return result.result;
}
function dailyNotifyFeedback(message){
  dailyNotifyStatus=message;
  const status=document.getElementById('notification-status');if(status)status.textContent=message;
}
async function dailyNotifyEnable(){
  if(dailyNotifyBusy)return;
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  if(ios&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches){dailyNotifyFeedback('On iPhone, add Daily to your Home Screen, open it there, then tap Enable notifications.');return;}
  if(!dailyNotifySupported()){dailyNotifyFeedback('System notifications are not supported in this browser.');return;}
  if(!DAILY_PUSH_CONFIG.enabled||!DAILY_PUSH_CONFIG.publicKey){dailyNotifyFeedback('Closed-app delivery is awaiting push-service setup. Your reminder settings are saved.');return;}
  const user=dailyNotifyUser(),scope=dailyNotifyScope();
  if(!user){dailyNotifyFeedback('Sign in before enabling notifications on this device.');return;}
  dailyNotifyBusy=true;
  // Permission must be requested before any asynchronous setup loses the tap's activation.
  const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
  try{
    if(await permission!=='granted')throw new Error('Notifications are blocked. You can allow them in browser or iPhone Settings.');
    const registration=await navigator.serviceWorker.ready;
    if(dailyNotifyScope()!==scope||dailyNotifyUser()?.uid!==user.uid)throw new Error('Account changed. Try again.');
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      const encoded=DAILY_PUSH_CONFIG.publicKey.replace(/-/g,'+').replace(/_/g,'/');
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    }
    const old=await dailyNotifyBinding(),token=crypto.randomUUID();
    const preferences=loadReminders(),acknowledged={...(old?.scope===scope?old.last:{})};
    for(const channel of ['workout','budget']){
      const date=localStorage.getItem('daily_reminder_'+channel+'_date');
      if(/^\d{4}-\d{2}-\d{2}$/.test(date||''))acknowledged[channel]={day:Math.floor(Date.parse(date+'T00:00:00Z')/86400000)};
    }
    const result=await dailyNotifyCall('register',{subscription:subscription.toJSON(),token,zone:dailyNotifyZone(),preferences,acknowledged});
    if(dailyNotifyScope()!==scope||dailyNotifyUser()?.uid!==user.uid)throw new Error('Account changed. Try again.');
    await dailyNotifyBind({scope,token,device:result.device,enabled:true,remote:true,last:acknowledged,preferences:JSON.stringify(preferences),receipts:old?.receipts||{}});
    dailyNotifyFeedback('Notifications connected on this device. Choose the reminders and prompts you want below.');
  }catch(e){dailyNotifyFeedback(e.message);}finally{dailyNotifyBusy=false;}
}
function dailyNotifyUpdate(){
  dailyNotifyQueue=dailyNotifyQueue.catch(()=>{}).then(async()=>{
    const b=await dailyNotifyBinding();
    if(!b||b.scope!==dailyNotifyScope()||!b.remote)return;
    await dailyNotifyPatch(b.scope,b.token,{enabled:false,pending:true});
    try{
      const preferences=loadReminders();
      await dailyNotifyCall('update',{device:b.device,token:b.token,zone:dailyNotifyZone(),preferences});
      const current=await dailyNotifyBinding();
      if(current?.token!==b.token||!current.remote)return false;
      await dailyNotifyPatch(b.scope,b.token,{enabled:true,pending:false,preferences:JSON.stringify(preferences)});
      dailyNotifyFeedback('Reminder settings saved for closed-app delivery.');
      return true;
    }catch(e){
      // Suspend locally so delayed packets cannot disregard an offline opt-out or edit.
      await dailyNotifyPatch(b.scope,b.token,{enabled:false,pending:true});
      dailyNotifyFeedback('Saved on this device. Delivery is paused here until the server update succeeds. Retry when online.');
      return false;
    }
  });
  return dailyNotifyQueue;
}
async function dailyNotifyStop(){
  const b=await dailyNotifyBinding();
  if(b)await dailyNotifyPatch(b.scope,b.token,{enabled:false,remote:false,token:crypto.randomUUID()});
  let unsubscribeFailed=false;
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      const sub=reg&&await reg.pushManager.getSubscription();
      if(sub&&!await sub.unsubscribe())unsubscribeFailed=true;
      if(reg)(await reg.getNotifications()).forEach(n=>n.close());
    }catch(e){unsubscribeFailed=true;}
  }
  if(b?.remote){
    await dailyNotifyQueue.catch(()=>{});
    try{await dailyNotifyCall('disable',{device:b.device,token:b.token});}
    catch(e){dailyNotifyFeedback('Notifications stopped on this device. Server cleanup will expire automatically.');return;}
  }
  dailyNotifyFeedback('Notifications stopped on this device. Your chosen days and times are kept.'+(unsubscribeFailed?' Browser subscription cleanup needs a retry.':''));
}
async function dailyNotifyTick(){
  if(dailyNotifyBusy||document.hidden||!dailyNotifySupported()||Notification.permission!=='granted')return;
  dailyNotifyBusy=true;
  try{
    let b=await dailyNotifyBinding();
    if(b?.scope!==dailyNotifyScope())return;
    if(!b?.enabled||b.remote)return;
    const r=loadReminders(),events=DailyNotificationSchedule.due(r,new Date(),dailyNotifyZone(),load(),b.last);
    const reg=await navigator.serviceWorker.ready;
    for(const e of events){
      if(localStorage.getItem('daily_reminder_'+e.channel+'_date')===e.date)continue;
      if(!await dailyNotifyClaim(b.token,e.id,e.channel,e.day))continue;
      const claimed=await dailyNotifyBinding();
      const m=DailyNotificationSchedule.message({...e,wordIndex:claimed?.last?.[e.channel]?.wordIndex});
      await reg.showNotification(m.title,{body:m.body,icon:'assets/brand/daily-app-icon-192.png',tag:e.id,data:{...m,token:b.token,scope:b.scope,day:e.day}});
    }
  }catch(e){console.warn('Reminder check failed',e);}finally{dailyNotifyBusy=false;}
}
async function dailyNotifyLocalEnable(){
  if(!dailyNotifySupported())return dailyNotifyFeedback('System notifications are not supported in this browser.');
  const scope=dailyNotifyScope();
  const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
  if(permission!=='granted')return dailyNotifyFeedback('Notifications are blocked. Allow them in browser Settings to try again.');
  const b=await dailyNotifyBinding();
  if(scope!==dailyNotifyScope())return;
  if(b?.remote)return dailyNotifyFeedback('Closed-app notifications are already connected.');
  await dailyNotifyBind({scope,token:crypto.randomUUID(),enabled:true,remote:false,last:b?.scope===scope?b.last:{},receipts:b?.receipts||{}});
  dailyNotifyFeedback('Open-app reminders enabled. Keep Daily open; this mode cannot deliver while Daily is closed.');
  dailyNotifyTick();
}
function checkReminders(){
  if(dailyNotifyStarted)return;
  dailyNotifyStarted=true;
  const run=()=>{
    clearInterval(dailyNotifyTimer);dailyNotifyTimer=null;
    if(!document.hidden){dailyNotifyTick();dailyNotifyTimer=setInterval(dailyNotifyTick,30000);}
  };
  const resume=()=>{run();if(!document.hidden)dailyNotifyResume().catch(()=>{});};
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pageshow',resume);
  window.addEventListener('pagehide',()=>{clearInterval(dailyNotifyTimer);dailyNotifyTimer=null;});
  window.addEventListener('online',()=>dailyNotifyUpdate().then(()=>dailyNotifyResume()));
  navigator.serviceWorker?.addEventListener('message',e=>{
    if(e.data?.type==='daily-notification-open')dailyNotifyOpen(e.data);
  });
  dailyNotifyResume().catch(()=>{});run();
}
async function dailyNotifyResume(){
  if(!dailyNotifySupported())return;
  const b=await dailyNotifyBinding();
  if(b&&b.scope!==dailyNotifyScope()){await dailyNotifyPatch(b.scope,b.token,{enabled:false});return;}
  if(b?.remote&&dailyNotifyUser()){
    if(Notification.permission!=='granted'){await dailyNotifyStop();return;}
    try{
      await dailyNotifyCall('renew',{device:b.device,token:b.token,zone:dailyNotifyZone()});
      if(b.pending||b.preferences!==JSON.stringify(loadReminders()))await dailyNotifyUpdate();
    }catch(e){dailyNotifyFeedback('Closed-app connection needs attention. Use Enable notifications to reconnect.');}
  }
  const params=new URLSearchParams(location.search);
  if(params.has('dailyNotification'))dailyNotifyOpen({token:params.get('dailyToken'),scope:params.get('dailyScope'),route:params.get('dailyNotification')});
}
async function dailyNotifyOpen(data){
  const b=await dailyNotifyBinding();
  if(!b?.enabled||b.scope!==dailyNotifyScope()||data.token!==b.token||data.scope!==b.scope)return;
  if(!['log','budget','stats'].includes(data.route))return;
  setView(data.route);
  if(data.route==='stats')setStatsTab('review');
  const url=new URL(location.href);['dailyNotification','dailyToken','dailyScope'].forEach(k=>url.searchParams.delete(k));
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
}
function loadReminders(){return lsLoad('daily_reminders',{});}
function saveReminders(r){lsSave('daily_reminders',r);return JSON.stringify(lsLoad('daily_reminders',{}))===JSON.stringify(r);}
function saveReminderField(type,field,value){
  const r=loadReminders();r[type]=r[type]||{};r[type][field]=value;
  if(!saveReminders(r)){dailyNotifyFeedback('Could not save settings. Check available device storage.');return;}
  dailyNotifyUpdate();
}
async function dailyNotifyWorkoutSaved(date){
  const b=await dailyNotifyBinding();if(!b||b.scope!==dailyNotifyScope())return;
  await dailyNotifyPatch(b.scope,b.token,{trainedDate:date});
  if(b.remote)await dailyNotifyCall('workout',{device:b.device,token:b.token});
}
function dailyNotifyDay(type,day,checked){
  const r=DailyNotificationSchedule.normalise(loadReminders());
  saveReminderField(type,'days',checked?[...new Set([...r[type].days,day])]:r[type].days.filter(d=>d!==day));
}
function renderRemindersSection(){
  const wrap=document.getElementById('reminders-inner');if(!wrap)return;
  const r=DailyNotificationSchedule.normalise(loadReminders()),days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labels={workout:'Workout reminders',budget:'Budget reminders',workoutPrompt:'Workout prompts',budgetPrompt:'Budget update prompts',weeklyReport:'Weekly report prompts'};
  let h='<p class="stg-help">Choose notifications separately. New prompts start off. Settings apply to this account on this device.</p>';
  if(!DAILY_PUSH_CONFIG.enabled)h+='<p class="stg-status">Closed-app delivery awaits push-service setup. Open-app reminders need Daily to stay open.</p>';
  if(!dailyNotifySupported())h+='<p class="stg-help">On iPhone (iOS 16.4 or later), add Daily to your Home Screen and open it there to enable notifications.</p>';
  if('Notification' in window&&Notification.permission==='denied')h+='<p class="stg-status err">Notifications are blocked. Allow Daily in browser or iPhone Settings; Daily will not ask again automatically.</p>';
  h+='<div class="stg-actions"><button class="stg-btn primary" onclick="dailyNotifyEnable()">Enable notifications</button><button class="stg-btn" onclick="dailyNotifyStop().catch(e=>dailyNotifyFeedback(e.message))">Stop all on this device</button></div>';
  h+='<p class="stg-help">On iPhone, install Daily using Share → Add to Home Screen, then open it from that icon. Delivery may be delayed by connectivity or Focus settings.</p>';
  h+='<button class="stg-btn" onclick="dailyNotifyLocalEnable().catch(e=>dailyNotifyFeedback(e.message))">Enable open-app reminders only</button>';
  h+='<p class="stg-help" role="status" id="notification-status">'+kitEsc(dailyNotifyStatus)+'</p>';
  DailyNotificationSchedule.channels.forEach(k=>{
    const v=r[k];
    h+='<div class="stg-sub">'+labels[k]+'</div><div class="stg-row"><label for="rem-'+k+'-enabled">Enable '+labels[k].toLowerCase()+'</label><label class="toggle-switch"><input id="rem-'+k+'-enabled" type="checkbox" '+(v.enabled?'checked':'')+' onchange="saveReminderField(\''+k+'\',\'enabled\',this.checked)"><span class="toggle-slider"></span></label></div>';
    h+='<div class="stg-2col"><div class="stg-field"><label for="rem-'+k+'-time">Time</label><input type="time" id="rem-'+k+'-time" value="'+v.time+'" onchange="saveReminderField(\''+k+'\',\'time\',this.value)"></div><div class="stg-field"><label for="rem-'+k+'-frequency">Frequency limit</label><select id="rem-'+k+'-frequency" onchange="saveReminderField(\''+k+'\',\'frequency\',Number(this.value))">'+[1,2,3,7].map(n=>'<option value="'+n+'" '+(v.frequency===n?'selected':'')+'>'+({1:'Once a day',2:'Every 2 days',3:'Every 3 days',7:'Once a week'})[n]+'</option>').join('')+'</select></div></div>';
    h+='<fieldset class="notification-days"><legend>Reminder days</legend>'+days.map((d,i)=>'<label><input type="checkbox" '+(v.days.includes(i)?'checked':'')+' onchange="dailyNotifyDay(\''+k+'\','+i+',this.checked)"> '+d+'</label>').join('')+'</fieldset>';
  });
  h+='<div class="stg-sub">Quiet hours</div><label><input type="checkbox" '+(r.quiet.enabled?'checked':'')+' onchange="saveReminderField(\'quiet\',\'enabled\',this.checked)"> Skip alerts during quiet hours</label><div class="stg-2col">'+['start','end'].map(k=>'<div class="stg-field"><label for="rem-quiet-'+k+'">'+(k==='start'?'From':'Until')+'</label><input type="time" id="rem-quiet-'+k+'" value="'+r.quiet[k]+'" onchange="saveReminderField(\'quiet\',\''+k+'\',this.value)"></div>').join('')+'</div><p class="stg-help">Uses '+kitEsc(dailyNotifyZone())+'. Quiet-hour alerts are skipped. A workout logged today suppresses workout alerts. Reminder and matching prompt categories share the reminder’s priority.</p>';
  wrap.innerHTML=h;
  if(!dailyNotifyStatus&&dailyNotifySupported())dailyNotifyBinding().then(b=>{
    const status=document.getElementById('notification-status');if(!status||dailyNotifyStatus)return;
    status.textContent=b?.scope===dailyNotifyScope()&&b.enabled?(b.remote?'Closed-app notifications connected on this device.':'Open-app reminders enabled. Daily must stay open.'):'Notifications are off on this device. Your saved choices are kept.';
  }).catch(()=>{});
}
