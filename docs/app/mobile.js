(() => {
  const dialog=document.querySelector('#mobile-settings'),notice=document.querySelector('#settings-notice');
  let opener,working=false;
  function reflectSkin(){for(const button of dialog.querySelectorAll('[data-background]'))button.setAttribute('aria-pressed',String(button.dataset.background===mobileBridge.getSkin()));document.querySelector('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();}
  window.openMobileSettings=()=>{if(dialog.open)return;opener=document.activeElement;reflectSkin();notice.textContent='';dialog.showModal();dialog.scrollTop=0;};
  document.querySelector('#settings-done').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>opener?.focus());
  document.querySelector('#device-info').addEventListener('click',window.openMobileSettings);
  for(const button of dialog.querySelectorAll('[data-background]'))button.addEventListener('click',async()=>{try{await mobileBridge.setSkin(button.dataset.background);reflectSkin();}catch(error){notice.textContent=error.message;}});
  async function withSaved(action){if(working||!loaded||switching)return;working=true;setBusy(true);try{if(!await flush()){notice.textContent='Your edits are not saved yet. Close Settings and try saving again.';return;}await action();}catch(error){notice.textContent=error.message||'Could not complete that action. Your saved priorities are unchanged.';}finally{setBusy(false);working=false;}}
  document.querySelector('#download-backup').addEventListener('click',()=>void withSaved(async()=>{await mobileBridge.backup();notice.textContent='Backup download requested. Keep the file somewhere private.';}));
  document.querySelector('#export-text').addEventListener('click',()=>void withSaved(async()=>{const result=await api.export();if(!result.ok)throw Error(result.error);notice.textContent='Text download requested.';}));
  const input=document.querySelector('#backup-file');
  document.querySelector('#restore-backup').addEventListener('click',()=>{if(!working)input.click();});
  input.addEventListener('change',()=>{const file=input.files[0];input.value='';if(!file)return;void withSaved(async()=>{if(file.size>5*1024*1024)throw Error('Choose a backup smaller than 5 MB.');const count=await mobileBridge.restore(await file.text());adopt(await api.load(scope,scope==='day'?browsingDay:null));notice.textContent=count?`Restored ${count} missing period${count===1?'':'s'}. Existing lists were kept.`:'No missing dates to restore. Your existing lists were kept.';});});
  // Safari versions without field-sizing still show the whole editable task.
  function fitText(){for(const text of document.querySelectorAll('textarea')){if(!text.getClientRects().length)continue;text.style.height='auto';text.style.height=Math.max(36,text.scrollHeight)+'px';text.autocapitalize='sentences';text.enterKeyHint='done';}}
  let frame;
  function queueFit(){cancelAnimationFrame(frame);frame=requestAnimationFrame(fitText);}
  new MutationObserver(queueFit).observe(document.querySelector('main'),{childList:true,subtree:true});
  new MutationObserver(queueFit).observe(document.documentElement,{attributes:true,attributeFilter:['data-mode']});
  document.addEventListener('pointerdown',event=>{if(event.target.closest('button')&&document.activeElement?.tagName==='TEXTAREA')document.activeElement.blur();});
  document.addEventListener('input',queueFit);
  window.addEventListener('resize',queueFit);
  document.fonts.ready.then(queueFit);
  window.visualViewport?.addEventListener('resize',()=>{queueFit();const el=document.activeElement;if(el?.tagName==='TEXTAREA')setTimeout(()=>el.scrollIntoView({block:'nearest'}),100);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){void rollover();queueFit();}});
  window.addEventListener('pageshow',()=>{void rollover();queueFit();});
  // Persisted success is announced by the shared save state, never by input alone.
  const offline=document.querySelector('#offline-state');
  if('serviceWorker' in navigator){
    const timer=setTimeout(()=>{offline.textContent='Offline setup pending. Keep online and reopen.';},15000);
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>{clearTimeout(timer);offline.textContent='Ready offline';}).catch(()=>{clearTimeout(timer);offline.textContent='Offline setup unavailable. Keep this page online.';});
  }else offline.textContent='Offline installation is not available in this browser.';
  reflectSkin();queueFit();
})();
