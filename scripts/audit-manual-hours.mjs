import fs from 'node:fs';
import * as XLSX from 'xlsx';

const workbook = XLSX.read(fs.readFileSync(process.argv[2]), { type: 'buffer', cellDates: true, cellFormula: true });
const result = {};
const allPeople = [];
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const headerIndexes = matrix.map((row, index) => ({ row, index })).filter(({ row }) => row.slice(2, 33).filter((value) => /^\d{1,2}$/.test(normalize(value))).length >= 25);
  const people = [];
  for (const { index: headerIndex } of headerIndexes) {
    for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      if (headerIndexes.some((header) => header.index === rowIndex)) break;
      const row = matrix[rowIndex];
      const name = normalize(row[1]);
      const values = row.slice(2, 33).map(normalize);
      const filled = values.filter(Boolean).length;
      if (!name || filled < 1) continue;
      if (/المجموع|الساعات|الفوج|عمال|التنقيط|الاسم/.test(name)) continue;
      people.push({ sheet: sheetName, row: rowIndex + 1, id: normalize(row[0]), name, values });
    }
  }
  const valueCounts = new Map();
  for (const person of people) for (const value of person.values) if (value) valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
  const numericLike = (value) => /^\d+(?:[.,]\d+)?$/.test(value);
  const invalid = [...valueCounts].filter(([value]) => !numericLike(value) && !/^[A-Za-z+]+$/.test(value));
  const codes = [...valueCounts].filter(([value]) => /^[A-Za-z+]+$/.test(value)).sort((a, b) => b[1] - a[1]);
  const hours = [...valueCounts].filter(([value]) => numericLike(value)).sort((a, b) => Number(a[0].replace(',', '.')) - Number(b[0].replace(',', '.')));
  result[sheetName] = { headerBlocks: headerIndexes.length, peopleRows: people.length, uniqueNames: new Set(people.map((person) => person.name)).size, zktimeIds: people.filter((person) => /^[A-Z]\d{4}$/i.test(person.id)).length, numericOrMissingIds: people.filter((person) => !/^[A-Z]\d{4}$/i.test(person.id)).length, codes, hourValues: hours, invalidValues: invalid, formulas: Object.values(sheet).filter((cell) => cell?.f).length };
  allPeople.push(...people);
}

const repeated = [...allPeople.reduce((map, person) => map.set(person.name, [...(map.get(person.name) || []), `${person.sheet}:${person.row}`]), new Map())].filter(([, locations]) => locations.length > 1);
console.log(JSON.stringify({ sheets: result, totals: { personRows: allPeople.length, uniqueNames: new Set(allPeople.map((person) => person.name)).size, repeatedNames: repeated.slice(0, 30) } }, null, 2));
