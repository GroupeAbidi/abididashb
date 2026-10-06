import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const workspace = process.cwd();
const transportCashFile = 'C:\\Users\\GEEK\\Desktop\\ABIDI\\TRANSPORT\\transp 1.xlsx';
const commercialRoot = 'C:\\Users\\GEEK\\Desktop\\ABIDI\\MINOTERIE\\commercial files';
const outputFile = path.join(workspace, 'Modele_Calcul_Resultat_Par_Camion.xlsx');

const clean = (value) => value == null ? '' : String(value).trim();
const amount = (value) => Number(value) || 0;
const numericFormula = (f) => ({ t: 'n', f, v: 0 });
const textFormula = (f) => ({ t: 's', f, v: 'À recalculer' });
const dateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const monthKey = (value) => dateKey(value).slice(0, 7);

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return entry.name.toLowerCase() === 'all' ? [] : listFiles(target);
    return entry.name.startsWith('~$') || !/\.xlsx?$/i.test(entry.name) ? [] : [target];
  });
}

function readCommercialTransport(file) {
  const workbook = XLSX.readFile(file, { cellDates: true, cellFormula: true });
  const sheetName = workbook.SheetNames.find((name) => /^TRANSPORT$/i.test(name.trim()));
  if (!sheetName) return [];
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const headerIndex = matrix.findIndex((row) => /DATE/i.test(clean(row?.[0])) && row.some((value) => /QUANTITE/i.test(clean(value))));
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex];
  const totalColumn = headers.findIndex((value) => /MONTANT|TOTAL/i.test(clean(value)));
  const destinationColumns = headers.map((value, column) => ({ column, label: clean(value).replace(/^QUANTITE\s*/i, '').trim() }))
    .filter((item) => item.column > 0 && /QUANTITE/i.test(clean(headers[item.column])));
  const rows = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (/^TOTAL$/i.test(clean(row?.[0]))) break;
    const date = dateKey(row?.[0]);
    if (!date) continue;
    const dailyTotal = totalColumn >= 0 ? amount(row[totalColumn]) : 0;
    destinationColumns.forEach(({ column, label }) => {
      const quantity = amount(row[column]);
      if (!quantity) return;
      rows.push({
        date, month: date.slice(0, 7), destination: label || `Colonne ${column + 1}`, quantity,
        dailyTotal, sourceFile: path.basename(file), sourceRow: index + 1,
      });
    });
  }
  return rows;
}

const commercialRows = listFiles(commercialRoot).flatMap((file) => {
  try { return readCommercialTransport(file); }
  catch { return []; }
});
const uniqueCommercialRows = [...new Map(commercialRows.map((row) => [[row.date, row.destination, row.quantity, row.dailyTotal].join('|'), row])).values()]
  .sort((a, b) => a.date.localeCompare(b.date) || a.destination.localeCompare(b.destination, 'fr'));

const cashWorkbook = XLSX.readFile(transportCashFile, { cellDates: true, cellFormula: true });
const cashSheet = cashWorkbook.Sheets[cashWorkbook.SheetNames[0]];
const cashMatrix = XLSX.utils.sheet_to_json(cashSheet, { header: 1, defval: null, raw: true });
const cashRows = cashMatrix.slice(3).map((row, index) => ({
  sourceRow: index + 4,
  date: dateKey(row[0]),
  bon: clean(row[1]),
  description: clean(row[2]),
  receipt: amount(row[6]),
  expense: amount(row[7]),
  balance: amount(row[8]),
})).filter((row) => row.date && (row.receipt || row.expense));
const expenseRows = cashRows.filter((row) => row.expense);
const receiptRows = cashRows.filter((row) => row.receipt);

