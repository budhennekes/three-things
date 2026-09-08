/* Generated from src/store.cjs by mobile/build.cjs. */
window.ThreeModel=(()=>{
function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function weekKey(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return dayKey(monday);
}
const emptyDay = () => Array.from({ length: 3 }, () => ({ text: '', done: false }));
function validateDay(rows) {
  if (!Array.isArray(rows) || rows.length !== 3 || rows.some(r => !r || typeof r.text !== 'string' || r.text.length > 240 || typeof r.done !== 'boolean' || (r.done && !r.text.trim()))) throw new Error('Invalid priorities');
  return rows.map(({ text, done }) => ({ text, done }));
}
function validateExtras(rows) {
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(r => !r || typeof r.text !== 'string' || r.text.length > 240 || typeof r.done !== 'boolean' || (r.done && !r.text.trim()))) throw new Error('Invalid extra tasks');
  return rows.map(({text,done}) => ({text,done}));
}
function validateKey(key, scope = 'day') {
  if (!['day', 'week', 'month'].includes(scope) || typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Invalid period');
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (dayKey(date) !== key || (scope === 'week' && date.getDay() !== 1) || (scope === 'month' && d !== 1)) throw new Error('Invalid date');
}
function validateData(data) {
  if (!data || ![1, 2, 3, 4, 5, 6].includes(data.version)) throw new Error('Invalid data file');
  for (const [field, scope] of [['days', 'day'], ['weeks', 'week'], ['months', 'month']]) {
    if ((field === 'weeks' && data.version === 1) || (field === 'months' && data.version < 3)) continue;
    if (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field])) throw new Error('Invalid data file');
    for (const [key, rows] of Object.entries(data[field])) { validateKey(key, scope); validateDay(rows); }
  }
  const next = { version: 6, days: data.days, weeks: data.version === 1 ? {} : data.weeks, months: data.version < 3 ? {} : data.months, completion: {}, clearUndos: {} };
  if (data.version >= 4) {
    if (!data.completion || typeof data.completion !== 'object' || Array.isArray(data.completion)) throw new Error('Invalid completion data');
    for (const [identity, progress] of Object.entries(data.completion)) {
      const [scope,key,...rest] = identity.split(':'); validateKey(key,scope);
      if (rest.length || !progress || progress.completedOnce !== true) throw new Error('Invalid completion data');
      next.completion[identity] = {completedOnce:true, extras:validateExtras(progress.extras)};
    }
  } else {
    // Existing completed periods have already earned their moment; never replay it on migration.
    for (const [field,scope] of [['days','day'],['weeks','week'],['months','month']])
      for (const [key,rows] of Object.entries(next[field])) if (rows.every(r=>r.done)) next.completion[`${scope}:${key}`] = {completedOnce:true,extras:[]};
  }
  const validateUndo = undo => {
    if (!undo || !undo.progress || typeof undo.progress.completedOnce !== 'boolean') throw new Error('Invalid clear backup');
    const extras = validateExtras(undo.progress.extras);
    if (extras.length && !undo.progress.completedOnce) throw new Error('Invalid clear backup');
    return {rows:validateDay(undo.rows), progress:{completedOnce:undo.progress.completedOnce, extras}};
  };
  if (data.version === 5 && data.clearUndo !== null) {
    validateKey(data.clearUndo?.key, 'day');
    next.clearUndos['day:'+data.clearUndo.key] = validateUndo(data.clearUndo);
  }
  if (data.version === 6) {
    if (!data.clearUndos || typeof data.clearUndos !== 'object' || Array.isArray(data.clearUndos)) throw new Error('Invalid clear backups');
    for (const [identity,undo] of Object.entries(data.clearUndos)) {
      const [scope,key,...rest] = identity.split(':'); validateKey(key,scope);
      if (rest.length) throw new Error('Invalid clear backup');
      next.clearUndos[identity] = validateUndo(undo);
    }
  }
  return next;
}

class Store {
constructor(data){this.data=validateData(data||{version:6,days:{},weeks:{},months:{},completion:{},clearUndos:{}});}
  read(key = dayKey(), scope = 'day') {
    validateKey(key, scope);
    return validateDay(this.data[scope === 'month' ? 'months' : scope === 'week' ? 'weeks' : 'days'][key] || emptyDay());
  }
  readProgress(key = dayKey(), scope = 'day') {
    validateKey(key,scope);
    const progress = this.data.completion[`${scope}:${key}`];
    return progress ? {completedOnce:true,extras:validateExtras(progress.extras)} : {completedOnce:false,extras:[]};
  }
  save(key, rows, scope = 'day', extras) {
    validateKey(key, scope);
    const field = scope === 'month' ? 'months' : scope === 'week' ? 'weeks' : 'days';
    const safeRows = validateDay(rows), previous = this.readProgress(key,scope);
    const completedOnce = previous.completedOnce || safeRows.every(r=>r.done);
    const safeExtras = extras === undefined ? previous.extras : validateExtras(extras);
    if (safeExtras.length && !completedOnce) throw new Error('Complete the original three first');
    const completion = {...this.data.completion};
    if (completedOnce) completion[`${scope}:${key}`] = {completedOnce:true,extras:safeExtras};
    const clearUndos = {...this.data.clearUndos};
    delete clearUndos[`${scope}:${key}`];
    const next = { ...this.data, completion, clearUndos, [field]: { ...this.data[field], [key]: safeRows } };
    this.commit(next);
    return this.read(key, scope);
  }
  canUndoClear(key, scope = 'day') {
    validateKey(key, scope);
    return Object.hasOwn(this.data.clearUndos, `${scope}:${key}`);
  }
  clearPeriod(key, scope = 'day') {
    validateKey(key, scope);
    const rows = this.read(key,scope), progress = this.readProgress(key,scope);
    if (!rows.some(row=>row.text.length) && !progress.extras.length) return;
    const identity = `${scope}:${key}`, field = scope === 'month' ? 'months' : scope === 'week' ? 'weeks' : 'days';
    const completion = {...this.data.completion};
    if (progress.completedOnce) completion[identity] = {completedOnce:true, extras:[]};
    this.commit({...this.data, completion, [field]:{...this.data[field],[key]:emptyDay()}, clearUndos:{...this.data.clearUndos,[identity]:{rows,progress}}});
  }
  undoClearPeriod(key, scope = 'day') {
    validateKey(key, scope);
    if (!this.canUndoClear(key,scope) || this.read(key,scope).some(row=>row.text.length) || this.readProgress(key,scope).extras.length) throw new Error('No clear to undo');
    const identity = `${scope}:${key}`, field = scope === 'month' ? 'months' : scope === 'week' ? 'weeks' : 'days';
    const {rows,progress} = this.data.clearUndos[identity];
    const completion = {...this.data.completion}, clearUndos = {...this.data.clearUndos};
    if (progress.completedOnce) completion[identity] = progress;
    else delete completion[identity];
    delete clearUndos[identity];
    this.commit({...this.data, completion, [field]:{...this.data[field],[key]:rows}, clearUndos});
  }
  canUndoToday(key) { return this.canUndoClear(key,'day'); }
  clearToday(key) { return this.clearPeriod(key,'day'); }
  undoClearToday(key) { return this.undoClearPeriod(key,'day'); }

commit(next){this.data=validateData(next);}
}
return {Store,dayKey,weekKey,validateKey};
})();
