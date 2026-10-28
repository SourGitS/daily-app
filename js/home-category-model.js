// Pure presentation models. Never write or infer missing records as zero.
const CATEGORY_HOME_CARDS=[
 {id:'training',label:'Training',span:7,icon:'target'}, {id:'budget',label:'Budget',span:5,icon:'wallet'},
 {id:'weather',label:'Weather',span:5,icon:'cloud'}, {id:'activity',label:'Last 7 days',span:12,icon:'calendar'},
 {id:'habits',label:'Daily habits',span:3,icon:'check'}, {id:'shopping',label:'Shopping',span:3,icon:'cart'},
 {id:'weight',label:'Weight',span:3,icon:'scale'}, {id:'records',label:'Personal best',span:3,icon:'trophy'},
 {id:'food',label:'Food',span:6,icon:'pot'}, {id:'stats',label:'Stats',span:6,icon:'trend'},
 {id:'journal',label:'Journal',span:6,icon:'note'}, {id:'review',label:'Weekly review',span:6,icon:'calendar'}
];
function categoryProfile(value,mode){
 let v=value;try{if(typeof v==='string')v=JSON.parse(v);}catch(e){v=null;}v=v&&typeof v==='object'?v:{};
 const ids=CATEGORY_HOME_CARDS.map(c=>c.id),valid=new Set(ids),defaults=mode==='mobile'?['training','budget','weather','activity','food','stats','habits','shopping','weight','records','review','journal']:ids;
 const unique=a=>[...new Set((Array.isArray(a)?a:[]).filter(id=>valid.has(id)))];
 const order=unique(v.order);defaults.forEach(id=>{if(!order.includes(id))order.push(id);});
 // New Home is the read-time default; an explicit legacy choice remains authoritative.
 // Do not stamp or persist this fallback while cloud preferences are still loading.
 return {schemaVersion:1,enabled:v.enabled!==false,order,hidden:unique(v.hidden)};
}
function categoryVisible(profile,mode='desktop'){
 const ids=profile.order.filter(id=>!profile.hidden.includes(id));
 return mode!=='mobile'&&ids.includes('training')&&ids.includes('budget')?ids.filter(id=>id!=='budget'):ids;
}
function categoryCells(ids,mode){
 const out={},mobile=mode==='mobile',limit=mobile?2:12;let row=[],used=0,index=1;
 function flush(){if(!row.length)return;const free=limit-used;row.forEach((c,i)=>out[c.id]={span:c.span+Math.floor(free/row.length)+(i<free%row.length?1:0),row:index});index++;row=[];used=0;}
 ids.forEach(id=>{const def=CATEGORY_HOME_CARDS.find(c=>c.id===id);if(!def)return;const span=mobile?(['shopping','weight'].includes(id)?1:2):def.span;if(used+span>limit)flush();row.push({id,span});used+=span;});flush();return out;
}
function categoryPaceModel({dates,today,weekly,transactions,habitLog,habitCount}){
 const validDone=a=>new Set((Array.isArray(a)?a:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<habitCount)).size;
 return dates.map(date=>{
  const d=new Date(date+'T12:00:00'),day=(d.getDay()+6)%7,monday=new Date(d);monday.setDate(d.getDate()-day);
  const key=monday.getFullYear()+'-'+String(monday.getMonth()+1).padStart(2,'0')+'-'+String(monday.getDate()).padStart(2,'0'),w=weekly[key];
  const entries=(transactions||[]).filter(t=>t&&t.date>=key&&t.date<=date);
  const hasDay=entries.some(t=>t.date===date),invalid=entries.some(t=>t.amount===null||t.amount===undefined||t.amount===''||!Number.isFinite(Number(t.amount))||Number(t.amount)<0);
  const spent=entries.reduce((n,t)=>n+(Number(t.amount)||0),0),target=w&&Number(w.goal);
  const state=date>today?'future':!w||!Number.isFinite(target)||target<=0?'no-target':w.incomplete||invalid?'unknown':!hasDay?'no-entries':spent<=target*(day+1)/7+.005?'on':'over';
  return {date,state,spent,target:target>0?target:null,allowance:target>0?target*(day+1)/7:null,habits:date>today||!Object.prototype.hasOwnProperty.call(habitLog||{},date)?null:validDone(habitLog[date]),habitCount};
 });
}
function categoryMealModel(summary,meals){
 return meals.map(([id,label])=>{const entries=(summary.entries||[]).filter(e=>e.meal===id),known=entries.filter(e=>e.nutritionStatus==='known'&&Number.isFinite(e.nutrition?.calories)),unknown=entries.length-known.length;
  return {id,label,count:entries.length,unknown,calories:known.length?known.reduce((n,e)=>n+e.nutrition.calories,0):null};});
}
function categoryStatsComparison(rows,topic,unit){
 if(!rows.length)return 'Add your first record to start a comparison.';
 if(rows.length===1)return 'First reading saved · another will show the change.';
 const first=topic==='consistency'?rows.at(-2):rows[0],last=rows.at(-1),delta=Math.round((last.value-first.value)*100)/100;
 if(topic==='consistency')return delta===0?'Same recorded training days as the previous week':Math.abs(delta)+' '+(Math.abs(delta)===1?'more day':'more days').replace('more',delta>0?'more':'fewer')+' with workouts than the previous week';
 const count=rows.length+' '+(topic==='weight'?'weigh-ins':'recorded sessions');
 return (delta===0?'No change':(delta>0?'+':'')+delta+' '+unit.split(' × ')[0])+' across '+count;
}
if(typeof module!=='undefined'&&module.exports)module.exports={CATEGORY_HOME_CARDS,categoryProfile,categoryVisible,categoryCells,categoryPaceModel,categoryMealModel,categoryStatsComparison};
