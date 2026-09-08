// The clear and its undo backup are saved in one main-process transaction.
let canUndoToday = false, retryDayAction = null;
function updateDayActions() {
  const hasTasks = rows.some(row=>row.text.length) || extras.length > 0;
  const undo = canUndoToday && savedRevision === revision;
  document.querySelector('#day-actions').hidden = scope !== 'day' || key !== todayKey || (!hasTasks && !undo);
  document.querySelector('#clear-today').hidden = !hasTasks;
  document.querySelector('#clear-status').hidden = !undo;
  document.querySelector('#undo-clear-today').hidden = !undo;
  document.querySelector('#clear-today').disabled = switching;
  document.querySelector('#undo-clear-today').disabled = switching;
}
async function changeToday(action) {
  if (!loaded || switching || scope !== 'day' || key !== todayKey) return;
  retryDayAction = null;
  setBusy(true);
  let succeeded = false;
  try {
    if (!await flush()) return;
    const result = await (action === 'clear' ? api.clearToday(key) : api.undoClearToday(key));
    if (!result.ok) throw new Error(result.error);
    adopt(result.state);
    succeeded = true;
  } catch (error) {
    retryDayAction = action;
    showError(error.message || 'Could not change today. Try again.');
  } finally { setBusy(false); }
  if (succeeded) {
    if (action === 'clear') list.querySelector('textarea')?.focus();
    else document.querySelector('#clear-today').focus();
  }
}
document.querySelector('#clear-today').addEventListener('click',()=>{void changeToday('clear');});
document.querySelector('#undo-clear-today').addEventListener('click',()=>{void changeToday('undo');});
