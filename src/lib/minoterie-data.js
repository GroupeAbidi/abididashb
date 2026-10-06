import * as XLSX from 'xlsx';

const clean = (value) => (value == null ? '' : String(value).trim());
const normalizeSheetName = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, '').toUpperCase();
const findSheet = (workbook, names) => {
  const wanted = names.map(normalizeSheetName);
  const entry = workbook.SheetNames.find((sheetName) => wanted.includes(normalizeSheetName(sheetName)));
  return entry ? workbook.Sheets[entry] : undefined;
};
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const numeric = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(clean(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const cell = (sheet, column, row) => sheet?.[`${column}${row}`]?.v;
const sheetRange = (sheet) => XLSX.utils.decode_range(sheet?.['!ref'] || 'A1:A1');
const rowMatches = (sheet, row, pattern) => {
  const range = sheetRange(sheet);
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const value = clean(sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })]?.v);
    if (pattern.test(value)) return true;
  }
  return false;
};
const findRow = (sheet, pattern, startRow = 1) => {
  const range = sheetRange(sheet);
  for (let row = Math.max(startRow, range.s.r + 1); row <= range.e.r + 1; row += 1) {
    if (rowMatches(sheet, row, pattern)) return row;
  }
  return 0;
};
const rowNumber = (sheet, row, preferredColumn) => {
  if (!row) return 0;
  const preferred = numeric(cell(sheet, preferredColumn, row));
  if (preferred) return preferred;
  const range = sheetRange(sheet);
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const value = numeric(sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })]?.v);
    if (value) return value;
  }
  return 0;
};

