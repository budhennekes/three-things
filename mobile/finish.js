// Phone-specific continuation UI. Shared renderer and Store still own persistence.
function updateFinish() {
  const allDone=rows.every(row=>row.done&&row.text.trim())&&savedAllComplete;
  const finish=document.querySelector('#finish');
  finish.hidden=!allDone&&!(completedOnce&&extras.length);
  const title=document.querySelector('#finish-title'),next=allDone?'Well done.':'Your extras';
  if(title.textContent!==next)title.textContent=next;
  document.querySelector('#finish-count').textContent=allDone?'3 of 3 complete':'Your original three come first.';
  finish.classList.toggle('has-extras',extras.length>0);
  const add=document.querySelector('#one-more');
  add.textContent=extras.some(row=>row.text.trim())?'+ Add another':'+ Add an extra';
  add.disabled=switching||savedRevision!==revision;
  add.hidden=(!allDone&&!extras.length)||extras.some(row=>!row.text.trim());
  document.querySelector('#extras').hidden=extras.length===0;
  if(!allDone)appElement.classList.remove('celebrate');
}
function renderExtras() {
  const container=document.querySelector('#extras');container.replaceChildren();
  extras.forEach((row,index)=>{
    const li=document.createElement('li');li.className='extra-row';
    const text=document.createElement('textarea');text.rows=1;text.maxLength=240;text.name=`extra-${index+1}`;
    text.value=row.text;text.placeholder='What else is on your mind?';
    text.setAttribute('aria-label',`Extra task ${index+1}`);
    const check=document.createElement('input');check.type='checkbox';check.name=`complete-extra-${index+1}`;
    check.setAttribute('aria-label',`Complete extra task ${index+1}`);
    const cancel=document.createElement('button');cancel.type='button';cancel.className='cancel-extra';cancel.textContent='Cancel';
    cancel.setAttribute('aria-label',`Cancel empty extra ${index+1}`);
    function sync(){li.classList.toggle('done',row.done);check.checked=row.done;check.disabled=!row.text.trim();check.hidden=!row.text.trim();cancel.hidden=!!row.text.trim();}
    text.addEventListener('input',()=>{row.text=text.value;if(!row.text.trim())row.done=false;sync();changed();});
    text.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();text.blur();}});
    check.addEventListener('change',()=>{row.done=check.checked;sync();changed();});
    cancel.addEventListener('click',()=>{
      if(switching||row.text.trim())return;
      const current=extras.indexOf(row);if(current<0)return;
      extras.splice(current,1);renderExtras();changed();
      document.querySelector('#finish-title').focus({preventScroll:true});
    });
    li.append(text,check,cancel);container.append(li);sync();
  });
  updateFinish();
}
async function openExtra() {
  if(!loaded||switching||!completedOnce)return;
  const generation=actionGeneration,period=key,periodScope=scope;
  const current=()=>!switching&&actionGeneration===generation&&key===period&&scope===periodScope;
  if(!await flush()||!current())return;
  if(mode!=='list')await requestMode('list');
  if(!current())return;
  let index=extras.findIndex(row=>!row.text.trim());
  if(index<0){
    if(extras.length>=100){showNotice('This period has 100 extra tasks. Your work is saved.');return;}
    index=extras.length;extras.push({text:'',done:false});renderExtras();changed();
  }
  const editor=document.querySelectorAll('#extras textarea')[index];
  editor?.focus();editor?.scrollIntoView({block:'nearest',behavior:'instant'});
}
function finishMoment() {
  clearTimeout(finishTimer);appElement.classList.remove('celebrate');
  if(document.hidden)return;
  document.querySelector('#finish').scrollIntoView({block:'nearest',behavior:'instant'});
  if(reducedMotion.matches)return;
  void document.querySelector('#finish').offsetWidth;
  appElement.classList.add('celebrate');
  finishTimer=setTimeout(()=>appElement.classList.remove('celebrate'),1800);
}
document.querySelector('#one-more').addEventListener('click',()=>{void openExtra();});
