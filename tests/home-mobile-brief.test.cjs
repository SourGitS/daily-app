const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract}=require('./harness.cjs');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(){
  const ctx=vm.createContext({escText:escape,homeTrainingStrip:()=>'<div class="home-training-strip">Real saved history</div>'});
  vm.runInContext(['buildHomeWidget','buildHomeTrainingCard'].map(extract).join('\n'),ctx);return ctx;
}
test('shared training preserves canonical ready, active, partial-save and empty states',()=>{
  const ctx=fixture();
  const states=[
    {title:'Chest & Back',eyebrow:'UP NEXT',action:'Open workout',meta:'8 exercises'},
    {title:'Chest & Back',eyebrow:'IN PROGRESS',action:'Continue workout',meta:'8 exercises · 2 done'},
    {title:'Previously saved split',eyebrow:'SAVED TODAY',action:'Review workout',meta:'25 min · 2 exercises saved · 4 working sets'},
    {title:'Training',eyebrow:'NO EXERCISES YET',action:'Set up split',meta:'No exercises configured'}
  ];
  for(const brief of states){
    const before=JSON.stringify(brief),html=ctx.buildHomeWidget('session',ctx.buildHomeTrainingCard(brief));
    for(const value of Object.values(brief))assert.ok(html.includes(escape(value)));
    assert.match(html,/onclick="setView\('log'\)"/);
    assert.equal((html.match(/Real saved history/g)||[]).length,1);
    assert.doesNotMatch(html,/Unused old hero|logOpenSession|saveSession|COMPLETED TODAY|hero-progress/);
    assert.equal(JSON.stringify(brief),before);
  }
});
test('training text is escaped and cannot create a new inline action',()=>{
  const ctx=fixture(),value='<img src=x onerror=alert(1)>';
  const html=ctx.buildHomeTrainingCard({title:value,eyebrow:value,meta:value,action:value});
  assert.doesNotMatch(html,/<img /);assert.equal((html.match(/&lt;img/g)||[]).length,4);
  assert.equal((html.match(/onclick=/g)||[]).length,1);
});
