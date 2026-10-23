import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {financeContext} from './generated/finance.mjs';

export class DailyError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export const fail=(code,message)=>{throw new DailyError(code,message);};
export function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const hash=value=>createHash('sha256').update(stable(value)).digest('hex');
export const protectedPaths=['transactions','ledger','aiRequests'];
export function blob(root,path){
  const raw=root?.[path],v=raw&&typeof raw==='object'&&'v'in raw?raw.v:raw;
  if(v===undefined||v===null||v==='')return [];
  let result;try{result=typeof v==='string'?JSON.parse(v):v;}catch{fail('INVALID_STORE','Daily '+path+' cannot be decoded. No changes were made.');}
  if(!Array.isArray(result))fail('INVALID_STORE','Daily '+path+' is not a record list.');
  return structuredClone(result);
}
export function put(root,path,rows,now){
  root[path]={v:JSON.stringify(rows),t:Math.max(now,(Number(root[path]?.t)||0)+1)};
}
export const dataOf=root=>Object.fromEntries(['transactions','ledger','accounts','budgetVarCats','budgetFixCats'].map(p=>[p,blob(root,p)]));
function requireId(id){if(typeof id!=='string'||!/^daily_remote_[A-Za-z0-9_-]{8,120}$/.test(id))fail('INVALID_REQUEST_ID','Use one stable daily_remote_ request ID for this expense, including retries.');}
function requireKeys(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))fail('INVALID_INPUT','Unsupported fields. Do not supply a user ID or extra financial actions.');}
export function authorize(root,principal,scope,now){
  if(!principal?.uid||!principal.grantId||!Number.isFinite(principal.expiresAt)||principal.expiresAt<=now)fail('UNAUTHENTICATED','Access expired. Reconnect Daily.');
  const grant=root?.assistant?.grants?.[principal.grantId];
  if(!root?.assistant?.enabled)fail('NOT_ENABLED','Daily remote access is not enabled for this account.');
  if(!grant||grant.revokedAt||!Number.isFinite(grant.expiresAt)||grant.expiresAt<=now||grant.uid!==principal.uid)fail('REVOKED','This Daily connection is expired or revoked.');
  if(scope&&(!principal.scopes?.includes(scope)||!grant.scopes?.includes(scope)))fail('INSUFFICIENT_SCOPE','This connection does not permit that action.');
  return grant;
}
function recordsById(rows){
  const map=new Map();for(const row of rows){if(!row||typeof row.id!=='string'||!row.id||map.has(row.id))fail('INVALID_STORE','Daily contains missing or duplicate record IDs. Resolve them before syncing.');map.set(row.id,row);}return map;
}
// A three-way record merge: preserve independent cloud edits; reject conflicts, including deletions.
export function mergeRecords(base,local,cloud){
  const b=recordsById(base),l=recordsById(local),c=recordsById(cloud),merged=new Map(c);
  for(const id of new Set([...b.keys(),...l.keys()])){
    if(stable(b.get(id))===stable(l.get(id)))continue;
    if(stable(c.get(id))!==stable(b.get(id))&&stable(c.get(id))!==stable(l.get(id)))fail('SYNC_CONFLICT','This record changed on another device. Your local edit is retained; review it before retrying.');
    if(l.has(id))merged.set(id,l.get(id));else merged.delete(id);
  }
  return [...merged.values()];
}
function dependent(root,id){
  return blob(root,'ledger').some(r=>r&&r.expenseId===id);
}
export function undoCreatedExpense(root,uid,id,now){
  requireId(id);const rows=blob(root,'aiRequests'),i=rows.findIndex(r=>r.id===id&&r.remote===true&&r.scope==='user:'+uid),row=rows[i];
  if(!row)fail('NOT_FOUND','No remote operation with that ID exists in this Daily account.');
  if(row.status==='undone')return row;
  if(row.status!=='committed')fail('NOT_UNDOABLE','Only a committed expense created through this connection can be undone.');
  const transactions=blob(root,'transactions'),record=transactions.find(t=>t.id===row.record?.id);
  if(!record||hash(record)!==row.recordHash||record.aiActionId!==row.id)fail('RECORD_CHANGED','This expense changed or was removed. Undo refused.');
  if(dependent(root,record.id))fail('DEPENDENT_RECORD','Another record depends on this expense. Undo refused.');
  rows[i]={...row,status:'undone',undoneAt:now};
  put(root,'transactions',transactions.filter(t=>t.id!==record.id),now);put(root,'aiRequests',rows,now);return rows[i];
}
function guardReferences(root,before){
  const txns=new Set(blob(root,'transactions').map(r=>r.id));
  for(const r of blob(root,'ledger'))if(r&&r.expenseId&&!txns.has(r.expenseId)){
    // Preserve existing historical inconsistencies; never introduce a new dependency gap.
    const existing=blob(before,'ledger').find(x=>x.id===r.id);
    if(stable(existing)!==stable(r)||blob(before,'transactions').some(t=>t.id===r.expenseId))fail('DEPENDENCY_CONFLICT','A reimbursement depends on this expense. Refresh and review both records.');
  }
}
export function syncFinancialBlob(root,input,now){
  requireKeys(input,['path','base','value','baseHash']);
  if(!root?.assistant?.enabled||!protectedPaths.includes(input.path))fail('INVALID_SYNC','This store is not enabled for protected sync.');
  if(!Array.isArray(input.base)||!Array.isArray(input.value)||hash(input.base)!==input.baseHash)fail('INVALID_SYNC','A verified baseline is required. Refresh Daily before syncing.');
  // Remote receipts are server-owned even when a full user session edits other Inbox activity.
  if(input.path==='aiRequests'){
    const baseRemote=input.base.filter(r=>r?.remote===true),localRemote=input.value.filter(r=>r?.remote===true);
    if(stable(baseRemote)!==stable(localRemote))fail('PROTECTED_RECEIPT','Remote operation receipts cannot be edited through snapshot sync.');
  }
  const next=structuredClone(root),rows=mergeRecords(input.base,input.value,blob(root,input.path));
  put(next,input.path,rows,now);guardReferences(next,root);
  return {root:next,result:{status:'committed',cloudSave:'verified',path:input.path,envelope:next[input.path]}};
}
export function connectorService(store,{previewKey,clock=Date.now}={}){
  if(!previewKey||previewKey.length<32)throw Error('A preview signing key of at least 32 bytes is required.');
  const sign=row=>createHmac('sha256',previewKey).update(stable([row.scope,row.grantId,row.id,row.payloadHash,row.previewExpiresAt,row.referenceHash])).digest('base64url');
  const receipt=row=>({requestId:row.id,status:row.status,recordId:row.record?.id||null,cloudSave:'verified',
    ...(row.status==='pending'?{previewToken:sign(row),previewExpiresAt:row.previewExpiresAt,payload:row.payload,summary:row.summary,warnings:row.warnings}:{}),
    ...(row.status==='failed'?{error:row.error}:{}),committedAt:row.appliedAt||null,undoneAt:row.undoneAt||null});
  const run=(p,scope,fn)=>store.transaction(p.uid,root=>{const now=clock();authorize(root,p,scope,now);return fn(structuredClone(root),now);});
  const referenceHash=(data,payload,warnings)=>hash({account:data.accounts.find(a=>a.id===payload.paymentAccountId),category:data.budgetVarCats.find(c=>c.id===payload.categoryId),warnings});
  const validate=(data,payload,id)=>{try{return financeContext(data).validate(payload,id);}catch(e){fail('INVALID_EXPENSE',e.message);}};
  const getRow=(root,p,id)=>{requireId(id);const row=blob(root,'aiRequests').find(r=>r.id===id&&r.remote===true&&r.scope==='user:'+p.uid);if(!row)fail('NOT_FOUND','No operation with that ID exists in this Daily account.');return row;};
  return {
    identity:p=>run(p,null,(root,now)=>({root,result:{status:'connected',accountId:p.uid,email:p.email||null,scopes:authorize(root,p,null,now).scopes,accessExpiresAt:p.expiresAt,grantExpiresAt:root.assistant.grants[p.grantId].expiresAt,today:financeContext({}).today(new Date(now)),timezone:'Australia/Sydney',currency:'AUD'}})),
    bills:(p,input)=>{requireKeys(input,['from','to']);return run(p,'bills:read',root=>({root,result:financeContext(dataOf(root)).bills(input.from,input.to)}));},
    references:p=>run(p,'expenses:create',root=>({root,result:financeContext(dataOf(root)).references()})),
    preview:(p,input)=>{
      requireKeys(input,['requestId','expense']);requireId(input.requestId);
      return run(p,'expenses:create',(root,now)=>{
        if(!input.expense||typeof input.expense!=='object'||Array.isArray(input.expense))fail('INVALID_EXPENSE','An explicit expense is required.');
        const rows=blob(root,'aiRequests'),prior=rows.find(r=>r.id===input.requestId),payload=structuredClone(input.expense),payloadHash=hash(payload);
        if(prior){if(!prior.remote||prior.scope!=='user:'+p.uid||prior.payloadHash!==payloadHash||prior.grantId!==p.grantId)fail('ID_CONFLICT','This request ID already belongs to a different payload or connection.');return {root,result:receipt(prior)};}
        const data=dataOf(root),v=validate(data,payload,input.requestId),warnings=v.conflict||'';
        const row={id:input.requestId,scope:'user:'+p.uid,remote:true,grantId:p.grantId,status:'pending',payload,payloadHash,
          createdAt:now,previewExpiresAt:now+10*60e3,referenceHash:referenceHash(data,payload,warnings),summary:v.summary,warnings};
        rows.push(row);put(root,'aiRequests',rows,now);return {root,result:receipt(row)};
      });
    },
    commit:(p,input)=>{
      requireKeys(input,['requestId','previewToken','confirmWarnings']);requireId(input.requestId);
      const recordId='txn_'+randomUUID();
      return run(p,'expenses:create',(root,now)=>{
        const row=getRow(root,p,input.requestId);
        if(row.grantId!==p.grantId)fail('PREVIEW_ACCOUNT','Preview belongs to a different connection.');
        const a=Buffer.from(String(input.previewToken||'')),b=Buffer.from(sign(row));
        if(a.length!==b.length||!timingSafeEqual(a,b))fail('INVALID_PREVIEW','The preview token does not match this exact request.');
        if(row.status!=='pending')return {root,result:receipt(row)};
        const rows=blob(root,'aiRequests'),i=rows.findIndex(r=>r.id===row.id);
        const reject=(code,message)=>{rows[i]={...row,status:'failed',error:{code,message},updatedAt:now};put(root,'aiRequests',rows,now);return {root,result:receipt(rows[i])};};
        if(row.previewExpiresAt<=now)return reject('PREVIEW_EXPIRED','Preview expired. Review a new request before saving.');
        const data=dataOf(root);let v;
        try{v=validate(data,row.payload,row.id);}catch(e){return reject(e.code||'INVALID_EXPENSE',e.message);}
        if(referenceHash(data,row.payload,v.conflict||'')!==row.referenceHash)return reject('PREVIEW_CHANGED','The account, category or duplicate warnings changed. Review a new preview.');
        if(row.warnings&&input.confirmWarnings!==true)fail('CONFIRM_WARNINGS','Ask the user to resolve or explicitly acknowledge the preview warnings before committing.');
        if(data.transactions.some(v.dupKey))fail('EXISTING_RECORD','An expense already carries this request ID. Do not create another.');
        const made=financeContext(data,{recordId}).create(row.payload,row.id);
        rows[i]={...row,status:'committed',record:made.record,recordHash:hash(made.record),appliedAt:now};
        put(root,'transactions',made.transactions,now);put(root,'aiRequests',rows,now);
        return {root,result:receipt(rows[i])};
      });
    },
    result:(p,input)=>{requireKeys(input,['requestId']);return run(p,'expenses:create',root=>({root,result:receipt(getRow(root,p,input.requestId))}));},
    undo:(p,input)=>{
      requireKeys(input,['requestId']);return run(p,'expenses:create',(root,now)=>{
        const row=undoCreatedExpense(root,p.uid,input.requestId,now);return {root,result:receipt(row)};
      });
    }
  };
}
