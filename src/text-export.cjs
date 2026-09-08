const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
function formatArchive(data) {
  const lines = ['Three Things', '', 'DAILY PRIORITIES', ''];
  function period(field) {
    const keys = Object.keys(data[field] || {}).sort().reverse();
    for (const key of keys) {
      lines.push(field === 'months' ? 'Month starting ' + key : field === 'weeks' ? 'Week starting ' + key : key);
      for (const [i,row] of data[field][key].entries()) {
        const parts = row.text.split('\n');
        lines.push(`[${row.done ? 'x' : ' '}] ${i+1}. ${parts[0]}`, ...parts.slice(1).map(part => '       ' + part));
      }
      const scope = field === 'months' ? 'month' : field === 'weeks' ? 'week' : 'day';
      const extras = data.completion?.[`${scope}:${key}`]?.extras || [];
      if (extras.some(row=>row.text.trim())) {
        lines.push('OPTIONAL EXTRA TASKS');
        for (const row of extras.filter(row=>row.text.trim())) {
          const [first,...rest] = row.text.split('\n');
          lines.push(`[${row.done ? 'x' : ' '}] ${first}`,...rest.map(line=>'    '+line));
        }
      }
      lines.push('');
    }
    if (!keys.length) lines.push('No saved priorities.', '');
  }
  period('days'); lines.push('WEEKLY PRIORITIES',''); period('weeks');
  lines.push('MONTHLY PRIORITIES',''); period('months');
  return lines.join('\n');
}
function writeTextExport(file, text) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
    if (fs.readFileSync(temp, 'utf8') !== text) throw new Error('Export verification failed');
    fs.renameSync(temp, file);
  } finally { try { fs.unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
}
module.exports = { formatArchive, writeTextExport };
