// Isolated sample records, injected inside sync-browser-fixture.js by the phone test server.

if(params.has('home-cards')){
 const day=new Date(),today=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
 const mon=new Date(day);mon.setDate(day.getDate()-((day.getDay()+6)%7));
 const fmt=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const week=fmt(mon),end=new Date(mon);end.setDate(mon.getDate()+6);const endDate=fmt(end),blob=v=>({v:JSON.stringify(v),t:500});
 const exercises=['Squat','Bench press','Romanian deadlift','Lat pulldown','Cable row','Lateral raise'].map(name=>({name,sets:3}));
 const split={types:[{id:'sample-fullbody',name:'Full body A',colorKey:'legs',exercises}],schedule:[0]};
 stores.categoryHomeMobile=blob({enabled:true});stores.categoryHomeDesktop=blob({enabled:true});stores.trainingSplit=blob(split);stores.exerciseLib=blob(exercises.map((e,i)=>({id:'sample-'+i,name:e.name,custom:true,muscle:'legs'})));
 stores.plans=blob({plans:[{id:'sample-plan',name:'Sample full-body split',split}],activePlanId:'sample-plan',streak:{count:0,lastDate:''}});
 stores.profile={...stores.profile,name:'Francois',budgetRhythmSeen:2,homeCustomiseSeen:1};
 stores.sessions=Object.fromEntries([2,4].map((ago,i)=>{const date=new Date(day);date.setDate(day.getDate()-ago);return ['sample-'+i,{id:'sample-'+i,date:fmt(date),sessionType:'Full body A',dayNum:1,completed:true,exercises:[{name:'Squat',sets:[{weight:60,reps:8}]}]}]}));
 stores.budgetIncCats=blob([{id:'sample-pay',name:'Sample income',payCycle:'weekly',payDate:week,payAmount:1450}]);stores.budgetFixCats=blob([]);
 stores.budgetCycles=blob({config:{frequency:'weekly',anchor:week},periods:{[week+'_'+endDate]:{start:week,end:endDate,opening:0,savings:150,goal:450,reserves:{},fundingConfirmed:true}}});
 stores.accounts=blob([{id:'sample-everyday',name:'Everyday — sample',type:'asset',category:'cash',current:1200,history:[]},{id:'sample-card',name:'Credit card — sample',type:'debt',category:'card',current:400,history:[]}]);
 stores.budgetData={};stores.ledger=blob([{id:'sample-income',kind:'income',date:today,amount:1450,streamId:'sample-pay',manual:true,weekMode:'add'}]);
 stores.transactions=blob([{id:'sample-food',date:today,amount:76,catId:'food',acctId:'sample-everyday',merchant:'Sample groceries'},{id:'sample-travel',date:today,amount:34,catId:'travel',merchant:'Sample travel'}]);
 const midday=new Date(day.getFullYear(),day.getMonth(),day.getDate(),12).getTime();
 localStorage.setItem('daily_weather_cache',JSON.stringify({city:'Sydney',placeholder:true,lat:-33.8688,lon:151.2093,tempC:22,feelsC:20,tmax:22,tmin:14,code:1,isDay:1,sunrise:midday-6*3600000,sunset:midday+7*3600000,timezone:'Australia/Sydney',utcOffsetSeconds:39600,fetchedAt:Date.now(),observedAt:Date.now(),
 daily:Array.from({length:7},(_,i)=>({time:midday+i*86400000,tempMax:[22,22,21,22,26,28,22][i],tempMin:[14,15,17,17,17,18,15][i],code:[1,3,61,2,1,0,3][i],rainProbability:[10,20,65,30,5,5,15][i]})),
 hourly:Array.from({length:6},(_,i)=>({time:Date.now()+(i+1)*3600000,tempC:22-i,code:1,isDay:1,rainProbability:10,precipitation:0}))}));
}

if(params.has('home-cards')){
 stores.weights=Object.fromEntries(Object.values(stores.weights||{}).map(w=>[w.date.replaceAll('-',''),w]));
 const day=new Date(),fmt=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),today=fmt(day),blob=v=>({v:JSON.stringify(v),t:500}),scenario=params.get('scenario');
 stores.habits=['Take a walk','Read for 10 minutes','Stretch','Drink water','Plan tomorrow','Wind down'];
 const habits={};for(let i=0;i<7;i++){const d=new Date(day);d.setDate(day.getDate()-i);habits[fmt(d)]=Array.from({length:[2,5,6,3,4,6,3][i]},(_,n)=>n);}stores.habitsLog=blob(habits);
 stores.nutritionLog={schemaVersion:1,entries:Object.fromEntries([['breakfast',480],['lunch',1040]].map(([meal,calories],i)=>[meal,{id:meal,date:today,meal,name:'Sample '+meal,quantity:1,measureLabel:'serving',nutritionStatus:'known',nutrition:{calories},createdAt:i+1,updatedAt:500}])),legacyTotals:{}};
 if(scenario==='empty'){stores.sessions={};stores.weights={};stores.notes={schemaVersion:1,records:{}};stores.habits=[];stores.habitsLog=blob({});stores.nutritionLog={schemaVersion:1,entries:{},legacyTotals:{}};stores.budgetData={};stores.budgetDefaults={};stores.transactions=blob([]);stores.ledger=blob([]);stores.budgetCycles=blob({config:null,periods:{}});}
 if(scenario==='long'){const s=JSON.parse(stores.trainingSplit.v);s.types[0].name='Full body strength and mobility — extended recovery session';s.types[0].exercises[0].name='Single-leg Romanian deadlift with controlled tempo and a pause';stores.trainingSplit=blob(s);const p=JSON.parse(stores.plans.v);p.plans[0].split=s;stores.plans=blob(p);stores.habits[0]='Go for an evening walk and take a moment to reflect on the day';stores.nutritionLog.entries.lunch.nutritionStatus='unknown';stores.nutritionLog.entries.lunch.nutrition={};}
 if(scenario==='hidden'){stores.categoryHomeMobile=blob({enabled:true,hidden:['training','weather','food','habits']});stores.categoryHomeDesktop=blob({enabled:true,hidden:['training','weather','food','habits']});}
 if(scenario==='reordered'){const p={enabled:true,order:['journal','shopping','stats','weight','activity','weather','food','records','training','budget','habits','review']};stores.categoryHomeMobile=blob(p);stores.categoryHomeDesktop=blob(p);}
 if(scenario==='legacy'){stores.categoryHomeMobile=blob({enabled:false});stores.categoryHomeDesktop=blob({enabled:false});}
 if(scenario==='default'){delete stores.categoryHomeMobile;delete stores.categoryHomeDesktop;}
}

if(params.has('home-cards')&&(!params.get('scenario')||params.get('scenario')==='everyday')){delete stores.categoryHomeMobile;delete stores.categoryHomeDesktop;}
