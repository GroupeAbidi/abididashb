import * as XLSX from 'xlsx';

const clean = (value) => String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const number = (value) => {
  const parsed = Number(clean(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const datePattern = /^\d{2}\/\d{2}\/\d{4}/;

export async function parseConserverieBrs(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null, raw: false });
  const rows = matrix.slice(2).filter((row) => datePattern.test(clean(row[1])) && clean(row[3])).map((row) => ({
    regularization: clean(row[0]),
    date: clean(row[1]),
    type: clean(row[2]),
    articleCode: clean(row[3]),
    description: clean(row[4]),
    supplierRef: clean(row[5]),
    unit: clean(row[6]),
    lot: clean(row[7]),
    location: clean(row[8]),
    quantity: number(row[9]),
    cost: number(row[10]),
    amount: number(row[11]),
  }));
  if (!rows.length) throw new Error('Aucune ligne de régularisation reconnue dans ce fichier Excel.');
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  return {
    rows,
    metrics: {
      lines: rows.length,
      documents: new Set(rows.map((row) => row.regularization)).size,
      articles: new Set(rows.map((row) => row.articleCode)).size,
      quantity: sum('quantity'),
      amount: sum('amount'),
      negativeQuantity: rows.filter((row) => row.quantity < 0).length,
      negativeAmount: rows.filter((row) => row.amount < 0).length,
      missingCost: rows.filter((row) => row.cost === 0).length,
      corrections: rows.filter((row) => row.type === 'CORRECTION ERREUR').length,
      packagingConversions: rows.filter((row) => row.type === 'CONVERSION EMBALLAGE').length,
      productConversions: rows.filter((row) => row.type === 'CONVERSION PRODUIT').length,
    },
    meta: { fileName: file.name, sheet: workbook.SheetNames[0], importedAt: new Date().toISOString() },
  };
}
