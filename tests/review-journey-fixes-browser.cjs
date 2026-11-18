// Regressions use isolated sample accounts and virtual requests only.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');

(async()=>{for(const [engine,type,launch] of [
  ['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]
]){
  const browser=await type.launch(launch);
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
    await plannerFixture()(context);
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
    const ready=async()=>{
      await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&!_bootPhase);
      await page.evaluate(()=>{obDismiss();dailyUpdateDismiss();if(document.getElementById('food-catalogue-dialog'))foodCatalogueClose();foodCatalogueState.seenThisSession=true;});
    };
    await page.goto(fixtureURL+'?preview&polish&ui=journal&week-preview&switch=journey-fixes-'+engine);
    await ready();

    // The search result must open the promised Exercises destination, not Splits.
    await page.evaluate(()=>setView('settings'));
    await page.locator('#stg-search-input').fill('Exercise Library');
    await page.locator('.stg-result').filter({hasText:'Exercise Library'}).first().click();
    assert.deepEqual(await page.evaluate(()=>({view:S.view,tab:logSubTab})),{view:'log',tab:'exercises'});
    console.log('PASS '+engine+' Settings Library destination');

    // A real split import preserves punctuation and treats the name as literal data.
    await page.evaluate(()=>{window.openExerciseDetail=name=>{window.__openedName=name;};});
    for(const name of ["Farmer's carry",'Review\');window.__payloadRan=1;//','Double "quote" & <tag> \u2028 carry']){
      await page.evaluate(name=>{
        window.__openedName=null;window.__payloadRan=0;
        const id=plansImportText(JSON.stringify({name:'Synthetic split',kind:'split',cfg:{types:[{id:'review',name:'Review day',exercises:[{name,sets:3}]}],schedule:[0]}}));
        plansApply(id);if(logSplitPendingSwitch)logDiscardAndSwitch();logBackToOverview();
      },name);
      await page.locator('#log-overview .lg-focus-row').click();
      assert.equal(await page.evaluate(()=>window.__openedName),name);
      assert.equal(await page.evaluate(()=>window.__payloadRan),0);
    }
    // Related HTML plan IDs, recipe options and nutrition IDs use the same literal contract.
    const weirdId='plan\'");window.__payloadRan=2;//<&';
    await page.evaluate(id=>{
      const data=loadPlans();data.plans.push({id,type:'html',name:'Quoted ID',html:'<p>Sample</p>'});savePlans(data);
      window.__planId=null;window.__payloadRan=0;window.plansOpenHTML=id=>{window.__planId=id;};
      plansDocSel=id;setView('plans');renderPlans();
    },weirdId);
    await page.locator('#plans-content').getByRole('button',{name:'Open',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__planId),weirdId);
    const literalIds=await page.evaluate(id=>{
      const host=document.createElement('div');document.body.appendChild(host);
      window.__pickId=null;window.__foodId=null;
      window.testPick=id=>{window.__pickId=id;};window.nutChooseFood=id=>{window.__foodId=id;};
      host.innerHTML=kitProteinChooserHTML({proteinOptions:[{id,label:'Test'}],defaultProteinOptionId:id},id,'testPick(%ID%)')+
        nutFoodRow({id,name:'Quoted food',kind:'custom',nutrition:{calories:100}});
      host.querySelector('.kit-pchip').click();host.querySelector('.nut-food-row').click();host.remove();
      return {pick:window.__pickId,food:window.__foodId,ran:window.__payloadRan};
    },weirdId);
    assert.deepEqual(literalIds,{pick:weirdId,food:weirdId,ran:0});
    console.log('PASS '+engine+' imported names and related IDs stay literal');

    // Legacy/backup IDs reach the live Finance renderers without becoming handler code.
    const restoredIds=["restored');window.__payloadRan=7;//",'restored&quot;);window.__payloadRan=8;//','restored\"><img src=x onerror=window.__payloadRan=9><span data-x="'];
    const financeOriginal=await page.evaluate(()=>({cats:localStorage.getItem('daily_budget_var_cats'),accounts:localStorage.getItem('daily_accounts')}));
    for(const id of restoredIds){
      await page.evaluate(id=>{
        window.__payloadRan=0;window.__categoryEdit=null;window.__accountEdit=null;
        window.catUpdateField=(type,id,field,value)=>{window.__categoryEdit={type,id,field,value};};
        window.accountRename=(id,value)=>{window.__accountEdit={id,value};};
        localStorage.setItem('daily_budget_var_cats',JSON.stringify([{id,name:'Restored category',budget:10}]));
        openBudgetEditor();
      },id);
      const category=page.locator('#be-var .budget-setup-item').first();
      assert.equal(await category.getAttribute('data-cat-key'),'var:'+id);
      await category.locator('summary').click();
      await category.locator('.bud-edit-name').fill('Literal category edit');
      await category.locator('.bud-edit-name').dispatchEvent('change');
      assert.deepEqual(await page.evaluate(()=>window.__categoryEdit),{type:'var',id,field:'name',value:'Literal category edit'});
      assert.equal(await page.locator('#be-var img').count(),0,'restored ID did not create HTML');
      await page.evaluate(id=>{
        document.getElementById('view-budget-editor').style.display='none';
        localStorage.setItem('daily_accounts',JSON.stringify([{id,name:'Restored account',type:'asset',current:0,history:[]}]));
        accounts=loadAccounts();
        openAccounts();_acctEditMode=true;renderAccountsPage();
      },id);
      const account=page.locator('.acct-account-card').first();
      assert.equal(await account.getAttribute('data-account'),id);
      assert.ok(await page.evaluate(id=>!!document.getElementById('acct-bal-'+id),id));
      await account.locator('.acct-edit-row .bud-cat-name-input').fill('Literal account edit');
      await account.locator('.acct-edit-row .bud-cat-name-input').dispatchEvent('change');
      assert.deepEqual(await page.evaluate(()=>window.__accountEdit),{id,value:'Literal account edit'});
      assert.equal(await page.evaluate(()=>window.__payloadRan),0);
    }
    await page.evaluate(old=>{
      for(const [key,value] of [['daily_budget_var_cats',old.cats],['daily_accounts',old.accounts]]){
        if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
      }
      accounts=loadAccounts();
    },financeOriginal);
    console.log('PASS '+engine+' restored Finance category and Accounts IDs stay literal');

    const original=await page.evaluate(()=>{
      navGo('food','recipes');const r=kitRecipes[0];kitOpenForm(r.id);
      return {id:r.id,name:r.name,amount:r.ingredients[0].amount};
    });
    const cloudBefore=await page.evaluate(async()=>JSON.stringify((await fbRef('kitRecipes').once('value')).val()));
    await page.locator('#kit-f-name').fill('Draft kept after full storage');
    await page.evaluate(()=>{
      window.savedSetItem=localStorage.setItem;
      localStorage.setItem=(key,value)=>{if(key==='kitchen_recipes')throw new DOMException('Synthetic full','QuotaExceededError');return window.savedSetItem(key,value);};
    });
    await page.locator('#kit-form-overlay').getByRole('button',{name:'Save Recipe',exact:true}).click();
    await page.waitForFunction(()=>!kitFormSaving);
    assert.ok(await page.locator('#kit-form-overlay').isVisible());
    assert.equal(await page.locator('#kit-f-name').inputValue(),'Draft kept after full storage');
    assert.match(await page.locator('#kit-form-error').innerText(),/draft is still here/i);
    assert.deepEqual(await page.evaluate(id=>({
      memory:kitRecipes.find(r=>r.id===id).name,
      saved:JSON.parse(localStorage.getItem('kitchen_recipes')).find(r=>r.id===id).name
    }),original.id),{memory:original.name,saved:original.name});
    assert.equal(await page.evaluate(async()=>JSON.stringify((await fbRef('kitRecipes').once('value')).val())),cloudBefore);
    // Retrying uses the same draft, and succeeds once storage is writable.
    await page.evaluate(()=>{localStorage.setItem=window.savedSetItem;});
    await page.locator('#kit-form-overlay').getByRole('button',{name:'Save Recipe',exact:true}).click();
    await page.waitForFunction(()=>!kitFormSaving);
    assert.equal(await page.locator('#kit-form-overlay').isVisible(),false);
    await page.reload();await ready();
    assert.equal(await page.evaluate(id=>kitRecipes.find(r=>r.id===id).name,original.id),'Draft kept after full storage');
    console.log('PASS '+engine+' failed recipe save retains draft and retries across reload');

    await page.evaluate(id=>{navGo('food','recipes');kitOpenForm(id);},original.id);
    const draftAmount=await page.locator('#kit-f-ings .kit-fi-amt').first().inputValue();
    const remoteStamp=await page.evaluate(async id=>{
      const recipes=JSON.parse(JSON.stringify(kitRecipes));recipes.find(r=>r.id===id).ingredients[0].amount=800;
      const stamp=Date.now()+1;await fbRef('kitRecipes').set({v:JSON.stringify(recipes),t:stamp});return stamp;
    },original.id);
    await page.waitForFunction(id=>kitRecipes.find(r=>r.id===id).ingredients[0].amount===800,original.id);
    assert.equal(await page.locator('#kit-f-ings .kit-fi-amt').first().inputValue(),draftAmount);
    await page.locator('#kit-f-desc').fill('My draft description');
    await page.waitForFunction(stamp=>Date.now()>stamp,remoteStamp);
    await page.locator('#kit-form-overlay').getByRole('button',{name:'Save Recipe',exact:true}).click();
    await page.waitForFunction(()=>!kitFormSaving);
    assert.ok(await page.locator('#kit-form-overlay').isVisible());
    assert.match(await page.locator('#kit-form-error').innerText(),/changed elsewhere/i);
    assert.equal(await page.locator('#kit-f-desc').inputValue(),'My draft description');
    assert.deepEqual(await page.evaluate(async id=>({
      saved:JSON.parse(localStorage.getItem('kitchen_recipes')).find(r=>r.id===id).ingredients[0].amount,
      cloud:JSON.parse((await fbRef('kitRecipes').once('value')).val().v).find(r=>r.id===id).ingredients[0].amount
    }),original.id),{saved:800,cloud:800});
    await page.evaluate(()=>kitCloseForm());
    // Changes to another recipe do not block this draft or disappear on save.
    await page.evaluate(id=>kitOpenForm(id),original.id);
    await page.evaluate(()=>{
      const rows=JSON.parse(localStorage.getItem('kitchen_recipes'));rows.push({id:'other-device',name:'Other recipe',servings:1,ingredients:[],steps:[],tags:[]});
      localStorage.setItem('kitchen_recipes',JSON.stringify(rows));
    });
    await page.locator('#kit-f-desc').fill('Fresh recipe edit');
    await page.locator('#kit-form-overlay').getByRole('button',{name:'Save Recipe',exact:true}).click();
    await page.waitForFunction(()=>!kitFormSaving);
    assert.equal(await page.locator('#kit-form-overlay').isVisible(),false);
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchen_recipes')).some(r=>r.id==='other-device')));
    console.log('PASS '+engine+' stale recipe conflict preserves cloud and unrelated edits');

    // Timestamp-based stopwatch renders seconds inline and tenths only in its open overlay.
    await page.evaluate(()=>{
      setView('log');setLogTab('today');logOpenSession();rtStartFresh();
      rtStartTime=Date.now()-61234;rtUpdateDisplay(rtGetElapsed());
      window.clockChanges={bar:0,full:0};
      window.clockObserver=new MutationObserver(records=>{for(const r of records){if(r.target.id==='rt-bar-time')window.clockChanges.bar++;if(r.target.id==='rt-fs-time')window.clockChanges.full++;}});
      window.clockObserver.observe(document.getElementById('rt-bar-time'),{childList:true});
      window.clockObserver.observe(document.getElementById('rt-fs-time'),{childList:true});
      window.clockSaved=JSON.stringify({sessions:S.sessions,recipes:localStorage.getItem('kitchen_recipes'),expenses:localStorage.getItem('expenses')});
    });
    assert.equal(await page.evaluate(()=>rtIntervalDelay),1000);
    assert.match(await page.locator('#rt-bar-time').innerText(),/^1:0[1-3]$/);
    await page.waitForTimeout(1250);
    const compact=await page.evaluate(()=>({...window.clockChanges}));
    assert.ok(compact.bar>=1&&compact.bar<=2);assert.equal(compact.full,0);
    await page.evaluate(()=>{rtOpenFullscreen();window.clockChanges={bar:0,full:0};});
    assert.equal(await page.evaluate(()=>rtIntervalDelay),100);
    await page.waitForTimeout(450);
    assert.match(await page.locator('#rt-fs-time').innerText(),/^1:0[1-9]\.\d$/);
    assert.ok(await page.evaluate(()=>window.clockChanges.full>=2));
    assert.equal(await page.evaluate(()=>window.clockChanges.bar),0,'covered inline clock is not rendered');
    await page.evaluate(()=>{rtCloseFullscreen();setView('food');window.clockChanges={bar:0,full:0};});
    assert.deepEqual(await page.evaluate(()=>({rest:rtInterval,session:rtUiInterval})),{rest:null,session:null});
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(()=>window.clockChanges),{bar:0,full:0});
    // Background rendering stops, then foreground catches up without counting ticks.
    await page.evaluate(()=>{
      setView('log');logOpenSession();
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.deepEqual(await page.evaluate(()=>({rest:rtInterval,session:rtUiInterval})),{rest:null,session:null});
    await page.evaluate(()=>{
      rtStartTime=Date.now()-125678;
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('#rt-bar-time').innerText(),'2:05');
    assert.equal(await page.evaluate(()=>rtIntervalDelay),1000);
    assert.equal(await page.evaluate(()=>JSON.stringify({sessions:S.sessions,recipes:localStorage.getItem('kitchen_recipes'),expenses:localStorage.getItem('expenses')})),await page.evaluate(()=>window.clockSaved));
    await page.evaluate(()=>{clockObserver.disconnect();rtPause();rtStopUi();});
    console.log('PASS '+engine+' visible clocks, display precision and foreground resume');
    assert.deepEqual(errors,[],engine+' application errors');
    await context.close();
  }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
