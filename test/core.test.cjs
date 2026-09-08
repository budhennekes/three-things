const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, weekKey } = require('../src/store.cjs');
const { MODES, clampBounds } = require('../src/window-state.cjs');

test('today, week, and month remain independent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'three-things-'));
  const store = new Store(path.join(dir, 'priorities.json'));
  store.save('2026-09-08', [{ text: 'Today', done: false }, { text: '', done: false }, { text: '', done: false }], 'day');
  store.save('2026-09-07', [{ text: 'Week', done: false }, { text: '', done: false }, { text: '', done: false }], 'week');
  store.save('2026-09-01', [{ text: 'Month', done: false }, { text: '', done: false }, { text: '', done: false }], 'month');
  assert.equal(store.read('2026-09-08', 'day')[0].text, 'Today');
  assert.equal(store.read('2026-09-07', 'week')[0].text, 'Week');
  assert.equal(store.read('2026-09-01', 'month')[0].text, 'Month');
  assert.equal(weekKey(new Date(2026, 8, 8, 12)), '2026-09-07');
});

test('a checked task can be edited without losing completion', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'three-things-'));
  const store = new Store(path.join(dir, 'priorities.json'));
  store.save('2026-09-08', [{ text: 'First wording', done: true }, { text: '', done: false }, { text: '', done: false }]);
  store.save('2026-09-08', [{ text: 'Corrected wording', done: true }, { text: '', done: false }, { text: '', done: false }]);
  assert.deepEqual(store.read('2026-09-08')[0], { text: 'Corrected wording', done: true });
});

test('mini bar preserves three readable task columns', () => {
  assert.equal(MODES.compact.minWidth, 600);
  assert.equal(MODES.compact.height, 98);
  const bounds = clampBounds({ x: 0, y: 0, width: 200, height: 10 }, { x: 0, y: 0, width: 1440, height: 900 }, 'compact');
  assert.equal(bounds.width, 600);
  assert.equal(bounds.height, 98);
});

test('the shipped catalog excludes rejected backgrounds and includes grass scenes', () => {
  const catalog = require('../assets/appearance-catalog-v5.json');
  const names = new Set(catalog.map(item => item.name));
  assert(!names.has('ceramic'));
  assert(!names.has('cloudbank'));
  assert(names.has('meadow'));
  assert(names.has('olive-grove'));
});
