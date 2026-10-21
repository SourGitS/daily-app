// Pure scratchpad calculations: no DOM, financial stores or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {extract}=require('./harness.cjs');
const ctx=vm.createContext({});
vm.runInContext(['bcalcTrim','bcalcApply','txnCalcStep','txnCalcAmount'].map(extract).join('\n'),ctx);
const empty=()=>({acc:null,op:null,entry:'0',fresh:true});
function calc(keys){return keys.reduce((s,key)=>ctx.txnCalcStep(s,key),empty());}
test('expense scratchpad resolves decimals, chained operations, percentages and refunds',()=>{
  assert.equal(calc(['0','.','1','+','0','.','2','=']).entry,'0.3');
  assert.equal(calc(['1','2','.','5','*','2','+','5','=']).entry,'30');
  assert.equal(calc(['2','0','0','+','1','0','%','=']).entry,'220');
  assert.equal(calc(['5','0','%']).entry,'0.5');
  assert.equal(ctx.txnCalcAmount(calc(['7','.','5','sign']).entry),'-7.50');
  assert.equal(calc(['9','+','*','3','=']).entry,'27');
});
test('scratchpad backspace and errors recover without mutating prior calculator state',()=>{
  const original=empty();ctx.txnCalcStep(original,'9');assert.deepEqual(original,empty());
  assert.equal(calc(['1','2','back','.','5']).entry,'1.5');
  assert.equal(calc(['4','/','0','=']).entry,'Can’t divide by 0');
  assert.equal(calc(['4','/','0','=','9','+','1','=']).entry,'10');
  assert.equal(calc(['4','/','0','=','clear']).entry,'0');
});
test('only a finite, nonzero currency result can fill an expense draft',()=>{
  for(const value of ['Can’t divide by 0','Infinity','1e100','0','0.001'])assert.equal(ctx.txnCalcAmount(value),null);
  assert.equal(ctx.txnCalcAmount('7.5'),'7.50');assert.equal(ctx.txnCalcAmount('10.236'),'10.24');
});
