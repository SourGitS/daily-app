if(params.has('planner-review')){
 const day=new Date(),fmt=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),date=n=>{const d=new Date(day);d.setDate(d.getDate()+n);return fmt(d);},blob=v=>({v:JSON.stringify(v),t:500});
 const habits={},txns=[],weeks={};
 for(let i=6;i>=0;i--){const ds=date(-i),d=new Date(ds+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));weeks[fmt(d)]={var_goal:350};if(i!==3)habits[ds]=Array.from({length:[2,6,0,3,6,4,6][i]},(_,n)=>n);txns.push({id:'review-'+i,date:ds,amount:i===6?350:i===4?100:i===2?150:10,catId:'food',merchant:'Sample spending'});}
 stores.habitsLog=blob(habits);stores.budgetData=weeks;stores.transactions=blob(txns);
 stores.budgetFixCats=blob([{id:'review-internet',name:'Internet — sample',amount:65,cycle:'monthly',chargeType:'bill',dueDate:date(2)}]);
 const note=(id,title,kind,ds,dateType)=>({id,title,kind,body:kind==='entry'?'A little time outside helped today.':'A sample plan for the calendar.',schemaVersion:2,dateAbout:kind==='entry'?ds:'',dueDate:kind==='note'?ds:'',dateType:dateType||'none',tags:[],createdAt:1794500000000,updatedAt:1794500000000});
 stores.notes={day:note('review-day','A slower morning','entry',date(0)),call:note('review-call','Call about the bike service','note',date(0),'reminder'),plan:note('review-plan','Plan the coming week','note',date(3),'reminder'),expiry:note('review-expiry','Review a saved offer','note',date(-1),'expiry')};
 const groups=['chest','back','shoulders','arms','quads','hamstrings','calves','glutes','lower back','forearms','core','other'];
 stores.exerciseLib=blob(Array.from({length:60},(_,i)=>({id:'review-move-'+i,name:groups[i%groups.length]+' movement '+(Math.floor(i/groups.length)+1),muscle:groups[i%groups.length],custom:true})));
}
