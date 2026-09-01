'use strict';

// Daily's compact starter catalogue. Values are per 100 g edible portion, adapted from
// FSANZ AUSNUT 2023. This deliberately stays small and offline; branded foods belong in My Foods.
const NUT_CATALOG_SOURCE={dataset:'FSANZ AUSNUT 2023',release:'2023',license:'CC BY 4.0 (FSANZ site default, unless otherwise noted)',url:'https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut/data-files',licenseUrl:'https://www.foodstandards.gov.au/legal-policies/copyright'};
const NUT_ROWS=[
['banana','Banana, raw','banana|cavendish','Fruit',89,1.1,22.8,.3,118,'medium banana'],
['apple','Apple, raw, skin on','apple|pink lady|royal gala','Fruit',52,.3,13.8,.2,182,'medium apple'],
['orange','Orange, raw','orange|navel','Fruit',47,.9,11.8,.1,140,'medium orange'],
['mandarin','Mandarin, raw','mandarin|tangerine','Fruit',53,.8,13.3,.3,88,'medium mandarin'],
['pear','Pear, raw','pear','Fruit',57,.4,15.2,.1,178,'medium pear'],
['kiwifruit','Kiwifruit, green, raw','kiwi|kiwifruit','Fruit',61,1.1,14.7,.5,75,'kiwifruit'],
['strawberry','Strawberries, raw','strawberry|berries','Fruit',32,.7,7.7,.3,150,'cup'],
['blueberry','Blueberries, raw','blueberry|berries','Fruit',57,.7,14.5,.3,148,'cup'],
['mixed-berries','Mixed berries, frozen','berries|mixed berries','Fruit',48,.8,10.5,.4,150,'cup'],
['grapes','Grapes, raw','grape','Fruit',69,.7,18.1,.2,151,'cup'],
['watermelon','Watermelon, raw','watermelon','Fruit',30,.6,7.6,.2,152,'cup diced'],
['mango','Mango, raw','mango','Fruit',60,.8,15,.4,165,'cup diced'],
['pineapple','Pineapple, raw','pineapple','Fruit',50,.5,13.1,.1,165,'cup pieces'],
['avocado','Avocado, raw','avocado','Fruit',160,2,8.5,14.7,150,'medium avocado'],
['lemon','Lemon, raw','lemon','Fruit',29,1.1,9.3,.3,58,'lemon'],
['potato','Potato, peeled, raw','potato|potatoes','Vegetables',77,2,17.5,.1,173,'medium potato'],
['sweet-potato','Sweet potato, peeled, raw','sweet potato|kumara','Vegetables',86,1.6,20.1,.1,130,'medium'],
['carrot','Carrot, raw','carrot','Vegetables',41,.9,9.6,.2,61,'medium carrot'],
['broccoli','Broccoli, raw','broccoli','Vegetables',34,2.8,6.6,.4,91,'cup chopped'],
['cauliflower','Cauliflower, raw','cauliflower','Vegetables',25,1.9,5,.3,107,'cup chopped'],
['spinach','Spinach, raw','spinach|baby spinach','Vegetables',23,2.9,3.6,.4,30,'cup'],
['rocket','Rocket, raw','rocket|arugula','Vegetables',25,2.6,3.7,.7,20,'cup'],
['lettuce','Lettuce, raw','lettuce','Vegetables',15,1.4,2.9,.2,36,'cup shredded'],
['tomato','Tomato, raw','tomato','Vegetables',18,.9,3.9,.2,123,'medium tomato'],
['cucumber','Cucumber, raw','cucumber','Vegetables',15,.7,3.6,.1,104,'cup sliced'],
['capsicum','Capsicum, red, raw','capsicum|bell pepper','Vegetables',31,1,6,.3,119,'medium'],
['zucchini','Zucchini, raw','zucchini|courgette','Vegetables',17,1.2,3.1,.3,196,'medium'],
['brown-onion','Onion, brown, raw','brown onion|onion','Vegetables',40,1.1,9.3,.1,110,'medium onion'],
['spring-onion','Spring onion, raw','spring onion|scallion','Vegetables',32,1.8,7.3,.2,15,'spring onion'],
['garlic','Garlic, raw','garlic','Vegetables',149,6.4,33.1,.5,3,'clove'],
['ginger','Ginger, raw','ginger','Vegetables',80,1.8,17.8,.8,5,'teaspoon grated'],
['mushroom','Mushrooms, raw','mushroom|button mushroom','Vegetables',22,3.1,3.3,.3,70,'cup sliced'],
['peas','Green peas, frozen, boiled','peas|green peas','Vegetables',78,5.2,13.5,.3,160,'cup'],
['corn','Sweet corn kernels, cooked','corn|sweetcorn','Vegetables',96,3.4,21,.5,165,'cup'],
['green-beans','Green beans, boiled','green beans|beans','Vegetables',35,1.9,7.9,.3,125,'cup'],
['chicken-breast','Chicken breast, skinless, cooked','chicken breast','Protein',165,31,0,3.6,120,'small breast'],
['chicken-thigh','Chicken thigh, skinless, cooked','chicken thigh|chicken thighs','Protein',209,26,0,10.9,100,'small thigh'],
['beef-mince','Beef mince, regular, cooked','beef mince|ground beef','Protein',250,26,0,17,100,'serving'],
['lean-beef-mince','Beef mince, lean, cooked','lean beef mince','Protein',217,27,0,12,100,'serving'],
['lamb-mince','Lamb mince, cooked','lamb mince|ground lamb','Protein',282,25,0,20,100,'serving'],
['rump-steak','Beef rump steak, grilled','rump steak|steak','Protein',206,29,0,9,200,'steak'],
['sirloin-steak','Beef sirloin steak, grilled','sirloin|porterhouse steak','Protein',217,27,0,12,200,'steak'],
['pork-loin','Pork loin, cooked','pork loin|pork chop','Protein',242,27,0,14,150,'chop'],
['bacon','Bacon, grilled','bacon|shortcut bacon','Protein',417,37,1.4,29,30,'rasher'],
['ham','Ham, lean','ham','Protein',145,21,1.5,5.5,25,'slice'],
['salmon','Salmon, cooked','salmon|salmon fillet','Protein',208,20,0,13,150,'fillet'],
['tuna-canned','Tuna, canned in springwater, drained','tuna|canned tuna','Protein',116,26,0,.8,95,'small can drained'],
['white-fish','White fish, cooked','white fish|barramundi|snapper','Protein',128,26,0,2.7,150,'fillet'],
['prawns','Prawns, cooked, peeled','prawn|prawns|shrimp','Protein',99,24,.2,.3,100,'serving'],
['egg','Egg, chicken, whole, boiled','egg|eggs','Protein',155,12.6,1.1,10.6,50,'large egg'],
['tofu','Tofu, firm','tofu','Protein',144,17,2.8,8.7,100,'serving'],
['chickpeas','Chickpeas, canned, drained','chickpea|garbanzo','Protein',139,7.1,19,3,125,'half can'],
['lentils','Lentils, cooked','lentil','Protein',116,9,20.1,.4,150,'cup'],
['kidney-beans','Kidney beans, canned, drained','kidney beans','Protein',127,8.7,22.8,.5,125,'half can'],
['milk-full','Milk, full fat','milk|full cream milk','Dairy',61,3.2,4.8,3.3,250,'cup'],
['milk-light','Milk, reduced fat','light milk|low fat milk','Dairy',47,3.4,4.9,1.6,250,'cup'],
['skim-milk','Milk, skim','skim milk','Dairy',35,3.4,5,.1,250,'cup'],
['greek-yoghurt','Yoghurt, Greek style, plain','greek yoghurt|yogurt','Dairy',97,9,3.9,5,170,'tub'],
['plain-yoghurt','Yoghurt, plain','plain yoghurt|yogurt','Dairy',61,3.5,4.7,3.3,200,'tub'],
['cheddar','Cheese, cheddar','cheddar|cheese','Dairy',403,25,1.3,33,25,'slice'],
['mozzarella','Cheese, mozzarella','mozzarella','Dairy',280,28,3.1,17,30,'serve'],
['feta','Cheese, feta','feta','Dairy',264,14,4.1,21,30,'serve'],
['cottage-cheese','Cottage cheese','cottage cheese','Dairy',98,11,3.4,4.3,120,'half cup'],
['butter','Butter, salted','butter','Fats',717,.9,.1,81.1,14,'tablespoon'],
['olive-oil','Olive oil','olive oil','Fats',884,0,0,100,14,'tablespoon'],
['canola-oil','Canola oil','canola oil|rapeseed oil','Fats',884,0,0,100,14,'tablespoon'],
['sesame-oil','Sesame oil','sesame oil','Fats',884,0,0,100,5,'teaspoon'],
['mayonnaise','Mayonnaise, regular','mayo|mayonnaise','Fats',680,1,1,75,14,'tablespoon'],
['peanut-butter','Peanut butter, smooth','peanut butter','Fats',588,25,20,50,20,'tablespoon'],
['almonds','Almonds, raw','almond|almonds','Fats',579,21.2,21.6,49.9,30,'small handful'],
['cashews','Cashews, roasted','cashew|cashews','Fats',574,15.3,32.7,46.4,30,'small handful'],
['rice-basmati-cooked','Rice, basmati, cooked','basmati rice|rice cooked','Grains',130,2.7,28.2,.3,158,'cup cooked'],
['rice-white-cooked','Rice, white, cooked','white rice|rice','Grains',130,2.4,28.6,.2,158,'cup cooked'],
['rice-brown-cooked','Rice, brown, cooked','brown rice','Grains',123,2.7,25.6,1,195,'cup cooked'],
['pasta-cooked','Pasta, cooked','pasta|spaghetti','Grains',158,5.8,30.9,.9,140,'cup cooked'],
['oats','Oats, rolled, dry','oats|rolled oats|porridge','Grains',379,13.2,67.7,6.5,40,'half cup dry'],
['bread-white','Bread, white','white bread|bread','Grains',266,8.9,49.4,3.3,30,'slice'],
['bread-wholemeal','Bread, wholemeal','wholemeal bread|whole wheat bread','Grains',247,13,41,4.2,35,'slice'],
['bread-sourdough','Bread, sourdough','sourdough','Grains',272,9,52,2.4,45,'slice'],
['brioche-bun','Brioche bun','brioche|burger bun','Grains',330,9,52,10,75,'bun'],
['turkish-bread','Turkish bread','turkish bread','Grains',275,9,53,3,100,'quarter loaf'],
['wrap','Wheat tortilla wrap','wrap|tortilla','Grains',312,8.3,52,8.3,70,'large wrap'],
['crumpet','Crumpet, plain','crumpet','Grains',230,7.5,45,1.5,50,'crumpet'],
['cornflakes','Corn flakes','cornflakes|cereal','Grains',357,7.5,84,.4,30,'cup'],
['muesli','Muesli, untoasted','muesli','Grains',360,10,64,7,45,'half cup'],
['noodles-instant','Instant noodles, prepared','instant noodles|mi goreng noodles','Grains',190,4.5,27,7,350,'prepared packet'],
['flour-plain','Wheat flour, plain','plain flour|flour','Grains',364,10.3,76.3,1,125,'cup'],
['sugar-white','Sugar, white','sugar|white sugar','Pantry',387,0,100,0,4,'teaspoon'],
['brown-sugar','Sugar, brown','brown sugar','Pantry',380,0,98,0,12,'tablespoon'],
['honey','Honey','honey','Pantry',304,.3,82.4,0,21,'tablespoon'],
['maple-syrup','Maple syrup','maple syrup','Pantry',260,0,67,0,20,'tablespoon'],
['soy-sauce','Soy sauce','soy sauce','Sauces',53,8.1,4.9,.6,15,'tablespoon'],
['tomato-sauce','Tomato sauce, ketchup','ketchup|tomato sauce','Sauces',112,1.3,26,.2,17,'tablespoon'],
['dijon','Mustard, Dijon','dijon|mustard','Sauces',66,4.4,5.8,3.3,5,'teaspoon'],
['worcestershire','Worcestershire sauce','worcestershire','Sauces',78,0,19,0,17,'tablespoon'],
['balsamic','Balsamic vinegar','balsamic|balsamic vinegar','Sauces',88,.5,17,0,5,'teaspoon'],
['coconut-milk','Coconut milk, canned','coconut milk','Pantry',197,2,2.8,20,125,'half cup'],
['tomatoes-canned','Tomatoes, canned','canned tomatoes|tinned tomatoes','Pantry',24,1.2,4.2,.3,200,'half can'],
['vanilla','Vanilla extract','vanilla|vanilla extract','Pantry',288,.1,12.7,.1,5,'teaspoon'],
['dark-chocolate','Chocolate, dark','dark chocolate|chocolate','Snacks',598,7.8,45.9,42.6,25,'serve'],
['milk-chocolate','Chocolate, milk','milk chocolate','Snacks',535,7.7,59.4,29.7,25,'serve'],
['potato-chips','Potato crisps, plain','chips|crisps','Snacks',536,7,53,35,30,'small bag'],
['popcorn','Popcorn, air popped','popcorn','Snacks',387,13,78,4.5,25,'serve'],
['rice-crackers','Rice crackers','rice crackers','Snacks',416,8,82,6,25,'serve'],
['protein-powder','Whey protein powder','whey|protein powder','Supplements',400,80,8,6,30,'scoop'],
['coffee-black','Coffee, black, prepared','coffee|black coffee','Drinks',2,.3,0,0,250,'mug'],
['tea','Tea, black, prepared','tea|black tea','Drinks',1,0,.3,0,250,'mug'],
['orange-juice','Orange juice','orange juice|oj','Drinks',45,.7,10.4,.2,250,'cup'],
['apple-juice','Apple juice','apple juice','Drinks',46,.1,11.3,.1,250,'cup'],
['cola','Cola soft drink','cola|soft drink|soda','Drinks',42,0,10.6,0,375,'can'],
['beer-full','Beer, full strength','beer|lager','Drinks',36,.4,2.3,0,375,'can'],
['wine-red','Wine, red','red wine|wine','Drinks',85,.1,2.6,0,150,'glass'],
['water','Water','water','Drinks',0,0,0,0,250,'glass'],
['salt','Salt','salt','Pantry',0,0,0,0,1,'pinch'],
['cinnamon','Cinnamon, ground','cinnamon','Pantry',247,4,81,1.2,2.6,'teaspoon'],
['cumin','Cumin, ground','cumin','Pantry',375,18,44,22,2.1,'teaspoon'],
['paprika','Paprika, ground','paprika|smoked paprika','Pantry',282,14,54,13,2.3,'teaspoon'],
['parsley','Parsley, fresh','parsley','Vegetables',36,3,6.3,.8,15,'handful']
];
const NUT_CATALOG=NUT_ROWS.map(r=>({id:'ausnut-'+r[0],name:r[1],aliases:r[2].split('|'),category:r[3],per100:{calories:r[4],protein:r[5],carbs:r[6],fat:r[7]},measures:[{id:'g',label:'grams',grams:1},{id:'serve',label:r[9],grams:r[8]}],source:NUT_CATALOG_SOURCE}));
const NUT_CATALOG_BY_ID=Object.fromEntries(NUT_CATALOG.map(f=>[f.id,f]));

