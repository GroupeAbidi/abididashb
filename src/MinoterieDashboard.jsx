import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Banknote, BarChart3, Calculator, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, CreditCard,
  Database, Factory, FileSpreadsheet, Gauge, Info, LayoutDashboard, Menu, PackageCheck, PanelLeftClose,
  PanelLeftOpen, RefreshCw, Scale, Search, TrendingUp, Upload, Users, Wheat, X,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart,
  ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { aggregate, mergeMinoterieData, parseBalanceClientFile, parseCostAccountingFile, parseEncaissementFile, parseMinoterieFile, parseWheatTrackingFile } from './lib/minoterie-data.js';
import { parseMinoterieStockPdf } from './lib/minoterie-stock-pdf.js';
import { archiveImportedFile } from './lib/persistence.js';
import './minoterie.css';

const COLORS = ['#7a3024', '#c99715', '#3f6f68', '#d8b75a', '#a95b48', '#6e7e7b', '#b9913a'];
const WHEAT_PRICE_PER_QTX = 1285;
const n = (value, digits = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value || 0);
const n2 = (value) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
const money = (value) => `${n(value)} DA`;
const shortDate = (date) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).replace('.', '');
const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
const purchaseQtx = (row) => Number(row.qtx) || (Number(row.tons) || 0) * 10;
const purchasePricePerQtx = (row) => Number(row.pricePerQtx) || (Number(row.pricePerTon) || 0) / 10 || WHEAT_PRICE_PER_QTX;
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const IMPORT_TYPES = [
  ['commercial', 'Commercial'], ['sales', 'Ventes'], ['production', 'Production'], ['balance', 'Balance client'], ['costAccounting', 'Coût de revient'],
];

const clientKey = (value) => String(value || 'Client non renseigné')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\bVIR\b.*$/, '').replace(/\s+[GM]\s+\d{4,}$/, '').replace(/\b(?:LA|LE)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();

function buildCreditLedger(data, purchaseLots) {
  if (data.clientBalance?.rows?.length) {
    const balance = data.clientBalance;
    const { startDate, endDate } = balance.meta;
    const inPeriod = (row) => row.date && (!startDate || row.date >= startDate) && (!endDate || row.date <= endDate);
    const periodPurchases = purchaseLots.filter(inPeriod);
    const wheatCost = periodPurchases.length
      ? periodPurchases.reduce((total, row) => total + purchaseQtx(row) * purchasePricePerQtx(row), 0)
      : data.wheat.filter(inPeriod).reduce((total, row) => total + row.qtx * WHEAT_PRICE_PER_QTX, 0);
    const month = endDate?.slice(0, 7) || '';
    const rows = balance.rows.map((row) => {
      const openingCredit = Math.max(0, row.opening);
      const closingCredit = Math.max(0, row.balance);
      const advance = Math.max(0, -row.balance);
      let status = closingCredit > 0 ? (row.payments > 0 ? 'Partiellement payé' : 'Non payé') : (advance > 0 ? 'Avance client' : 'Payé');
      if (!row.sales && !row.payments && closingCredit > 0) status = 'Solde antérieur';
      return { month, clientCode: row.clientCode, client: row.client, openingCredit, openingNet: row.opening,
        sales: row.sales, payments: row.payments, paidOldCredit: Math.min(row.payments, openingCredit),
        paidCurrentCredit: Math.max(0, Math.min(row.sales, row.payments - Math.min(row.payments, openingCredit))),
        closingCredit, closingNet: row.balance, advance, status };
    });
    const payments = balance.totals.payments;
    const grossReceivables = sum(rows, 'closingCredit');
    const clientAdvances = sum(rows, 'advance');
    const monthly = [{
      month, label: `${startDate || 'Début'} → ${endDate || 'Fin'}`, sales: balance.totals.sales,
      payments, wheatCost, closingCredit: Math.max(0, balance.totals.balance),
      grossReceivables, clientAdvances, netOfficial: balance.totals.balance,
      openingCredit: balance.totals.opening,
      paidOldCredit: rows.reduce((total, row) => total + row.paidOldCredit, 0),
      collectionVsWheat: payments - wheatCost,
      collectionCoverage: wheatCost ? payments / wheatCost * 100 : null,
      unpaidClients: rows.filter((row) => row.closingCredit > 0).length,
      paidClients: rows.filter((row) => row.status === 'Payé').length,
    }];
    return { months: month ? [month] : [], rows, monthly, isBalance: true, meta: balance.meta, totals: balance.totals };
  }
  const commercialSales = data.sales.filter((row) => !row.internal && row.date && row.amount);
  const recoveries = (data.collections?.length ? data.collections : data.recoveries).filter((row) => row.date && row.amount);
  const months = [...new Set([...commercialSales, ...recoveries, ...data.wheat, ...purchaseLots]
    .map((row) => row.date?.slice(0, 7)).filter(Boolean))].sort();
  const names = new Map();
  commercialSales.forEach((row) => {
    const key = clientKey(row.client);
    if (!names.has(key)) names.set(key, row.client);
  });
  recoveries.forEach((row) => {
    const key = clientKey(row.client);
    if (!names.has(key)) names.set(key, row.client);
  });
  const salesTotals = new Map();
  const paymentTotals = new Map();
  commercialSales.forEach((row) => {
    const key = `${row.date.slice(0, 7)}\u0000${clientKey(row.client)}`;
    salesTotals.set(key, (salesTotals.get(key) || 0) + row.amount);
  });
  recoveries.forEach((row) => {
    const key = `${row.date.slice(0, 7)}\u0000${clientKey(row.client)}`;
    paymentTotals.set(key, (paymentTotals.get(key) || 0) + row.amount);
  });
  const wheatCosts = new Map();
  data.wheat.forEach((row) => {
    const month = row.date?.slice(0, 7);
    if (month) wheatCosts.set(month, (wheatCosts.get(month) || 0) + row.qtx * WHEAT_PRICE_PER_QTX);
  });
  const purchaseCosts = new Map();
  purchaseLots.forEach((row) => {
    const month = row.date?.slice(0, 7);
    if (month) purchaseCosts.set(month, (purchaseCosts.get(month) || 0) + purchaseQtx(row) * purchasePricePerQtx(row));
  });
  const clientKeys = [...names.keys()].sort((a, b) => names.get(a).localeCompare(names.get(b), 'fr'));
  const balances = new Map(clientKeys.map((key) => [key, 0]));
  const rows = [];
  const monthly = [];

  months.forEach((month) => {
    const monthRows = [];
    clientKeys.forEach((key) => {
      const openingNet = balances.get(key) || 0;
      const lookup = `${month}\u0000${key}`;
      const sales = salesTotals.get(lookup) || 0;
      const payments = paymentTotals.get(lookup) || 0;
      const closingNet = openingNet + sales - payments;
      balances.set(key, closingNet);
      const openingCredit = Math.max(0, openingNet);
      const closingCredit = Math.max(0, closingNet);
      const advance = Math.max(0, -closingNet);
      const paidOldCredit = Math.min(payments, openingCredit);
      let status = 'À jour';
      if (closingCredit > 0 && payments > 0) status = 'Partiellement payé';
      else if (closingCredit > 0) status = 'Non payé';
      else if (openingCredit + sales > 0) status = 'Payé';
      else if (advance > 0) status = 'Avance client';
      if (openingCredit || sales || payments || closingCredit || advance) {
        const item = { month, client: names.get(key), openingCredit, sales, payments, paidOldCredit,
          paidCurrentCredit: Math.max(0, Math.min(sales, payments - paidOldCredit)), closingCredit, advance, status };
        rows.push(item);
        monthRows.push(item);
      }
    });

    const wheatCost = purchaseCosts.has(month) ? purchaseCosts.get(month) : (wheatCosts.get(month) || 0);
    const sales = sum(monthRows, 'sales');
    const payments = sum(monthRows, 'payments');
    const closingCredit = sum(monthRows, 'closingCredit');
    const clientAdvances = sum(monthRows, 'advance');
    monthly.push({
      month, sales, payments, wheatCost, closingCredit,
      grossReceivables: closingCredit, clientAdvances, netOfficial: closingCredit - clientAdvances,
      openingCredit: sum(monthRows, 'openingCredit'),
      paidOldCredit: sum(monthRows, 'paidOldCredit'),
      collectionVsWheat: payments - wheatCost,
      collectionCoverage: wheatCost ? payments / wheatCost * 100 : null,
      unpaidClients: monthRows.filter((row) => row.closingCredit > 0).length,
      paidClients: monthRows.filter((row) => row.status === 'Payé').length,
    });
  });
  return { months, rows, monthly };
}

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  if (payload[0]?.payload?.product && Number.isFinite(payload[0]?.payload?.marginPerQtx)) return <ProductProfitTooltip active={active} payload={payload}/>;
  return <div className="mino-tooltip"><strong>{label}</strong>{payload.map((item) => <span key={`${item.dataKey}-${item.name}`}>{item.name}: {n(item.value, 1)}</span>)}</div>;
}

function BalanceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="mino-tooltip"><strong>{label}</strong>{payload.map((item) => <span key={`${item.dataKey}-${item.name}`}>{item.name}: {money(item.value)}</span>)}</div>;
}

function ProductProfitTooltip({ active, payload }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return <div className="mino-tooltip product-profit-tooltip"><strong>{row.name} · {row.product}</strong><span>Production : {n2(row.volume)} qtx</span><span>Marge / qtx : {money(row.marginPerQtx)}</span><span>Bénéfice total : {money(row.profit)}</span></div>;
}

