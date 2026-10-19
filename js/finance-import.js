'use strict';

// Local, review-first CSV handling. Files and drafts never leave the browser.
function acctFinCsvParse(text){
  if(typeof text!=='string'||text.length>262144)throw new Error('Use a CSV of 256 KB or less.');
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=ch;continue;}
    if(ch==='"'){if(field.trim()||closed)throw new Error('A CSV quote is misplaced.');field='';quoted=true;continue;}
    if(ch===','||ch==='\n'||ch==='\r'){
      row.push(field.trim());field='';closed=false;
      if(ch!==','){if(row.some(v=>v!==''))rows.push(row);row=[];if(ch==='\r'&&text[i+1]==='\n')i++;}
      continue;
    }
    if(closed&&ch.trim())throw new Error('Unexpected text after a quoted CSV field.');field+=ch;
  }
  if(quoted)throw new Error('A quoted CSV field is not closed.');row.push(field.trim());if(row.some(v=>v!==''))rows.push(row);
  if(rows.length<2)throw new Error('Include a header and at least one data row.');if(rows.length>301)throw new Error('Review at most 300 rows at a time.');
  const headers=rows.shift().map(s=>s.toLowerCase().replace(/[\s-]+/g,'_'));
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('Column headers must be unique and non-empty.');
  return rows.map((values,i)=>{if(values.length!==headers.length)throw new Error('Row '+(i+2)+' has a different number of columns.');return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
}
function acctFinCsvDate(value){
  const text=String(value||'').trim(),m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/),date=m?m[3]+'-'+m[2]+'-'+m[1]:text;
  if(!budDateValid(date))throw new Error('Use dates as YYYY-MM-DD or DD/MM/YYYY.');return date;
}
function acctFinCsvMoney(value,optional){return acctMoney(String(value??'').replace(/^\$/,'').replace(/,/g,''),optional);}
function acctFinStatementExtra(record,input){
  for(const key of ['openingBalance','purchases','printedRepayments','credits'])if(input[key]!==undefined)record[key]=acctMoney(input[key],true);
  if(input.periodStart!==undefined){if(input.periodStart&&(!budDateValid(input.periodStart)||input.periodStart>record.statementDate))throw new Error('The statement period must start on or before its statement date.');record.periodStart=input.periodStart||'';}
  if(input.sourceName!==undefined)record.sourceName=String(input.sourceName).trim().slice(0,160);
  return record;
}
function acctFinStatementEquation(r){
  if(!['openingBalance','purchases','printedRepayments','credits','interest','fees'].every(k=>r[k]!==undefined&&r[k]!==null))return null;
  return (acctFinCents(r.openingBalance)+acctFinCents(r.purchases)+acctFinCents(r.interest)+acctFinCents(r.fees)-acctFinCents(r.printedRepayments)-acctFinCents(r.credits)-acctFinCents(r.statementBalance))/100;
}
function acctFinStatementFacts(r){
  const labels={openingBalance:'Opening',purchases:'Purchases',printedRepayments:'Printed repayments',credits:'Credits'},parts=Object.keys(labels).filter(k=>r[k]!==undefined&&r[k]!==null).map(k=>labels[k]+' '+fmtMoneyExact(r[k]));
  const difference=acctFinStatementEquation(r);
  return (parts.length?'<small>'+parts.join(' · ')+'</small>':'')+(difference!==null?'<small'+(difference?' class="fin-warning"':'')+'>'+(difference?'Statement components differ from closing by '+fmtMoneyExact(difference)+'. Check for missing charges or adjustments.':'Statement components match the closing balance.')+'</small>':'')+(r.sourceName?'<small>Source: '+escText(r.sourceName)+'</small>':'');
}
function acctFinStatementCsvRows(account,text,sourceName){
  const seen=new Map();
  return acctFinCsvParse(text).map((row,i)=>{
    try{
      const input={statementDate:acctFinCsvDate(row.statement_date),dueDate:acctFinCsvDate(row.due_date),balance:String(acctFinCsvMoney(row.closing_balance)),
        minimum:row.minimum||'',interest:row.interest||'',fees:row.fees||'',status:row.status||'historical',sourceName:row.source||sourceName||''};
      for(const [csv,key] of [['opening_balance','openingBalance'],['purchases','purchases'],['repayments','printedRepayments'],['credits','credits']])if(row[csv]!==undefined)input[key]=row[csv];
      if(row.period_start)input.periodStart=acctFinCsvDate(row.period_start);
      for(const k of ['minimum','interest','fees','openingBalance','purchases','printedRepayments','credits'])if(input[k]!==undefined)input[k]=input[k]===''?'':String(acctFinCsvMoney(input[k]));
      if(seen.has(input.statementDate)){const same=JSON.stringify(seen.get(input.statementDate))===JSON.stringify(input);return {row:i+2,input,status:same?'duplicate':'conflict',message:same?'Repeated CSV row — skipped':'Repeated statement date with different figures. Review this CSV before importing.'};}
      const old=acctFinStatements(account).find(r=>r.statementDate===input.statementDate||(!r.statementDate&&r.dueDate===input.dueDate&&r.statementBalance===Number(input.balance)));
      if(old){const same=old.dueDate===input.dueDate&&Number(old.statementBalance)===Number(input.balance)&&['minimum','interest','fees','openingBalance','purchases','printedRepayments','credits'].every(k=>input[k]===undefined||input[k]===''||old[k]!==null&&old[k]!==undefined&&Number(old[k])===Number(input[k]));
        return {row:i+2,input,status:same?'duplicate':'conflict',message:same?'Already recorded — skipped':'Same statement date has different figures. Correct the existing record instead.'};}
      acctStatementBuild(account,input);seen.set(input.statementDate,input);return {row:i+2,input,status:'ready',message:'Ready for review'};
    }catch(e){return {row:i+2,status:'error',message:e.message};}
  });
}
function acctFinStatementImportBuild(list,id,rows){
  const next=acctFinClone(list),index=next.findIndex(a=>a.id===id);if(index<0||next[index].archivedAt)throw new Error('Choose an active account.');
  if(!rows.length)throw new Error('Select at least one valid new statement.');
  // Date order makes multiple current statements archive earlier ones predictably.
  for(const row of rows.slice().sort((a,b)=>a.input.statementDate.localeCompare(b.input.statementDate))){if(row.status!=='ready')throw new Error('Only valid new rows may be imported.');next[index]=acctStatementBuild(next[index],row.input);}
  return next;
}
function acctFinStatementImportOpen(id){
  const a=loadAccounts().find(a=>a.id===id);if(!a)return;
  acctToolDraft={kind:'statement-import',id,signature:acctLinkSignature(),rows:[]};
  acctToolForm('Import statement history','<p>Use a CSV with statement_date, due_date and closing_balance. Optional columns: minimum, interest, fees, status (historical / current / paid), opening_balance, purchases, repayments, credits, period_start and source. Dates use YYYY-MM-DD or DD/MM/YYYY.</p>'+
    '<p>Importing statement figures never changes balances, spending or income. Printed repayment totals are reference figures, not new payments.</p>'+
    '<button type="button" class="stg-btn" onclick="acctFinStatementTemplate()">Download CSV template</button>'+
    '<div class="stg-field"><label for="fin-import-file">CSV file (optional)</label><input id="fin-import-file" type="file" accept=".csv,text/csv" onchange="acctFinImportFile(this)"></div>'+
    '<div class="stg-field"><label for="fin-import-text">Or paste CSV</label><textarea id="fin-import-text" rows="7" maxlength="262144"></textarea></div>'+
    '<button type="button" class="stg-btn" onclick="acctFinStatementImportReview()">Review rows</button><div id="fin-import-preview"></div>',
    'acctFinStatementImportConfirm','Import selected statements');
}
async function acctFinImportFile(input){
  const draft=acctToolDraft,file=input.files?.[0];if(!draft||!file)return;
  try{if(file.size>262144)throw new Error('Use a CSV of 256 KB or less.');const text=await file.text();if(acctToolDraft!==draft)return;document.getElementById('fin-import-text').value=text;draft.sourceName=file.name;draft.rows=[];document.getElementById('fin-import-preview').textContent='File loaded. Select Review rows before saving.';}
  catch(e){if(acctToolDraft===draft)document.getElementById('acct-tools-error').textContent=e.message;}
}
function acctFinStatementImportReview(){
  const d=acctToolDraft;if(d?.kind!=='statement-import')return;
  try{acctFinGuard(d);d.reviewText=document.getElementById('fin-import-text').value;d.rows=acctFinStatementCsvRows(loadAccounts().find(a=>a.id===d.id),d.reviewText,d.sourceName);
    document.getElementById('fin-import-preview').innerHTML=d.rows.map((r,i)=>'<div class="acct-record"><label><input type="checkbox" data-import-row="'+i+'"'+(r.status==='ready'?' checked':' disabled')+'> Row '+r.row+'</label><span>'+escText(r.input?.statementDate||'')+(r.input?' · '+fmtMoneyExact(Number(r.input.balance)):'')+'</span><small>'+escText(r.message)+'</small></div>').join('');document.getElementById('acct-tools-error').textContent='';
  }catch(e){document.getElementById('acct-tools-error').textContent=e.message;}
}
function acctFinStatementImportConfirm(){
  const d=acctToolDraft;if(d?.kind!=='statement-import')return false;
  if(d.reviewText!==document.getElementById('fin-import-text').value){document.getElementById('acct-tools-error').textContent='Review the current CSV before importing.';return false;}
  const selected=[...document.querySelectorAll('[data-import-row]:checked')].map(el=>d.rows[Number(el.dataset.importRow)]);
  return acctFinAccountSave(list=>acctFinStatementImportBuild(list,d.id,selected));
}
function acctFinDownload(filename,text,type){const url=URL.createObjectURL(new Blob([text],{type:type||'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function acctFinStatementTemplate(){acctFinDownload('daily-statements-template.csv','statement_date,due_date,closing_balance,minimum,interest,fees,status,opening_balance,purchases,repayments,credits,period_start,source\n2026-09-16,2026-10-12,400,20,0,0,historical,300,200,100,0,2026-08-17,Example statement\n','text/csv');}
function acctFinExport(){
  const keys=['daily_accounts','daily_transactions','daily_ledger','daily_budget','daily_budget_cycles','daily_budget_inc_cats','daily_budget_var_cats','daily_budget_fix_cats'];
  const records=Object.fromEntries(keys.map(k=>[k,lsLoad(k,null)]));
  acctFinDownload('daily-finance-records-'+getLocalDate()+'.json',JSON.stringify({format:'daily-finance-records',version:1,exportedAt:new Date().toISOString(),records},null,2));showToast('Finance records exported. Use Settings for a full restorable app backup.');
}
