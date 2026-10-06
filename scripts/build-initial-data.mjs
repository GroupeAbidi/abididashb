import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const sourceDir = 'C:/Users/Admin/Desktop/ABID/dashb';
const outputDir = path.resolve('public/data');

function number(value) {
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function excelDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function readRows(fileName) {
  const workbook = XLSX.readFile(path.join(sourceDir, fileName), { cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
}

const stock = readRows('stock.xls')
  .filter((row) => clean(row.Article) && clean(row['Désignation']))
  .map((row) => ({
    selection: clean(row.Selection),
    article: clean(row.Article),
    designation: clean(row['Désignation']),
    manufacturerRef: clean(row['Réf. Constructeur']),
    supplierRef: clean(row['Réf. Fournisseur']),
    unit: clean(row['U. M']),
    lot: clean(row['N° Lot']),
    expiry: excelDate(row['Expire Le']),
    warehouse: clean(row.Magasin),
    location: clean(row.Gisement),
    packaging: clean(row.Emballage),
    coefficient: number(row['Coeff.']),
    quantity: number(row['Qté Unité']),
    unitCost: number(row['Cout Unit']),
    amount: number(row.Montant),
    blocked: number(row['Bloqué']),
    family: clean(row.Familles),
    familyLabel: clean(row["Libellé famille d'articles"]),
    subfamily: clean(row['Sous famille']),
    subfamilyLabel: clean(row['Libellé sous famille']),
    internalQtyPack: number(row['Qté Emb (I)']),
    internalQty: number(row['Qté Unité (I)']),
    internalUnitCost: number(row['Coût U. (I)']),
    internalAmount: number(row['Montant (I)']),
    accountingGroup: clean(row['Groupe Comptable']),
    accountingGroupLabel: clean(row['Libellé Groupe comptable']),
    manufacturedDate: excelDate(row['Fabricé Le']),
    nonStock: clean(row.NonStock),
    movement: clean(row.Mouvement),
    movementDocument: clean(row['N° Doc']),
    movementDate: excelDate(row['Date Mvt']),
    calculatedQuantity: number(row['Quantitée calculée']),
  }));

const sorties = readRows('SORTIE JAN JUIIL.xls')
  .filter((row) => clean(row.Article) && excelDate(row['Date Sortie']))
  .map((row) => ({
    document: clean(row['N° Sortie']),
    date: excelDate(row['Date Sortie']),
    account: clean(row['Compte Cpt']),
    consumptionType: clean(row['Type consommation']),
    line: clean(row['N° Ligne']),
    article: clean(row.Article),
    designation: clean(row['Désignation']),
    unit: clean(row['U. M.']),
    packaging: clean(row['Emb.']),
    quantityPack: number(row['Qté Emb.']),
    coefficient: number(row['Coeff.']),
    quantity: number(row['Qté U. Emb.']),
    location: clean(row.Gisement),
    lot: clean(row['N° Lot']),
    unitCost: number(row['Cout Unite']),
    amount: number(row['Montant Ligne']),
    requesterCode: clean(row.Demandeur),
    requester: clean(row['Nom Demandeur']),
    costCenter: clean(row['C. Coût']),
    costCenterLabel: clean(row['Libellé centre de coût']),
    project: clean(row.Projet),
    projectLabel: clean(row['Libellé du projet']),
    workOrder: clean(row['N° O.P.']),
    purchaseRequest: clean(row['N° D.P.']),
    observation: clean(row['Observation ligne']),
  }));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'initial-data.json'),
  JSON.stringify({
    stock,
    sorties,
    meta: {
      stockFile: 'stock.xls',
      sortiesFile: 'SORTIE JAN JUIIL.xls',
      generatedAt: new Date().toISOString(),
    },
  }),
);

console.log(`Prepared ${stock.length} stock rows and ${sorties.length} sortie rows.`);
