const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/tv-navigation.js'),'utf8');

// Before DOM readiness the module must make its explicit URL decision without
// reading account data, looking at screen size, or touching controls and drafts.
function bootstrap(href,options={}){
  const attrs=new Map(),styles=new Map(),events=new Map(),documentEvents=new Map(),replaced=[];
  const values=options.values||new Map(),reads=[],writes=[],emitted=[];
  const nativeStorage={
    getItem(key){assert.equal(key,'daily-tv-mode','only the isolated device key may be read');reads.push(key);if(options.readError)throw Error('Storage read denied');return values.get(key)??null;},
    setItem(key,value){assert.equal(key,'daily-tv-mode','only the isolated device key may be written');if(options.writeError)throw Error('Quota exceeded');writes.push([key,value]);values.set(key,value);}
  };
  const root={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
    style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k),getPropertyValue:k=>styles.get(k)||''}};
  const document={documentElement:root,readyState:'loading',body:null,
    addEventListener:(k,fn)=>documentEvents.set(k,fn),removeEventListener:(k,fn)=>{if(documentEvents.get(k)===fn)documentEvents.delete(k);},
    getElementById:()=>null,querySelectorAll:()=>{throw Error('unexpected pre-ready DOM query');}};
  const context={document,URL,location:{href},history:{state:{dailyView:'notes',custom:'preserved'},replaceState:(state,title,url)=>replaced.push({state,title,url})},
    addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:(k,fn)=>{if(events.get(k)===fn)events.delete(k);},
    dispatchEvent:event=>{emitted.push(event);events.get(event.type)?.(event);return true;},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    matchMedia:()=>{throw Error('screen size must not activate TV mode');},
    requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},clearTimeout,clearInterval,console};
  Object.defineProperty(context,'innerWidth',{get(){throw Error('no viewport inference');}});
  Object.defineProperty(context,'localStorage',{get(){if(options.storageError)throw Error('Storage unavailable');return nativeStorage;}});
  for(const key of ['sessionStorage','firebase','fetch'])Object.defineProperty(context,key,{get(){throw Error('no app data or network access: '+key);}});
  context.__accountScopedStorage={scope:options.scope||'user:a',getItem(){throw Error('must not read scoped account storage');},setItem(){throw Error('must not write scoped account storage');}};
  context.window=context;
  vm.runInNewContext('const localStorage=__accountScopedStorage;\n'+source,context,{filename:'tv-navigation.js'});
  return {context,attrs,styles,events,documentEvents,replaced,values,reads,writes,emitted};
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

test('exact tv=1 URL enables the CSS marker before app readiness without account access',()=>{
  const app=bootstrap('https://daily.invalid/app/?preview=1&tv=1#budget');
  assert.equal(app.context.DailyTV.enabled,true);
  assert.equal(app.attrs.get('data-tv'),'true');
  assert.equal(app.documentEvents.has('DOMContentLoaded'),true);
  assert.equal(app.documentEvents.has('keydown'),false,'remote handlers wait until app DOM is ready');
  assert.equal(app.replaced.length,0);
  assert.deepEqual(app.reads,['daily-tv-mode']);
  assert.deepEqual(app.writes,[]);
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
  assert.deepEqual(app.writes,[],'history must not write a device choice');
  assert.equal(app.replaced.length,0,'history reconciliation must not rewrite the current URL');
});

test('destroy also releases the URL and pending DOM-ready observers',()=>{
  const app=bootstrap('https://daily.invalid/app/#home');
  app.context.DailyTV.destroy();
  assert.equal(app.events.has('popstate'),false);
  assert.equal(app.events.has('storage'),false);
  assert.equal(app.documentEvents.has('DOMContentLoaded'),false);
  assert.equal(app.replaced.length,0);
});

test('Settings choice survives an ordinary URL restart and is independent of account scope',()=>{
  const values=new Map(),first=bootstrap('https://daily.invalid/app/#settings',{values,scope:'user:a'});
  assert.equal(first.context.DailyTV.setEnabled(true,{persist:true,source:'settings'}),true);
  assert.equal(values.get('daily-tv-mode'),'1');
  assert.equal(first.emitted.at(-1).type,'daily-tv-change');
  assert.deepEqual(JSON.parse(JSON.stringify(first.emitted.at(-1).detail)),{enabled:true,preference:true,persisted:true,source:'settings'});
  const otherAccount=bootstrap('https://daily.invalid/app/#home',{values,scope:'user:b'});
  assert.equal(otherAccount.context.DailyTV.enabled,true);
  assert.equal(otherAccount.replaced.length,0,'remembered startup does not rewrite the normal URL');
  assert.deepEqual([...values.keys()],['daily-tv-mode']);
});

