import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const root = process.cwd();
const cashFile = 'C:\\Users\\GEEK\\Desktop\\ABIDI\\TRANSPORT\\transp 1.xlsx';
const commercialRoot = 'C:\\Users\\GEEK\\Desktop\\ABIDI\\MINOTERIE\\commercial files';
const outputFile = path.join(root, 'Calcul_Resultat_Transport_Par_Camion.xlsx');
const clean = (value) => value == null ? '' : String(value).trim();
const value = (input) => Number(input) || 0;
const iso = (input) => input instanceof Date && !Number.isNaN(input.getTime())
  ? `${input.getFullYear()}-${String(input.getMonth() + 1).padStart(2, '0')}-${String(input.getDate()).padStart(2, '0')}` : '';
const normalize = (text) => clean(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
const sum = (rows, field) => rows.reduce((total, row) => total + value(row[field]), 0);

function filesBelow(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name.toLowerCase() === 'all' ? [] : filesBelow(target);
    return entry.name.startsWith('~$') || !/\.xlsx?$/i.test(entry.name) ? [] : [target];
  });
}

function solveRates(observations, activeIndexes) {
  const size = activeIndexes.length;
  if (!size) return [0, 0, 0, 0];
  const matrix = Array.from({ length: size }, () => Array(size + 1).fill(0));
  observations.forEach(({ quantities, total }) => {
    activeIndexes.forEach((sourceIndex, row) => {
      activeIndexes.forEach((targetIndex, column) => { matrix[row][column] += quantities[sourceIndex] * quantities[targetIndex]; });
      matrix[row][size] += quantities[sourceIndex] * total;
    });
  });
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    if (Math.abs(matrix[pivot][pivot]) < 1e-9) continue;
    const divisor = matrix[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) matrix[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let column = pivot; column <= size; column += 1) matrix[row][column] -= factor * matrix[pivot][column];
    }
  }
  const rates = [0, 0, 0, 0];
  activeIndexes.forEach((sourceIndex, index) => { rates[sourceIndex] = Math.round(matrix[index][size] * 100) / 100; });
  return rates;
}

function parseCommercial(file) {
  const workbook = XLSX.readFile(file, { cellDates: true, cellFormula: true });
  const sheetName = workbook.SheetNames.find((name) => /^TRANSPORT$/i.test(name.trim()));
  if (!sheetName) return null;
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => /^DATE$/i.test(clean(cell))) && row.some((cell) => /QUANTITE/i.test(clean(cell))));
  if (headerIndex < 0) return null;
  const headers = matrix[headerIndex];
  const dateColumn = headers.findIndex((cell) => /^DATE$/i.test(clean(cell)));
  const destinationColumns = headers.map((cell, column) => ({ column, destination: normalize(cell).replace(/^QUANTITE\s*/, '') }))
    .filter((item) => /QUANTITE/i.test(clean(headers[item.column])));
  const totalColumn = headers.findIndex((cell) => /MONTANT|TOTAL/i.test(normalize(cell)));
  const daily = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (/^TOTAL$/i.test(clean(row?.[dateColumn]))) break;
    const date = iso(row?.[dateColumn]);
    if (!date) continue;
    const quantities = destinationColumns.map(({ column }) => value(row[column]));
    const total = totalColumn >= 0 ? value(row[totalColumn]) : 0;
    if (quantities.some(Boolean) || total) daily.push({ date, quantities, total, sourceFile: path.basename(file), sourceRow: index + 1 });
  }
  if (!daily.length) return null;
  const month = daily[0].date.slice(0, 7);
  const activeIndexes = destinationColumns.map((_, index) => daily.some((row) => row.quantities[index]) ? index : -1).filter((index) => index >= 0);
  const rates = solveRates(daily, activeIndexes);
  const maxResidual = Math.max(...daily.map((row) => Math.abs(row.total - row.quantities.reduce((total, quantity, index) => total + quantity * rates[index], 0))));

  let ccls = null;
  const wheatTitle = matrix.findIndex((row) => /TRANSPORT/.test(normalize(row?.join(' '))) && /\bBLE\b/.test(normalize(row?.join(' '))));
  if (wheatTitle >= 0) {
    const wheatHeaderIndex = matrix.slice(wheatTitle + 1, wheatTitle + 5).findIndex((row) => /ROTATION/.test(normalize(row?.join(' '))));
    if (wheatHeaderIndex >= 0) {
      const headerRowIndex = wheatTitle + 1 + wheatHeaderIndex;
      const wheatHeaders = matrix[headerRowIndex];
      const rotationColumn = wheatHeaders.findIndex((cell) => /ROTATION/.test(normalize(cell)));
      const priceColumn = wheatHeaders.findIndex((cell) => /PRIX/.test(normalize(cell)));
      const wheatTotalColumn = wheatHeaders.findIndex((cell) => /^TOTAL/.test(normalize(cell)));
      for (let index = headerRowIndex + 1; index < Math.min(headerRowIndex + 5, matrix.length); index += 1) {
        const rotations = rotationColumn >= 0 ? value(matrix[index]?.[rotationColumn]) : 0;
        const price = priceColumn >= 0 ? value(matrix[index]?.[priceColumn]) : 0;
        const total = wheatTotalColumn >= 0 ? value(matrix[index]?.[wheatTotalColumn]) : rotations * price;
        if (rotations || total) { ccls = { month, rotations, price, total: total || rotations * price, sourceFile: path.basename(file), sourceRow: index + 1 }; break; }
      }
    }
  }
  return { month, daily, rates, destinations: destinationColumns.map((item) => item.destination), maxResidual, ccls, sourceFile: path.basename(file) };
}

