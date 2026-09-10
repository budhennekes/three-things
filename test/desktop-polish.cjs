const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'three-shared-')),out=path.join(root,'evidence-shared');fs.mkdirSync(out,{recursive:true});
let app,page;const binary=process.env.THREE_THINGS_BINARY,errors=[],captures=[];
async function saved(){await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this Mac');}
async function mode(m){await page.evaluate(m=>window.threeThings.mode(m),m);await page.waitForFunction(m=>document.documentElement.dataset.mode===m,m);}
async function idle(){await page.waitForFunction(()=>!document.getAnimations().some(a=>a.id.startsWith('amicro-')));}
(async()=>{try{
 app=await electron.launch({...(binary?{executablePath:binary,args:[]}:{args:[root]}),env:{PATH:process.env.PATH,HOME:os.homedir(),TMPDIR:os.tmpdir(),THREE_THINGS_TEST_DATA:data}});
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await saved();
 assert(fs.existsSync(path.join(data,'Chromium')),'Actual native app must use the isolated data directory');
 assert.equal(await page.locator('#priorities textarea').first().getAttribute('placeholder'),'What matters most?');
 await page.evaluate(()=>{window.motionCalls=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){const a=animate.call(this,frames,options);motionCalls.push({id:options.id,target:this.id});return a;};});
 await page.locator('#week-tab').click();await saved();assert(await page.evaluate(()=>motionCalls.some(a=>a.id==='amicro-fade-up'&&a.target==='priorities')));
 await page.locator('#day-tab').click();await saved();
 for(let i=0;i<3;i++){await page.locator('#priorities textarea').nth(i).fill(['Make time for a longer walk before the day gets busy','Send the revised draft','Read one good chapter'][i]);await page.locator('#priorities input').nth(i).check();await saved();}
 assert.equal(await page.locator('.finish-dots i').count(),3);
 assert.equal(await page.locator('.finish-dots i').first().evaluate(e=>getComputedStyle(e).animationName),'apple-pulse-once');
 assert.equal(await page.locator('.finish-dots i').first().evaluate(e=>getComputedStyle(e).animationIterationCount),'1');
 const strike=await page.locator('#priorities textarea').first().evaluate(e=>({line:getComputedStyle(e).textDecorationLine,thickness:getComputedStyle(e).textDecorationThickness,color:getComputedStyle(e).color}));
 assert.equal(strike.line,'line-through');assert.equal(strike.thickness,'2px');assert.notEqual(strike.color,'rgba(0, 0, 0, 0)');
 await page.waitForFunction(()=>!document.querySelector('.celebrate'));await idle();
 const task=page.locator('#priorities textarea').first();await task.focus();await page.evaluate(()=>motionCalls.length=0);await task.fill('Make time for a longer walk before the afternoon gets busy');await saved();
 assert.equal(await task.evaluate(e=>getComputedStyle(e).textDecorationLine),'none');assert.equal(await page.evaluate(()=>motionCalls.length),0);await task.press('Enter');
 assert.equal(await page.locator('#priorities input:checked').count(),3);assert.equal(await page.locator('.celebrate').count(),0);
 await page.locator('#one-more').click();await page.locator('.cancel-extra:not([hidden])').click();await saved();assert.equal(await page.locator('#extras textarea').count(),0);assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'TEXTAREA');
 for(const text of ['Water the plants','Stretch for five minutes']){await page.locator('#one-more').click();await page.locator('#extras textarea').last().fill(text);await page.locator('#extras textarea').last().press('Enter');await saved();}
 assert.equal(await page.locator('#one-more').textContent(),'+ Add another');
 await page.locator('#one-more').click();await saved();await mode('compact');assert.equal(await page.locator('#one-more').textContent(),'Continue extra');
 assert.equal(await page.locator('.extras-intro').isVisible(),false);
 const mini=await page.locator('.ink span').first().evaluate(e=>({line:getComputedStyle(e).textDecorationLine,background:getComputedStyle(e).backgroundImage}));assert.equal(mini.line,'line-through');assert.equal(mini.background,'none');
 await page.locator('#one-more').click();await page.waitForFunction(()=>document.activeElement===document.querySelectorAll('#extras textarea')[2]);await page.locator('.cancel-extra:not([hidden])').click();await saved();
 const press=page.locator('#focus-toggle');await idle();await press.dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:9,clientX:10,clientY:10});
 await page.waitForFunction(()=>new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#focus-toggle')).transform).a<.97);
 await press.dispatchEvent('pointercancel',{pointerId:9});await idle();assert.equal(await press.evaluate(e=>getComputedStyle(e).transform),'none');
 await mode('focus');await idle();await page.locator('#next').click();assert(await page.evaluate(()=>motionCalls.some(a=>a.id==='amicro-fade-up')));
 await page.emulateMedia({reducedMotion:'reduce'});await idle();await page.evaluate(()=>motionCalls.length=0);await page.locator('#previous').click();await mode('list');assert.equal(await page.evaluate(()=>motionCalls.length),0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 const priorities=fs.readFileSync(path.join(data,'priorities.json'),'utf8');
 for(const skin of ['graphite','summer-meadow','horizon','dunes']){
  await app.evaluate(({Menu},skin)=>Menu.getApplicationMenu().getMenuItemById('skin-'+skin).click(),skin);
  for(const view of ['list','focus','compact']){
   await mode(view);await idle();
   if(view!=='compact')await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(430,620));
   await page.evaluate(()=>window.scrollTo(0,0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const file=`${skin}-${view}.png`;await page.screenshot({path:path.join(out,file)});captures.push({skin,view,file});
  }
 }
 assert.equal(fs.readFileSync(path.join(data,'priorities.json'),'utf8'),priorities,'Appearance and mode changes must not write task data');
 assert.equal(captures.length,12);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'verified.json'),JSON.stringify({binary:binary||'source',captures,passed:true},null,2));
 console.log('PASS native shared experience: saved one-shot dots, multiline/Compact strikes, editable completion, extras add/cancel/continue, real press interpolation/cancellation, still typing, live Reduce Motion, native backgrounds, unchanged data; 12 mode/scene captures.');
}finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
