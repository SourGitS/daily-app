'use strict';

// The JSON file is the only recipe source. These entries supply presentation and stable
// identities, never quantities or nutrition. Nothing is installed by loading this script.
const FOOD_CATALOGUE_VERSION=1;
const FOOD_CATALOGUE_ITEMS=[
  {key:'birria-tacos',name:'Birria Tacos',caption:'Slow-cooked beef. Crisp tortillas. Rich dipping broth.'},
  {key:'cajun-chicken-alfredo',name:'Cajun Chicken Alfredo',caption:'Spiced chicken and silky Parmesan fettuccine.'},
  {key:'parmentier-de-poisson',name:'Parmentier de Poisson',caption:'Creamy fish pie beneath golden mashed potato.'},
  {key:'beef-lasagne',name:'Beef Lasagne',caption:'Layers of beef ragù, white sauce and golden cheese.'},
  {key:'creamy-tuscan-salmon',name:'Creamy Tuscan Salmon',caption:'Creamy spinach sauce and roasted baby potatoes.'},
  {key:'easy-char-siu-chicken',name:'Easy Char Siu Chicken',caption:'Sticky glazed chicken, made for rice and greens.'}
];
const foodCatalogueState={recipes:null,promise:null,mode:'story',page:0,index:0,busy:false,starter:null,returnFocus:null,session:0,seenThisSession:false};

