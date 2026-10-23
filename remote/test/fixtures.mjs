import {connectorService} from '../domain.mjs';
export const now=Date.parse('2026-10-23T00:00:00Z');
export function fixture(){
  const envelope=v=>({v:JSON.stringify(v),t:now});
  const root={assistant:{enabled:true,grants:{grant1:{uid:'alice',scopes:['bills:read','expenses:create'],expiresAt:now+864e5}}},
    transactions:envelope([]),aiRequests:envelope([]),ledger:envelope([]),accounts:envelope([{id:'card',name:'Credit card',type:'debt',current:100}]),
    budgetVarCats:envelope([{id:'food',name:'Food'}]),budgetFixCats:envelope([{id:'gym',name:'Gym',amount:20,chargeType:'subscription',cycle:'weekly',dueDate:'2026-10-23'}]),
    sessions:{untouched:'workouts'},budgetData:{untouched:'budget'}};
  const roots={alice:root,bob:{...structuredClone(root),assistant:{enabled:true,grants:{grant2:{uid:'bob',scopes:['bills:read','expenses:create'],expiresAt:now+864e5}}}}};
  let queue=Promise.resolve(),time=now;
  const store={transaction(uid,fn){const next=queue.then(()=>{const r=fn(structuredClone(roots[uid]));roots[uid]=r.root;return structuredClone(r.result);});queue=next.catch(()=>{});return next;}};
  const service=connectorService(store,{previewKey:Buffer.alloc(32,7),clock:()=>time});
  const principal={uid:'alice',grantId:'grant1',expiresAt:now+3600e3,scopes:['bills:read','expenses:create']};
  const expense={amount:18.5,currency:'AUD',date:'2026-10-23',merchant:'Lunch',categoryId:'food',paymentAccountId:'card'};
  return {roots,store,service,principal,expense,requestId:'daily_remote_12345678',setTime:n=>time=n};
}
