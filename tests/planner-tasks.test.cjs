'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');
const {app, Cloud, Store, copy} = require('./harness.cjs');
const model = fs.readFileSync(path.join(__dirname,'../js/planner-tasks.js'),'utf8');
const key = 'daily_planner_tasks', remote = 'users/u/plannerTasks';
const monday = '2026-11-16', tuesday = '2026-11-17', wednesday = '2026-11-18';
const priority = {week:monday, text:'Get the bike serviced', occurrence:0};
const action = {title:'Call the bike shop', date:tuesday, source:priority};
function device(cloud = new Cloud(), disk = new Store()) {
  const client = app(cloud,disk);
  client.window = {addEventListener(){},dispatchEvent(){}};
  client.Event = Event;
  client.kitUUID = randomUUID;
  vm.runInContext(model,client);
  return client;
}
function sync(client,cloud) {
  client.firebaseReady = true;
  client.plannerAttachTasks('u');
  cloud.emit(remote);
  return cloud.settle();
}

test('viewing, invalid data and repeat planning never create or rewrite actions', () => {
  const c = device(); c.firebaseReady = false;
  assert.equal(c.plannerTasks().length,0);
  assert.equal(c.localStorage.getItem(key),null);
  for (const fields of [{date:'2026-02-30'}, {title:' '}, {source:{...priority,week:wednesday}},
    {source:{...priority,occurrence:3}}]) assert.equal(c.plannerCreateTask({...action,...fields}),null);
  assert.equal(c.localStorage.getItem(key),null);
  const first = c.plannerCreateTask(action), saved = c.localStorage.getItem(key);
  const repeat = c.plannerCreateTask({...action,title:'Second click',date:wednesday});
  assert.equal(repeat.id,first.id);
  assert.equal(repeat.date,tuesday);
  assert.equal(c.localStorage.getItem(key),saved);
  assert.equal(c.plannerTaskForPriority(monday,' Get the bike serviced ').id,first.id);
  assert.equal(c.plannerTaskForPriority(monday,'Completely different intention'),null);
  const duplicate = c.plannerCreateTask({...action,source:{...priority,occurrence:1}});
  assert.notEqual(duplicate.id,first.id);
  assert.equal(c.plannerTaskForPriority(monday,priority.text,1).id,duplicate.id);
  const standalone = c.plannerCreateTask({...action,source:null});
  assert.equal(standalone.source,null);
  assert.equal(new Set(c.plannerTasks().map(row=>row.id)).size,3);
});

test('move, complete, reload and reopen retain original day and source; storage failures leave the saved task intact', () => {
  const cloud = new Cloud(), disk = new Store({wt_notes:'[{"id":"legacy-note"}]'}), c = device(cloud,disk);
  c.firebaseReady = false;
  const task = c.plannerCreateTask(action);
  c.plannerMoveTask(task.id,wednesday);
  c.plannerSetTaskDone(task.id,true);
  const fresh = device(cloud,disk); fresh.firebaseReady = false;
  const reopened = fresh.plannerSetTaskDone(task.id,false);
  assert.equal(reopened.originalDate,tuesday);
  assert.equal(reopened.date,wednesday);
  assert.equal(reopened.done,false);
  assert.deepEqual(copy(reopened.source),priority);
  assert.equal(disk.getItem('wt_notes'),'[{"id":"legacy-note"}]');
  disk.fail = true;
  assert.equal(fresh.plannerMoveTask(task.id,monday),null);
  assert.equal(fresh.plannerTasks()[0].date,wednesday);
});

test('two offline devices planning the same priority converge on one record alongside unrelated tasks', async () => {
  const cloud = new Cloud(), a = device(cloud), b = device(cloud);
  a.firebaseReady = b.firebaseReady = false;
  const first = a.plannerCreateTask(action), second = b.plannerCreateTask({...action,title:'Ring bike shop',date:wednesday});
  assert.equal(first.id,second.id);
  a.plannerCreateTask({title:'A',date:monday});
  b.plannerCreateTask({title:'B',date:tuesday});
  await sync(a,cloud); await sync(b,cloud); await sync(a,cloud); await sync(b,cloud);
  assert.deepEqual(copy(a.plannerTasks()),copy(b.plannerTasks()));
  assert.equal(Object.keys(cloud.get(remote)).length,3);
  assert.equal(a.plannerTasks().filter(x=>x.source).length,1);
});

