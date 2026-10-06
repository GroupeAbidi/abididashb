import fs from 'node:fs';

const transactions = JSON.parse(fs.readFileSync('public/data/attendance-transactions.json', 'utf8')).transactions;
const monthly = JSON.parse(fs.readFileSync('public/data/attendance-monthly.json', 'utf8')).employees;
const key = (row) => `${row.employeeId}|${row.date}|${row.time}`;
const unique = [...new Map(transactions.map((row) => [key(row), row])).values()];
const groups = new Map();
for (const row of unique) {
  const groupKey = `${row.employeeId}|${row.date}`;
  if (!groups.has(groupKey)) groups.set(groupKey, []);
  groups.get(groupKey).push(row.time);
}
for (const times of groups.values()) times.sort();
const dayToIso = (day) => `2026-09-${day}`;
const monthlyDays = new Map();
for (const employee of monthly) {
  for (const [day, value] of Object.entries(employee.days)) {
    if (value) monthlyDays.set(`${employee.employeeId}|${dayToIso(day)}`, value);
  }
}
const comparison = { exact: 0, sameBounds: 0, different: 0, transactionOnly: 0, monthlyOnly: 0, samples: [] };
for (const [groupKey, times] of groups) {
  const monthlyValue = monthlyDays.get(groupKey);
  if (!monthlyValue) { comparison.transactionOnly += 1; continue; }
  const transactionRange = times.length > 1 ? `${times[0]}-${times.at(-1)}` : times[0];
  if (monthlyValue === transactionRange) comparison.exact += 1;
  else {
    const monthlyParts = monthlyValue.split('-');
    if (monthlyParts[0] === times[0] && monthlyParts.at(-1) === times.at(-1)) comparison.sameBounds += 1;
    else { comparison.different += 1; if (comparison.samples.length < 20) comparison.samples.push({ key: groupKey, transaction: times, monthly: monthlyValue }); }
  }
}
for (const groupKey of monthlyDays.keys()) if (!groups.has(groupKey)) comparison.monthlyOnly += 1;
const sum = (field) => monthly.reduce((total, row) => total + Number(row[field] || 0), 0);
const hhmm = (value) => { const match = String(value || '').match(/^(\d+):(\d{2})$/); return match ? Number(match[1]) * 60 + Number(match[2]) : 0; };
const monthlyAudit = {
  employees: monthly.length,
  regularDays: sum('regularDays'), absenceDays: sum('absenceDays'), overtimeHours: sum('overtime'), annualLeave: sum('annualLeave'), sickLeave: sum('sickLeave'), missionDays: sum('missionDays'),
  lateEmployees: monthly.filter((row) => hhmm(row.late) > 0).length, lateMinutes: monthly.reduce((total, row) => total + hhmm(row.late), 0),
  earlyEmployees: monthly.filter((row) => hhmm(row.early) > 0).length, earlyMinutes: monthly.reduce((total, row) => total + hhmm(row.early), 0),
  populatedDayCells: [...monthlyDays.keys()].length,
};
console.log(JSON.stringify({ transactions: { raw: transactions.length, unique: unique.length, duplicates: transactions.length - unique.length, employeeDays: groups.size, employees: new Set(unique.map((row) => row.employeeId)).size }, monthly: monthlyAudit, comparison }, null, 2));
