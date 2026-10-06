export const SARL_RULES = [
  { label: 'CONSERVERIE', terms: ['CHAUDIERE', 'CONSERVERIE', 'SERVERIE', 'SAFA', 'MERADI', 'CHEKROUBA', 'HAMI', 'KHALLA', 'SOUDEUR'] },
  { label: 'MINOTERIE', terms: ['MINOTERIE', 'SASSI', 'CHAALAL', 'HACHOUF', 'CHEKAROUA', 'KHALED', 'LAABANA', 'ZARGO'] },
  { label: 'AGROSATI', terms: ['AGROSAT', 'BOUTALEB', 'MOHAMEDI'] },
  { label: 'ADMINISTRATION', terms: ['ADMINISTRATION', 'ADMINSTRATION', 'LAZHER'] },
  { label: 'SARL MGK', terms: ['MGK'] },
  { label: 'PLOMBIERS', terms: ['PLOMB'] },
  { label: 'TRANSPORT', terms: ['TRONSPORT'] },
];

export function classifySarl(requester = '') {
  const value = String(requester).toUpperCase();
  return SARL_RULES.find((rule) => rule.terms.some((term) => value.includes(term)))?.label ?? 'Autres';
}

const clean = (value) => (value == null ? '' : String(value).trim());
const number = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(clean(value).replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

function excelDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

async function rowsFromWorkbook(buffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export async function parseExcelFile(file, kind) {
  const rows = await rowsFromWorkbook(await file.arrayBuffer());
  if (kind === 'stock') {
    if (!rows.length || !Object.hasOwn(rows[0], 'Article') || !Object.hasOwn(rows[0], 'Qté Unité')) {
      throw new Error("Le fichier stock ne contient pas les colonnes Article et Qté Unité.");
    }
    return rows
      .filter((row) => clean(row.Article) && clean(row['Désignation']))
      .map((row) => ({
        selection: clean(row.Selection), article: clean(row.Article), designation: clean(row['Désignation']),
        manufacturerRef: clean(row['Réf. Constructeur']), supplierRef: clean(row['Réf. Fournisseur']), unit: clean(row['U. M']),
        lot: clean(row['N° Lot']), expiry: excelDate(row['Expire Le']), warehouse: clean(row.Magasin), location: clean(row.Gisement),
        packaging: clean(row.Emballage), coefficient: number(row['Coeff.']), quantity: number(row['Qté Unité']),
        unitCost: number(row['Cout Unit']), amount: number(row.Montant), blocked: number(row['Bloqué']),
        family: clean(row.Familles), familyLabel: clean(row["Libellé famille d'articles"]),
        subfamily: clean(row['Sous famille']), subfamilyLabel: clean(row['Libellé sous famille']),
        internalQtyPack: number(row['Qté Emb (I)']), internalQty: number(row['Qté Unité (I)']),
        internalUnitCost: number(row['Coût U. (I)']), internalAmount: number(row['Montant (I)']),
        accountingGroup: clean(row['Groupe Comptable']), accountingGroupLabel: clean(row['Libellé Groupe comptable']),
        manufacturedDate: excelDate(row['Fabricé Le']), nonStock: clean(row.NonStock), movement: clean(row.Mouvement),
        movementDocument: clean(row['N° Doc']), movementDate: excelDate(row['Date Mvt']), calculatedQuantity: number(row['Quantitée calculée']),
      }));
  }
  if (!rows.length || !Object.hasOwn(rows[0], 'Article') || !Object.hasOwn(rows[0], 'Date Sortie')) {
    throw new Error("Le fichier sorties ne contient pas les colonnes Article et Date Sortie.");
  }
  return rows
    .filter((row) => clean(row.Article) && excelDate(row['Date Sortie']))
    .map((row) => ({
      document: clean(row['N° Sortie']), date: excelDate(row['Date Sortie']), account: clean(row['Compte Cpt']),
      consumptionType: clean(row['Type consommation']), line: clean(row['N° Ligne']),
      article: clean(row.Article), designation: clean(row['Désignation']), unit: clean(row['U. M.']),
      packaging: clean(row['Emb.']), quantityPack: number(row['Qté Emb.']), coefficient: number(row['Coeff.']),
      quantity: number(row['Qté U. Emb.']), location: clean(row.Gisement), lot: clean(row['N° Lot']),
      unitCost: number(row['Cout Unite']), amount: number(row['Montant Ligne']),
      requesterCode: clean(row.Demandeur), requester: clean(row['Nom Demandeur']),
      costCenter: clean(row['C. Coût']), costCenterLabel: clean(row['Libellé centre de coût']),
      project: clean(row.Projet), projectLabel: clean(row['Libellé du projet']), workOrder: clean(row['N° O.P.']),
      purchaseRequest: clean(row['N° D.P.']), observation: clean(row['Observation ligne']),
    }));
}

export function monthLabel(month) {
  if (!month) return '';
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`))
    .replace('.', '');
}

const sum = (rows, field) => rows.reduce((total, row) => total + number(row[field]), 0);
const norm = (value) => clean(value).toUpperCase().replace(/\s+/g, ' ');

function aggregateBy(rows, keyFn, valueFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    const current = map.get(key) ?? { key, rows: 0, value: 0 };
    current.rows += 1;
    current.value += valueFn(row);
    map.set(key, current);
  });
  return [...map.values()];
}

export function buildDashboard(data, filters) {
  const stockReference = new Map();
  data.stock.forEach((row) => {
    if (!stockReference.has(row.article)) stockReference.set(row.article, row);
  });
  const enriched = data.sorties.map((row) => {
    const reference = stockReference.get(row.article);
    return {
      ...row,
      month: row.date.slice(0, 7),
      sarl: classifySarl(row.requester),
      family: reference?.family || '',
      familyLabel: reference?.familyLabel || reference?.family || 'Non classé',
      stockDesignation: reference?.designation || row.designation,
    };
  });
  const months = [...new Set(enriched.map((row) => row.month))].sort();
  const sarls = [...new Set(enriched.map((row) => row.sarl))].sort();
  const warehouses = [...new Set(data.stock.map((row) => row.warehouse).filter(Boolean))].sort();
  const locations = [...new Set([...enriched.map((row) => row.location), ...data.stock.map((row) => row.location)].filter(Boolean))].sort();
  const families = [...new Map(data.stock.filter((row) => row.family).map((row) => [row.family, { value: row.family, label: row.familyLabel || row.family }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));
  const requesters = [...new Set(enriched.map((row) => row.requester).filter(Boolean))].sort();
  const costCenters = [...new Set(enriched.map((row) => row.costCenterLabel).filter(Boolean))].sort();
  const projects = [...new Set(enriched.map((row) => row.projectLabel).filter(Boolean))].sort();
  const query = norm(filters.search);
  const matchesConsumptionQuery = (row) => !query || norm(`${row.article} ${row.designation} ${row.requester} ${row.costCenterLabel} ${row.projectLabel} ${row.observation} ${row.workOrder} ${row.purchaseRequest}`).includes(query);
  const matchesStockQuery = (row) => !query || norm(`${row.article} ${row.designation} ${row.manufacturerRef} ${row.supplierRef} ${row.familyLabel} ${row.subfamilyLabel}`).includes(query);
  const baseConsumption = enriched.filter((row) =>
    (!filters.sarl || row.sarl === filters.sarl) &&
    (!filters.requester || row.requester === filters.requester) &&
    (!filters.costCenter || row.costCenterLabel === filters.costCenter) &&
    (!filters.project || row.projectLabel === filters.project) &&
    (!filters.location || row.location === filters.location) &&
    (!filters.family || row.family === filters.family) &&
    matchesConsumptionQuery(row));
  const consumption = baseConsumption.filter((row) =>
    (!filters.month || row.month === filters.month) && (!filters.date || row.date === filters.date));
  const stock = data.stock.filter((row) =>
    (!filters.warehouse || row.warehouse === filters.warehouse) &&
    (!filters.location || row.location === filters.location) &&
    (!filters.family || row.family === filters.family) && matchesStockQuery(row));

  const stockByArticle = new Map();
  stock.forEach((row) => {
    const item = stockByArticle.get(row.article) ?? { article: row.article, designation: row.designation, quantity: 0, amount: 0, unitCost: 0 };
    item.quantity += row.quantity;
    item.amount += row.amount;
    if (row.unitCost > 0) item.unitCost = row.unitCost;
    stockByArticle.set(row.article, item);
  });

  const articleAgg = new Map();
  consumption.forEach((row) => {
    const item = articleAgg.get(row.article) ?? { article: row.article, designation: row.designation, quantity: 0, amount: 0, documents: new Set(), sarls: new Map() };
    item.quantity += row.quantity;
    item.amount += row.amount;
    item.documents.add(row.document);
    item.sarls.set(row.sarl, (item.sarls.get(row.sarl) ?? 0) + row.quantity);
    articleAgg.set(row.article, item);
  });
  const articles = [...articleAgg.values()].map((item) => ({
    ...item,
    documents: item.documents.size,
    mainSarl: [...item.sarls.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    stock: stockByArticle.get(item.article)?.quantity ?? 0,
  })).sort((a, b) => b.quantity - a.quantity);

  const trend = aggregateBy(baseConsumption, (row) => row.month, (row) => row.quantity)
    .map((item) => ({ month: item.key, label: monthLabel(item.key), quantity: item.value,
      amount: sum(baseConsumption.filter((row) => row.month === item.key), 'amount') }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const daily = aggregateBy(consumption, (row) => row.date, (row) => row.quantity)
    .map((item) => ({
      date: item.key,
      label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${item.key}T00:00:00Z`)).replace('.', ''),
      quantity: item.value,
      amount: sum(consumption.filter((row) => row.date === item.key), 'amount'),
      documents: new Set(consumption.filter((row) => row.date === item.key).map((row) => row.document)).size,
    })).sort((a, b) => a.date.localeCompare(b.date));

  const selectedComparisonMonth = filters.month || filters.date?.slice(0, 7) || baseConsumption.map((row) => row.month).sort().at(-1) || '';
  const [comparisonYear, comparisonMonthNumber] = selectedComparisonMonth.split('-').map(Number);
  const previousMonthDate = selectedComparisonMonth ? new Date(Date.UTC(comparisonYear, comparisonMonthNumber - 2, 1)) : null;
  const previousComparisonMonth = previousMonthDate
    ? `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, '0')}`
    : '';
  const latestDateInComparisonMonth = baseConsumption
    .filter((row) => row.month === selectedComparisonMonth)
    .map((row) => row.date)
    .sort()
    .at(-1);
  const latestAvailableDate = baseConsumption.map((row) => row.date).filter(Boolean).sort().at(-1);
  const isLatestPartialMonth = latestDateInComparisonMonth && latestDateInComparisonMonth === latestAvailableDate;
  const comparisonCutoffDay = isLatestPartialMonth ? Number(latestDateInComparisonMonth.slice(8, 10)) : 31;
  const monthRows = (month) => baseConsumption.filter((row) => row.month === month && Number(row.date.slice(8, 10)) <= comparisonCutoffDay);
  const currentMonthRows = monthRows(selectedComparisonMonth);
  const previousMonthRows = monthRows(previousComparisonMonth);
  const currentMonthQty = sum(currentMonthRows, 'quantity');
  const previousMonthQty = sum(previousMonthRows, 'quantity');
  const comparisonArticles = new Map();
  [...currentMonthRows, ...previousMonthRows].forEach((row) => {
    const item = comparisonArticles.get(row.article) ?? { article: row.article, designation: row.designation, current: 0, previous: 0 };
    if (row.month === selectedComparisonMonth) item.current += row.quantity;
    if (row.month === previousComparisonMonth) item.previous += row.quantity;
    comparisonArticles.set(row.article, item);
  });
  const monthlyChange = {
    currentMonth: selectedComparisonMonth,
    previousMonth: previousComparisonMonth,
    cutoffDay: comparisonCutoffDay,
    currentQty: currentMonthQty,
    previousQty: previousMonthQty,
    delta: currentMonthQty - previousMonthQty,
    changePct: previousMonthQty ? ((currentMonthQty - previousMonthQty) / previousMonthQty) * 100 : null,
    articles: [...comparisonArticles.values()]
      .map((item) => ({ ...item, delta: item.current - item.previous, changePct: item.previous ? ((item.current - item.previous) / item.previous) * 100 : null }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  };

  const calendarMonth = filters.month || filters.date?.slice(0, 7) || selectedComparisonMonth;
  const [calendarYear, calendarMonthNumber] = calendarMonth.split('-').map(Number);
  const daysInCalendarMonth = calendarMonth ? new Date(Date.UTC(calendarYear, calendarMonthNumber, 0)).getUTCDate() : 0;
  const calendarRows = baseConsumption.filter((row) => row.month === calendarMonth);
  const calendarByDate = new Map();
  calendarRows.forEach((row) => {
    const item = calendarByDate.get(row.date) ?? { quantity: 0, documents: new Set() };
    item.quantity += row.quantity;
    if (row.document) item.documents.add(row.document);
    calendarByDate.set(row.date, item);
  });
  const calendarDays = Array.from({ length: daysInCalendarMonth }, (_, index) => {
    const day = index + 1;
    const date = `${calendarMonth}-${String(day).padStart(2, '0')}`;
    const item = calendarByDate.get(date);
    return { date, day, quantity: item?.quantity ?? 0, documents: item?.documents.size ?? 0 };
  });
  const weekdayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const byWeekday = weekdayNames.map((name, weekday) => {
    const rows = calendarRows.filter((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === weekday);
    return { name, weekday, quantity: sum(rows, 'quantity'), documents: new Set(rows.map((row) => row.document).filter(Boolean)).size };
  });
  const calendar = {
    month: calendarMonth,
    label: calendarMonth ? monthLabel(calendarMonth) : '',
    firstWeekday: calendarMonth ? (new Date(`${calendarMonth}-01T00:00:00Z`).getUTCDay() + 6) % 7 : 0,
    maxQuantity: Math.max(0, ...calendarDays.map((item) => item.quantity)),
    days: calendarDays,
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((weekday) => byWeekday[weekday]),
  };

  const frequencyByArticle = new Map();
  consumption.forEach((row) => {
    const item = frequencyByArticle.get(row.article) ?? {
      article: row.article, designation: row.designation, quantity: 0, documents: new Set(), dates: new Set(), sarls: new Set(),
    };
    item.quantity += row.quantity;
    if (row.document) item.documents.add(row.document);
    if (row.date) item.dates.add(row.date);
    if (row.sarl) item.sarls.add(row.sarl);
    frequencyByArticle.set(row.article, item);
  });
  const demandFrequency = [...frequencyByArticle.values()].map((item) => {
    const dates = [...item.dates].sort();
    const gaps = dates.slice(1).map((date, index) => (new Date(`${date}T00:00:00Z`) - new Date(`${dates[index]}T00:00:00Z`)) / 86400000);
    const averageGapDays = gaps.length ? gaps.reduce((total, value) => total + value, 0) / gaps.length : null;
    const requests = item.documents.size || item.dates.size;
    return {
      article: item.article,
      designation: item.designation,
      quantity: item.quantity,
      requests,
      activeDays: dates.length,
      averageQty: requests ? item.quantity / requests : 0,
      averageGapDays,
      lastDate: dates.at(-1) || '',
      sarlCount: item.sarls.size,
      cadence: averageGapDays === null ? 'Ponctuel' : averageGapDays <= 7 ? 'Fréquent' : averageGapDays <= 21 ? 'Régulier' : 'Occasionnel',
    };
  }).sort((a, b) => b.requests - a.requests || b.quantity - a.quantity);
  const bySarl = aggregateBy(consumption, (row) => row.sarl, (row) => row.quantity)
    .map((item) => ({ name: item.key, value: item.value })).sort((a, b) => b.value - a.value);

  const breakdown = (keyFn, fallback = 'Non renseigné') => aggregateBy(consumption, (row) => keyFn(row) || fallback, (row) => row.quantity)
    .map((item) => ({ name: item.key, quantity: item.value, amount: sum(consumption.filter((row) => (keyFn(row) || fallback) === item.key), 'amount'), rows: item.rows }))
    .sort((a, b) => b.quantity - a.quantity);
  const byRequester = breakdown((row) => row.requester);
  const byCostCenter = breakdown((row) => row.costCenterLabel);
  const byProject = breakdown((row) => row.projectLabel);
  const byLocation = breakdown((row) => row.location);

  const sarlRankingMap = new Map();
  consumption.forEach((row) => {
    const item = sarlRankingMap.get(row.sarl) ?? { sarl: row.sarl, quantity: 0, amount: 0, documents: new Set(), articles: new Set() };
    item.quantity += row.quantity;
    item.amount += row.amount;
    if (row.document) item.documents.add(row.document);
    if (row.article) item.articles.add(row.article);
    sarlRankingMap.set(row.sarl, item);
  });
  const sarlTotalQuantity = sum(consumption, 'quantity');
  const sarlRankings = [...sarlRankingMap.values()].map((item) => ({
    sarl: item.sarl,
    quantity: item.quantity,
    amount: item.amount,
    documents: item.documents.size,
    articles: item.articles.size,
    share: sarlTotalQuantity ? item.quantity / sarlTotalQuantity * 100 : 0,
    averagePerDocument: item.documents.size ? item.quantity / item.documents.size : 0,
  })).sort((a, b) => b.quantity - a.quantity);

  const sarlTrendNames = [...new Set(baseConsumption.map((row) => row.sarl))]
    .sort((a, b) => sum(baseConsumption.filter((row) => row.sarl === b), 'quantity') - sum(baseConsumption.filter((row) => row.sarl === a), 'quantity'));
  const sarlMonthlyTrend = [...new Set(baseConsumption.map((row) => row.month))].sort().map((month) => {
    const rowsForMonth = baseConsumption.filter((row) => row.month === month);
    const point = { month, label: monthLabel(month), total: sum(rowsForMonth, 'quantity') };
    sarlTrendNames.forEach((sarl) => { point[sarl] = sum(rowsForMonth.filter((row) => row.sarl === sarl), 'quantity'); });
    return point;
  });

  const sarlArticleMaps = new Map();
  consumption.forEach((row) => {
    const articlesForSarl = sarlArticleMaps.get(row.sarl) ?? new Map();
    const article = articlesForSarl.get(row.article) ?? { article: row.article, designation: row.designation, quantity: 0, amount: 0, documents: new Set() };
    article.quantity += row.quantity;
    article.amount += row.amount;
    if (row.document) article.documents.add(row.document);
    articlesForSarl.set(row.article, article);
    sarlArticleMaps.set(row.sarl, articlesForSarl);
  });
  const sarlArticleMix = sarlRankings.map((ranking) => ({
    sarl: ranking.sarl,
    total: ranking.quantity,
    articles: [...(sarlArticleMaps.get(ranking.sarl)?.values() ?? [])]
      .map((article) => ({ ...article, documents: article.documents.size, share: ranking.quantity ? article.quantity / ranking.quantity * 100 : 0 }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5),
  }));

  const heatmapArticleTotals = new Map();
  consumption.forEach((row) => {
    const item = heatmapArticleTotals.get(row.article) ?? { article: row.article, designation: row.designation, quantity: 0 };
    item.quantity += row.quantity;
    heatmapArticleTotals.set(row.article, item);
  });
  const heatmapArticles = [...heatmapArticleTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 12);
  const heatmapRows = sarlRankings.map((ranking) => ({
    sarl: ranking.sarl,
    total: ranking.quantity,
    values: heatmapArticles.map((article) => {
      const quantity = consumption
        .filter((row) => row.sarl === ranking.sarl && row.article === article.article)
        .reduce((total, row) => total + row.quantity, 0);
      return { article: article.article, designation: article.designation, quantity };
    }),
  }));
  const sarlComparison = {
    rankings: sarlRankings,
    trendNames: sarlTrendNames,
    monthlyTrend: sarlMonthlyTrend,
    articleMix: sarlArticleMix,
    heatmap: {
      articles: heatmapArticles,
      rows: heatmapRows,
      maxQuantity: Math.max(0, ...heatmapRows.flatMap((row) => row.values.map((value) => value.quantity))),
    },
  };

  const stockBreakdown = (keyFn, fallback = 'Non renseigné') => aggregateBy(stock, (row) => keyFn(row) || fallback, (row) => row.quantity)
    .map((item) => ({ name: item.key, quantity: item.value, amount: sum(stock.filter((row) => (keyFn(row) || fallback) === item.key), 'amount'), rows: item.rows }))
    .sort((a, b) => b.amount - a.amount);
  const stockByWarehouse = stockBreakdown((row) => row.warehouse);
  const stockByFamily = stockBreakdown((row) => row.familyLabel || row.family);
  const stockByLocation = stockBreakdown((row) => row.location);
  const stockArticles = [...stockByArticle.values()].sort((a, b) => b.amount - a.amount);
  const consumedArticles = new Set(consumption.map((row) => row.article));
  const inactiveStock = stockArticles.filter((row) => row.quantity > 0 && !consumedArticles.has(row.article)).sort((a, b) => b.amount - a.amount);

  const purchases = buildPurchasePlan(data, { sarl: filters.sarl, warehouse: filters.warehouse, search: filters.search });
  const anomalies = buildAnomalies(data);
  return {
    months, sarls, warehouses, locations, families, requesters, costCenters, projects,
    consumption, stock, articles, trend, daily, monthlyChange, calendar, demandFrequency, sarlComparison, bySarl, byRequester, byCostCenter, byProject, byLocation,
    stockByWarehouse, stockByFamily, stockByLocation, stockArticles, inactiveStock, purchases, anomalies,
    kpis: {
      consumptionQty: sum(consumption, 'quantity'),
      consumptionValue: sum(consumption, 'amount'),
      activeArticles: new Set(consumption.map((row) => row.article)).size,
      documents: new Set(consumption.map((row) => row.document)).size,
      stockQty: sum(stock, 'quantity'),
      stockValue: sum(stock, 'amount'),
      purchaseArticles: purchases.filter((row) => row.recommended > 0).length,
      purchaseBudget: sum(purchases.filter((row) => row.unitCost > 0), 'estimatedCost'),
      averageDaily: daily.length ? sum(consumption, 'quantity') / daily.length : 0,
      averageLineValue: consumption.length ? sum(consumption, 'amount') / consumption.length : 0,
      averageRequestsPerArticle: demandFrequency.length ? demandFrequency.reduce((total, row) => total + row.requests, 0) / demandFrequency.length : 0,
      inactiveStockValue: sum(inactiveStock, 'amount'),
      zeroStockConsumed: [...stockByArticle.values()].filter((row) => row.quantity <= 0 && consumedArticles.has(row.article)).length,
    },
  };
}

function completeHistoryMonths(sorties) {
  const months = [...new Set(sorties.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort();
  if (!months.length) return [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const usable = months.at(-1) === currentMonth ? months.slice(0, -1) : months;
  return usable.slice(-3);
}

export function buildPurchasePlan(data, filters = {}) {
  const historyMonths = completeHistoryMonths(data.sorties);
  const weights = historyMonths.length === 3 ? [0.2, 0.3, 0.5] : historyMonths.length === 2 ? [0.4, 0.6] : [1];
  const query = norm(filters.search);
  const sorties = data.sorties
    .map((row) => ({ ...row, month: row.date.slice(0, 7), sarl: classifySarl(row.requester) }))
    .filter((row) => historyMonths.includes(row.month) && (!filters.sarl || row.sarl === filters.sarl) &&
      (!query || norm(`${row.article} ${row.designation}`).includes(query)));
  const stockRows = data.stock.filter((row) => (!filters.warehouse || row.warehouse === filters.warehouse) &&
    (!query || norm(`${row.article} ${row.designation}`).includes(query)));
  const stockMap = new Map();
  stockRows.forEach((row) => {
    const item = stockMap.get(row.article) ?? { quantity: 0, amount: 0, unitCost: 0, designation: row.designation, unit: row.unit };
    item.quantity += row.quantity;
    item.amount += row.amount;
    if (row.unitCost > 0) item.unitCost = row.unitCost;
    stockMap.set(row.article, item);
  });
  const demandMap = new Map();
  sorties.forEach((row) => {
    const item = demandMap.get(row.article) ?? { designation: row.designation, unit: row.unit, months: Object.fromEntries(historyMonths.map((month) => [month, 0])), sarls: new Map() };
    item.months[row.month] += Math.max(0, row.quantity);
    item.sarls.set(row.sarl, (item.sarls.get(row.sarl) ?? 0) + Math.max(0, row.quantity));
    demandMap.set(row.article, item);
  });
  return [...demandMap.entries()].map(([article, demand]) => {
    const values = historyMonths.map((month) => demand.months[month]);
    const forecast = values.reduce((total, value, index) => total + value * weights[index], 0);
    const average = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
    const variance = values.reduce((total, value) => total + ((value - average) ** 2), 0) / Math.max(values.length, 1);
    const safety = Math.max(forecast * 0.2, Math.sqrt(variance) * 0.5);
    const stock = stockMap.get(article) ?? { quantity: 0, unitCost: 0, designation: demand.designation, unit: demand.unit };
    const recommended = Math.ceil(Math.max(0, forecast + safety - stock.quantity));
    const coverage = forecast > 0 ? stock.quantity / forecast : null;
    return {
      article, designation: stock.designation || demand.designation, unit: stock.unit || demand.unit,
      historyMonths, monthly: values, forecast, safety, stock: stock.quantity, coverage, recommended,
      unitCost: stock.unitCost, estimatedCost: recommended * stock.unitCost,
      mainSarl: [...demand.sarls.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
      urgency: stock.quantity <= 0 && forecast > 0 ? 'Critique' : recommended > 0 ? 'À commander' : coverage < 1.5 ? 'À surveiller' : 'Couvert',
    };
  }).sort((a, b) => b.recommended - a.recommended || a.coverage - b.coverage);
}

export function buildAnomalies(data) {
  const consumed = new Set(data.sorties.filter((row) => row.quantity > 0).map((row) => row.article));
  const stockArticleQty = new Map();
  data.stock.forEach((row) => stockArticleQty.set(row.article, (stockArticleQty.get(row.article) ?? 0) + row.quantity));
  const stockNames = new Map(data.stock.map((row) => [row.article, row.designation]));
  const mismatches = [...new Map(data.sorties.filter((row) => stockNames.has(row.article) && norm(stockNames.get(row.article)) !== norm(row.designation))
    .map((row) => [row.article, { article: row.article, designation: row.designation, stockDesignation: stockNames.get(row.article) }])).values()];
  const duplicateGroups = aggregateBy(data.stock, (row) => `${row.article}|${row.lot}|${row.warehouse}|${row.location}`, () => 1).filter((row) => row.rows > 1);
  const detail = [
    ...data.stock.filter((row) => row.quantity < 0).map((row) => ({ severity: 'critical', type: 'Stock négatif', article: row.article, designation: row.designation, detail: `${row.quantity} ${row.unit} · ${row.warehouse}/${row.location}` })),
    ...[...stockArticleQty.entries()].filter(([article, qty]) => qty <= 0 && consumed.has(article)).map(([article, qty]) => ({ severity: 'critical', type: 'Rupture avec consommation', article, designation: stockNames.get(article), detail: `Stock total ${qty}` })),
    ...data.sorties.filter((row) => row.unitCost < 0 || row.amount < 0).map((row) => ({ severity: 'critical', type: 'Valeur sortie négative', article: row.article, designation: row.designation, detail: `${row.document} · ${row.amount.toFixed(2)}` })),
    ...mismatches.map((row) => ({ severity: 'warning', type: 'Désignation différente', article: row.article, designation: row.stockDesignation, detail: `Sortie: ${row.designation}` })),
  ];
  return {
    cards: [
      { label: 'Stocks négatifs', count: data.stock.filter((row) => row.quantity < 0).length, denominator: data.stock.length, severity: 'critical', impact: 'Risque de stock disponible surestimé' },
      { label: 'Coûts stock à zéro', count: data.stock.filter((row) => row.unitCost === 0).length, denominator: data.stock.length, severity: 'warning', impact: 'Valeur du stock sous-estimée' },
      { label: 'Coûts sortie à zéro', count: data.sorties.filter((row) => row.unitCost === 0).length, denominator: data.sorties.length, severity: 'warning', impact: 'Analyse financière incomplète' },
      { label: 'Demandeurs manquants', count: data.sorties.filter((row) => !row.requester).length, denominator: data.sorties.length, severity: 'info', impact: 'Attribution SARL moins précise' },
      { label: 'Désignations à vérifier', count: mismatches.length, denominator: new Set(data.sorties.map((row) => row.article)).size, severity: 'warning', impact: 'Risque de confusion article' },
      { label: 'Positions dupliquées', count: duplicateGroups.length, denominator: data.stock.length, severity: 'info', impact: 'Contrôler le grain article-lot-gisement' },
    ],
    detail,
  };
}

export function exportCsv(rows, fileName) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = `\ufeff${headers.join(';')}\n${rows.map((row) => headers.map((key) => escape(row[key])).join(';')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click();
  URL.revokeObjectURL(url);
}