function isoDate(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const match = clean(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

function titleDate(value) {
  return isoDate(clean(value).replace(/^.*?(?:DU|DE)\s+/i, ''));
}

function normalizeShift(value) {
  const source = clean(value).toUpperCase();
  const match = source.match(/(16H-00H|00H-08H|08H-16H)/);
  return match?.[1] || source;
}

function normalizeProduct(value) {
  const source = clean(value).toUpperCase().replace(/\s+/g, ' ');
  if (/^FB[- ]?50/.test(source)) return 'Farine 50 kg';
  if (/^FB[- ]?25/.test(source)) return 'Farine 25 kg';
  if (/FB.?10|10 KG/.test(source)) return 'Farine 10 kg';
  if (/05KG|5 KG|KRAFT 05/.test(source)) return 'Farine 5 kg';
  if (/SEMOU|SMOUL/.test(source)) return 'Semoule';
  if (/SON/.test(source)) return /25/.test(source) ? 'Son 25 kg' : 'Son 50 kg';
  if (/ZWEL|ZWAL|ZAWEL|ZEWAL/.test(source)) return 'Zewal';
  if (/DECH/.test(source)) return 'Déchet';
  return source || 'Autre produit';
}

function reportDates(sheet) {
  const dates = [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let row = range.s.r; row <= Math.min(range.e.r, 10); row += 1) for (let column = range.s.c; column <= range.e.c; column += 1) {
    const date = isoDate(sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v);
    if (date) dates.push(date);
  }
  return [...new Set(dates)].sort();
}

function parseProductionRecap(workbook, fileName) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const titleRow = matrix.findIndex((row) => row.some((value) => /R.CAP DES ENTR.ES PRODUCTIONS/i.test(clean(value))));
  if (titleRow < 0) return null;
  const dates = reportDates(sheet);
  const periodDates = dates.length >= 2 ? dates.slice(0, 2) : dates;
  const date = periodDates.at(-1) || '';
  const production = [];
  for (let index = titleRow + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    const code = clean(row[0]);
    if (/^TOTAL/i.test(code)) break;
    const rawProduct = clean(row[1]);
    const quantity = numeric(row[4]);
    if (!code || !rawProduct || !quantity) continue;
    production.push({ date, unit: 'M', product: normalizeProduct(rawProduct), rawProduct, article: code, shift: 'Récap mensuel', sacks: quantity, qtx: quantity, sourceQuantity: quantity, sourceUnit: 'qtx', sourceFile: fileName, aggregate: true });
  }
  const month = date.slice(0, 7);
  return { production, wheat: [], sales: [], recoveries: [], checks: [], cash: [], meta: { fileName, month, firstDate: periodDates[0] || date, lastDate: date, replaceMonths: { production: month ? [month] : [] }, generatedAt: new Date().toISOString() } };
}

function parseSalesPriceList(workbook, fileName) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const productRow = matrix.findIndex((row) => clean(row[0]).toUpperCase() === 'CLIENT' && row.filter((value) => /QT|KG|FARINE|SON|ZWAL|DECHET|TRANSPORT/i.test(clean(value))).length >= 3);
  if (productRow < 0) return null;
  const headers = matrix[productRow].map((value, column) => ({ column, value: clean(value) })).filter((item) => item.column > 0 && item.value);
  const dates = reportDates(sheet);
  const periodDates = dates.length >= 2 ? dates.slice(0, 2) : dates;
  const date = periodDates.at(-1) || '';
  const sales = [];
  for (let rowIndex = productRow + 2; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    const client = clean(row[0]);
    if (!client || /^TOT(?:\.|AL)/i.test(client)) continue;
    headers.forEach((header, headerIndex) => {
      const quantity = numeric(row[header.column]);
      if (!quantity) return;
      const nextColumn = headers[headerIndex + 1]?.column ?? row.length;
      let price = 0;
      for (let column = header.column + 1; column < nextColumn; column += 1) if (numeric(row[column])) price = numeric(row[column]);
      const rawProduct = header.value.replace(/\s*\/\s*UNITE.*$/i, '').replace(/^"|"$/g, '').trim();
      const service = /PRESTATION/i.test(rawProduct);
      sales.push({ date, bon: '', client, unit: 'M', product: normalizeProduct(rawProduct), rawProduct, qtx: service ? 0 : quantity, sourceQuantity: quantity, sourceUnit: service ? 'service' : 'qtx', amount: quantity * price, price, internal: false, service, sourceFile: fileName, aggregate: true });
    });
  }
  const officialRevenueRow = matrix.find((row) => /TOTAL G.N.RAL VALEUR/i.test(clean(row[0])));
  const officialRevenue = numeric(officialRevenueRow?.find((value) => numeric(value)));
  const calculatedRevenue = sales.reduce((total, row) => total + row.amount, 0);
  if (officialRevenue && calculatedRevenue) sales.forEach((row) => { row.amount *= officialRevenue / calculatedRevenue; });
  const month = date.slice(0, 7);
  return { production: [], wheat: [], sales, recoveries: [], checks: [], cash: [], meta: { fileName, month, firstDate: periodDates[0] || date, lastDate: date, replaceMonths: { sales: month ? [month] : [] }, generatedAt: new Date().toISOString() } };
}

export function parseSupplementalMinoterieWorkbook(workbook, fileName) {
  return parseProductionRecap(workbook, fileName) || parseSalesPriceList(workbook, fileName);
}

