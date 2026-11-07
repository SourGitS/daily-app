const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {extract}=require('./harness.cjs');
function fixture(date,offset=0,items=[]){
  const calls=[],c=vm.createContext({
    Date,Map,Math,getLocalDate:()=>date,
    localMidnight:s=>new Date(s+'T00:00:00'),
    dateStr:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
    billOccurrences:(from,to)=>{calls.push([c.dateStr(from),c.dateStr(to)]);return items.filter(o=>o.key>=c.dateStr(from)&&o.key<=c.dateStr(to));}
  });
  vm.runInContext('let budBillsMonthOffset='+offset+',budBillsDay="";'+extract('budBillsState'),c);
  return {c,calls};
}
test('Overview shares one canonical upcoming schedule, starting today in the current month',()=>{
  const {c,calls}=fixture('2026-11-07',0,[{key:'2026-11-10',amount:19.95},{key:'2026-11-10',kind:'statement',amount:40}]);
  const s=c.budBillsState();
  assert.deepEqual(calls,[['2026-11-07','2026-11-30']]);
  assert.equal(s.total,59.95);assert.equal(s.selected,'2026-11-10');
});
test('bill month navigation handles leap years and year boundaries without inventing dates',()=>{
  for(const [date,offset,from,to] of [
    ['2028-01-31',1,'2028-02-01','2028-02-29'],
    ['2027-01-31',1,'2027-02-01','2027-02-28'],
    ['2026-12-31',1,'2027-01-01','2027-01-31'],
    ['2026-01-01',-1,'2025-12-01','2025-12-31']
  ]){
    const {c,calls}=fixture(date,offset);c.budBillsState();assert.deepEqual(calls,[[from,to]]);
  }
});
test('selected-day context survives redraws but resets when it is outside the viewed month',()=>{
  const {c}=fixture('2026-11-07',0,[{key:'2026-11-10',amount:20}]);
  vm.runInContext('budBillsDay="2026-11-20";',c);assert.equal(c.budBillsState().selected,'2026-11-20');
  vm.runInContext('budBillsMonthOffset=1;',c);assert.equal(c.budBillsState().selected,'2026-12-01');
});

test('the compact list groups every charge into Monday weeks and clips labels to the viewed range',()=>{
  const {c}=fixture('2026-11-07',0,[
    {key:'2026-11-07',amount:10.1},{key:'2026-11-08',amount:20.2},
    {key:'2026-11-09',amount:50},{key:'2026-11-09',amount:5},{key:'2026-11-30',amount:7}
  ]);
  c.budDateAdd=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  c.budMoneyRound=n=>Math.round(n*100)/100;
  vm.runInContext(extract('budBillsListWeeks'),c);
  const s=c.budBillsState(),weeks=c.budBillsListWeeks(s);
  assert.deepEqual(JSON.parse(JSON.stringify(weeks.map(w=>[w.from,w.to,w.items.length,w.total]))),[
    ['2026-11-07','2026-11-08',2,30.3],['2026-11-09','2026-11-15',2,55],['2026-11-30','2026-11-30',1,7]
  ]);
  assert.equal(weeks.flatMap(w=>w.items).length,s.items.length);
  assert.equal(weeks.reduce((n,w)=>n+w.total,0),92.3);
});