const parsedCommercial = filesBelow(commercialRoot).map((file) => {
  try { return parseCommercial(file); } catch { return null; }
}).filter(Boolean);
const commercialByMonth = [...new Map(parsedCommercial.map((item) => [item.month, item])).values()].sort((a, b) => a.month.localeCompare(b.month));

const revenueRows = [];
const skikdaTurn = { value: 0 };
for (const monthData of commercialByMonth) {
  for (const day of monthData.daily) {
    day.quantities.forEach((quantity, index) => {
      if (!quantity) return;
      const destination = monthData.destinations[index];
      const rate = monthData.rates[index];
      const sourceRevenue = quantity * rate;
      if (/GUELMA/.test(destination)) {
        revenueRows.push({ date: day.date, month: monthData.month, unit: 'CAMION_GUELMA', destination, quantity, rotations: 1, rate, revenue: sourceRevenue, sourceFile: day.sourceFile, sourceRow: day.sourceRow, confidence: 'Règle fournie' });
      } else if (/SKIKDA/.test(destination)) {
        let remaining = quantity;
        while (remaining > 0) {
          const tripQuantity = Math.min(100, remaining);
          const unit = skikdaTurn.value % 2 === 0 ? 'D10_SKIKDA_1' : 'D10_SKIKDA_2';
          skikdaTurn.value += 1;
          revenueRows.push({ date: day.date, month: monthData.month, unit, destination, quantity: tripQuantity, rotations: 1, rate, revenue: tripQuantity * rate, sourceFile: day.sourceFile, sourceRow: day.sourceRow, confidence: 'Rotation automatique trajet par trajet' });
          remaining -= tripQuantity;
        }
      } else {
        revenueRows.push({ date: day.date, month: monthData.month, unit: 'ROUTE_NON_AFFECTEE', destination, quantity, rotations: 1, rate, revenue: sourceRevenue, sourceFile: day.sourceFile, sourceRow: day.sourceRow, confidence: 'Aucune règle camion fournie' });
      }
    });
  }
  if (monthData.ccls?.total) revenueRows.push({ date: `${monthData.month}-01`, month: monthData.month, unit: 'CAMION_CCLS', destination: 'CCLS / BLÉ', quantity: 0, rotations: monthData.ccls.rotations, rate: monthData.ccls.price, revenue: monthData.ccls.total, sourceFile: monthData.ccls.sourceFile, sourceRow: monthData.ccls.sourceRow, confidence: 'Total mensuel du fichier Commercial' });
}