function Kpi({ icon: Icon, label, value, note, tone = '', onClick, source = '' }) {
  const keyboard = onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined;
  return <article className={`mino-kpi ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick} onKeyDown={keyboard} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}><span className="mino-kpi-icon"><Icon size={20}/></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p>{(source || onClick) && <footer className="mino-kpi-meta">{source && <span><Database size={12}/>{source}</span>}{onClick && <b><Info size={12}/> Voir le calcul</b>}</footer>}</div></article>;
}

function Panel({ eyebrow, title, note, children, className = '' }) {
  return <article className={`mino-panel ${className}`}><header><div><span>{eyebrow}</span><h3>{title}</h3></div>{note && <small>{note}</small>}</header>{children}</article>;
}

function Expandable({ title, meta, children, openByDefault = false }) {
  const [open, setOpen] = useState(openByDefault);
  const [loaded, setLoaded] = useState(openByDefault);
  const toggle = () => { setOpen((value) => !value); setLoaded(true); };
  return <section className="mino-panel mino-expandable"><button onClick={toggle} aria-expanded={open}><div><span>Détail</span><strong>{title}</strong><small>{meta}</small></div><b>{open ? 'Masquer' : 'Afficher'} <ChevronDown className={open ? 'open' : ''} size={18}/></b></button><div className={`mino-expand-body ${open ? 'open' : ''}`}><div>{loaded ? (typeof children === 'function' ? children() : children) : null}</div></div></section>;
}

function buildModel(data, filters, purchaseLots = [], fullCreditLedger) {
  const matchMonth = (row) => !filters.month || row.date?.startsWith(filters.month);
  const matchDate = (row) => matchMonth(row) && (!filters.date || row.date === filters.date);
  const matchUnit = (row) => !filters.unit || row.unit === filters.unit || row.unit === 'G+M';
  const isService = (row) => Boolean(row.service || /PRESTATION/i.test(`${row.rawProduct || ''} ${row.product || ''}`));
  const useReportQtx = (row) => row.aggregate && Number.isFinite(Number(row.sourceQuantity))
    ? { ...row, qtx: isService(row) ? 0 : Number(row.sourceQuantity) }
    : row;
  const excelProduction = data.production.filter((row) => matchDate(row) && matchUnit(row)).map(useReportQtx);
  const pdfPeriodRows = (data.stockPdf?.rows || []).filter((row) => matchMonth(row) && matchUnit(row));
  const pdfRows = pdfPeriodRows.filter((row) => !filters.date || row.date === filters.date);
  const pdfProduction = pdfRows.filter((row) => row.type === 'production');
  const producedArticles = new Set(pdfPeriodRows.filter((row) => row.type === 'production').map((row) => row.article).filter(Boolean));
  const pdfCommercialRows = pdfRows.filter((row) => row.type === 'sale' || row.type === 'reintegration');
  const pdfExcludedSales = producedArticles.size ? pdfCommercialRows.filter((row) => !producedArticles.has(row.article)) : [];
  const pdfSales = pdfCommercialRows
    .filter((row) => !producedArticles.size || producedArticles.has(row.article))
    .map((row) => ({ ...row, qtx: row.type === 'reintegration' ? -row.qtx : row.qtx }));
  const pdfDonations = pdfRows.filter((row) => row.type === 'donation');
  const pdfWheatConsumption = pdfRows.filter((row) => row.type === 'wheatConsumption');
  const pdfWheatMovements = (data.stockPdf?.wheatMovements || pdfRows.filter((row) => /^wheat/.test(row.type)))
    .filter((row) => matchDate(row) && matchUnit(row));
  const hasPdfPhysical = pdfPeriodRows.length > 0;
  const production = hasPdfPhysical ? pdfProduction : excelProduction;
  // Équipes must only use shift-level rows from the Commercial workbook.
  // Older saved imports kept those rows in `production`; newer ones keep a
  // protected copy in `teamProduction`. Merge both so one newer month does not
  // hide legacy Commercial months, and reject official/PDF aggregate rows.
  const legacyCommercialTeam = (data.production || []).filter((row) => !row.aggregate && row.shift && row.shift !== 'Récap mensuel');
  const teamRowsByKey = new Map();
  [...legacyCommercialTeam, ...(data.teamProduction || [])].forEach((row) => {
    if (row.aggregate || !row.shift || row.shift === 'Récap mensuel') return;
    const key = [row.date, row.unit, row.article || row.rawProduct || row.product, row.shift, row.sacks, row.qtx].join('\0');
    teamRowsByKey.set(key, row);
  });
  const teamProductionSource = [...teamRowsByKey.values()];
  const teamProduction = teamProductionSource.filter((row) => matchDate(row) && matchUnit(row));
  const wheat = data.wheat.filter((row) => matchDate(row) && matchUnit(row));
  const sales = data.sales.filter((row) => matchDate(row) && matchUnit(row) && !row.internal).map(useReportQtx);
  const internal = data.sales.filter((row) => matchDate(row) && matchUnit(row) && row.internal).map(useReportQtx);
  const salesQuantityRows = hasPdfPhysical ? pdfSales : sales;
  const physicalDonations = hasPdfPhysical ? pdfDonations : internal;
  // The global Encaissements workbook is the single source of cash receipts.
  // Its rows are not assigned to G/M, so financial KPIs remain consolidated.
  const recoverySource = data.collections || [];
  const recoveries = recoverySource.filter(matchDate);
  const checks = data.checks.filter(matchDate);
  const cash = data.cash.filter(matchDate);
  const purchases = purchaseLots.filter((row) =>
    matchDate(row) &&
    (!filters.unit || row.unit === filters.unit || row.unit === 'G+M'));
  const allDates = [...new Set([...data.production, ...(data.stockPdf?.rows || []), ...(data.wheatTracking?.rows || []), ...data.wheat, ...data.sales, ...recoverySource, ...data.cash].filter(matchMonth).map((row) => row.date))].sort();

  const dailyMap = new Map(allDates.map((date) => [date, { date, label: shortDate(date), wheatG: 0, wheatM: 0, wheatUsedG: 0, wheatUsedM: 0, prodG: 0, prodM: 0, sales: 0, donations: 0, revenue: 0, recovery: 0, cash: 0, expenses: 0, officialCashBalance: 0, hasOfficialCashBalance: false }]));
  wheat.forEach((row) => { const point = dailyMap.get(row.date); if (point) point[`wheat${row.unit}`] += row.qtx; });
  production.forEach((row) => { const point = dailyMap.get(row.date); if (point) point[`prod${row.unit}`] += row.qtx; });
  pdfWheatConsumption.forEach((row) => { const point = dailyMap.get(row.date); if (point) point[`wheatUsed${row.unit}`] += row.qtx; });
  sales.forEach((row) => { const point = dailyMap.get(row.date); if (point) point.revenue += row.amount; });
  salesQuantityRows.forEach((row) => { const point = dailyMap.get(row.date); if (point) point.sales += row.qtx; });
  physicalDonations.forEach((row) => { const point = dailyMap.get(row.date); if (point) point.donations += row.qtx; });
  recoveries.forEach((row) => { const point = dailyMap.get(row.date); if (point) point.recovery += row.amount; });
  cash.forEach((row) => {
    const point = dailyMap.get(row.date);
    if (point) {
      point.cash += row.receipt;
      point.expenses += row.otherExpense + row.millExpense;
      if (row.hasOfficialBalance) {
        point.officialCashBalance = row.officialBalance;
        point.hasOfficialCashBalance = true;
      }
    }
  });
  purchases.forEach((row) => {
    const point = dailyMap.get(row.date);
    if (point) {
      point.purchaseQtx = (point.purchaseQtx || 0) + purchaseQtx(row);
      point.purchaseCost = (point.purchaseCost || 0) + purchaseQtx(row) * purchasePricePerQtx(row);
    }
  });
  const daily = [...dailyMap.values()].filter((row) => !filters.date || row.date === filters.date).map((row) => ({
    ...row,
    wheat: row.wheatG + row.wheatM,
    production: row.prodG + row.prodM,
    wheatQtx: row.wheatG + row.wheatM,
    productionQtx: row.prodG + row.prodM,
    wheatConsumed: row.wheatUsedG + row.wheatUsedM,
    realYield: row.wheatUsedG + row.wheatUsedM ? (row.prodG + row.prodM) / (row.wheatUsedG + row.wheatUsedM) * 100 : 0,
    salesQtx: row.sales,
    purchaseQtx: row.purchaseQtx || 0,
    purchaseCost: row.purchaseCost || 0,
    referenceWheatCost: (row.wheatG + row.wheatM) * WHEAT_PRICE_PER_QTX,
  }));

  const productProduction = aggregate(production, (row) => row.product, (row) => row.qtx).map((row) => ({ name: row.key, qtx: row.value })).sort((a, b) => b.qtx - a.qtx);
  const productSales = aggregate(salesQuantityRows, (row) => row.product, (row) => row.qtx).map((row) => ({ name: row.key, qtx: row.value })).sort((a, b) => b.qtx - a.qtx);
  const clients = aggregate(sales, (row) => row.client, (row) => row.amount).map((row) => ({ name: row.key, amount: row.value })).sort((a, b) => b.amount - a.amount);
  const productPriceMap = new Map();
  sales.forEach((row) => { const item = productPriceMap.get(row.product) || { name: row.product, qtx: 0, amount: 0 }; item.qtx += row.qtx; item.amount += row.amount; productPriceMap.set(row.product, item); });
  const productPrices = [...productPriceMap.values()].map((row) => ({ ...row, pricePerQtx: row.qtx ? row.amount / row.qtx : 0 })).sort((a,b)=>b.qtx-a.qtx);
  const shiftMap = new Map(['16H-00H', '00H-08H', '08H-16H'].map((shift) => [shift, { shift, G: 0, M: 0, total: 0 }]));
  teamProduction.forEach((row) => { if (!shiftMap.has(row.shift)) shiftMap.set(row.shift, { shift: row.shift, G: 0, M: 0, total: 0 }); const item = shiftMap.get(row.shift); item[row.unit] += row.qtx; item.total += row.qtx; });
  const shifts = [...shiftMap.values()];
  const shiftDailyMap = new Map(allDates.map((date) => [date, { date, label: shortDate(date), shift16: 0, shift00: 0, shift08: 0 }]));
  const shiftKey = { '16H-00H': 'shift16', '00H-08H': 'shift00', '08H-16H': 'shift08' };
  teamProduction.forEach((row) => { const item = shiftDailyMap.get(row.date); if (item && shiftKey[row.shift]) item[shiftKey[row.shift]] += row.qtx; });
  const shiftDaily = [...shiftDailyMap.values()].filter((row) => !filters.date || row.date === filters.date);
  const unitProduction = ['G', 'M'].map((unit) => ({ name: unit === 'G' ? 'Groupe (G)' : 'Minoterie Abidi (M)', value: sum(teamProduction.filter((row) => row.unit === unit), 'qtx') }));

  const cashDaily = new Map();
  cash.forEach((row) => {
    const item = cashDaily.get(row.date) || { date: row.date, receipt: 0, otherExpense: 0, millExpense: 0, notes: [] };
    item.receipt += row.receipt; item.otherExpense += row.otherExpense; item.millExpense += row.millExpense;
    if (row.note) item.notes.push(row.note); cashDaily.set(row.date, item);
  });
  const recoveryDaily = new Map(aggregate(recoveries, (row) => row.date, (row) => row.amount).map((row) => [row.key, row.value]));
  const checksDaily = new Map(checks.map((row) => [row.date, row]));
  const reconciliation = [...cashDaily.values()].map((row) => {
    const commercial = recoveryDaily.get(row.date) || 0;
    const cheque = checksDaily.get(row.date)?.cheque || 0;
    const expectedCash = commercial - cheque;
    const gap = row.receipt - expectedCash;
    return { ...row, commercial, cheque, expectedCash, gap, status: Math.abs(gap) <= 50 ? 'OK' : 'À vérifier' };
  });
  const negativeWheat = wheat.filter((row) => row.qtx < 0);
  const otherReceipts = cash.filter((row) => row.receipt > 0 && /REMBOUR/i.test(row.note));
  const pdfLastMonth = data.stockPdf?.meta?.lastDate?.slice(0, 7);
  const pdfNegativeStocks = hasPdfPhysical && (!filters.month || filters.month === pdfLastMonth) && (!filters.date || filters.date === data.stockPdf?.meta?.lastDate)
    ? (data.stockPdf?.negativeStocks || []).filter((row) => matchUnit(row))
    : [];
  const anomalies = [
    ...negativeWheat.map((row) => ({ severity: 'warning', date: row.date, type: 'Ajustement blé', detail: `${row.unit}: ${n(row.qtx, 1)} qtx — à confirmer` })),
    ...reconciliation.filter((row) => Math.abs(row.gap) > 50).map((row) => ({ severity: 'warning', date: row.date, type: 'Écart caisse / commercial', detail: `${money(row.gap)} d’écart` })),
    ...otherReceipts.map((row) => ({ severity: 'info', date: row.date, type: 'Autre recette', detail: `${money(row.receipt)} — ${row.note}` })),
    ...pdfNegativeStocks.map((row) => ({ severity: 'warning', date: data.stockPdf?.meta?.lastDate || '', type: 'Stock négatif PDF', detail: `${row.article} · ${row.location || row.warehouse}: ${n(row.stock, 2)} qtx (page ${row.page})` })),
    ...pdfExcludedSales.map((row) => ({ severity: 'info', date: row.date, type: 'Sortie hors production', detail: `${row.article} · ${row.product}: ${n(row.qtx, 2)} qtx exclus des ventes produites` })),
  ];

  const totalProduction = sum(production, 'qtx');
  const totalWheat = sum(wheat, 'qtx');
  const receipts = sum(cash, 'receipt');
  const expenses = sum(cash, 'otherExpense') + sum(cash, 'millExpense');
  // Encaissements do not carry a G/M assignment. Keep the financial comparison
  // consolidated, but apply the selected month/date to all three cash-flow terms.
  const financialWheat = data.wheat.filter(matchDate);
  const financialSales = data.sales.filter((row) => matchDate(row) && !row.internal).map(useReportQtx);
  const financialPurchases = purchaseLots.filter(matchDate);
  const purchasedQtx = financialPurchases.reduce((total, row) => total + purchaseQtx(row), 0);
  const purchaseCost = financialPurchases.reduce((total, row) => total + purchaseQtx(row) * purchasePricePerQtx(row), 0);
  const referenceWheatCost = sum(financialWheat, 'qtx') * WHEAT_PRICE_PER_QTX;
  const wheatCostBasis = purchaseCost || referenceWheatCost;
  const costBasisIsActual = purchaseCost > 0;
  const averagePurchasePrice = purchasedQtx ? purchaseCost / purchasedQtx : WHEAT_PRICE_PER_QTX;
  const revenue = sum(financialSales, 'amount');
  const operationalRevenue = sum(sales, 'amount');
  const reportedRecovery = sum(recoveries, 'amount');
  const collectionFile = data.meta?.collectionFile || data.collections?.[0]?.sourceFile || '';
  const recoverySourceName = data.collections?.length
    ? `Encaissements · ${collectionFile || 'fichier global'}`
    : 'Encaissements · aucun fichier importé';
  const sourceNames = (rows, fallback) => {
    const files = [...new Set(rows.map((row) => row.sourceFile).filter(Boolean))];
    return files.length ? files.join(' · ') : fallback;
  };
  const wheatSourceName = costBasisIsActual ? 'Registre manuel des achats' : sourceNames(financialWheat, 'Fichier Commercial · blé suivi');
  const revenueSourceName = sourceNames(financialSales, 'Fichier Ventes / Commercial');
  const physicalSourceName = hasPdfPhysical
    ? `PDF stock · ${data.stockPdf?.meta?.fileName || 'fichier annuel'}`
    : sourceNames([...production, ...salesQuantityRows], 'Rapports Production et Ventes');
  const creditMonths = fullCreditLedger?.monthly || [];
  const creditSummary = filters.month
    ? creditMonths.find((row) => row.month === filters.month)
    : creditMonths.at(-1);
  const creditRows = (fullCreditLedger?.rows || []).filter((row) => !creditSummary?.month || row.month === creditSummary.month);
  const grossCreditRemaining = sum(creditRows, 'closingCredit');
  const clientAdvances = sum(creditRows, 'advance');
  const clientNetOfficial = creditSummary?.netOfficial ?? (grossCreditRemaining - clientAdvances);
  const creditSourceName = fullCreditLedger?.isBalance
    ? `Balance client · ${fullCreditLedger.meta?.fileName || 'fichier importé'}`
    : 'Rapprochement ventes et encaissements par client';
  const salesQty = sum(salesQuantityRows, 'qtx');
  const internalQty = sum(physicalDonations, 'qtx');
  const wheatActiveRows = daily.filter((row) => row.wheat > 0);
  const activeConsumptionDays = wheatActiveRows.length;
  const activeProductionDays = daily.filter((row) => row.production > 0).length;
  const activeSalesDays = daily.filter((row) => row.sales > 0).length;
  const avgWheat = activeConsumptionDays ? totalWheat / activeConsumptionDays : 0;
  const wheatVariance = activeConsumptionDays ? Math.sqrt(wheatActiveRows.reduce((total, row) => total + Math.pow(row.wheat - avgWheat, 2), 0) / activeConsumptionDays) : 0;
  const peakConsumption = [...daily].sort((a, b) => b.wheat - a.wheat)[0];
  const peakProduction = [...daily].sort((a, b) => b.production - a.production)[0];
  const topClientShare = operationalRevenue ? clients.slice(0, 5).reduce((total, row) => total + row.amount, 0) / operationalRevenue * 100 : 0;
  const topProductShare = salesQty ? productSales.slice(0, 3).reduce((total, row) => total + row.qtx, 0) / salesQty * 100 : 0;
  const purchaseSuppliers = aggregate(purchases, (row) => row.supplier || 'Non renseigné', (row) => purchaseQtx(row) * purchasePricePerQtx(row))
    .map((row) => ({ name: row.key, amount: row.value })).sort((a, b) => b.amount - a.amount);
  const reconciledDays = reconciliation.filter((row) => row.status === 'OK').length;
  let cumulativeMaterial = 0;
  let cumulativeCash = 0;
  daily.forEach((row) => {
    cumulativeMaterial += row.wheat - row.production;
    cumulativeCash += row.cash - row.expenses;
    row.cumulativeMaterialGap = cumulativeMaterial;
    row.dailyYield = row.wheat ? row.production / row.wheat * 100 : 0;
    row.cumulativeCash = cumulativeCash;
    row.cashBalance = row.hasOfficialCashBalance ? row.officialCashBalance : cumulativeCash;
  });
  const cashOfficialBalanceAvailable = daily.some((row) => row.hasOfficialCashBalance);
  const officialProductionRows = production.filter((row) => row.aggregate && Number.isFinite(Number(row.sourceQuantity)));
  const officialSalesRows = sales.filter((row) => row.aggregate && !isService(row) && Number.isFinite(Number(row.sourceQuantity)));
  const productionOfficialQuantity = hasPdfPhysical ? totalProduction : (officialProductionRows.length ? sum(officialProductionRows, 'sourceQuantity') : totalProduction);
  const salesOfficialQuantity = hasPdfPhysical ? salesQty : (officialSalesRows.length ? sum(officialSalesRows, 'sourceQuantity') : salesQty);
  const anomalyDistribution = aggregate(anomalies, (row) => row.type, () => 1).map((row) => ({ name: row.key, value: row.value })).sort((a,b)=>b.value-a.value);
  const anomalyTimeline = aggregate(anomalies, (row) => row.date, () => 1).map((row) => ({ date: row.key, label: shortDate(row.key), count: row.value })).sort((a,b)=>a.date.localeCompare(b.date));
  const expenseBreakdown = [
    { name: 'Autres dépenses', value: sum(cash, 'otherExpense') },
    { name: 'Dépenses minoterie', value: sum(cash, 'millExpense') },
  ].filter((row)=>row.value>0);
  return {
    production, teamProduction, wheat, sales, internal, recoveries, checks, cash, purchases, daily, productProduction, productSales, productPrices, clients, shifts, shiftDaily, unitProduction, pdfWheatMovements,
    reconciliation, anomalies, anomalyDistribution, anomalyTimeline, expenseBreakdown, purchaseSuppliers, clientBalance: data.clientBalance, creditLedger: fullCreditLedger, dates: allDates, peakConsumption, peakProduction, cashOfficialBalanceAvailable,
    kpis: {
      wheat: totalWheat, production: totalProduction, indicativeRatio: totalWheat ? totalProduction / totalWheat * 100 : 0,
      salesQty, revenue, operationalRevenue, recovery: reportedRecovery, recoverySourceName,
      productionOfficialQuantity, salesOfficialQuantity,
      productionOfficialUnit: 'qtx', salesOfficialUnit: 'qtx', physicalSource: hasPdfPhysical ? 'PDF stock' : 'Excel', hasPdfWheat: pdfPeriodRows.some((row) => row.type === 'wheatConsumption'),
      receipts, expenses, netCash: receipts - expenses, internalQty,
      purchasedQtx, purchaseCost, referenceWheatCost, wheatCostBasis, costBasisIsActual, averagePurchasePrice,
      financialWheatQtx: sum(financialWheat, 'qtx'), hasCollections: Boolean(data.collections?.length),
      wheatSourceName, revenueSourceName, physicalSourceName,
      creditRemaining: grossCreditRemaining,
      clientAdvances, clientNetOfficial,
      unpaidClients: creditRows.filter((row) => row.closingCredit > 0).length,
      creditPeriod: creditSummary?.label || creditSummary?.month || filters.month || 'dernière période disponible',
      creditSourceName,
      salesCoverage: wheatCostBasis ? revenue / wheatCostBasis * 100 : null,
      recoveryCoverage: wheatCostBasis ? reportedRecovery / wheatCostBasis * 100 : null,
      salesBalance: revenue - wheatCostBasis,
      recoveryBalance: reportedRecovery - wheatCostBasis,
      activeConsumptionDays, activeProductionDays, activeSalesDays,
      avgWheatQtx: avgWheat,
      avgProductionQtx: activeProductionDays ? totalProduction / activeProductionDays : 0,
      avgSalesQtx: activeSalesDays ? salesQty / activeSalesDays : 0,
      wheatVolatility: avgWheat ? wheatVariance / avgWheat * 100 : 0,
      materialGapQtx: totalWheat - totalProduction,
      outputGapQtx: totalProduction - salesQty - internalQty,
      avgSalePricePerQtx: salesQty ? operationalRevenue / salesQty : 0,
      recoveryRate: revenue ? reportedRecovery / revenue * 100 : null,
      topClientShare, topProductShare,
      expenseRate: receipts ? expenses / receipts * 100 : 0,
      reconciliationRate: reconciliation.length ? reconciledDays / reconciliation.length * 100 : 0,
      reconciledDays,
    },
  };
}

function Overview({ model, filteredUnit, onImportCollections }) {
  const [kpiExplanation, setKpiExplanation] = useState(null);
  const hasWheatCost = model.kpis.wheatCostBasis > 0;
  const salesCovered = hasWheatCost && model.kpis.salesBalance >= 0;
  const hasCollections = model.kpis.hasCollections;
  const recoveryCovered = hasCollections && hasWheatCost && model.kpis.recoveryBalance >= 0;
  const costLabel = model.kpis.costBasisIsActual ? 'Achats enregistrés' : `Blé suivi × ${n(WHEAT_PRICE_PER_QTX)} DA/qtx`;
  const recoveryCoverage = hasCollections && hasWheatCost ? model.kpis.recoveryCoverage : null;
  const coverageStatus = recoveryCoverage == null ? 'Données insuffisantes'
    : recoveryCoverage < 80 ? 'Critique'
      : recoveryCoverage < 100 ? 'À surveiller'
        : recoveryCoverage <= 120 ? 'Coût couvert' : 'Couvert avec excédent';
  const coverageTone = (value) => value == null || value < 80 ? 'alert' : value < 100 ? 'gold' : 'green';
  const decision = !hasCollections
    ? 'Importez le fichier Encaissements pour mesurer la couverture réelle.'
    : !hasWheatCost
      ? 'Le coût valorisé du blé est indisponible pour cette période.'
      : recoveryCovered
        ? 'Les encaissements enregistrés sur la période couvrent le coût valorisé du blé.'
        : salesCovered
          ? 'Les ventes couvrent le blé, mais les encaissements de la période restent insuffisants.'
          : 'Les ventes et les encaissements de la période ne couvrent pas encore le coût du blé.';
  const explain = (title, meaning, formula, sources, values, result, managerReading) => setKpiExplanation({ title, meaning, formula, sources, values, result, managerReading });
  const periodDates = model.daily.map((row) => row.date).filter(Boolean).sort();
  const periodStart = periodDates[0] || model.dates[0] || '';
  const periodEnd = periodDates.at(-1) || model.dates.at(-1) || '';
  const displayDate = (date) => date ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '—';
  const periodLabel = periodStart === periodEnd ? displayDate(periodStart) : `${displayDate(periodStart)} → ${displayDate(periodEnd)}`;
  const criticalAlerts = model.anomalies.filter((row) => row.severity === 'critical' || /stock négatif/i.test(row.type)).length;
  const warningAlerts = model.anomalies.filter((row) => row.severity !== 'info' && row.severity !== 'critical' && !/stock négatif/i.test(row.type)).length;
  const informationAlerts = model.anomalies.filter((row) => row.severity === 'info').length;
  const physicalSource = model.kpis.physicalSource === 'PDF stock' ? 'PDF Stock' : 'Production / Ventes';
  return <>
    <section className={`mino-hero executive ${recoveryCovered ? 'covered' : 'uncovered'}`}><div><span><Gauge size={16}/> Synthèse de décision</span><div className="manager-period"><CalendarDays size={15}/><b>Période analysée :</b> {periodLabel}</div><h2>{decision}</h2><p>Base utilisée : {costLabel}. Même période pour le blé, la facturation et les encaissements · données financières consolidées G + M{filteredUnit ? ` (le filtre ${filteredUnit} reste appliqué aux indicateurs physiques)` : ''}.</p><p className="hero-profit-warning"><AlertTriangle size={14}/> Le solde après coût du blé ne représente pas le bénéfice net : les autres charges ne sont pas encore déduites.</p></div><div className="mino-hero-ratio"><small>Couverture encaissée</small><strong>{recoveryCoverage == null ? '—' : `${n(recoveryCoverage, 1)}%`}</strong><span>{coverageStatus}</span><dl><div><dt>Coût du blé</dt><dd>{money(model.kpis.wheatCostBasis)}</dd></div><div><dt>Encaissé</dt><dd>{hasCollections ? money(model.kpis.recovery) : '—'}</dd></div><div><dt>Solde après coût</dt><dd className={model.kpis.recoveryBalance < 0 ? 'negative' : ''}>{hasCollections ? money(model.kpis.recoveryBalance) : '—'}</dd></div></dl></div></section>
    <section className="manager-kpi-section-block"><header><div><span>Lecture opérationnelle</span><h3>Flux physiques</h3></div><small>Quantités en quintaux</small></header><div className="mino-kpi-grid manager-five">
      <Kpi icon={Wheat} label="Blé suivi" value={`${n(model.kpis.wheat,1)} qtx`} note={`${n(model.kpis.activeConsumptionDays)} jours actifs`} tone="gold" source="Commercial" onClick={()=>explain('Blé suivi','كمية القمح المسجلة خلال الفترة المختارة.','مجموع كميات القمح اليومية',[model.kpis.wheatSourceName],[`القمح المتابع: ${n(model.kpis.wheat,1)} qtx`],`${n(model.kpis.wheat,1)} qtx`,'استعمل هذه القيمة لمقارنة المادة الداخلة مع الإنتاج، مع مراعاة المخزون.')}/>
      <Kpi icon={Factory} label="Production" value={`${n2(model.kpis.productionOfficialQuantity)} qtx`} note="Entrées de produits finis" source={physicalSource} onClick={()=>explain('Production','إجمالي المنتجات التي دخلت إلى مخزون المنتج النهائي.','مجموع حركات دخول الإنتاج',[model.kpis.physicalSourceName],[`الإنتاج: ${n2(model.kpis.productionOfficialQuantity)} qtx`],`${n2(model.kpis.productionOfficialQuantity)} qtx`,'قارنها مع المخارج والمخزون لفهم توازن المنتجات.')}/>
      <Kpi icon={PackageCheck} label="Ventes nettes" value={`${n2(model.kpis.salesOfficialQuantity)} qtx`} note="Sorties − réintégrations" tone="green" source={physicalSource} onClick={()=>explain('Ventes nettes','كمية الخروج التجاري بعد طرح الكميات المعاد إدخالها.','الخروج التجاري − إعادة الإدماج',[model.kpis.physicalSourceName],[`المبيعات الصافية: ${n2(model.kpis.salesOfficialQuantity)} qtx`],`${n2(model.kpis.salesOfficialQuantity)} qtx`,'هذه هي الكمية التجارية الخارجة، ولا تشمل الهبات.')}/>
      <Kpi icon={Users} label="Dons" value={`${n2(model.kpis.internalQty)} qtx`} note="Sorties non facturées" tone="gold" source={physicalSource} onClick={()=>explain('Dons','كميات خرجت فعليًا من المخزون دون أن تكون مبيعات مفوترة.','مجموع حركات DON',[model.kpis.physicalSourceName],[`الهبات: ${n2(model.kpis.internalQty)} qtx`],`${n2(model.kpis.internalQty)} qtx`,'يجب إظهارها منفصلة لأنها تؤثر في المخزون ولا تدخل في رقم الأعمال.')}/>
      <Kpi icon={Scale} label="Écart production / sorties totales" value={`${n(model.kpis.outputGapQtx,1)} qtx`} note={`${n2(model.kpis.production)} − ${n2(model.kpis.salesQty)} − ${n2(model.kpis.internalQty)}`} tone="gold" source={physicalSource} onClick={()=>explain('Écart production / sorties totales','يقارن الإنتاج بكل المخارج الفيزيائية: المبيعات والهبات.','الإنتاج − المبيعات الصافية − الهبات',[model.kpis.physicalSourceName],[`الإنتاج: ${n2(model.kpis.production)} qtx`,`المبيعات الصافية: ${n2(model.kpis.salesQty)} qtx`,`الهبات: ${n2(model.kpis.internalQty)} qtx`],`${n(model.kpis.outputGapQtx,1)} qtx`,model.kpis.outputGapQtx<0?'المخارج أكبر من إنتاج الفترة، وقد يكون الفرق صادرًا من المخزون الأولي.':'الإنتاج أكبر من المخارج، ويُفترض أن يظهر الفرق في المخزون النهائي.')}/>
    </div></section>
    <section className="manager-kpi-section-block"><header><div><span>Lecture trésorerie</span><h3>Performance financière</h3></div><small>Valeurs en dinars</small></header><div className="mino-kpi-grid manager-five">
      <Kpi icon={Wheat} label="Coût valorisé du blé" value={money(model.kpis.wheatCostBasis)} note={`${n(model.kpis.financialWheatQtx,1)} qtx × ${n(WHEAT_PRICE_PER_QTX)} DA`} tone="gold" source={model.kpis.costBasisIsActual?'Achats':'Commercial'} onClick={()=>explain('Coût valorisé du blé','يمثل القيمة المرجعية للقمح المرتبط بالفترة، ولا يشمل باقي المصاريف.','كمية القمح × 1 285 دج/قنطار',[model.kpis.wheatSourceName],[`التكلفة: ${money(model.kpis.wheatCostBasis)}`],money(model.kpis.wheatCostBasis),'هذه عتبة تكلفة القمح فقط وليست التكلفة النهائية.')}/>
      <Kpi icon={CircleDollarSign} label="Chiffre d’affaires" value={money(model.kpis.revenue)} note="Ventes facturées" source="Ventes / Commercial" onClick={()=>explain('Chiffre d’affaires','قيمة المبيعات التي تم بيعها وفوترتها.','مجموع مبالغ المبيعات المفوترة',[model.kpis.revenueSourceName],[`رقم الأعمال: ${money(model.kpis.revenue)}`],money(model.kpis.revenue),'لا يمثل المبلغ المقبوض ولا الربح الصافي.')}/>
      <Kpi icon={Banknote} label="Encaissements" value={hasCollections?money(model.kpis.recovery):'—'} note="Argent réellement enregistré" tone={hasCollections?'green':'alert'} source="Encaissements" onClick={()=>explain('Encaissements','الأموال المسجلة فعليًا كمقبوضات خلال الفترة.','مجموع عمليات التحصيل',[model.kpis.recoverySourceName],[`المقبوض: ${hasCollections?money(model.kpis.recovery):'غير متوفر'}`],hasCollections?money(model.kpis.recovery):'—','قارن المقبوض بالفواتير والديون، وليس برقم الأعمال وحده.')}/>
      <Kpi icon={TrendingUp} label="Taux de recouvrement" value={hasCollections&&model.kpis.recoveryRate!=null?`${n(model.kpis.recoveryRate,1)}%`:'—'} note="Encaissé ÷ facturé" tone={coverageTone(model.kpis.recoveryRate)} source="Encaissements + Ventes" onClick={()=>explain('Taux de recouvrement','نسبة تحويل المبيعات المفوترة إلى سيولة مسجلة.','التحصيلات ÷ رقم الأعمال × 100',[model.kpis.recoverySourceName,model.kpis.revenueSourceName],[`المفوتر: ${money(model.kpis.revenue)}`,`المقبوض: ${hasCollections?money(model.kpis.recovery):'غير متوفر'}`],hasCollections&&model.kpis.recoveryRate!=null?`${n(model.kpis.recoveryRate,1)}%`:'—','كلما اقتربت النسبة من 100% كان التحصيل أفضل، وقد تتجاوزها عند تحصيل ديون قديمة.')}/>
      <Kpi icon={CreditCard} label="Créances à recouvrer" value={money(model.kpis.creditRemaining)} note={`${n(model.kpis.unpaidClients)} clients débiteurs`} tone={model.kpis.creditRemaining>0?'alert':'green'} source="Balance client" onClick={()=>explain('Créances à recouvrer','ما بقي عند الزبائن ولم يُسدّد حسب آخر Balance client.','مجموع الأرصدة الموجبة للزبائن',[model.kpis.creditSourceName],[`الديون: ${money(model.kpis.creditRemaining)}`,`التسبيقات: ${money(model.kpis.clientAdvances)}`],money(model.kpis.creditRemaining),'ابدأ بمتابعة أكبر الأرصدة وأقدمها، لأن تسبيق زبون لا يسدد دين زبون آخر.')}/>
    </div></section>
    <section className={`manager-alert-summary ${criticalAlerts ? 'has-critical' : ''}`} role="button" tabIndex={0} onClick={()=>explain('Alertes ouvertes','هي نتائج آلية تحتاج ترتيبًا ومراجعة، وليست كلها أخطاء مؤكدة.','حرجة + تحتاج تحقق + معلوماتية',[`Commercial, Caisse, ${model.kpis.physicalSourceName}`],[`حرجة: ${criticalAlerts}`,`تحتاج تحقق: ${warningAlerts}`,`معلوماتية: ${informationAlerts}`],n(model.anomalies.length),criticalAlerts?'ابدأ بالحالات الحرجة، ثم راجع حالات التحقق حسب أثرها المالي والمخزني.':'لا توجد حالة حرجة مصنفة حاليًا؛ راجع حالات التحقق حسب الأولوية.')}><div><span><AlertTriangle/> Contrôle des données</span><h3>{n(model.anomalies.length)} alertes ouvertes</h3></div><dl><div className="critical"><dt>Critiques</dt><dd>{criticalAlerts}</dd></div><div className="warning"><dt>À vérifier</dt><dd>{warningAlerts}</dd></div><div className="info"><dt>Informatives</dt><dd>{informationAlerts}</dd></div></dl><b><Info/> Voir le détail</b></section>
    <section className="mino-grid two-one manager-flow">
      <Panel eyebrow="Lecture du mois" title="Équilibre des volumes" note="quintaux consolidés"><div className="volume-balance">{[
        ['Blé suivi',model.kpis.wheat,'#c99715'],['Produit',model.kpis.production,'#7a3024'],['Vendu',model.kpis.salesQty,'#3f6f68']
      ].map(([label,value,color])=><div key={label}><span>{label}</span><div><i style={{width:`${model.kpis.wheat ? value/model.kpis.wheat*100 : 0}%`,background:color}}/></div><strong>{n(value,1)} qtx</strong></div>)}<aside><b>{n(model.kpis.materialGapQtx,1)} qtx</b><span>écart matière indicatif</span></aside></div></Panel>
      <Panel eyebrow="Seuil de rentabilité" title="Couverture du coût du blé" note={`${costLabel} · G + M`}><div className="coverage-stack"><div><span>Coût valorisé du blé</span><strong>{money(model.kpis.wheatCostBasis)}</strong><div className="coverage-track"><i style={{width:'100%',background:'#c99715'}}/></div></div><div><span>Couverture par ventes facturées</span><strong>{hasWheatCost ? `${n(model.kpis.salesCoverage,1)}%` : '—'}</strong><div className="coverage-track"><i style={{width:`${Math.min(100,model.kpis.salesCoverage||0)}%`,background:salesCovered?'#3f6f68':'#7a3024'}}/></div><small>Solde commercial : {money(model.kpis.salesBalance)}</small></div><div><span>Couverture par encaissements</span><strong>{recoveryCoverage == null ? '—' : `${n(recoveryCoverage,1)}%`}</strong><div className="coverage-track"><i style={{width:`${Math.min(100,recoveryCoverage||0)}%`,background:recoveryCovered?'#3f6f68':'#a95b48'}}/></div><small>{hasCollections ? `Solde après coût : ${money(model.kpis.recoveryBalance)}` : 'Fichier Encaissements non importé'}</small></div></div></Panel>
    </section>
    <section className="mino-grid equal">
      <Panel eyebrow="Lecture financière" title="Blé, facturation et encaissement" note={`DA · consolidé G + M · blé à ${n(WHEAT_PRICE_PER_QTX)} DA/qtx`}><div className="mino-chart"><ResponsiveContainer><BarChart data={[{name:'Coût blé',value:model.kpis.wheatCostBasis},{name:'Chiffre d’affaires',value:model.kpis.revenue},{name:'Encaissements',value:model.kpis.recovery}]}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="name" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip content={<TooltipCard/>}/><Bar dataKey="value" name="Montant" radius={[8,8,0,0]}>{['#c99715','#7a3024','#3f6f68'].map((color)=><Cell key={color} fill={color}/>)}</Bar></BarChart></ResponsiveContainer></div></Panel>
      <Panel eyebrow="Flux physiques" title="Production vs sorties enregistrées" note="comparaison · qtx"><div className="mino-chart"><ResponsiveContainer><BarChart layout="vertical" data={[{name:'Production du mois',value:model.kpis.production,color:'#7a3024'},{name:'Ventes du mois',value:model.kpis.salesQty,color:'#3f6f68'},{name:'Dons aux travailleurs',value:model.kpis.internalQty,color:'#c99715'}]} margin={{left:24,right:20}}><CartesianGrid horizontal={false} stroke="#e7e0d7"/><XAxis type="number" axisLine={false}/><YAxis type="category" dataKey="name" width={130} axisLine={false}/><Tooltip content={<TooltipCard/>}/><Bar dataKey="value" name="Quintaux" radius={[0,8,8,0]}>{['#7a3024','#3f6f68','#c99715'].map((color)=><Cell key={color} fill={color}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="chart-footnote"><AlertTriangle/>{model.kpis.outputGapQtx < 0 ? `Les sorties dépassent la production de ${n(Math.abs(model.kpis.outputGapQtx),1)} qtx : elles proviennent probablement du stock initial.` : `La production dépasse les sorties de ${n(model.kpis.outputGapQtx,1)} qtx, mais le stock restant exige le stock initial et final.`}</div></Panel>
    </section>
    {kpiExplanation&&<div className="credit-calc-layer" role="presentation" onMouseDown={()=>setKpiExplanation(null)}><section className="credit-calc-box manager-kpi-explanation" role="dialog" aria-modal="true" aria-labelledby="manager-kpi-title" onMouseDown={(event)=>event.stopPropagation()}><button className="credit-calc-close" onClick={()=>setKpiExplanation(null)} aria-label="Fermer"><X/></button><span>شرح المؤشر للمدير</span><h3 id="manager-kpi-title">{kpiExplanation.title}</h3><div className="manager-kpi-result"><small>القيمة حسب الفلاتر الحالية</small><strong>{kpiExplanation.result}</strong></div><div className="manager-kpi-section" dir="rtl"><h4>ماذا يعني هذا المؤشر؟</h4><p>{kpiExplanation.meaning}</p></div><div className="manager-kpi-section" dir="rtl"><h4>كيف تم حسابه؟</h4><code>{kpiExplanation.formula}</code>{kpiExplanation.values.map((line,index)=><p key={`${index}-${line}`}>{line}</p>)}</div><div className="manager-kpi-section sources" dir="rtl"><h4>مصدر البيانات</h4>{kpiExplanation.sources.map((source,index)=><p key={`${index}-${source}`}><Database size={15}/><span>{source}</span></p>)}</div><div className="manager-kpi-manager" dir="rtl"><strong>قراءة المدير</strong><p>{kpiExplanation.managerReading}</p></div>{(!hasCollections&&/encaiss/i.test(kpiExplanation.title))&&<button className="manager-kpi-import" onClick={()=>{setKpiExplanation(null);onImportCollections();}}><Upload size={16}/> Importer Encaissements</button>}</section></div>}
  </>;
}

function WheatProduction({ model }) {
  const [yieldExplanation, setYieldExplanation] = useState(null);
  const [yieldMode, setYieldMode] = useState('pdf');
  const usePdfYield = yieldMode === 'pdf' && model.kpis.hasPdfWheat;
  const yieldInput = (row) => usePdfYield ? row.wheatConsumed : row.wheat;
  const yieldValue = (row) => usePdfYield ? row.realYield : row.dailyYield;
  const yieldField = usePdfYield ? 'realYield' : 'dailyYield';
  const yieldInputLabel = usePdfYield ? 'Blé consommé (PDF)' : 'Blé suivi (LIVRAISON)';
  const selectedYieldDay = yieldExplanation?.date ? model.daily.find((row) => row.date === yieldExplanation.date) : null;
  const yieldWheat = model.daily.reduce((total, row) => total + yieldInput(row), 0);
  const yieldProduction = sum(model.daily, 'production');
  const periodYield = yieldWheat ? yieldProduction / yieldWheat * 100 : null;
  const yieldGap = yieldWheat - yieldProduction;
  const yieldReading = (row) => {
    const input = yieldInput(row);
    const value = yieldValue(row);
    if (!input && row.production > 0) return { label: usePdfYield ? 'Production sans consommation BT001 enregistrée' : 'Production sur stock antérieur', action: usePdfYield ? 'Contrôler la saisie SORTIE – Production de BT001 dans la fiche stock.' : 'Vérifier le stock d’ouverture et confirmer qu’aucune livraison du jour ne manque dans Commercial.', tone: 'warning' };
    if (input > 0 && !row.production) return { label: usePdfYield ? 'Consommation sans produit fini enregistré' : 'Blé reçu sans production', action: usePdfYield ? 'Contrôler les entrées ENT PRODUCTION des produits finis.' : 'Vérifier un arrêt de production ou une mise en stock reportée au jour suivant.', tone: 'warning' };
    if (!input && !row.production) return { label: 'Aucune activité enregistrée', action: 'Aucune action si le site était à l’arrêt.', tone: 'neutral' };
    if (value > 105) return { label: 'Sortie produits supérieure au blé consommé', action: 'Rapprocher les mouvements BT001 et les entrées de produits finis; ce niveau indique une incohérence de stock ou de période.', tone: 'warning' };
    if (value < 95) return { label: 'Transformation inférieure au blé consommé', action: 'Contrôler pertes, humidité, déchets et produits non enregistrés.', tone: 'warning' };
    return { label: 'Transformation cohérente', action: 'Aucun écart majeur visible dans les mouvements de la période.', tone: 'ok' };
  };
  const selectedYieldReading = selectedYieldDay ? yieldReading(selectedYieldDay) : null;
  const productionWithoutDelivery = model.daily.filter((row) => !yieldInput(row) && row.production > 0);
  const deliveryWithoutProduction = model.daily.filter((row) => yieldInput(row) > 0 && !row.production);
  const irregularYieldDays = model.daily.filter((row) => yieldInput(row) > 0 && row.production > 0 && (yieldValue(row) < 95 || yieldValue(row) > 105));
  const yieldDaily = model.daily.map((row) => ({ ...row, displayedYield: yieldValue(row) }));
  const wheatMovementDelta = (row) => ['wheatReception','wheatTransferIn'].includes(row.type) ? row.qtx : -row.qtx;
  const wheatStockByUnit = ['G','M'].map((unit) => {
    const movements = model.pdfWheatMovements.filter((row) => row.unit === unit).slice().sort((a,b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
    const first = movements[0];
    const last = movements.at(-1);
    return {
      unit, opening: first ? first.stock - wheatMovementDelta(first) : 0, closing: last?.stock || 0,
      reception: sum(movements.filter((row)=>row.type==='wheatReception'),'qtx'),
      consumption: sum(movements.filter((row)=>row.type==='wheatConsumption'),'qtx'),
      transferIn: sum(movements.filter((row)=>row.type==='wheatTransferIn'),'qtx'),
      transferOut: sum(movements.filter((row)=>row.type==='wheatTransferOut'),'qtx'),
    };
  });
  const wheatStockOpening = sum(wheatStockByUnit, 'opening');
  const wheatStockClosing = sum(wheatStockByUnit, 'closing');
  const negativeWheatUnits = wheatStockByUnit.filter((row) => row.closing < 0);
  const periodReading = yieldGap > 0
    ? `${n2(yieldGap)} qtx de ${usePdfYield ? 'blé consommé' : 'blé suivi'} ne se retrouvent pas dans les produits finis de la période. Contrôler pertes, déchets et productions non enregistrées.`
    : yieldGap < 0
      ? `Les produits finis dépassent le ${usePdfYield ? 'blé consommé' : 'blé livré'} de ${n2(Math.abs(yieldGap))} qtx. Contrôler les mouvements de stock et la période d’enregistrement.`
      : 'Les volumes de blé et de produits finis sont équilibrés sur la période affichée.';
  const openYieldExplanation = (state) => setYieldExplanation({ date: state?.activePayload?.[0]?.payload?.date || '' });
  const yieldKeyDown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setYieldExplanation({ date: '' }); } };
  return <>
    <section className="mino-title"><span><Wheat size={16}/> Matière & rendement</span><h2>Suivre le blé et ce qu’il devient chaque jour</h2><p>Les valeurs de consommation restent indicatives jusqu’à confirmation du stock initial/final de blé.</p></section>
    <div className="yield-mode-control"><div><strong>Source du rendement</strong><span>{usePdfYield ? 'Consommation BT001 · SORTIE Production du PDF' : 'Entrées quotidiennes · LIVRAISON du Commercial'}</span></div><div className="yield-mode-switch"><button className={usePdfYield?'active':''} disabled={!model.kpis.hasPdfWheat} onClick={()=>setYieldMode('pdf')}>Rendement réel · PDF</button><button className={!usePdfYield?'active':''} onClick={()=>setYieldMode('legacy')}>Méthode précédente</button></div>{!model.kpis.hasPdfWheat&&<small>Réimportez le PDF Stock pour activer le rendement réel.</small>}</div>
    <section className="mino-kpi-grid"><Kpi icon={Factory} label="Total production" value={`${n2(model.kpis.productionOfficialQuantity)} qtx`} note={model.kpis.physicalSource === 'PDF stock' ? 'PDF stock · entrées ENT PRODUCTION' : 'Total officiel du rapport de production'}/></section>
    <div className="analysis-callout"><Wheat/><div><strong>Lecture matière et valeur</strong><span>Prix fixe : {n(WHEAT_PRICE_PER_QTX)} DA/qtx · Blé suivi valorisé : {money(model.kpis.referenceWheatCost)}. Pic de consommation : {model.peakConsumption?.date || '—'} avec {n(model.peakConsumption?.wheat,1)} qtx. Écart matière indicatif : {n(model.kpis.materialGapQtx,1)} qtx.</span></div></div>
    <Panel eyebrow="Cycle quotidien 24 heures" title="Entrée matière et sortie production par minoterie" note="quintaux"><div className="mino-chart x-tall"><ResponsiveContainer><ComposedChart data={model.daily}><CartesianGrid vertical={false} stroke="#e7e0d7" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar dataKey="wheatG" name="Blé G" fill="#8a3b2e" radius={[4,4,0,0]}/><Bar dataKey="wheatM" name="Blé M" fill="#d2a72e" radius={[4,4,0,0]}/><Line type="monotone" dataKey="prodG" name="Production G" stroke="#51231c" strokeWidth={2.4}/><Line type="monotone" dataKey="prodM" name="Production M" stroke="#3f6f68" strokeWidth={2.4}/></ComposedChart></ResponsiveContainer></div></Panel>
    <section className="mino-grid equal"><Panel eyebrow="Rendement journalier" title="Taux production / blé suivi" note="Cliquer pour expliquer"><div className="mino-chart mino-chart-clickable" role="button" tabIndex="0" onKeyDown={yieldKeyDown} aria-label="Afficher l’explication du rendement"><ResponsiveContainer><AreaChart data={yieldDaily} onClick={openYieldExplanation}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis domain={[0,'auto']} axisLine={false}/><Tooltip content={<TooltipCard/>}/><ReferenceLine y={100} stroke="#c99715" strokeDasharray="5 5"/><Area type="monotone" dataKey="displayedYield" name={usePdfYield ? "Rendement réel PDF" : "Rendement LIVRAISON"} stroke="#7a3024" fill="#f2ded8" strokeWidth={2.4}/></AreaChart></ResponsiveContainer></div></Panel><Panel eyebrow="Écart matière cumulé" title="Blé suivi moins production" note="qtx"><div className="mino-chart"><ResponsiveContainer><AreaChart data={model.daily}><defs><linearGradient id="matterGap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c99715" stopOpacity=".35"/><stop offset="1" stopColor="#c99715" stopOpacity=".04"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><ReferenceLine y={0} stroke="#9d9188"/><Area type="monotone" dataKey="cumulativeMaterialGap" name="Écart cumulé (qtx)" stroke="#c99715" fill="url(#matterGap)" strokeWidth={2.4}/></AreaChart></ResponsiveContainer></div></Panel></section>
    <Expandable title="Suivi quotidien matière" meta={`${model.daily.length} journées`} openByDefault><div className="mino-table-scroll"><table><thead><tr><th>Date</th><th>Blé G</th><th>Blé M</th><th>Valeur blé à 1 285 DA/qtx</th><th>Production G</th><th>Production M</th><th>Écart indicatif</th></tr></thead><tbody>{model.daily.map((row)=><tr key={row.date}><td>{row.date}</td><td>{n(row.wheatG,1)}</td><td>{n(row.wheatM,1)}</td><td>{money(row.referenceWheatCost)}</td><td>{n(row.prodG,1)}</td><td>{n(row.prodM,1)}</td><td>{n(row.wheatG+row.wheatM-row.prodG-row.prodM,1)} qtx</td></tr>)}</tbody></table></div></Expandable>
    {yieldExplanation&&<div className="credit-calc-layer" role="presentation" onMouseDown={()=>setYieldExplanation(null)}><section className="credit-calc-box yield-explanation-box" role="dialog" aria-modal="true" aria-labelledby="yield-explanation-title" onMouseDown={(event)=>event.stopPropagation()}><button className="credit-calc-close" onClick={()=>setYieldExplanation(null)} aria-label="Fermer"><X/></button><span>Lecture manager dynamique</span><h3 id="yield-explanation-title">{usePdfYield ? "Rendement réel du blé consommé" : "Méthode précédente basée sur LIVRAISON"}</h3>{selectedYieldDay&&<div className={`yield-selected-day ${selectedYieldReading.tone}`}><strong>{selectedYieldDay.date} · {selectedYieldReading.label}</strong><p>{yieldInputLabel} : {n2(yieldInput(selectedYieldDay))} qtx</p><p>Production : {n2(selectedYieldDay.production)} qtx</p><p>Niveau affiché : {yieldInput(selectedYieldDay) ? `${n(yieldValue(selectedYieldDay),1)}%` : '0%'}</p><p className="yield-manager-action">Action manager : {selectedYieldReading.action}</p></div>}<div className="yield-period-values"><p><strong>Lecture de la période :</strong> {periodReading}</p>{usePdfYield&&<><p>Stock BT001 au début de la période : <strong>{n2(wheatStockOpening)} qtx</strong></p><p>Stock BT001 à la fin de la période : <strong className={wheatStockClosing<0?"bad":""}>{n2(wheatStockClosing)} qtx</strong></p><p>Réceptions PDF : <strong>{n2(sum(wheatStockByUnit,"reception"))} qtx</strong> · Consommation Production : <strong>{n2(sum(wheatStockByUnit,"consumption"))} qtx</strong></p>{negativeWheatUnits.length>0&&<p className="yield-stock-alert">Alerte : stock final négatif sur {negativeWheatUnits.map((row)=>row.unit==="G"?"Groupe":"Minoterie").join(" + ")}.</p>}</>}<p>Production sans {usePdfYield ? "consommation BT001" : "livraison"} le même jour : <strong>{productionWithoutDelivery.length} jours</strong></p><p>{usePdfYield ? "Consommation BT001" : "Livraison"} sans production le même jour : <strong>{deliveryWithoutProduction.length} jours</strong></p><p>Jours avec décalage marqué : <strong>{irregularYieldDays.length} jours</strong></p><p>{usePdfYield ? "Lecture issue des SORTIES BT001 vers Production dans le PDF. Les stocks et transferts du même PDF servent au contrôle de cohérence." : "Ancienne lecture basée sur le moment de la livraison; elle reste disponible pour comparaison."}</p></div><div className="mino-table-scroll yield-values-table"><table><thead><tr><th>Date</th><th>{yieldInputLabel}</th><th>Production</th><th>Niveau</th><th>Lecture manager</th></tr></thead><tbody>{model.daily.map((row)=>{const reading=yieldReading(row);return <tr key={row.date} className={selectedYieldDay?.date===row.date?'selected':''}><td>{row.date}</td><td>{n2(yieldInput(row))} qtx</td><td>{n2(row.production)} qtx</td><td>{yieldInput(row) ? `${n(yieldValue(row),1)}%` : '0%'}</td><td><strong>{reading.label}</strong><small>{reading.action}</small></td></tr>})}</tbody></table></div><footer><small>Indicateur global de la période</small><strong>{periodYield == null ? '—' : `${n(periodYield,1)}%`}</strong></footer></section></div>}
  </>;
}

function Teams({ model }) {
  const bestShift = [...model.shifts].sort((a,b)=>b.total-a.total)[0];
  const totalG = model.unitProduction[0]?.value || 0;
  const totalM = model.unitProduction[1]?.value || 0;
  const teamTotal = totalG + totalM;
  const bestUnit = totalG >= totalM ? 'Groupe (G)' : 'Minoterie Abidi (M)';
  return <>
    <section className="mino-title"><span><Users size={16}/> Performance des équipes</span><h2>Comparer 16H–00H, 00H–08H et 08H–16H</h2><p>Données des équipes, unités et shifts lues exclusivement depuis le fichier Commercial du mois.</p></section>
    <section className="mino-kpi-grid four"><Kpi icon={Users} label="Shift le plus productif" value={bestShift?.shift || '—'} note={`${n(bestShift?.total,1)} qtx produits`} tone="gold"/><Kpi icon={Factory} label="Unité dominante" value={bestUnit} note={`${n(Math.max(totalG,totalM),1)} qtx`}/><Kpi icon={Scale} label="Écart de production G / M" value={`${n(Math.abs(totalG-totalM),1)} qtx`} note={totalG>=totalM?'Avantage Groupe':'Avantage Minoterie'} tone="burgundy"/><Kpi icon={Gauge} label="Part du meilleur shift" value={`${n(teamTotal ? bestShift?.total/teamTotal*100 : 0,1)}%`} note="Risque si trop concentré" tone="green"/></section>
    <section className="mino-grid equal"><Panel eyebrow="Production par shift" title="Groupe versus Minoterie" note="qtx"><div className="mino-chart x-tall"><ResponsiveContainer><BarChart data={model.shifts}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="shift" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar dataKey="G" name="Groupe (G)" fill="#7a3024" radius={[7,7,0,0]}/><Bar dataKey="M" name="Minoterie Abidi (M)" fill="#c99715" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></Panel><Panel eyebrow="Part du mois" title="Poids de chaque shift" note="G + M"><div className="mino-shift-list">{model.shifts.map((row,index)=><div key={row.shift}><span>{row.shift}</span><div><i style={{width:`${teamTotal?row.total/teamTotal*100:0}%`,background:COLORS[index]}}/></div><strong>{n(row.total,1)} qtx</strong><small>{n(teamTotal?row.total/teamTotal*100:0,1)}%</small></div>)}</div></Panel></section>
    <Panel eyebrow="Régularité des équipes" title="Contribution quotidienne de chaque shift" note="qtx empilés"><div className="mino-chart x-tall"><ResponsiveContainer><AreaChart data={model.shiftDaily}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Area type="monotone" stackId="shift" dataKey="shift16" name="16H–00H" stroke="#7a3024" fill="#7a3024"/><Area type="monotone" stackId="shift" dataKey="shift00" name="00H–08H" stroke="#c99715" fill="#c99715"/><Area type="monotone" stackId="shift" dataKey="shift08" name="08H–16H" stroke="#3f6f68" fill="#3f6f68"/></AreaChart></ResponsiveContainer></div></Panel>
    <Expandable title="Détail des équipes depuis le fichier Commercial" meta={`${model.teamProduction.length} lignes`}><div className="mino-table-scroll"><table><thead><tr><th>Date</th><th>Minoterie</th><th>Produit</th><th>Shift</th><th>Quantité (qtx)</th></tr></thead><tbody>{model.teamProduction.map((row,index)=><tr key={`${row.date}-${row.unit}-${row.product}-${row.shift}-${index}`}><td>{row.date}</td><td><span className={`unit-pill ${row.unit.toLowerCase()}`}>{row.unit}</span></td><td>{row.product}<small>{row.rawProduct}</small></td><td>{row.shift}</td><td>{n(row.qtx,2)}</td></tr>)}</tbody></table></div></Expandable>
  </>;
}

function SalesFinance({ model }) {
  return <>
    <section className="mino-title"><span><TrendingUp size={16}/> Ventes & recouvrement</span><h2>Volume, chiffre d’affaires et argent récupéré</h2><p>Les produits donnés aux travailleurs sont exclus du chiffre d’affaires et affichés séparément.</p></section>
    <section className="mino-kpi-grid"><Kpi icon={PackageCheck} label="Quantité vendue" value={`${n2(model.kpis.salesOfficialQuantity)} qtx`} note={model.kpis.physicalSource === 'PDF stock' ? 'PDF · sorties Commercial − réintégrations · prestation exclue' : 'Produits uniquement · prestation exclue'} tone="gold"/><Kpi icon={CircleDollarSign} label="Chiffre d’affaires" value={money(model.kpis.operationalRevenue)} note="Montant vendu et facturé" tone="burgundy"/><Kpi icon={Banknote} label="Encaissements" value={model.kpis.hasCollections?money(model.kpis.recovery):'—'} note="Fichier global · consolidé G + M" tone="green"/><Kpi icon={TrendingUp} label="Taux de recouvrement" value={model.kpis.hasCollections&&model.kpis.recoveryRate!=null?`${n(model.kpis.recoveryRate,1)}%`:'—'} note="Encaissé ÷ facturé · G + M" tone="gold"/><Kpi icon={CreditCard} label="Créances fin de période" value={money(model.kpis.creditRemaining)} note={`${n(model.kpis.unpaidClients)} clients · Balance client`} tone={model.kpis.creditRemaining>0?'alert':'green'}/></section>
    <section className="mino-grid equal"><Panel eyebrow="Produits" title="Répartition des volumes vendus" note="qtx"><div className="mino-chart tall"><ResponsiveContainer><BarChart layout="vertical" data={model.productSales.slice(0,8)} margin={{left:20}}><CartesianGrid horizontal={false} stroke="#e7e0d7"/><XAxis type="number" axisLine={false}/><YAxis type="category" dataKey="name" width={120} axisLine={false}/><Tooltip content={<TooltipCard/>}/><Bar dataKey="qtx" name="Ventes" fill="#7a3024" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div></Panel><Panel eyebrow="Clients" title="Principaux clients par chiffre d’affaires" note="DA"><div className="mino-client-list">{model.clients.slice(0,9).map((row,index)=><div key={row.name}><span>{String(index+1).padStart(2,'0')}</span><strong>{row.name}</strong><b>{money(row.amount)}</b></div>)}</div></Panel></section>
    <Panel eyebrow="Politique tarifaire" title="Prix moyen réalisé par produit" note="DA / qtx · produits les plus vendus"><div className="mino-chart tall"><ResponsiveContainer><BarChart data={model.productPrices.slice(0,10)}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="name" angle={-24} textAnchor="end" height={75} axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Bar dataKey="pricePerQtx" name="Prix moyen / qtx" fill="#c99715" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></Panel>
    <Panel eyebrow="Évolution" title="Ventes et recouvrements quotidiens" note="qtx / DA"><div className="mino-chart tall"><ResponsiveContainer><ComposedChart data={model.daily}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis yAxisId="qtx" axisLine={false} tickLine={false} width={58} label={{value:'qtx',angle:-90,position:'insideLeft'}}/><YAxis yAxisId="da" orientation="right" axisLine={false} tickLine={false} width={82} tickFormatter={(value)=>`${n(value/1000000,1)}M`} label={{value:'DA',angle:90,position:'insideRight'}}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar yAxisId="qtx" dataKey="salesQtx" name="Ventes (qtx)" fill="#7a3024" radius={[5,5,0,0]}/><Line yAxisId="da" type="monotone" dataKey="recovery" name="Recouvrement (DA)" stroke="#c99715" strokeWidth={2.8} dot={{r:2}} activeDot={{r:5}}/></ComposedChart></ResponsiveContainer></div></Panel>
  </>;
}

function CostAccounting({ costing, allCosting = {}, onImport }) {
  const [graphExplanation, setGraphExplanation] = useState(null);
  if (!costing) return <>
    <section className="mino-title"><span><Calculator size={16}/> Analyse des coûts</span><h2>Coût de revient</h2><p>Importez le fichier mensuel de coût de revient pour afficher ses calculs sans modification.</p></section>
    <section className="mino-panel cost-accounting-empty"><Calculator/><div><strong>Aucun fichier pour la période sélectionnée</strong><p>Le module reprend exactement les valeurs et les formules du classeur Excel.</p><button onClick={onImport}><Upload size={16}/> Ouvrir l’importation</button></div></section>
  </>;
  const { totals, products, fixedCosts, variableCosts, materials, expenseDetails, meta } = costing;
  const costRows = [...fixedCosts, ...variableCosts].sort((a,b)=>b.amount-a.amount);
  const profitable = products.filter((row)=>row.profit>=0).length;
  const lossProducts = products.filter((row)=>row.profit<0);
  const bestProduct = [...products].sort((a,b)=>b.profit-a.profit)[0];
  const grossMarginRate = totals.theoreticalRevenue ? totals.grossMargin / totals.theoreticalRevenue * 100 : 0;
  const netMarginRate = totals.theoreticalRevenue ? totals.netMargin / totals.theoreticalRevenue * 100 : 0;
  const productCostComposition = products.map((row)=>({ ...row, name: row.code, commonCostPerQtx: row.quantityQtx ? row.allocatedCost/row.quantityQtx : 0, packagingCostPerQtx: row.quantityQtx ? row.packagingCost/row.quantityQtx : 0 }));
  const marginContribution = products.filter((row)=>row.profit>0).map((row)=>({ name: row.code, product: row.product, value: row.profit })).sort((a,b)=>b.value-a.value);
  const volumeProfitability = products.map((row)=>({ name: row.code, product: row.product, volume: row.quantityQtx, marginPerQtx: row.quantityQtx ? row.profit/row.quantityQtx : 0, profit: row.profit, size: Math.max(80,Math.abs(row.profit)) }));
  let waterfallBalance = totals.theoreticalRevenue;
  const waterfall = [{ name:'Valeur production', base:0, value:totals.theoreticalRevenue, kind:'start' }];
  costRows.forEach((row)=>{ waterfallBalance -= row.amount; waterfall.push({ name:row.label, base:Math.max(0,waterfallBalance), value:row.amount, kind:'cost' }); });
  waterfall.push({ name:'Marge brute', base:0, value:totals.grossMargin, kind:'subtotal' });
  waterfallBalance = totals.grossMargin - totals.vat;
  waterfall.push({ name:'TVA', base:Math.max(0,waterfallBalance), value:totals.vat, kind:'tax' });
  waterfallBalance -= totals.stampDuty;
  waterfall.push({ name:'Timbre', base:Math.max(0,waterfallBalance), value:totals.stampDuty, kind:'tax' });
  waterfall.push({ name:'Marge finale', base:0, value:totals.netMargin, kind:'end' });
  const monthlyComparison = Object.entries(allCosting).map(([month,item])=>({ month, totalCost:item.totals.totalCost, costPerQtx:item.totals.averageCostPerQtx, grossMargin:item.totals.grossMargin, netMargin:item.totals.netMargin, production:item.totals.totalProduction })).sort((a,b)=>a.month.localeCompare(b.month));
  const fixedVariable = [{ name:'Charges fixes', value:totals.fixedCosts },{ name:'Charges variables', value:totals.variableCosts }];
  const explainGraph = (title, meaning, values, reading) => setGraphExplanation({ title, meaning, values, reading });
  const graphKey = (handler) => (event) => { if (event.key==='Enter'||event.key===' ') { event.preventDefault(); handler(); } };
  return <>
    <section className="mino-title cost-title"><span><Calculator size={16}/> Analyse des coûts · calcul Excel conservé</span><h2>Coût de revient · {meta.month || 'période importée'}</h2><p>{meta.startDate} → {meta.endDate} · Source : {meta.fileName}. Toutes les valeurs ci-dessous reprennent le calcul actuel du fichier sans reclassement ni correction.</p></section>
    <section className="mino-kpi-grid">
      <Kpi icon={CircleDollarSign} label="Charges totales" value={money(totals.totalCost)} note="Total du fichier" tone="burgundy"/>
      <Kpi icon={Factory} label="Production totale" value={`${n2(totals.totalProduction)} qtx`} note={`${n(totals.totalBags,1)} sacs`} tone="gold"/>
      <Kpi icon={Calculator} label="Coût moyen" value={`${money(totals.averageCostPerQtx)} / qtx`} note="Charges ÷ production"/>
      <Kpi icon={TrendingUp} label="Marge brute théorique" value={money(totals.grossMargin)} note={`${n(grossMarginRate,1)}% de la valeur théorique`} tone="green"/>
      <Kpi icon={Banknote} label="Marge après TVA + timbre" value={money(totals.netMargin)} note={`${n(netMarginRate,1)}% · calcul du fichier`} tone={totals.netMargin>=0?'green':'alert'}/>
      <Kpi icon={AlertTriangle} label="Produits en perte" value={n(lossProducts.length)} note={`${profitable} produits bénéficiaires`} tone={lossProducts.length?'alert':'green'}/>
    </section>
    <div className="analysis-callout"><Calculator/><div><strong>Lecture du calcul importé</strong><span>Le fichier valorise une production de {n2(totals.totalProduction)} qtx à {money(totals.theoreticalRevenue)}. Après {money(totals.totalCost)} de charges, la marge brute calculée est {money(totals.grossMargin)}, puis {money(totals.netMargin)} après TVA ({money(totals.vat)}) et timbre ({money(totals.stampDuty)}).{bestProduct?` Le produit qui contribue le plus à la marge est ${bestProduct.product} avec ${money(bestProduct.profit)}.`:''}</span></div></div>
    <section className="mino-grid equal">
      <Panel eyebrow="Structure des charges" title="Poids de chaque composante" note="DA · valeurs RECAP"><div className="mino-chart x-tall"><ResponsiveContainer><BarChart layout="vertical" data={costRows} margin={{left:28}}><CartesianGrid horizontal={false} stroke="#e7e0d7"/><XAxis type="number" axisLine={false} tickFormatter={(value)=>`${n(value/1000000,1)}M`}/><YAxis type="category" dataKey="label" width={155} axisLine={false}/><Tooltip content={<TooltipCard/>}/><Bar dataKey="amount" name="Charge" fill="#7a3024" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div></Panel>
      <Panel eyebrow="Rentabilité par produit" title="Bénéfice théorique par produit" note="DA"><div className="mino-chart x-tall"><ResponsiveContainer><BarChart data={products}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="code" axisLine={false}/><YAxis axisLine={false} tickFormatter={(value)=>`${n(value/1000000,1)}M`}/><Tooltip content={<TooltipCard/>}/><ReferenceLine y={0} stroke="#8d8179"/><Bar dataKey="profit" name="Bénéfice" radius={[6,6,0,0]}>{products.map((row)=><Cell key={row.code} fill={row.profit<0?'#a95b48':'#3f6f68'}/>)}</Bar></BarChart></ResponsiveContainer></div></Panel>
    </section>
    <section className="mino-grid equal">
      <Panel eyebrow="Comparaison produits" title="Composition du coût par quintal" note="cliquer · DA / qtx"><div className="graph-explainable" role="button" tabIndex={0} onKeyDown={graphKey(()=>explainGraph('Composition du coût par quintal','يقارن لكل منتج الجزء المشترك من التكلفة مع تكلفة الأكياس والملصقات. ارتفاع جزء التغليف يوضح أن شكل التعبئة يرفع تكلفة المنتج.',[`متوسط تكلفة القنطار لجميع المنتجات: ${money(totals.averageCostPerQtx)}`,`أعلى تكلفة للقنطار: ${[...products].sort((a,b)=>b.costPerQtx-a.costPerQtx)[0]?.code} · ${money([...products].sort((a,b)=>b.costPerQtx-a.costPerQtx)[0]?.costPerQtx)}`],'راجع المنتجات ذات التغليف المرتفع أو الإنتاج الصغير لأنها تتحمل تكلفة أكبر لكل قنطار.'))} onClick={()=>explainGraph('Composition du coût par quintal','يقارن لكل منتج الجزء المشترك من التكلفة مع تكلفة الأكياس والملصقات. ارتفاع جزء التغليف يوضح أن شكل التعبئة يرفع تكلفة المنتج.',[`متوسط تكلفة القنطار لجميع المنتجات: ${money(totals.averageCostPerQtx)}`,`أعلى تكلفة للقنطار: ${[...products].sort((a,b)=>b.costPerQtx-a.costPerQtx)[0]?.code} · ${money([...products].sort((a,b)=>b.costPerQtx-a.costPerQtx)[0]?.costPerQtx)}`],'راجع المنتجات ذات التغليف المرتفع أو الإنتاج الصغير لأنها تتحمل تكلفة أكبر لكل قنطار.')}><div className="mino-chart tall"><ResponsiveContainer><BarChart data={productCostComposition}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="code" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar stackId="cost" dataKey="commonCostPerQtx" name="Charges communes / qtx" fill="#7a3024"/><Bar stackId="cost" dataKey="packagingCostPerQtx" name="Emballage / qtx" fill="#c99715" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></div></Panel>
      <Panel eyebrow="Nature des charges" title="Fixes versus variables" note="cliquer · classification Excel"><div className="graph-explainable" role="button" tabIndex={0} onKeyDown={graphKey(()=>explainGraph('Charges fixes versus variables','يعرض نفس تصنيف ملف Excel الحالي دون تغيير: ما وضعه الملف ضمن التكاليف الثابتة مقابل المتغيرة.',[`Charges fixes: ${money(totals.fixedCosts)} · ${n(totals.totalCost?totals.fixedCosts/totals.totalCost*100:0,1)}%`,`Charges variables: ${money(totals.variableCosts)} · ${n(totals.totalCost?totals.variableCosts/totals.totalCost*100:0,1)}%`],'يساعد المدير على معرفة الجزء الأكبر من هيكل التكلفة. التصنيف هنا منقول حرفيًا من الملف الحالي.'))} onClick={()=>explainGraph('Charges fixes versus variables','يعرض نفس تصنيف ملف Excel الحالي دون تغيير: ما وضعه الملف ضمن التكاليف الثابتة مقابل المتغيرة.',[`Charges fixes: ${money(totals.fixedCosts)} · ${n(totals.totalCost?totals.fixedCosts/totals.totalCost*100:0,1)}%`,`Charges variables: ${money(totals.variableCosts)} · ${n(totals.totalCost?totals.variableCosts/totals.totalCost*100:0,1)}%`],'يساعد المدير على معرفة الجزء الأكبر من هيكل التكلفة. التصنيف هنا منقول حرفيًا من الملف الحالي.')}><div className="mino-chart tall"><ResponsiveContainer><PieChart><Pie data={fixedVariable} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3}>{fixedVariable.map((row,index)=><Cell key={row.name} fill={COLORS[index+1]}/>)}</Pie><Tooltip content={<TooltipCard/>}/><Legend/></PieChart></ResponsiveContainer></div></div></Panel>
    </section>
    <Panel eyebrow="Prix et coût" title="Coût du sac comparé au prix de vente" note="DA / sac"><div className="mino-chart tall"><ResponsiveContainer><ComposedChart data={products}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="code" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar dataKey="costPerBag" name="Coût / sac" fill="#7a3024" radius={[6,6,0,0]}/><Line type="monotone" dataKey="salePricePerBag" name="Prix de vente / sac" stroke="#c99715" strokeWidth={3}/></ComposedChart></ResponsiveContainer></div></Panel>
    <section className="mino-grid equal">
      <Panel eyebrow="Arbitrage manager" title="Volume produit versus marge par quintal" note="cliquer · taille = bénéfice"><div className="graph-explainable" role="button" tabIndex={0} onKeyDown={graphKey(()=>explainGraph('Volume versus rentabilité','كل نقطة تمثل منتجًا: المحور الأفقي هو كمية الإنتاج، والعمودي هو الهامش لكل قنطار، وحجم النقطة يعبر عن قيمة الربح الإجمالي.',[`أكبر حجم إنتاج: ${[...products].sort((a,b)=>b.quantityQtx-a.quantityQtx)[0]?.code} · ${n2([...products].sort((a,b)=>b.quantityQtx-a.quantityQtx)[0]?.quantityQtx)} qtx`,`أعلى مساهمة في الربح: ${bestProduct?.code} · ${money(bestProduct?.profit)}`,`منتجات خاسرة: ${lossProducts.map((row)=>row.code).join('، ')||'لا يوجد'}`],'الأفضل هو المنتج الموجود أعلى يمين الرسم: حجم كبير وهامش مرتفع. النقاط أسفل الصفر تحتاج مراجعة السعر أو التكلفة.'))} onClick={()=>explainGraph('Volume versus rentabilité','كل نقطة تمثل منتجًا: المحور الأفقي هو كمية الإنتاج، والعمودي هو الهامش لكل قنطار، وحجم النقطة يعبر عن قيمة الربح الإجمالي.',[`أكبر حجم إنتاج: ${[...products].sort((a,b)=>b.quantityQtx-a.quantityQtx)[0]?.code} · ${n2([...products].sort((a,b)=>b.quantityQtx-a.quantityQtx)[0]?.quantityQtx)} qtx`,`أعلى مساهمة في الربح: ${bestProduct?.code} · ${money(bestProduct?.profit)}`,`منتجات خاسرة: ${lossProducts.map((row)=>row.code).join('، ')||'لا يوجد'}`],'الأفضل هو المنتج الموجود أعلى يمين الرسم: حجم كبير وهامش مرتفع. النقاط أسفل الصفر تحتاج مراجعة السعر أو التكلفة.')}><div className="mino-chart tall"><ResponsiveContainer><ScatterChart margin={{top:18,right:20,bottom:12,left:5}}><CartesianGrid stroke="#e7e0d7"/><XAxis type="number" dataKey="volume" name="Production" unit=" qtx"/><YAxis type="number" dataKey="marginPerQtx" name="Marge / qtx" unit=" DA"/><ZAxis type="number" dataKey="size" range={[80,650]}/><ReferenceLine y={0} stroke="#a95b48"/><Tooltip cursor={{strokeDasharray:'3 3'}} content={<TooltipCard/>}/><Scatter data={volumeProfitability} name="Produits">{volumeProfitability.map((row)=><Cell key={row.name} fill={row.marginPerQtx<0?'#a95b48':'#3f6f68'}/>)}</Scatter></ScatterChart></ResponsiveContainer></div></div></Panel>
      <Panel eyebrow="Contribution au résultat" title="Part de chaque produit dans la marge" note="cliquer · bénéfices positifs"><div className="graph-explainable" role="button" tabIndex={0} onKeyDown={graphKey(()=>explainGraph('Contribution à la marge','يبين أي المنتجات تصنع الهامش الإجمالي. كلما كبرت الحصة كان اعتماد النتيجة المالية على ذلك المنتج أكبر.',marginContribution.slice(0,4).map((row)=>`${row.name}: ${money(row.value)} · ${n(totals.grossMargin?row.value/totals.grossMargin*100:0,1)}%`),bestProduct?`النتيجة تعتمد أساسًا على ${bestProduct.product}. يجب مراقبة حجمه وسعره وتكلفته لأنه الأكثر تأثيرًا على الهامش.`:'لا توجد مساهمة موجبة مسجلة.'))} onClick={()=>explainGraph('Contribution à la marge','يبين أي المنتجات تصنع الهامش الإجمالي. كلما كبرت الحصة كان اعتماد النتيجة المالية على ذلك المنتج أكبر.',marginContribution.slice(0,4).map((row)=>`${row.name}: ${money(row.value)} · ${n(totals.grossMargin?row.value/totals.grossMargin*100:0,1)}%`),bestProduct?`النتيجة تعتمد أساسًا على ${bestProduct.product}. يجب مراقبة حجمه وسعره وتكلفته لأنه الأكثر تأثيرًا على الهامش.`:'لا توجد مساهمة موجبة مسجلة.')}><div className="mino-chart tall"><ResponsiveContainer><PieChart><Pie data={marginContribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={105} paddingAngle={2}>{marginContribution.map((row,index)=><Cell key={row.name} fill={COLORS[index%COLORS.length]}/>)}</Pie><Tooltip content={<TooltipCard/>}/><Legend/></PieChart></ResponsiveContainer></div></div></Panel>
    </section>
    <Panel eyebrow="Pont de résultat" title="De la valeur de production à la marge finale" note="cliquer · calcul du fichier"><div className="graph-explainable" role="button" tabIndex={0} onKeyDown={graphKey(()=>explainGraph('Passage à la marge finale','يبدأ الرسم بقيمة الإنتاج النظرية، ثم يطرح جميع الأعباء حسب RECAP، وبعدها TVA وTimbre للوصول إلى الهامش النهائي الموجود في الملف.',[`Valeur théorique: ${money(totals.theoreticalRevenue)}`,`Charges totales: ${money(totals.totalCost)}`,`Marge brute: ${money(totals.grossMargin)}`,`TVA + Timbre: ${money(totals.vat+totals.stampDuty)}`,`Marge finale: ${money(totals.netMargin)}`],'كل عمود أحمر أو ذهبي يوضح أين تنخفض القيمة. ابدأ بمراجعة أكبر عنصر قابل للتحكم دون تغيير طريقة الحساب الحالية.'))} onClick={()=>explainGraph('Passage à la marge finale','يبدأ الرسم بقيمة الإنتاج النظرية، ثم يطرح جميع الأعباء حسب RECAP، وبعدها TVA وTimbre للوصول إلى الهامش النهائي الموجود في الملف.',[`Valeur théorique: ${money(totals.theoreticalRevenue)}`,`Charges totales: ${money(totals.totalCost)}`,`Marge brute: ${money(totals.grossMargin)}`,`TVA + Timbre: ${money(totals.vat+totals.stampDuty)}`,`Marge finale: ${money(totals.netMargin)}`],'كل عمود أحمر أو ذهبي يوضح أين تنخفض القيمة. ابدأ بمراجعة أكبر عنصر قابل للتحكم دون تغيير طريقة الحساب الحالية.')}><div className="mino-chart x-tall"><ResponsiveContainer><BarChart data={waterfall}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="name" angle={-28} textAnchor="end" height={95} axisLine={false}/><YAxis axisLine={false} tickFormatter={(value)=>`${n(value/1000000,0)}M`}/><Tooltip content={<TooltipCard/>}/><Bar stackId="waterfall" dataKey="base" fill="transparent"/><Bar stackId="waterfall" dataKey="value" name="Montant" radius={[5,5,0,0]}>{waterfall.map((row,index)=><Cell key={`${row.name}-${index}`} fill={row.kind==='start'?'#3f6f68':row.kind==='end'||row.kind==='subtotal'?'#c99715':row.kind==='tax'?'#a95b48':'#7a3024'}/>)}</Bar></BarChart></ResponsiveContainer></div></div></Panel>
    <Panel eyebrow="Comparaison mensuelle" title="Évolution du coût et de la marge" note={`cliquer · ${monthlyComparison.length} mois importé${monthlyComparison.length>1?'s':''}`}><div className="graph-explainable" role="button" tabIndex={0} onKeyDown={graphKey(()=>explainGraph('Évolution mensuelle','يقارن الملفات الشهرية المستوردة بنفس الحساب الموجود في كل ملف: تكلفة القنطار، الإنتاج، التكلفة الإجمالية والهامش النهائي.',monthlyComparison.map((row)=>`${row.month}: coût ${money(row.costPerQtx)}/qtx · marge ${money(row.netMargin)}`),monthlyComparison.length<2?'يوجد شهر واحد فقط حاليًا. ستظهر المقارنة والاتجاه تلقائيًا بعد استيراد ملف شهر آخر.':'راقب ارتفاع تكلفة القنطار بالتوازي مع انخفاض الهامش، ثم افتح الشهر المعني لمعرفة العنصر المسبب.'))} onClick={()=>explainGraph('Évolution mensuelle','يقارن الملفات الشهرية المستوردة بنفس الحساب الموجود في كل ملف: تكلفة القنطار، الإنتاج، التكلفة الإجمالية والهامش النهائي.',monthlyComparison.map((row)=>`${row.month}: coût ${money(row.costPerQtx)}/qtx · marge ${money(row.netMargin)}`),monthlyComparison.length<2?'يوجد شهر واحد فقط حاليًا. ستظهر المقارنة والاتجاه تلقائيًا بعد استيراد ملف شهر آخر.':'راقب ارتفاع تكلفة القنطار بالتوازي مع انخفاض الهامش، ثم افتح الشهر المعني لمعرفة العنصر المسبب.')}><div className="mino-chart tall"><ResponsiveContainer><ComposedChart data={monthlyComparison}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="month" axisLine={false}/><YAxis yAxisId="da" axisLine={false} tickFormatter={(value)=>`${n(value/1000000,0)}M`}/><YAxis yAxisId="unit" orientation="right" axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar yAxisId="da" dataKey="totalCost" name="Charges totales" fill="#7a3024" radius={[5,5,0,0]}/><Bar yAxisId="da" dataKey="netMargin" name="Marge finale" fill="#3f6f68" radius={[5,5,0,0]}/><Line yAxisId="unit" type="monotone" dataKey="costPerQtx" name="Coût / qtx" stroke="#c99715" strokeWidth={3}/></ComposedChart></ResponsiveContainer></div></div></Panel>
    <Expandable title="Coût de revient détaillé par produit" meta={`${products.length} produits`} openByDefault><div className="mino-table-scroll"><table><thead><tr><th>Code</th><th>Produit</th><th>Production</th><th>Sacs</th><th>Charges totales</th><th>Coût / sac</th><th>Prix / sac</th><th>Marge / sac</th><th>Bénéfice</th><th>Coût / qtx</th></tr></thead><tbody>{products.map((row)=><tr key={row.code}><td><strong>{row.code}</strong></td><td>{row.product}</td><td>{n2(row.quantityQtx)} qtx</td><td>{n(row.bags,1)}</td><td>{money(row.totalCost)}</td><td>{money(row.costPerBag)}</td><td>{money(row.salePricePerBag)}</td><td className={row.marginPerBag<0?'bad':'advance-value'}>{money(row.marginPerBag)}</td><td className={row.profit<0?'bad':'advance-value'}>{money(row.profit)}</td><td>{money(row.costPerQtx)}</td></tr>)}</tbody></table></div></Expandable>
    <section className="mino-grid equal">
      <Expandable title="Consommations matières, sacs et étiquettes" meta={`${materials.length} articles`}><div className="mino-table-scroll"><table><thead><tr><th>Code</th><th>Article</th><th>Quantité</th><th>Coût moyen</th><th>Montant</th></tr></thead><tbody>{materials.map((row)=><tr key={row.code}><td><strong>{row.code}</strong></td><td>{row.label}</td><td>{n2(row.quantity)}</td><td>{money(row.averageCost)}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div></Expandable>
      <Expandable title="Détail des charges variables" meta={`${expenseDetails.length} écritures`}><div className="mino-table-scroll"><table><thead><tr><th>Source</th><th>Date</th><th>Catégorie</th><th>Tiers</th><th>Montant</th></tr></thead><tbody>{expenseDetails.map((row,index)=><tr key={`${row.sheet}-${row.code}-${index}`}><td>{row.sheet}</td><td>{row.date || '—'}</td><td>{row.category || row.reference}</td><td>{row.thirdParty}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div></Expandable>
    </section>
    {graphExplanation&&<div className="credit-calc-layer" role="presentation" onMouseDown={()=>setGraphExplanation(null)}><section className="credit-calc-box manager-kpi-explanation graph-explanation-box" role="dialog" aria-modal="true" aria-labelledby="cost-graph-title" onMouseDown={(event)=>event.stopPropagation()}><button className="credit-calc-close" onClick={()=>setGraphExplanation(null)} aria-label="Fermer"><X/></button><span>شرح الرسم للمدير</span><h3 id="cost-graph-title">{graphExplanation.title}</h3><div className="manager-kpi-section" dir="rtl"><h4>ماذا يعرض هذا الرسم؟</h4><p>{graphExplanation.meaning}</p></div><div className="manager-kpi-section" dir="rtl"><h4>القيم الحالية</h4>{graphExplanation.values.map((line,index)=><p key={`${index}-${line}`}>{line}</p>)}</div><div className="manager-kpi-manager" dir="rtl"><strong>قراءة المدير</strong><p>{graphExplanation.reading}</p></div><footer><small>المصدر</small><strong>{meta.fileName}</strong></footer></section></div>}
  </>;
}

function ClientCredits({ model, filters }) {
  const [query, setQuery] = useState('');
  const [calculation, setCalculation] = useState(null);
  const ledger = model.creditLedger;
  const activeMonth = ledger.isBalance ? (ledger.months[0] || '') : (filters.month || filters.date?.slice(0, 7) || ledger.months.at(-1) || '');
  const activeLabel = ledger.isBalance ? `${ledger.meta.startDate} → ${ledger.meta.endDate}` : activeMonth;
  const month = ledger.monthly.find((row) => row.month === activeMonth) || {
    month: activeMonth, sales: 0, payments: 0, wheatCost: 0, closingCredit: 0,
    grossReceivables: 0, clientAdvances: 0, netOfficial: 0,
    openingCredit: 0, paidOldCredit: 0, collectionVsWheat: 0, collectionCoverage: null,
    unpaidClients: 0, paidClients: 0,
  };
  const clients = ledger.rows.filter((row) => row.month === activeMonth)
    .sort((a, b) => b.closingCredit - a.closingCredit || b.sales - a.sales);
  const grossReceivables = month.grossReceivables ?? sum(clients, 'closingCredit');
  const clientAdvances = month.clientAdvances ?? sum(clients, 'advance');
  const netOfficial = month.netOfficial ?? (grossReceivables - clientAdvances);
  const balanceChartData = [
    { name: 'Chiffre d’affaires', amount: month.sales, color: '#7a3024' },
    { name: 'Paiements', amount: month.payments, color: '#3f6f68' },
    { name: 'Créances à recouvrer', amount: grossReceivables, color: '#a95b48' },
    { name: 'Avances clients', amount: clientAdvances, color: '#c99715' },
  ];
  const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const matchesClient = (row) => !normalizedQuery || `${row.clientCode || ''} ${row.client}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(normalizedQuery);
  const filteredClients = clients.filter(matchesClient);
  const filteredHistory = ledger.rows.filter(matchesClient).slice().sort((a,b)=>b.month.localeCompare(a.month)||a.client.localeCompare(b.client,'fr'));
  const paymentStatus = (row) => row.closingCredit > 0 ? (row.payments > 0 ? 'Partiellement payé' : 'Non payé') : row.status;
  const signedClass = (value) => value > 0 ? 'bad' : value < 0 ? 'advance-value' : '';
  const explain = (title, formula, lines, result) => setCalculation({ title, formula, lines, result });
  return <>
    <section className="mino-title"><span><CreditCard size={16}/> Crédits & recouvrements</span><h2>{ledger.isBalance ? 'Situation officielle issue de la balance clients' : 'Suivre les crédits clients d’un mois au suivant'}</h2><p>{ledger.isBalance ? `Période du ${ledger.meta.startDate} au ${ledger.meta.endDate}. Le solde, les paiements et le chiffre d’affaires proviennent directement du fichier importé.` : 'Chaque paiement réduit d’abord le crédit impayé le plus ancien. Les soldes restent ouverts jusqu’à leur règlement et les avances clients sont conservées.'}</p></section>
    <section className="mino-kpi-grid four">
      <Kpi icon={CreditCard} label="Créances à recouvrer" value={money(grossReceivables)} note={`${n(month.unpaidClients)} clients débiteurs · cliquer`} tone={grossReceivables>0?'alert':'green'} onClick={()=>explain('Créances à recouvrer','Σ soldes clients positifs',[`الديون الحقيقية المطلوب تحصيلها: ${money(grossReceivables)}`,'تسبيقات زبون لا تخفض دين زبون آخر.'],money(grossReceivables))}/>
      <Kpi icon={Banknote} label="Avances clients" value={money(clientAdvances)} note="Soldes créditeurs · cliquer" tone="green" onClick={()=>explain('Avances clients','Σ valeur absolue des soldes clients négatifs',[`تسبيقات وأرصدة لصالح الزبائن: ${money(clientAdvances)}`],money(clientAdvances))}/>
      <Kpi icon={Scale} label="Solde net officiel" value={money(netOfficial)} note="Créances − avances · cliquer" tone={netOfficial>0?'gold':'green'} onClick={()=>explain('Solde net officiel','Créances à recouvrer − avances clients',[`Créances: ${money(grossReceivables)}`,`Avances: ${money(clientAdvances)}`,`الصافي الموجود في Total Général: ${money(netOfficial)}`],money(netOfficial))}/>
      <Kpi icon={CircleDollarSign} label="Paiements reçus" value={money(month.payments)} note={`${money(month.paidOldCredit)} sur anciens crédits · cliquer`} tone="green" onClick={()=>explain('Paiements reçus','Σ colonne Paiement de la Balance client',[`إجمالي التسديدات المسجلة: ${money(month.payments)}`,`منها موجه للديون القديمة: ${money(month.paidOldCredit)}`],money(month.payments))}/>
    </section>
    <div className="analysis-callout"><CreditCard/><div><strong>Lecture correcte de la balance clients</strong><span>Les clients doivent encore {money(grossReceivables)}. Les avances et soldes créditeurs représentent {money(clientAdvances)}. Leur différence donne le solde net officiel de {money(netOfficial)}.</span></div></div>
    {ledger.isBalance&&Math.abs(ledger.totals.reconciliationGap)>0.01&&<div className="analysis-callout"><AlertTriangle/><div><strong>Écart interne du fichier source</strong><span>Le Total Général officiel est utilisé pour les KPIs. La somme brute des 222 lignes clients diffère de {money(Math.abs(ledger.totals.reconciliationGap))}; le détail reste affiché tel qu’il existe dans le fichier.</span></div></div>}
    <Panel eyebrow={ledger.isBalance ? "Balance importée" : "Évolution mensuelle"} title="Ventes, paiements, créances et avances" note="DA">{ledger.isBalance ? <><p className="conserve-chart-note">Les ventes et paiements sont des flux ; les créances et avances sont des positions de balance.</p><div className="mino-chart x-tall"><ResponsiveContainer><BarChart data={balanceChartData} margin={{ top: 24, right: 18, left: 6 }}><CartesianGrid vertical={false} stroke="#e7e0d7" strokeDasharray="3 5"/><XAxis dataKey="name" axisLine={false} interval={0} tick={{ fontSize: 11 }}/><YAxis axisLine={false}/><Tooltip cursor={false} content={<BalanceTooltip/>}/><Bar dataKey="amount" name="Montant" radius={[6,6,0,0]}>{balanceChartData.map((row)=><Cell key={row.name} fill={row.color}/>)}<LabelList dataKey="amount" position="top" formatter={(value)=>money(value)} style={{ fill:'#5e514a', fontSize:10, fontWeight:700 }}/></Bar></BarChart></ResponsiveContainer></div></> : <div className="mino-chart x-tall"><ResponsiveContainer><ComposedChart data={ledger.monthly}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="month" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar dataKey="sales" name="Chiffre d’affaires" fill="#7a3024" radius={[5,5,0,0]}/><Bar dataKey="payments" name="Paiements" fill="#3f6f68" radius={[5,5,0,0]}/><Bar dataKey="clientAdvances" name="Avances clients" fill="#c99715" radius={[5,5,0,0]}/><Line type="monotone" dataKey="grossReceivables" name="Créances à recouvrer" stroke="#a95b48" strokeWidth={3}/><Line type="monotone" dataKey="netOfficial" name="Solde net officiel" stroke="#6e7e7b" strokeWidth={2}/></ComposedChart></ResponsiveContainer></div>}</Panel>
    <div className="credit-search"><Search/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Rechercher un client par nom…" aria-label="Rechercher un client"/>{query&&<button onClick={()=>setQuery('')} aria-label="Effacer la recherche"><X/></button>}<span>{filteredClients.length} / {clients.length} clients</span></div>
    <Expandable title={`Situation clients · ${activeLabel}`} meta={`${filteredClients.length} clients affichés`} openByDefault><div className="mino-table-scroll"><table><thead><tr><th>Code</th><th>Nom</th><th>Solde Antérieur</th><th>Chiffre Affaire</th><th>Paiement</th><th>Solde</th></tr></thead><tbody>{filteredClients.map((row)=>{const opening=ledger.isBalance?row.openingNet:row.openingCredit;const closing=ledger.isBalance?row.closingNet:row.closingCredit;return <tr key={`${row.month}-${row.clientCode || row.client}`}><td><strong>{row.clientCode || '—'}</strong></td><td><strong>{row.client}</strong></td><td className={signedClass(opening)}>{money(opening)}</td><td>{money(row.sales)}</td><td>{money(row.payments)}</td><td className={signedClass(closing)}>{money(closing)}</td></tr>})}</tbody></table></div></Expandable>
    <Expandable title={ledger.isBalance ? "Synthèse de la période importée" : "Synthèse de tous les mois"} meta={ledger.isBalance ? activeLabel : `${ledger.months.length} mois`}><div className="mino-table-scroll"><table><thead><tr><th>Période</th><th>Chiffre d’affaires</th><th>Paiements</th><th>Créances à recouvrer</th><th>Avances clients</th><th>Solde net officiel</th><th>Charges blé</th><th>Couverture encaissée</th></tr></thead><tbody>{ledger.monthly.map((row)=><tr key={row.month}><td><strong>{row.label || row.month}</strong></td><td>{money(row.sales)}</td><td>{money(row.payments)}</td><td className={row.grossReceivables > 0 ? 'bad' : ''}>{money(row.grossReceivables)}</td><td className="advance-value">{money(row.clientAdvances)}</td><td>{money(row.netOfficial)}</td><td>{money(row.wheatCost)}</td><td className={row.collectionVsWheat < 0 ? 'bad' : ''}>{row.collectionCoverage == null ? '—' : `${n(row.collectionCoverage,1)}%`}<small>{money(row.collectionVsWheat)}</small></td></tr>)}</tbody></table></div></Expandable>
    <Expandable title={ledger.isBalance ? "Détail complet de la balance importée" : "Historique détaillé client par client"} meta={ledger.isBalance ? `${filteredHistory.length} clients` : `${filteredHistory.length} positions mensuelles`}>{()=> <div className="mino-table-scroll"><table><thead><tr><th>{ledger.isBalance?'Période':'Mois'}</th><th>Client</th><th>{ledger.isBalance?'Solde antérieur':'Ouverture'}</th><th>Ventes</th><th>Paiements</th><th>Clôture</th><th>Statut</th></tr></thead><tbody>{filteredHistory.map((row)=><tr key={`${row.month}-${row.clientCode || row.client}`}><td>{ledger.isBalance?activeLabel:row.month}</td><td>{row.client}<small>{row.clientCode}</small></td><td className={ledger.isBalance&&row.openingNet<0?'advance-value':''}>{money(ledger.isBalance ? row.openingNet : row.openingCredit)}</td><td>{money(row.sales)}</td><td>{money(row.payments)}</td><td className={row.closingCredit > 0 ? 'bad' : ''}>{money(row.closingCredit)}</td><td><span className={`status-pill ${row.closingCredit > 0 ? 'warn' : 'ok'}`}>{paymentStatus(row)}</span></td></tr>)}</tbody></table></div>}</Expandable>
    {calculation&&<div className="credit-calc-layer" role="presentation" onMouseDown={()=>setCalculation(null)}><section className="credit-calc-box" role="dialog" aria-modal="true" aria-labelledby="credit-calc-title" onMouseDown={(event)=>event.stopPropagation()}><button className="credit-calc-close" onClick={()=>setCalculation(null)} aria-label="Fermer"><X/></button><span>Mode de calcul</span><h3 id="credit-calc-title">{calculation.title}</h3><code>{calculation.formula}</code><div>{calculation.lines.map((line)=><p key={line}>{line}</p>)}</div><footer><small>Résultat</small><strong>{calculation.result}</strong></footer></section></div>}
  </>;
}

function Cash({ model }) {
  const largestGap = [...model.reconciliation].sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap))[0];
  const cashBalanceName = model.cashOfficialBalanceAvailable ? 'Solde officiel' : 'Solde cumulé estimé';
  const cashBalanceNote = model.cashOfficialBalanceAvailable ? 'colonne F · CAISSE' : 'recettes − dépenses · colonne F absente';
  return <>
    <section className="mino-title"><span><Banknote size={16}/> Caisse juillet</span><h2>Distinguer recouvrement, autres recettes et dépenses</h2><p>Les remboursements restent dans la caisse mais ne sont pas considérés comme recouvrement client.</p></section>
    <section className="mino-kpi-grid four"><Kpi icon={Scale} label="Flux net de caisse" value={money(model.kpis.netCash)} note="Recettes − dépenses" tone={model.kpis.netCash>=0?'green':'alert'}/><Kpi icon={CircleDollarSign} label="Poids des dépenses" value={`${n(model.kpis.expenseRate,1)}%`} note={`${money(model.kpis.expenses)} décaissés`} tone={model.kpis.expenseRate>100?'alert':'burgundy'}/><Kpi icon={FileSpreadsheet} label="Jours réconciliés" value={`${n(model.kpis.reconciledDays)} / ${n(model.reconciliation.length)}`} note={`${n(model.kpis.reconciliationRate,1)}% conformes`} tone={model.kpis.reconciliationRate>90?'green':'gold'}/><Kpi icon={AlertTriangle} label="Plus grand écart" value={money(largestGap?.gap || 0)} note={largestGap?.date || 'Aucun écart'} tone={Math.abs(largestGap?.gap||0)>50?'alert':'green'}/></section>
    <div className="analysis-callout"><Banknote/><div><strong>Lecture trésorerie</strong><span>{model.kpis.netCash >= 0 ? 'Le flux net de caisse est positif sur la période.' : `Les dépenses dépassent les recettes de ${money(Math.abs(model.kpis.netCash))}.`} Le contrôle caisse/commercial est conforme sur {n(model.kpis.reconciliationRate,1)}% des journées rapprochées.</span></div></div>
    <section className="mino-grid equal">
      <Panel eyebrow="Structure des décaissements" title="Où part l’argent ?" note="DA">
        <div className="mino-donut large cash-expense-donut"><div className="cash-expense-donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={model.expenseBreakdown} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={3}>{model.expenseBreakdown.map((row,index)=><Cell key={row.name} fill={COLORS[index+1]}/>)}</Pie><Tooltip content={<TooltipCard/>}/></PieChart></ResponsiveContainer></div><div className="mino-legend">{model.expenseBreakdown.map((row,index)=><div key={row.name}><i style={{background:COLORS[index+1]}}/><span>{row.name}</span><b>{money(row.value)}</b></div>)}</div></div>
      </Panel>
      <Panel eyebrow="Position officielle" title="Solde de caisse au fil du mois" note={cashBalanceNote}><div className="mino-chart"><ResponsiveContainer><AreaChart data={model.daily}><defs><linearGradient id="cashCumulative" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f6f68" stopOpacity=".32"/><stop offset="1" stopColor="#3f6f68" stopOpacity=".02"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><ReferenceLine y={0} stroke="#9d9188"/><Area type="monotone" dataKey="cashBalance" name={cashBalanceName} stroke="#3f6f68" fill="url(#cashCumulative)" strokeWidth={2.5}/></AreaChart></ResponsiveContainer></div></Panel>
    </section>
    <Panel eyebrow="Mouvement quotidien" title="Recettes et dépenses de caisse" note="DA"><div className="mino-chart x-tall"><ResponsiveContainer><BarChart data={model.daily}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis axisLine={false}/><Tooltip content={<TooltipCard/>}/><Legend/><Bar dataKey="cash" name="Recettes caisse" fill="#3f6f68" radius={[5,5,0,0]}/><Bar dataKey="expenses" name="Dépenses" fill="#a95b48" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></Panel>
    <Expandable title="Réconciliation JOURNEE COMMERCIAL / CLASSEUR / CAISSE" meta={`${model.reconciliation.length} journées`} openByDefault><div className="mino-table-scroll"><table><thead><tr><th>Date</th><th>Recouvrement commercial</th><th>Chèques</th><th>Espèces attendues</th><th>Recettes caisse</th><th>Écart</th><th>Statut</th></tr></thead><tbody>{model.reconciliation.map((row)=><tr key={row.date}><td>{row.date}</td><td>{money(row.commercial)}</td><td>{money(row.cheque)}</td><td>{money(row.expectedCash)}</td><td>{money(row.receipt)}</td><td className={Math.abs(row.gap)>50?'bad':''}>{money(row.gap)}</td><td><span className={`status-pill ${row.status==='OK'?'ok':'warn'}`}>{row.status}</span></td></tr>)}</tbody></table></div></Expandable>
  </>;
}

