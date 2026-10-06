import fs from 'node:fs';
import * as XLSX from 'xlsx';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/analyze-attendance.mjs <workbook.xlsx>');

const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const sourceRows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '' });
const rows = sourceRows.map((row) => ({
  id: String(row["Numéro d'employé"] || '').trim(),
  name: String(row.Prénom || '').trim(),
  department: String(row.Département || '').trim(),
  date: String(row.Date || '').trim(),
  time: String(row.Temps || '').trim(),
  state: String(row['Etat du pointage'] || '').trim(),
  workCode: String(row['Code de travail'] || '').trim(),
  source: String(row['Sources de données'] || '').trim(),
})).filter((row) => row.id && row.date && row.time);

const unique = [...new Map(rows.map((row) => [[row.id, row.date, row.time].join('::'), row])).values()];
const countBy = (values) => Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
const employeeDays = {};
for (const row of unique) {
  const key = `${row.id}::${row.date}`;
  (employeeDays[key] ||= []).push(row.time);
}
const dailyPunches = Object.values(employeeDays).map((times) => times.sort());
const minutes = (time) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

console.log(JSON.stringify({
  rawRows: rows.length,
  uniquePunches: unique.length,
  duplicateRows: rows.length - unique.length,
  employees: new Set(unique.map((row) => row.id)).size,
  departments: countBy(unique.map((row) => row.department)),
  dates: countBy(unique.map((row) => row.date)),
  states: countBy(unique.map((row) => row.state)),
  sources: countBy(unique.map((row) => row.source)),
  employeeDays: dailyPunches.length,
  singlePunchDays: dailyPunches.filter((times) => times.length === 1).length,
  multiPunchDays: dailyPunches.filter((times) => times.length > 1).length,
  firstPunch: {
    earliest: dailyPunches.map((times) => times[0]).sort()[0],
    latest: dailyPunches.map((times) => times[0]).sort().at(-1),
    after0800: dailyPunches.filter((times) => minutes(times[0]) > 480).length,
    after0830: dailyPunches.filter((times) => minutes(times[0]) > 510).length,
  },
  lastPunch: {
    earliest: dailyPunches.filter((times) => times.length > 1).map((times) => times.at(-1)).sort()[0],
    latest: dailyPunches.filter((times) => times.length > 1).map((times) => times.at(-1)).sort().at(-1),
  },
}, null, 2));