const cashWorkbook = XLSX.readFile(cashFile, { cellDates: true, cellFormula: true });
const cashMatrix = XLSX.utils.sheet_to_json(cashWorkbook.Sheets[cashWorkbook.SheetNames[0]], { header: 1, defval: null, raw: true });
const cashRows = cashMatrix.slice(3).map((row, index) => ({ date: iso(row[0]), bon: clean(row[1]), description: clean(row[2]), receipt: value(row[6]), expense: value(row[7]), balance: value(row[8]), sourceRow: index + 4 }))
  .filter((row) => row.date && (row.receipt || row.expense));

function expenseCategory(text) {
  const source = normalize(text);
  if (/GASOIL|GSOIL|CARBURANT/.test(source)) return 'Gasoil';
  if (/MISSION/.test(source)) return 'Mission';
  if (/ASSURANCE/.test(source)) return 'Assurance';
  if (/PNEU/.test(source)) return 'Pneus';
  if (/VIDANGE|HUILE/.test(source)) return 'Vidange';
  if (/REPAR|DEPANN|RADIATEUR|CARDAN|SCANER|MECANICIEN/.test(source)) return 'Réparation';
  if (/PIECE|PLAQUETTE|DURITE|FILTRE|CULASS|BOUGIE|JOINT|FLEXIB/.test(source)) return 'Pièces';
  if (/AMENDE/.test(source)) return 'Amende';
  return 'Autre';
}

function expenseDisposition(text) {
  const source = normalize(text);
  if (/CLIO|KIA|LIFAN|DFSK|DACIA|CHARIOT|VEHICULE LHADJ|USINE/.test(source)) return { unit: 'ADMINISTRATION', reason: 'Véhicule administratif exclu' };
  if (/ALIMENTATION CAISSE|VERSEMENT BDL|VERST BDL|REMBOURSEMENT ALIMENTATION|COUVRIR CHEQUE|COUVRIRE CHEQUE/.test(source)) return { unit: 'MOUVEMENT_TRESORERIE', reason: 'Transfert/financement exclu des charges camion' };
  if (/\bPAIE\b|CNAS|CNRC|REGISTRE|LEGALISATION|MEDECINE DE TRAV|JUDICI|NOTAIRE|RECLAMATION/.test(source)) return { unit: 'CHARGE_GENERALE_EXCLUE', reason: 'Charge générale sans affectation camion' };
  if (/BOURCHEROUCHE/.test(source)) return { unit: 'D10_SKIKDA_1', reason: 'Nom associé au D10 Bourcherouche' };
  if (/\bWAHAB\b/.test(source)) return { unit: 'D10_SKIKDA_2', reason: 'Nom associé au D10 Wahab' };
  if (/SKIKIDA/.test(source)) return { unit: 'SKIKDA_A_REPARTIR', reason: 'Destination Skikda, D10 exact non identifiable' };
  if (/GUELMA/.test(source)) return { unit: 'CAMION_GUELMA', reason: 'Destination Guelma' };
  if (/\bCCLS\b|CAMION DE BLE|TRANSPORT BLE/.test(source)) return { unit: 'CAMION_CCLS', reason: 'Mention CCLS/transport blé' };
  return { unit: 'DEPENSE_NON_AFFECTEE', reason: 'Aucun camion ni trajet identifiable dans le libellé' };
}

function monetaryTokens(text) {
  const tokens = [];
  const regex = /\b\d{3,7}(?:[.,]\d{2})\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) tokens.push({ amount: Number(match[0].replace(',', '.')), index: match.index });
  return tokens.filter((token) => token.amount > 0);
}

