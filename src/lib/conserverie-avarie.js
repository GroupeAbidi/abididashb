import * as XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const clean = (value) => String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const decimal = (value) => {
  const text = clean(value).replace(/\s/g, '');
  const normalized = text.includes(',') && text.includes('.') ? text.replace(/,/g, '') : text.replace(',', '.');
  const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0;
};
const date = /^\d{2}\/\d{2}\/\d{4}$/;
const article = /^[A-Z][A-Z0-9/._-]{2,}$/i;
const reformNumber = /^\d{2}\/\d{5}$/;
const avarieCategory = (description) => {
  const value = clean(description).toUpperCase();
  if (value.startsWith('BOITE')) return 'Boîte vide';
  if (value.startsWith('CAISSE')) return 'Emballage carton';
  if (/^(MI\/CT|DCT|MCT|MC\s|CT\s|HARISSA)/.test(value)) return 'Produit fini';
  return 'Matière première';
};
const normalizeOrderDate = (value) => {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return text;
  const [, month, day, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${fullYear}`;
};

function rowsFromPage(items) {
  const grouped = [];
  items.filter((item) => clean(item.str)).forEach((item) => {
    const y = item.transform?.[5] || 0; let row = grouped.find((candidate) => Math.abs(candidate.y - y) < 1.5);
    if (!row) { row = { y, cells: [] }; grouped.push(row); }
    row.cells.push({ x: item.transform?.[4] || 0, text: clean(item.str) });
  });
  return grouped.map((row) => ({ ...row, cells: row.cells.sort((a, b) => a.x - b.x) }));
}

export async function parseConserverieAvariePdf(file) {
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const records = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
    const content = await (await document.getPage(pageNo)).getTextContent();
    rowsFromPage(content.items).forEach(({ cells }) => {
      const documentNo = cells.find((cell) => cell.x < 60 && /^\d{2}\/\d{5}$/.test(cell.text))?.text;
      const rowDate = cells.find((cell) => cell.x >= 60 && cell.x < 105 && date.test(cell.text))?.text;
      const articleCode = cells.find((cell) => cell.x >= 100 && cell.x < 150 && article.test(cell.text))?.text;
      if (!documentNo || !rowDate || !articleCode) return;
      const read = (min, max) => cells.filter((cell) => cell.x >= min && cell.x < max).map((cell) => cell.text).join(' ');
      const description = clean(read(145, 340));
      records.push({ documentNo, date: rowDate, articleCode, description, category: avarieCategory(description), unit: clean(read(340, 369)), lot: clean(read(369, 400)), location: clean(read(400, 430)), quantity: decimal(read(430, 498)), cost: decimal(read(498, 530)), amount: decimal(read(530, 620)), page: pageNo });
    });
  }
  if (!records.length) throw new Error('Aucune ligne d’avarie reconnue dans ce PDF.');
  return { records, totals: { lines: records.length, documents: new Set(records.map((r) => r.documentNo)).size, amount: records.reduce((sum, r) => sum + r.amount, 0), quantity: records.reduce((sum, r) => sum + r.quantity, 0) }, meta: { fileName: file.name, pages: document.numPages, importedAt: new Date().toISOString() } };
}

export async function parseConserverieOrdre(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }).slice(1).filter((row) => reformNumber.test(clean(row[0])));
  const orders = rows.map((row) => { const observation = clean(row[5]); return { documentNo: clean(row[0]), date: normalizeOrderDate(row[1]), warehouse: clean(row[2]), amount: decimal(row[3]), entity: clean(row[4]), observation, oualidOrder: /OUALID/i.test(observation) }; });
  if (!orders.length) throw new Error('Aucun ordre de réforme reconnu dans ce fichier Excel.');
  return { orders, totals: { documents: orders.length, amount: orders.reduce((sum, r) => sum + r.amount, 0), oualidDocuments: orders.filter((r) => r.oualidOrder).length, oualidAmount: orders.filter((r) => r.oualidOrder).reduce((sum, r) => sum + r.amount, 0) }, meta: { fileName: file.name, importedAt: new Date().toISOString() } };
}
