import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const sourceDir = 'C:/Users/GEEK/Desktop/salaire/SB';
const sources = [
  ['AGRO.xls', 'AGROSATI'],
  ['CONS.xls', 'CONSERVERIE'],
  ['GROUPE MINOT.xls', 'GROUPE'],
  ['MGK PVC.xls', 'MGK'],
  ['MINOT.xls', 'MINOTERIE'],
  ['TRANSPORT.xls', 'TRANSPORT'],
];

const clean = (value) => String(value ?? '').trim();
const number = (value) => {
  const parsed = Number(clean(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const employees = [];
for (const [fileName, company] of sources) {
  const filePath = path.join(sourceDir, fileName);
  const fileBuffer = await fs.readFile(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  for (const row of rows) {
    const employeeId = clean(row.matricule).replace(/^_+/, '').toUpperCase();
    const baseSalary = number(row.salaire);
    if (!employeeId || !baseSalary) continue;
    employees.push({
      employeeId,
      employeeName: [clean(row.nom_prn), clean(row.prenom)].filter(Boolean).join(' '),
      baseSalary,
      company,
      role: clean(row.qualif),
      sourceFile: fileName,
    });
  }
}

employees.sort((left, right) => left.employeeId.localeCompare(right.employeeId));
const output = {
  generatedAt: new Date().toISOString(),
  sources: sources.map(([fileName, company]) => ({ fileName, company })),
  employees,
};
await fs.writeFile('public/data/salary-base.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(`Saved ${employees.length} salary-base records to public/data/salary-base.json`);
