import test from 'node:test';
import assert from 'node:assert/strict';
import {firebaseStore} from '../firebase-store.mjs';
import {connectorService,DailyError,blob} from '../domain.mjs';
import {fixture,now} from './fixtures.mjs';

test('Firebase adapter does not report success for empty cache, aborts or lost acknowledgments',async()=>{
  const f=fixture();let root=structuredClone(f.roots.alice),mode='normal';
  const db={ref:path=>({transaction:async cb=>{
    assert.equal(path,'users/alice');assert.equal(cb(null),null,'request server comparison rather than inventing data');
    if(mode==='before')throw Error('network disconnected');
    const next=cb(structuredClone(root));if(next===undefined)return {committed:false};
    root=next;if(mode==='after')throw Error('response lost');return {committed:true};
  }})};
  const store=firebaseStore(db),service=connectorService(store,{previewKey:Buffer.alloc(32,4),clock:()=>now});
  mode='before';await assert.rejects(service.preview(f.principal,{requestId:f.requestId,expense:f.expense}),{code:'OUTCOME_UNKNOWN'});assert.equal(blob(root,'aiRequests').length,0);
  mode='normal';const p=await service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  mode='after';await assert.rejects(service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken}),{code:'OUTCOME_UNKNOWN'});
  assert.equal(blob(root,'transactions').length,1);
  mode='normal';const result=await service.result(f.principal,{requestId:f.requestId});assert.equal(result.status,'committed');
  const retry=await service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken});assert.equal(retry.recordId,result.recordId);assert.equal(blob(root,'transactions').length,1);
  await assert.rejects(store.transaction('alice',()=>{throw new DailyError('REJECTED','No write');}),{code:'REJECTED'});
  const empty=firebaseStore({ref:()=>({transaction:async cb=>({committed:true,snapshot:{val:()=>cb(null)}})})});
  await assert.rejects(empty.transaction('alice',()=>{throw Error('must not run');}),{code:'ACCOUNT_UNAVAILABLE'});
});