function splitExpense(row) {
  const source = normalize(row.description);
  const hasMission = /MISSION/.test(source);
  const hasFuel = /GASOIL|GSOIL|CARBURANT/.test(source);
  if (!(hasMission && hasFuel)) return [{ category: expenseCategory(source), amount: row.expense, split: 'Catégorie unique déduite du libellé' }];
  const tokens = monetaryTokens(source);
  const tokenTotal = tokens.reduce((total, token) => total + token.amount, 0);
  if (!tokens.length || tokenTotal > row.expense + 0.01) return [{ category: 'Mission + Gasoil non chiffré', amount: row.expense, split: 'Montants individuels absents ou ambigus' }];
  const positions = [
    { category: 'Mission', index: source.indexOf('MISSION') },
    { category: 'Gasoil', index: Math.max(source.indexOf('GASOIL'), source.indexOf('GSOIL'), source.indexOf('CARBURANT')) },
    { category: 'Vidange', index: Math.max(source.indexOf('HUILE'), source.indexOf('VIDANGE')) },
  ].filter((item) => item.index >= 0);
  const parts = tokens.map((token) => {
    const nearest = [...positions].sort((a, b) => Math.abs(a.index - token.index) - Math.abs(b.index - token.index))[0];
    return { category: nearest?.category || 'Autre', amount: token.amount, split: 'Montant explicite extrait du libellé' };
  });
  const remainder = Math.round((row.expense - tokenTotal) * 100) / 100;
  if (remainder > 0.01) parts.push({ category: 'Mission', amount: remainder, split: 'Reste du bon après extraction des montants explicites' });
  return parts;
}

const expenseParts = cashRows.filter((row) => row.expense).flatMap((row) => {
  const disposition = expenseDisposition(row.description);
  return splitExpense(row).map((part, index) => ({ ...row, ...part, ...disposition, part: index + 1 }));
});

const comparableStart = '2026-01-01';
const comparableEnd = '2026-02-28';
const comparableRevenue = revenueRows.filter((row) => row.date >= comparableStart && row.date <= comparableEnd);
const comparableExpenses = expenseParts.filter((row) => row.date >= comparableStart && row.date <= comparableEnd);
const units = [
  ['CAMION_GUELMA', 'Camion Guelma (K66 ou HD65)'],
  ['D10_SKIKDA_1', 'D10 Skikda 1 — Bourcherouche'],
  ['D10_SKIKDA_2', 'D10 Skikda 2 — Wahab'],
  ['CAMION_CCLS', 'Camion CCLS'],
];
const resultRows = units.map(([unit, label]) => {
  const revenues = comparableRevenue.filter((row) => row.unit === unit);
  const expenses = comparableExpenses.filter((row) => row.unit === unit);
  const revenue = sum(revenues, 'revenue');
  const expense = sum(expenses, 'amount');
  return { unit, label, trips: sum(revenues, 'rotations'), quantity: sum(revenues, 'quantity'), revenue, directExpense: expense, directNet: revenue - expense, margin: revenue ? (revenue - expense) / revenue : 0 };
});

const sharedSkikda = comparableExpenses.filter((row) => row.unit === 'SKIKDA_A_REPARTIR');
const sharedSkikdaTotal = sum(sharedSkikda, 'amount');
if (sharedSkikdaTotal) {
  resultRows.filter((row) => /^D10_SKIKDA/.test(row.unit)).forEach((row) => {
    row.allocatedExpense = sharedSkikdaTotal / 2;
    row.totalExpense = row.directExpense + row.allocatedExpense;
    row.netAfterAllocation = row.revenue - row.totalExpense;
  });
}
resultRows.forEach((row) => {
  row.allocatedExpense ||= 0;
  row.totalExpense ||= row.directExpense;
  row.netAfterAllocation ??= row.directNet;
});

