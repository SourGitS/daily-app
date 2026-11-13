const test=require('node:test'),assert=require('node:assert/strict');
const {jrnPlannerDate,jrnPlannerAdd,jrnPlannerModel}=require('../js/journal-planner.js');
const model=extra=>jrnPlannerModel({month:'2026-11',selected:'2026-11-13',today:'2026-11-13',notes:[],bills:[],...extra});
test('planner validates real calendar dates and moves across DST and month boundaries',()=>{
 for(const d of ['2026-11-13','2024-02-29'])assert.equal(jrnPlannerDate(d),true);
 for(const d of ['2026-02-29','2026-02-31','2026-13-01','bad','2026-1-2'])assert.equal(jrnPlannerDate(d),false);
 assert.equal(jrnPlannerAdd('2026-10-04',1),'2026-10-05');assert.equal(jrnPlannerAdd('2026-12-31',1),'2027-01-01');
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
