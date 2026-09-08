const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {Store}=require('../src/store.cjs');
test('a suspended extra-task opener cannot undo a concurrent Clear today',async()=>{
 const store=new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'three-race-')),'priorities.json')),key='2026-09-08';
 const original=['Walk','Write','Read'].map(text=>({text,done:true}));store.save(key,original);
 let releaseMode;const modeWait=new Promise(resolve=>{releaseMode=resolve;});
 const button={addEventListener(){},focus(){},scrollIntoView(){},setAttribute(){},classList:{toggle(){},remove(){}}};
 const ctx={loaded:true,switching:false,completedOnce:true,savedAllComplete:true,key,todayKey:key,updateDayNavigation(){},scope:'day',mode:'focus',extras:[],rows:original,revision:0,savedRevision:0,actionGeneration:0,tabs:[],list:{querySelector:()=>button},appElement:button,document:{querySelector:()=>button,querySelectorAll:()=>[]},flush:async()=>true,requestMode:()=>modeWait,applyModeLayout(){},showError(message){throw Error(message);},api:{clearToday:async()=>{store.clearToday(key);return {ok:true,state:{rows:store.read(key),extras:store.readProgress(key).extras}};}},adopt(state){ctx.rows=state.rows;ctx.extras=state.extras;},changed(){store.save(key,ctx.rows,'day',ctx.extras);}};
 vm.createContext(ctx);
 for(const file of ['finish.js','day-actions.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),ctx);
 const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');vm.runInContext(renderer.slice(renderer.indexOf('function setBusy(value)'),renderer.indexOf('function adopt(state)')),ctx);
 vm.runInContext('renderExtras=()=>{}',ctx);
 const pending=ctx.openExtra();await Promise.resolve();await ctx.changeToday('clear');assert.equal(store.canUndoToday(key),true);
 releaseMode();await pending;
 assert.equal(store.canUndoToday(key),true,'Opening an extra must not retire the clear backup');assert.deepEqual(store.readProgress(key).extras,[]);store.undoClearToday(key);assert.deepEqual(store.read(key),original);
});
