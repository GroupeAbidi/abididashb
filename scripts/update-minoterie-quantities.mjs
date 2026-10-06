import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { mergeMinoterieData, parseSupplementalMinoterieWorkbook } from '../src/lib/minoterie-data.js';

const output = path.resolve('public/data/minoterie-data.json');
const current = JSON.parse(fs.readFileSync(output, 'utf8'));
current.production = (current.production || []).filter((row) => !row.aggregate);
current.sales = (current.sales || []).filter((row) => !row.aggregate);
const sources = process.argv.slice(2);
if (!sources.length) throw new Error('Provide production and/or sales workbook paths.');
const additions = sources.map((source) => {
  const workbook = XLSX.read(fs.readFileSync(source), { type: 'buffer', cellDates: true, cellFormula: true });
  const parsed = parseSupplementalMinoterieWorkbook(workbook, path.basename(source));
  if (!parsed) throw new Error(`Unsupported Minoterie summary format: ${source}`);
  return parsed;
});
const merged = mergeMinoterieData([current, ...additions]);
fs.writeFileSync(output, JSON.stringify(merged));
console.log(JSON.stringify({ files: merged.meta.fileNames, months: merged.meta.months, productionRows: merged.production.length, salesRows: merged.sales.length }, null, 2));