function parseProduction(workbook) {
  const sheet = workbook.Sheets.PRODUCTION;
  const production = [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    const date = titleDate(cell(sheet, 'D', row));
    if (!date || !/PRODUCTION DU/i.test(clean(cell(sheet, 'D', row)))) continue;
    const unit = /SARL GROUPE/i.test(clean(cell(sheet, 'A', row))) ? 'G' : 'M';
    const headerRow = row + 1;
    let sacksColumn = -1;
    let qtxColumn = -1;
    for (let column = 1; column <= 10; column += 1) {
      const address = XLSX.utils.encode_cell({ r: headerRow - 1, c: column });
      const header = clean(sheet[address]?.v).toUpperCase();
      if (/NBR.*SACS/.test(header)) sacksColumn = column;
      if (/QT.*QTX/.test(header)) qtxColumn = column;
    }
    if (sacksColumn < 0 || qtxColumn < 0) continue;
    const shifts = [];
    for (let column = 1; column < sacksColumn; column += 1) {
      const header = clean(sheet[XLSX.utils.encode_cell({ r: headerRow - 1, c: column })]?.v);
      if (header) shifts.push({ column, label: normalizeShift(header), friday: /VEND/i.test(header) });
    }
    for (let detailRow = row + 2; detailRow <= row + 18; detailRow += 1) {
      const rawProduct = clean(cell(sheet, 'A', detailRow));
      if (/^TOTAL$/i.test(rawProduct)) break;
      if (!rawProduct) continue;
      const sacks = number(sheet[XLSX.utils.encode_cell({ r: detailRow - 1, c: sacksColumn })]?.v);
      const qtx = number(sheet[XLSX.utils.encode_cell({ r: detailRow - 1, c: qtxColumn })]?.v);
      if (!sacks && !qtx) continue;
      const conversion = sacks ? qtx / sacks : 0;
      shifts.forEach((shift) => {
        const shiftSacks = number(sheet[XLSX.utils.encode_cell({ r: detailRow - 1, c: shift.column })]?.v);
        if (!shiftSacks) return;
        production.push({
          date, unit, product: normalizeProduct(rawProduct), rawProduct, shift: shift.label,
          friday: shift.friday, sacks: shiftSacks, qtx: shiftSacks * conversion,
        });
      });
    }
  }
  return production;
}

function parseWheat(workbook) {
  const sheet = workbook.Sheets.LIVRAISON;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let start = 0;
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    if (/SUIVI BLE TENDRE/i.test(clean(cell(sheet, 'A', row)))) start = row;
  }
  const wheat = [];
  if (!start) return wheat;
  for (let row = start + 2; row <= Math.min(start + 18, range.e.r + 1); row += 1) {
    [['B', 'C', 'D'], ['H', 'I', 'J']].forEach(([dateCol, groupCol, millCol]) => {
      const date = isoDate(cell(sheet, dateCol, row));
      if (!date) return;
      wheat.push({ date, unit: 'G', qtx: number(cell(sheet, groupCol, row)), source: 'SUIVI BLÉ TENDRE' });
      wheat.push({ date, unit: 'M', qtx: number(cell(sheet, millCol, row)), source: 'SUIVI BLÉ TENDRE' });
    });
  }
  return wheat;
}

function deliveryUnits(workbook) {
  const sheet = workbook.Sheets.LIVRAISON;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const map = new Map();
  let active = false;
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    if (/JOURNEE DE/i.test(clean(cell(sheet, 'I', row)))) active = true;
    if (/^TOTAL LIVRES/i.test(clean(cell(sheet, 'A', row)))) active = false;
    const bon = cell(sheet, 'A', row);
    const unit = clean(cell(sheet, 'L', row)).toUpperCase();
    if (active && typeof bon === 'number' && unit) map.set(String(bon), unit);
  }
  return map;
}

function parseCommercial(workbook) {
  const sheet = workbook.Sheets['JOURNEE COMMERCIAL'];
  const units = deliveryUnits(workbook);
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const sales = [];
  const recoveries = [];
  let date = '';
  let currentClient = '';
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    const title = clean(cell(sheet, 'A', row));
    if (/JOURNEE COMMERCIAL DU/i.test(title)) {
      date = titleDate(title);
      currentClient = '';
      continue;
    }
    if (!date) continue;
    const clientValue = clean(cell(sheet, 'B', row));
    if (clientValue && !/NOM DU CLIENTS|TOTAL|SARL GROUPE/i.test(clientValue)) currentClient = clientValue;
    if (/^TOTAL$/i.test(title)) currentClient = '';
    const bon = clean(cell(sheet, 'A', row));
    const unit = units.get(bon) || '';
    const flourQty = number(cell(sheet, 'C', row));
    const flourProduct = clean(cell(sheet, 'E', row));
    if (flourQty && flourProduct) sales.push({
      date, bon, client: currentClient || 'Client non renseigné', unit,
      product: normalizeProduct(flourProduct), rawProduct: flourProduct, qtx: flourQty,
      amount: number(cell(sheet, 'G', row)), price: number(cell(sheet, 'F', row)),
      internal: /DONNE USINE/i.test(currentClient),
    });
    const otherQty = number(cell(sheet, 'K', row));
    const otherProduct = clean(cell(sheet, 'M', row));
    if (otherQty && otherProduct) sales.push({
      date, bon, client: currentClient || 'Client non renseigné', unit,
      product: normalizeProduct(otherProduct), rawProduct: otherProduct, qtx: otherQty,
      amount: number(cell(sheet, 'O', row)), price: number(cell(sheet, 'N', row)),
      internal: /DONNE USINE/i.test(currentClient),
    });
    const recoveryName = clean(cell(sheet, 'P', row));
    const recoveryAmount = number(cell(sheet, 'Q', row));
    if (recoveryAmount && recoveryName && !/^TOTAL$/i.test(recoveryName)) recoveries.push({ date, client: recoveryName, amount: recoveryAmount });
  }
  return { sales, recoveries };
}

