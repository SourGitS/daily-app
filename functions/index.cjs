'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineSecret,defineString}=require('firebase-functions/params');
const webpush=require('web-push');
const schedule=require('./schedule.cjs');
const {manage,deliver}=require('./service.cjs');
initializeApp();
const region='australia-southeast1';
const publicKey=defineSecret('DAILY_VAPID_PUBLIC_KEY'),privateKey=defineSecret('DAILY_VAPID_PRIVATE_KEY');
const subject=defineString('DAILY_VAPID_SUBJECT');
exports.dailyNotifications=onCall({region,cors:['https://sourgits.github.io'],maxInstances:2},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in to manage notifications.');
  try{return await manage(getDatabase().ref('notificationDevices'),request.auth.uid,request.data,schedule);}
  catch(e){throw new HttpsError('invalid-argument',e.message);}
});
exports.dailyNotificationDispatch=onSchedule({region,schedule:'every 1 minutes',timeZone:'UTC',secrets:[publicKey,privateKey],maxInstances:1,timeoutSeconds:120,retryCount:0},async()=>{
  webpush.setVapidDetails(subject.value(),publicKey.value(),privateKey.value());
  const db=getDatabase(),root=db.ref('notificationDevices'),now=Date.now();
  let after=null;
  // Page the private device registry; read a user's sessions only when a channel is due.
  while(true){
    let query=root.orderByKey().limitToFirst(101);if(after)query=query.startAfter(after);
    const snap=await query.once('value'),entries=Object.entries(snap.val()||{});
    if(!entries.length)break;
    for(const [id,record] of entries){
      after=id;
      if(record.expiresAt<=now){await root.child(id).transaction(v=>v?.expiresAt<=now?null:undefined);continue;}
      if(!record.enabled||!schedule.due(record.preferences,new Date(now),record.zone,{},record.last).length)continue;
      const sessions=(await db.ref('users/'+record.uid+'/sessions').once('value')).val()||{};
      await deliver(root.child(id),record,sessions,(...args)=>webpush.sendNotification(...args),schedule,now);
    }
    if(entries.length<101)break;
  }
});