const NUT_LOG_KEY='daily_nutrition_log';
const NUT_FOODS_KEY='daily_my_foods';
const NUT_PREFS_KEY='daily_food_prefs';
const NUT_MEALS=[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['snacks','Snacks']];
let nutLog={schemaVersion:1,entries:{},legacyTotals:{}};
let nutMyFoods={schemaVersion:1,foods:{}};
let nutPrefs={schemaVersion:1,favourites:{},recent:[]};
let nutTab='today';
let nutRecipeFilter='all';
let nutSelected=null;
let nutSelectedOptionId=null;
let nutEditId=null;
let nutEditBase=null;
let nutMeal='snacks';
let nutSearch='';

function nutEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function nutNum(v){ if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v); return Number.isFinite(n)&&n>=0?n:null; }
function nutPos(v){ if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v); return Number.isFinite(n)&&n>0?n:null; }
function nutRound(v,p){ const m=Math.pow(10,p==null?1:p); return Math.round(v*m)/m; }
function nutId(prefix){ try{return prefix+crypto.randomUUID();}catch(e){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2);} }
function nutHash(s){ let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);} return (h>>>0).toString(36); }
function nutLoadRaw(key,fallback){ try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:fallback;}catch(e){return fallback;} }
function nutNormalLog(raw){
  const out={schemaVersion:1,entries:{},legacyTotals:{}};
  if(!raw||typeof raw!=='object') return out;
  Object.entries(raw.entries||{}).forEach(([id,e])=>{
    if(!e||typeof e!=='object'||!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date||''))) return;
    const meal=NUT_MEALS.some(x=>x[0]===e.meal)?e.meal:'snacks';
    const n=e.nutrition&&typeof e.nutrition==='object'?e.nutrition:{};
    const status=e.nutritionStatus==='unknown'?'unknown':(nutNum(n.calories)!=null?'known':'unknown');
    out.entries[id]=Object.assign({},e,{id,meal,name:String(e.name||'Food'),quantity:nutPos(e.quantity)||1,
      measureId:String(e.measureId||'serving'),measureLabel:String(e.measureLabel||'serving'),grams:nutPos(e.grams),
      nutrition:{calories:nutNum(n.calories),protein:nutNum(n.protein),carbs:nutNum(n.carbs),fat:nutNum(n.fat)},
      nutritionStatus:status,createdAt:nutNum(e.createdAt)||0,updatedAt:nutNum(e.updatedAt)||0,deletedAt:nutNum(e.deletedAt)});
  });
  Object.entries(raw.legacyTotals||{}).forEach(([date,v])=>{const c=nutNum(v&&v.calories);if(c!=null)out.legacyTotals[date]={calories:c,source:String(v.source||'legacy')};});
  return out;
}
function nutNormalFoods(raw){
  const out={schemaVersion:1,foods:{}};
  Object.entries(raw&&raw.foods||{}).forEach(([id,f])=>{if(f&&typeof f==='object'&&f.name){const n=f.nutrition&&typeof f.nutrition==='object'?f.nutrition:{};out.foods[id]=Object.assign({},f,{id,name:String(f.name),basis:f.basis==='per100g'?'per100g':'serving',servingLabel:String(f.servingLabel||'serving'),servingGrams:nutPos(f.servingGrams),nutrition:{calories:nutNum(n.calories),protein:nutNum(n.protein),carbs:nutNum(n.carbs),fat:nutNum(n.fat)},updatedAt:nutNum(f.updatedAt)||0,deletedAt:nutNum(f.deletedAt)});}});
  return out;
}
function nutEntryClock(e){ return Math.max(nutNum(e&&e.updatedAt)||0,nutNum(e&&e.deletedAt)||0,nutNum(e&&e.createdAt)||0); }
function nutMergeLogs(a,b){
  a=nutNormalLog(a); b=nutNormalLog(b); const out={schemaVersion:1,entries:{},legacyTotals:Object.assign({},a.legacyTotals,b.legacyTotals)};
  new Set([...Object.keys(a.entries),...Object.keys(b.entries)]).forEach(id=>{const x=a.entries[id],y=b.entries[id];if(!x)out.entries[id]=y;else if(!y)out.entries[id]=x;else{const xc=nutEntryClock(x),yc=nutEntryClock(y);out.entries[id]=yc>xc?y:xc>yc?x:(y.deletedAt&&!x.deletedAt?y:x);}});
  return out;
}
function nutSaveLog(push){
  if(typeof lsSave==='function') lsSave(NUT_LOG_KEY,nutLog);
  else localStorage.setItem(NUT_LOG_KEY,JSON.stringify(nutLog));
  if(push!==false) nutPushLog();
}
function nutSaveFoods(){ if(typeof lsSave==='function')lsSave(NUT_FOODS_KEY,nutMyFoods,'nutritionFoods');else localStorage.setItem(NUT_FOODS_KEY,JSON.stringify(nutMyFoods)); }
function nutSavePrefs(){ if(typeof lsSave==='function')lsSave(NUT_PREFS_KEY,nutPrefs,'nutritionPrefs');else localStorage.setItem(NUT_PREFS_KEY,JSON.stringify(nutPrefs)); }
function nutPushLog(){
  if(!(typeof fbRef==='function')) return; const ref=fbRef('nutritionLog'); if(!ref)return;
  const local=nutLog, now=Date.now();
  ref.transaction(raw=>{let cloud={};try{cloud=raw&&raw.v?JSON.parse(raw.v):raw||{};}catch(e){}const merged=nutMergeLogs(cloud,local);return {v:JSON.stringify(merged),t:now};});
}
function nutSyncListen(uid){
  if(!(typeof db!=='undefined'&&db))return;
  if(typeof SYNC_BLOB_REG!=='undefined'&&!SYNC_BLOB_REG.some(b=>b.lsKey===NUT_LOG_KEY))SYNC_BLOB_REG.push({path:'nutritionLog',lsKey:NUT_LOG_KEY,tsKey:NUT_LOG_KEY+'_ts'});
  const ref=db.ref('users/'+uid+'/nutritionLog');
  ref.on('value',snap=>{
    const raw=snap.val(); let cloud={}; try{cloud=raw&&raw.v?JSON.parse(raw.v):raw||{};}catch(e){}
    const merged=nutMergeLogs(nutLog,cloud); const before=JSON.stringify(nutLog), after=JSON.stringify(merged); nutLog=merged;
    if(before!==after){localStorage.setItem(NUT_LOG_KEY,after);nutRefreshConsumers();}
    const cloudNorm=JSON.stringify(nutNormalLog(cloud)); if(cloudNorm!==after)ref.set({v:after,t:Date.now()});
  });
}
function nutMigrateLegacy(){
  let changed=false; nutLog=nutNormalLog(nutLoadRaw(NUT_LOG_KEY,nutLog));
  const day=nutLoadRaw('wt_calories',null);
  if(day&&/^\d{4}-\d{2}-\d{2}$/.test(String(day.date||''))&&Array.isArray(day.entries))day.entries.forEach((e,i)=>{
    if(!e||typeof e!=='object')return; const kcal=nutNum(e.kcal); const id='legacy-'+day.date+'-'+i+'-'+nutHash(JSON.stringify([e.name,e.kcal,e.category,e.recipeId,e.servings])); if(nutLog.entries[id])return;
    nutLog.entries[id]={id,date:day.date,meal:NUT_MEALS.some(x=>x[0]===e.category)?e.category:'snacks',name:String(e.name||'Legacy food'),quantity:nutPos(e.servings)||1,
      measureId:'legacy-serving',measureLabel:e.servings?String(e.servings)+' serving'+(e.servings===1?'':'s'):'legacy serving',grams:null,
      nutrition:{calories:kcal,protein:nutNum(e.protein),carbs:nutNum(e.carbs),fat:nutNum(e.fat)},nutritionStatus:kcal==null?'unknown':'known',source:'legacy',
      foodId:null,recipeId:e.recipeId||null,proteinOptionId:e.proteinOptionId||null,servings:nutPos(e.servings),createdAt:0,updatedAt:0,deletedAt:null}; changed=true;
  });
  const hist=nutLoadRaw('daily_cal_history',{}); Object.entries(hist||{}).forEach(([date,v])=>{const c=nutNum(v&&typeof v==='object'?v.calories:v);if(c!=null&&!nutLog.legacyTotals[date]){nutLog.legacyTotals[date]={calories:c,source:'daily_cal_history'};changed=true;}});
  nutMyFoods=nutNormalFoods(nutLoadRaw(NUT_FOODS_KEY,nutMyFoods)); const saved=nutLoadRaw('daily_saved_foods',[]);
  if(Array.isArray(saved))saved.forEach((f,i)=>{const c=nutNum(f&&f.kcal),name=String(f&&f.name||'').trim();if(!name||c==null)return;const id='legacy-food-'+nutHash(name.toLowerCase()+'|'+c+'|'+i);if(nutMyFoods.foods[id])return;nutMyFoods.foods[id]={id,name,aliases:[],category:'My Foods',basis:'serving',servingLabel:'saved serving',servingGrams:null,nutrition:{calories:c,protein:null,carbs:null,fat:null},createdAt:0,updatedAt:0,deletedAt:null,source:'legacy saved food'};changed=true;});
  nutPrefs=nutLoadRaw(NUT_PREFS_KEY,{schemaVersion:1,favourites:{},recent:[]});if(!nutPrefs.favourites)nutPrefs.favourites={};if(!Array.isArray(nutPrefs.recent))nutPrefs.recent=[];
  if(changed){nutSaveLog(false);nutSaveFoods();}
  nutRefreshLegacyViews(); return changed;
}
function nutInit(){nutMigrateLegacy();}
function nutRefreshLegacyViews(){
  if(typeof S==='undefined')return; const date=typeof getLocalDate==='function'?getLocalDate():new Date().toLocaleDateString('en-CA'); const entries=nutEntries(date);
  S.dailyLog={date,entries:entries.map(e=>({name:e.name,kcal:e.nutritionStatus==='known'?e.nutrition.calories:null,category:e.meal,protein:e.nutrition.protein,carbs:e.nutrition.carbs,fat:e.nutrition.fat,recipeId:e.recipeId,servings:e.servings,_nutId:e.id,_unknown:e.nutritionStatus==='unknown'}))};
  if(typeof calorieHistory!=='undefined'){Object.entries(nutLog.legacyTotals).forEach(([d,v])=>calorieHistory[d]=v.calories);for(const d of new Set(Object.values(nutLog.entries).map(e=>e.date))){const s=nutDaySummary(d);if(s.status==='complete')calorieHistory[d]=s.calories;else delete calorieHistory[d];}}
}
function nutRefreshConsumers(){nutRefreshLegacyViews();if(typeof renderHome==='function'&&typeof S!=='undefined'&&S.view==='home')renderHome();if(typeof refreshStatsForData==='function')refreshStatsForData(['overview','review','nutrition']);if(typeof S!=='undefined'&&S.view==='nutrition')nutRender();}
function nutEntries(date){return Object.values(nutLog.entries).filter(e=>e&&e.date===date&&!e.deletedAt).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));}
function nutDaySummary(date){
  const entries=nutEntries(date),legacy=nutLog.legacyTotals[date]; if(!entries.length)return legacy?{status:'legacy',calories:legacy.calories,unknown:0,entries:[],macroComplete:false,macros:null}:{status:'missing',calories:null,unknown:0,entries:[],macroComplete:false,macros:null};
  let calories=0,unknown=0;const macros={protein:0,carbs:0,fat:0};let macroComplete=true;
  entries.forEach(e=>{const known=e.nutritionStatus==='known'&&nutNum(e.nutrition.calories)!=null;if(known)calories+=e.nutrition.calories;else{unknown++;macroComplete=false;}['protein','carbs','fat'].forEach(k=>{const v=known?nutNum(e.nutrition[k]):null;if(v==null)macroComplete=false;else macros[k]+=v;});});
  return {status:unknown?'partial':'complete',calories:nutRound(calories,0),unknown,entries,macroComplete,macros};
}
function nutTarget(){if(typeof calcGoalCals!=='function')return null;const c=calcGoalCals();if(!c)return null;if(typeof S!=='undefined'&&nutNum(S.personalInfo&&S.personalInfo.customCalorieTarget)!=null)return S.personalInfo.customCalorieTarget;return c.goal==='cut'?c.cut:c.goal==='bulk'?c.bulk:c.maintain;}
function nutScale(per100,grams){const out={};Object.keys(per100).forEach(k=>out[k]=nutNum(per100[k])==null?null:nutRound(per100[k]*grams/100,1));return out;}
function nutFoodById(id){if(NUT_CATALOG_BY_ID[id])return Object.assign({kind:'catalog'},NUT_CATALOG_BY_ID[id]);const f=nutMyFoods.foods[id];return f&&!f.deletedAt?Object.assign({kind:'custom'},f):null;}
function nutRecipeFoods(){return typeof kitRecipes==='undefined'?[]:kitRecipes.map(r=>({id:'recipe:'+r.id,kind:'recipe',name:r.name,aliases:[],category:'Kitchen',recipe:r}));}
function nutFoodSearch(q){
  q=String(q||'').trim().toLowerCase();let foods=[...Object.values(nutMyFoods.foods).filter(f=>!f.deletedAt).map(f=>Object.assign({kind:'custom'},f)),...nutRecipeFoods(),...NUT_CATALOG.map(f=>Object.assign({kind:'catalog'},f))];
  if(q)foods=foods.filter(f=>(f.name+' '+(f.aliases||[]).join(' ')).toLowerCase().includes(q));
  const recent=new Map((nutPrefs.recent||[]).map((id,i)=>[id,i]));return foods.sort((a,b)=>{const ar=recent.has(a.id)?recent.get(a.id):99,br=recent.has(b.id)?recent.get(b.id):99;if(ar!==br)return ar-br;const af=nutPrefs.favourites[a.id]?0:1,bf=nutPrefs.favourites[b.id]?0:1;return af-bf||a.name.localeCompare(b.name);});
}
function nutSetTab(tab){nutTab=['today','foods','recipes'].includes(tab)?tab:'today';nutRender();}
function nutOpen(meal,highlight){nutMeal=meal||'snacks';nutTab='today';setView('nutrition');setTimeout(()=>{const e=highlight&&document.querySelector('[data-nut-entry="'+highlight+'"]');if(e)e.scrollIntoView({behavior:'smooth',block:'center'});},80);}
function nutRender(){
  const wrap=document.getElementById('nutrition-main');if(!wrap)return;const date=typeof getLocalDate==='function'?getLocalDate():new Date().toLocaleDateString('en-CA');
  wrap.innerHTML='<div class="nut-head"><div><div class="nut-title">Nutrition</div><div class="nut-date">'+nutEsc(new Date(date+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'}))+'</div></div></div>'+
    '<div class="nut-tabs" role="tablist">'+[['today','Today'],['foods','Foods'],['recipes','Recipes']].map(x=>'<button class="nut-tab'+(nutTab===x[0]?' active':'')+'" onclick="nutSetTab(\''+x[0]+'\')">'+x[1]+'</button>').join('')+'</div><div id="nut-pane"></div>';
  if(nutTab==='today')nutRenderToday(date);else if(nutTab==='foods')nutRenderFoods();else nutRenderRecipes();
}
function nutSummaryLabel(s){return s.status==='partial'?'Partial · '+s.unknown+' unknown':s.status==='complete'?'Complete':s.status==='legacy'?'Legacy total':'Not logged';}
function nutRenderToday(date){
  const pane=document.getElementById('nut-pane'),s=nutDaySummary(date),target=nutTarget();const pct=target&&s.calories!=null?Math.min(100,Math.round(s.calories/target*100)):0;
  const macro=s.macros||{protein:0,carbs:0,fat:0};let hero='<div class="nut-hero"><div class="nut-hero-row"><div><div class="nut-kcal">'+(s.calories==null?'—':s.calories)+'</div><div class="nut-kcal-label">known kcal</div></div><span class="nut-status">'+nutSummaryLabel(s)+'</span></div>';
  if(target)hero+='<div class="nut-progress"><i style="width:'+pct+'%"></i></div><div class="nut-target-note">'+(s.status==='partial'?'Known subtotal only — remaining is not calculated.':(s.calories==null?'Target '+target+' kcal':Math.abs(target-s.calories)+' kcal '+(s.calories<=target?'remaining':'over')+' · target '+target))+'</div>';
  else hero+='<div class="nut-target-note" style="margin-top:13px">Logging works without a target. Add Health details later if you want one.</div>';
  hero+='<div class="nut-macros">'+[['Protein',macro.protein],['Carbs',macro.carbs],['Fat',macro.fat]].map(x=>'<div class="nut-macro"><b>'+(s.macroComplete?nutRound(x[1],0)+'g':'—')+'</b><span>'+x[0]+'</span></div>').join('')+'</div></div>';
  const prevDate=(()=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-1);return d.toLocaleDateString('en-CA');})();
  const meals=NUT_MEALS.map(([id,label])=>{const items=s.entries.filter(e=>e.meal===id),prev=nutEntries(prevDate).filter(e=>e.meal===id),known=items.reduce((a,e)=>a+(e.nutritionStatus==='known'?(e.nutrition.calories||0):0),0),unknown=items.filter(e=>e.nutritionStatus==='unknown').length;
    return '<div class="nut-meal"><div class="nut-meal-hd"><span class="nut-meal-name">'+label+'</span><span class="nut-meal-total">'+nutRound(known,0)+' kcal'+(unknown?' + '+unknown+' unknown':'')+'</span></div>'+items.map(e=>'<div class="nut-entry" data-nut-entry="'+e.id+'" onclick="nutEditEntry(\''+e.id+'\')"><div><div class="nut-entry-name">'+nutEsc(e.name)+'</div><div class="nut-entry-sub">'+nutEsc(e.measureLabel)+' × '+nutRound(e.quantity,2)+'</div></div><div class="nut-entry-kcal'+(e.nutritionStatus==='unknown'?' unknown':'')+'">'+(e.nutritionStatus==='unknown'?'Unknown':nutRound(e.nutrition.calories,0)+' kcal')+'</div><span aria-hidden="true">›</span></div>').join('')+'<button class="nut-add" onclick="nutOpenFoodSheet(\''+id+'\')">+ Add food</button>'+(prev.length?'<button class="nut-add" onclick="nutCopyPreviousMeal(\''+id+'\',\''+prevDate+'\')">↻ Copy yesterday’s '+label.toLowerCase()+'</button>':'')+'</div>';}).join('');
  pane.innerHTML='<div class="nut-today-grid">'+hero+'<div>'+meals+'</div></div>';
}
function nutFoodRow(f){let kcal='Unknown';if(f.kind==='catalog')kcal=Math.round(f.per100.calories)+' kcal / 100 g';else if(f.kind==='recipe'){const n=typeof kitNutritionState==='function'?kitNutritionState(f.recipe):null;kcal=n&&n.nutrition&&n.nutrition.calories!=null?Math.round(n.nutrition.calories)+' kcal / serve':(f.recipe.calories!=null?f.recipe.calories+' kcal / serve':'Needs review');}else if(f.nutrition&&f.nutrition.calories!=null)kcal=Math.round(f.nutrition.calories)+' kcal / '+(f.basis==='per100g'?'100 g':nutEsc(f.servingLabel||'serve'));return '<button class="nut-food-row" onclick="nutChooseFood(\''+nutEsc(f.id)+'\')"><span><b>'+nutEsc(f.name)+(nutPrefs.favourites[f.id]?' ★':'')+'</b><small>'+nutEsc(f.category||f.kind)+'</small></span><span class="nut-food-kcal">'+kcal+'</span></button>';}
function nutRenderFoods(){const pane=document.getElementById('nut-pane'),foods=nutFoodSearch(nutSearch),mine=Object.values(nutMyFoods.foods).filter(f=>!f.deletedAt);pane.innerHTML='<input class="nut-search" value="'+nutEsc(nutSearch)+'" placeholder="Search common foods, My Foods and recipes" oninput="nutSearch=this.value;nutRenderFoods()"><div class="nut-inline-actions"><button class="nut-small-btn" onclick="nutOpenCustomFood()">+ Create My Food</button></div>'+(mine.length&&!nutSearch?'<div class="nut-section-label">My Foods</div><div class="nut-food-list">'+mine.map(f=>'<div class="nut-review-row"><span><b>'+nutEsc(f.name)+'</b><div class="nut-entry-sub">'+(f.basis==='per100g'?'Per 100 g':nutEsc(f.servingLabel||'serving'))+' · '+Math.round(f.nutrition.calories)+' kcal</div></span><button class="nut-small-btn" onclick="nutManageCustomFood(\''+f.id+'\')">Manage</button></div>').join('')+'</div>':'')+'<div class="nut-section-label">'+(nutSearch?'Results':'Recent, favourites and foods')+'</div><div class="nut-food-list">'+(foods.length?foods.slice(0,80).map(nutFoodRow).join(''):'<div class="nut-empty">No matching food. Create a My Food or use Manual entry.</div>')+'</div><div class="nut-source">Food composition values are estimates and vary by brand, variety and preparation. Starter values are adapted from <a href="'+NUT_CATALOG_SOURCE.url+'" target="_blank" rel="noopener">FSANZ AUSNUT 2023</a>; © Food Standards Australia New Zealand. FSANZ site content is <a href="'+NUT_CATALOG_SOURCE.licenseUrl+'" target="_blank" rel="noopener">CC BY 4.0 unless otherwise noted</a>. FSANZ does not endorse Daily.</div>';}
function nutRecipeState(r){if(r.nutritionBasis==='calculated')return 'calculated';if(r.nutritionBasis==='partial')return 'partial';if(nutNum(r.calories)!=null)return 'manual';return 'missing';}
function nutSetRecipeFilter(v){nutRecipeFilter=v==='incomplete'?'incomplete':'all';nutRenderRecipes();}
function nutRenderRecipes(){const pane=document.getElementById('nut-pane'),all=typeof kitRecipes==='undefined'?[]:kitRecipes;const counts={calculated:0,manual:0,partial:0,missing:0};all.forEach(r=>counts[nutRecipeState(r)]++);const rs=nutRecipeFilter==='incomplete'?all.filter(r=>['partial','missing'].includes(nutRecipeState(r))):all;pane.innerHTML='<div class="card" style="margin-bottom:12px"><div style="font-size:14px;font-weight:800">Nutrition Review</div><div style="font-size:12px;color:var(--muted);margin-top:4px">'+counts.calculated+' calculated · '+counts.manual+' manual · '+counts.partial+' partial · '+counts.missing+' missing</div><div class="nut-inline-actions"><button class="nut-small-btn'+(nutRecipeFilter==='all'?' active':'')+'" onclick="nutSetRecipeFilter(\'all\')">All</button><button class="nut-small-btn'+(nutRecipeFilter==='incomplete'?' active':'')+'" onclick="nutSetRecipeFilter(\'incomplete\')">Incomplete</button></div></div><div class="nut-food-list">'+(rs.length?rs.map(r=>{const st=nutRecipeState(r),label={calculated:'Calculated',manual:'Manual estimate',partial:'Partial · needs matches',missing:'Missing'}[st];return '<div class="nut-review-row"><span><b>'+nutEsc(r.name)+'</b><div class="nut-entry-sub">'+((r.ingredients||[]).length)+' ingredients</div></span><button class="nut-review-state '+st+'" onclick="nutReviewRecipe(\''+r.id+'\')">'+label+'</button></div>';}).join(''):'<div class="nut-empty">'+(nutRecipeFilter==='incomplete'?'No partial or missing recipes.':'No Kitchen recipes yet.')+'</div>')+'</div><div class="nut-source">Manual values are preserved until you explicitly accept a calculated replacement. Unresolved ingredients never count as zero.</div>';}
function nutOpenFoodSheet(meal){nutMeal=meal||nutMeal;nutEditId=null;nutSelected=null;nutSelectedOptionId=null;nutSearch='';nutRenderFoodSheet();}
function nutCloseFoodSheet(){const o=document.getElementById('nutrition-food-overlay');if(o)o.classList.add('hidden');}
function nutRenderFoodSheet(){const box=document.getElementById('nutrition-food-box'),ov=document.getElementById('nutrition-food-overlay');if(!box||!ov)return;const foods=nutFoodSearch(nutSearch).slice(0,50);box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutCloseFoodSheet()" aria-label="Close">←</button><div class="modal-title">Add food</div></div><div class="modal-body"><div class="nut-sheet-fields"><div class="nut-field full"><label>Meal</label><select onchange="nutMeal=this.value">'+NUT_MEALS.map(x=>'<option value="'+x[0]+'"'+(nutMeal===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div></div><input class="nut-search" style="margin-top:12px" value="'+nutEsc(nutSearch)+'" placeholder="Search foods and recipes" oninput="nutSearch=this.value;nutRenderFoodSheet()"><div class="nut-inline-actions"><button class="nut-small-btn" onclick="nutOpenManual()">Manual or Unknown</button><button class="nut-small-btn" onclick="nutOpenCustomFood()">Create My Food</button></div><div class="nut-section-label">Choose food</div><div class="nut-food-list nut-sheet-list">'+(foods.length?foods.map(nutFoodRow).join(''):'<div class="nut-empty">No match found.</div>')+'</div></div>';ov.classList.remove('hidden');}
function nutChooseFood(id){const f=id.startsWith('recipe:')?nutRecipeFoods().find(x=>x.id===id):nutFoodById(id);if(!f)return;nutSelected=f;nutSelectedOptionId=f.kind==='recipe'&&typeof kitResolve==='function'?kitResolve(f.recipe,null,f.recipe.servings).optionId:null;nutRenderQuantity();const ov=document.getElementById('nutrition-food-overlay');if(ov)ov.classList.remove('hidden');}
function nutSelectedBasis(f){if(f.kind==='catalog')return {measures:f.measures,per100:f.per100};if(f.kind==='custom'){const grams=nutPos(f.servingGrams);if(f.basis==='per100g')return {measures:[{id:'g',label:'grams',grams:1},...(grams?[{id:'serve',label:f.servingLabel||'serving',grams}]:[])],per100:f.nutrition};return {measures:[{id:'serve',label:f.servingLabel||'serving',grams:grams||1}],perServing:f.nutrition};}if(f.kind==='recipe'){const r=f.recipe,rv=typeof kitResolve==='function'?kitResolve(r,nutSelectedOptionId,r.servings):null,n=rv?rv.nutrition:{calories:nutNum(r.calories),protein:nutNum(r.protein),carbs:nutNum(r.carbs),fat:nutNum(r.fat)};return {measures:[{id:'serve',label:'serving',grams:1}],perServing:n,status:nutNum(n.calories)==null?'unknown':'known',optionId:rv&&rv.optionId,optionLabel:rv&&rv.optionLabel};}return null;}
function nutSetSelectedRecipeOption(id){nutSelectedOptionId=id;nutRenderQuantity();}
function nutRenderQuantity(){const box=document.getElementById('nutrition-food-box'),f=nutSelected,b=nutSelectedBasis(f);if(!box||!b)return;const options=f.kind==='recipe'&&typeof kitOptionsOf==='function'?kitOptionsOf(f.recipe):[],optionField=options.length?'<div class="nut-field full"><label>Protein option</label><select onchange="nutSetSelectedRecipeOption(this.value)">'+options.map(o=>'<option value="'+o.id+'"'+(o.id===nutSelectedOptionId?' selected':'')+'>'+nutEsc(o.label)+'</option>').join('')+'</select></div>':'',defaultQty=f.kind==='custom'&&f.basis==='per100g'&&!f.servingGrams?100:1;box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutRenderFoodSheet()" aria-label="Back">←</button><div class="modal-title">'+nutEsc(f.name)+'</div></div><div class="modal-body"><div class="nut-sheet-fields">'+optionField+'<div class="nut-field"><label>Quantity</label><input id="nut-qty" type="number" min="0.01" step="0.25" value="'+defaultQty+'" oninput="nutUpdateLive()"></div><div class="nut-field"><label>Measure</label><select id="nut-measure" onchange="nutUpdateLive()">'+b.measures.map((m,i)=>'<option value="'+nutEsc(m.id)+'"'+(i===1?' selected':'')+'>'+nutEsc(m.label)+'</option>').join('')+'</select><div class="nut-field full"><label>Meal</label><select id="nut-log-meal">'+NUT_MEALS.map(x=>'<option value="'+x[0]+'"'+(nutMeal===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div></div></div><div id="nut-live" class="nut-live"></div><div class="nut-inline-actions"><button class="nut-small-btn" onclick="nutToggleFavourite(\''+nutEsc(f.id)+'\')">'+(nutPrefs.favourites[f.id]?'★ Favourite':'☆ Add favourite')+'</button></div><div class="nut-sheet-actions"><button class="modal-btn secondary" onclick="nutCloseFoodSheet()">Cancel</button><button class="modal-btn primary" onclick="nutLogSelected()">Log food</button></div></div>';nutUpdateLive();}
function nutSelectionNutrition(){const f=nutSelected,b=nutSelectedBasis(f),q=nutPos(document.getElementById('nut-qty')&&document.getElementById('nut-qty').value);if(!f||!b||!q)return null;const mid=(document.getElementById('nut-measure')||{}).value,measure=b.measures.find(m=>m.id===mid)||b.measures[0];if(b.status==='unknown')return {quantity:q,measure,nutrition:{calories:null,protein:null,carbs:null,fat:null},status:'unknown',grams:null};if(b.per100){const grams=measure.grams*q;return {quantity:q,measure,nutrition:nutScale(b.per100,grams),status:'known',grams};}const n={};Object.keys(b.perServing).forEach(k=>n[k]=nutNum(b.perServing[k])==null?null:nutRound(b.perServing[k]*q,1));return {quantity:q,measure,nutrition:n,status:n.calories==null?'unknown':'known',grams:null};}
function nutUpdateLive(){const el=document.getElementById('nut-live'),x=nutSelectionNutrition();if(!el)return;el.textContent=!x?'Enter a quantity greater than zero.':x.status==='unknown'?'Nutrition is unknown. This day will be marked Partial.':Math.round(x.nutrition.calories)+' kcal · '+(x.nutrition.protein==null?'—':nutRound(x.nutrition.protein,1)+' g protein')+' · '+(x.nutrition.carbs==null?'—':nutRound(x.nutrition.carbs,1)+' g carbs')+' · '+(x.nutrition.fat==null?'—':nutRound(x.nutrition.fat,1)+' g fat');}
function nutLogSelected(){const f=nutSelected,x=nutSelectionNutrition();if(!f||!x){showToast('Enter a valid quantity');return;}const now=Date.now(),id=nutId('food-'),meal=(document.getElementById('nut-log-meal')||{}).value||nutMeal,recipe=f.kind==='recipe'?f.recipe:null,b=nutSelectedBasis(f),snapName=f.name+(b&&b.optionLabel?' · '+b.optionLabel:'');nutLog.entries[id]={id,date:getLocalDate(),meal,name:snapName,quantity:x.quantity,measureId:x.measure.id,measureLabel:x.measure.label,grams:x.grams,nutrition:x.nutrition,nutritionStatus:x.status,source:f.kind,foodId:f.kind==='catalog'||f.kind==='custom'?f.id:null,recipeId:recipe?recipe.id:null,proteinOptionId:recipe&&b?b.optionId:null,servings:recipe?x.quantity:null,createdAt:now,updatedAt:now,deletedAt:null};nutPrefs.recent=[f.id,...nutPrefs.recent.filter(v=>v!==f.id)].slice(0,20);nutSavePrefs();nutSaveLog();nutTab='today';nutCloseFoodSheet();nutRefreshConsumers();showToast('Food logged');}
function nutToggleFavourite(id){nutPrefs.favourites[id]=!nutPrefs.favourites[id];if(!nutPrefs.favourites[id])delete nutPrefs.favourites[id];nutSavePrefs();if(nutSelected&&nutSelected.id===id){const btn=document.querySelector('#nutrition-food-box .nut-inline-actions .nut-small-btn');if(btn)btn.textContent=nutPrefs.favourites[id]?'★ Favourite':'☆ Add favourite';}else nutRenderFoods();}
function nutOpenManual(entry){nutSelected={id:'manual',kind:'manual',name:entry&&entry.name||''};nutEditId=entry&&entry.id||null;nutEditBase=entry?{quantity:entry.quantity,nutrition:Object.assign({},entry.nutrition)}:null;const box=document.getElementById('nutrition-food-box'),ov=document.getElementById('nutrition-food-overlay');if(!box||!ov)return;const n=entry&&entry.nutrition||{};box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="'+(entry?'nutCloseFoodSheet()':'nutRenderFoodSheet()')+'" aria-label="Back">←</button><div class="modal-title">'+(entry?'Edit entry':'Manual entry')+'</div></div><div class="modal-body"><div class="nut-sheet-fields"><div class="nut-field full"><label>Food name</label><input id="nut-man-name" value="'+nutEsc(entry&&entry.name||'')+'"></div><div class="nut-field"><label>Quantity</label><input id="nut-man-qty" type="number" min="0.01" step="0.25" value="'+(entry?entry.quantity:1)+'" oninput="nutEditScale()"></div><div class="nut-field"><label>Serving / measure</label><input id="nut-man-measure" value="'+nutEsc(entry&&entry.measureLabel||'serving')+'"></div><div class="nut-field full"><label>Meal</label><select id="nut-man-meal">'+NUT_MEALS.map(x=>'<option value="'+x[0]+'"'+((entry?entry.meal:nutMeal)===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></div><div class="nut-field full"><label><input id="nut-man-unknown" type="checkbox"'+(entry&&entry.nutritionStatus==='unknown'?' checked':'')+' onchange="nutManualToggle()"> Nutrition is explicitly Unknown</label></div><div class="nut-field"><label>Calories</label><input class="nut-man-num" id="nut-man-cal" type="number" min="0" value="'+(n.calories==null?'':n.calories)+'"></div><div class="nut-field"><label>Protein (g, optional)</label><input class="nut-man-num" id="nut-man-pro" type="number" min="0" value="'+(n.protein==null?'':n.protein)+'"></div><div class="nut-field"><label>Carbs (g, optional)</label><input class="nut-man-num" id="nut-man-carb" type="number" min="0" value="'+(n.carbs==null?'':n.carbs)+'"></div><div class="nut-field"><label>Fat (g, optional)</label><input class="nut-man-num" id="nut-man-fat" type="number" min="0" value="'+(n.fat==null?'':n.fat)+'"></div></div><div class="nut-sheet-actions">'+(entry?'<button class="modal-btn secondary" style="color:var(--danger)" onclick="nutDeleteEntry(\''+entry.id+'\')">Delete</button>':'<button class="modal-btn secondary" onclick="nutCloseFoodSheet()">Cancel</button>')+'<button class="modal-btn primary" onclick="nutSaveManual()">Save</button></div></div>';ov.classList.remove('hidden');nutManualToggle();}
function nutEditScale(){if(!nutEditBase||!nutPos(nutEditBase.quantity))return;const q=nutPos(document.getElementById('nut-man-qty')?.value);if(!q)return;const ratio=q/nutEditBase.quantity;[['calories','nut-man-cal'],['protein','nut-man-pro'],['carbs','nut-man-carb'],['fat','nut-man-fat']].forEach(([k,id])=>{const el=document.getElementById(id),v=nutNum(nutEditBase.nutrition[k]);if(el&&v!=null)el.value=nutRound(v*ratio,1);});}
function nutManualToggle(){const u=document.getElementById('nut-man-unknown')&&document.getElementById('nut-man-unknown').checked;document.querySelectorAll('.nut-man-num').forEach(x=>x.disabled=u);}
function nutSaveManual(){const name=(document.getElementById('nut-man-name').value||'').trim(),q=nutPos(document.getElementById('nut-man-qty').value),unknown=document.getElementById('nut-man-unknown').checked;if(!name||!q){showToast('Add a name and valid quantity');return;}const cal=nutNum(document.getElementById('nut-man-cal').value);if(!unknown&&cal==null){showToast('Add calories or choose Unknown');return;}const now=Date.now(),id=nutEditId||nutId('food-'),old=nutLog.entries[id]||{},ratio=old.quantity&&q? q/old.quantity:1;nutLog.entries[id]={id,date:old.date||getLocalDate(),meal:document.getElementById('nut-man-meal').value,name,quantity:q,measureId:old.measureId||'manual',measureLabel:(document.getElementById('nut-man-measure').value||'serving').trim(),grams:nutPos(old.grams)?nutRound(old.grams*ratio,2):null,nutrition:{calories:unknown?null:cal,protein:unknown?null:nutNum(document.getElementById('nut-man-pro').value),carbs:unknown?null:nutNum(document.getElementById('nut-man-carb').value),fat:unknown?null:nutNum(document.getElementById('nut-man-fat').value)},nutritionStatus:unknown?'unknown':'known',source:old.source||'manual',foodId:old.foodId||null,recipeId:old.recipeId||null,proteinOptionId:old.proteinOptionId||null,servings:old.servings?nutRound(old.servings*ratio,2):null,createdAt:old.createdAt||now,updatedAt:now,deletedAt:null};nutSaveLog();nutCloseFoodSheet();nutRefreshConsumers();showToast(nutEditId?'Entry updated':'Food logged');}
function nutEditEntry(id){const e=nutLog.entries[id];if(e&&!e.deletedAt)nutOpenManual(e);}
function nutDeleteEntry(id){const e=nutLog.entries[id];if(!e||!confirm('Delete this food entry?'))return;const now=Date.now();e.deletedAt=now;e.updatedAt=now;nutSaveLog();nutCloseFoodSheet();nutRefreshConsumers();showToast('Entry deleted');}
function nutOpenCustomFood(){const box=document.getElementById('nutrition-food-box'),ov=document.getElementById('nutrition-food-overlay');if(!box||!ov)return;box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutRenderFoodSheet()">←</button><div class="modal-title">Create My Food</div></div><div class="modal-body"><div class="nut-sheet-fields"><div class="nut-field full"><label>Name</label><input id="nut-custom-name" placeholder="Brand and food"></div><div class="nut-field full"><label>Label values are</label><select id="nut-custom-basis"><option value="serving">Per serving</option><option value="per100g">Per 100 g</option></select></div><div class="nut-field"><label>Serving label</label><input id="nut-custom-label" value="serving"></div><div class="nut-field"><label>Serving grams (optional)</label><input id="nut-custom-grams" type="number" min="0"></div><div class="nut-field"><label>Calories for selected basis</label><input id="nut-custom-cal" type="number" min="0"></div><div class="nut-field"><label>Protein (g)</label><input id="nut-custom-pro" type="number" min="0"></div><div class="nut-field"><label>Carbs (g)</label><input id="nut-custom-carb" type="number" min="0"></div><div class="nut-field"><label>Fat (g)</label><input id="nut-custom-fat" type="number" min="0"></div></div><div class="nut-sheet-actions"><button class="modal-btn secondary" onclick="nutCloseFoodSheet()">Cancel</button><button class="modal-btn primary" onclick="nutSaveCustomFood()">Save food</button></div></div>';ov.classList.remove('hidden');}
function nutSaveCustomFood(){const name=(document.getElementById('nut-custom-name').value||'').trim(),cal=nutNum(document.getElementById('nut-custom-cal').value),basis=document.getElementById('nut-custom-basis').value;if(!name||cal==null){showToast('Add a name and valid calories');return;}if(Object.values(nutMyFoods.foods).some(f=>!f.deletedAt&&f.name.toLowerCase()===name.toLowerCase())){showToast('A My Food with that name already exists');return;}const now=Date.now(),id=nutId('myfood-');nutMyFoods.foods[id]={id,name,aliases:[],category:'My Foods',basis:basis==='per100g'?'per100g':'serving',servingLabel:(document.getElementById('nut-custom-label').value||'serving').trim(),servingGrams:nutPos(document.getElementById('nut-custom-grams').value),nutrition:{calories:cal,protein:nutNum(document.getElementById('nut-custom-pro').value),carbs:nutNum(document.getElementById('nut-custom-carb').value),fat:nutNum(document.getElementById('nut-custom-fat').value)},source:'nutrition label',createdAt:now,updatedAt:now,deletedAt:null};nutSaveFoods();nutSelected=Object.assign({kind:'custom'},nutMyFoods.foods[id]);nutRenderQuantity();}
function nutCopyPreviousMeal(meal,date){const src=nutEntries(date).filter(e=>e.meal===meal);if(!src.length)return;const now=Date.now();src.forEach((e,i)=>{const id=nutId('food-');nutLog.entries[id]=Object.assign({},JSON.parse(JSON.stringify(e)),{id,date:getLocalDate(),createdAt:now+i,updatedAt:now+i,deletedAt:null});});nutSaveLog();nutRefreshConsumers();showToast('Copied '+src.length+' item'+(src.length===1?'':'s'));}
function nutManageCustomFood(id){const f=nutMyFoods.foods[id],box=document.getElementById('nutrition-food-box'),ov=document.getElementById('nutrition-food-overlay');if(!f||f.deletedAt||!box||!ov)return;box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutCloseFoodSheet()">←</button><div class="modal-title">Manage My Food</div></div><div class="modal-body"><div class="nut-sheet-fields"><div class="nut-field full"><label>Name</label><input id="nut-mf-name" value="'+nutEsc(f.name)+'"></div><div class="nut-field full"><label>Label values are</label><select id="nut-mf-basis"><option value="serving"'+(f.basis==='per100g'?'':' selected')+'>Per serving</option><option value="per100g"'+(f.basis==='per100g'?' selected':'')+'>Per 100 g</option></select></div><div class="nut-field"><label>Serving label</label><input id="nut-mf-label" value="'+nutEsc(f.servingLabel||'serving')+'"></div><div class="nut-field"><label>Serving grams (optional)</label><input id="nut-mf-grams" type="number" min="0" value="'+(f.servingGrams==null?'':f.servingGrams)+'"></div><div class="nut-field"><label>Calories for selected basis</label><input id="nut-mf-cal" type="number" min="0" value="'+f.nutrition.calories+'"></div><div class="nut-field"><label>Protein</label><input id="nut-mf-pro" type="number" min="0" value="'+(f.nutrition.protein==null?'':f.nutrition.protein)+'"></div><div class="nut-field"><label>Carbs</label><input id="nut-mf-carb" type="number" min="0" value="'+(f.nutrition.carbs==null?'':f.nutrition.carbs)+'"></div><div class="nut-field"><label>Fat</label><input id="nut-mf-fat" type="number" min="0" value="'+(f.nutrition.fat==null?'':f.nutrition.fat)+'"></div></div><div class="nut-inline-actions"><button class="nut-small-btn" onclick="nutToggleFavourite(\''+id+'\')">'+(nutPrefs.favourites[id]?'★ Favourite':'☆ Add favourite')+'</button></div><div class="nut-sheet-actions"><button class="modal-btn secondary" style="color:var(--danger)" onclick="nutDeleteCustomFood(\''+id+'\')">Delete</button><button class="modal-btn primary" onclick="nutUpdateCustomFood(\''+id+'\')">Save</button></div></div>';ov.classList.remove('hidden');}
function nutUpdateCustomFood(id){const f=nutMyFoods.foods[id],name=(document.getElementById('nut-mf-name').value||'').trim(),cal=nutNum(document.getElementById('nut-mf-cal').value);if(!f||!name||cal==null){showToast('Add a name and valid calories');return;}if(Object.values(nutMyFoods.foods).some(x=>x.id!==id&&!x.deletedAt&&x.name.toLowerCase()===name.toLowerCase())){showToast('A My Food with that name already exists');return;}f.name=name;f.basis=document.getElementById('nut-mf-basis').value==='per100g'?'per100g':'serving';f.servingLabel=(document.getElementById('nut-mf-label').value||'serving').trim();f.servingGrams=nutPos(document.getElementById('nut-mf-grams').value);f.nutrition={calories:cal,protein:nutNum(document.getElementById('nut-mf-pro').value),carbs:nutNum(document.getElementById('nut-mf-carb').value),fat:nutNum(document.getElementById('nut-mf-fat').value)};f.updatedAt=Date.now();nutSaveFoods();nutCloseFoodSheet();nutRenderFoods();showToast('My Food updated');}
function nutDeleteCustomFood(id){const f=nutMyFoods.foods[id];if(!f||!confirm('Delete “'+f.name+'” from My Foods?\n\nPast food-log entries keep their saved snapshot.'))return;f.deletedAt=Date.now();f.updatedAt=f.deletedAt;delete nutPrefs.favourites[id];nutSaveFoods();nutSavePrefs();nutCloseFoodSheet();nutRenderFoods();showToast('My Food deleted');}
function nutCanon(v){return String(v||'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim();}
function nutExactFood(name){const n=nutCanon(name),built=NUT_CATALOG.find(f=>nutCanon(f.name)===n||(f.aliases||[]).some(a=>nutCanon(a)===n));if(built)return Object.assign({kind:'catalog'},built);const mine=Object.values(nutMyFoods.foods).find(f=>!f.deletedAt&&(nutCanon(f.name)===n||(f.aliases||[]).some(a=>nutCanon(a)===n)));return mine?Object.assign({kind:'custom'},mine):null;}
function nutIngResolve(ing,food){
  food=food||nutFoodById(ing.foodId);if(!food)return {food:null,grams:null,reason:'No exact food match'};const amount=nutPos(ing.amount);if(!amount)return {food,grams:null,reason:'Quantity needs review'};
  if(nutPos(ing.resolvedGrams))return {food,grams:nutPos(ing.resolvedGrams),reason:'Saved gram resolution'};
  const unit=String(ing.unit||'').trim().toLowerCase();let grams=null,measureId=null;
  if(/^g(?:\s|$)/.test(unit)){grams=amount;measureId='g';}else if(unit==='kg'){grams=amount*1000;measureId='g';}else{const pack=unit.match(/^x\s*(\d+(?:\.\d+)?)\s*g$/);if(pack){grams=amount*Number(pack[1]);measureId='g';}}
  const measures=food.kind==='custom'?[{id:'serve',label:food.servingLabel||'serving',grams:nutPos(food.servingGrams)}]:(food.measures||[]);
  if(grams==null){const want={tbsp:'tablespoon',tsp:'teaspoon',cups:'cup',slices:'slice',cloves:'clove',pieces:'piece',medium:'medium'}[unit]||unit;const usable=measures.filter(m=>m.id!=='g'&&nutPos(m.grams));let m=want?usable.find(x=>nutCanon(x.label).includes(nutCanon(want))):null;if(!want&&usable.length===1)m=usable[0];if(m){grams=amount*m.grams;measureId=m.id;}}
  return {food,grams,measureId,reason:grams==null?'Measure needs review':'Exact match · '+nutRound(grams,1)+' g'};
}
function nutRecipeAudit(r,includeSuggestions){
  const rows=(r.ingredients||[]).map((ing,index)=>{const linked=nutFoodById(ing.foodId),suggested=linked||nutExactFood(ing.name),res=nutIngResolve(ing,suggested);return {index,ing,linked,suggested,res,confirmed:!!linked};});
  const totals={calories:0,protein:0,carbs:0,fat:0};let unresolved=0,resolved=0;
  rows.forEach(row=>{if(!row.confirmed||!row.res.grams){unresolved++;return;}const f=row.res.food,base=f.kind==='custom'?(f.basis==='per100g'?f.nutrition:(f.servingGrams?Object.fromEntries(Object.entries(f.nutrition).map(([k,v])=>[k,nutNum(v)==null?null:v*100/f.servingGrams])):null)):f.per100;if(!base||nutNum(base.calories)==null){unresolved++;return;}resolved++;Object.keys(totals).forEach(k=>{const v=nutNum(base[k]);if(v==null)totals[k]=null;else if(totals[k]!=null)totals[k]+=v*row.res.grams/100;});});
  const servings=Math.max(1,parseInt(r.servings)||1),per={};Object.keys(totals).forEach(k=>per[k]=totals[k]==null?null:nutRound(totals[k]/servings,1));return {rows,resolved,unresolved,complete:rows.length>0&&unresolved===0,whole:totals,per};
}
function nutVariantAudits(r){if(typeof kitOptionsOf!=='function')return [];return kitOptionsOf(r).map(o=>({option:o,audit:nutRecipeAudit({ingredients:[...(r.ingredients||[]),o.ingredient,...(o.extras||[])].filter(Boolean),servings:r.servings})}));}
function nutLinkExact(ing){if(!ing||ing.foodId)return false;const food=nutExactFood(ing.name),res=food&&nutIngResolve(ing,food);if(!food||!res.grams)return false;ing.foodId=food.id;ing.measureId=res.measureId||'resolved';ing.resolvedGrams=nutRound(res.grams,2);return true;}
function nutRecipeIngredientRef(r,token){const p=String(token||'').split(':');if(p[0]==='shared')return (r.ingredients||[])[Number(p[1])]||null;if(p[0]!=='option')return null;const o=typeof kitOptionsOf==='function'?kitOptionsOf(r).find(x=>x.id===p[1]):null;if(!o)return null;if(p[2]==='ingredient')return o.ingredient||null;if(p[2]==='extra')return (o.extras||[])[Number(p[3])]||null;return null;}
function nutReviewIngredientRows(r,a,prefix){return a.rows.map(row=>{const f=row.suggested,token=prefix+row.index,action=row.linked?'<span class="nut-review-state calculated">Confirmed</span>':f&&row.res.grams?'<label class="nut-review-state"><input class="nut-link-check" type="checkbox" data-token="'+token+'" data-food="'+f.id+'"> Confirm</label>':'<button class="nut-small-btn" onclick="nutPickIngredient(\''+r.id+'\',\''+token+'\')">Choose match</button>';return '<div class="nut-review-row"><span><b>'+nutEsc(row.ing.name)+'</b><div class="nut-entry-sub">'+nutEsc(String(row.ing.amount||'')+' '+String(row.ing.unit||''))+' · '+(f?nutEsc(f.name)+' · '+row.res.reason:'No conservative match')+'</div></span>'+action+'</div>';}).join('');}
function nutPickIngredient(recipeId,token,query){const r=kitRecipes.find(x=>x.id===recipeId),ing=r&&nutRecipeIngredientRef(r,token),box=document.getElementById('nutrition-food-box'),ov=document.getElementById('nutrition-food-overlay');if(!r||!ing||!box||!ov)return;const q=query==null?String(ing.name||''):String(query),foods=nutFoodSearch(q).filter(f=>f.kind!=='recipe').slice(0,30);box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutReviewRecipe(\''+recipeId+'\')" aria-label="Back">←</button><div class="modal-title">Match ingredient</div></div><div class="modal-body"><div style="font-size:15px;font-weight:800">'+nutEsc(ing.name)+'</div><div class="nut-entry-sub" style="margin:4px 0 12px">'+nutEsc(String(ing.amount||'')+' '+String(ing.unit||''))+' · Choose the preparation and food intentionally.</div><input class="nut-search" value="'+nutEsc(q)+'" placeholder="Search foods" oninput="nutPickIngredient(\''+recipeId+'\',\''+token+'\',this.value)"><div class="nut-food-list nut-sheet-list">'+(foods.length?foods.map(f=>{const res=nutIngResolve(ing,f);return '<button class="nut-food-row" onclick="nutChooseIngredient(\''+recipeId+'\',\''+token+'\',\''+f.id+'\')"><span><b>'+nutEsc(f.name)+'</b><small>'+nutEsc(res.reason)+'</small></span><span>Choose</span></button>';}).join(''):'<div class="nut-empty">No match. Create a My Food first, or search a more specific preparation.</div>')+'</div></div>';ov.classList.remove('hidden');}
function nutChooseIngredient(recipeId,token,foodId){const r=kitRecipes.find(x=>x.id===recipeId),ing=r&&nutRecipeIngredientRef(r,token),food=nutFoodById(foodId),box=document.getElementById('nutrition-food-box');if(!r||!ing||!food||!box)return;const res=nutIngResolve(ing,food);box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutPickIngredient(\''+recipeId+'\',\''+token+'\')" aria-label="Back">←</button><div class="modal-title">Confirm match</div></div><div class="modal-body"><div class="nut-live"><b>'+nutEsc(ing.name)+' → '+nutEsc(food.name)+'</b><br>'+nutEsc(String(ing.amount||'')+' '+String(ing.unit||''))+'</div><div class="nut-field" style="margin-top:12px"><label>Resolved edible grams</label><input id="nut-link-grams" type="number" min="0.01" step="0.1" value="'+(res.grams==null?'':nutRound(res.grams,2))+'"></div><div class="nut-entry-sub" style="margin-top:8px">'+(res.grams==null?'Daily cannot safely convert this household measure. Enter grams from the pack or recipe; it will be saved with the link.':'Check the suggested gram conversion before confirming.')+'</div><div class="nut-sheet-actions"><button class="modal-btn secondary" onclick="nutPickIngredient(\''+recipeId+'\',\''+token+'\')">Back</button><button class="modal-btn primary" onclick="nutApplyIngredientLink(\''+recipeId+'\',\''+token+'\',\''+foodId+'\')">Confirm link</button></div></div>';}
function nutApplyIngredientLink(recipeId,token,foodId){const r=kitRecipes.find(x=>x.id===recipeId),ing=r&&nutRecipeIngredientRef(r,token),food=nutFoodById(foodId),grams=nutPos(document.getElementById('nut-link-grams')?.value);if(!r||!ing||!food||!grams){showToast('Enter a valid gram quantity');return;}ing.foodId=food.id;ing.measureId='resolved';ing.resolvedGrams=nutRound(grams,2);kitSaveRecipes();nutReviewRecipe(recipeId);showToast('Ingredient link confirmed');}
function nutReviewConfirmAll(id){const r=kitRecipes.find(x=>x.id===id);if(!r)return;let n=0;(r.ingredients||[]).forEach(i=>{if(nutLinkExact(i))n++;});if(typeof kitOptionsOf==='function')kitOptionsOf(r).forEach(o=>{if(nutLinkExact(o.ingredient))n++;(o.extras||[]).forEach(i=>{if(nutLinkExact(i))n++;});});kitSaveRecipes();nutReviewRecipe(id);showToast(n?n+' exact match'+(n===1?'':'es')+' confirmed':'No new exact matches with safe measures');}
function nutReviewRecipe(id){
  if(typeof kitRecipes==='undefined')return;const r=kitRecipes.find(x=>x.id===id),box=document.getElementById('nutrition-food-box'),ov=document.getElementById('nutrition-food-overlay');if(!r||!box||!ov)return;const a=nutRecipeAudit(r),variants=nutVariantAudits(r),overallComplete=variants.length?variants.every(v=>v.audit.complete):a.complete,current={calories:nutNum(r.calories),protein:nutNum(r.protein),carbs:nutNum(r.carbs),fat:nutNum(r.fat)};
  const rows=nutReviewIngredientRows(r,a,'shared:');
  const variantCompare=variants.length?'<div class="nut-section-label">Protein options</div>'+variants.map(v=>{const oa=v.audit,ingredientAudit=nutRecipeAudit({ingredients:[v.option.ingredient].filter(Boolean),servings:r.servings}),extrasAudit=nutRecipeAudit({ingredients:v.option.extras||[],servings:r.servings}),optionRows=nutReviewIngredientRows(r,ingredientAudit,'option:'+v.option.id+':ingredient:')+nutReviewIngredientRows(r,extrasAudit,'option:'+v.option.id+':extra:');return '<div class="nut-live"><b>'+nutEsc(v.option.label)+'</b><br>'+(oa.complete?'Current: '+(v.option.calories==null?'Missing':v.option.calories+' kcal')+' · Calculated: '+oa.per.calories+' kcal, '+oa.per.protein+' P, '+oa.per.carbs+' C, '+oa.per.fat+' F':'Partial — '+oa.unresolved+' unresolved')+'</div>'+optionRows;}).join(''):'';
  const calc=variants.length?variantCompare:(a.complete?'<div class="nut-live"><b>Compare per serving</b><br>Current: '+(current.calories==null?'Missing':current.calories+' kcal')+' · '+(current.protein==null?'—':current.protein+' P')+' · '+(current.carbs==null?'—':current.carbs+' C')+' · '+(current.fat==null?'—':current.fat+' F')+'<br>Calculated: '+a.per.calories+' kcal · '+a.per.protein+' P · '+a.per.carbs+' C · '+a.per.fat+' F</div>':'<div class="nut-live">Partial — '+a.unresolved+' ingredient'+(a.unresolved===1?'':'s')+' unresolved. Existing manual values remain unchanged.</div>');
  box.innerHTML='<div class="modal-header"><button class="back-btn" onclick="nutCloseFoodSheet()">←</button><div class="modal-title">Nutrition Review</div></div><div class="modal-body"><div style="font-size:16px;font-weight:800">'+nutEsc(r.name)+'</div><div class="nut-entry-sub" style="margin:4px 0 12px">'+a.resolved+' of '+a.rows.length+' shared ingredients confirmed</div><div class="nut-inline-actions"><button class="nut-small-btn" onclick="nutReviewConfirmAll(\''+id+'\')">Confirm all exact matches with safe measures</button></div><div class="nut-food-list nut-sheet-list" style="margin-top:10px">'+rows+'</div>'+calc+'<div class="nut-sheet-actions"><button class="modal-btn secondary" onclick="nutReviewApply(\''+id+'\',false)">Save confirmed links</button>'+(overallComplete?'<button class="modal-btn primary" onclick="nutReviewApply(\''+id+'\',true)">Use calculated values</button>':'')+'</div></div>';ov.classList.remove('hidden');
}
function nutReviewApply(id,useCalculated){const r=kitRecipes.find(x=>x.id===id);if(!r)return;document.querySelectorAll('.nut-link-check:checked').forEach(el=>{const ing=nutRecipeIngredientRef(r,el.dataset.token),food=nutFoodById(el.dataset.food);if(!ing||!food)return;const res=nutIngResolve(ing,food);if(res.grams){ing.foodId=food.id;ing.measureId=res.measureId||'resolved';ing.resolvedGrams=nutRound(res.grams,2);}});const a=nutRecipeAudit(r),variants=nutVariantAudits(r),complete=variants.length?variants.every(v=>v.audit.complete):a.complete;r.nutritionCalculation={status:complete?'calculated':'partial',resolvedIngredients:a.resolved,totalIngredients:a.rows.length,whole:a.whole,perServing:a.per,proteinOptions:variants.map(v=>({id:v.option.id,label:v.option.label,status:v.audit.complete?'calculated':'partial',perServing:v.audit.per,resolvedIngredients:v.audit.resolved,totalIngredients:v.audit.rows.length})),calculatedAt:Date.now(),source:NUT_CATALOG_SOURCE.dataset};if(useCalculated){if(!complete){showToast('Resolve every ingredient in every option first');nutReviewRecipe(id);return;}if(variants.length){variants.forEach(v=>{v.option.calories=v.audit.per.calories;v.option.protein=v.audit.per.protein;v.option.carbs=v.audit.per.carbs;v.option.fat=v.audit.per.fat;v.option.nutritionBasis='calculated';});r.calories=null;r.protein=null;r.carbs=null;r.fat=null;}else{r.calories=a.per.calories;r.protein=a.per.protein;r.carbs=a.per.carbs;r.fat=a.per.fat;}r.nutritionBasis='calculated';}else if(!complete)r.nutritionBasis='partial';else if(r.nutritionBasis!=='calculated')r.nutritionBasis=(variants.length?variants.some(v=>nutNum(v.option.calories)!=null):nutNum(r.calories)!=null)?'manual':'missing';kitSaveRecipes();nutRenderRecipes();nutReviewRecipe(id);showToast(useCalculated?'Calculated nutrition accepted':'Confirmed links saved; manual values preserved');}
function nutLogRecipeSnapshot(r,rv,servings,meal,source){const now=Date.now(),n=rv&&rv.nutrition||{},known=nutNum(n.calories)!=null,id=nutId('food-');nutLog.entries[id]={id,date:getLocalDate(),meal,name:r.name+(rv.optionLabel?' · '+rv.optionLabel:''),quantity:servings,measureId:'serving',measureLabel:'serving',grams:null,nutrition:{calories:known?nutRound(n.calories*servings,1):null,protein:nutNum(n.protein)==null?null:nutRound(n.protein*servings,1),carbs:nutNum(n.carbs)==null?null:nutRound(n.carbs*servings,1),fat:nutNum(n.fat)==null?null:nutRound(n.fat*servings,1)},nutritionStatus:known?'known':'unknown',source:source||'recipe',foodId:null,recipeId:r.id,proteinOptionId:rv.optionId||null,servings,createdAt:now,updatedAt:now,deletedAt:null};nutSaveLog();nutRefreshConsumers();return id;}