function parseChecks(workbook) {
  const sheet = workbook.Sheets.CLASSEUR;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const checks = [];
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    const date = isoDate(cell(sheet, 'B', row));
    if (!date) continue;
    for (let next = row + 1; next <= Math.min(row + 38, range.e.r + 1); next += 1) {
      if (/^TOTAL$/i.test(clean(cell(sheet, 'A', next)))) {
        checks.push({ date, cash: number(cell(sheet, 'C', next)), cheque: number(cell(sheet, 'D', next)) });
        break;
      }
    }
  }
  return checks;
}

function parseCash(workbook) {
  const sheet = workbook.Sheets.CAISSE;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let start = 0;
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    if (/SUIVI CAISSE.*MOIS/i.test(clean(cell(sheet, 'B', row)))) start = row + 3;
  }
  const cash = [];
  let date = '';
  for (let row = start; row <= range.e.r + 1; row += 1) {
    if (/^TOTAL$/i.test(clean(cell(sheet, 'B', row)))) break;
    const parsedDate = isoDate(cell(sheet, 'B', row));
    if (parsedDate) date = parsedDate;
    if (!date) continue;
    const receipt = number(cell(sheet, 'C', row));
    const otherExpense = number(cell(sheet, 'D', row));
    const millExpense = number(cell(sheet, 'E', row));
    const officialBalanceRaw = cell(sheet, 'F', row);
    const hasOfficialBalance = officialBalanceRaw !== undefined && officialBalanceRaw !== null && officialBalanceRaw !== '';
    const officialBalance = number(officialBalanceRaw);
    const note = clean(cell(sheet, 'G', row));
    if (receipt || otherExpense || millExpense || note || hasOfficialBalance) cash.push({ date, receipt, otherExpense, millExpense, officialBalance, hasOfficialBalance, note, row });
  }
  return cash;
}

export function parseMinoterieWorkbook(workbook, fileName = 'Minoterie.xlsx') {
  const required = ['JOURNEE COMMERCIAL', 'LIVRAISON', 'PRODUCTION', 'CLASSEUR', 'CAISSE'];
  const missing = required.filter((name) => !workbook.Sheets[name]);
  if (missing.length) throw new Error(`Feuilles manquantes : ${missing.join(', ')}`);
  const production = parseProduction(workbook);
  const wheat = parseWheat(workbook);
  const { sales, recoveries } = parseCommercial(workbook);
  const checks = parseChecks(workbook);
  const cash = parseCash(workbook);
  const dates = [...new Set([...production, ...wheat, ...sales, ...recoveries].map((row) => row.date).filter(Boolean))].sort();
  return {
    production, teamProduction: production, wheat, sales, recoveries: recoveries.map((row) => ({ ...row, sourceFile: fileName })), checks, cash,
    meta: { fileName, month: dates[0]?.slice(0, 7) || '', firstDate: dates[0] || '', lastDate: dates.at(-1) || '', generatedAt: new Date().toISOString() },
  };
}

