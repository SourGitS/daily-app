const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract,copy}=require('./harness.cjs');
function fixture(accounts){
  const wrap={innerHTML:''},charts=[];
  const c=vm.createContext({accounts,console,document:{documentElement:{},getElementById:id=>id==='accounts-chart'?wrap:{}},
    getComputedStyle:()=>({getPropertyValue:()=> '#533B7E'}),getLocalDate:()=> '2026-10-04',
    localMidnight:s=>new Date(s+'T00:00:00'),dateStr:d=>d.toISOString().slice(0,10),
    fmtMoney:n=>'$'+n,fmtDate:s=>s,_catEscHtml:s=>s,a_name:a=>a.name,acctIcon:()=>'',tstat:()=>'',
    hexToRgb:()=> '83,59,126',budChartGridColors:()=>({gc:'#333',tc:'#fff'}),S:{theme:'dark'},
    Chart:class{constructor(ctx,config){charts.push(config);}destroy(){}}});
  vm.runInContext("const _nwCharts={};let nwChartRange='all';const nwChartSeries={assets:true,debts:true};\n"+
    ['accountEntryAt','accountsHistoryDates','nwHistoryPoints','nwChartDates','nwCompactMoney','renderNetWorthChartInto'].map(extract).join('\n'),c);
  return {c,wrap,charts};
}
const recorded=()=>[
  {id:'cash',name:'Cash',type:'asset',current:1500,history:[{date:'2026-08-01',balance:1000},{date:'2026-09-01',balance:1500}]},
  {id:'card',name:'Card',type:'debt',current:200,history:[{date:'2026-09-15',balance:200}]}
];
test('later account records preserve earlier history without backfilling unknown balances',()=>{
  const data=recorded(),before=copy(data),{c}=fixture(data),p=copy(c.nwHistoryPoints());
  assert.deepEqual(p.map(x=>[x.date,x.net,x.count]),[['2026-08-01',1000,1],['2026-09-01',1500,1],['2026-09-15',1300,2]]);
  assert.deepEqual(data,before);
});
test('an undated account cannot hide the recorded chart or fabricate past balances',()=>{
  const data=recorded();data.push({id:'new',name:'New account',type:'asset',current:9000,history:[]});
  const {c,wrap,charts}=fixture(data);c.renderNetWorthChartInto('accounts-chart');
  assert.equal(charts.length,1);assert.deepEqual(copy(charts[0].data.datasets[0].data),[1000,1500,1300]);
  assert.match(wrap.innerHTML,/Recorded net worth/);assert.match(wrap.innerHTML,/coverage changed/);
  assert.equal(charts[0].options.plugins.tooltip.callbacks.footer([{dataIndex:2}]),'2 of 3 accounts recorded · partial total');
  assert.deepEqual(copy(charts[0].data.datasets[2].data),[null,null,200]);
});
test('complete histories retain their comparable net-worth change',()=>{
  const data=recorded();data[1].history=[{date:'2026-08-01',balance:400},{date:'2026-09-01',balance:200}];
  const {c,wrap,charts}=fixture(data);c.renderNetWorthChartInto('accounts-chart');
  assert.deepEqual(copy(charts[0].data.datasets[0].data),[600,1300]);
  assert.match(wrap.innerHTML,/\+\$700/);assert.doesNotMatch(wrap.innerHTML,/coverage changed/);
});
test('a real zero balance is a plotted point; undated current balances remain unplotted',()=>{
  const {c,charts}=fixture([{id:'zero',type:'asset',current:200,history:[{date:'2026-10-01',balance:0}]}]);
  c.renderNetWorthChartInto('accounts-chart');assert.deepEqual(copy(charts[0].data.datasets[0].data),[0]);
  const empty=fixture([{id:'none',type:'asset',current:200,history:[]}]);empty.c.renderNetWorthChartInto('accounts-chart');
  assert.equal(empty.charts.length,0);assert.match(empty.wrap.innerHTML,/dated balance/);
});