test('explicit TV URL opens despite remembered off and never silently changes that choice',()=>{
  const values=new Map([['daily-tv-mode','0']]);
  const app=bootstrap('https://daily.invalid/app/?tv=1#home',{values});
  assert.equal(app.context.DailyTV.enabled,true);
  assert.equal(values.get('daily-tv-mode'),'0');assert.equal(app.writes.length,0);
  app.context.location.href='https://daily.invalid/app/#home';app.events.get('popstate')({});
  assert.equal(app.context.DailyTV.enabled,false);assert.equal(app.writes.length,0);
  app.context.location.href='https://daily.invalid/app/?tv=1#home';app.events.get('popstate')({});
  assert.equal(app.context.DailyTV.enabled,true);assert.equal(values.get('daily-tv-mode'),'0');
  assert.equal(app.emitted.at(-1).detail.source,'history');assert.equal(app.emitted.at(-1).detail.persisted,null);
});

test('non-forcing URL values and malformed preference data have strict semantics',()=>{
  const on=new Map([['daily-tv-mode','1']]);
  assert.equal(bootstrap('https://daily.invalid/app/?tv=0',{values:on}).context.DailyTV.enabled,true,'only tv=1 overrides the device choice');
  for(const raw of ['true','01','false','{"enabled":true}','']){
    assert.equal(bootstrap('https://daily.invalid/app/',{values:new Map([['daily-tv-mode',raw]])}).context.DailyTV.enabled,false,raw);
  }
});

test('an explicit off choice clears the override and is retained on the next normal launch',()=>{
  const values=new Map([['daily-tv-mode','1']]),app=bootstrap('https://daily.invalid/app/?tv=1#food',{values});
  app.context.DailyTV.setEnabled(false,{persist:true,source:'exit'});
  assert.equal(values.get('daily-tv-mode'),'0');
  assert.equal(app.replaced.at(-1).url,'/app/#food');
  assert.equal(app.emitted.at(-1).detail.source,'exit');
  assert.equal(bootstrap('https://daily.invalid/app/#food',{values}).context.DailyTV.enabled,false);
});

test('remembering an already enabled link is an explicit write and emits its result',()=>{
  const app=bootstrap('https://daily.invalid/app/?tv=1#settings');
  app.context.DailyTV.setEnabled(true,{persist:true,source:'settings'});
  assert.deepEqual(app.writes,[['daily-tv-mode','1']]);
  assert.equal(app.emitted.length,1);assert.equal(app.emitted[0].detail.persisted,true);
});

test('temporary API mode and technical cleanup leave the remembered choice unchanged',()=>{
  const app=bootstrap('https://daily.invalid/app/#home');
  app.context.DailyTV.setEnabled(true);
  assert.equal(app.emitted.at(-1).detail.persisted,null);assert.equal(app.values.has('daily-tv-mode'),false);
  app.context.DailyTV.destroy();assert.equal(app.values.has('daily-tv-mode'),false);
  assert.equal(app.writes.length,0);
});

test('blocked or full native storage still permits a session choice and reports failure',()=>{
  for(const failure of [{storageError:true},{writeError:true}]){
    const values=new Map(),app=bootstrap('https://daily.invalid/app/#settings',{values,...failure});
    assert.equal(app.context.DailyTV.setEnabled(true,{persist:true,source:'settings'}),true);
    assert.equal(app.emitted.at(-1).detail.persisted,false);
    app.context.location.href='https://daily.invalid/app/#home';app.events.get('popstate')({});
    assert.equal(app.context.DailyTV.enabled,true,'normal history retains this session choice after a failed write');
    assert.equal(values.has('daily-tv-mode'),false);
    assert.equal(bootstrap('https://daily.invalid/app/#home',{values}).context.DailyTV.enabled,false,'a failed write does not claim persistence');
  }
});

test('history respects a saved on choice without writing it again',()=>{
  const app=bootstrap('https://daily.invalid/app/#home',{values:new Map([['daily-tv-mode','1']])});
  app.context.location.href='https://daily.invalid/app/#budget';app.events.get('popstate')({});
  assert.equal(app.context.DailyTV.enabled,true);assert.equal(app.writes.length,0);assert.equal(app.replaced.length,0);
});

test('other-tab device changes sync state while account events and explicit URLs stay isolated',()=>{
  const app=bootstrap('https://daily.invalid/app/#home'),storage=app.events.get('storage');
  storage({key:'daily-account-active',newValue:'user:b'});
  storage({key:'daily-account:user-b:daily-tv-mode',newValue:'1'});
  assert.equal(app.context.DailyTV.enabled,false);assert.equal(app.emitted.length,0);
  storage({key:'daily-tv-mode',newValue:'1'});
  assert.equal(app.context.DailyTV.enabled,true);assert.equal(app.emitted.at(-1).detail.source,'storage');
  storage({key:'daily-tv-mode',newValue:'0'});
  assert.equal(app.context.DailyTV.enabled,false);assert.equal(app.writes.length,0);assert.equal(app.replaced.length,0);
  app.context.location.href='https://daily.invalid/app/?tv=1#home';storage({key:'daily-tv-mode',newValue:'0'});
  assert.equal(app.context.DailyTV.enabled,true,'an explicit URL remains authoritative');
});
