const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createServer}=require('./mobile-server.cjs');
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=process.env.THREE_THINGS_MOBILE||`http://127.0.0.1:${server.address().port}/three-things/app/`;
 try{for(const [name,type]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
   // Record real WAAPI calls without substituting their behavior.
   await page.evaluate(()=>{window.motionCalls=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){const result=animate.call(this,frames,options);window.motionCalls.push({id:options.id,target:this.id,frames,options});return result;};});
   await page.locator('#week-tab').tap();await page.waitForFunction(()=>document.querySelector('#week-tab').getAttribute('aria-selected')==='true');
   assert(await page.evaluate(()=>motionCalls.some(a=>a.id==='amicro-fade-up'&&a.target==='priorities')),'Period navigation must use Amicro Fade Up');
   await page.locator('.titlebar .settings-trigger').tap();
   assert(await page.evaluate(()=>motionCalls.some(a=>a.id==='amicro-zoom-in'&&a.target==='mobile-settings')),'Settings must use Amicro Zoom In');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'settings-done','Opening motion must not delay native focus');
   assert(await page.evaluate(()=>motionCalls.some(a=>a.id==='amicro-press')),'Touch controls must use Amicro tactile press');
   const idle=()=>page.waitForFunction(()=>document.getAnimations().filter(a=>a.id.startsWith('amicro-')).length===0);
   await idle();
   const done=page.locator('#settings-done');
   // A held press must actually change the rendered scale, then cancel cleanly.
   await done.dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:9,clientX:10,clientY:10});
   await page.waitForFunction(()=>new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#settings-done')).transform).a<.97);
   await done.dispatchEvent('pointercancel',{pointerId:9});await idle();
   assert.equal(await done.evaluate(e=>getComputedStyle(e).transform),'none');
   await done.dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:9,clientX:10,clientY:10});
   await done.dispatchEvent('pointermove',{pointerId:9,clientX:30,clientY:30});await idle();
   // Real keyboard activation still invokes the button exactly once.
   await done.focus();await page.keyboard.press('Space');
   await page.waitForFunction(()=>!document.querySelector('#mobile-settings').open);
   for(let i=0;i<3;i++){
    await page.locator('.titlebar .settings-trigger').tap();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#mobile-settings').open);
   }
   await page.locator('#day-tab').tap();
   await page.waitForFunction(()=>document.querySelector('#day-tab').getAttribute('aria-selected')==='true');
   const task=page.locator('#priorities textarea').first();
   await task.fill('Make time for a quiet walk');
   await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
   await idle();await page.evaluate(()=>motionCalls.length=0);
   await task.fill('Make time for an evening walk');
   await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
   assert.equal(await page.evaluate(()=>motionCalls.length),0,'Typing must not replay motion');
   await page.locator('#focus-toggle').tap();await page.locator('#next').tap();
   assert(await page.evaluate(()=>motionCalls.some(a=>a.id==='amicro-fade-up')),'Focus stepping uses Fade Up');
   await idle();
   // Check actual intermediate frames, not just declared animation names.
   const sample=await page.evaluate(()=>{
    const row=document.querySelector('#priorities .priority:not([hidden])');
    threeMotion.fadeUp(row);const a=row.getAnimations().find(a=>a.id==='amicro-fade-up');
    a.pause();a.currentTime=60;
    return {opacity:Number(getComputedStyle(row).opacity),y:new DOMMatrixReadOnly(getComputedStyle(row).transform).m42};
   });
   assert(sample.opacity>.7&&sample.opacity<1&&sample.y>0&&sample.y<8,'Fade Up must visibly interpolate');
   await page.emulateMedia({reducedMotion:'reduce'});await idle();
   await page.evaluate(()=>motionCalls.length=0);
   await page.locator('#previous').tap();await page.locator('.titlebar .settings-trigger').tap();
   await done.tap();await page.locator('#focus-toggle').tap();
   assert.equal(await page.evaluate(()=>motionCalls.length),0,'Reduce Motion disables all added effects');
   assert.equal(await task.inputValue(),'Make time for an evening walk');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('.titlebar .settings-trigger').tap();await idle();
   const out=path.resolve(__dirname,'../evidence-mobile');fs.mkdirSync(out,{recursive:true});
   await page.screenshot({path:path.join(out,`${name}-amicro-settings.png`)});
   await done.tap();await idle();
   await page.screenshot({path:path.join(out,`${name}-amicro-list.png`)});
   for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.locator('.titlebar .settings-trigger').tap();await idle();
    assert(await done.isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow');
    await done.tap();
   }
   await page.waitForFunction(()=>document.querySelector('#offline-state').textContent==='Ready offline');
   assert(await page.evaluate(async()=>!!await caches.match(new URL('motion.js',location.href).href)),'Motion must work offline');
   assert(await page.evaluate(async()=>!!await caches.match(new URL('assets/Amicro-LICENSE.txt',location.href).href)),'MIT notice must be bundled');
   await page.reload();
   await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this device');
   assert.equal(await task.inputValue(),'Make time for an evening walk');
   assert.deepEqual(errors,[]);
   console.log(`PASS ${name}: three Amicro effects; rendered interpolation; touch/keyboard; cancel/drag; repeated dialog dismissal; typing stays still; live Reduce Motion; narrow layouts; cached motion/license; saved tasks survive reload.`);
  }finally{await browser.close();}
 }}finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
