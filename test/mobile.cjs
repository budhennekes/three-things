const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('./mobile-server.cjs');
const out=path.resolve(__dirname,'../evidence-mobile');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=process.env.THREE_THINGS_MOBILE||`http://127.0.0.1:${server.address().port}/three-things/app/`;
 const sessions=[];
 try{
 for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();sessions.push({browser,context,page,name});
  const errors=[],external=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(new URL(req.url()).origin!==new URL(url).origin)external.push(req.url());assert.equal(req.method(),'GET','Task data must never be uploaded');});
  page.on('response',res=>{if(res.status()>=400)failures.push(res.url()+':'+res.status());});
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
  assert.equal(await page.locator('#priorities textarea').count(),3);
  assert.equal(await page.locator(':focus').count(),0,'No forced keyboard on first load');
  await page.waitForFunction(()=>document.querySelector('#offline-state').textContent==='Ready offline');
  await page.screenshot({path:path.join(out,name+'-empty.png')});
  async function saved(){await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');}
  async function select(scope){await page.locator('#'+scope+'-tab').tap();await page.waitForFunction(s=>document.querySelector('#'+s+'-tab').getAttribute('aria-selected')==='true',scope);}
  for(const scope of ['day','week','month']){
   await select(scope);
   for(let i=0;i<3;i++){await page.locator('#priorities textarea').nth(i).fill(['Take a walk before the day gets busy','Finish the draft, then close the laptop','Make dinner without my phone'][i]);await saved();await page.locator('#priorities .check-wrap').nth(i).tap();await saved();}
   await page.waitForSelector('#finish:not([hidden])');assert.equal(await page.locator('#finish-title').textContent(),'Well done.');
   await page.locator('#one-more').tap();await page.locator('#extras textarea').first().fill('Water the plants');await saved();
   await page.locator('#one-more').tap();await page.locator('#extras textarea').nth(1).fill('Read a few pages');await saved();
   assert.equal(await page.locator('#priorities textarea').count(),3);
   assert.equal(await page.locator('#clear-today').textContent(),'Clear '+(scope==='day'?'today':scope));
   await page.locator('#clear-today').tap();await page.waitForSelector('#undo-clear-today:not([hidden])');assert.equal(await page.locator('#extras textarea').count(),0);
  }
  await page.reload();await saved();
  for(const scope of ['day','week','month']){await select(scope);await page.locator('#undo-clear-today').tap();await page.waitForFunction(()=>document.querySelectorAll('#priorities input:checked').length===3);assert.equal(await page.locator('#extras textarea').count(),2);assert.equal(await page.locator('.celebrate').count(),0);}
  await select('day');await page.locator('#day-next').tap();await page.waitForFunction(()=>document.querySelector('#date').textContent.startsWith('Tomorrow'));
  await page.locator('#priorities textarea').first().fill('Plan a quiet morning');await saved();await page.locator('#back-today').tap();await page.waitForFunction(()=>document.querySelector('#date').textContent.startsWith('Today'));
  assert.equal(await page.locator('#priorities textarea').first().inputValue(),'Take a walk before the day gets busy');
  // Completed wording remains editable. WebKit fallback must show long text in full.
  const long='A longer priority with enough detail to check wrapping on a phone. '.repeat(3);
  await page.locator('#priorities textarea').first().fill(long);await saved();
  await page.locator('#focus-toggle').tap();await page.waitForFunction(()=>document.documentElement.dataset.mode==='focus');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#priorities input').first().isChecked(),true);
  const sized=await page.locator('#priorities textarea').first().evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));assert(sized.scroll<=sized.client+1,JSON.stringify(sized));
  await page.locator('#priorities textarea').first().fill('Take a walk before the day gets busy');await saved();
  for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,`${name}-focus-${width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#focus-toggle').tap();await page.waitForFunction(()=>document.documentElement.dataset.mode==='list');
  await page.screenshot({path:path.join(out,name+'-list.png')});
  await page.evaluate(()=>document.documentElement.style.setProperty('font-size','32px','important'));await page.setViewportSize({width:320,height:844});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Enlarged text reflows');
  await page.evaluate(()=>document.documentElement.style.setProperty('font-size','16px','important'));await page.setViewportSize({width:390,height:844});
  // Real quota-error path: abort IndexedDB writing, keep the draft, then retry.
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(window.failMobileWrite&&this.transaction.db.name==='three-things-mobile-v1')throw new DOMException('Synthetic full disk','QuotaExceededError');return put.apply(this,args);};window.failMobileWrite=true;});
  await page.locator('#priorities textarea').first().fill('Keep this draft through a failed save');await page.waitForSelector('#error:not([hidden])');
  assert.equal(await page.locator('#priorities textarea').first().inputValue(),'Keep this draft through a failed save');
  await page.evaluate(()=>{window.failMobileWrite=false;});await page.locator('#retry').tap();await saved();
  const other=await context.newPage();await other.goto(url);await other.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
  await page.locator('#priorities textarea').first().fill('Saved by the first tab');await saved();
  await other.locator('#priorities textarea').first().fill('Unsaved second-tab draft');await other.waitForSelector('#error:not([hidden])');
  assert.match(await other.locator('#error-text').textContent(),/another tab/);await other.close();
  await page.locator('.titlebar .settings-trigger').tap();await page.waitForSelector('#mobile-settings[open]');
  await page.locator('.background-alternatives summary').tap();
  for(const skin of ['sunroom','cream','sage','blue','graphite','meadow','summer-meadow','horizon','dunes']){await page.locator(`[data-background="${skin}"]`).tap();await page.waitForFunction(s=>document.documentElement.dataset.skin===s,skin);}
  await page.screenshot({path:path.join(out,name+'-settings.png')});
  const downloaded=page.waitForEvent('download');await page.locator('#download-backup').tap();const backup=await downloaded;const backupText=fs.readFileSync(await backup.path(),'utf8');
  const data=JSON.parse(backupText);assert.equal(data.format,'three-things-mobile');assert(Object.keys(data.archive.days).length>=2);
  const restoreContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const restorePage=await restoreContext.newPage();await restorePage.goto(url);await restorePage.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
  await restorePage.locator('.titlebar .settings-trigger').tap();
  for(let i=0;i<2;i++){await restorePage.locator('#backup-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backupText)});await restorePage.waitForFunction(()=>/existing lists were kept/i.test(document.querySelector('#settings-notice').textContent));}
  await restorePage.locator('#backup-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await restorePage.waitForFunction(()=>document.querySelector('#settings-notice').textContent.includes('not a readable'));
  await restorePage.locator('#settings-done').tap();assert.equal(await restorePage.locator('#priorities textarea').first().inputValue(),'Saved by the first tab');
  await restoreContext.close();
  await page.locator('#settings-done').tap();await page.reload();await saved();assert.equal(await page.locator('#priorities textarea').first().inputValue(),'Saved by the first tab');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  console.log('PASS '+name+': touch, all periods, extras, independent Clear/Undo after reload, day planning, editable completion, long text, widths, write failure/retry, stale-tab safety, backgrounds, downloaded backup and non-overwriting restore.');
 }
 await new Promise(resolve=>server.close(resolve));
 for(const {page,context,name}of sessions){
  if(process.env.THREE_THINGS_MOBILE&&name==='webkit'){console.log('NOTE WebKit hosted network-offline emulation is unsupported here; real-server-shutdown offline reload/save is verified by the local suite.');continue;}
  if(process.env.THREE_THINGS_MOBILE)await context.setOffline(true);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
  assert.equal(await page.locator('#priorities textarea').first().inputValue(),'Saved by the first tab');
  await page.locator('#priorities textarea').first().fill('Written offline');await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#priorities textarea').value==='Written offline');
  console.log('PASS '+name+': reload, edit, save, and second reload '+(process.env.THREE_THINGS_MOBILE?'with network offline.':'after the actual server stopped.'));
 }
 }finally{server.close();for(const {browser}of sessions)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
