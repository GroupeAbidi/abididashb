import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;

const clean = (value) => String(value || '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const number = (value) => {
  const parsed = Number(clean(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const isoDate = (value) => {
  const match = clean(value).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};

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

function articleFromRow(row, previous) {
  const values = row.items.map((item) => item.text).filter(Boolean);
  const articleIndex = values.findIndex((value) => /^ARTICLE\s*:/i.test(value));
  if (articleIndex < 0) return previous;
  const magasinIndex = values.findIndex((value) => /^MAGASIN\s*:/i.test(value));
  const gisementIndex = values.findIndex((value) => /^GISEMENT\s*:/i.test(value));
  const articleValues = values.slice(articleIndex + 1, magasinIndex > articleIndex ? magasinIndex : values.length)
    .filter((value) => value !== '(Suite)');
  if (!articleValues.length) return previous;
  const warehouse = magasinIndex >= 0 ? values[magasinIndex + 1]?.toUpperCase() : previous?.warehouse || '';
  const location = gisementIndex >= 0 ? values[gisementIndex + 1]?.toUpperCase() : previous?.location || '';
  return {
    article: articleValues[0],
    product: clean(articleValues.slice(1).join(' ')) || previous?.product || articleValues[0],
    warehouse,
    location,
    unit: location === 'GMIN' ? 'M' : location === 'GGRP' ? 'G' : previous?.unit || '',
  };
}

function aggregateRows(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = [row.date, row.article, row.product, row.unit, row.type].join('\0');
    const item = map.get(key) || { ...row, qtx: 0, movements: 0 };
    item.qtx += row.qtx;
    item.movements += 1;
    item.stock = row.stock;
    item.sequence = row.sequence;
    map.set(key, item);
  });
  return [...map.values()];
}

export async function parseMinoterieStockPdf(file) {
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const movements = [];
  const finalStocks = new Map();
  const negativeStockMap = new Map();
  const dates = [];
  let currentArticle = null;
  let sequence = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const rowsOnPage = pageRows(content.items);
    let pendingFinal = null;
    rowsOnPage.forEach((row) => {
      currentArticle = articleFromRow(row, currentArticle);
      if (/STOCK FINAL/i.test(row.text) && currentArticle) {
        pendingFinal = { ...currentArticle, page: pageNumber };
        return;
      }
      if (pendingFinal) {
        const finalText = row.items.find((item) => item.x >= 515 && /^-?[\d ]+,\d{2}$/.test(item.text))?.text;
        if (finalText) {
          const finalValue = number(finalText);
          if (finalValue < 0) negativeStockMap.set([pendingFinal.article,pendingFinal.warehouse,pendingFinal.location].join('\0'), { ...pendingFinal, stock: finalValue });
          pendingFinal = null;
        }
      }
      const dateItem = row.items.find((item) => /^\d{2}\/\d{2}\/\d{4}$/.test(item.text));
      if (dateItem && currentArticle) {
        const date = isoDate(dateItem.text);
        const incoming = number(row.items.find((item) => item.x >= 360 && item.x < 445)?.text);
        const out = number(row.items.find((item) => item.x >= 445 && item.x < 515)?.text);
        const stock = number(row.items.find((item) => item.x >= 515)?.text);
        const detail = row.text.toUpperCase();
        dates.push(date);
        let type = '';
        let qtx = 0;
        if (currentArticle.article === 'BT001' && /TRS\s*MAG\s*ENTRANT/.test(detail)) { type = 'wheatTransferIn'; qtx = incoming; }
        else if (currentArticle.article === 'BT001' && /TRS\s*MAG\s*SORTANT/.test(detail)) { type = 'wheatTransferOut'; qtx = out; }
        else if (currentArticle.article === 'BT001' && /RECEPTION/.test(detail)) { type = 'wheatReception'; qtx = incoming; }
        else if (currentArticle.article === 'BT001' && /100\s*-\s*PRODUCTION/.test(detail) && /SORTIE/.test(detail)) { type = 'wheatConsumption'; qtx = out; }
        else if (/ENT\s*PRODUCTION/.test(detail)) { type = 'production'; qtx = incoming; }
        else if (/COMMERCIAL/.test(detail) && /REINTEGRATION/.test(detail)) { type = 'reintegration'; qtx = incoming; }
        else if (/COMMERCIAL/.test(detail) && /SORTIE/.test(detail)) { type = 'sale'; qtx = out; }
        else if (/\bDON\b/.test(detail)) { type = 'donation'; qtx = out; }
        if (type && qtx) movements.push({ date, ...currentArticle, type, qtx, stock, page: pageNumber, sequence: sequence++ });
        const stockKey = [currentArticle.article, currentArticle.warehouse, currentArticle.location].join('\0');
        finalStocks.set(stockKey, { ...currentArticle, stock, page: pageNumber, date });
      }
    });
  }
  const rows = aggregateRows(movements);
  const negativeStocks = negativeStockMap.size ? [...negativeStockMap.values()] : [...finalStocks.values()].filter((row) => row.stock < 0);
  const sumType = (type) => rows.filter((row) => row.type === type).reduce((total, row) => total + row.qtx, 0);
  const sortedDates = [...new Set(dates.filter(Boolean))].sort();
  if (!rows.length || !sortedDates.length) throw new Error('Aucun mouvement Production/Ventes exploitable trouvé dans ce PDF.');
  return {
    rows,
    wheatMovements: movements.filter((row) => /^wheat/.test(row.type)),
    negativeStocks,
    totals: {
      production: sumType('production'),
      grossSales: sumType('sale'),
      reintegrations: sumType('reintegration'),
      netSales: sumType('sale') - sumType('reintegration'),
      donations: sumType('donation'),
      wheatReception: sumType('wheatReception'),
      wheatConsumption: sumType('wheatConsumption'),
    },
    meta: {
      fileName: file.name,
      pages: document.numPages,
      firstDate: sortedDates[0] || '',
      lastDate: sortedDates.at(-1) || '',
      generatedAt: new Date().toISOString(),
    },
  };
}
