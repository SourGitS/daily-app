const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./harness.cjs');

function fixture(){
  let date='2026-09-28';
  const ctx=vm.createContext({getLocalDate:()=>date});
  vm.runInContext(['weatherDailyView','applyWeatherLandscape','weatherLandscapeSvg','weatherSceneryWindows','weatherSceneryTree'].map(extract).join('\n'),ctx);
  return {ctx,today:value=>{date=value;}};
}

test('the daily view is stable on repeated reads and advances across DST, month and year boundaries',()=>{
  const {ctx,today}=fixture();
  for(const first of ['2026-09-28','2026-10-03','2026-12-31','2028-02-28']){
    const date=new Date(first+'T12:00:00Z');
    const sequence=[];
    for(let day=0;day<4;day++){
      const iso=date.toISOString().slice(0,10);
      today(iso);
      const chosen=ctx.weatherDailyView();
      for(let read=0;read<24;read++) assert.equal(ctx.weatherDailyView(),chosen);
      sequence.push(chosen);
      date.setUTCDate(date.getUTCDate()+1);
    }
    assert.equal(new Set(sequence.slice(0,3)).size,3);
    assert.equal(sequence[3],sequence[0]);
  }
});

test('freshness repaints keep the art node, and midnight changes only its decorative contents',()=>{
  const {ctx,today}=fixture();
  let paints=0,html='';
  const art={dataset:{view:'harbour'},get innerHTML(){return html;},set innerHTML(value){paints++;html=value;}};
  const disclosure={open:true}, focused={id:'home-weather-refresh'};
  const card={querySelector:selector=>{assert.equal(selector,'.weather-landscape');return art;},disclosure,focused};
  for(let i=0;i<60;i++)ctx.applyWeatherLandscape(card);
  assert.equal(paints,0);
  today('2026-09-29');
  ctx.applyWeatherLandscape(card);
  assert.equal(art.dataset.view,'coast');assert.equal(paints,1);
  assert.match(html,/wx-lighthouse/);
  assert.equal(card.disclosure,disclosure);assert.equal(card.focused,focused);assert.equal(disclosure.open,true);
  ctx.applyWeatherLandscape(card);assert.equal(paints,1);
  today('2026-09-30');ctx.applyWeatherLandscape(card);
  assert.equal(art.dataset.view,'terraces');assert.match(html,/wx-veranda/);
});

test('a card without the daily artwork remains compatible with the existing weather renderer',()=>{
  const {ctx}=fixture();
  assert.doesNotThrow(()=>ctx.applyWeatherLandscape({querySelector:()=>null}));
});
