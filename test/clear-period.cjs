const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store,dayKey,weekKey,emptyDay}=require('../src/store.cjs');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'three-period-ui-'));
const file=path.join(data,'priorities.json'),out=path.join(root,'evidence-v0101');fs.mkdirSync(out,{recursive:true});
const periods=[['day',dayKey(),'Clear today'],['week',weekKey(),'Clear week'],['month',dayKey().slice(0,7)+'-01','Clear month']];
const rows=['Walk outside','Finish the draft','Make time to read'].map(text=>({text,done:true}));
const extras=[{text:'Water the plants',done:false}];
const store=new Store(file);for(const [scope,key]of periods)store.save(key,rows,scope,extras);
let app,page;const errors=[];
async function launch(){
 const binary=process.env.THREE_THINGS_BINARY;
 app=await electron.launch({...(binary?{executablePath:binary,args:[]}:{args:[root]}),env:{PATH:process.env.PATH,HOME:os.homedir(),TMPDIR:os.tmpdir(),THREE_THINGS_TEST_DATA:data}});
 page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
 page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#priorities textarea',{state:'attached'});
 await page.emulateMedia({reducedMotion:'reduce'});
}
async function select(scope){await page.locator('#'+scope+'-tab').click();await page.waitForFunction(s=>document.querySelector('#'+s+'-tab').getAttribute('aria-selected')==='true',scope);}
async function clear(){await page.locator('#clear-today').click();await page.waitForSelector('#undo-clear-today:not([hidden])');assert.equal(await page.locator('#extras textarea').count(),0);}
async function undo(){await page.locator('#undo-clear-today').click();await page.waitForFunction(()=>document.querySelectorAll('#priorities input:checked').length===3);assert.equal(await page.locator('#extras textarea').inputValue(),extras[0].text);assert.equal(await page.locator('.celebrate').count(),0);}
(async()=>{try{
 await launch();
 // Clear each period once, with separate Undo snapshots and no cross-period loss.
 for(const [scope,key,label]of periods){
  await select(scope);assert.equal(await page.locator('#clear-today').textContent(),label);
  await clear();assert.deepEqual(new Store(file).read(key,scope),emptyDay());
  assert.equal(new Store(file).canUndoClear(key,scope),true);
 }
 await app.close();await launch();
 for(const [scope]of periods){await select(scope);assert.equal(await page.locator('#undo-clear-today').isVisible(),true);await undo();}
 // Persistence failures retain the intended retry; no new writing can be overwritten.
 for(const [scope,key]of periods){
  await select(scope);fs.mkdirSync(file+'.tmp');await page.locator('#clear-today').click();await page.waitForSelector('#error:not([hidden])');
  assert.deepEqual(new Store(file).read(key,scope),rows);fs.rmdirSync(file+'.tmp');await page.locator('#retry').click();await page.waitForSelector('#undo-clear-today:not([hidden])');
  fs.mkdirSync(file+'.tmp');await page.locator('#undo-clear-today').click();await page.waitForSelector('#error:not([hidden])');
  assert.equal(new Store(file).canUndoClear(key,scope),true);fs.rmdirSync(file+'.tmp');await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelectorAll('#priorities input:checked').length===3);
  await clear();await page.locator('#priorities textarea').first().fill('A fresh plan');await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this Mac');
  assert.equal(await page.locator('#undo-clear-today').isVisible(),false);assert.equal(new Store(file).canUndoClear(key,scope),false);
 }
 for(const [scope,key,label]of periods){
  await select(scope);
  for(const mode of ['list','focus']){
   await page.evaluate(m=>window.threeThings.mode(m),mode);
   for(const width of [320,390,760]){
    await app.evaluate(({BrowserWindow},{width})=>BrowserWindow.getAllWindows()[0].setSize(width,440),{width});
    const box=await page.locator('#day-actions').evaluate(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert(box.left>=0&&box.right<=box.width&&!box.overflow);
    if(width===390){const image=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));fs.writeFileSync(path.join(out,`${scope}-${mode}.png`),Buffer.from(image,'base64'));}
   }
  }
  await page.locator('#clear-today').focus();await page.keyboard.press('Enter');await page.waitForSelector('#undo-clear-today:not([hidden])');
  const denied=await page.evaluate(s=>window.threeThings.clearPeriod(s,'2000-01-01'),scope);assert.equal(denied.ok,false);
  assert.equal(new Store(file).canUndoClear(key,scope),true);
 }
 const invalid=await page.evaluate(()=>window.threeThings.clearPeriod('year','2000-01-01'));assert.equal(invalid.ok,false);
 assert.deepEqual(errors,[]);
 console.log('PASS all-period clear: one click, independent persistent Undo, primary+extras, failures/retry, new-edit protection, stale-period guard, keyboard, List/Focus at 320/390/760px. Isolated data, hidden window.');
}finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