function makeSheet(headers, rows, widths, moneyColumns = [], percentColumns = []) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(2, rows.length + 1)}` };
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  moneyColumns.forEach((column) => { for (let row = 2; row <= rows.length + 1; row += 1) if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = '#,##0.00'; });
  percentColumns.forEach((column) => { for (let row = 2; row <= rows.length + 1; row += 1) if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = '0.00%'; });
  return sheet;
}

const workbook = XLSX.utils.book_new();
const hypotheses = [
  ['CALCUL AUTOMATIQUE — TRANSPORT PAR CAMION'],
  ['Période principale comparable', `${comparableStart} → ${comparableEnd} (janvier et février complets dans les deux sources)`],
  ['Camion Guelma', 'Toutes les recettes Guelma sont regroupées dans une seule unité: K66 ou HD65, sans choix journalier.'],
  ['Skikda', 'Chaque tranche de 100 qtx est traitée comme un trajet. Les trajets alternent automatiquement D10-1 puis D10-2.'],
  ['CCLS', 'Une seule unité. Recette mensuelle = nombre de rotations × prix unitaire dans la section TRANSPORT BLÉ.'],
  ['Dépenses combinées', 'Mission + Gasoil est séparé lorsque les montants sont explicitement lisibles. Sinon le montant reste signalé comme combiné.'],
  ['Assurance', 'Incluse uniquement si elle peut être liée à un camion.'],
  ['Voitures administratives', 'Exclues du résultat camion.'],
  ['Mouvements de trésorerie', 'Alimentation caisse, versements BDL et remboursements internes sont exclus des charges opérationnelles.'],
  ['Charges générales', 'Paie, CNAS, juridique et administration sans camion identifiable sont exclues du résultat individuel.'],
  ['Limite importante', 'Les dépenses sans camion, destination ou alias identifiable restent dans DEPENSES_NON_AFFECTEES; elles ne sont pas attribuées arbitrairement.'],
  ['Mars', 'Le fichier caisse s’arrête au 23/03/2026. Mars est donc présenté séparément et n’entre pas dans le résultat comparable principal.'],
];
const hypothesisSheet = XLSX.utils.aoa_to_sheet(hypotheses);
hypothesisSheet['!cols'] = [{ wch: 34 }, { wch: 115 }];
hypothesisSheet['!merges'] = [XLSX.utils.decode_range('A1:B1')];
XLSX.utils.book_append_sheet(workbook, hypothesisSheet, 'HYPOTHESES');

XLSX.utils.book_append_sheet(workbook, makeSheet(
  ['Code', 'Unité de calcul', 'Trajets/rotations', 'Quantité qtx', 'Revenu transport DA', 'Dépenses directes DA', 'Dépenses Skikda réparties DA', 'Total dépenses affectées DA', 'Résultat net identifiable DA', 'Marge %', 'Qualité du résultat'],
  resultRows.map((row) => [row.unit, row.label, row.trips, row.quantity, row.revenue, row.directExpense, row.allocatedExpense, row.totalExpense, row.netAfterAllocation, row.revenue ? row.netAfterAllocation / row.revenue : 0, 'Hors dépenses non affectées']),
  [23, 38, 20, 18, 23, 24, 29, 28, 30, 14, 30], ['D', 'E', 'F', 'G', 'H', 'I'], ['J']), 'RESULTAT_JAN_FEV');

XLSX.utils.book_append_sheet(workbook, makeSheet(
  ['Date', 'Mois', 'Unité', 'Destination', 'Quantité qtx', 'Rotations', 'Tarif déduit DA', 'Revenu DA', 'Fichier Commercial', 'Ligne', 'Méthode d’affectation'],
  revenueRows.map((row) => [row.date, row.month, row.unit, row.destination, row.quantity, row.rotations, row.rate, row.revenue, row.sourceFile, row.sourceRow, row.confidence]),
  [14, 13, 24, 20, 17, 14, 20, 20, 37, 12, 42], ['E', 'G', 'H']), 'REVENUS_DETAIL');

XLSX.utils.book_append_sheet(workbook, makeSheet(
  ['Date', 'N° Bon', 'Partie', 'Unité affectée', 'Catégorie', 'Montant DA', 'Justification affectation', 'Méthode séparation', 'Description originale', 'Ligne source'],
  expenseParts.filter((row) => !['ADMINISTRATION', 'MOUVEMENT_TRESORERIE', 'CHARGE_GENERALE_EXCLUE', 'DEPENSE_NON_AFFECTEE'].includes(row.unit))
    .map((row) => [row.date, row.bon, row.part, row.unit, row.category, row.amount, row.reason, row.split, row.description, row.sourceRow]),
  [14, 14, 10, 24, 25, 20, 38, 44, 95, 13], ['F']), 'DEPENSES_AFFECTEES');

XLSX.utils.book_append_sheet(workbook, makeSheet(
  ['Date', 'N° Bon', 'Partie', 'Classement', 'Catégorie', 'Montant DA', 'Raison', 'Méthode séparation', 'Description originale', 'Ligne source'],
  expenseParts.filter((row) => ['ADMINISTRATION', 'MOUVEMENT_TRESORERIE', 'CHARGE_GENERALE_EXCLUE', 'DEPENSE_NON_AFFECTEE'].includes(row.unit))
    .map((row) => [row.date, row.bon, row.part, row.unit, row.category, row.amount, row.reason, row.split, row.description, row.sourceRow]),
  [14, 14, 10, 28, 28, 20, 48, 44, 95, 13], ['F']), 'DEPENSES_NON_AFFECTEES');

XLSX.utils.book_append_sheet(workbook, makeSheet(
  ['Mois', 'Fichier', 'Tarif Guelma DA/qtx', 'Tarif Skikda DA/qtx', 'Tarif Sétif DA/qtx', 'Tarif Constantine DA/qtx', 'Écart maximum reconstitution DA', 'Statut'],
  commercialByMonth.map((item) => {
    const rateFor = (pattern) => item.rates[item.destinations.findIndex((destination) => pattern.test(destination))] || 0;
    return [item.month, item.sourceFile, rateFor(/GUELMA/), rateFor(/SKIKDA/), rateFor(/SETIF/), rateFor(/CONSTANTIN/), item.maxResidual, item.maxResidual <= 1 ? 'Tarifs reconstitués exactement' : 'À vérifier'];
  }),
  [13, 38, 23, 23, 22, 27, 34, 30], ['C', 'D', 'E', 'F', 'G']), 'TARIFS_DEDUITS');

XLSX.utils.book_append_sheet(workbook, makeSheet(
  ['Date', 'N° Bon', 'Recette caisse DA', 'Description', 'Ligne source', 'Usage'],
  cashRows.filter((row) => row.receipt).map((row) => [row.date, row.bon, row.receipt, row.description, row.sourceRow, 'Contrôle encaissement uniquement — non ajouté au revenu Commercial']),
  [14, 14, 23, 95, 13, 55], ['C']), 'ENCAISSEMENTS_CONTROLE');

const summary = [
  ['CONTRÔLE GLOBAL', 'Montant DA'],
  ['Revenus transport Jan–Fév affectés aux 4 unités', sum(resultRows, 'revenue')],
  ['Dépenses directes/réparties Jan–Fév affectées', sum(resultRows, 'totalExpense')],
  ['Dépenses Jan–Fév non affectées à une unité', sum(comparableExpenses.filter((row) => row.unit === 'DEPENSE_NON_AFFECTEE'), 'amount')],
  ['Administration Jan–Fév exclue', sum(comparableExpenses.filter((row) => row.unit === 'ADMINISTRATION'), 'amount')],
  ['Mouvements de trésorerie Jan–Fév exclus', sum(comparableExpenses.filter((row) => row.unit === 'MOUVEMENT_TRESORERIE'), 'amount')],
  ['Charges générales Jan–Fév exclues', sum(comparableExpenses.filter((row) => row.unit === 'CHARGE_GENERALE_EXCLUE'), 'amount')],
  ['Routes Sétif/Constantine sans règle camion', sum(comparableRevenue.filter((row) => row.unit === 'ROUTE_NON_AFFECTEE'), 'revenue')],
  ['Résultat net identifiable des 4 unités', sum(resultRows, 'netAfterAllocation')],
];
const summarySheet = makeSheet(['Indicateur', 'Montant DA'], summary.slice(1), [65, 24], ['B']);
XLSX.utils.book_append_sheet(workbook, summarySheet, 'CONTROLE_GLOBAL');

workbook.Props = { Title: 'Calcul résultat transport par camion', Author: 'Groupe ABIDI', CreatedDate: new Date() };
workbook.Workbook = { CalcPr: { calcMode: 'auto', fullCalcOnLoad: '1', forceFullCalc: '1' } };
XLSX.writeFile(workbook, outputFile, { compression: true });

console.log(JSON.stringify({
  outputFile,
  commercialMonths: commercialByMonth.map((item) => item.month),
  comparablePeriod: `${comparableStart} -> ${comparableEnd}`,
  results: resultRows,
  unassignedOperationalExpenses: sum(comparableExpenses.filter((row) => row.unit === 'DEPENSE_NON_AFFECTEE'), 'amount'),
  unassignedRouteRevenue: sum(comparableRevenue.filter((row) => row.unit === 'ROUTE_NON_AFFECTEE'), 'revenue'),
}, null, 2));