function foodCatalogueAccount(){ return typeof auth!=='undefined'&&auth&&auth.currentUser?auth.currentUser.uid:'guest'; }
function foodCatalogueReady(){
  return !(_bootPhase||_syncApplying)&&
    !(typeof dailyAccountMatches==='function'&&!dailyAccountMatches(typeof auth!=='undefined'&&auth?auth.currentUser:null))&&
    !(typeof auth!=='undefined'&&auth&&auth.currentUser&&(!_cloudWorkoutReady||_cloudReadFailed));
}
function foodCatalogueName(value){return String(value||'').trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');}
function foodCatalogueMatch(recipe,index,saved){
  const key=FOOD_CATALOGUE_ITEMS[index].key;
  return saved.find(r=>r.catalogueId===key||r.id==='daily-catalogue-v1-'+key||foodCatalogueName(r.name)===foodCatalogueName(recipe.name));
}
function foodCatalogueBuild(recipes,saved,indices){
  const additions=[];
  [...new Set(indices)].forEach(index=>{
    if(!Number.isInteger(index)||!recipes[index]||!FOOD_CATALOGUE_ITEMS[index])return;
    const recipe=recipes[index];
    if(foodCatalogueMatch(recipe,index,saved.concat(additions)))return;
    additions.push(Object.assign(JSON.parse(JSON.stringify(recipe)),{
      id:'daily-catalogue-v1-'+FOOD_CATALOGUE_ITEMS[index].key,catalogueId:FOOD_CATALOGUE_ITEMS[index].key,
      catalogueVersion:FOOD_CATALOGUE_VERSION,favourite:false,lastCooked:null,createdAt:Date.now()
    }));
  });
  return {recipes:saved.concat(additions),added:additions.length};
}
function foodCatalogueCurrent(){
  const raw=localStorage.getItem('kitchen_recipes');
  if(raw==null)return Array.isArray(kitRecipes)?kitRecipes.slice():[];
  const list=JSON.parse(raw);if(!Array.isArray(list))throw new Error('Your saved recipe book could not be read. Nothing was changed.');
  return list;
}
function foodCatalogueLoad(){
  if(foodCatalogueState.recipes)return Promise.resolve(foodCatalogueState.recipes);
  if(foodCatalogueState.promise)return foodCatalogueState.promise;
  foodCatalogueState.promise=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(new URL('catalogue/food-catalogue.json',document.baseURI),{signal:controller.signal});
      if(!response.ok)throw new Error('The recipe catalogue could not be loaded. Please try again.');
      const parsed=kitParseImport(await response.text());
      if(parsed.error)throw new Error(parsed.error);
      if(parsed.recipes.length!==FOOD_CATALOGUE_ITEMS.length||parsed.recipes.some((r,i)=>r.name!==FOOD_CATALOGUE_ITEMS[i].name))throw new Error('The catalogue is incomplete. Please update Daily and try again.');
      foodCatalogueState.recipes=parsed.recipes;return parsed.recipes;
    }finally{clearTimeout(timeout);foodCatalogueState.promise=null;}
  })();
  return foodCatalogueState.promise;
}
function foodCatalogueFlag(key,value){
  profileData[key]=Math.max(Number(profileData[key])||0,value);
  localStorage.setItem('daily_profile',JSON.stringify(profileData));
  const ref=fbRef('profile');
  if(ref)ref.child(key).transaction(old=>Math.max(Number(old)||0,value),undefined,false).catch(()=>setSyncStatus('Sync failed'));
}
// Called BEFORE onboarding stamps its version/name. An empty/deleted existing recipe book
// is never evidence of a new user; only first completion of setup can request a starter.
function foodCatalogueNewUser(){
  return foodCatalogueReady()&&!profileData.onboardingVersion&&!(profileData.name||'').trim()&&
    !profileData.foodCatalogueStarter&&localStorage.getItem('kitchen_recipes')===null&&
    kitRecipes.length===0&&S.sessions.length===0;
}
function foodCatalogueEnsureStarter(){
  if(foodCatalogueState.starter)return foodCatalogueState.starter;
  if(Number(profileData.foodCatalogueStarter)!==1||!foodCatalogueReady())return Promise.resolve();
  const account=foodCatalogueAccount();
  foodCatalogueState.starter=(async()=>{
    const recipes=await foodCatalogueLoad();
    if(account!==foodCatalogueAccount()||!foodCatalogueReady())return;
    // A restore, import or deliberate empty book wins over the pending starter request.
    if(localStorage.getItem('kitchen_recipes')!==null||kitRecipes.length){foodCatalogueFlag('foodCatalogueStarter',2);return;}
    const result=foodCatalogueBuild(recipes,[],recipes.map((_,i)=>i));
    const value=JSON.stringify(result.recipes),stamp=Date.now(),ref=fbRef('kitRecipes');
    if(ref){
      // Even a second device finishing setup at the same time cannot replace an existing
      // cloud book. Use the application's existing empty-node transaction helper.
      const seeded=await fbSeedIfEmpty(ref,{v:value,t:stamp});
      if(account!==foodCatalogueAccount()||!foodCatalogueReady())return;
      if(!seeded||!seeded.committed){foodCatalogueFlag('foodCatalogueStarter',2);return;}
    }
    if(localStorage.getItem('kitchen_recipes')===null){
      localStorage.setItem('kitchen_recipes',value);
      localStorage.setItem('kitchen_recipes_ts',String(stamp));
    }
    kitRecipes=foodCatalogueCurrent();
    foodCatalogueFlag('foodCatalogueStarter',2);
    foodRefreshActive();
  })().catch(error=>{console.warn('Recipe starter not installed',error);}).finally(()=>{foodCatalogueState.starter=null;});
  return foodCatalogueState.starter;
}
function foodCatalogueCheck(){
  if(S.view!=='food'||!foodCatalogueReady()||!profileData.onboardingVersion)return;
  foodCatalogueEnsureStarter();
  if((Number(profileData.foodCatalogueSeen)||0)>=FOOD_CATALOGUE_VERSION||foodCatalogueState.seenThisSession)return;
  const ob=document.getElementById('onboarding-overlay');
  if(ob&&!ob.classList.contains('hidden'))return;
  if(document.querySelector('dialog[open],#whats-new-overlay')||kitCookState.recipeId)return;
  const covered=['kit-form-overlay','kit-import-overlay','kit-sheet-overlay'].some(id=>{
    const el=document.getElementById(id);return el&&!el.classList.contains('hidden');
  });
  if(covered||foodSupportOpen('library')||foodSupportOpen('review'))return;
  foodCatalogueOpen('story');
}
function foodCataloguePicture(index,extra){
  return '<span class="fc-dish '+(extra||'')+'" style="--fc-x:'+((index%3)*50)+'%;--fc-y:'+(index<3?0:100)+'%" aria-hidden="true"></span>';
}
function foodCatalogueIcon(index){return '<span class="fc-icon" style="--fc-x:'+(index*50)+'%" aria-hidden="true"></span>';}
function foodCatalogueIntroHTML(page){
  if(page===0)return '<section class="fc-intro fc-intro-cover"><div class="fc-intro-copy"><p class="fc-eyebrow">New in Food · The first collection</p><h2 id="fc-title" tabindex="-1">Your next <em>favourite</em> starts here.</h2><p class="fc-lede">Six recipes, ready to explore. From slow-cooked Birria to a proper homemade lasagne.</p><span class="fc-byline">Francois’s favourites</span></div><img class="fc-hero" src="assets/food-catalogue/birria.webp" alt="Crisp Birria tacos with rich dipping broth, coriander and lime"></section>';
  if(page===1)return '<section class="fc-intro fc-intro-collection"><p class="fc-eyebrow">Meet the collection</p><h2 id="fc-title" tabindex="-1"><em>Six</em> good reasons to cook.</h2><div class="fc-lineup">'+FOOD_CATALOGUE_ITEMS.map((r,i)=>'<div>'+foodCataloguePicture(i)+'<h3>'+kitEsc(r.name)+'</h3></div>').join('')+'</div></section>';
  return '<section class="fc-intro fc-intro-how"><div><p class="fc-eyebrow">From inspiration to dinner</p><h2 id="fc-title" tabindex="-1">Find a favourite.<br><em>Make it yours.</em></h2><p class="fc-lede">Keep the recipes you love, then let Daily help with the cooking.</p></div><ol class="fc-how-list"><li>'+foodCatalogueIcon(0)+'<div><h3>Choose your recipe</h3><p>Explore the collection and keep your favourites in Recipes.</p></div></li><li>'+foodCatalogueIcon(1)+'<div><h3>Cook at your pace</h3><p>Adjust the servings and follow the cooking steps.</p></div></li><li>'+foodCatalogueIcon(2)+'<div><h3>Get what you need</h3><p>Use Shopping to build a list from your saved recipes.</p></div></li></ol></section>';
}
function foodCatalogueOpen(mode){
  if(document.getElementById('food-catalogue-dialog'))return;
  const state=foodCatalogueState;state.mode=mode||'browse';state.page=0;state.session++;state.returnFocus=document.activeElement;
  if(state.mode==='story')state.seenThisSession=true;
  const dialog=document.createElement('dialog');dialog.id='food-catalogue-dialog';dialog.className='fc-dialog';
  dialog.setAttribute('aria-labelledby','fc-title');
  dialog.innerHTML='<header class="fc-head"><img src="assets/brand/daily-wordmark-light.png" alt="Daily"><span>Food catalogue</span><button type="button" class="fc-close" aria-label="Close recipe catalogue" onclick="foodCatalogueClose()">×</button></header><div id="fc-body" class="fc-body"></div><p id="fc-status" class="fc-status" role="status" aria-live="polite"></p><footer id="fc-footer" class="fc-footer"></footer>';
  dialog.addEventListener('cancel',event=>{event.preventDefault();foodCatalogueClose();});
  dialog.addEventListener('keydown',event=>{
    if(state.mode!=='story'||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();foodCatalogueGo(state.page+(event.key==='ArrowRight'?1:-1));}
  });
  let start=null;
  const body=dialog.querySelector('#fc-body');
  body.addEventListener('pointerdown',event=>{start=event.target.closest('button,a,input,summary')?null:{x:event.clientX,y:event.clientY};});
  body.addEventListener('pointerup',event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(state.mode==='story'&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.6)foodCatalogueGo(state.page+(dx<0?1:-1));});
  body.addEventListener('pointercancel',()=>{start=null;});
  document.body.appendChild(dialog);foodCatalogueRender();dialog.showModal();
  dialog.querySelector('#fc-title')?.focus({preventScroll:true});
  if(state.mode!=='story')foodCatalogueFetchForView();
}
function foodCatalogueAcknowledge(){
  foodCatalogueState.seenThisSession=true;
  try{foodCatalogueFlag('foodCatalogueSeen',FOOD_CATALOGUE_VERSION);}catch(error){console.warn('Catalogue dismissal could not be saved',error);}
}
function foodCatalogueClose(){
  const state=foodCatalogueState,dialog=document.getElementById('food-catalogue-dialog');if(!dialog)return;
  foodCatalogueAcknowledge();state.session++;dialog.close();dialog.remove();
  if(state.returnFocus&&state.returnFocus.isConnected)state.returnFocus.focus({preventScroll:true});
}
function foodCatalogueGo(page){
  if(!Number.isInteger(page)||page<0||page>2||page===foodCatalogueState.page)return;
  foodCatalogueState.page=page;foodCatalogueRender(true);
}
function foodCatalogueBrowse(){
  foodCatalogueAcknowledge();foodCatalogueState.mode='browse';foodCatalogueRender(true);foodCatalogueFetchForView();
}
function foodCatalogueReplay(){foodCatalogueState.mode='story';foodCatalogueState.page=0;foodCatalogueRender(true);}
function foodCataloguePreview(index){foodCatalogueState.mode='preview';foodCatalogueState.index=index;foodCatalogueRender(true);}
function foodCatalogueStatus(message){const status=document.getElementById('fc-status');if(status)status.textContent=message;}
async function foodCatalogueFetchForView(){
  const session=foodCatalogueState.session;
  foodCatalogueStatus('');
  try{
    await foodCatalogueEnsureStarter();await foodCatalogueLoad();
    if(session===foodCatalogueState.session&&document.getElementById('food-catalogue-dialog')&&foodCatalogueState.mode!=='story')foodCatalogueRender();
  }catch(error){if(session===foodCatalogueState.session)foodCatalogueStatus('The catalogue could not be loaded. Check your connection and try again.');}
}
function foodCatalogueTime(recipe,index){
  if(index===5)return '20–25 min cooking · plus prep and marinating';
  const minutes=Number(recipe.cookTime);return minutes>=120?'About '+kitTrim(minutes/60)+' hours':'About '+minutes+' minutes';
}
function foodCatalogueSaved(index){
  try{return foodCatalogueMatch(foodCatalogueState.recipes[index],index,foodCatalogueCurrent());}catch(error){return null;}
}
function foodCatalogueBrowseHTML(){
  const recipes=foodCatalogueState.recipes;
  let body='<div class="fc-browse-heading"><div><p class="fc-eyebrow">Francois’s favourites</p><h2 id="fc-title" tabindex="-1">The first collection.</h2><p>Six recipes to keep, cook and make your own.</p></div><button class="fc-text-button" onclick="foodCatalogueReplay()">Watch the introduction ↗</button></div>';
  if(!recipes)return body+'<div class="fc-loading"><p>Loading the recipe collection…</p><button class="fc-button" onclick="foodCatalogueFetchForView()">Try again</button></div>';
  body+='<div class="fc-grid">'+recipes.map((r,i)=>{
    const saved=foodCatalogueSaved(i);
    return '<article class="fc-recipe-card"><button class="fc-card-open" onclick="foodCataloguePreview('+i+')">'+foodCataloguePicture(i)+'<h3>'+kitEsc(r.name)+'</h3></button><p class="fc-card-caption">'+kitEsc(FOOD_CATALOGUE_ITEMS[i].caption)+'</p><p class="fc-meta">'+r.servings+' servings · '+foodCatalogueTime(r,i)+'</p><button class="fc-button fc-card-action" onclick="'+(saved?'foodCatalogueViewSaved('+i+')':'foodCatalogueAdd(['+i+'])')+'"'+(foodCatalogueState.busy?' disabled':'')+'>'+(saved?'View saved recipe':'Add to my recipes')+'</button></article>';
  }).join('')+'</div><p class="fc-note">Original measures are retained. Unspecified amounts are labelled in each recipe. Food images are illustrations.</p>';
  return body;
}
function foodCatalogueAmount(ingredient){
  const value=String(ingredient.amount??'').trim();
  return value?[value,ingredient.unit].filter(Boolean).join(' '):'Amount unspecified';
}
function foodCataloguePreviewHTML(index){
  const recipe=foodCatalogueState.recipes?.[index];if(!recipe)return foodCatalogueBrowseHTML();
  return '<div class="fc-preview"><div class="fc-preview-photo">'+foodCataloguePicture(index)+'</div><div class="fc-preview-copy"><p class="fc-eyebrow">The first collection</p><h2 id="fc-title" tabindex="-1">'+kitEsc(recipe.name)+'</h2><p class="fc-meta">'+recipe.servings+' servings · '+foodCatalogueTime(recipe,index)+'</p><p>'+kitEsc(recipe.description)+'</p><p class="fc-note">'+(Object.values({calories:recipe.calories,protein:recipe.protein,carbs:recipe.carbs,fat:recipe.fat}).every(v=>v==null)?'Nutrition has not been added.':'Nutrition in this recipe was entered manually.')+'</p></div></div><section class="fc-preview-method"><h3>Ingredients · '+recipe.servings+' servings</h3><dl class="fc-ingredients">'+recipe.ingredients.map(i=>'<div><dt>'+kitEsc(i.name)+'</dt><dd>'+kitEsc(foodCatalogueAmount(i))+'</dd></div>').join('')+'</dl><h3>Method</h3><ol class="fc-method">'+recipe.steps.map(step=>'<li>'+kitCookInstructionHTML(kitStepText(step),true)+'</li>').join('')+'</ol><p class="fc-note">Blank quantities stay unspecified. Ranges or optional amounts written in ingredient names are kept as written. Food image is an illustration.</p></section>';
}
function foodCatalogueRender(moveFocus){
  const dialog=document.getElementById('food-catalogue-dialog');if(!dialog)return;
  const state=foodCatalogueState,body=dialog.querySelector('#fc-body'),footer=dialog.querySelector('#fc-footer');
  dialog.dataset.mode=state.mode;
  body.innerHTML=state.mode==='story'?foodCatalogueIntroHTML(state.page):state.mode==='preview'?foodCataloguePreviewHTML(state.index):foodCatalogueBrowseHTML();
  if(state.mode==='story'){
    // Keep navigation nodes stationary for consecutive presses and keyboard focus.
    if(!footer.querySelector('#fc-next'))footer.innerHTML='<button id="fc-back" class="fc-button" onclick="foodCatalogueGo(foodCatalogueState.page-1)">Back</button><div class="fc-pages" aria-label="Introduction pages">'+[0,1,2].map(i=>'<button aria-label="Slide '+(i+1)+' of 3" onclick="foodCatalogueGo('+i+')"></button>').join('')+'</div><button id="fc-next" class="fc-button fc-primary" onclick="foodCatalogueState.page===2?foodCatalogueBrowse():foodCatalogueGo(foodCatalogueState.page+1)"></button>';
    footer.querySelector('#fc-back').disabled=state.page===0;
    footer.querySelector('#fc-next').textContent=state.page===2?'Explore recipes':'Next';
    footer.querySelectorAll('.fc-pages button').forEach((button,i)=>button.setAttribute('aria-current',i===state.page?'step':'false'));
  }else if(state.mode==='preview'){
    const saved=foodCatalogueSaved(state.index);
    footer.innerHTML='<button class="fc-button" onclick="foodCatalogueBrowse()">← Collection</button><button class="fc-button fc-primary" onclick="'+(saved?'foodCatalogueViewSaved('+state.index+')':'foodCatalogueAdd(['+state.index+'])')+'"'+(state.busy?' disabled':'')+'>'+(saved?'View saved recipe':'Add to my recipes')+'</button>';
  }else{
    let remaining=0;
    if(state.recipes)remaining=state.recipes.filter((_,i)=>!foodCatalogueSaved(i)).length;
    footer.innerHTML='<a class="fc-download" href="catalogue/food-catalogue.json" download="daily-food-catalogue.json">Download recipe file <span>JSON</span></a><button class="fc-button fc-primary" onclick="foodCatalogueAdd([0,1,2,3,4,5])"'+(!remaining||state.busy?' disabled':'')+'>'+(!state.recipes?'Loading…':remaining===0?'All six are in your recipes':remaining===6?'Add all six recipes':'Add '+remaining+' remaining recipe'+(remaining===1?'':'s'))+'</button>';
  }
  if(moveFocus){
    body.scrollTop=0;
    body.classList.remove('fc-arrive');void body.offsetWidth;body.classList.add('fc-arrive');
    body.querySelector('#fc-title')?.focus({preventScroll:true});foodCatalogueStatus('');
  }
}
async function foodCatalogueAdd(indices){
  if(foodCatalogueState.busy)return;
  if(!foodCatalogueReady()){foodCatalogueStatus('Your saved recipes are still loading. Please try again in a moment.');return;}
  const account=foodCatalogueAccount(),session=foodCatalogueState.session;
  foodCatalogueState.busy=true;foodCatalogueRender();
  try{
    const recipes=await foodCatalogueLoad();await foodCatalogueEnsureStarter();
    if(account!==foodCatalogueAccount()||!foodCatalogueReady()||session!==foodCatalogueState.session)return;
    const original=foodCatalogueCurrent(),result=foodCatalogueBuild(recipes,original,indices);
    if(!result.added){foodCatalogueStatus('These recipes are already in your recipe book. Your saved versions were kept.');return;}
    kitRecipes=result.recipes;kitSaveRecipes();
    // The shared writer catches storage errors. Check the stored value before reporting success.
    if(localStorage.getItem('kitchen_recipes')!==JSON.stringify(result.recipes)){
      kitRecipes=original;throw new Error('The recipes could not be saved on this device. Please free some storage and try again.');
    }
    foodRefreshActive();foodRefreshSupport();
    foodCatalogueStatus('Added '+result.added+' recipe'+(result.added===1?'':'s')+'. Your existing recipes were kept.');
  }catch(error){foodCatalogueStatus(error.message||'The recipes could not be added. Please try again.');}
  finally{foodCatalogueState.busy=false;if(session===foodCatalogueState.session)foodCatalogueRender();}
}
function foodCatalogueViewSaved(index){
  const saved=foodCatalogueSaved(index);if(!saved)return;
  foodCatalogueClose();setView('food',null,{foodTab:'recipes'});kitOpenDetail(saved.id);
}
