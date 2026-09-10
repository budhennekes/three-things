const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('desktop and phone ship one motion, completion and extras implementation',()=>{
 for(const file of ['motion.js','finish.js','experience.css'])assert.equal(read('docs/app/'+file),read('src/'+file),`${file} must not drift between platforms; build mobile after shared changes`);
 assert(read('src/index.html').includes('src="motion.js"'));
 assert(read('src/index.html').includes('href="experience.css"'));
 assert(read('src/renderer.js').includes('What matters most?'));
 assert(!read('mobile/build.cjs').includes("file==='finish.js'?'mobile/'"));
 assert.equal(read('assets/Amicro-LICENSE.txt'),read('docs/app/assets/Amicro-LICENSE.txt'));
});
