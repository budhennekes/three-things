/* Local-only browser adapter for the shared Three Things renderer. */
(() => {
  'use strict';
  const {Store,dayKey,weekKey,validateKey}=window.ThreeModel;
  const DB='three-things-mobile-v1', observed=new Map(), listeners={};
  let connection, activeIdentity, currentMode='list', skin='summer-meadow';
  const choices=['summer-meadow','horizon','dunes','meadow','sunroom','cream','sage','blue','graphite'];
  try {const saved=localStorage.getItem('three-things-mobile-skin');if(choices.includes(saved))skin=saved;}catch{}
  document.documentElement.dataset.skin=skin;
  const view=()=>({mode:currentMode,skin,fullScreen:false,backdrop:'opaque',pin:false});
  function openDB(){
    if(connection)return connection;
    connection=new Promise((resolve,reject)=>{
      let request;try{request=indexedDB.open(DB,1);}catch{reject(Error('Storage is unavailable. Enable website storage, then reload.'));return;}
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
      request.onerror=()=>reject(Error('Could not open storage. Your existing data has not been replaced.'));
      request.onblocked=()=>reject(Error('Close other Three Things tabs, then reload.'));
    });
    return connection;
  }
  async function transaction(write,action){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state',write?'readwrite':'readonly'),table=tx.objectStore('state');
      const request=table.get('archive');let result, failure;
      request.onsuccess=()=>{try{
        const record=request.result||{archive:null,versions:{}};
        if(request.result&&(!record.archive||!record.versions||typeof record.versions!=='object'||Array.isArray(record.versions)))throw Error('Saved data could not be read. It has not been changed.');
        for(const [identity,version]of Object.entries(record.versions)){const [scope,key,...rest]=identity.split(':');validateKey(key,scope);if(rest.length||!Number.isSafeInteger(version)||version<0)throw Error('Invalid saved revision. The original data has not been changed.');}
        const store=new Store(record.archive);
        result=action(store,record.versions);
        if(write)table.put({archive:store.data,versions:record.versions},'archive');
      }catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>resolve(result);
      tx.onabort=tx.onerror=()=>reject(failure||Error('Could not save on this device. Your edits are still here. Free some storage and try again.'));
    });
  }
  function currentKey(scope){return scope==='month'?dayKey().slice(0,7)+'-01':scope==='week'?weekKey():dayKey();}
  function state(store,scope,key){return {scope,key,todayKey:dayKey(),rows:store.read(key,scope),...store.readProgress(key,scope),canUndoClear:store.canUndoClear(key,scope),...view()};}
  function checkVersion(identity,versions){
    if(!observed.has(identity)||observed.get(identity)!==(versions[identity]||0))throw Error('This list changed in another tab. Your edits are still here. Copy them before reloading; nothing was overwritten.');
  }
  async function load(scope='day',requestedDay=null){
    if(!['day','week','month'].includes(scope)||requestedDay!==null&&scope!=='day')throw Error('Invalid period');
    const key=requestedDay||currentKey(scope);validateKey(key,scope);const identity=scope+':'+key;
    const result=await transaction(false,(store,versions)=>({state:state(store,scope,key),version:versions[identity]||0}));
    if(activeIdentity===identity&&observed.has(identity)&&observed.get(identity)!==result.version){listeners.notice?.('This list changed in another tab. Reload to see it. Copy any unsaved edits first.');throw Error('Another tab changed this list');}
    observed.set(identity,result.version);activeIdentity=identity;return result.state;
  }
  async function save(payload){
    try{
      const {scope,key,rows,extras}=payload;validateKey(key,scope);const identity=scope+':'+key;
      const result=await transaction(true,(store,versions)=>{
        checkVersion(identity,versions);const before=store.readProgress(key,scope);
        store.save(key,rows,scope,extras);versions[identity]=(versions[identity]||0)+1;
        const progress=store.readProgress(key,scope);
        return {ok:true,...progress,canUndoClear:store.canUndoClear(key,scope),allComplete:rows.every(row=>row.done),justCompleted:!before.completedOnce&&progress.completedOnce,version:versions[identity]};
      });
      observed.set(identity,result.version);return result;
    }catch(error){return {ok:false,error:error.message};}
  }
  async function change(action,scope,key){
    try{
      validateKey(key,scope);if(key!==currentKey(scope))throw Error('The period changed. Switch tabs and try again.');
      const identity=scope+':'+key;
      const result=await transaction(true,(store,versions)=>{
        checkVersion(identity,versions);
        if(action==='clear')store.clearPeriod(key,scope);else store.undoClearPeriod(key,scope);
        versions[identity]=(versions[identity]||0)+1;
        return {ok:true,state:state(store,scope,key),version:versions[identity]};
      });observed.set(identity,result.version);return result;
    }catch(error){return {ok:false,error:error.message};}
  }
  function download(name,text,type){
    const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  window.threeThings={
    load,save,clearPeriod:(scope,key)=>change('clear',scope,key),undoClearPeriod:(scope,key)=>change('undo',scope,key),
    mode:async next=>{if(next==='expand')next='list';if(!['list','focus'].includes(next))throw Error('Invalid view');currentMode=next;listeners.view?.(view());return view();},
    motion:async()=>{},settings:async()=>window.openMobileSettings(),
    onView:fn=>{listeners.view=fn;},onSkin:fn=>{listeners.skin=fn;},onNotice:fn=>{listeners.notice=fn;},
    onPause:()=>{},onPeriod:()=>{},onExport:fn=>{listeners.export=fn;},
    export:async()=>{try{const archive=await transaction(false,store=>store.data);download('ThreeThings-'+dayKey()+'.txt',formatArchive(archive),'text/plain');return {ok:true};}catch(error){return {ok:false,error:error.message};}},
  };
  window.mobileBridge={
    getSkin:()=>skin,
    setSkin:async name=>{if(!choices.includes(name))throw Error('Invalid background');try{localStorage.setItem('three-things-mobile-skin',name);}catch{throw Error('Could not save this background.');}skin=name;listeners.skin?.(skin);},
    backup:async()=>{const archive=await transaction(false,store=>store.data);download('ThreeThings-backup-'+dayKey()+'.json',JSON.stringify({format:'three-things-mobile',version:1,archive},null,2),'application/json');},
    exportText:()=>listeners.export?.(),
    restore:async text=>{
      if(text.length>5*1024*1024)throw Error('Choose a Three Things backup smaller than 5 MB.');
      let parsed;try{parsed=JSON.parse(text);}catch{throw Error('This file is not a readable Three Things backup.');}
      if(!parsed||!parsed.archive||parsed.format!=='three-things-mobile'||parsed.version!==1)throw Error('This is not a Three Things mobile backup.');
      const incoming=new Store(parsed.archive);
      const added=await transaction(true,(store,versions)=>{
        let count=0;
        for(const [field,scope]of [['days','day'],['weeks','week'],['months','month']])for(const [key,rows]of Object.entries(incoming.data[field])){
          // Merge only absent periods. Never overwrite existing tasks or clear/Undo states.
          if(Object.hasOwn(store.data[field],key))continue;
          const identity=scope+':'+key;store.data[field][key]=rows;
          if(incoming.data.completion[identity])store.data.completion[identity]=incoming.data.completion[identity];
          if(incoming.data.clearUndos[identity])store.data.clearUndos[identity]=incoming.data.clearUndos[identity];
          versions[identity]=(versions[identity]||0)+1;count++;
        }
        store.commit(store.data);return count;
      });
      observed.clear();activeIdentity=null;return added;
    },
  };
})();
