// Operator-only maintenance. Never exposed as an MCP tool or HTTP endpoint.
// Default is read-only. Run mutations only after the user's deployment approval.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getAuth} from 'firebase-admin/auth';
import {readFile} from 'node:fs/promises';
import {stable,blob,mergeRecords,protectedPaths} from './domain.mjs';
import {firebaseStore} from './firebase-store.mjs';

const [command='plan',uid]=process.argv.slice(2),url=process.env.DAILY_DATABASE_URL;
if(!url||!/^https:\/\/[^/]+\/?$/.test(url)||process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('An explicit production database URL is required for this operator script.');
if(!['plan','enable','revoke-all','prune-oauth'].includes(command))throw Error('Supported commands: plan, enable UID, revoke-all UID, prune-oauth.');
const credential=applicationDefault();initializeApp({credential,databaseURL:url});
const db=getDatabase(),auth=getAuth(),store=firebaseStore(db);
try{
  const candidate=JSON.parse(await readFile(new URL('./database.rules.candidate.json',import.meta.url),'utf8'));
  const token=await credential.getAccessToken();
  const response=await fetch(url.replace(/\/$/,'')+'/.settings/rules.json',{headers:{Authorization:'Bearer '+token.access_token}});
  if(!response.ok)throw Error('Cannot verify deployed Firebase rules. Use an approved operator identity with rule-read permission.');
  const installed=await response.json(),rulesMatch=stable(installed)===stable(candidate);
  if(command==='plan'){console.log(JSON.stringify({rulesMatch,action:'No changes. See README for the activation checklist.'}));}
  else{
    const expected=command+(uid?':'+uid:'');
    if(process.env.DAILY_APPROVED_OPERATION!==expected)throw Error('Mutation is disabled. Set DAILY_APPROVED_OPERATION to the exact reviewed command and UID only after approval.');
    if(!rulesMatch)throw Error('The deployed rules do not match the reviewed protected-sync candidate. No mutation allowed.');
    if(command==='prune-oauth'){
      let removed=0;
      for(const model of ['AccessToken','AuthorizationCode','RefreshToken','Grant','Interaction','Session']){
        const ref=db.ref('dailyConnectorOAuth/'+model),rows=(await ref.orderByChild('expiresAt').endAt(Date.now()).limitToFirst(100).get()).val()||{};
        if(Object.keys(rows).length){await ref.update(Object.fromEntries(Object.keys(rows).map(k=>[k,null])));removed+=Object.keys(rows).length;}
      }
      console.log(JSON.stringify({status:'committed',removedExpiredArtifacts:removed}));
    }else{
      if(!uid||/[.#$\[\]\/]/.test(uid))throw Error('An exact Firebase account UID is required.');
      const user=await auth.getUser(uid);if(user.disabled)throw Error('Account is disabled.');
      const result=await store.transaction(uid,root=>{
        if(command==='enable'){
          for(const path of protectedPaths){const rows=blob(root,path);mergeRecords(rows,rows,rows);}
          root.assistant||={};root.assistant.enabled=true;root.assistant.protocolVersion=1;root.assistant.activatedAt||=Date.now();
        }else{
          for(const grant of Object.values(root.assistant?.grants||{}))grant.revokedAt||=Date.now();
          // Keep protected sync active; reopening old snapshot writes would be unsafe.
        }
        return {root,result:{status:'committed',accountId:uid,command,cloudSave:'verified'}};
      });
      console.log(JSON.stringify(result));
    }
  }
}finally{db.goOffline();}
