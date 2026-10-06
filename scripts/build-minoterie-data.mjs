import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseMinoterieWorkbook } from '../src/lib/minoterie-data.js';

XLSX.set_fs(fs);

const source = 'C:/Users/Admin/Desktop/ABIDI/MINOTERIE/01-COMMERCIAL JUILLET  2026..xlsx';
const output = path.resolve('public/data/minoterie-data.json');
const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer', cellDates: true, cellFormula: true });
const data = parseMinoterieWorkbook(workbook, path.basename(source));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(data));
console.log(`Prepared Minoterie data: ${data.production.length} production shift rows, ${data.sales.length} sales rows, ${data.cash.length} cash rows.`);