export async function parseMinoterieFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true });
  const specialized = parseSupplementalMinoterieWorkbook(workbook, file.name);
  if (specialized) return specialized;
  return parseMinoterieWorkbook(workbook, file.name);
}

export async function parseWheatTrackingFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const rows = [];
  const parsedSheets = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    const headerRow = matrix.findIndex((row) => row.some((value) => /POIDS\s*CCLS/i.test(clean(value))) && row.some((value) => /POIDS\s*ABIDI/i.test(clean(value))));
    if (headerRow < 0) return;
    const headers = matrix[headerRow].map(clean);
    const totalColumn = headers.findIndex((value) => /TOTAL\s*\/\s*JR/i.test(value));
    let currentDate = '';
    let sheetRows = 0;
    for (let index = headerRow + 1; index < matrix.length; index += 1) {
      const row = matrix[index];
      if (/^TOTAL\b/i.test(clean(row[0]))) break;
      const parsedDate = isoDate(row[0]);
      if (parsedDate) currentDate = parsedDate;
      const destinationText = clean(row[1]);
      const destination = /MINOTERIE/i.test(destinationText) ? 'Minoterie' : /GROUPE/i.test(destinationText) ? 'Groupe' : '';
      if (!currentDate || !destination) continue;
      const cclsKg = numeric(row[2]);
      const abidiKg = numeric(row[3]);
      if (!(cclsKg > 1000) || !(abidiKg > 1000)) continue;
      const gapKg = abidiKg - cclsKg;
      const reportedGapKg = numeric(row[4]);
      rows.push({
        date: currentDate, destination, unit: destination === 'Groupe' ? 'G' : 'M',
        cclsKg, abidiKg, gapKg, shortageKg: Math.max(0, -gapKg), surplusKg: Math.max(0, gapKg),
        reportedGapKg, observation: clean(row[5]), dailyTotalCclsKg: parsedDate && totalColumn >= 0 ? numeric(row[totalColumn]) : 0,
        sourceSheet: sheetName, sourceRow: index + 1,
      });
      sheetRows += 1;
    }
    if (sheetRows) parsedSheets.push(sheetName);
  });
  if (!rows.length) throw new Error('Aucune pesée exploitable trouvée dans ce fichier.');
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  return {
    rows,
    meta: { fileName: file.name, firstDate: dates[0], lastDate: dates.at(-1), month: months.length === 1 ? months[0] : '', months, sheets: parsedSheets, generatedAt: new Date().toISOString() },
  };
}

