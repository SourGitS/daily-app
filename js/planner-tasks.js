'use strict';

// A planned action owns its date and completion. Review text, notes and bills keep their
// own records. No task or preference is created just by viewing Planner.
const PLANNER_TASKS_KEY = 'daily_planner_tasks';

function plannerPrioritySource(value) {
  if (!value || typeof value.text !== 'string' || !value.text.trim() ||
      !aiActValidDate(value.week) || new Date(value.week + 'T12:00:00Z').getUTCDay() !== 1) return null;
  const occurrence = value.occurrence ?? 0;
  if (!Number.isInteger(occurrence) || occurrence < 0 || occurrence > 2) return null;
  return {week:value.week, text:value.text.trim(), occurrence};
}

// Weekly Review originally saved plain strings, with up to three slots. Derive the same
// child key offline on either device. Hashing the text keeps long priorities within the
// Firebase key limit. Always compare the full source as well before returning a link.
function plannerPriorityId(source) {
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  const prime = 0x1000000000000000000013bn;
  for (let index = 0; index < source.text.length; index++) {
    const unit = source.text.charCodeAt(index);
    hash = BigInt.asUintN(128, (hash ^ BigInt(unit & 255)) * prime);
    hash = BigInt.asUintN(128, (hash ^ BigInt(unit >>> 8)) * prime);
  }
  return 'priority-' + source.week + '-' + source.occurrence + '-' + hash.toString(36);
}

function plannerReadTask(row) {
  if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(row.id) ||
      ['__proto__','constructor','prototype','__dailyRestoredAt'].includes(row.id) ||
      typeof row.title !== 'string' || !row.title.trim() || !aiActValidDate(row.date) ||
      !aiActValidDate(row.originalDate) || typeof row.done !== 'boolean') return null;
  const source = plannerPrioritySource(row.source);
  if (row.source != null && (!source || row.id !== plannerPriorityId(source))) return null;
  if (!source && row.id.startsWith('priority-')) return null;
  const createdAt = Number(row.createdAt), updatedAt = Number(row.updatedAt);
  const dateAt = row.dateAt ?? 0, doneAt = row.doneAt ?? 0, restoreGeneration = row.restoreGeneration ?? 0;
  if (![createdAt,updatedAt,dateAt,doneAt,restoreGeneration].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !createdAt || updatedAt < Math.max(dateAt,doneAt) || (!dateAt && row.date !== row.originalDate) ||
      (!doneAt && row.done)) return null;
  return {id:row.id, title:row.title.trim(), originalDate:row.originalDate, date:row.date,
    done:row.done, source, createdAt, updatedAt, dateAt, doneAt, restoreGeneration};
}

function plannerTasks() {
  return wtReadRecords(PLANNER_TASKS_KEY).map(plannerReadTask).filter(Boolean);
}

function plannerTaskForPriority(week, text, occurrence = 0) {
  const source = plannerPrioritySource({week,text,occurrence});
  if (!source) return null;
  const id = plannerPriorityId(source);
  const task = plannerTasks().find(item => item.id === id);
  return task?.source?.text === source.text ? task : null;
}

// A move on the phone and completion on the desktop affect different fields. Keep both
// edits even if the devices worked offline. For two simultaneous edits to the same field,
// the timestamp, then the value, gives both devices the same answer.
function plannerMergeTask(a, b) {
  if (!a) return b;
  if (!b) return a;
  const base = a.createdAt < b.createdAt ||
    (a.createdAt === b.createdAt && JSON.stringify([a.title,a.originalDate]) < JSON.stringify([b.title,b.originalDate])) ? a : b;
  const schedule = a.dateAt > b.dateAt || (a.dateAt === b.dateAt && a.date > b.date) ? a : b;
  const completion = a.doneAt > b.doneAt || (a.doneAt === b.doneAt && a.done) ? a : b;
  return {...base, date:schedule.dateAt ? schedule.date : base.originalDate, dateAt:schedule.dateAt,
    done:completion.done, doneAt:completion.doneAt, updatedAt:Math.max(a.updatedAt,b.updatedAt)};
}

function plannerUploadTasks(ref, tasks, generation) {
  if (!ref || !tasks.length) return;
  // Check the collection's replacement marker inside the very same transaction as the
  // update. An offline edit queued before a backup restore must never reinsert an old task.
  return ref.transaction(current => {
    if (dailyRestoreCutoff(current) !== generation) return;
    const next = {...current};
    let changed = false;
    for (const task of tasks) {
      const cloud = plannerReadTask(next[task.id]);
      const merged = plannerMergeTask(cloud, task);
      if (JSON.stringify(cloud) === JSON.stringify(merged)) continue;
      next[task.id] = merged;
      changed = true;
    }
    if (changed) return next;
  }, undefined, false).catch(() => setSyncStatus('Sync failed'));
}

