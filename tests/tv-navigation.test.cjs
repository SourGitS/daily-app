const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/tv-navigation.js'),'utf8');

// Before DOM readiness the module must make its explicit URL decision without
// reading app data, looking at screen size, or touching controls and drafts.
function bootstrap(href){
  const attrs=new Map(),styles=new Map(),events=new Map(),documentEvents=new Map(),replaced=[];
  const root={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
    style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)||''}};
  const document={documentElement:root,readyState:'loading',body:null,
    addEventListener:(k,fn)=>documentEvents.set(k,fn),removeEventListener:(k,fn)=>{if(documentEvents.get(k)===fn)documentEvents.delete(k);},
    getElementById:()=>null,querySelectorAll:()=>{throw Error('unexpected pre-ready DOM query');}};
  const context={document,URL,location:{href},history:{state:{dailyView:'notes',custom:'preserved'},replaceState:(state,title,url)=>replaced.push({state,title,url})},
    addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:(k,fn)=>{if(events.get(k)===fn)events.delete(k);},
    matchMedia:()=>{throw Error('screen size must not activate TV mode');},
    clearTimeout,clearInterval,console};
  Object.defineProperty(context,'innerWidth',{get(){throw Error('no viewport inference');}});
  for(const key of ['localStorage','sessionStorage','firebase','fetch'])Object.defineProperty(context,key,{get(){throw Error('no app data or network access: '+key);}});
  context.window=context;
  vm.runInNewContext(source,context,{filename:'tv-navigation.js'});
  return {context,attrs,styles,events,documentEvents,replaced};
}

test('TV navigation is absent for ordinary and non-exact opt-in URLs',()=>{
  for(const query of ['', '?tv=0','?tv=true','?tv=01','?TV=1','?tv=1x']){
    const app=bootstrap('https://daily.invalid/app/'+query+'#home');
    assert.equal(app.context.DailyTV.enabled,false,query);
    assert.equal(app.context.DailyTV.mode,'navigation');
    assert.equal(app.attrs.size,0);
    assert.equal(app.documentEvents.has('keydown'),false);
    assert.equal(app.replaced.length,0,'initial load must not rewrite normal history');
  }
});

test('exact tv=1 URL enables the CSS marker before app readiness without data access',()=>{
  const app=bootstrap('https://daily.invalid/app/?preview=1&tv=1#budget');
  assert.equal(app.context.DailyTV.enabled,true);
  assert.equal(app.attrs.get('data-tv'),'true');
  assert.equal(app.documentEvents.has('DOMContentLoaded'),true);
  assert.equal(app.documentEvents.has('keydown'),false,'remote handlers wait until app DOM is ready');
  assert.equal(app.replaced.length,0);
});

test('Exit TV removes its URL mode without a reload or losing route/history state',()=>{
  const app=bootstrap('https://daily.invalid/app/?preview=1&tv=1#notes');
  const state=app.context.history.state;
  assert.equal(app.context.DailyTV.setEnabled(false),false);
  assert.equal(app.attrs.has('data-tv'),false);
  assert.equal(app.replaced.length,1);
  assert.equal(app.replaced[0].url,'/app/?preview=1#notes');
  assert.equal(app.replaced[0].state,state);
  assert.equal(app.context.DailyTV.back(),false,'root Back is browser owned');
});

test('history URL changes reconcile opt-in without intercepting navigation',()=>{
  const app=bootstrap('https://daily.invalid/app/?preview=1#home');
  const pop=app.events.get('popstate');
  app.context.location.href='https://daily.invalid/app/?preview=1&tv=1#budget';
  pop({preventDefault(){throw Error('history must not be trapped');}});
  assert.equal(app.context.DailyTV.enabled,true);
  app.context.location.href='https://daily.invalid/app/?preview=1#home';
  pop({preventDefault(){throw Error('history must not be trapped');}});
  assert.equal(app.context.DailyTV.enabled,false);
  assert.equal(app.attrs.has('data-tv'),false);
  assert.equal(app.context.history.state.dailyView,'notes','TV does not own app route state');
});

test('destroy also releases the URL and pending DOM-ready observers',()=>{
  const app=bootstrap('https://daily.invalid/app/#home');
  app.context.DailyTV.destroy();
  assert.equal(app.events.has('popstate'),false);
  assert.equal(app.documentEvents.has('DOMContentLoaded'),false);
  assert.equal(app.replaced.length,0);
});
