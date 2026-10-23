import test from 'node:test';
import assert from 'node:assert/strict';
import {connectorService,blob,hash,mergeRecords,syncFinancialBlob} from '../domain.mjs';
import {financeContext} from '../generated/finance.mjs';

import {fixture,now} from './fixtures.mjs';

test('canonical reader, validator and writer preserve financial boundaries',async()=>{
  const f=fixture(),before=structuredClone(f.roots.alice),p=await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  assert.equal(p.status,'pending');assert.equal(blob(f.roots.alice,'transactions').length,0);
  const result=await f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken});
  assert.equal(result.status,'committed');assert.equal(result.cloudSave,'verified');assert.equal(blob(f.roots.alice,'transactions')[0].id,result.recordId);
  for(const key of ['accounts','budgetData','sessions','ledger','budgetFixCats'])assert.deepEqual(f.roots.alice[key],before[key]);
  const bills=await f.service.bills(f.principal,{from:'2026-10-23',to:'2026-10-30'});
  assert.equal(bills.items.length,2);assert.match(bills.items[0].paymentStatus,/Not established/);
});
test('simultaneous retries commit exactly once and changing a used payload fails',async()=>{
  const f=fixture(),p=await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  const results=await Promise.all(Array.from({length:20},()=>f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken})));
  assert.equal(new Set(results.map(r=>r.recordId)).size,1);assert.equal(blob(f.roots.alice,'transactions').length,1);
  await assert.rejects(f.service.preview(f.principal,{requestId:f.requestId,expense:{...f.expense,amount:19}}),{code:'ID_CONFLICT'});
});
test('lost response retrieves the durable result without replaying a different ID',async()=>{
  const f=fixture(),p=await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  await f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken}); // simulate response dropped
  const result=await f.service.result(f.principal,{requestId:f.requestId});
  assert.equal(result.status,'committed');assert.ok(result.recordId);assert.equal(blob(f.roots.alice,'transactions').length,1);
});
test('ownership, model-supplied UID, token expiry, revoked grants and scope checks fail closed',async()=>{
  const f=fixture();await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  await assert.rejects(f.service.result({...f.principal,uid:'bob',grantId:'grant2'},{requestId:f.requestId}),{code:'NOT_FOUND'});
  assert.throws(()=>f.service.bills(f.principal,{from:'2026-10-23',to:'2026-10-24',uid:'bob'}),{code:'INVALID_INPUT'});
  for(const p of [{...f.principal,expiresAt:now},{...f.principal,grantId:'wrong'},{...f.principal,scopes:['bills:read']}])await assert.rejects(f.service.references(p));
  f.roots.alice.assistant.grants.grant1.revokedAt=now;
  await assert.rejects(f.service.identity(f.principal),{code:'REVOKED'});
});
test('essential ambiguity, precision, unsupported actions and archived references are refused',async()=>{
  for(const [key,value] of [['amount',0],['amount',1.001],['amount','18.5'],['currency','USD'],['merchant',''],['date','2026-02-30'],['categoryId','unknown'],['paymentAccountId',''],['pending',true]]){
    const f=fixture();await assert.rejects(f.service.preview(f.principal,{requestId:f.requestId,expense:{...f.expense,[key]:value}}),{code:'INVALID_EXPENSE'});
    assert.equal(blob(f.roots.alice,'transactions').length,0);
  }
  const f=fixture();const accounts=blob(f.roots.alice,'accounts');accounts[0].archivedAt=now;f.roots.alice.accounts.v=JSON.stringify(accounts);
  await assert.rejects(f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense}),{code:'INVALID_EXPENSE'});
});
test('previews bind account, payload, current references and expiry',async()=>{
  const f=fixture(),p=await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  await assert.rejects(f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken+'bad'}),{code:'INVALID_PREVIEW'});
  f.setTime(now+11*60e3);const expired=await f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken});
  assert.equal(expired.status,'failed');assert.equal(expired.error.code,'PREVIEW_EXPIRED');assert.equal(blob(f.roots.alice,'transactions').length,0);
});
test('undo is durable, idempotent, and refuses edited or dependent expenses',async()=>{
  for(const change of ['none','edit','dependency','marked-deleted-dependency']){
    const f=fixture(),p=await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
    const saved=await f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken});
    if(change==='edit'){const rows=blob(f.roots.alice,'transactions');rows[0].note='Edited';f.roots.alice.transactions.v=JSON.stringify(rows);}
    if(change.includes('dependency'))f.roots.alice.ledger.v=JSON.stringify([{id:'refund',kind:'reimbursement',expenseId:saved.recordId,amount:1,...(change==='marked-deleted-dependency'?{deletedAt:now}:{})}]);
    if(change!=='none'){await assert.rejects(f.service.undo(f.principal,{requestId:f.requestId}));continue;}
    assert.equal((await f.service.undo(f.principal,{requestId:f.requestId})).status,'undone');
    assert.equal((await f.service.undo(f.principal,{requestId:f.requestId})).status,'undone');
    assert.equal((await f.service.commit(f.principal,{requestId:f.requestId,previewToken:p.previewToken})).status,'undone');
    assert.equal(blob(f.roots.alice,'transactions').length,0);
  }
});
test('three-way sync preserves independent devices and refuses stale conflicting edits/deletes',()=>{
  const base=[{id:'one',amount:1}],local=[...base,{id:'two',amount:2}],cloud=[{id:'one',amount:3},{id:'remote',amount:4}];
  assert.deepEqual(mergeRecords(base,local,cloud),[...cloud,{id:'two',amount:2}]);
  assert.throws(()=>mergeRecords(base,[],cloud),{code:'SYNC_CONFLICT'});
  assert.throws(()=>mergeRecords(base,[{id:'one',amount:5}],cloud),{code:'SYNC_CONFLICT'});
});
test('ordinary sync cannot rewrite remote audit receipts or introduce an orphan dependency',()=>{
  const f=fixture(),base=[];
  assert.throws(()=>syncFinancialBlob(f.roots.alice,{path:'ledger',base,value:[{id:'refund',expenseId:'missing'}],baseHash:hash(base)},now),{code:'DEPENDENCY_CONFLICT'});
  assert.throws(()=>syncFinancialBlob(f.roots.alice,{path:'aiRequests',base,value:[{id:'fake',remote:true}],baseHash:hash(base)},now),{code:'PROTECTED_RECEIPT'});
});
test('Sydney dates, month-end, leap-year and unknown bills use existing calendar functions',()=>{
  const ctx=financeContext({budgetFixCats:[{id:'rent',name:'Rent',chargeType:'bill',cycle:'monthly',dueDate:'2026-01-31',amount:''}]});
  assert.equal(ctx.today(new Date('2026-10-22T14:00:00Z')),'2026-10-23');
  const bills=ctx.bills('2026-02-01','2026-03-31');assert.deepEqual(bills.items.map(x=>x.dueDate),['2026-02-28','2026-03-31']);assert.equal(bills.items[0].amount,null);
  const leap=financeContext({budgetFixCats:[{id:'rent',name:'Rent',chargeType:'bill',cycle:'monthly',dueDate:'2024-01-31',amount:10}]});assert.equal(leap.bills('2024-02-01','2024-02-29').items[0].dueDate,'2024-02-29');
  assert.equal(ctx.today(new Date('2026-10-03T14:30:00Z')),'2026-10-04');assert.equal(ctx.today(new Date('2026-10-04T13:30:00Z')),'2026-10-05');
});

test('independent device commits preserve both expenses and changed references require another preview',async()=>{
  const f=fixture(),second='daily_remote_second001';
  const a=await f.service.preview(f.principal,{requestId:f.requestId,expense:f.expense});
  const b=await f.service.preview(f.principal,{requestId:second,expense:{...f.expense,amount:8,merchant:'Coffee'}});
  const result=await Promise.all([f.service.commit(f.principal,{requestId:f.requestId,previewToken:a.previewToken}),f.service.commit(f.principal,{requestId:second,previewToken:b.previewToken})]);
  assert.deepEqual(result.map(r=>r.status),['committed','committed']);assert.equal(blob(f.roots.alice,'transactions').length,2);
  const g=fixture(),p=await g.service.preview(g.principal,{requestId:g.requestId,expense:g.expense});
  const accounts=blob(g.roots.alice,'accounts');accounts[0].name='Changed card';g.roots.alice.accounts.v=JSON.stringify(accounts);
  const rejected=await g.service.commit(g.principal,{requestId:g.requestId,previewToken:p.previewToken});assert.equal(rejected.error.code,'PREVIEW_CHANGED');assert.equal(blob(g.roots.alice,'transactions').length,0);
});