function Anomalies({ model }) {
  const warnings = model.anomalies.filter((row)=>row.severity==='warning').length;
  const wheatIssues = model.anomalies.filter((r)=>r.type==='Ajustement blé').length;
  const cashIssues = model.anomalies.filter((r)=>r.type.includes('caisse')).length;
  return <><section className="mino-title"><span><AlertTriangle size={16}/> Contrôle qualité</span><h2>Une liste d’actions, pas seulement des alertes</h2><p>Chaque point ci-dessous peut modifier les ratios matière, la trésorerie ou la décision d’achat.</p></section><section className="mino-kpi-grid four"><Kpi icon={AlertTriangle} label="Priorité haute" value={n(warnings)} note="À justifier avant clôture" tone="alert"/><Kpi icon={RefreshCw} label="Mouvements blé G / M" value={n(wheatIssues)} note="Valider les transferts internes" tone="gold"/><Kpi icon={Scale} label="Écarts caisse" value={n(cashIssues)} note="Commercial vs espèces" tone={cashIssues?'alert':'green'}/><Kpi icon={Banknote} label="Recettes hors clients" value={n(model.anomalies.filter((r)=>r.type==='Autre recette').length)} note="À isoler du recouvrement" tone="green"/></section><section className="mino-grid equal"><Panel eyebrow="Nature des contrôles" title="Répartition des anomalies" note="nombre de cas"><div className="mino-donut large"><ResponsiveContainer><PieChart><Pie data={model.anomalyDistribution} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={3}>{model.anomalyDistribution.map((row,index)=><Cell key={row.name} fill={COLORS[index%COLORS.length]}/>)}</Pie><Tooltip content={<TooltipCard/>}/><Legend/></PieChart></ResponsiveContainer></div></Panel><Panel eyebrow="Chronologie" title="Jours concentrant les anomalies" note="événements"><div className="mino-chart"><ResponsiveContainer><BarChart data={model.anomalyTimeline}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis allowDecimals={false} axisLine={false}/><Tooltip content={<TooltipCard/>}/><Bar dataKey="count" name="Anomalies" fill="#a95b48" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></Panel></section><div className="action-priority"><strong>Ordre recommandé</strong><span>1. Confirmer les transferts de blé G ↔ M</span><span>2. Justifier les écarts caisse supérieurs à 50 DA</span><span>3. Séparer remboursements et recouvrements clients</span></div><Panel eyebrow="Journal de contrôle" title="Anomalies à traiter" note={`${model.anomalies.length} événements`}><div className="mino-alert-list">{model.anomalies.map((row,index)=><div key={`${row.date}-${row.type}-${index}`} className={row.severity}><span><AlertTriangle size={16}/></span><div><strong>{row.type}</strong><small>{row.date}</small></div><p>{row.detail}</p></div>)}</div></Panel></>;
}

