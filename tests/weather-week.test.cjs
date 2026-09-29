const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extract,extractConst,copy}=require('./harness.cjs');
const NOW=Date.parse('2026-10-03T13:30:00Z'); // Sydney: 23:30, just before the DST-change date.
const HOUR=3600000;
const day=(time,over={})=>({time:Date.parse(time),tempMax:22,tempMin:12,code:0,rainProbability:0,...over});
function entry(){return {timezone:'Australia/Sydney',utcOffsetSeconds:36000,
  daily:[day('2026-10-02T14:00:00Z'),day('2026-10-03T14:00:00Z'),day('2026-10-04T13:00:00Z'),
    day('2026-10-05T13:00:00Z'),day('2026-10-06T13:00:00Z'),day('2026-10-07T13:00:00Z'),day('2026-10-08T13:00:00Z')],
  hourly:[{time:NOW+HOUR,tempC:18,code:0,isDay:0,rainProbability:0,precipitation:0}]};}
function fixture(cache=entry()){
  const nodes={},calls=[];
  for(const id of ['periods','today','week','hours','summary','forecast-caption','forecast-empty','forecast-retry','preview']){
    nodes['home-weather-'+id]={hidden:false,textContent:'',innerHTML:'',attrs:{},classes:new Set(),
      setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(k,on){nodes['home-weather-'+id].classes[on?'add':'delete'](k);}}};
  }
  class Clock extends Date {static now(){return NOW;}}
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ctx=vm.createContext({Date:Clock,Intl,Number,Set,console,
    document:{getElementById:id=>nodes[id]||null},loadWeatherCache:()=>cache,
    weatherRefresh:args=>{calls.push(args);},escText:esc,escAttr:esc,weatherIcon:icon=>'<i>'+icon+'</i>'});
  vm.runInContext(extractConst('WEATHER_CODES')+'\nlet _homeWeatherPeriod=null;\n'+[
    'weatherForecastDate','weatherForecastDays','weatherForecastHours','weatherForecastTime','weatherForecastSummary',
    'homeWeatherPeriod','homeSetWeatherPeriod','renderMobileWeatherForecast','renderWeatherForecast'
  ].map(extract).join('\n'),ctx);
  return {ctx,nodes,calls,put:value=>{cache=value;}};
}

test('weekly days use the forecast city calendar, including the 23-hour DST day',()=>{
  const {ctx}=fixture(),data=entry(),before=copy(data);
  data.daily=[...data.daily.reverse(),day('2026-10-03T14:00:00Z'),day('2026-10-01T14:00:00Z'),day('2026-10-09T13:00:00Z')];
  const original=copy(data),days=copy(ctx.weatherForecastDays(data));
  assert.deepEqual(days.map(d=>d.date),['2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09']);
  assert.equal(days[0].day,'Today');assert.equal(days[1].day,'Sun');assert.equal(days[2].day,'Mon');
  assert.equal(days[2].time-days[1].time,23*HOUR);
  assert.deepEqual(copy(data),original);
  assert.equal(ctx.weatherForecastDays(before,Date.parse('2026-10-03T14:30:00Z'))[0].date,'2026-10-04');
  assert.deepEqual(copy(ctx.weatherForecastDays(before,NOW+10*864e5)),[]);
});

test('date labels use IANA zones, then an explicit offset, never the device timezone',()=>{
  const {ctx}=fixture();
  assert.equal(ctx.weatherForecastDate({timezone:'America/Los_Angeles'},Date.parse('2026-10-03T02:00:00Z')),'2026-10-02');
  assert.equal(ctx.weatherForecastDate({timezone:'invalid',utcOffsetSeconds:20700},Date.parse('2026-10-03T20:00:00Z')),'2026-10-04');
  assert.equal(ctx.weatherForecastDate({utcOffsetSeconds:0},NOW),'2026-10-03');
  for(const data of [{},{timezone:'invalid'},{utcOffsetSeconds:null},{utcOffsetSeconds:999999}])assert.equal(ctx.weatherForecastDate(data,NOW),'');
  for(const time of [null,NaN,0,Number.MAX_VALUE])assert.equal(ctx.weatherForecastDate(entry(),time),'');
});

