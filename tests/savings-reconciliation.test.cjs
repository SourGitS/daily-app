// Savings is account-backed: a Budget allocation remains a plan, while Savers accounts and
// their transfers establish the actual position. These tests run the real readers with no DOM,
// storage or cloud so a display change cannot quietly turn an allocation into a deposit again.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(today = '2026-09-16') {
  const context = vm.createContext({ Date });
  const helpers = ['localMidnight', 'dateStr', 'acctIsSaver', 'accountEntryAt',
    'ledgerSavingsMovement', 'saverAccounts', 'savingsDateShift', 'savingsPeriodState',
    'savingsMetricLabel', 'savingsMetricDetail'].map(extract).join('\n');
  vm.runInContext(
    'let accounts=[]; let ledger=[];'+
    'function getLocalDate(){ return '+JSON.stringify(today)+'; }'+
    'function loadAccounts(){ return accounts; }'+
    'function ledgerOf(kind){ return ledger.filter(r=>r&&r.kind===kind); }'+
    'function fmtMoneyExact(value){ return "$"+Number(value).toFixed(2); }\n'+helpers,
    context
  );
  return context;
}
function state(context, accounts, ledger, from, to) {
  vm.runInContext('accounts='+JSON.stringify(accounts)+'; ledger='+JSON.stringify(ledger)+';', context);
  return clone(vm.runInContext('savingsPeriodState('+JSON.stringify(from)+','+JSON.stringify(to)+')', context));
}

test('a live drained Savers account wins over an older balance-history entry', () => {
  const result = state(fixture(), [{
    id: 'saver', type: 'asset', saver: true, current: 0,
    history: [{ date: '2026-08-31', balance: 500 }, { date: '2026-09-15', balance: 500 }]
  }], [], '2026-09-01', '2026-09-16');
  assert.equal(result.balance, 0);
  assert.equal(result.closingBalance, 0);
  assert.equal(result.openingBalance, 500);
  assert.equal(result.balanceChange, -500);
  assert.equal(result.metricKind, 'balance');
  assert.equal(result.metric, -500);
});

test('explicit saver transfers are the preferred movement evidence and include withdrawals', () => {
  const result = state(fixture(), [
    { id: 'everyday', type: 'asset', current: 200 },
    { id: 'saver', type: 'asset', saver: true, current: 700,
      history: [{ date: '2026-08-31', balance: 500 }] }
  ], [
    { kind: 'transfer', date: '2026-09-03', amount: 250, fromAcctId: 'everyday', toAcctId: 'saver' },
    { kind: 'transfer', date: '2026-09-10', amount: 100, fromAcctId: 'saver', toAcctId: 'everyday' }
  ], '2026-09-01', '2026-09-16');
  assert.deepEqual(result.transfers, { contributions: 250, withdrawals: 100, net: 150, transfers: 2 });
  assert.equal(result.metricKind, 'transfer');
  assert.equal(result.metric, 150);
});

test('a historical period with no dated balance stays unknown rather than borrowing today\'s balance', () => {
  const result = state(fixture(), [{
    id: 'saver', type: 'asset', saver: true, current: 900,
    history: [{ date: '2026-09-15', balance: 900 }]
  }], [], '2026-08-01', '2026-08-31');
  assert.equal(result.closingBalance, null);
  assert.equal(result.balanceChange, null);
  assert.equal(result.metric, null);
});

test('no Savers account makes no claim that a Budget allocation became savings', () => {
  const result = state(fixture(), [{ id: 'cash', type: 'asset', current: 1200 }], [], '2026-09-01', '2026-09-16');
  assert.equal(result.hasSavers, false);
  assert.equal(result.metric, null);
  assert.equal(result.balance, 0);
  assert.equal(vm.runInContext('savingsMetricDetail('+JSON.stringify(result)+')', fixture()),
    'Mark an asset as a Savers account in Accounts');
});

test('visible finance language distinguishes a Budget allocation from account-backed savings', () => {
  assert.match(html, /Savings allocation/);
  assert.match(source, /label:'Budget allocation'/);
  assert.match(source, /'Savers balance'/);
  assert.match(source, /Savings balance check/);
  assert.match(source, /const savings=accounts\.some\(acctIsSaver\)\?accountsSaverTotal\(\):0/);
});

test('savings check distinguishes confirmed balances from transfers and ignores archived or future records',()=>{
  const c=vm.createContext({});vm.runInContext(extract('acctSavingsCheckState'),c);
  const today='2026-10-20',checked={history:[{date:today,balance:500}],reconciliations:[{date:today,confirmedBalance:500}]};
  assert.equal(c.acctSavingsCheckState([checked],today).label,'Checked today');
  assert.equal(c.acctSavingsCheckState([{history:[{date:today,balance:500}]}],today).label,'Updated today');
  assert.equal(c.acctSavingsCheckState([checked,{history:[{date:'2026-10-19',balance:20}]}],today).label,'1 of 2 updated today');
  assert.equal(c.acctSavingsCheckState([checked,{archivedAt:1,history:[]}],today).checked,true);
  assert.equal(c.acctSavingsCheckState([{reconciliations:[{date:'2026-10-21'}]}],today).checked,false);
});

test('confirmed savings check stays complete when the older monthly opening balance is missing',()=>{
  const wrap={innerHTML:'',querySelector:()=>null},account={id:'save',name:'Savings',current:500,history:[{date:'2026-10-20',balance:500}],reconciliations:[{date:'2026-10-20',confirmedBalance:500}]};
  const c=vm.createContext({document:{getElementById:()=>wrap},getLocalDate:()=> '2026-10-20',savingsPeriodState:()=>({hasSavers:true,accounts:[account],balance:500,metric:null}),fmtDate:String,fmtMoney:String,fmtMoneyExact:String,escText:String,_catEscHtml:String,cardHeader:(icon,title,chip)=>title+chip,statsChip:(tone,text)=>text});
  vm.runInContext(extract('acctSavingsCheckState')+'\n'+extract('renderSaversReconcileCard'),c);const before=JSON.stringify(account);c.renderSaversReconcileCard();
  assert.match(wrap.innerHTML,/<summary>Savings balance check<\/summary>/);assert.doesNotMatch(wrap.innerHTML,/<details[^>]* open|card-fig/);assert.match(wrap.innerHTML,/check is complete/);assert.match(wrap.innerHTML,/needs a balance recorded before/);assert.match(wrap.innerHTML,/Check again/);assert.doesNotMatch(wrap.innerHTML,/Reconcile balances|Update saver balances/);assert.equal(JSON.stringify(account),before);
});