function plannerTaskGeneration() {
  return Number(localStorage.getItem(PLANNER_TASKS_KEY + '_restore_ts')) || 0;
}

function plannerSaveTask(task) {
  try {
    if (task.restoreGeneration !== plannerTaskGeneration()) return null;
    const rows = plannerTasks();
    const index = rows.findIndex(row => row.id === task.id);
    if (index < 0) rows.push(task);
    else {
      task = plannerMergeTask(rows[index],task);
      rows[index] = task;
    }
    localStorage.setItem(PLANNER_TASKS_KEY, JSON.stringify(rows));
  } catch {
    setSyncStatus('Local save failed');
    return null;
  }
  plannerUploadTasks(fbRef('plannerTasks'), [task], task.restoreGeneration);
  return task;
}

function plannerCreateTask({title, date, source = null}) {
  if (typeof title !== 'string' || !title.trim() || !aiActValidDate(date)) return null;
  const origin = plannerPrioritySource(source);
  if (source != null && !origin) return null;
  const id = origin ? plannerPriorityId(origin) : 'action-' + kitUUID();
  const existing = plannerTasks().find(task => task.id === id);
  if (existing) return origin && existing.source?.text === origin.text ? existing : null;
  const generation = plannerTaskGeneration(), now = Math.max(Date.now(), generation + 1);
  return plannerSaveTask({id,title:title.trim(),originalDate:date,date,done:false,source:origin,
    createdAt:now,updatedAt:now,dateAt:0,doneAt:0,restoreGeneration:generation});
}

function plannerMoveTask(id, date) {
  const task = plannerTasks().find(row => row.id === id);
  if (!task || !aiActValidDate(date)) return null;
  if (task.date === date) return task;
  const now = Math.max(Date.now(), task.updatedAt + 1);
  return plannerSaveTask({...task, date, dateAt:now, updatedAt:now});
}

function plannerSetTaskDone(id, done) {
  const task = plannerTasks().find(row => row.id === id);
  if (!task || typeof done !== 'boolean') return null;
  if (task.done === done) return task;
  const now = Math.max(Date.now(), task.updatedAt + 1);
  return plannerSaveTask({...task, done, doneAt:now, updatedAt:now});
}

function plannerAttachTasks(uid) {
  const ref = db.ref('users/' + uid + '/plannerTasks');
  ref.on('value', snapshot => {
    if (auth.currentUser?.uid !== uid) return;
    const raw = snapshot.val(), generation = dailyRestoreCutoff(raw);
    const previousGeneration = plannerTaskGeneration();
    // An empty local cache can fire before the server confirms a previously seen restore.
    if (generation < previousGeneration) return;
    const local = plannerTasks();
    const guestImports = new Set(lsLoad('daily_planner_guest_tasks', [], Array.isArray));
    const cloud = new Map(Object.values(raw || {}).map(plannerReadTask).filter(row =>
      row && row.restoreGeneration === generation).map(row => [row.id,row]));
    const merged = new Map(cloud), pending = [];
    for (const row of local) {
      if (row.restoreGeneration !== generation && !guestImports.has(row.id)) continue;
      const remote = cloud.get(row.id), result = plannerMergeTask(remote,{...row,restoreGeneration:generation});
      merged.set(row.id,result);
      if (JSON.stringify(result) !== JSON.stringify(remote)) pending.push(result);
    }
    const rows = [...merged.values()].sort((a,b) => a.id.localeCompare(b.id));
    const changed = JSON.stringify(local.sort((a,b) => a.id.localeCompare(b.id))) !== JSON.stringify(rows);
    try {
      if (generation !== previousGeneration) localStorage.setItem(PLANNER_TASKS_KEY + '_restore_ts', String(generation));
      if (changed) localStorage.setItem(PLANNER_TASKS_KEY, JSON.stringify(rows));
      // Keep the import pending through offline restarts, until a server snapshot contains
      // each action. Only the existing ownership prompt can put ids into this local list.
      if (guestImports.size && !pending.some(row => guestImports.has(row.id))) localStorage.removeItem('daily_planner_guest_tasks');
    } catch {
      setSyncStatus('Local save failed');
      return;
    }
    if (changed) window.dispatchEvent(new Event('planner-tasks-changed'));
    plannerUploadTasks(ref,pending,generation);
  }, () => setSyncStatus('Sync failed'));
  return ref;
}

window.addEventListener('storage', e => {
  const key = localStorage.logicalKey ? localStorage.logicalKey(e.key) : e.key;
  if (key === PLANNER_TASKS_KEY) window.dispatchEvent(new Event('planner-tasks-changed'));
});