test('missing weekly measurements stay unknown and impossible high/low pairs are not presented',()=>{
  const {ctx}=fixture(),data=entry();
  data.daily=[day('2026-10-02T14:00:00Z',{tempMax:null,tempMin:'12',code:'0',rainProbability:101}),
    day('2026-10-03T14:00:00Z',{tempMax:9,tempMin:10,rainProbability:-1}),
    day('2026-10-04T13:00:00Z',{tempMax:0,tempMin:-5,rainProbability:0}),null,{time:null}];
  const rows=copy(ctx.weatherForecastDays(data));
  for(const field of ['tempMax','tempMin','code','rainProbability'])assert.equal(rows[0][field],null);
  assert.equal(rows[1].tempMax,null);assert.equal(rows[1].tempMin,null);assert.equal(rows[1].rainProbability,null);
  assert.equal(rows[2].tempMax,0);assert.equal(rows[2].tempMin,-5);assert.equal(rows[2].rainProbability,0);
  for(const value of [null,{}, {daily:{}}, {daily:[]}])assert.deepEqual(copy(ctx.weatherForecastDays(value)),[]);
});

test('Today and Week switch in place and survive data refreshes without fetching or writing preferences',()=>{
  const {ctx,nodes,calls}=fixture(),today=nodes['home-weather-today'],week=nodes['home-weather-week'],strip=nodes['home-weather-hours'];
  ctx.renderWeatherForecast(entry());
  assert.equal(week.attrs['aria-pressed'],'true');assert.equal(strip.classes.has('weather-week'),true);
  assert.match(strip.innerHTML,/Today/);assert.match(strip.innerHTML,/weather-day-low/);
  ctx.homeSetWeatherPeriod('today');
  assert.equal(today.attrs['aria-pressed'],'true');assert.equal(week.attrs['aria-pressed'],'false');
  assert.doesNotMatch(strip.innerHTML,/weather-day-low/);assert.match(strip.innerHTML,/moon/);
  const fresh=entry();fresh.hourly[0].tempC=16;
  ctx.renderWeatherForecast(fresh);
  assert.match(strip.innerHTML,/16°/);assert.equal(today.attrs['aria-pressed'],'true');
  ctx.homeSetWeatherPeriod('week');ctx.renderWeatherForecast(entry());
  assert.equal(week.attrs['aria-pressed'],'true');assert.equal(nodes['home-weather-week'],week);assert.equal(nodes['home-weather-hours'],strip);
  assert.equal(calls.length,0);
});

test('legacy cache shows existing hours; requesting missing week data uses the coordinator without asking for location',()=>{
  const cache=entry();delete cache.daily;
  const {ctx,nodes,calls,put}=fixture(cache);
  ctx.renderWeatherForecast(cache);assert.equal(nodes['home-weather-today'].attrs['aria-pressed'],'true');
  ctx.homeSetWeatherPeriod('week');
  assert.equal(nodes['home-weather-hours'].hidden,true);
  assert.equal(nodes['home-weather-forecast-empty'].hidden,false);
  assert.equal(nodes['home-weather-forecast-retry'].hidden,false);
  assert.deepEqual(copy(calls),[{force:true,reason:'week-forecast'}]);
  put(entry());ctx.renderWeatherForecast(entry());
  assert.equal(nodes['home-weather-week'].attrs['aria-pressed'],'true');
  assert.equal(nodes['home-weather-forecast-retry'].hidden,true);
  ctx.homeSetWeatherPeriod('invalid');assert.equal(calls.length,1);
});

test('unavailable or expired forecasts show an honest empty state rather than recycling old days',()=>{
  const {ctx,nodes}=fixture();
  ctx.homeSetWeatherPeriod('week');
  ctx.renderWeatherForecast({...entry(),daily:[day('2026-09-01T00:00:00Z')]});
  assert.equal(nodes['home-weather-hours'].hidden,true);assert.equal(nodes['home-weather-forecast-caption'].hidden,true);
  assert.match(nodes['home-weather-forecast-empty'].textContent,/Weekly forecast unavailable/);
  ctx.renderWeatherForecast(null);assert.equal(nodes['home-weather-hours'].innerHTML,'');
});
