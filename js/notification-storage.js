'use strict';
// Device delivery state and receipts are deliberately outside account backups and sync.
function dailyNotifyStore(action){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('daily-notification-delivery',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('state','readwrite');
      let result;
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=()=>{db.close();reject(tx.error);};
      action(tx.objectStore('state'),value=>{result=value;});
    };
  });
}
function dailyNotifyBinding(){return dailyNotifyStore((s,done)=>{s.get('binding').onsuccess=e=>done(e.target.result||null);});}
function dailyNotifyBind(binding){return dailyNotifyStore((s,done)=>{s.put(binding,'binding');done(binding);});}
function dailyNotifyPatch(scope,token,patch){
  return dailyNotifyStore((s,done)=>{s.get('binding').onsuccess=e=>{
    const b=e.target.result;if(!b||b.scope!==scope||b.token!==token){done(false);return;}
    s.put({...b,...patch},'binding');done(true);
  };});
}
function dailyNotifyClaim(token,id,channel,day){
  return dailyNotifyStore((s,done)=>{
    s.get('binding').onsuccess=e=>{
      const b=e.target.result;
      if(!b||!b.enabled||b.token!==token||channel.startsWith('workout')&&b.trainedDate===id.slice(-10)){done(false);return;}
      const receipts=b.receipts||{},key=token+':'+id;
      if(receipts[key]){done(false);return;}
      Object.keys(receipts).forEach(k=>{if(receipts[k]<Date.now()-35*86400000)delete receipts[k];});
      receipts[key]=Date.now();b.receipts=receipts;b.last=b.last||{};
      b.last[channel]={day,wordIndex:((b.last[channel]?.wordIndex??-1)+1)%3};
      s.put(b,'binding');done(true);
    };
  });
}
