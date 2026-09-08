// Browse dates without adding a calendar or changing the three-task model.
let todayKey = null, browsingDay = null;
function offsetDay(value, delta) {
  const [y,m,d] = value.split('-').map(Number), date = new Date(y,m-1,d,12);
  date.setDate(date.getDate()+delta);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function dayName() {
  if (key === todayKey) return 'Today';
  if (todayKey && key === offsetDay(todayKey,-1)) return 'Yesterday';
  if (todayKey && key === offsetDay(todayKey,1)) return 'Tomorrow';
  return 'Day';
}
function updateDayNavigation() {
  const daily = scope === 'day';
  for (const id of ['day-previous','day-next']) { const button=document.querySelector('#'+id); button.hidden=!daily; button.disabled=switching; }
  const back=document.querySelector('#back-today');back.hidden=!daily || key===todayKey;back.disabled=switching;
  const [y,m,d]=key.split('-').map(Number);
  const date = new Date(y,m-1,d,12).toLocaleDateString(undefined,{month:'short',day:'numeric',...(todayKey && y!==Number(todayKey.slice(0,4))?{year:'numeric'}:{})});
  document.querySelector('#date').textContent=daily ? `${dayName()} · ${date}` : periodLabel(key);
  document.querySelector('#compact-period').textContent=daily ? (dayName()==='Day'?date:dayName()) : {week:'This week',month:'This month'}[scope];
}
async function changeDay(target) {
  if (!loaded || switching || scope !== 'day') return;
  setBusy(true);
  try {
    if (!await flush()) return;
    const state=await api.load('day',target);
    browsingDay=state.key===state.todayKey?null:state.key;
    adopt(state);
  } catch { showNotice('Could not open that day. Your current list is still here. Try the day arrow again.'); }
  finally { setBusy(false); }
}
document.querySelector('#day-previous').addEventListener('click',()=>{void changeDay(offsetDay(key,-1));});
document.querySelector('#day-next').addEventListener('click',()=>{void changeDay(offsetDay(key,1));});
document.querySelector('#back-today').addEventListener('click',()=>{void changeDay(null);});