export async function parseEncaissementFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true });
  const collections = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) return;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    let headerRow = 0;
    for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
      if (/REÇU\s*\/\s*BRC/i.test(clean(cell(sheet, 'A', row))) && /MONTANT/i.test(clean(cell(sheet, 'M', row)))) { headerRow = row; break; }
    }
    if (!headerRow) return;
    for (let row = headerRow + 1; row <= range.e.r + 1; row += 1) {
      const date = isoDate(cell(sheet, 'B', row));
      const client = clean(cell(sheet, 'F', row));
      const amount = number(cell(sheet, 'M', row));
      if (!date || !client || !amount) continue;
      collections.push({
        receipt: clean(cell(sheet, 'A', row)), date, clientCode: clean(cell(sheet, 'D', row)), client,
        mode: clean(cell(sheet, 'I', row)), reference: clean(cell(sheet, 'K', row)),
        bank: clean(cell(sheet, 'L', row)), amount, sourceFile: file.name, sourceSheet: sheetName,
      });
    }
  });
  if (!collections.length) throw new Error('Aucun encaissement valide trouvé dans le fichier.');
  const seen = new Set();
  return collections.filter((row) => {
    const key = [row.receipt, row.date, row.clientCode, row.client, row.reference, row.amount].join('\0');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function parseCostAccountingFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true });
  const recap = findSheet(workbook, ['RECAP', 'RÉCAP']);
  const costing = findSheet(workbook, ['COUT DE REVIENT', 'COUT DE REVIENTS']);
  const consumption = findSheet(workbook, ['CONSOMATION SAC + ETIQ', 'CONSOMMATION SAC + ETIQ', 'CONSOMMATION SACS ET ETIQUETTES']);
  if (!recap || !costing) {
    throw new Error(`Le fichier doit contenir les feuilles RECAP et COUT DE REVIENT. Feuilles trouvées : ${workbook.SheetNames.join(', ')}`);
  }

  const periodText = clean(cell(recap, 'A', 1));
  const periodMatches = [...periodText.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  const toIso = (match) => match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
  const startDate = toIso(periodMatches[0]);
  const endDate = toIso(periodMatches[1]);
  const month = (endDate || startDate).slice(0, 7);
  const totalRow = findRow(costing, /^TOTAL$/i, 3);

  const fixedCosts = [];
  for (let row = 4; row <= 12; row += 1) {
    const label = clean(cell(recap, 'C', row));
    if (label) fixedCosts.push({ label, amount: numeric(cell(recap, 'D', row)), costPerQtx: numeric(cell(recap, 'E', row)), share: numeric(cell(recap, 'F', row)), type: 'Charge fixe' });
  }
  const variableCosts = [];
  for (let row = 14; row <= 17; row += 1) {
    const label = clean(cell(recap, 'C', row));
    if (label) variableCosts.push({ label, amount: numeric(cell(recap, 'D', row)), costPerQtx: numeric(cell(recap, 'E', row)), share: numeric(cell(recap, 'F', row)), type: 'Charge variable' });
  }

  const products = [];
  for (let row = 3; row <= (totalRow || 40) - 1; row += 1) {
    const code = clean(cell(costing, 'A', row));
    if (!code || /^TOTAL$/i.test(code)) continue;
    const product = clean(cell(costing, 'B', row));
    const quantityQtx = numeric(cell(costing, 'C', row));
    if (!product || !quantityQtx) continue;
    products.push({
      code, product, quantityQtx,
      packagingCost: numeric(cell(costing, 'F', row)), allocatedCost: numeric(cell(costing, 'G', row)),
      totalCost: numeric(cell(costing, 'H', row)), bags: numeric(cell(costing, 'I', row)),
      costPerBag: numeric(cell(costing, 'J', row)), salePricePerBag: numeric(cell(costing, 'K', row)),
      marginPerBag: numeric(cell(costing, 'L', row)), profit: numeric(cell(costing, 'M', row)),
      costPerQtx: numeric(cell(costing, 'N', row)),
    });
  }

  const materials = [];
  if (consumption) {
    const range = XLSX.utils.decode_range(consumption['!ref'] || 'A1:E1');
    for (let row = 3; row <= range.e.r + 1; row += 1) {
      const code = clean(cell(consumption, 'A', row));
      if (!code || /^TOTAL$/i.test(code)) continue;
      materials.push({ code, label: clean(cell(consumption, 'B', row)), quantity: numeric(cell(consumption, 'C', row)), averageCost: numeric(cell(consumption, 'D', row)), amount: numeric(cell(consumption, 'E', row)) });
    }
  }

  const detailSheets = ['BACHIR MGS', 'AUTRE DEPENSE PAR CAISSE', 'AUTRE DEPENSE', 'REBOBINAGE', 'REPARATIONS CYLINDRES'];
  const expenseDetails = [];
  detailSheets.forEach((sheetName) => {
    const sheet = findSheet(workbook, [sheetName]);
    if (!sheet?.['!ref']) return;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let row = 2; row <= range.e.r + 1; row += 1) {
      const code = clean(cell(sheet, 'A', row));
      const amount = numeric(cell(sheet, 'G', row));
      if (!code || /^TOTAL$/i.test(code) || !amount) continue;
      expenseDetails.push({ sheet: sheetName, code, date: isoDate(cell(sheet, 'B', row)), category: clean(cell(sheet, 'D', row)), thirdParty: clean(cell(sheet, 'E', row)), reference: clean(cell(sheet, 'F', row)), amount });
    }
  });

  const totalProduction = numeric(cell(costing, 'C', totalRow));
  const totalPackaging = numeric(cell(costing, 'F', totalRow));
  const allocatedCosts = numeric(cell(costing, 'G', totalRow));
  const totalCost = numeric(cell(costing, 'H', totalRow)) || rowNumber(recap, findRow(recap, /TOTAL.*(?:CHARGE|COUT)/i), 'D');
  const totalBags = numeric(cell(costing, 'I', totalRow));
  const grossMargin = numeric(cell(costing, 'M', totalRow));
  const vatRow = findRow(costing, /\bTVA\b/i, totalRow || 1);
  const stampRow = findRow(costing, /TIMBRE/i, vatRow || 1);
  const netMarginRow = findRow(costing, /MARGE\s+(?:NETTE?|FINALE|APR[EÈ]S\s+TVA\s*\+?\s*TIMBRE)|RESULTAT\s+NET/i, stampRow || 1);
  const vat = rowNumber(costing, vatRow, 'M');
  const stampDuty = rowNumber(costing, stampRow, 'M');
  const importedNetMargin = rowNumber(costing, netMarginRow, 'M');
  const netMargin = importedNetMargin || grossMargin - vat - stampDuty;
  const theoreticalRevenue = products.reduce((total, row) => total + row.salePricePerBag * row.bags, 0);

  return {
    fixedCosts, variableCosts, products, materials, expenseDetails,
    totals: {
      fixedCosts: numeric(cell(recap, 'D', 13)), variableCosts: numeric(cell(recap, 'D', 18)),
      totalCost, averageCostPerQtx: numeric(cell(recap, 'E', 19)), allocatedCosts,
      totalProduction, totalPackaging, totalBags, theoreticalRevenue, grossMargin, vat, stampDuty, netMargin,
    },
    meta: { fileName: file.name, startDate, endDate, month, periodText, ignoredSheets: workbook.SheetNames.includes('Feuil1') ? ['Feuil1'] : [], generatedAt: new Date().toISOString() },
  };
}

