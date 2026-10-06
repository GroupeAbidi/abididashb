import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;

const clean = (value) => String(value || '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const number = (value) => {
  const parsed = Number(clean(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const numberPattern = /^-?[\d .]+,\d{2}$/;
const articlePattern = /^[A-Z0-9][A-Z0-9/._-]{1,}$/i;

function pageRows(items) {
  const rows = [];
  items.filter((item) => clean(item.str)).forEach((item) => {
    const x = item.transform?.[4] || 0;
    const y = item.transform?.[5] || 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 1.8);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, text: clean(item.str) });
  });
  return rows.sort((a, b) => b.y - a.y).map((row) => {
    const sortedItems = row.items.sort((a, b) => a.x - b.x);
    return { ...row, items: sortedItems, text: clean(sortedItems.map((item) => item.text).join(' ')) };
  });
}

function familyFromText(text) {
  const match = text.match(/^FAMILLE\s*:\s*(\d+)\s*-\s*(.+)$/i);
  return match ? { code: match[1], label: clean(match[2]) } : null;
}

function subfamilyFromText(text) {
  const match = text.match(/^SOUS FAMILLE\s*:\s*([\w/-]+)\s+(.+)$/i);
  return match ? { code: match[1], label: clean(match[2]) } : null;
}

function valueInBand(items, min, max) {
  return items.find((item) => item.x >= min && item.x < max && numberPattern.test(item.text))?.text || '';
}

function parseArticleRow(row, family, subfamily, page) {
  const first = row.items[0]?.text || '';
  if (!articlePattern.test(first) || /^ARTICLE|^LIBELLE|^Q\.|^COEFF/i.test(first)) return null;

  const numericItems = row.items.filter((item) => numberPattern.test(item.text));
  if (numericItems.length < 8) return null;

  const width = Math.max(...row.items.map((item) => item.x), 1);
  const band = (ratio) => valueInBand(row.items, width * ratio[0], width * ratio[1]);
  const quantities = [band([.45, .57]), band([.57, .69]), band([.69, .81]), band([.81, 1])];
  const amounts = [
    valueInBand(row.items, width * .49, width * .58),
    valueInBand(row.items, width * .61, width * .70),
    valueInBand(row.items, width * .73, width * .82),
    valueInBand(row.items, width * .85, width * 1.01),
  ];
  const textValues = row.items.map((item) => item.text);
  const description = clean(textValues.slice(1).filter((value) => !numberPattern.test(value)).join(' '));
  const unit = textValues.find((value, index) => index > 0 && /^[A-Z]{1,5}$/.test(value)) || '';
  const packaging = textValues.find((value) => /^(UNITE|C\d+|BRQ|KG)$/i.test(value)) || '';
  const coefficient = numericItems.find((item) => item.x < width * .46)?.text || '1,00';
  if (!quantities.every(Boolean) || !amounts.every(Boolean)) return null;

  return {
    key: [first, unit, packaging, coefficient].join('|'),
    familyCode: family?.code || '',
    family: family?.label || '',
    subfamilyCode: subfamily?.code || '',
    subfamily: subfamily?.label || '',
    articleCode: first,
    description,
    unit,
    packaging,
    coefficient: number(coefficient),
    initialQuantity: number(quantities[0]),
    initialValue: number(amounts[0]),
    entriesQuantity: number(quantities[1]),
    entriesValue: number(amounts[1]),
    exitsQuantity: number(quantities[2]),
    exitsValue: number(amounts[2]),
    finalQuantity: number(quantities[3]),
    finalValue: number(amounts[3]),
    page,
  };
}

export async function parseConserverieStockPdf(file) {
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const rows = [];
  let family = null;
  let subfamily = null;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pageRows(content.items).forEach((row) => {
      const nextFamily = familyFromText(row.text);
      const nextSubfamily = subfamilyFromText(row.text);
      if (nextFamily) { family = nextFamily; subfamily = null; return; }
      if (nextSubfamily) { subfamily = nextSubfamily; return; }
      const parsed = parseArticleRow(row, family, subfamily, pageNumber);
      if (parsed) rows.push(parsed);
    });
  }
  if (!rows.length) throw new Error('Aucun article reconnu. Vérifiez que le PDF correspond au format Balance valorisée des stocks.');
  const uniqueRows = [...new Map(rows.map((row) => [row.key, row])).values()];
  const sum = (field) => uniqueRows.reduce((total, row) => total + row[field], 0);
  return {
    rows: uniqueRows,
    totals: {
      initialQuantity: sum('initialQuantity'),
      entriesQuantity: sum('entriesQuantity'),
      exitsQuantity: sum('exitsQuantity'),
      finalQuantity: sum('finalQuantity'),
      initialValue: sum('initialValue'),
      entriesValue: sum('entriesValue'),
      exitsValue: sum('exitsValue'),
      finalValue: sum('finalValue'),
    },
    meta: { fileName: file.name, pages: document.numPages, importedAt: new Date().toISOString() },
  };
}