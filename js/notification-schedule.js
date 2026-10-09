'use strict';
(function(root){
  const channels=['workout','budget','workoutPrompt','budgetPrompt','weeklyReport'];
  const routes={workout:'log',workoutPrompt:'log',budget:'budget',budgetPrompt:'budget',weeklyReport:'stats'};
  const words={
    workout:['Time for your workout. Open today’s plan.','Make a little time to train today.','Your next session is ready when you are.'],
    budget:['Take a moment to update your budget.','A quick money check-in can help you plan ahead.','Keep your spending record up to date.'],
    weeklyReport:['See how your week went in Daily.','Take a moment to review your week.','Your weekly review is ready to explore.']
  };
  function time(v,fallback){return /^([01]\d|2[0-3]):[0-5]\d$/.test(v||'')?v:fallback;}
  function normalise(raw){
    raw=raw&&typeof raw==='object'?raw:{};
    const out={quiet:{enabled:raw.quiet?.enabled===true,start:time(raw.quiet?.start,'22:00'),end:time(raw.quiet?.end,'07:00')}};
    channels.forEach(k=>{
      const r=raw[k]||{}, budget=k==='budget', weekly=k==='weeklyReport';
      const days=Array.isArray(r.days)?[...new Set(r.days.filter(d=>Number.isInteger(d)&&d>=0&&d<7))]:budget?[Number.isInteger(r.day)&&r.day>=0&&r.day<7?r.day:0]:weekly?[0]:[0,1,2,3,4,5,6];
      out[k]={enabled:r.enabled===true,time:time(r.time,budget?'20:00':weekly?'18:00':'07:00'),days,frequency:[1,2,3,7].includes(r.frequency)?r.frequency:weekly?7:1};
    });
    return out;
  }
  function clock(now,zone){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const p=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    const date=p.year+'-'+p.month+'-'+p.day, day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
    return {date,day,weekday:new Date(date+'T12:00:00Z').getUTCDay(),minutes:Number(p.hour)*60+Number(p.minute)};
  }
  function minutes(t){return Number(t.slice(0,2))*60+Number(t.slice(3));}
  function quiet(c,q){
    if(!q.enabled)return false;
    const a=minutes(q.start),b=minutes(q.end);
    return a===b|| (a<b?c.minutes>=a&&c.minutes<b:c.minutes>=a||c.minutes<b);
  }
  function due(raw,now,zone,sessions,last){
    const r=normalise(raw),c=clock(now,zone);
    if(quiet(c,r.quiet))return [];
    const trained=Object.values(sessions||{}).some(s=>s&&!s.deletedAt&&s.date===c.date);
    return channels.filter(k=>{
      const v=r[k],elapsed=c.minutes-minutes(v.time),previous=last?.[k];
      // A short catch-up window avoids a flood when a phone or scheduler resumes hours later.
      if(!v.enabled||!v.days.includes(c.weekday)||elapsed<0||elapsed>=15)return false;
      if((k==='workout'||k==='workoutPrompt')&&trained)return false;
      if(previous&&c.day-previous.day<v.frequency)return false;
      if(k==='workoutPrompt'&&r.workout.enabled&&r.workout.days.includes(c.weekday))return false;
      if(k==='budgetPrompt'&&r.budget.enabled&&r.budget.days.includes(c.weekday))return false;
      return true;
    }).map(k=>({channel:k,id:k+'_'+c.date,date:c.date,day:c.day,route:routes[k]}));
  }
  function message(event){
    const kind=event.channel.startsWith('workout')?'workout':event.channel.startsWith('budget')?'budget':'weeklyReport';
    const index=Number.isInteger(event.wordIndex)?event.wordIndex%words[kind].length:Math.abs(event.day)%words[kind].length;
    return {title:'Daily',body:words[kind][index],route:routes[event.channel],id:event.id,channel:event.channel};
  }
  const api={channels,routes,normalise,clock,quiet,due,message};
  if(typeof module!=='undefined')module.exports=api;
  else root.DailyNotificationSchedule=api;
})(typeof globalThis!=='undefined'?globalThis:this);