function WheatTracking({ tracking, filters, onImport, busy }) {
  const rows = (tracking?.rows || []).filter((row) => (!filters.month || row.date.startsWith(filters.month)) && (!filters.date || row.date === filters.date));
  const dayMap = new Map();
  rows.forEach((row) => {
    const day = dayMap.get(row.date) || { date: row.date, label: shortDate(row.date), Groupe: 0, Minoterie: 0, totalKg: 0, declaredTotalKg: 0 };
    day[row.destination] += row.cclsKg;
    day.totalKg += row.cclsKg;
    if (row.dailyTotalCclsKg > 0) day.declaredTotalKg = row.dailyTotalCclsKg;
    dayMap.set(row.date, day);
  });
  const daily = [...dayMap.values()].sort((a,b)=>a.date.localeCompare(b.date)).map((day) => {
    const totalKg = day.declaredTotalKg || day.totalKg;
    const dayNumber = Number(day.date.slice(8));
    const decade = dayNumber <= 10 ? 1 : dayNumber <= 20 ? 2 : 3;
    const shortageKg = Math.max(0, 100000 - totalKg);
    const rawG = Math.max(0, 60000 - day.Groupe);
    const rawM = Math.max(0, 40000 - day.Minoterie);
    const rawTotal = rawG + rawM;
    const scale = rawTotal ? shortageKg / rawTotal : 0;
    const shortageGKg = rawG * scale;
    const shortageMKg = rawM * scale;
    const missingSite = [shortageGKg > .01 ? 'Groupe' : '', shortageMKg > .01 ? 'Minoterie' : ''].filter(Boolean).join(' + ') || '—';
    return { ...day, totalKg, decade, shortageKg, shortageGKg, shortageMKg, shortageQtx: shortageKg / 100, amount: shortageKg / 100 * WHEAT_PRICE_PER_QTX, missingSite };
  });
  const shortageDays = daily.filter((row) => row.shortageKg > .01 && (!filters.unit || (filters.unit === 'G' ? row.shortageGKg : row.shortageMKg) > .01));
  const totalExpectedKg = daily.length * 100000;
  const totalReceivedKg = sum(daily, 'totalKg');
  const totalShortageKg = sum(shortageDays, 'shortageKg');
  const totalRecovery = sum(shortageDays, 'amount');
  const nextPeriod = (decade, date) => {
    const month = date?.slice(0,7) || '';
    if (decade === 1) return `${month} · Décade 2 (11–20)`;
    if (decade === 2) return `${month} · Décade 3 (21–fin)`;
    const next = month ? new Date(`${month}-01T00:00:00Z`) : null;
    if (next) next.setUTCMonth(next.getUTCMonth()+1);
    return `${next ? next.toISOString().slice(0,7) : 'Mois suivant'} · Décade 1 (01–10)`;
  };
  const periodKeys = [...new Set(daily.map((row) => `${row.date.slice(0,7)}-${row.decade}`))].sort();
  const decades = periodKeys.map((key) => {
    const month = key.slice(0,7);
    const decade = Number(key.slice(8));
    const scoped = daily.filter((row) => row.date.startsWith(month) && row.decade === decade);
    const missing = shortageDays.filter((row) => row.date.startsWith(month) && row.decade === decade);
    return { key, month, decade, label: decade === 1 ? '01–10' : decade === 2 ? '11–20' : '21–fin', days: scoped.length, expectedKg: scoped.length*100000, receivedKg: sum(scoped,'totalKg'), shortageKg: sum(missing,'shortageKg'), amount: sum(missing,'amount'), recovery: nextPeriod(decade, scoped[0]?.date) };
  });
  if (!tracking?.rows?.length) return <><section className="mino-title"><span><Scale size={16}/> Contrôle du quota CCLS</span><h2>Suivi du blé à récupérer</h2><p>Importez le fichier SUIVE BLE pour contrôler chaque Total / JR par rapport au quota de 100 000 kg.</p></section><section className="annual-pdf-import"><span><FileSpreadsheet/></span><div><small>Fichier de suivi des quotas</small><strong>Aucune donnée importée</strong><p>Le manque sera valorisé à 1 285 DA/qtx et reporté sur la décade suivante.</p></div><button onClick={onImport} disabled={busy}>{busy ? <><RefreshCw className="spin"/> Lecture…</> : <><Upload/> Importer SUIVE BLE</>}</button></section></>;
  return <>
    <section className="mino-title"><span><Scale size={16}/> Contrôle du quota CCLS</span><h2>Suivi du blé à récupérer</h2><p>Chaque Total / JR inférieur à 100 000 kg crée une créance à récupérer sur le paiement de la décade suivante.</p></section>
    <section className="annual-pdf-import imported"><span><CheckCircle2/></span><div><small>Source active</small><strong>{tracking.meta?.fileName}</strong><p>{tracking.meta?.firstDate} → {tracking.meta?.lastDate} · {tracking.rows.length} pesées</p></div><button onClick={onImport} disabled={busy}>{busy ? <><RefreshCw className="spin"/> Lecture…</> : <><Upload/> Remplacer</>}</button></section>
    <section className="mino-kpi-grid four"><Kpi icon={Wheat} label="Quota attendu" value={`${n2(totalExpectedKg/100)} qtx`} note={`${daily.length} jours × 1 000 qtx`}/><Kpi icon={CheckCircle2} label="Total livré CCLS" value={`${n2(totalReceivedKg/100)} qtx`} note={`${n(totalReceivedKg)} kg`} tone="green"/><Kpi icon={AlertTriangle} label="Quantité à récupérer" value={`${n2(totalShortageKg/100)} qtx`} note={`${shortageDays.length} journées incomplètes`} tone={totalShortageKg?'alert':'green'}/><Kpi icon={CircleDollarSign} label="Montant à récupérer" value={money(totalRecovery)} note="Manque qtx × 1 285 DA" tone={totalRecovery?'alert':'green'}/></section>
    <Panel eyebrow="Circuit de récupération" title="Suivi par mois et par décade" note="1 285 DA/qtx"><div className="mino-table-scroll"><table><thead><tr><th>Période</th><th>Quota attendu</th><th>Livré CCLS</th><th>Manque</th><th>Montant</th><th>À récupérer sur</th><th>Statut</th></tr></thead><tbody>{decades.map((row)=><tr key={row.key}><td><strong>{row.month} · Décade {row.decade} ({row.label})</strong></td><td>{n2(row.expectedKg/100)} qtx</td><td>{n2(row.receivedKg/100)} qtx</td><td className={row.shortageKg?'bad':''}>{n2(row.shortageKg/100)} qtx</td><td className={row.amount?'bad':''}>{money(row.amount)}</td><td>{row.amount ? row.recovery : '—'}</td><td><span className={`status-pill ${row.amount?'warn':'ok'}`}>{row.amount?'À récupérer':'Conforme'}</span></td></tr>)}</tbody></table></div></Panel>
    <section className="mino-grid equal"><Panel eyebrow="Livraison quotidienne" title="Total / JR comparé à 100 000 kg" note="kg"><div className="mino-chart tall"><ResponsiveContainer><BarChart data={daily}><CartesianGrid vertical={false} stroke="#e7e0d7"/><XAxis dataKey="label" axisLine={false}/><YAxis domain={[0,100000]} axisLine={false}/><Tooltip content={<TooltipCard/>}/><ReferenceLine y={100000} stroke="#3f6f68" strokeDasharray="5 4" label="Quota 100 000"/><Bar dataKey="totalKg" name="Total CCLS kg" radius={[5,5,0,0]}>{daily.map((row)=><Cell key={row.date} fill={row.shortageKg?'#a95b48':'#c99715'}/>)}</Bar></BarChart></ResponsiveContainer></div></Panel><Panel eyebrow="Affectation" title="Manque par destination" note="qtx"><div className="mino-table-scroll"><table><thead><tr><th>Site</th><th>Manque</th><th>Valeur</th></tr></thead><tbody>{[['Groupe','shortageGKg'],['Minoterie','shortageMKg']].map(([site,key])=>{const kg=sum(shortageDays,key);return <tr key={site}><td><strong>{site}</strong></td><td className={kg?'bad':''}>{n2(kg/100)} qtx</td><td>{money(kg/100*WHEAT_PRICE_PER_QTX)}</td></tr>})}</tbody></table></div></Panel></section>
    <Panel eyebrow="Créances CCLS" title="Journées avec quota incomplet" note={`${shortageDays.length} cas`}><div className="mino-table-scroll"><table><thead><tr><th>Date</th><th>Décade</th><th>Total / JR</th><th>Site concerné</th><th>Manque qtx</th><th>Montant</th><th>Récupération</th></tr></thead><tbody>{shortageDays.length ? shortageDays.map((row)=><tr key={row.date}><td>{row.date}</td><td>Décade {row.decade}</td><td>{n(row.totalKg)} kg</td><td>{row.missingSite}</td><td className="bad">{n2(row.shortageQtx)}</td><td className="bad">{money(row.amount)}</td><td>{nextPeriod(row.decade,row.date)}</td></tr>) : <tr><td colSpan="7"><strong>Aucun manque de quota sur la période sélectionnée.</strong></td></tr>}</tbody></table></div></Panel>
  </>;
}

