const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {extract}=require('./harness.cjs');
const escape=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fixture(){
 const writes=[],nodes={};
 const c=vm.createContext({console,S:{sessions:[],swaps:{}},document:{addEventListener(){},getElementById:id=>nodes[id],querySelector:()=>null},
  localStorage:{setItem:(...a)=>writes.push(a)},escText:escape,escAttr:escape,muscleLabel:m=>m.charAt(0).toUpperCase()+m.slice(1),
  cardHeader:(_,label)=>'<header>'+label+'</header>',fmtDate:d=>d,fmtDuration:n=>n+'m',effortMeta:()=>null,
  _secsNames:new Set(),loadExerciseLib:()=>[],loadLibHidden:()=>[],dayCustom:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/training.js'),'utf8'),c);
 vm.runInContext(['libGuessMuscle','statsIsWorkingSet','fmtSetAmount','fmtLoggedSet','rtFormat','lapFabClock','rtUpdateDisplay'].map(extract).join('\n'),c);
 return {c,writes,nodes};
}
const work={weight:60,reps:8,type:'working'},warm={weight:20,reps:10,type:'warmup'};
test('session coverage counts only its recorded working sets and retains saved broad/custom groups',()=>{
 const {c,writes}=fixture(),s={exercises:[{name:'Squat',muscle:'legs',sets:[work,warm,{weight:50,reps:0}]},
  {name:'Curl',muscle:'Biceps',sets:[{weight:'-15 kg',reps:'8'}]},
  {name:'Plank',sets:[{reps:'30s'}]},null,{name:'Special move',muscle:'My group',sets:[work]}]},before=JSON.stringify(s);
 const m=c.trainingSessionCoverage(s);
 assert.equal(m.total,4);assert.deepEqual(JSON.parse(JSON.stringify(m.groups)),{legs:1,arms:1,core:1,'my group':1});
 assert.equal(m.inferred,1);assert.equal(m.rows[0].sets.length,3);assert.equal(JSON.stringify(s),before);assert.deepEqual(writes,[]);
 assert.equal(c.trainingSessionCoverage({exercises:[{name:'Warmup',sets:[warm]},null]}).total,0);
 assert.equal(c.trainingSessionCoverage({exercises:null}).total,0);
});
test('history coverage has no date-window dependency and never borrows a current program or library classification',()=>{
 const {c}=fixture();c.loadExerciseLib=()=>[{name:'Bench',muscle:'arms'}];
 c.S.swaps.Bench='Squat';
 const s={date:'2000-01-01',exercises:[{name:'Bench',muscle:'Chest',sets:[work]}]};
 assert.equal(c.trainingSessionCoverage(s).groups.chest,1);s.date=null;
 assert.equal(c.trainingSessionCoverage(s).groups.chest,1);
});
test('saved units and escaped historical text survive later exercise measurement changes',()=>{
 const {c,writes}=fixture();c._secsNames.add('Rep move');
 const s={id:'x',note:'A <script> & note',exercises:[{name:'Timed <hold>',muscle:'core',unit:'secs',sets:[{weight:0,reps:45}]},
  {name:'Rep move',muscle:'arms',unit:'reps',sets:[{weight:-15,reps:8}]}]},before=JSON.stringify(s);
 const html=c.logHistoryPreviewHTML(s,'x','');
 assert.match(html,/45s/);assert.match(html,/-15kg × 8/);assert.doesNotMatch(html,/8s|<script>|Timed <hold>/);
 assert.match(html,/Timed &lt;hold&gt;/);assert.match(html,/A &lt;script&gt; &amp; note/);
 assert.equal(JSON.stringify(s),before);assert.deepEqual(writes,[]);
});
test('partial and legacy cards show recorded facts without reconstructing planned completion',()=>{
 const {c}=fixture(),s={id:'p',sessionType:'Old <split>',completed:false,exercises:[{name:'Bench',muscle:'chest',sets:[work,warm]}]};
 const html=c.logHistoryCardHTML(s,0);
 assert.match(html,/Partial workout/);assert.match(html,/1 exercise/);assert.match(html,/1 working set/);
 assert.match(html,/Old &lt;split&gt;/);assert.doesNotMatch(html,/Completed|planned|%|session-del-x|Delete session/);
 delete s.completed;assert.match(c.logHistoryCardHTML(s,0),/Saved workout/);
});
test('history map interactions and labels are isolated from Today coverage selection',()=>{
 const {c}=fixture(),model={groups:{arms:2}};
 vm.runInContext("logCoverageMode='workout';logCoverageMuscle='chest';",c);
 const history=c.logBodySvg(model,false,{selected:'arms',recorded:true,sessionKey:'one"&two'});
 assert.match(history,/Arms, 2 recorded sets/);assert.match(history,/logHistorySelectMuscle/);assert.match(history,/one&quot;&amp;two/);
 const today=c.logBodySvg(model,false);
 assert.match(today,/Arms, 2 planned sets/);assert.match(today,/Chest, 0 planned sets" aria-pressed="true/);
 assert.doesNotMatch(today,/logHistorySelectMuscle/);
});
test('compact rest display uses whole seconds while fullscreen retains timestamp-derived tenths',()=>{
 const {c,nodes,writes}=fixture();nodes['rt-bar-time']={};nodes['rt-fs-time']={};
 c.rtUpdateDisplay(61234);assert.equal(nodes['rt-bar-time'].textContent,'1:01');assert.equal(nodes['rt-fs-time'].textContent,'1:01.2');
 c.rtUpdateDisplay(0);assert.equal(nodes['rt-bar-time'].textContent,'0:00');assert.deepEqual(writes,[]);
});
test('floating lap controls follow the active set logger while the timer keeps running',()=>{
 const {c,nodes,writes}=fixture();nodes['lap-fab']={style:{}};
 c.rtRunning=true;c.S.view='log';c.logSubTab='today';c.logTodayView='session';c.updateLapFabText=()=>{};
 vm.runInContext(extract('updateLapFab'),c);c.updateLapFab();assert.equal(nodes['lap-fab'].style.display,'flex');
 c.logSubTab='history';c.updateLapFab();assert.equal(nodes['lap-fab'].style.display,'none');assert.equal(c.rtRunning,true);
 c.logSubTab='today';c.logTodayView='overview';c.updateLapFab();assert.equal(nodes['lap-fab'].style.display,'none');
 assert.deepEqual(writes,[]);
});
