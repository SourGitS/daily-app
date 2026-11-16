const test=require('node:test'),assert=require('node:assert/strict');
const {jrnPlannerDate,jrnPlannerAdd,jrnPlannerWeekRange,jrnPlannerModel,jrnPlannerWorkout}=require('../js/journal-planner.js');
const model=extra=>jrnPlannerModel({month:'2026-11',selected:'2026-11-13',today:'2026-11-13',notes:[],bills:[],...extra});
test('planner validates real calendar dates and moves across DST and month boundaries',()=>{
 for(const d of ['2026-11-13','2024-02-29'])assert.equal(jrnPlannerDate(d),true);
 for(const d of ['2026-02-29','2026-02-31','2026-13-01','bad','2026-1-2'])assert.equal(jrnPlannerDate(d),false);
 assert.equal(jrnPlannerAdd('2026-10-04',1),'2026-10-05');assert.equal(jrnPlannerAdd('2026-12-31',1),'2027-01-01');
});
test('Planner weeks run Monday through Sunday across months, years and DST',()=>{
 for(const day of ['2026-12-28','2026-12-31','2027-01-03']){
  assert.deepEqual(jrnPlannerWeekRange(day),{start:'2026-12-28',end:'2027-01-03'});
 }
 assert.deepEqual(jrnPlannerWeekRange('2026-10-04'),{start:'2026-09-28',end:'2026-10-04'});
});
test('calendar keeps completed actions on their date and searches by the original priority',()=>{
 const tasks=[{id:'one',title:'Ring the shop',date:'2026-11-13',done:false,source:{text:'Fix the bike'}},
  {id:'two',title:'Replace tyre',date:'2026-11-13',done:true,source:{text:'Fix the bike'}}];
 const m=model({tasks,filter:'note',query:'bike'});
 assert.deepEqual(m.selectedEvents.map(e=>e.title),['Replace tyre','Ring the shop']);
 assert.deepEqual(m.upcoming.map(e=>e.id),['one']);
 assert.equal(model({tasks,filter:'entry'}).events.length,0);
 assert.equal(model({tasks,filter:'bill'}).events.length,0);
});
test('planner places entries by their day and notes by due date, without deleting expired notes',()=>{
 const notes=[{id:'e',kind:'entry',dateAbout:'2026-11-13',title:'Day'},
  {id:'n',kind:'note',dateType:'reminder',dueDate:'2026-11-13',title:'Task'},
  {id:'x',kind:'note',dateType:'expiry',dueDate:'2026-11-12',title:'Expired'},
  {id:'d',kind:'note',dateType:'reminder',dueDate:'2026-11-13',title:'Deleted',deletedAt:1},
  {id:'u',kind:'note',dateType:'none',dueDate:'2026-11-13',title:'Undated'}],before=JSON.stringify(notes);
 const m=model({notes});assert.deepEqual(m.selectedEvents.map(e=>e.id),['e','n']);assert.deepEqual(m.overdue.map(e=>e.id),['x']);
 assert.equal(m.overdue[0].detail,'Expiry');assert.equal(JSON.stringify(notes),before);
});
test('scheduled bills stay separate from recorded journal items and are never labelled paid or overdue',()=>{
 const bills=[{key:'2026-11-13',name:'Rent',amount:500},{key:'2026-11-13',name:'Card',kind:'statement',amount:0}],before=JSON.stringify(bills);
 const m=model({bills});assert.equal(m.selectedEvents.length,2);assert.equal(m.selectedEvents.find(e=>e.title==='Card').amount,null);
 assert.equal(m.overdue.length,0);assert.ok(m.events.every(e=>e.kind==='bill'&&!('paid' in e)));assert.equal(JSON.stringify(bills),before);
});
test('calendar filters and search preserve the source records',()=>{
 const notes=[{id:'e',kind:'entry',dateAbout:'2026-11-13',body:'Morning walk'},
  {id:'n',kind:'note',dateType:'reminder',dueDate:'2026-11-13',title:'Call',tags:['work']}],bills=[{key:'2026-11-13',name:'Rent',amount:500}];
 assert.equal(model({notes,bills,filter:'entry'}).events.length,1);assert.equal(model({notes,bills,filter:'bill'}).events[0].title,'Rent');
 assert.equal(model({notes,bills,query:'WORK'}).events[0].id,'n');assert.equal(model({notes,bills,query:'walk'}).events[0].id,'e');
});
test('Next up groups dated actions across year end, while the full day keeps every entry and note',()=>{
 const today='2026-12-31',notes=[
  {kind:'entry',id:'entry',dateAbout:today,title:'My day'},
  ...[['later','2027-01-06'],['overdue','2026-12-30'],['today note',today],['outside','2027-01-07']].map(([title,dueDate])=>({kind:'note',dateType:'reminder',title,id:title,dueDate}))
 ];
 const bills=[
  {key:'2027-01-01',kind:'charge',name:'Internet',amount:0,cat:{dueDate:'2026-01-01'}},
  {key:'2027-01-02',kind:'charge',name:'Missing price',amount:null},
  {key:'2027-01-01',kind:'charge',name:'Invalid schedule anchor',cat:{dueDate:'2026-11-31'}}
 ];
 const workout=jrnPlannerWorkout(today,{state:'ready',dayName:'Full body A',exCount:1},false);
 const m=model({month:'2026-12',selected:today,today,notes,bills,workout});
 assert.deepEqual(m.upcoming.map(e=>e.title),['Full body A','today note','Internet','Missing price','later']);
 assert.deepEqual(m.selectedEvents.map(e=>e.title),['Full body A','My day','today note']);
 assert.deepEqual(m.overdue.map(e=>e.title),['overdue']);
 assert.equal(m.upcoming[2].amount,0);assert.equal(m.upcoming[3].amount,null);
 assert.deepEqual(model({today,notes,bills,workout,query:'InterNet'}).upcoming.map(e=>e.title),['Internet']);
 assert.deepEqual(model({today,notes,bills,workout,filter:'note'}).upcoming.map(e=>e.title),['today note','later']);
});
test('Next up uses the actionable workout and never advances to the next rotation after a save',()=>{
 const day='2026-12-31',read=(brief,resumable=false)=>jrnPlannerWorkout(day,{dayName:'Loaded day',nextName:'Future day',...brief},resumable);
 assert.equal(read({state:'empty'}),null);
 assert.equal(read({state:'ready',exCount:1}).detail,'Next in your training rotation · 1 exercise');
 assert.equal(read({state:'inprogress'}).action,'Continue');
 assert.equal(read({state:'saved',completed:true},true),null);
 assert.equal(read({state:'saved',completed:false}),null);
 assert.equal(read({state:'saved',completed:false},true).title,'Loaded day');
 assert.equal(read({state:'saved',completed:false},true).action,'Continue');
});
test('calendar reads the next month’s bills at year end and follows midnight only while showing Today',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 let today='2026-12-31';
 const localMidnight=s=>new Date(s+'T00:00:00'),billDate='2027-01-02';
 const c=vm.createContext({
  getLocalDate:()=>today,localMidnight,jrnLive:()=>[],jrnQuery:'',
  auth:{currentUser:{uid:'sample'}},navigator:{onLine:true},_cloudReadFailed:false,_cloudWorkoutReady:false,
  logTodayBrief:()=>({state:'ready',dayName:'Rotation A',exCount:1}),renderJournal:()=>{},
  billOccurrences:(start,end)=>localMidnight(billDate)>=start&&localMidnight(billDate)<=end?[{key:billDate,name:'Internet',amount:65}]:[]
 });
 vm.runInContext(fs.readFileSync(require.resolve('../js/journal-planner.js'),'utf8'),c);
 assert.equal(c.jrnPlannerRead().upcoming[0].title,'Internet');
 c._cloudWorkoutReady=true;
 const m=c.jrnPlannerRead();assert.equal(m.selected,today);assert.equal(m.upcoming[0].title,'Rotation A');assert.equal(m.upcoming[1].title,'Internet');
 today='2027-01-01';assert.equal(c.jrnPlannerRead().selected,today);
 c.jrnPlannerPick('2026-12-15');today='2027-01-02';
 assert.equal(c.jrnPlannerRead().selected,'2026-12-15');
});
