import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const source = process.argv[2];
const destination = process.argv[3] || 'public/data/attendance-monthly.json';
if (!source) throw new Error('Usage: node scripts/build-monthly-attendance-data.mjs <workbook.xlsx> [output.json]');
const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer', cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: '', raw: false });
const headers = matrix[0];
const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '', raw: false });
const dayColumns = headers.filter((header) => /^\d{2}$/.test(String(header)));
const stamp = workbook.SheetNames[0].match(/^(20\d{2})(\d{2})(\d{2})/);
const populatedDays = dayColumns.filter((day) => rows.some((row) => String(row[day] || '').trim())).map(Number);
let period = stamp ? `${stamp[1]}-${stamp[2]}` : '';
if (stamp && populatedDays.length && Math.max(...populatedDays) > Number(stamp[3])) {
  const previous = new Date(Date.UTC(Number(stamp[1]), Number(stamp[2]) - 2, 1));
  period = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}
const employees = rows.filter((row) => String(row["Numéro d'employé"] || '').trim()).map((row) => ({
  employeeId: String(row["Numéro d'employé"]).trim(), employeeName: String(row.Prénom || '').trim(), department: String(row.Département || '').trim() || 'Non affecté',
  days: Object.fromEntries(dayColumns.map((day) => [day, String(row[day] || '').trim()])),
  regularDays: Number(row['Régulier(D)'] || 0), late: String(row['En retard(HH:MM)'] || '').trim(), early: String(row['Départ anticipé(HH:MM)'] || '').trim(), absenceDays: Number(row['Absence(D)'] || 0),
  overtime: Number(row['HS normales(H)'] || 0), annualLeave: Number(row['Congé annuel(D)'] || 0), sickLeave: Number(row['Congé maladie(D)'] || 0), missionDays: Number(row['MISSION(D)'] || 0), exitPermit: String(row['BON DE SORTIE(HH:MM)'] || '').trim(),
}));
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify({ meta: { sourceFile: path.basename(source), importedAt: new Date().toISOString(), sheet: workbook.SheetNames[0], period, dayColumns }, employees }));
console.log(`Wrote ${employees.length} employees to ${destination}`);
