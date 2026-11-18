/* Optional remote navigation. Its one device preference never uses account storage. */
(function () {
  'use strict';
  const root = document.documentElement;
  const preferenceKey = 'daily-tv-mode';
  const controls = 'button,a[href],input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[onclick]';
  const layers = 'dialog[open],.app-overlay,.modal-overlay,[role="dialog"],[aria-modal="true"],[role="menu"],.kit-menu-dropdown,.kit-detail-more[open],#kit-detail-overlay,#plan-html-overlay,#rt-fullscreen,#onboarding-overlay';
  const directions = {ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right'};
  const backKeys = new Set(['Escape','BrowserBack','GoBack','Back','Backspace']);
  const ownedTabIndexes = new Map();
  let enabled = false, started = false, observer = null, barObserver = null, frame = 0;
  let revealOnRefresh = false;
  let marked = null, editing = null, pointerField = null, remembered = null;
  let composing = null, compositionTarget = null, compositionPending = false, compositionTimer = 0;
  let planReader = null, layerHint = null;
  let layerStack = [], currentLayer = null;
  let preference = readPreference();

  function requested() {
    try { return new URL(location.href).searchParams.get('tv') === '1'; } catch (_) { return false; }
  }
  function preferenceValue(raw) { return raw==='1'?true:raw==='0'?false:null; }
  function readPreference() {
    // window.localStorage is the browser store; the unqualified localStorage
    // binding belongs to the active Daily account and must not be used here.
    try { return preferenceValue(window.localStorage.getItem(preferenceKey)); } catch (_) { return null; }
  }
  function effectiveMode() { return requested() || preference===true; }
  function isField(el) {
    return !!(el&&el.matches) && (el.isContentEditable || el.matches('textarea,select,input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"])'));
  }
  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length || el.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
    const panel = el.closest('.swipe-panel');
    if (panel && !panel.classList.contains('deck-active')) return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || s.opacity === '0') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function eligible(el) {
    if (!visible(el) || typeof el.focus!=='function' || el.matches(':disabled,[aria-disabled="true"],input[type="hidden"]')) return false;
    if (el.matches('dialog,.app-overlay,.modal-overlay,#menu-overlay,#onboarding-overlay,.kit-menu-dropdown,.kit-card-actions')) return false;
    if (el.matches('[tabindex="-1"]') && !ownedTabIndexes.has(el) && !el.matches('button,input,select,textarea,a[href],[role="button"],[role="tab"]')) return false;
    if(el.matches('.lg-body-muscle')){
      const section=el.closest('.lg-coverage-layout,.hist-preview-layout');
      if(section&&Array.from(section.querySelectorAll('button[data-muscle]')).some(button=>
        button.dataset.muscle===el.dataset.muscle&&button.dataset.sessionKey===el.dataset.sessionKey&&visible(button)))return false;
    }
    return true;
  }
  function depth(el) { let d=0; for(let p=el;p;p=p.parentElement)d++; return d; }
  function layerRank(el) {
    let z=0;
    for(let p=el;p;p=p.parentElement)z=Math.max(z,parseInt(getComputedStyle(p).zIndex,10)||0);
    let modal=false;
    try { modal=el.matches('dialog:modal'); } catch (_) { modal=el.matches('dialog[open]'); }
    return (modal?1e9:0)+z*100+depth(el);
  }
  function topLayer() {
    return Array.from(document.querySelectorAll(layers)).filter(visible).sort((a,b)=>
      layerRank(b)-layerRank(a) || (a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?1:-1))[0] || null;
  }
  function candidates(scope) {
    const base = scope || document;
    return Array.from(base.querySelectorAll(controls)).filter(el=>eligible(el) &&
      (!scope || !el.closest(layers) || scope.contains(el)));
  }
  function rect(el) {
    const r=el.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
  }
  function fingerprint(el) {
    if (!el || !el.matches) return null;
    const data={};
    for(const a of Array.from(el.attributes))if(a.name.startsWith('data-')&&!a.name.startsWith('data-tv-'))data[a.name]=a.value;
    return {el,id:el.id,tag:el.tagName,type:el.getAttribute('type'),name:el.getAttribute('name'),label:el.getAttribute('aria-label'),
      placeholder:el.getAttribute('placeholder'),classes:el.getAttribute('class'),data,
      text:(el.textContent||'').trim().slice(0,160),box:rect(el)};
  }
  function findRemembered(saved, list) {
    if(!saved)return null;
    if(list.includes(saved.el))return saved.el;
    if(saved.id){const found=list.find(el=>el.id===saved.id);if(found)return found;}
    const attrs=Object.entries(saved.data);
    if(attrs.length){
      const found=list.find(el=>el.tagName===saved.tag&&attrs.every(([k,v])=>el.getAttribute(k)===v));
      if(found)return found;
    }
    const same=list.filter(el=>el.tagName===saved.tag&&el.getAttribute('type')===saved.type&&
      ((saved.label&&el.getAttribute('aria-label')===saved.label)||(saved.name&&el.getAttribute('name')===saved.name)||
      (saved.placeholder&&el.getAttribute('placeholder')===saved.placeholder)||
      (isField(el)&&saved.classes&&el.getAttribute('class')===saved.classes&&el.getAttribute('placeholder')===saved.placeholder)||
      (saved.text&&(el.textContent||'').trim().slice(0,160)===saved.text)));
    return nearest(saved.box,same);
  }
  function nearest(box, list) {
    if(!list.length)return null;
    if(!box)return list[0];
    return list.reduce((best,el)=>{
      const r=rect(el),d=Math.hypot(r.x-box.x,r.y-box.y);
      return !best||d<best.d?{el,d}:best;
    },null).el;
  }
  // Move only actual scrollers. Walking browser scrollIntoView ancestors also pans the
  // transformed phone swipe deck, so it must never be used by remote navigation.
  function reveal(el) {
    for(let p=el.parentElement;p&&p!==document.body&&p!==root;p=p.parentElement){
      const s=getComputedStyle(p),pr=p.getBoundingClientRect(),er=el.getBoundingClientRect();
      const bar=document.getElementById('daily-tv-bar');
      let top=pr.top+p.clientTop+(parseFloat(s.scrollPaddingTop)||0);
      if(bar&&p.contains(bar)&&!bar.contains(el)&&visible(bar))top=Math.max(top,bar.getBoundingClientRect().bottom+20);
      const left=pr.left+p.clientLeft;
      const pad=8;
      if(/auto|scroll/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+1){
        const bottom=pr.top+p.clientTop+p.clientHeight;
        const dy=er.height>bottom-top-pad*2?er.top-top-pad:er.top<top+pad?er.top-top-pad:er.bottom>bottom-pad?er.bottom-bottom+pad:0;
        if(dy)p.scrollTop+=dy;
      }
      if(p.id!=='app-main'&&p.id!=='swipe-deck'&&/auto|scroll/.test(s.overflowX)&&p.scrollWidth>p.clientWidth+1){
        const right=left+p.clientWidth;
        const dx=er.width>p.clientWidth-pad*2?er.left-left-pad:er.left<left+pad?er.left-left-pad:er.right>right-pad?er.right-right+pad:0;
        if(dx)p.scrollLeft+=dx;
      }
    }
    const scroller=document.scrollingElement;
    if(scroller&&scroller.scrollHeight>innerHeight+1){
      const r=el.getBoundingClientRect(),dy=r.height>innerHeight-16?r.top-8:r.top<8?r.top-8:r.bottom>innerHeight-8?r.bottom-innerHeight+8:0;
      if(dy)scroller.scrollTop+=dy;
    }
  }
  function mark(el) {
    if(marked&&marked!==el)marked.removeAttribute('data-tv-focus');
    marked=el;
    if(el){el.setAttribute('data-tv-focus','true');remembered=fingerprint(el);}
    updateHint();
  }
  function leaveEdit() {
    if(editing)editing.removeAttribute('data-tv-edit');
    editing=null;
    root.removeAttribute('data-tv-editing');
    updateHint();
  }
  function enterEdit(el) {
    if(!isField(el)||el.disabled||el.readOnly)return false;
    leaveEdit();editing=el;el.setAttribute('data-tv-edit','true');root.setAttribute('data-tv-editing','true');updateHint();reveal(el);
    return true;
  }
  function focus(el) {
    if(!enabled||!eligible(el))return false;
    const scope=topLayer();if(scope&&!scope.contains(el))return false;
    if(editing&&editing!==el)leaveEdit();
    if(!el.hasAttribute('tabindex')&&!el.matches('button,a[href],input,select,textarea,summary')){
      ownedTabIndexes.set(el,null);el.setAttribute('tabindex','-1');
    }
    try{el.focus({preventScroll:true});}catch(_){el.focus();}
    if(document.activeElement!==el)return false;
    mark(el);reveal(el);revealOnRefresh=false;return true;
  }
  function preferred(list,scope) {
    const selected=list.find(el=>el.matches('[aria-current="page"],.nv-qrow.is-on,.nav-btn.active'));
    return (scope?list.find(el=>el.matches('[autofocus]')):selected)||list[0]||null;
  }
  function refresh() {
    if(!enabled||!started)return false;
    refreshPlanReader();
    const next=topLayer(),old=currentLayer;
    let restore=null;
    if(next!==old){
      const prior=layerStack.findIndex(item=>item.layer===next);
      if(prior>=0){restore=layerStack[prior+1]?.returnTo||null;layerStack=layerStack.slice(0,prior+1);}
      else if(!next){restore=layerStack[0]?.returnTo||null;layerStack=[];}
      else layerStack.push({layer:next,returnTo:remembered});
      currentLayer=next;
    }
    const editSaved=editing?{identity:remembered&&remembered.el===editing?remembered:fingerprint(editing),value:editing.value,
      start:editing.selectionStart,end:editing.selectionEnd,direction:editing.selectionDirection}:null;
    const list=candidates(next),active=document.activeElement;
    if(list.includes(active)){
      if(editing&&editing!==active)leaveEdit();
      mark(active);
      if(revealOnRefresh){revealOnRefresh=false;reveal(active);}
      return true;
    }
    if(editing)leaveEdit();
    const replacement=editSaved&&next===old?findRemembered(editSaved.identity,list):null;
    const target=findRemembered(restore,list)||replacement||((next===old||!next)?findRemembered(remembered,list):null)||
      (next===old?nearest(remembered&&remembered.box,list):null)||preferred(list,next);
    if(target){
      const result=focus(target);
      if(result&&target===replacement&&target.value===editSaved.value&&enterEdit(target)&&editSaved.start!=null){
        try{target.setSelectionRange(editSaved.start,editSaved.end,editSaved.direction||'none');}catch(_){}
      }
      return result;
    }
    // Loading/empty dialogs still contain remote focus. Once their controls arrive,
    // the observer moves from this temporary container to the first real action.
    if(next&&visible(next)){
      if(!next.hasAttribute('tabindex')){ownedTabIndexes.set(next,null);next.setAttribute('tabindex','-1');}
      next.focus({preventScroll:true});mark(next);return document.activeElement===next;
    }
    return false;
  }
  function schedule() {
    if(!enabled||frame)return;
    frame=requestAnimationFrame(()=>{frame=0;refresh();});
  }
  function move(direction) {
    if(!enabled||!['up','down','left','right'].includes(direction))return false;
    const scope=topLayer(),list=candidates(scope),active=document.activeElement;
    if(!list.includes(active))return refresh();
    const from=rect(active),horizontal=direction==='left'||direction==='right',positive=direction==='down'||direction==='right';
    let best=null;
    for(const el of list){
      if(el===active||el.contains(active)||active.contains(el))continue;
      const r=rect(el),forward=(horizontal?r.x-from.x:r.y-from.y)*(positive?1:-1);
      if(forward<=1)continue;
      const side=horizontal?Math.abs(r.y-from.y):Math.abs(r.x-from.x);
      const overlap=horizontal?Math.min(r.bottom,from.bottom)-Math.max(r.top,from.top):Math.min(r.right,from.right)-Math.max(r.left,from.left);
      const gap=horizontal?(positive?r.left-from.right:from.left-r.right):(positive?r.top-from.bottom:from.top-r.bottom);
      // A shared row/column beats a diagonal shortcut; edge distance prevents large
      // cards from pulling focus away from the neighbouring control in a grid.
      const score=(overlap>1?0:100000)+Math.max(0,gap)*10+side*2+forward*0.05;
      if(!best||score<best.score)best={el,score};
    }
    return best?focus(best.el):false;
  }
  function closestClose(scope) {
    const list=candidates(scope);
    const selectors=['[data-dialog-close]','[data-add-close]','.back-btn[data-back]','.back-btn','button[aria-label="Back" i]','button[aria-label^="Close" i]','button[aria-label^="Collapse" i]','.side-menu-close','#plan-html-overlay > div > button'];
    for(const selector of selectors){const found=list.find(el=>el.matches(selector));if(found)return found;}
    return list.find(el=>el.matches('button')&&/^(cancel|close|back|done|got it)(\b|$)/i.test((el.textContent||'').trim()))||null;
  }
  function exitWidget() {
    const active=document.activeElement;
    const widget=active&&active.closest('.jp-days,.bov-cal-grid');
    if(!widget)return false;
    const section=widget.closest('.jp-calendar,.bov-bills-calendar')||widget.parentElement;
    const list=candidates(topLayer()).filter(el=>!widget.contains(el));
    const local=list.filter(el=>section&&section.contains(el));
    return focus(nearest(rect(widget),local.length?local:list));
  }
  function back() {
    if(!enabled)return false;
    if(editing){leaveEdit();return true;}
    const scope=topLayer();
    if(scope){
      if(scope.matches('dialog[open]')){
        // The existing cancel listener owns confirmation/dirty-state guards.
        const event=new Event('cancel',{cancelable:true,bubbles:false});
        if(scope.dispatchEvent(event))scope.close();
        schedule();return true;
      }
      if(scope.matches('.kit-detail-more[open]')){scope.querySelector('summary')?.click();schedule();return true;}
      if(scope.matches('.kit-menu-dropdown')){
        const opener=scope.parentElement&&scope.parentElement.querySelector('.kit-menu-btn');
        if(opener){opener.click();schedule();return true;}
      }
      const close=closestClose(scope);
      if(close){close.click();schedule();return true;}
      return false;
    }
    return exitWidget();
  }
  function captureKey(event) {
    if(!enabled||event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
    const el=event.target;
    if(!isField(el))return;
    const name=keyName(event);
    if(backKeys.has(name)){
      // Backspace remains text deletion while editing. A remote Escape/Back exits.
      if(name==='Backspace'&&editing===el)return;
      if(editing===el){event.preventDefault();event.stopImmediatePropagation();leaveEdit();return;}
      return;
    }
    if(editing===el)return;
    if(name==='Enter'||name==='Select'){
      event.preventDefault();event.stopImmediatePropagation();enterEdit(el);return;
    }
    if(directions[name]){
      event.preventDefault();event.stopImmediatePropagation();move(directions[name]);
    }
  }
  function keyName(event) {
    return event.key&&event.key!=='Unidentified'?event.key:event.code;
  }
  function key(event) {
    if(!enabled||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
    const el=event.target;
    if(editing===el)return;
    const name=keyName(event);
    if(backKeys.has(name)){
      if(back()){event.preventDefault();event.stopPropagation();}
      return;
    }
    const direction=directions[name];
    if(direction){
      if(el.matches&&el.matches('input[type="range"]')&&(direction==='left'||direction==='right'))return;
      event.preventDefault();move(direction);return;
    }
    if(name==='Enter'||name==='Select'){
      if(!eligible(el))return;
      if(isField(el)){event.preventDefault();enterEdit(el);return;}
      if(el.matches('input[type="file"],input[type="color"]'))return;
      event.preventDefault();el.click();schedule();
    }
  }
  function focusIn(event) {
    if(!enabled)return;
    if(editing&&!editing.isConnected){refresh();if(document.activeElement!==event.target)return;}
    if(editing&&editing!==event.target)leaveEdit();
    if(topLayer()!==currentLayer)refresh();
    else if(eligible(event.target))mark(event.target);
    if(pointerField===event.target){enterEdit(event.target);pointerField=null;}
    schedule();
  }
  function pointer(event) {
    const field=event.target.closest&&event.target.closest('input,textarea,select,[contenteditable="true"]');
    pointerField=isField(field)?field:null;
    if(pointerField)enterEdit(pointerField);else if(editing)leaveEdit();
  }
  function compositionStart(event) {
    if(!isField(event.target))return;
    enterEdit(event.target);composing=event.target;compositionTarget=event.target;compositionPending=false;
    if(compositionTimer)clearTimeout(compositionTimer);compositionTimer=0;
  }
  function compositionInput(event) {
    if(composing===event.target){
      // Existing live-search input handlers rebuild their field. Keep that node
      // intact while the browser owns an IME composition, then update normally.
      compositionPending=true;event.stopImmediatePropagation();
    }else if(compositionTimer&&compositionTarget===event.target){
      clearTimeout(compositionTimer);compositionTimer=0;compositionPending=false;compositionTarget=null;
    }
  }
  function compositionEnd(event) {
    if(composing!==event.target)return;
    const field=composing;composing=null;
    if(!compositionPending)return;
    // Browsers that emit a final native input cancel this fallback above.
    compositionTimer=setTimeout(()=>{
      compositionTimer=0;
      if(compositionPending&&field.isConnected){compositionPending=false;compositionTarget=null;field.dispatchEvent(new Event('input',{bubbles:true}));}
    },0);
  }
  function planText(source) {
    // Template contents stay inert: imported scripts, images and frames are never
    // inserted into the parent document. Only newly created text nodes leave it.
    const template=document.createElement('template');template.innerHTML=source;
    template.content.querySelectorAll('script,style,template,head,noscript,svg,canvas,iframe,object,embed,[hidden],[aria-hidden="true"]').forEach(el=>el.remove());
    template.content.querySelectorAll('[style]').forEach(el=>{if(el.style.display==='none'||el.style.visibility==='hidden')el.remove();});
    const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT),out=[];
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      if(node.nodeType===3)out.push(node.nodeValue);
      else if(/^(BR|P|DIV|SECTION|ARTICLE|HEADER|FOOTER|H[1-6]|LI|UL|OL|TR|BLOCKQUOTE|PRE|HR)$/.test(node.tagName))out.push('\n');
      else if(node.tagName==='TD'||node.tagName==='TH')out.push('\t');
      else if(node.tagName==='IMG'&&node.alt)out.push(' '+node.alt+' ');
    }
    return out.join('').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()||'This plan has no readable text. Exit TV mode to view its original layout.';
  }
  function readerKey(event) {
    if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
    const reader=event.currentTarget,step=Math.max(64,Math.floor(reader.clientHeight*0.7));
    const delta={ArrowUp:-step,ArrowDown:step,PageUp:-step,PageDown:step}[event.key];
    if(delta!=null){
      const next=Math.max(0,Math.min(reader.scrollHeight-reader.clientHeight,reader.scrollTop+delta));
      if(Math.abs(next-reader.scrollTop)>1){event.preventDefault();reader.scrollTop=next;}
    }else if(event.key==='Home'||event.key==='End'){
      event.preventDefault();reader.scrollTop=event.key==='Home'?0:reader.scrollHeight;
    }
  }
  function removePlanReader() {
    if(planReader){
      const {frame,reader,hidden}=planReader;
      reader.removeEventListener('keydown',readerKey);reader.remove();
      if(frame.hasAttribute('hidden')&&!hidden)frame.removeAttribute('hidden');
      if(frame.getAttribute('data-tv-plan-frame-hidden')==='true')frame.removeAttribute('data-tv-plan-frame-hidden');
      planReader=null;
    }
    // A same-task reopen can clone the owned marker before the observer adopts
    // the new frame. Release that connected clone too when TV stops or closes.
    if(started)document.querySelectorAll('#plan-html-frame[data-tv-plan-frame-hidden="true"]').forEach(frame=>{
      frame.removeAttribute('hidden');frame.removeAttribute('data-tv-plan-frame-hidden');
    });
  }
  function refreshPlanReader() {
    const overlay=document.getElementById('plan-html-overlay'),frameEl=document.getElementById('plan-html-frame');
    if(!overlay||!frameEl||!visible(overlay)){removePlanReader();return;}
    if(planReader&&planReader.frame!==frameEl)removePlanReader();
    if(!planReader){
      const reader=document.createElement('div');reader.id='daily-tv-plan-reader';reader.tabIndex=0;reader.setAttribute('role','document');
      reader.setAttribute('aria-label','Read plan. Up and Down to scroll. Back returns.');reader.addEventListener('keydown',readerKey);
      // The normal viewer clones its frame when a plan opens. Carry ownership in
      // an attribute so a clone cannot turn our temporary hidden state permanent.
      const hidden=frameEl.hasAttribute('hidden')&&frameEl.getAttribute('data-tv-plan-frame-hidden')!=='true';
      planReader={frame:frameEl,reader,hidden,source:null};
      if(!hidden)frameEl.setAttribute('data-tv-plan-frame-hidden','true');
      frameEl.hidden=true;frameEl.after(reader);
    }
    const source=frameEl.getAttribute('srcdoc')||'';
    if(source!==planReader.source){planReader.source=source;planReader.reader.textContent=planText(source);planReader.reader.scrollTop=0;}
  }
  function updateHint() {
    const hint=document.getElementById('daily-tv-hint');
    const text=editing?'Editing · Back to controls':marked&&marked.id==='daily-tv-plan-reader'?'Read plan · Up/Down scroll · Back returns':'Arrows to move · OK to choose';
    if(hint&&hint.textContent!==text)hint.textContent=text;
    const scope=enabled&&editing?topLayer():null;
    if(!scope){if(layerHint)layerHint.remove();layerHint=null;return;}
    if(layerHint&&layerHint.isConnected&&scope.contains(layerHint))return;
    if(layerHint)layerHint.remove();
    const host=scope.querySelector('.modal-box')||scope.querySelector(':scope > form')||scope;
    layerHint=document.createElement('p');layerHint.className='tv-layer-hint';layerHint.setAttribute('aria-live','polite');layerHint.textContent='Editing · Back to controls';
    const heading=Array.from(host.children).find(el=>el.matches('.bp-dialog-head,.modal-header,.txn-modal-topbar,.view-header,h2'));
    if(heading)heading.after(layerHint);else host.prepend(layerHint);
  }
  function measureBar() {
    const bar=document.getElementById('daily-tv-bar');
    if(bar){const value=Math.ceil(bar.getBoundingClientRect().height)+'px';if(root.style.getPropertyValue('--tv-bar-height')!==value)root.style.setProperty('--tv-bar-height',value);}
  }
  function barBack() { if(!back())history.back(); }
  function barExit() { setEnabled(false,{persist:true,source:'exit'}); }
  function init() {
    if(!enabled||started||!document.body)return;
    started=true;
    // Enabling TV can reflow the existing Settings control below the viewport.
    // Reveal it once after layout, rather than scrolling on every later mutation.
    revealOnRefresh=true;
    const bar=document.getElementById('daily-tv-bar');
    if(bar){bar.hidden=false;measureBar();if(window.ResizeObserver){barObserver=new ResizeObserver(measureBar);barObserver.observe(bar);}}
    document.getElementById('daily-tv-back')?.addEventListener('click',barBack);
    document.getElementById('daily-tv-exit')?.addEventListener('click',barExit);
    updateHint();
    document.addEventListener('keydown',captureKey,true);
    document.addEventListener('keydown',key);
    document.addEventListener('focusin',focusIn);
    document.addEventListener('pointerdown',pointer,true);
    document.addEventListener('compositionstart',compositionStart,true);
    document.addEventListener('compositionend',compositionEnd,true);
    document.addEventListener('input',compositionInput,true);
    document.addEventListener('transitionend',schedule,true);
    document.addEventListener('transitioncancel',schedule,true);
    document.addEventListener('animationend',schedule,true);
    document.addEventListener('animationcancel',schedule,true);
    window.addEventListener('resize',schedule);
    observer=new MutationObserver(()=>{
      // Live search replaces its INPUT from the input handler. Recover in this
      // microtask, before the next key, rather than waiting for a painting frame.
      if(editing&&!editing.isConnected)refresh();else schedule();
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','inert','open','disabled','aria-hidden','aria-disabled','srcdoc']});
    schedule();
  }
  function stop() {
    if(frame)cancelAnimationFrame(frame);frame=0;
    if(observer)observer.disconnect();observer=null;
    if(barObserver)barObserver.disconnect();barObserver=null;
    document.getElementById('daily-tv-back')?.removeEventListener('click',barBack);
    document.getElementById('daily-tv-exit')?.removeEventListener('click',barExit);
    const bar=document.getElementById('daily-tv-bar');if(bar)bar.hidden=true;
    root.style.removeProperty('--tv-bar-height');
    document.removeEventListener('keydown',captureKey,true);
    document.removeEventListener('keydown',key);
    document.removeEventListener('focusin',focusIn);
    document.removeEventListener('pointerdown',pointer,true);
    document.removeEventListener('compositionstart',compositionStart,true);
    document.removeEventListener('compositionend',compositionEnd,true);
    document.removeEventListener('input',compositionInput,true);
    document.removeEventListener('transitionend',schedule,true);
    document.removeEventListener('transitioncancel',schedule,true);
    document.removeEventListener('animationend',schedule,true);
    document.removeEventListener('animationcancel',schedule,true);
    if(compositionTimer)clearTimeout(compositionTimer);compositionTimer=0;
    const pendingField=compositionTarget;composing=null;compositionTarget=null;
    if(compositionPending&&pendingField&&pendingField.isConnected)pendingField.dispatchEvent(new Event('input',{bubbles:true}));
    compositionPending=false;
    removePlanReader();
    window.removeEventListener('resize',schedule);
    leaveEdit();
    if(marked)marked.removeAttribute('data-tv-focus');marked=null;
    for(const [el,value] of ownedTabIndexes)if(el.getAttribute('tabindex')==='-1'){
      if(value===null)el.removeAttribute('tabindex');else el.setAttribute('tabindex',value);
    }
    ownedTabIndexes.clear();layerStack=[];currentLayer=null;pointerField=null;remembered=null;revealOnRefresh=false;started=false;
  }
  function changed(persisted,source) {
    window.dispatchEvent(new CustomEvent('daily-tv-change',{detail:{enabled,preference,persisted,source}}));
  }
  function setEnabled(value,options) {
    const next=value===true;
    options=options||{};
    let persisted=null;
    if(options.persist===true){
      // Keep the explicit choice for this session even when storage is blocked.
      preference=next;
      try{window.localStorage.setItem(preferenceKey,next?'1':'0');persisted=true;}catch(_){persisted=false;}
    }
    const different=next!==enabled;
    if(different){
      enabled=next;
      if(enabled){root.setAttribute('data-tv','true');init();}
      else{stop();root.removeAttribute('data-tv');}
    }
    if(different||options.persist===true){
      if(options.updateUrl!==false)try{
        const url=new URL(location.href);
        if(enabled)url.searchParams.set('tv','1');else url.searchParams.delete('tv');
        history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      }catch(_){}
      changed(persisted,options.source||'api');
    }
    return enabled;
  }
  function urlStateChanged() {
    const next=effectiveMode();
    if(next!==enabled)setEnabled(next,{source:'history',updateUrl:false});else schedule();
  }
  function storagePreferenceChanged(event) {
    if(event.key!==preferenceKey)return;
    preference=preferenceValue(event.newValue);
    const next=effectiveMode();
    if(next!==enabled)setEnabled(next,{source:'storage',updateUrl:false});else changed(null,'storage');
  }
  function destroy() {
    setEnabled(false);
    window.removeEventListener('popstate',urlStateChanged);
    window.removeEventListener('storage',storagePreferenceChanged);
    document.removeEventListener('DOMContentLoaded',init);
  }
  window.DailyTV=Object.freeze({get enabled(){return enabled;},get mode(){return editing?'editing':'navigation';},
    refresh,focus,move,back,setEnabled,destroy});
  enabled=effectiveMode();
  if(enabled)root.setAttribute('data-tv','true');
  // Observe URL opt-in changes without preventing navigation or adding history entries.
  window.addEventListener('popstate',urlStateChanged);
  window.addEventListener('storage',storagePreferenceChanged);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
