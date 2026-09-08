const fs = require('node:fs');
const path = require('node:path');

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
  if (!data || ![1, 2, 3, 4, 5].includes(data.version)) throw new Error('Invalid data file');
  for (const [field, scope] of [['days', 'day'], ['weeks', 'week'], ['months', 'month']]) {
    if ((field === 'weeks' && data.version === 1) || (field === 'months' && data.version < 3)) continue;
    if (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field])) throw new Error('Invalid data file');
    for (const [key, rows] of Object.entries(data[field])) { validateKey(key, scope); validateDay(rows); }
  }
  const next = { version: 5, days: data.days, weeks: data.version === 1 ? {} : data.weeks, months: data.version < 3 ? {} : data.months, completion: {}, clearUndo: null };
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
  if (data.version === 5 && data.clearUndo !== null) {
    const undo = data.clearUndo;
    if (!undo || !undo.progress || typeof undo.progress.completedOnce !== 'boolean') throw new Error('Invalid clear backup');
    validateKey(undo.key, 'day');
    const extras = validateExtras(undo.progress.extras);
    if (extras.length && !undo.progress.completedOnce) throw new Error('Invalid clear backup');
    next.clearUndo = { key:undo.key, rows:validateDay(undo.rows), progress:{completedOnce:undo.progress.completedOnce, extras} };
  }
  return next;
}
class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 5, days: {}, weeks: {}, months: {}, completion: {}, clearUndo:null };
    this.legacy = false;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data = validateData(parsed);
      this.legacy = parsed.version < 5 ? parsed.version : false;
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('Your saved priorities could not be read. The original file has not been changed.', { cause: e });
    }
  }
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
    const clearUndo = scope === 'day' && this.data.clearUndo?.key === key ? null : this.data.clearUndo;
    const next = { ...this.data, completion, clearUndo, [field]: { ...this.data[field], [key]: safeRows } };
    this.commit(next);
    return this.read(key, scope);
  }
  canUndoToday(key) {
    validateKey(key, 'day');
    return this.data.clearUndo?.key === key;
  }
  clearToday(key) {
    validateKey(key, 'day');
    const rows = this.read(key), progress = this.readProgress(key);
    if (!rows.some(row=>row.text.length) && !progress.extras.length) return;
    const completion = {...this.data.completion};
    if (progress.completedOnce) completion['day:'+key] = {completedOnce:true, extras:[]};
    this.commit({...this.data, completion, days:{...this.data.days,[key]:emptyDay()}, clearUndo:{key,rows,progress}});
  }
  undoClearToday(key) {
    validateKey(key, 'day');
    if (!this.canUndoToday(key) || this.read(key).some(row=>row.text.length) || this.readProgress(key).extras.length) throw new Error('No clear to undo');
    const {rows,progress} = this.data.clearUndo;
    const completion = {...this.data.completion};
    if (progress.completedOnce) completion['day:'+key] = progress;
    else delete completion['day:'+key];
    this.commit({...this.data, completion, days:{...this.data.days,[key]:rows}, clearUndo:null});
  }
  commit(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (this.legacy) {
      try { fs.copyFileSync(this.file, this.file + '.v' + this.legacy + '-backup', fs.constants.COPYFILE_EXCL); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
    this.data = next;
    this.legacy = false;
  }
}
module.exports = { Store, dayKey, weekKey, emptyDay, validateDay };