function MonthlyImports({ registry, year, onYearChange, onPick, busyKey }) {
  const importedCount = MONTH_NAMES.reduce((total, _, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return total + IMPORT_TYPES.filter(([type]) => registry[month]?.[type]).length;
  }, 0);
  const completeMonths = MONTH_NAMES.filter((_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return IMPORT_TYPES.every(([type]) => registry[month]?.[type]);
  }).length;
  const annualPdf = registry[`${year}-pdf`]?.stockPdf;
  const globalCollections = registry.global?.collections;
  return <>
    <section className="mino-title import-title"><span><FileSpreadsheet size={16}/> Administration des sources</span><h2>Importation des données</h2><p>Importez le fichier global Encaissements une seule fois. Les fichiers Commercial, Ventes, Production et Balance client restent organisés par mois.</p></section>
    <section className="import-summary">
      <div><CalendarDays/><span>Exercice</span><select value={year} onChange={(event)=>onYearChange(event.target.value)}>{[2025,2026,2027,2028].map((item)=><option key={item} value={String(item)}>{item}</option>)}</select></div>
      <div><strong>{importedCount} / {12 * IMPORT_TYPES.length}</strong><span>fichiers importés</span></div>
      <div><strong>{completeMonths} / 12</strong><span>mois complets</span></div>
    </section>
    <section className={`annual-pdf-import ${annualPdf ? 'imported' : ''}`}>
      <span>{annualPdf ? <CheckCircle2/> : <FileSpreadsheet/>}</span>
      <div><small>Fiche de stock annuelle · 1 janvier → dernière date</small><strong>PDF Stock {year}</strong><p>{annualPdf ? `${annualPdf.fileName}${annualPdf.period ? ` · ${annualPdf.period}` : ''}${annualPdf.pages ? ` · ${annualPdf.pages} pages` : ''}${Number.isFinite(annualPdf.production) ? ` · Production ${n(annualPdf.production,2)} qtx · Ventes nettes ${n(annualPdf.netSales,2)} qtx` : ''}` : 'Aucun PDF importé pour cet exercice'}</p></div>
      <button disabled={Boolean(busyKey)} onClick={()=>onPick(year,'stockPdf')}>{busyKey===`${year}:stockPdf` ? <><RefreshCw className="spin"/> Lecture du PDF…</> : annualPdf ? <><Upload/> Remplacer</> : <><Upload/> Importer le PDF</>}</button>
    </section>
    <section className={`annual-pdf-import ${globalCollections ? 'imported' : ''}`}>
      <span>{globalCollections ? <CheckCircle2/> : <FileSpreadsheet/>}</span>
      <div><small>Source globale · toutes les dates disponibles</small><strong>Encaissements</strong><p>{globalCollections ? `${globalCollections.fileName} · ${globalCollections.period || ''} · ${n(globalCollections.rows)} écritures` : 'Aucun fichier global Encaissements importé'}</p></div>
      <button disabled={Boolean(busyKey)} onClick={()=>onPick('global','collections')}>{busyKey==='global:collections' ? <><RefreshCw className="spin"/> Lecture…</> : globalCollections ? <><Upload/> Remplacer</> : <><Upload/> Importer Encaissements</>}</button>
    </section>
    <section className="monthly-import-grid">
      {MONTH_NAMES.map((name, index) => {
        const month = `${year}-${String(index + 1).padStart(2, '0')}`;
        const monthFiles = registry[month] || {};
        const complete = IMPORT_TYPES.every(([type]) => monthFiles[type]);
        return <article className={`month-import-card ${complete ? 'complete' : ''}`} key={month}>
          <header><div><span>{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong></div><b>{complete ? 'Complet' : `${IMPORT_TYPES.filter(([type])=>monthFiles[type]).length}/${IMPORT_TYPES.length}`}</b></header>
          <div className="month-file-list">{IMPORT_TYPES.map(([type, label]) => {
            const item = monthFiles[type];
            const key = `${month}:${type}`;
            const hasBalanceDetails = type === 'balance' && Number.isFinite(item?.grossReceivables);
            const hasCostDetails = type === 'costAccounting' && Number.isFinite(item?.totalCost);
            const itemTitle = hasBalanceDetails ? `${item.fileName} · Créances ${money(item.grossReceivables)} · Avances ${money(item.clientAdvances)} · Net officiel ${money(item.officialNet)} · ${item.balanceStatus}` : hasCostDetails ? `${item.fileName} · Coût ${money(item.totalCost)} · Coût/qtx ${money(item.averageCostPerQtx)} · Marge ${money(item.netMargin)}` : item?.fileName;
            return <button key={type} className={`${item ? 'imported' : ''} ${hasBalanceDetails || hasCostDetails ? 'balance-imported' : ''}`} disabled={Boolean(busyKey)} onClick={()=>onPick(month,type)} title={itemTitle || `Importer ${label}`}>
              <span>{item ? <CheckCircle2/> : <Upload/>}</span><div><strong>{label}</strong><small>{busyKey===key ? 'Lecture…' : item ? item.fileName : 'Non importé'}</small>{hasBalanceDetails&&<em>Créances {money(item.grossReceivables)} · Avances {money(item.clientAdvances)} · Net {money(item.officialNet)} · <b>{item.balanceStatus}</b></em>}{hasCostDetails&&<em>Coût {money(item.totalCost)} · {money(item.averageCostPerQtx)}/qtx · Marge {money(item.netMargin)}</em>}</div><b>{busyKey===key ? <RefreshCw className="spin"/> : item ? 'Remplacer' : 'Importer'}</b>
            </button>;
          })}</div>
        </article>;
      })}
    </section>
  </>;
}

const TABS = [
  ['overview', 'Vue manager', LayoutDashboard], ['wheat', 'Blé & production', Wheat], ['teams', 'Équipes', Users],
  ['sales', 'Ventes', TrendingUp], ['costAccounting', 'Coût de revient', Calculator], ['wheatTracking', 'Suivi blé', Scale], ['credits', 'Crédits clients', CreditCard], ['cash', 'Caisse', Banknote], ['anomalies', 'Anomalies', AlertTriangle],
  ['imports', 'Importation', FileSpreadsheet],
];

export default function MinoterieDashboard({ data, onData, onBack }) {
  const [tab, setTab] = useState('overview');
  const [filters, setFilters] = useState({ month: '', unit: '', date: '' });
  const [importYear, setImportYear] = useState('2026');
  const [importRegistry, setImportRegistry] = useState(() => {
    try { return JSON.parse(localStorage.getItem('abidi-minoterie-monthly-imports') || '{}'); }
    catch { return {}; }
  });
  const [pendingImport, setPendingImport] = useState(null);
  const [busyImport, setBusyImport] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const monthlyFileInput = useRef();
  const pendingImportRef = useRef(null);
  const importRunningRef = useRef(false);
  useEffect(() => {
    localStorage.setItem('abidi-minoterie-monthly-imports', JSON.stringify(importRegistry));
  }, [importRegistry]);
  const scopedData = useMemo(() => {
    const selectedBalance = filters.month ? data.clientBalances?.[filters.month] : data.clientBalance;
    return selectedBalance ? { ...data, clientBalance: selectedBalance } : data;
  }, [data, filters.month]);
  const creditLedger = useMemo(() => buildCreditLedger(scopedData, []), [scopedData]);
  const model = useMemo(() => buildModel(scopedData, filters, [], creditLedger), [scopedData, filters, creditLedger]);
  const activeCostMonth = filters.month || filters.date?.slice(0,7) || Object.keys(data.costAccountingByMonth || {}).sort().at(-1) || '';
  const activeCostAccounting = data.costAccountingByMonth?.[activeCostMonth];
  const pickMonthlyFile = (month, type) => {
    const target = { month, type };
    pendingImportRef.current = target;
    setPendingImport(target);
    const input = monthlyFileInput.current;
    if (!input) {
      setError('Le sélecteur de fichier n’est pas disponible. Rechargez la page.');
      return;
    }
    input.dataset.importMonth = month;
    input.dataset.importType = type;
    input.value = '';
    input.click();
  };
  const importMonthlyFile = async (event) => {
    const file = event.target.files?.[0];
    const inputTarget = event.target.dataset.importMonth && event.target.dataset.importType
      ? { month: event.target.dataset.importMonth, type: event.target.dataset.importType }
      : null;
    const target = inputTarget || pendingImportRef.current || pendingImport;
    event.target.value = '';
    if (!file) return;
    if (!target) {
      setError(`Import annulé : aucune destination n’est associée au fichier ${file.name}. Cliquez à nouveau sur Importer.`);
      return;
    }
    const key = `${target.month}:${target.type}`;
    if (importRunningRef.current) return;
    importRunningRef.current = true;
    setBusyImport(key); setError(''); setNotice(`Lecture de ${file.name} pour ${target.month}…`);
    try {
      if ((target.type === 'sales' || target.type === 'production') && !importRegistry[target.month]?.commercial) {
        throw new Error(`Importez d’abord le fichier Commercial de ${target.month}.`);
      }
      let registryDetails = {};
      if (target.type === 'wheatTracking') {
        if (!/\.xlsx?$/i.test(file.name)) throw new Error('Sélectionnez le fichier Excel SUIVE BLE.');
        const wheatTracking = await parseWheatTrackingFile(file);
        const trackingMonths = [...new Set(wheatTracking.rows.map((row) => row.date.slice(0, 7)))];
        const months = [...new Set([...(data.meta.months || []), ...trackingMonths])].sort();
        onData({ ...data, wheatTracking, meta: { ...data.meta, months, wheatTrackingFile: file.name } });
        registryDetails = { rows: wheatTracking.rows.length };
      } else if (target.type === 'stockPdf') {
        if (!/\.pdf$/i.test(file.name)) throw new Error('Sélectionnez un fichier PDF de fiche de stock.');
        const stockPdf = await parseMinoterieStockPdf(file);
        const detectedYear = (stockPdf.meta.firstDate || stockPdf.meta.lastDate || '').slice(0, 4);
        if (detectedYear && detectedYear !== target.month) throw new Error(`Ce PDF concerne ${detectedYear}, pas ${target.month}.`);
        const pdfMonths = [...new Set(stockPdf.rows.map((row) => row.date?.slice(0, 7)).filter(Boolean))];
        const months = [...new Set([...(data.meta.months || []), ...pdfMonths])].sort();
        onData({ ...data, stockPdf, meta: { ...data.meta, months, stockPdfFile: file.name, stockPdfFirstDate: stockPdf.meta.firstDate, stockPdfLastDate: stockPdf.meta.lastDate } });
        registryDetails = { pages: stockPdf.meta.pages, period: `${stockPdf.meta.firstDate} → ${stockPdf.meta.lastDate}`, production: stockPdf.totals.production, netSales: stockPdf.totals.netSales, negativeStocks: stockPdf.negativeStocks.length };
      } else if (target.type === 'collections') {
        if (!/\.xlsx?$/i.test(file.name)) throw new Error('Sélectionnez un fichier Excel Encaissements.');
        const collections = await parseEncaissementFile(file);
        const collectionMonths = [...new Set(collections.map((row) => row.date?.slice(0, 7)).filter(Boolean))];
        const existingCollectionMonths = [...new Set((data.collections || []).map((row) => row.date?.slice(0, 7)).filter(Boolean))];
        const collectionDates = collections.map((row)=>row.date).filter(Boolean).sort();
        const imported = { collections, meta: { fileName: file.name, collectionFile: file.name, replaceMonths: { collections: [...new Set([...existingCollectionMonths, ...collectionMonths])] }, generatedAt: new Date().toISOString() } };
        onData(mergeMinoterieData([data, imported]));
        registryDetails = { rows: collections.length, period: `${collectionDates[0]} → ${collectionDates.at(-1)}`, months: collectionMonths.length };
      } else if (target.type === 'balance') {
        const balance = await parseBalanceClientFile(file);
        const detectedMonth = (balance.meta.endDate || balance.meta.startDate || '').slice(0, 7);
        if (detectedMonth && detectedMonth !== target.month) throw new Error(`Ce fichier concerne ${detectedMonth}, pas ${target.month}.`);
        const clientBalances = { ...(data.clientBalances || {}), [target.month]: balance };
        const latestMonth = Object.keys(clientBalances).sort().at(-1);
        onData({ ...data, clientBalances, clientBalance: clientBalances[latestMonth], meta: { ...data.meta, balanceFile: file.name, balanceClientCount: balance.rows.length, balanceGeneratedAt: new Date().toISOString() } });
        const grossReceivables = balance.rows.reduce((total,row)=>total+Math.max(0,Number(row.balance)||0),0);
        const clientAdvances = balance.rows.reduce((total,row)=>total+Math.max(0,-(Number(row.balance)||0)),0);
        const netCalculated = grossReceivables - clientAdvances;
        const officialNet = Number(balance.totals.balance) || 0;
        registryDetails = { grossReceivables, clientAdvances, netCalculated, officialNet, balanceGap: netCalculated - officialNet, balanceStatus: Math.abs(netCalculated-officialNet)<=1 ? 'Conforme' : 'À vérifier' };
      } else if (target.type === 'costAccounting') {
        if (!/\.xlsx?$/i.test(file.name)) throw new Error('Sélectionnez un fichier Excel Coût de revient.');
        const costAccounting = await parseCostAccountingFile(file);
        const detectedCostMonth = costAccounting.meta.month;
        const storedCostAccounting = {
          ...costAccounting,
          meta: { ...costAccounting.meta, month: target.month, selectedMonth: target.month, detectedMonth: detectedCostMonth },
        };
        const costAccountingByMonth = { ...(data.costAccountingByMonth || {}), [target.month]: storedCostAccounting };
        onData({ ...data, costAccountingByMonth, meta: { ...data.meta, costAccountingFile: file.name, generatedAt: new Date().toISOString() } });
        registryDetails = { products: costAccounting.products.length, totalCost: costAccounting.totals.totalCost, averageCostPerQtx: costAccounting.totals.averageCostPerQtx, netMargin: costAccounting.totals.netMargin, detectedMonth: detectedCostMonth };
      } else {
        const parsed = await parseMinoterieFile(file);
        const detectedMonth = parsed.meta?.month || parsed.meta?.firstDate?.slice(0, 7) || '';
        if (detectedMonth && detectedMonth !== target.month) throw new Error(`Ce fichier concerne ${detectedMonth}, pas ${target.month}.`);
        const isProduction = parsed.production?.some((row) => row.aggregate) && !parsed.sales?.length;
        const isSales = parsed.sales?.some((row) => row.aggregate) && !parsed.production?.length;
        const isCommercial = !parsed.meta?.replaceMonths && Boolean(parsed.wheat?.length || parsed.cash?.length || parsed.recoveries?.length);
        if (target.type === 'production' && !isProduction) throw new Error('Le fichier sélectionné n’est pas un rapport Production compatible.');
        if (target.type === 'sales' && !isSales) throw new Error('Le fichier sélectionné n’est pas un rapport Ventes compatible.');
        if (target.type === 'commercial' && !isCommercial) throw new Error('Le fichier sélectionné n’est pas un classeur Commercial complet.');
        if (target.type === 'commercial') {
          // Commercial owns the daily/shift detail, but it must not remove the
          // official monthly totals already imported from Ventes/Production.
          const retained = {
            ...data,
            production: (data.production || []).filter((row) => row.date?.slice(0, 7) !== target.month || row.aggregate),
            sales: (data.sales || []).filter((row) => row.date?.slice(0, 7) !== target.month || row.aggregate),
          };
          const imported = {
            ...parsed,
            meta: {
              ...parsed.meta,
              replaceMonths: Object.fromEntries(['teamProduction','wheat','recoveries','checks','cash'].map((field)=>[field,[target.month]])),
            },
          };
          onData(mergeMinoterieData([retained, imported]));
        } else {
          onData(mergeMinoterieData([data, parsed]));
        }
      }
      setImportRegistry((current) => {
        if (target.type === 'wheatTracking') return current;
        const item = { fileName: file.name, importedAt: new Date().toISOString(), ...registryDetails };
        const registryKey = target.type === 'stockPdf' ? `${target.month}-pdf` : target.month;
        const currentMonth = current[registryKey] || {};
        const monthFiles = target.type === 'stockPdf'
          ? { ...currentMonth, stockPdf: item }
          : { ...currentMonth, [target.type]: item };
        return { ...current, [registryKey]: monthFiles };
      });
      void archiveImportedFile('minoterie', `${target.month.replace('-', '_')}_${target.type}`, file).catch(() => {});
      setNotice(target.type === 'wheatTracking' ? `${file.name} importé · ${registryDetails.rows} pesées analysées.` : target.type === 'collections' ? `${file.name} importé · ${registryDetails.rows} encaissements · ${registryDetails.months} mois · ${registryDetails.period}.` : target.type === 'balance' ? `${file.name} importé · Créances ${money(registryDetails.grossReceivables)} · Avances ${money(registryDetails.clientAdvances)} · Net officiel ${money(registryDetails.officialNet)} · ${registryDetails.balanceStatus}.` : target.type === 'costAccounting' ? `${file.name} importé · ${registryDetails.products} produits · Coût total ${money(registryDetails.totalCost)} · Marge ${money(registryDetails.netMargin)}.` : target.type === 'stockPdf' ? `${file.name} importé · Production ${n(registryDetails.production,2)} qtx · Ventes nettes ${n(registryDetails.netSales,2)} qtx · ${registryDetails.negativeStocks} stocks négatifs.` : `${file.name} importé pour ${target.month} · ${IMPORT_TYPES.find(([type])=>type===target.type)?.[1]}.`);
    } catch (err) {
      setError(`${file.name} : ${err instanceof Error ? err.message : 'lecture du fichier impossible'}`);
    }
    finally { importRunningRef.current = false; setBusyImport(''); pendingImportRef.current = null; setPendingImport(null); }
  };
  return <div className={`mino-shell ${collapsed ? 'collapsed' : ''}`}>
    <aside className="mino-sidebar">
      <div className="mino-brand"><img src="/brand/groupe-abidi-logo.png" alt="Groupe ABIDI"/><div><span>Groupe ABIDI</span><strong>Minoteries</strong></div></div>
      <button className="mino-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed?'Ouvrir le menu':'Réduire le menu'}>{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}<span>{collapsed?'Ouvrir':'Réduire'}</span></button>
      <nav>{TABS.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)} title={label}><Icon/><span>{label}</span>{key==='anomalies'&&model.anomalies.length>0&&<b>{model.anomalies.length}</b>}</button>)}</nav>
      <button className="mino-switch" onClick={onBack}><ArrowLeft/><span>Changer de dashboard</span></button>
      <div className="mino-source" title={[...(data.meta.fileNames || [data.meta.fileName]), data.meta.balanceFile].filter(Boolean).join('\n')}><Database/><div><span>Sources actives</span><strong>{data.meta.fileName}</strong><small>{data.meta.balanceFile ? `Balance : ${data.meta.balanceFile}` : `${data.meta.firstDate} → ${data.meta.lastDate}`}</small></div></div>
    </aside>
    <main className="mino-main">
      <header className="mino-topbar"><button className="mino-mobile-menu" onClick={()=>setCollapsed(!collapsed)}><Menu/></button><div><span>Opérations / Minoterie</span><h1>{TABS.find(([key])=>key===tab)?.[1]}</h1></div>{tab!=='imports'&&<button className="mino-upload" onClick={()=>setTab('imports')}><FileSpreadsheet/><span>Importation mensuelle</span></button>}<input ref={monthlyFileInput} type="file" accept=".xlsx,.xls,.pdf" hidden onClick={()=>setNotice('Sélectionnez le fichier Excel puis validez avec Ouvrir.')} onInput={importMonthlyFile} onChange={importMonthlyFile}/></header>
      {tab!=='imports'&&<section className="mino-filters"><div><CalendarDays/><span>Filtres</span></div><label><span>Mois</span><select value={filters.month} onChange={(e)=>setFilters((f)=>({...f,month:e.target.value,date:''}))}><option value="">Toute la période</option>{(data.meta.months || (data.meta.month ? [data.meta.month] : [])).map((month)=><option key={month} value={month}>{month}</option>)}</select></label><label><span>Minoterie</span><select value={filters.unit} onChange={(e)=>setFilters((f)=>({...f,unit:e.target.value}))}><option value="">G + M</option><option value="G">Groupe (G)</option><option value="M">Minoterie Abidi (M)</option></select></label><label><span>Date</span><select value={filters.date} onChange={(e)=>setFilters((f)=>({...f,date:e.target.value}))}><option value="">Toutes les dates</option>{model.dates.map((date)=><option key={date} value={date}>{date}</option>)}</select></label>{(filters.month||filters.unit||filters.date)&&<button onClick={()=>setFilters({month:'',unit:'',date:''})}><X/>Effacer</button>}</section>}
      {tab!=='imports'&&filters.unit && <div className="mino-scope-note"><AlertTriangle/> Le filtre {filters.unit} s’applique au blé, à la production et aux ventes identifiées. Recouvrements, caisse et dépenses restent globaux tant que les écritures ne portent pas l’unité G/M.</div>}
      {error&&<div className="mino-error"><AlertTriangle/>{error}<button onClick={()=>setError('')}><X/></button></div>}
      {notice&&<div className="mino-success"><CheckCircle2/>{notice}<button onClick={()=>setNotice('')}><X/></button></div>}
      <div className="mino-content">{tab==='overview'&&<Overview model={model} filteredUnit={filters.unit} onImportCollections={()=>setTab('imports')}/>} {tab==='wheat'&&<WheatProduction model={model}/>} {tab==='teams'&&<Teams model={model}/>} {tab==='sales'&&<SalesFinance model={model}/>} {tab==='costAccounting'&&<CostAccounting costing={activeCostAccounting} allCosting={data.costAccountingByMonth} onImport={()=>setTab('imports')}/>} {tab==='wheatTracking'&&<WheatTracking tracking={data.wheatTracking} filters={filters} onImport={()=>pickMonthlyFile('tracking','wheatTracking')} busy={busyImport==='tracking:wheatTracking'}/>} {tab==='credits'&&<ClientCredits model={model} filters={filters}/>} {tab==='cash'&&<Cash model={model}/>} {tab==='anomalies'&&<Anomalies model={model}/>} {tab==='imports'&&<MonthlyImports registry={importRegistry} year={importYear} onYearChange={setImportYear} onPick={pickMonthlyFile} busyKey={busyImport}/>}</div>
      <footer className="mino-footer"><span>Groupe ABIDI · Dashboard Minoterie</span><span>Ratio matière indicatif jusqu’à validation de la consommation réelle du blé</span></footer>
    </main>
  </div>;
}
