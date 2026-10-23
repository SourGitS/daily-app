'use strict';
// Compile only named canonical functions, not app boot code. No runtime source evaluation.
// The browser remains the source of truth; each build fails if a named function disappears.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),acorn=require('acorn');
const root=path.resolve(__dirname,'..');
const files=['js/app.js','js/ai-assistant.js','js/accounts-tools.js','js/finance-accounts.js'];
const nodes=new Map(),hashes={};
for(const file of files){
  const source=fs.readFileSync(path.join(root,file),'utf8');hashes[file]=crypto.createHash('sha256').update(source).digest('hex');
  for(const node of acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'}).body){
    if(node.type==='FunctionDeclaration')nodes.set(node.id.name,source.slice(node.start,node.end));
    if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.type==='Identifier')nodes.set(d.id.name,`${node.kind} ${source.slice(d.start,d.end)};`);
  }
}
const names=[
  'AI_ACT_MAXSTR','CAT_ID_SHAPE','CAT_CHARGE_TYPES','aiActStr','aiActTooLong','aiActValidDate','aiActMoney','aiActFmtDate',
  'aiResolveRef','aiResolveAccount','aiValExpense','txnCreateRecord','aiActSource','ledgerNormaliseSource','ledgerSrcKey',
  'aiNearDupTxns','aiDupWarning','aiPendingTxns','aiDayGap','aiPendingMatch','aiPendingWarning','fmtMoneyExact',
  'catLabel','catDisplayName','catIsUnnamed','catIsArchived','activeCats','catAmount','catCycle','catChargeType','catIsRecurring',
  'catStatus','catIsCharging','catPaymentAccount','localMidnight','dateStr','_billMonthlyOn','_billYearlyOn',
  'catOccurrencesBetween','billIsScheduled','billOccurrences','acctCurrentStatement','acctFinStatementId','acctFinCents',
  'acctFinStatementProgress','acctStatementRemaining','dailyAIToday','dailyAIMoney','dailyAIValidateExpenseData','dailyAIBills'
];
const declarations=names.map(name=>{if(!nodes.has(name))throw Error('Missing canonical function '+name);return nodes.get(name);}).join('\n');
const output=`// Generated from Daily canonical functions by build-core.cjs. Do not edit.\nexport const sourceHashes=${JSON.stringify(hashes)};\nexport function financeContext(data, options={}){\n
  let txnData=structuredClone(data.transactions||[]);
  const accounts=structuredClone(data.accounts||[]),ledgerData=structuredClone(data.ledger||[]);
  const loadAccounts=()=>accounts,loadVarCats=()=>data.budgetVarCats||[],loadFixCats=()=>data.budgetFixCats||[];
  const ledgerOf=kind=>ledgerData.filter(r=>r&&r.kind===kind);
  const genTxnId=()=>options.recordId||(()=>{throw Error('Record ID required');})();
  const saveTxns=()=>true; // Writes the transaction's private draft only. Caller must atomically commit it.
  const dailyAIApplying=true;
  ${declarations}
  return {today:dailyAIToday,validDate:aiActValidDate,
    references:()=>({categories:activeCats(loadVarCats()).map(c=>({id:c.id,name:catLabel(c)})),accounts:accounts.filter(a=>!a.archivedAt).map(a=>({id:a.id,name:a.name,type:a.type}))}),
    bills:(from,to)=>{const report=dailyAIBills(from,to);report.items.forEach(i=>delete i.postedBalance);return report;},
    validate:(payload,id)=>{dailyAIValidateExpenseData(payload);const v=aiValExpense(payload,id);if(!v.ok)throw Error(v.error);return v;},
    create:(payload,id)=>{dailyAIValidateExpenseData(payload);const v=aiValExpense(payload,id);if(!v.ok)throw Error(v.error);const result=v.apply({aiActionId:id,aiSource:'Fuji connection'});return {result,transactions:txnData,record:txnData.find(r=>r.id===result.recordId)};}
  };
}\n`;
const out=path.join(__dirname,'generated');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'finance.mjs'),output);
console.log('Built canonical adapter: '+names.length+' existing functions/constants.');
