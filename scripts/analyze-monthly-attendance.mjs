import fs from 'node:fs';
import * as XLSX from 'xlsx';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/analyze-monthly-attendance.mjs <workbook.xlsx>');
const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer', cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '', raw: false });
const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: '', raw: false })[0];
const dayColumns = headers.filter((header) => /^\d{2}$/.test(String(header)));
const countBy = (values) => Object.fromEntries([...values.reduce((map, value) => map.set(value || '(vide)', (map.get(value || '(vide)') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
const employees = rows.filter((row) => String(row["Numéro d'employé"] || '').trim());
const summaries = headers.slice(3 + dayColumns.length);
const daily = Object.fromEntries(dayColumns.map((day) => {
  const values = employees.map((row) => String(row[day] || '').trim());
  const populated = values.filter(Boolean);
  const valid = populated.filter((value) => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(value));
  return [day, { populated: populated.length, blank: values.length - populated.length, validRanges: valid.length, invalid: populated.length - valid.length, examples: populated.filter((value) => !valid.includes(value)).slice(0, 10) }];
}));
const summaryStats = Object.fromEntries(summaries.map((header) => {
  const values = employees.map((row) => String(row[header] ?? '').trim());
  const nonZero = values.filter((value) => value && !/^0(?:\.0+)?$/.test(value));
  return [header, { populated: values.filter(Boolean).length, nonZero: nonZero.length, examples: [...new Set(nonZero)].slice(0, 8) }];
}));

console.log(JSON.stringify({
  sheet: workbook.SheetNames[0],
  employees: employees.length,
  departments: countBy(employees.map((row) => String(row.Département || '').trim())),
  dayColumns,
  daily,
  employeesWithAnyPunch: employees.filter((row) => dayColumns.some((day) => String(row[day] || '').trim())).length,
  employeesWithoutPunch: employees.filter((row) => dayColumns.every((day) => !String(row[day] || '').trim())).length,
  summaryStats,
}, null, 2));
