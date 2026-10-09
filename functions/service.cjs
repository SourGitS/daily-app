'use strict';
const crypto=require('node:crypto');
const lease=30*86400000;
function subscription(raw){
  if(!raw||typeof raw.endpoint!=='string'||raw.endpoint.length>2048)throw new Error('Invalid push subscription.');
  const u=new URL(raw.endpoint);
  // Never let an authenticated client turn the sender into a request to an arbitrary host.
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname))throw new Error('Unsupported push service.');
  if(!/^[A-Za-z0-9_-]{87}$/.test(raw.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}$/.test(raw.keys?.auth||''))throw new Error('Invalid push encryption keys.');
  return {endpoint:u.href,keys:{p256dh:raw.keys.p256dh,auth:raw.keys.auth}};
}
function validateZone(zone){
  if(typeof zone!=='string'||zone.length>100)throw new Error('Invalid time zone.');
  new Intl.DateTimeFormat('en',{timeZone:zone}).format();return zone;
}
async function manage(root,uid,data,schedule,now=Date.now()){
  if(!uid)throw new Error('Sign in to manage notifications.');
  if(!data||!['register','update','disable','renew','workout'].includes(data.action))throw new Error('Invalid notification action.');
  if(!/^[a-f0-9-]{36}$/.test(data.token||''))throw new Error('Invalid device token.');
  let sub,device;
  if(data.action==='register'){
    sub=subscription(data.subscription);device=crypto.createHash('sha256').update(sub.endpoint).digest('hex');
  }else{
    device=data.device;if(!/^[a-f0-9]{64}$/.test(device||''))throw new Error('Invalid device.');
  }
  if(['register','update','renew'].includes(data.action))validateZone(data.zone);
  if(['register','update'].includes(data.action)&&JSON.stringify(data.preferences||{}).length>12000)throw new Error('Settings are too large.');
  const ref=root.child(device);
  let rejected=false;
  const result=await ref.transaction(old=>{
    rejected=false;
    if(data.action!=='register'&&(!old||old.uid!==uid||old.token!==data.token)){rejected=true;return;}
    if(data.action==='register'){
      const last=old?.uid===uid?{...(old.last||{})}:{},today=schedule.clock(new Date(now),data.zone).day;
      schedule.channels.forEach(k=>{
        const day=data.acknowledged?.[k]?.day;
        if(Number.isInteger(day)&&day<=today&&day>=today-35&&(!last[k]||last[k].day<day))last[k]={day};
      });
      return {uid,token:data.token,subscription:sub,zone:data.zone,preferences:schedule.normalise(data.preferences),enabled:true,revision:now,expiresAt:now+lease,last};
    }
    if(data.action==='disable')return {...old,enabled:false,revision:now};
    if(data.action==='workout'){
      const date=schedule.clock(new Date(now),old.zone).date;
      return {...old,trainedDate:date};
    }
    if(data.action==='renew')return {...old,zone:data.zone,expiresAt:now+lease,revision:old.zone===data.zone?old.revision:Math.max(now,(old.revision||0)+1)};
    return {...old,preferences:schedule.normalise(data.preferences),enabled:true,revision:Math.max(now,(old.revision||0)+1),zone:data.zone,expiresAt:now+lease};
  });
  if(rejected||!result.committed)throw new Error('This notification connection belongs to another account or has expired. Reconnect.');
  return {device};
}
async function deliver(ref,record,sessions,send,schedule,now=Date.now()){
  if(!record?.enabled||record.expiresAt<=now)return;
  const date=schedule.clock(new Date(now),record.zone).date;
  if(record.trainedDate===date)sessions={...sessions,local:{date}};
  const events=schedule.due(record.preferences,new Date(now),record.zone,sessions,record.last);
  for(const event of events){
    // Claim before send: a timeout has an unknown delivery outcome and must not be retried.
    const claim=await ref.transaction(current=>{
      if(!current?.enabled||current.token!==record.token||current.revision!==record.revision||current.expiresAt<=now)return;
      const currentSessions=current.trainedDate===date?{...sessions,local:{date}}:sessions;
      if(!schedule.due(current.preferences,new Date(now),current.zone,currentSessions,current.last).some(e=>e.id===event.id))return;
      return {...current,last:{...current.last,[event.channel]:{day:event.day,id:event.id,status:'claimed',at:now,wordIndex:((current.last?.[event.channel]?.wordIndex??-1)+1)%3}}};
    });
    if(!claim.committed)continue;
    const fresh=(await ref.once('value')).val();
    if(!fresh?.enabled||fresh.token!==record.token||fresh.revision!==record.revision||event.channel.startsWith('workout')&&fresh.trainedDate===date)continue;
    const clock=schedule.clock(new Date(now),record.zone),quiet=schedule.normalise(record.preferences).quiet;
    const quietStart=Number(quiet.start.slice(0,2))*60+Number(quiet.start.slice(3));
    // Queued messages expire before quiet hours or the next calendar day begins.
    const ttl=Math.max(1,Math.min(900,(1440-clock.minutes)*60,quiet.enabled?((quietStart-clock.minutes+1440)%1440)*60:900));
    const payload={...schedule.message({...event,wordIndex:claim.snapshot.val().last[event.channel].wordIndex}),token:record.token,scope:'user:'+record.uid,day:event.day,expiresAt:now+ttl*1000};
    try{await send(record.subscription,JSON.stringify(payload),{TTL:ttl,urgency:'normal',timeout:10000});}
    catch(e){
      if(e.statusCode===404||e.statusCode===410){
        await ref.transaction(v=>v?.token===record.token?{...v,enabled:false,expiredSubscription:true}:undefined);
      }
      // No payloads, subscription URLs or account data in logs.
      console.warn('Notification send failed',e.statusCode||'transport');
    }
  }
}
module.exports={manage,deliver,subscription,validateZone};
