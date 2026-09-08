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
function validateKey(key, scope = 'day') {
  if (!['day', 'week', 'month'].includes(scope) || typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Invalid period');
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (dayKey(date) !== key || (scope === 'week' && date.getDay() !== 1) || (scope === 'month' && d !== 1)) throw new Error('Invalid date');
}
function validateData(data) {
  if (!data || ![1, 2, 3].includes(data.version)) throw new Error('Invalid data file');
  for (const [field, scope] of [['days', 'day'], ['weeks', 'week'], ['months', 'month']]) {
    if ((field === 'weeks' && data.version === 1) || (field === 'months' && data.version < 3)) continue;
    if (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field])) throw new Error('Invalid data file');
    for (const [key, rows] of Object.entries(data[field])) { validateKey(key, scope); validateDay(rows); }
  }
  return { version: 3, days: data.days, weeks: data.version === 1 ? {} : data.weeks, months: data.version < 3 ? {} : data.months };
}
class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 3, days: {}, weeks: {}, months: {} };
    this.legacy = false;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data = validateData(parsed);
      this.legacy = parsed.version < 3 ? parsed.version : false;
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('Your saved priorities could not be read. The original file has not been changed.', { cause: e });
    }
  }
  read(key = dayKey(), scope = 'day') {
    validateKey(key, scope);
    return validateDay(this.data[scope === 'month' ? 'months' : scope === 'week' ? 'weeks' : 'days'][key] || emptyDay());
  }
  save(key, rows, scope = 'day') {
    validateKey(key, scope);
    const field = scope === 'month' ? 'months' : scope === 'week' ? 'weeks' : 'days';
    const next = { ...this.data, [field]: { ...this.data[field], [key]: validateDay(rows) } };
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
    return this.read(key, scope);
  }
}
module.exports = { Store, dayKey, weekKey, emptyDay, validateDay };