test('a move and a completion made on separate offline devices both survive, even if one rejoins after a reload', async () => {
  const cloud = new Cloud(), a = device(cloud), b = device(cloud);
  const item = a.plannerCreateTask(action);
  await cloud.settle(); await sync(b,cloud);
  a.firebaseReady = b.firebaseReady = false;
  a.plannerMoveTask(item.id,wednesday); b.plannerSetTaskDone(item.id,true);
  const fresh = device(cloud,a.localStorage);
  await sync(b,cloud); await sync(fresh,cloud); await sync(b,cloud);
  for (const row of [fresh.plannerTasks()[0],b.plannerTasks()[0],cloud.get(remote+'/'+item.id)]) {
    assert.equal(row.date,wednesday); assert.equal(row.done,true); assert.equal(row.originalDate,tuesday);
  }
});

test('backup validates actions, restores only supplied data, and fences queued edits even after a clock rollback', async () => {
  const cloud = new Cloud(), c = device(cloud); c.firebaseReady = false;
  const old = c.plannerCreateTask(action);
  c.plannerSetTaskDone(old.id,true);
  assert.throws(()=>c.dailyRestoreStage({[key]:[{...old,date:'2026-02-30'}]},90),/Invalid Planner action/);
  assert.throws(()=>c.dailyRestoreStage({[key]:[{...old,source:{...priority,text:'Wrong source'}}]},90),/Invalid Planner action/);
  assert.equal(c.dailyRestoreStage({wt_theme:'dark'},90).updates.plannerTasks,undefined);
  const plan = c.dailyRestoreStage({[key]:copy(c.plannerTasks()),daily_planner_period:'week'},90);
  assert.equal(plan.writes.has('daily_planner_period'),false);
  c.dailyRestoreAdvanceGenerations(plan,{plannerTasks:{__dailyRestoredAt:100}});
  c.dailyRestoreWriteLocal(plan);
  cloud.put(remote,plan.updates.plannerTasks);
  assert.equal(c.plannerTasks()[0].done,true);
  assert.equal(c.plannerTasks()[0].restoreGeneration,101);
  await c.plannerUploadTasks(cloud.ref(remote),[old],0);
  assert.equal(cloud.get(remote+'/'+old.id).done,true);
  const replacement = c.dailyRestoreStage({[key]:[]},80);
  c.dailyRestoreWriteLocal(replacement);
  cloud.put(remote,replacement.updates.plannerTasks);
  const stale = device(cloud,new Store({[key]:JSON.stringify([old])}));
  await sync(stale,cloud);
  assert.deepEqual(Object.keys(cloud.get(remote)),['__dailyRestoredAt']);
  assert.equal(stale.plannerTasks().length,0);
  const newTask = stale.plannerCreateTask({title:'Fresh task',date:monday});
  await cloud.settle();
  assert.equal(cloud.get(remote+'/'+newTask.id).restoreGeneration,102);
});

test('an explicitly attached guest action survives a previously restored account while retaining the guest copy', async () => {
  const accountModel = fs.readFileSync(path.join(__dirname,'../js/account-storage.js'),'utf8');
  const guest = device(); guest.firebaseReady = false;
  const item = guest.plannerCreateTask(action);
  guest.dailyRestoreWriteLocal(guest.dailyRestoreStage({[key]:[item]},150));
  const disk = guest.localStorage;
  Object.defineProperties(disk,{
    length:{get:()=>disk.data.size},
    key:{value:index=>[...disk.data.keys()][index] ?? null}
  });
  const c = vm.createContext({window:{localStorage:disk,location:{reload(){}},addEventListener(){}},
    document:{body:{style:{}}},confirm:()=>true,plannerTasks:()=>guest.plannerTasks()});
  vm.runInContext(accountModel,c);
  c.dailySwitchAccount({uid:'u'});
  const adopted = c.dailyScopedStorage(disk,'user:u');
  assert.equal(adopted.getItem(key+'_restore_ts'),null);
  assert.deepEqual(JSON.parse(adopted.getItem('daily_planner_guest_tasks')),[item.id]);
  const cloud = new Cloud({users:{u:{plannerTasks:{__dailyRestoredAt:450}}}});
  const signed = device(cloud,adopted);
  await sync(signed,cloud);
  assert.equal(cloud.get(remote+'/'+item.id).restoreGeneration,450);
  await sync(signed,cloud);
  assert.equal(adopted.getItem('daily_planner_guest_tasks'),null);
  assert.equal(guest.plannerTasks()[0].restoreGeneration,150);
  assert.equal(c.dailyScopedStorage(disk,'user:other').getItem(key),null);
});