export async function parseBalanceClientFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) throw new Error('Le fichier Balance Client est vide.');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let headerRow = 0;
  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    if (/^CODE$/i.test(clean(cell(sheet, 'A', row))) && /SOLDE ANT[ÉE]RIEUR/i.test(clean(cell(sheet, 'E', row))) && /PAIEMENT/i.test(clean(cell(sheet, 'L', row)))) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) throw new Error('Colonnes Code, Solde Antérieur, Chiffre Affaire, Paiement et Solde introuvables.');
  const rows = [];
  for (let row = headerRow + 1; row <= range.e.r + 1; row += 1) {
    const clientCode = clean(cell(sheet, 'A', row));
    const client = clean(cell(sheet, 'B', row));
    if (!/^C\d+$/i.test(clientCode) || !client) continue;
    rows.push({
      clientCode, client, opening: number(cell(sheet, 'E', row)), sales: number(cell(sheet, 'I', row)),
      payments: number(cell(sheet, 'L', row)), balance: number(cell(sheet, 'N', row)),
      share: number(cell(sheet, 'Q', row)),
    });
  }
  if (!rows.length) throw new Error('Aucun client valide trouvé dans la balance.');
  const total = (field) => rows.reduce((sum, row) => sum + row[field], 0);
  let totalRow = 0;
  for (let row = headerRow + 1; row <= range.e.r + 1; row += 1) {
    if (/TOTAL G[ÉE]N[ÉE]RAL/i.test(clean(cell(sheet, 'A', row)))) { totalRow = row; break; }
  }
  const rowOpening = total('opening');
  const rowSales = total('sales');
  const rowPayments = total('payments');
  const rowBalance = total('balance');
  const officialOpening = totalRow ? number(cell(sheet, 'D', totalRow)) : rowOpening;
  const officialSales = totalRow ? number(cell(sheet, 'H', totalRow + 1)) : rowSales;
  const officialPayments = totalRow ? number(cell(sheet, 'K', totalRow)) : rowPayments;
  const officialBalance = totalRow ? number(cell(sheet, 'M', totalRow + 1)) : rowBalance;
  const startDate = isoDate(cell(sheet, 'G', 4));
  const endDate = isoDate(cell(sheet, 'K', 4));
  return {
    rows,
    totals: {
      opening: officialOpening, sales: officialSales, payments: officialPayments, balance: officialBalance,
      positiveBalance: rows.reduce((sum, row) => sum + Math.max(0, row.balance), 0),
      advances: rows.reduce((sum, row) => sum + Math.max(0, -row.balance), 0),
      rowOpening, rowSales, rowPayments, rowBalance,
      reconciliationGap: officialBalance - rowBalance,
    },
    meta: { fileName: file.name, startDate, endDate, generatedAt: new Date().toISOString() },
  };
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Each monthly commercial workbook is an independent period. A newer file for
// the same month replaces that section; files from other months stay active.
export function mergeMinoterieData(datasets) {
  const valid = datasets.filter(Boolean);
  const additiveFields = ['production', 'teamProduction', 'wheat', 'sales', 'recoveries', 'collections', 'checks', 'cash'];
  const merged = Object.fromEntries(additiveFields.map((field) => {
    let rows = [];
    valid.forEach((data) => {
      const replaceMonths = data.meta?.replaceMonths?.[field] || [];
      if (replaceMonths.length) rows = rows.filter((row) => !replaceMonths.includes(row.date?.slice(0, 7)));
      rows.push(...(data[field] || []));
    });
    return [field, uniqueRows(rows)];
  }));
  const fields = additiveFields;
  const dates = [...new Set(fields.flatMap((field) => merged[field].map((row) => row.date).filter(Boolean)))].sort();
  const fileNames = [...new Set(valid.flatMap((data) => data.meta?.fileNames || [data.meta?.fileName]).filter(Boolean))];
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const clientBalances = Object.assign({}, ...valid.map((data) => data.clientBalances || {}));
  const costAccountingByMonth = Object.assign({}, ...valid.map((data) => data.costAccountingByMonth || {}));
  const clientBalance = valid.map((data) => data.clientBalance).filter(Boolean).at(-1);
  const stockPdf = valid.map((data) => data.stockPdf).filter(Boolean).at(-1);
  const wheatTracking = valid.map((data) => data.wheatTracking).filter(Boolean).at(-1);
  return {
    ...merged,
    ...(Object.keys(clientBalances).length ? { clientBalances } : {}),
    ...(Object.keys(costAccountingByMonth).length ? { costAccountingByMonth } : {}),
    ...(clientBalance ? { clientBalance } : {}),
    ...(stockPdf ? { stockPdf } : {}),
    ...(wheatTracking ? { wheatTracking } : {}),
    meta: {
      fileName: fileNames.length === 1 ? fileNames[0] : `${fileNames.length} fichiers importés`,
      fileNames,
      months,
      month: months.length === 1 ? months[0] : '',
      firstDate: dates[0] || '',
      lastDate: dates.at(-1) || '',
      collectionFile: valid.map((data) => data.meta?.collectionFile).filter(Boolean).at(-1) || '',
      collectionCount: merged.collections.length,
      cashFile: valid.filter((data) => data.cash?.length).map((data) => data.meta?.fileName).filter(Boolean).at(-1) || '',
      balanceFile: valid.map((data) => data.meta?.balanceFile).filter(Boolean).at(-1) || '',
      balanceClientCount: clientBalance?.rows?.length || 0,
      stockPdfFile: stockPdf?.meta?.fileName || '',
      wheatTrackingFile: wheatTracking?.meta?.fileName || '',
      generatedAt: new Date().toISOString(),
    },
  };
}

export function aggregate(rows, keyFn, valueFn) {
  const values = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    values.set(key, (values.get(key) || 0) + valueFn(row));
  });
  return [...values.entries()].map(([key, value]) => ({ key, value }));
}
