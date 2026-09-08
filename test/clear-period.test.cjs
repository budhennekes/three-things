const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {Store, emptyDay} = require('../src/store.cjs');
const periods = [['day','2026-09-07'], ['week','2026-09-07'], ['month','2026-09-01']];
const rows = ['Walk','Write','Read'].map(text => ({text,done:true}));
const extras = [{text:'Water plants',done:false}];
function fixture() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'three-period-')), 'priorities.json');
  const store = new Store(file);
  for (const [scope,key] of periods) store.save(key, rows, scope, extras);
  store.save('2026-08-31',rows,'week');store.save('2026-08-01',rows,'month');
  return {file,store};
}
for (const [scope,key] of periods) {
  test(`${scope}: atomic clear, independent restart-safe Undo and no overwritten new work`, () => {
    let {file,store} = fixture();
    store.clearPeriod(key,scope);
    assert.deepEqual(store.read(key,scope),emptyDay());
    assert.deepEqual(store.readProgress(key,scope).extras,[]);
    for (const [other,otherKey] of periods.filter(([s])=>s!==scope)) {
      assert.deepEqual(store.read(otherKey,other),rows);
      store.clearPeriod(otherKey,other);
    }
    store = new Store(file);
    for (const [s,k] of periods) assert.equal(store.canUndoClear(k,s),true);
    store.undoClearPeriod(key,scope);
    assert.deepEqual(store.read(key,scope),rows);
    assert.deepEqual(store.readProgress(key,scope).extras,extras);
    assert.deepEqual(store.read('2026-08-31','week'),rows);
    assert.deepEqual(store.read('2026-08-01','month'),rows);
    store.clearPeriod(key,scope);store.clearPeriod(key,scope);
    assert.equal(store.canUndoClear(key,scope),true,'Empty clear preserves Undo');
    const fresh=emptyDay();fresh[0].text='New plan';store.save(key,fresh,scope,[]);
    assert.equal(store.canUndoClear(key,scope),false);
    assert.throws(()=>store.undoClearPeriod(key,scope));
    assert.deepEqual(store.read(key,scope),fresh);
    for (const [s,k] of periods.filter(([s])=>s!==scope)) assert.equal(store.canUndoClear(k,s),true);
  });
  test(`${scope}: failed clear and undo leave disk and memory intact`, () => {
    const {file,store}=fixture();
    for (const action of ['clearPeriod','undoClearPeriod']) {
      if(action==='undoClearPeriod')store.clearPeriod(key,scope);
      const disk=fs.readFileSync(file,'utf8'),memory=structuredClone(store.data);
      fs.mkdirSync(file+'.tmp');assert.throws(()=>store[action](key,scope));
      assert.equal(fs.readFileSync(file,'utf8'),disk);assert.deepEqual(store.data,memory);
      fs.rmdirSync(file+'.tmp');
    }
  });
}
test('v5 daily Undo migrates without data writes until first action; original gets a backup', () => {
  const {file}=fixture();
  const legacy={version:5,days:{'2026-09-07':emptyDay()},weeks:{},months:{},completion:{},clearUndo:{key:'2026-09-07',rows,progress:{completedOnce:true,extras}}};
  const original=JSON.stringify(legacy);fs.writeFileSync(file,original);
  const store=new Store(file);assert.equal(fs.readFileSync(file,'utf8'),original);
  assert.equal(store.canUndoToday('2026-09-07'),true);
  store.undoClearToday('2026-09-07');
  assert.equal(fs.readFileSync(file+'.v5-backup','utf8'),original);
  assert.deepEqual(new Store(file).read('2026-09-07'),rows);
});
test('malformed scoped Undo is rejected without rewriting the file',()=>{
  const {file,store}=fixture();store.clearPeriod('2026-09-07','week');
  const bad=JSON.parse(fs.readFileSync(file));bad.clearUndos['week:2026-09-08']=bad.clearUndos['week:2026-09-07'];
  const original=JSON.stringify(bad);fs.writeFileSync(file,original);
  assert.throws(()=>new Store(file));assert.equal(fs.readFileSync(file,'utf8'),original);
});
