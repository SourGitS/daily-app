import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {fixture,now} from '../fixtures.mjs';
import {connectorService,blob,hash,syncFinancialBlob} from '../../domain.mjs';
import {firebaseStore} from '../../firebase-store.mjs';
import {oauthAdapter} from '../../oauth-adapter.mjs';
import notifications from '../../../functions/service.cjs';
import notificationSchedule from '../../../js/notification-schedule.js';

// Hard guard before any SDK initialization. These tests can never target production.
const host=process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if(host!=='127.0.0.1:9009')throw Error('Start the isolated demo emulator on 127.0.0.1:9009.');
const projectId='demo-daily-connector';
test('real RTDB rules, transactions, encrypted OAuth persistence and concurrent clients',async t=>{
  const env=await initializeTestEnvironment({projectId,database:{host:'127.0.0.1',port:9009,rules:await readFile(new URL('../../database.rules.candidate.json',import.meta.url),'utf8')}});
  const app=initializeApp({projectId,databaseURL:'http://'+host+'?ns='+projectId},'isolated-connector');
  const app2=initializeApp({projectId,databaseURL:'http://'+host+'?ns='+projectId},'isolated-second-device');
  const db=getDatabase(app),db2=getDatabase(app2),store=firebaseStore(db),store2=firebaseStore(db2);
  t.after(async()=>{await env.cleanup();await deleteApp(app);await deleteApp(app2);});
  const f=fixture();await db.ref().set({users:f.roots});
  await t.test('fresh notification process can disable an existing device and rejects an absent device',async()=>{
    const device='a'.repeat(64),token='11111111-1111-4111-8111-111111111111';
    await db.ref('notificationDevices/'+device).set({uid:'alice',token,enabled:true});
    const devices=db2.ref('notificationDevices');
    await notifications.manage(devices,'alice',{action:'disable',device,token},notificationSchedule,now);
    assert.equal((await db.ref('notificationDevices/'+device+'/enabled').get()).val(),false);
    await assert.rejects(notifications.manage(devices,'alice',{action:'disable',device:'b'.repeat(64),token},notificationSchedule,now));
  });
  const alice=env.authenticatedContext('alice').database(),bob=env.authenticatedContext('bob').database(),guest=env.unauthenticatedContext().database();
  await t.test('Accounts keeps its atomic-sync marker while protected connector stores remain fenced',async()=>{
    const ref=alice.ref('users/alice/accounts'),original=(await ref.once('value')).val();
    await assertSucceeds(ref.set({...original,t:now,recordSync:1}));
    await assertFails(ref.set({v:'[]',t:now+1}));await assertFails(ref.remove());
    await assertFails(bob.ref('users/alice/accounts').set({v:'[]',t:now+1,recordSync:1}));
    await assertFails(guest.ref('users/alice/accounts').once('value'));
    await assertSucceeds(ref.set({...original,t:now+1,restoreAt:now+1,recordSync:1}));
    await assertFails(alice.ref('users/alice/transactions').set({v:'[]',t:now+2,recordSync:1}));
  });
  await t.test('owner reads, cross-account and anonymous access, private OAuth and old snapshots',async()=>{
    await assertSucceeds(alice.ref('users/alice/transactions').once('value'));
    await assertFails(bob.ref('users/alice').once('value'));await assertFails(guest.ref('users/alice').once('value'));
    await assertFails(alice.ref('dailyConnectorOAuth').once('value'));
    for(const path of ['transactions','ledger','aiRequests','assistant']){
      await assertFails(alice.ref('users/alice/'+path).set({v:'[]',t:now+999999}));
      await assertFails(alice.ref('users/alice/'+path).remove());
    }
    await assertFails(alice.ref('users/alice').set(f.roots.alice));await assertFails(alice.ref('users/alice').remove());
    await assertFails(alice.ref('users/alice').update({'assistant/enabled':false,transactions:{v:'[]',t:now+999999}}));
    await assertFails(bob.ref('users/alice/sessions').set({id:'bad'}));
    await assertSucceeds(alice.ref('users/alice/sessions/new').set({id:'synthetic'}));
    for(const path of ['sessions','weights']){
      const collection=bob.ref('users/bob/'+path);
      await assertSucceeds(collection.set({__dailyRestoredAt:now}));
      await assertFails(collection.child('stale').set({updatedAt:now+1000,restoreGeneration:now-1}));
      await assertSucceeds(collection.child('fresh').set({updatedAt:now+1,restoreGeneration:now}));
    }
    await db.ref('users/bob/assistant').remove();
    await assertSucceeds(bob.ref('users/bob/transactions').set({v:'[]',t:now}));
    await assertFails(bob.ref('users/bob/assistant/enabled').set(true));
  });
  const service=connectorService(store,{previewKey:Buffer.alloc(32,7),clock:()=>now}),service2=connectorService(store2,{previewKey:Buffer.alloc(32,7),clock:()=>now});
  let preview,saved;
  await t.test('two independent Admin clients retry the same operation atomically',async()=>{
    preview=await service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
    const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?service:service2).commit(f.principal,{requestId:f.requestId,previewToken:preview.previewToken})));
    assert.equal(new Set(results.map(r=>r.recordId)).size,1);saved=results[0];
    const root=(await db.ref('users/alice').get()).val();assert.equal(blob(root,'transactions').length,1);assert.equal(blob(root,'aiRequests')[0].record.id,saved.recordId);
    assert.equal((await service2.result(f.principal,{requestId:f.requestId})).recordId,saved.recordId);
  });
  await t.test('stale full snapshot cannot delete remote record; independent local edit merges',async()=>{
    await assertFails(alice.ref('users/alice/transactions').set({v:'[]',t:now+999999}));
    const result=await store2.transaction('alice',root=>syncFinancialBlob(root,{path:'transactions',base:[],baseHash:hash([]),value:[{id:'local',amount:2,date:'2026-10-23'}]},now+1));
    assert.equal(JSON.parse(result.envelope.v).length,2);
    const undone=await service.undo(f.principal,{requestId:f.requestId});assert.equal(undone.status,'undone');
    const root=(await db.ref('users/alice').get()).val();assert.deepEqual(blob(root,'transactions').map(r=>r.id),['local']);
    assert.equal((await service2.commit(f.principal,{requestId:f.requestId,previewToken:preview.previewToken})).status,'undone');
  });
  await t.test('a database restore fences stale connector additions while current-generation edits remain valid',async()=>{
    const uid='restored-connector',restored={id:'restored',amount:2,date:'2026-10-23'};
    await db.ref('users/'+uid).set({assistant:{enabled:true},transactions:{v:JSON.stringify([restored]),t:now,recordSync:1,restoreAt:now}});
    const input={path:'transactions',base:[],baseHash:hash([]),value:[{id:'stale',amount:5,date:'2026-10-22'}]};
    await assert.rejects(store.transaction(uid,root=>syncFinancialBlob(root,input,now+1)),{code:'RESTORE_CHANGED'});
    assert.deepEqual(blob((await db.ref('users/'+uid).get()).val(),'transactions'),[restored]);
    const result=await store2.transaction(uid,root=>syncFinancialBlob(root,{path:'transactions',base:[restored],baseHash:hash([restored]),value:[restored,{id:'new',amount:3,date:'2026-10-23'}],restoreAt:now},now+2));
    assert.deepEqual(JSON.parse(result.envelope.v).map(r=>r.id),['restored','new']);assert.equal(result.envelope.restoreAt,now);
  });
  await t.test('revocation serializes with writes and every later request is refused',async()=>{
    const id='daily_remote_revoke001',p=await service.preview(f.principal,{requestId:id,expense:{...f.expense,amount:32}});
    const results=await Promise.allSettled([
      service2.commit(f.principal,{requestId:id,previewToken:p.previewToken}),
      store.transaction('alice',root=>{root.assistant.grants.grant1.revokedAt=now;return {root,result:true};})
    ]);
    assert.equal(results[1].status,'fulfilled');
    await assert.rejects(service.commit(f.principal,{requestId:id,previewToken:p.previewToken}),{code:'REVOKED'});
    const root=(await db.ref('users/alice').get()).val(),receipt=blob(root,'aiRequests').find(r=>r.id===id),records=blob(root,'transactions').filter(r=>r.aiActionId===id);
    assert.equal(records.length,receipt.status==='committed'?1:0);
  });
  await t.test('encrypted adapter roundtrip, one-time consume, expiry and revocation',async()=>{
    const Adapter=oauthAdapter(db,Buffer.alloc(32,9)),adapter=new Adapter('AuthorizationCode');
    await adapter.upsert('sensitive-code',{grantId:'example-grant',uid:'interaction',extra:'private'},60);
    const raw=JSON.stringify((await db.ref('dailyConnectorOAuth').get()).val());assert.ok(!raw.includes('sensitive-code'));assert.ok(!raw.includes('private'));
    assert.equal((await adapter.find('sensitive-code')).extra,'private');
    assert.equal((await adapter.findByUid('interaction')).extra,'private');
    const consumed=await Promise.allSettled([adapter.consume('sensitive-code'),adapter.consume('sensitive-code')]);assert.equal(consumed.filter(r=>r.status==='fulfilled').length,1);
    await adapter.revokeByGrantId('example-grant');assert.equal(await adapter.find('sensitive-code'),undefined);
    await adapter.upsert('expired',{uid:'old'},-1);assert.equal(await adapter.find('expired'),undefined);
    await adapter.upsert('tamper',{uid:'tamper'},60);const p='dailyConnectorOAuth/AuthorizationCode/'+adapter.id('tamper');await db.ref(p+'/sealed/body').set('corrupt');await assert.rejects(adapter.find('tamper'));
    const grants=new Adapter('Grant');await grants.upsert('provider-revoke',{accountId:'alice',clientId:'daily-fuji'},60);
    await db.ref('users/alice/assistant/grants/provider-revoke').set({uid:'alice',expiresAt:Date.now()+60000,scopes:['expenses:create']});
    await grants.destroy('provider-revoke');assert.ok((await db.ref('users/alice/assistant/grants/provider-revoke/revokedAt').get()).val());
  });
});
