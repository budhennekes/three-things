const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createServer}=require('./mobile-server.cjs');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=process.env.THREE_THINGS_MOBILE||`http://127.0.0.1:${server.address().port}/three-things/app/`;
try{for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
const browser=await type.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
try{const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url);await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
await page.locator('.titlebar .settings-trigger').tap();
assert.equal(await page.locator('.scene-options img').count(),3,'Three actual image previews must lead the background chooser');
await page.locator('#settings-done').tap();
const task=page.locator('#priorities textarea').first();
assert.equal(await task.getAttribute('placeholder'),'What matters most?');
await task.fill('A quiet walk before the afternoon gets busy');
await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
await page.locator('#priorities .check-wrap').first().tap();
const strike=await task.evaluate(e=>({line:getComputedStyle(e).textDecorationLine,thickness:getComputedStyle(e).textDecorationThickness,color:getComputedStyle(e).color}));
assert.equal(strike.line,'line-through');assert.equal(strike.thickness,'2px');assert.notEqual(strike.color,'rgba(0, 0, 0, 0)');
for(let i=1;i<3;i++){await page.locator('#priorities textarea').nth(i).fill(['','Finish the draft','Cook something good'][i]);await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');await page.locator('#priorities .check-wrap').nth(i).tap();await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');}
assert.equal(await page.locator('#one-more').textContent(),'+ Add an extra');
assert.equal(await page.locator('.finish-dots i').count(),3,'Saved completion has the three-dot motif');
assert.equal(await page.locator('.finish-dots i').first().evaluate(e=>getComputedStyle(e).animationName),'apple-pulse-once');
assert.equal(await page.locator('.finish-dots i').first().evaluate(e=>getComputedStyle(e).animationIterationCount),'1');
await page.locator('#one-more').tap();
assert.equal(await page.locator('#extras textarea').first().getAttribute('placeholder'),'What else is on your mind?');
assert.equal(await page.locator('#one-more').isVisible(),false,'No invitation to pile up blank extras');
await page.locator('.cancel-extra').tap();
assert.equal(await page.locator('#extras textarea').count(),0,'Cancel removes only the empty extra');
await page.locator('#one-more').tap();await page.locator('#extras textarea').first().fill('Water the plants');await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
assert.equal(await page.locator('#one-more').textContent(),'+ Add another');
const saved=()=>page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
for(const text of ['Read a few pages','Set out clothes for tomorrow']){await page.locator('#one-more').tap();await page.locator('#extras textarea').last().fill(text);await saved();}
assert.equal(await page.locator('#priorities textarea').count(),3);assert.equal(await page.locator('#extras textarea').count(),3);
await page.locator('#one-more').tap();await page.locator('.cancel-extra:visible').tap();await saved();
assert.equal(await page.locator('#extras textarea').count(),3,'Cancelling a fourth blank preserves every named extra');
assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'TEXTAREA','Cancel must not reopen editing of an earlier extra');
const last=await page.locator('#extras .extra-row').last().boundingBox(),add=await page.locator('#one-more').boundingBox();assert(add.y>=last.y+last.height,'Add another remains below the last extra');
await page.reload();await saved();assert.equal(await page.locator('#extras textarea').count(),3);assert.equal(await page.locator('.celebrate').count(),0,'Never replay dots on reload');
await task.fill('A longer completed task that wraps onto several lines without losing its clear cross-out');await saved();
assert.equal(await page.locator('#priorities input').first().isChecked(),true);assert.equal(await task.evaluate(e=>getComputedStyle(e).textDecorationLine),'none','Editing temporarily removes the strike');
await task.press('Enter');assert.equal(await task.evaluate(e=>getComputedStyle(e).textDecorationLine),'line-through');
assert.equal(await page.locator('.celebrate').count(),0,'Editing never replays the success pulse');
const out=path.resolve(__dirname,'../evidence-mobile');fs.mkdirSync(out,{recursive:true});
const metrics=[];
for(const skin of ['summer-meadow','horizon','dunes']){
 await page.locator('.titlebar .settings-trigger').tap();
 await page.locator(`[data-background="${skin}"]`).tap();
 await page.waitForFunction(s=>document.documentElement.dataset.skin===s,skin);
 await page.waitForFunction(()=>[...document.querySelectorAll('.scene-options img')].every(i=>i.complete&&i.naturalWidth>0));
 if(skin==='summer-meadow')await page.screenshot({path:path.join(out,`${name}-scenes-chooser.png`)});
 await page.locator('#settings-done').tap();await page.evaluate(()=>scrollTo(0,0));
 await page.waitForFunction(()=>document.getAnimations().length===0);
 await page.screenshot({path:path.join(out,`${name}-${skin}-polish.png`)});
 metrics.push(await page.evaluate(skin=>({skin,boxes:[...document.querySelectorAll('.titlebar,.periods,.period-meta,textarea')].filter(e=>e.getBoundingClientRect().top<innerHeight).map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,color:getComputedStyle(e).color};})}),skin));
 await page.evaluate(()=>{document.querySelector('main').style.opacity='0';document.querySelector('.titlebar').style.opacity='0';});
 await page.screenshot({path:path.join(out,`${name}-${skin}-background.png`)});
 await page.evaluate(()=>{document.querySelector('main').style.opacity='';document.querySelector('.titlebar').style.opacity='';});
 await page.reload();await saved();assert.equal(await page.evaluate(()=>document.documentElement.dataset.skin),skin);
}
fs.writeFileSync(path.join(out,`${name}-scene-metrics.json`),JSON.stringify(metrics,null,2));
await page.locator('#one-more').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${name}-extras-polish.png`)});
for(const width of [320,430]){await page.setViewportSize({width,height:740});await page.locator('#one-more').tap();await page.locator('#extras textarea').last().fill('An optional task with enough words to wrap on a narrow phone screen.');await saved();await page.locator('#extras textarea').last().press('Enter');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#week-tab').tap();await page.waitForFunction(()=>document.querySelector('#week-tab').getAttribute('aria-selected')==='true');
for(let i=0;i<3;i++){await page.locator('#priorities textarea').nth(i).fill(`Weekly example ${i+1}`);await saved();await page.locator('#priorities .check-wrap').nth(i).tap();await saved();}
assert.equal(await page.locator('.finish-dots i').first().evaluate(e=>getComputedStyle(e).animationName),'none');
await page.waitForFunction(()=>document.querySelector('#offline-state').textContent==='Ready offline');
for(const skin of ['summer-meadow','horizon','dunes'])assert(await page.evaluate(async s=>!!await caches.match(new URL(`assets/scenes/${s}.webp`,location.href).href),skin),'Scene is cached for offline use');
assert.deepEqual(errors,[]);
console.log(`PASS ${name}: scenic chooser/decode/cache/persistence; solid multiline strike; editable completion; warm placeholders; extras add/cancel/reload/narrow layouts; finite save-gated dots; Reduce Motion.`);
}finally{await browser.close();}
}}finally{server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
