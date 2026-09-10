const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{dayKey,weekKey}=require('../src/store.cjs');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'three-continuation-')),out=path.join(root,'evidence-v091');fs.mkdirSync(out,{recursive:true});
const three=['Walk outside','Send the draft','Read a chapter'].map(text=>({text,done:true}));
fs.writeFileSync(path.join(data,'priorities.json'),JSON.stringify({version:3,days:{[dayKey()]:three},weeks:{[weekKey()]:three},months:{}}));
let app,page;const binary=process.env.THREE_THINGS_BINARY,errors=[];
async function launch(){app=await electron.launch({...(binary?{executablePath:binary,args:[]}:{args:[root]}),env:{PATH:process.env.PATH,HOME:os.homedir(),TMPDIR:os.tmpdir(),THREE_THINGS_TEST_DATA:data}});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#priorities textarea',{state:'attached'});}
async function saved(){await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved on this Mac');}
async function mode(m){await page.evaluate(m=>window.threeThings.mode(m),m);}
(async()=>{try{await launch();await page.locator('#week-tab').click();await page.waitForFunction(()=>document.querySelector('#week-tab').getAttribute('aria-selected')==='true');assert.equal(await page.locator('#one-more').isEnabled(),true,'Continuation re-enables after loading completed periods');
for(let i=0;i<3;i++){
await page.locator('#one-more').click();assert.equal(await page.locator('#extras textarea').count(),i+1,'A named unfinished extra must not prevent another');
await page.waitForFunction(i=>document.activeElement===document.querySelectorAll('#extras textarea')[i],i);
await page.locator('#extras textarea').nth(i).fill(['Water the plants','Sketch another opening','Make time for a walk'][i]);await page.locator('#extras textarea').nth(i).press('Enter');await saved();
const g=await page.evaluate(()=>({button:document.querySelector('#one-more').getBoundingClientRect().top,last:document.querySelector('#extras li:last-child').getBoundingClientRect().bottom}));assert(g.button>=g.last,'One more thing must follow the last extra, not remain beside Well done');assert.equal(await page.locator('#one-more').textContent(),'+ Add another');
assert.equal(await page.locator('#one-more').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true,'Next-add control stays visible after creating an extra');
}
await page.screenshot({path:path.join(out,'extras-graphite.png')});assert.equal(await page.locator('#priorities input:checked').count(),3);assert.equal(await page.locator('.celebrate').count(),0);
await page.locator('#one-more').click();await saved();assert.equal(await page.locator('#one-more').isVisible(),false);await page.evaluate(()=>openExtra());assert.equal(await page.locator('#extras textarea').count(),4,'Reuse an empty editor, do not accumulate blank rows');await page.locator('#extras textarea').nth(3).fill('A fourth small thing');await saved();
await page.locator('#day-tab').click();await page.locator('#week-tab').click();await page.locator('#one-more').click();assert.equal(await page.locator('#extras textarea').count(),5);await saved();
await app.close();await launch();await page.locator('#week-tab').click();assert.equal(await page.locator('#extras textarea').count(),5);assert.equal(await page.locator('#extras textarea').first().inputValue(),'Water the plants');
await mode('compact');await page.locator('#one-more').click();await page.waitForFunction(()=>document.documentElement.dataset.mode==='list');await page.waitForFunction(()=>document.activeElement===document.querySelectorAll('#extras textarea')[4]);
for(const name of ['cream','sage','blue']){
await app.evaluate(({Menu},name)=>{const item=Menu.getApplicationMenu().getMenuItemById('skin-'+name);if(!item)throw Error('Missing color '+name);item.click();},name);
await mode('list');await page.locator('#day-tab').click();
for(const m of ['list','focus','compact']){await mode(m);const styles=await page.locator('.app').evaluate(e=>{const s=getComputedStyle(e);return{background:s.backgroundImage,color:s.backgroundColor};});assert.equal(styles.background,'none','Regular colors are truly solid, without photo or grain');await page.screenshot({path:path.join(out,name+'-'+m+'.png')});}
}
await app.close();await launch();assert.equal(await page.evaluate(()=>document.documentElement.dataset.skin),'blue');assert.deepEqual(errors,[]);
fs.writeFileSync(path.join(out,'continuation-passed.json'),JSON.stringify({binary:binary||'source',passed:true,colors:['cream','sage','blue']}));console.log('PASS continuation: completed-period button, footer below every extra, multiple unfinished extras, reuse blank, restart, Compact expansion, original three preserved; three solid colors in all modes and saved selection');
}finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
