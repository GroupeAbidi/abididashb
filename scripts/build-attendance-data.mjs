import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

const source = process.argv[2];
const destination = process.argv[3] || 'public/data/attendance-transactions.json';
if (!source) throw new Error('Usage: node scripts/build-attendance-data.mjs <workbook.xlsx> [output.json]');

const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '', raw: false });
const isoDate = (value) => {
  const match = String(value).trim().match(/^(\d{2})[-/]?(\d{2})[-/]?(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value).trim();
};

const transactions = rows.map((row, index) => ({
  row: index + 3,
  employeeId: String(row["Numéro d'employé"] || '').trim(),
  employeeName: String(row.Prénom || '').trim(),
  department: String(row.Département || '').trim() || 'Non affecté',
  date: isoDate(row.Date),
  time: String(row.Temps || '').trim().slice(0, 5),
  punchState: String(row['Etat du pointage'] || '').trim(),
  workCode: String(row['Code de travail'] || '').trim(),
  source: String(row['Sources de données'] || '').trim(),
})).filter((row) => row.employeeId && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^\d{2}:\d{2}$/.test(row.time));

const output = {
  meta: {
    sourceFile: path.basename(source),
    importedAt: new Date().toISOString(),
    sheet: workbook.SheetNames[0],
  },
  transactions,
};

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(output));
console.log(`Wrote ${transactions.length} transactions to ${destination}`);