const trucks = [
  ['K66', 'K66', '00089-204-24', 'Camion', 'Oui', ''],
  ['HD65', 'HD65', '00119-205-24', 'Camion', 'Oui', ''],
  ['D10T_BOURCHEROUCHE', 'D10T Bourcherouche', '00148-214-24', 'Camion', 'Oui', 'Nom lu sur la photo — à confirmer'],
  ['D10T_WAHAB', 'D10T Wahab', '00284-212-24', 'Camion', 'Oui', ''],
  ['CAMS', 'CAMS', '00158-210-24', 'Camion', 'Oui', ''],
  ['AMER', 'AMER', '00023-517-24', 'Camion', 'Oui', ''],
  ['NOURDDINE', 'NOURDDINE', '00024-517-24', 'Camion', 'Oui', ''],
  ['HAMLAOUI', 'HAMLAOUI', '00064-514-24', 'Camion', 'Oui', ''],
  ['NOURDINE_CCLS', 'NOURDINE CCLS', 'À CONFIRMER', 'Camion', 'Oui', 'Numéro manuscrit à confirmer'],
];

function sheetFromRows(rows, widths, filter = true) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  if (filter && rows.length) sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(rows[0].length - 1)}${Math.max(rows.length, 2)}` };
  return sheet;
}

function setNumberFormat(sheet, columns, startRow, endRow, format = '#,##0.00') {
  columns.forEach((column) => {
    for (let row = startRow; row <= endRow; row += 1) {
      const cell = sheet[`${column}${row}`];
      if (cell) cell.z = format;
    }
  });
}

const workbook = XLSX.utils.book_new();

const instructions = [
  ['MODÈLE DE CALCUL — RÉSULTAT NET PAR CAMION'],
  ['Objectif', 'Mداخيل النقل par camion − مصاريف النقل par camion = résultat net du camion'],
  ['Ordre de remplissage', '1 CAMIONS → 2 AFFECTATIONS → 3 TRAJETS → 4 DEPENSES_SOURCE → 5 VENTILATION_DEP → 6 ENCAISSEMENTS → RESULTAT_CAMIONS'],
  ['Règle 1', 'Chaque trajet doit avoir un Code_camion. Si plusieurs camions partagent une quantité, dupliquer la ligne et répartir quantité et montant.'],
  ['Règle 2', 'Un bon contenant Mission + Gasoil doit être ventilé en deux lignes distinctes dans VENTILATION_DEP.'],
  ['Règle 3', 'L’assurance est affectée uniquement au camion concerné. Utiliser son matricule ou son Code_camion.'],
  ['Règle 4', 'Les voitures administratives sont classées Administration et exclues du résultat des camions.'],
  ['Règle 5', 'Les recettes acquises viennent de TRANSPORT dans Commercial. Ne pas additionner une seconde fois les encaissements de la caisse.'],
  ['Règle 6', 'Les encaissements servent à calculer le résultat encaissé et à contrôler le paiement des prestations.'],
  ['Règle 7', 'Ne jamais modifier ID_trajet, ID_depense_source ou ID_encaissement après affectation.'],
  [],
  ['CHAMPS À CONFIRMER'],
  ['NOURDINE_CCLS', 'Compléter le numéro d’immatriculation manuscrit.'],
  ['Charges générales', 'Choisir dans LISTES si elles sont exclues ou réparties; si réparties, créer une ligne par camion dans VENTILATION_DEP.'],
  ['Période caisse', 'Le rapport annonce 01/01/2026 → 10/09/2026 mais les mouvements présents s’arrêtent au 23/03/2026.'],
];
const instructionSheet = sheetFromRows(instructions, [26, 115], false);
instructionSheet['!merges'] = [XLSX.utils.decode_range('A1:B1')];
XLSX.utils.book_append_sheet(workbook, instructionSheet, 'MODE_EMPLOI');

const truckSheet = sheetFromRows([
  ['Code_camion*', 'Nom_camion*', 'Matricule*', 'Type_vehicule*', 'Actif_Oui_Non*', 'Observation', 'Marque_Modele', 'Capacite_qtx', 'Proprietaire', 'Date_debut', 'Date_fin'],
  ...trucks,
], [24, 24, 22, 18, 16, 38, 22, 16, 22, 14, 14]);
XLSX.utils.book_append_sheet(workbook, truckSheet, 'CAMIONS');

const assignmentSheet = sheetFromRows([
  ['Date_debut*', 'Date_fin', 'ID_chauffeur*', 'Nom_chauffeur*', 'Code_camion*', 'Matricule', 'Type_affectation', 'Alias_dans_descriptions', 'Observation'],
  ['', '', '', '', '', '', 'Titulaire / Remplaçant', '', 'Une ligne par période d’affectation'],
], [14, 14, 18, 26, 24, 22, 22, 34, 38]);
XLSX.utils.book_append_sheet(workbook, assignmentSheet, 'AFFECTATIONS');

const tripHeaders = ['ID_trajet*', 'Date_service*', 'Mois_service', 'Fichier_Commercial', 'Ligne_source', 'Code_camion*', 'Matricule', 'Chauffeur', 'Origine', 'Destination*', 'Client_societe', 'Quantite_qtx*', 'Rotations', 'Prix_unitaire_DA', 'Montant_transport_DA*', 'Montant_jour_source', 'N_Bon', 'N_Facture', 'Statut_facturation', 'Commentaire'];
const tripData = uniqueCommercialRows.map((row, index) => [
  `TR-${row.date.replaceAll('-', '')}-${String(index + 1).padStart(4, '0')}`, row.date, row.month, row.sourceFile, row.sourceRow,
  '', '', '', 'Minoterie Abidi', row.destination, 'À compléter', row.quantity, '', '', '', row.dailyTotal, '', '', 'À confirmer',
  'Compléter camion, chauffeur, prix/montant. Dupliquer si plusieurs camions ont partagé cette quantité.',
]);
const tripSheet = sheetFromRows([tripHeaders, ...tripData], [23, 14, 13, 34, 13, 24, 22, 24, 22, 20, 24, 16, 12, 18, 22, 21, 14, 18, 20, 55]);
setNumberFormat(tripSheet, ['L', 'M', 'N', 'O', 'P'], 2, tripData.length + 1);
XLSX.utils.book_append_sheet(workbook, tripSheet, 'TRAJETS');

const expenseSourceHeaders = ['ID_depense_source*', 'Date*', 'N_Bon*', 'Description_originale', 'Montant_original_DA*', 'Fichier_source', 'Ligne_source', 'Total_ventile_DA', 'Ecart_a_ventiler', 'Controle'];
const expenseSourceData = expenseRows.map((row, index) => {
  const id = `DEP-${row.date.replaceAll('-', '')}-${row.bon || String(index + 1).padStart(5, '0')}`;
  const excelRow = index + 2;
  return [id, row.date, row.bon, row.description, row.expense, path.basename(transportCashFile), row.sourceRow,
    numericFormula(`SUMIF(VENTILATION_DEP!$B:$B,A${excelRow},VENTILATION_DEP!$L:$L)`),
    numericFormula(`E${excelRow}-H${excelRow}`),
    textFormula(`IF(ABS(I${excelRow})<0.01,"OK","À compléter")`),
  ];
});
const expenseSourceSheet = sheetFromRows([expenseSourceHeaders, ...expenseSourceData], [27, 14, 14, 95, 22, 24, 13, 20, 20, 16]);
setNumberFormat(expenseSourceSheet, ['E', 'H', 'I'], 2, expenseSourceData.length + 1);
XLSX.utils.book_append_sheet(workbook, expenseSourceSheet, 'DEPENSES_SOURCE');

const ventilationHeaders = ['ID_ventilation*', 'ID_depense_source*', 'Date_depense*', 'N_Bon*', 'Categorie*', 'Sous_categorie', 'Type_affectation*', 'Code_camion', 'Matricule', 'Chauffeur', 'ID_trajet', 'Montant_ventile_DA*', 'Montant_paye_DA', 'Fournisseur', 'Justificatif', 'Commentaire'];
const ventilationData = expenseRows.map((row, index) => {
  const sourceId = `DEP-${row.date.replaceAll('-', '')}-${row.bon || String(index + 1).padStart(5, '0')}`;
  return [`VENT-${String(index + 1).padStart(5, '0')}`, sourceId, row.date, row.bon, 'À VENTILER', '', 'À compléter', '', '', '', '', row.expense, row.expense, '', '', row.description];
});
const ventilationSheet = sheetFromRows([ventilationHeaders, ...ventilationData], [21, 27, 16, 14, 22, 24, 22, 24, 22, 24, 23, 23, 20, 25, 22, 80]);
setNumberFormat(ventilationSheet, ['L', 'M'], 2, ventilationData.length + 1);
XLSX.utils.book_append_sheet(workbook, ventilationSheet, 'VENTILATION_DEP');

const receiptHeaders = ['ID_encaissement*', 'Date_encaissement*', 'N_Bon_Transp', 'Payeur_description', 'Mois_service', 'Reference_facture', 'ID_trajet', 'Code_camion', 'Montant_encaisse_DA*', 'Nature_recette*', 'Inclus_resultat_cash_Oui_Non*', 'Fichier_source', 'Ligne_source', 'Commentaire'];
const receiptData = receiptRows.map((row, index) => [
  `ENC-${row.date.replaceAll('-', '')}-${row.bon || String(index + 1).padStart(5, '0')}`, row.date, row.bon, row.description, '', '', '', '', row.receipt,
  'À classer', 'Non', path.basename(transportCashFile), row.sourceRow, 'Mettre Oui uniquement si la recette correspond à une prestation de transport et l’affecter au camion.',
]);
const receiptSheet = sheetFromRows([receiptHeaders, ...receiptData], [26, 19, 16, 85, 14, 20, 23, 24, 23, 24, 29, 24, 13, 62]);
setNumberFormat(receiptSheet, ['I'], 2, receiptData.length + 1);
XLSX.utils.book_append_sheet(workbook, receiptSheet, 'ENCAISSEMENTS');

const resultHeaders = ['Code_camion', 'Nom_camion', 'Matricule', 'Revenu_transport_DA', 'Encaissements_affectes_DA', 'Gasoil_DA', 'Missions_DA', 'Entretien_reparations_DA', 'Pneus_DA', 'Assurance_DA', 'Autres_charges_camion_DA', 'Charges_generales_reparties_DA', 'Total_charges_DA', 'Resultat_economique_DA', 'Resultat_encaisse_DA', 'Marge_pct', 'Controle'];
const resultData = trucks.map((truck, index) => {
  const row = index + 2;
  const directAll = `SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$G:$G,"Camion")`;
  return [truck[0], truck[1], truck[2],
    numericFormula(`SUMIF(TRAJETS!$F:$F,$A${row},TRAJETS!$O:$O)`),
    numericFormula(`SUMIFS(ENCAISSEMENTS!$I:$I,ENCAISSEMENTS!$H:$H,$A${row},ENCAISSEMENTS!$K:$K,"Oui")`),
    numericFormula(`SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$E:$E,"Gasoil")`),
    numericFormula(`SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$E:$E,"Mission")`),
    numericFormula(`SUM(SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$E:$E,{"Pièces","Réparation","Vidange"}))`),
    numericFormula(`SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$E:$E,"Pneus")`),
    numericFormula(`SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$E:$E,"Assurance")`),
    numericFormula(`${directAll}-SUM(F${row}:J${row})`),
    numericFormula(`SUMIFS(VENTILATION_DEP!$L:$L,VENTILATION_DEP!$H:$H,$A${row},VENTILATION_DEP!$G:$G,"Générale répartie")`),
    numericFormula(`SUM(F${row}:L${row})`),
    numericFormula(`D${row}-M${row}`),
    numericFormula(`E${row}-M${row}`),
    numericFormula(`IFERROR(N${row}/D${row},0)`),
    textFormula(`IF(D${row}=0,"Trajets non affectés",IF(M${row}=0,"Dépenses à vérifier","OK"))`),
  ];
});
const resultSheet = sheetFromRows([resultHeaders, ...resultData], [24, 23, 22, 24, 27, 16, 16, 28, 15, 17, 29, 32, 22, 27, 24, 14, 24]);
setNumberFormat(resultSheet, ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'], 2, resultData.length + 1);
setNumberFormat(resultSheet, ['P'], 2, resultData.length + 1, '0.00%');
XLSX.utils.book_append_sheet(workbook, resultSheet, 'RESULTAT_CAMIONS');

const controls = [
  ['CONTRÔLES AVANT CALCUL', 'Valeur', 'Résultat attendu'],
  ['Trajets sans camion', numericFormula('COUNTIFS(TRAJETS!$A:$A,"<>",TRAJETS!$F:$F,"")'), '0'],
  ['Trajets sans montant affecté', numericFormula('COUNTIFS(TRAJETS!$A:$A,"<>",TRAJETS!$O:$O,"")'), '0'],
  ['Dépenses source non ventilées', numericFormula('COUNTIF(DEPENSES_SOURCE!$J:$J,"À compléter")'), '0'],
  ['Ventilations sans type', numericFormula('COUNTIFS(VENTILATION_DEP!$A:$A,"<>",VENTILATION_DEP!$G:$G,"À compléter")'), '0'],
  ['Ventilations camion sans Code_camion', numericFormula('COUNTIFS(VENTILATION_DEP!$G:$G,"Camion",VENTILATION_DEP!$H:$H,"")'), '0'],
  ['Assurances sans camion', numericFormula('COUNTIFS(VENTILATION_DEP!$E:$E,"Assurance",VENTILATION_DEP!$H:$H,"")'), '0'],
  ['Encaissements encore à classer', numericFormula('COUNTIF(ENCAISSEMENTS!$J:$J,"À classer")'), '0'],
  ['Total dépenses source', numericFormula('SUM(DEPENSES_SOURCE!$E:$E)'), 'Doit égaler le total ventilé'],
  ['Total dépenses ventilées', numericFormula('SUM(VENTILATION_DEP!$L:$L)'), 'Doit égaler le total source'],
  ['Écart ventilation global', numericFormula('B9-B10'), '0 DA'],
];
const controlSheet = sheetFromRows(controls, [42, 24, 38], false);
setNumberFormat(controlSheet, ['B'], 9, 11);
XLSX.utils.book_append_sheet(workbook, controlSheet, 'CONTROLES');

const lists = [
  ['CATEGORIES_DEPENSES', 'TYPE_AFFECTATION', 'NATURE_RECETTE', 'OUI_NON', 'STATUT_FACTURATION', 'DESTINATIONS'],
  ['Gasoil', 'Camion', 'Prestation transport', 'Oui', 'Facturé', 'GUELMA'],
  ['Mission', 'Administration', 'Avance', 'Non', 'Non facturé', 'SKIKDA'],
  ['Pièces', 'Générale exclue', 'Alimentation caisse', '', 'À confirmer', 'SETIF'],
  ['Réparation', 'Générale répartie', 'Transfert bancaire', '', 'Payé', 'CONSTANTIN'],
  ['Pneus', 'À compléter', 'Remboursement', '', 'Impayé', 'Autre'],
  ['Vidange', '', 'Autre recette', '', '', ''],
  ['Assurance', '', 'À classer', '', '', ''],
  ['Péage', '', '', '', '', ''],
  ['Amende', '', '', '', '', ''],
  ['Salaire chauffeur', '', '', '', '', ''],
  ['Charge générale', '', '', '', '', ''],
  ['Autre', '', '', '', '', ''],
  ['À VENTILER', '', '', '', '', ''],
];
XLSX.utils.book_append_sheet(workbook, sheetFromRows(lists, [28, 25, 28, 14, 24, 22]), 'LISTES');

workbook.Props = {
  Title: 'Modèle de calcul du résultat par camion',
  Subject: 'Transport Groupe ABIDI',
  Author: 'Groupe ABIDI',
  CreatedDate: new Date(),
};
workbook.Workbook = { CalcPr: { calcMode: 'auto', fullCalcOnLoad: '1', forceFullCalc: '1' } };
XLSX.writeFile(workbook, outputFile, { compression: true });
console.log(JSON.stringify({ outputFile, trucks: trucks.length, trips: tripData.length, expenses: expenseSourceData.length, receipts: receiptData.length }, null, 2));
