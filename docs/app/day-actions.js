// Clear and the period-specific Undo snapshot share one atomic transaction.
// Keep existing element IDs so keyboard order and layout stay unchanged.
let canUndoClear = false, retryPeriodAction = null;
function updateDayActions() {
  const hasTasks = rows.some(row=>row.text.length) || extras.length > 0;
  const undo = canUndoClear && savedRevision === revision;
  const label = {day:'today',week:'week',month:'month'}[scope];
  const clear = document.querySelector('#clear-today');
  document.querySelector('#day-actions').hidden = (scope === 'day' && key !== todayKey) || (!hasTasks && !undo);
  clear.textContent = 'Clear ' + label;
  clear.title = `Clear ${scope === 'day' ? "today's" : 'this '+label+"’s"} three priorities and extra tasks. Undo is available until you start writing again.`;
  const status = {day:'Today cleared.',week:'Week cleared.',month:'Month cleared.'}[scope];
  const statusLabel = document.querySelector('#clear-label');
  if (statusLabel.textContent !== status) statusLabel.textContent = status;
  clear.hidden = !hasTasks;
  document.querySelector('#clear-status').hidden = !undo;
  document.querySelector('#undo-clear-today').hidden = !undo;
  clear.disabled = switching;
  document.querySelector('#undo-clear-today').disabled = switching;
}
async function changePeriod(action) {
  if (!loaded || switching || (scope === 'day' && key !== todayKey)) return;
  retryPeriodAction = null;
  setBusy(true);
  let succeeded = false;
  try {
    if (!await flush()) return;
    const result = await (action === 'clear' ? api.clearPeriod(scope,key) : api.undoClearPeriod(scope,key));
    if (!result.ok) throw new Error(result.error);
    adopt(result.state);
    succeeded = true;
  } catch (error) {
    retryPeriodAction = action;
    showError(error.message || 'Could not change this period. Try again.');
  } finally { setBusy(false); }
  if (succeeded) {
    if (action === 'clear') document.querySelector('#undo-clear-today')?.focus();
    else document.querySelector('#clear-today').focus();
  }
}
document.querySelector('#clear-today').addEventListener('click',()=>{void changePeriod('clear');});
document.querySelector('#undo-clear-today').addEventListener('click',()=>{void changePeriod('undo');});
