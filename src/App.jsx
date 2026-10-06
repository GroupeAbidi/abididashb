import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Database,
  Factory,
  FileSpreadsheet,
  Filter,
  Gauge,
  GitCompareArrows,
  Layers3,
  LayoutGrid,
  MapPin,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Repeat2,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildDashboard,
  exportCsv,
  monthLabel,
  parseExcelFile,
} from "./lib/data.js";

const MinoterieDashboard = lazy(() => import("./MinoterieDashboard.jsx"));
const AttendanceDashboard = lazy(() => import("./AttendanceDashboard.jsx"));
const ConserverieDashboard = lazy(() => import("./ConserverieDashboard.jsx"));
const DashboardLoader = () => (
  <div className="loading-screen">
    <RefreshCw className="spin" />
    <span>Chargement du dashboard…</span>
  </div>
);

const COLORS = [
  "#c99715",
  "#7a3024",
  "#d8b75a",
  "#5f6a68",
  "#9a6c61",
  "#a85243",
  "#758c94",
  "#a69b72",
];
const MINOTERIE_DATA_VERSION = "2026-09-06-official-production-sales-totals-v1";
const formatNumber = (value, digits = 0) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(
    value || 0,
  );
const formatMoney = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    value || 0,
  );
const consumptionExportRows = (rows) =>
  rows.map((row) => ({
    Date: row.date,
    Code_article: row.article,
    Désignation: row.designation,
    Quantité: row.quantity,
    Unité: row.unit,
    Montant: row.amount,
    SARL: row.sarl,
    Demandeur: row.requester,
    Centre_de_coût: row.costCenterLabel,
    Projet: row.projectLabel,
    Gisement: row.location,
    Lot: row.lot,
    Bon_de_sortie: row.document,
    Ligne: row.line,
    Compte: row.account,
    Type_consommation: row.consumptionType,
    Emballage: row.packaging,
    Quantité_emballage: row.quantityPack,
    Coefficient: row.coefficient,
    OP: row.workOrder,
    DP: row.purchaseRequest,
    Observation: row.observation,
  }));

function StatCard({ icon: Icon, label, value, note, tone = "ink" }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-icon">
        <Icon size={19} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty">
      <Boxes size={28} />
      <span>{text}</span>
    </div>
  );
}

function CollapsiblePanel({
  kicker,
  title,
  meta,
  action,
  children,
  className = "",
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`panel purchase-table-panel collapsible-panel ${className}`}
    >
      <header className="collapse-bar">
        <button
          className="collapse-trigger"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="collapse-copy">
            <span className="section-kicker">{kicker}</span>
            <strong>{title}</strong>
            {meta && <small>{meta}</small>}
          </span>
          <span className="collapse-state">
            {open ? "Masquer" : "Afficher"}{" "}
            <ChevronDown className={open ? "open" : ""} size={18} />
          </span>
        </button>
        {action && <div className="collapse-action">{action}</div>}
      </header>
      <div className={`collapse-content ${open ? "open" : ""}`}>
        <div className="collapse-inner">{children}</div>
      </div>
    </section>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label || payload[0]?.payload?.name}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          {item.name}: {formatNumber(item.value, 1)}
        </span>
      ))}
    </div>
  );
}

function UploadPanel({ data, onImport, onClose, message }) {
  const stockInput = useRef();
  const sortiesInput = useRef();
  const handle = async (event, kind) => {
    const file = event.target.files?.[0];
    if (file) await onImport(file, kind);
    event.target.value = "";
  };
  return (
    <div className="modal-layer" role="presentation">
      <section
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
        <div className="eyebrow">
          <Database size={15} /> Mise à jour des sources
        </div>
        <h2 id="upload-title">Charger les deux dernières versions</h2>
        <p>
          Importez les exports Excel sans modifier leurs colonnes. Chaque
          nouveau fichier remplace uniquement sa source.
        </p>
        <div className="upload-grid">
          <button
            className="upload-card"
            onClick={() => stockInput.current.click()}
          >
            <span className="upload-icon">
              <Boxes />
            </span>
            <strong>Stock actuel</strong>
            <span>{data.meta?.stockFile || "Aucun fichier"}</span>
            <small>{formatNumber(data.stock.length)} lignes reconnues</small>
            <b>
              <Upload size={15} /> Remplacer le stock
            </b>
          </button>
          <button
            className="upload-card"
            onClick={() => sortiesInput.current.click()}
          >
            <span className="upload-icon peach">
              <FileSpreadsheet />
            </span>
            <strong>Historique des sorties</strong>
            <span>{data.meta?.sortiesFile || "Aucun fichier"}</span>
            <small>{formatNumber(data.sorties.length)} lignes reconnues</small>
            <b>
              <Upload size={15} /> Remplacer les sorties
            </b>
          </button>
        </div>
        <input
          ref={stockInput}
          type="file"
          accept=".xls,.xlsx"
          hidden
          onChange={(event) => handle(event, "stock")}
        />
        <input
          ref={sortiesInput}
          type="file"
          accept=".xls,.xlsx"
          hidden
          onChange={(event) => handle(event, "sorties")}
        />
        {message && (
          <div className={`upload-message ${message.type}`}>
            {message.type === "ok" ? (
              <CheckCircle2 size={17} />
            ) : (
              <AlertTriangle size={17} />
            )}
            {message.text}
          </div>
        )}
        <div className="privacy-note">
          Les fichiers restent dans ce navigateur. Aucune donnée n'est envoyée
          vers internet.
        </div>
      </section>
    </div>
  );
}

function Filters({ filters, setFilters, model }) {
  const [advanced, setAdvanced] = useState(false);
  const activeCount = Object.values(filters).filter(Boolean).length;
  return (
    <section className="filter-bar">
      <div className="filter-title">
        <Filter size={17} />
        <span>Filtres</span>
        {activeCount > 0 && <b>{activeCount}</b>}
      </div>
      <label>
        <span>Mois</span>
        <select
          aria-label="Filtrer par mois"
          value={filters.month}
          onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}
        >
          <option value="">Toute la période</option>
          {model.months.map((month) => (
            <option key={month} value={month}>
              {monthLabel(month)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>SARL</span>
        <select
          aria-label="Filtrer par SARL"
          value={filters.sarl}
          onChange={(e) => setFilters((f) => ({ ...f, sarl: e.target.value }))}
        >
          <option value="">Toutes les SARL</option>
          {model.sarls.map((sarl) => (
            <option key={sarl}>{sarl}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Magasin</span>
        <select
          aria-label="Filtrer par magasin"
          value={filters.warehouse}
          onChange={(e) =>
            setFilters((f) => ({ ...f, warehouse: e.target.value }))
          }
        >
          <option value="">Tous les magasins</option>
          {model.warehouses.map((warehouse) => (
            <option key={warehouse}>{warehouse}</option>
          ))}
        </select>
      </label>
      <label className="search-field">
        <span>Article</span>
        <div>
          <Search size={16} />
          <input
            aria-label="Rechercher un article"
            value={filters.search}
            placeholder="Nom ou code article"
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
          />
        </div>
      </label>
      <button
        className={`advanced-button ${advanced ? "active" : ""}`}
        onClick={() => setAdvanced((value) => !value)}
      >
        <SlidersHorizontal size={15} /> Plus
      </button>
      {activeCount > 0 && (
        <button
          className="clear-filter"
          onClick={() =>
            setFilters({
              month: "",
              date: "",
              sarl: "",
              warehouse: "",
              location: "",
              family: "",
              requester: "",
              costCenter: "",
              project: "",
              search: "",
            })
          }
        >
          <X size={14} /> Effacer
        </button>
      )}
      {advanced && (
        <div className="advanced-filters">
          <label>
            <span>Date exacte</span>
            <input
              type="date"
              aria-label="Filtrer par date"
              value={filters.date}
              onChange={(e) =>
                setFilters((f) => ({ ...f, date: e.target.value }))
              }
            />
          </label>
          <label>
            <span>Gisement</span>
            <select
              value={filters.location}
              onChange={(e) =>
                setFilters((f) => ({ ...f, location: e.target.value }))
              }
            >
              <option value="">Tous les gisements</option>
              {model.locations.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Famille</span>
            <select
              value={filters.family}
              onChange={(e) =>
                setFilters((f) => ({ ...f, family: e.target.value }))
              }
            >
              <option value="">Toutes les familles</option>
              {model.families.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Demandeur</span>
            <select
              value={filters.requester}
              onChange={(e) =>
                setFilters((f) => ({ ...f, requester: e.target.value }))
              }
            >
              <option value="">Tous les demandeurs</option>
              {model.requesters.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Centre de coût</span>
            <select
              value={filters.costCenter}
              onChange={(e) =>
                setFilters((f) => ({ ...f, costCenter: e.target.value }))
              }
            >
              <option value="">Tous les centres</option>
              {model.costCenters.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Projet</span>
            <select
              value={filters.project}
              onChange={(e) =>
                setFilters((f) => ({ ...f, project: e.target.value }))
              }
            >
              <option value="">Tous les projets</option>
              {model.projects.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function Overview({ model, filters }) {
  const topArticle = model.articles[0];
  const focus = model.purchases.find((row) => row.recommended > 0);
  return (
    <>
      <section className="insight-banner">
        <div>
          <div className="eyebrow">
            <Sparkles size={15} /> Point de décision
          </div>
          <h2>
            {focus
              ? `${focus.article} nécessite une préparation d'achat`
              : "Le stock couvre la demande estimée"}
          </h2>
          <p>
            {focus
              ? `${focus.designation} · ${formatNumber(focus.recommended)} ${focus.unit || "unités"} recommandées, principalement pour ${focus.mainSarl}.`
              : "Aucun besoin d’achat calculé avec les filtres actuels."}
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            document.querySelector('[data-tab="purchases"]')?.click()
          }
        >
          Voir le plan d'achat <ChevronRight size={17} />
        </button>
      </section>

      <section className="stats-grid">
        <StatCard
          icon={TrendingUp}
          label="Quantité consommée"
          value={formatNumber(model.kpis.consumptionQty, 1)}
          note={
            filters.month ? monthLabel(filters.month) : "Période sélectionnée"
          }
          tone="peach"
        />
        <StatCard
          icon={CircleDollarSign}
          label="Valeur consommée"
          value={formatMoney(model.kpis.consumptionValue)}
          note="Montant des lignes"
        />
        <StatCard
          icon={Boxes}
          label="Stock disponible"
          value={formatNumber(model.kpis.stockQty, 1)}
          note={`${formatMoney(model.kpis.stockValue)} en valeur`}
          tone="green"
        />
        <StatCard
          icon={ShoppingCart}
          label="Articles à acheter"
          value={formatNumber(model.kpis.purchaseArticles)}
          note={`Budget connu ${formatMoney(model.kpis.purchaseBudget)}`}
          tone="gold"
        />
        <StatCard
          icon={PackageCheck}
          label="Articles consommés"
          value={formatNumber(model.kpis.activeArticles)}
          note={`${formatNumber(model.kpis.documents)} bons de sortie`}
        />
      </section>

      <section className="dashboard-grid two-one">
        <article className="panel chart-panel">
          <header>
            <div>
              <span className="section-kicker">Mouvement</span>
              <h3>Consommation mensuelle</h3>
            </div>
            <div className="legend-dot">Quantité</div>
          </header>
          <div className="chart-area">
            {model.trend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={model.trend}
                  margin={{ left: -18, right: 8, top: 10 }}
                >
                  <defs>
                    <linearGradient
                      id="qtyGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#c99715"
                        stopOpacity={0.35}
                      />
                      <stop offset="100%" stopColor="#c99715" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="#e5e0d6"
                    strokeDasharray="3 5"
                  />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="quantity"
                    name="Quantité"
                    stroke="#c99715"
                    strokeWidth={3}
                    fill="url(#qtyGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Aucune consommation" />
            )}
          </div>
        </article>
        <article className="panel">
          <header>
            <div>
              <span className="section-kicker">Répartition</span>
              <h3>Consommation par SARL</h3>
            </div>
          </header>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={model.bySarl}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {model.bySarl.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-total">
              <strong>{formatNumber(model.kpis.consumptionQty, 1)}</strong>
              <span>unités</span>
            </div>
          </div>
          <div className="mini-legend">
            {model.bySarl.slice(0, 5).map((item, index) => (
              <div key={item.name}>
                <i style={{ background: COLORS[index % COLORS.length] }} />
                <span>{item.name}</span>
                <b>{formatNumber(item.value, 1)}</b>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid equal">
        <article className="panel chart-panel">
          <header>
            <div>
              <span className="section-kicker">Concentration</span>
              <h3>Articles les plus consommés</h3>
            </div>
            <span className="panel-note">Top 8 · quantité</span>
          </header>
          <div className="chart-area tall">
            {model.articles.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={model.articles.slice(0, 8)}
                  margin={{ left: 10, right: 18 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    stroke="#e5e0d6"
                    strokeDasharray="3 5"
                  />
                  <XAxis type="number" axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="designation"
                    width={175}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      value.length > 27 ? `${value.slice(0, 27)}…` : value
                    }
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="quantity"
                    name="Quantité"
                    fill="#7a3024"
                    radius={[0, 7, 7, 0]}
                    barSize={17}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Aucun article" />
            )}
          </div>
        </article>
        <article className="panel table-panel">
          <header>
            <div>
              <span className="section-kicker">Lecture opérationnelle</span>
              <h3>Qui consomme quoi ?</h3>
            </div>
            <span className="panel-note">SARL principale</span>
          </header>
          <div className="compact-list">
            {model.articles.slice(0, 8).map((item, index) => (
              <div className="compact-row" key={item.article}>
                <span className="rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{item.designation}</strong>
                  <small>
                    {item.article} · {item.mainSarl}
                  </small>
                </div>
                <b>{formatNumber(item.quantity, 1)}</b>
              </div>
            ))}
            {!model.articles.length && (
              <EmptyState text="Aucun résultat pour ces filtres" />
            )}
          </div>
        </article>
      </section>

      <section className="focus-strip">
        <div>
          <span>Article dominant</span>
          <strong>{topArticle?.designation || "—"}</strong>
          <small>
            {topArticle
              ? `${formatNumber(topArticle.quantity, 1)} unités · ${topArticle.mainSarl}`
              : "Aucune donnée"}
          </small>
        </div>
        <div>
          <span>Point qualité</span>
          <strong>
            {formatNumber(
              model.anomalies.cards.reduce((sum, item) => sum + item.count, 0),
            )}{" "}
            alertes
          </strong>
          <small>Les coûts à zéro dominent les anomalies</small>
        </div>
        <div>
          <span>Couverture achat</span>
          <strong>
            {formatNumber(
              model.purchases.filter((row) => row.recommended === 0).length,
            )}{" "}
            articles couverts
          </strong>
          <small>Selon la demande récente</small>
        </div>
      </section>
    </>
  );
}

function RankChart({
  kicker,
  title,
  subtitle,
  data,
  dataKey = "quantity",
  nameKey = "name",
  color = "#7a3024",
  limit = 8,
}) {
  const chartData = data.slice(0, limit);
  return (
    <article className="panel chart-panel">
      <header>
        <div>
          <span className="section-kicker">{kicker}</span>
          <h3>{title}</h3>
        </div>
        <span className="panel-note">{subtitle}</span>
      </header>
      <div className="chart-area tall">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ left: 12, right: 20 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="#e5e0d6"
                strokeDasharray="3 5"
              />
              <XAxis type="number" axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey={nameKey}
                width={185}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) =>
                  String(value).length > 29
                    ? `${String(value).slice(0, 29)}…`
                    : value
                }
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey={dataKey}
                name={dataKey === "amount" ? "Montant" : "Quantité"}
                fill={color}
                radius={[0, 7, 7, 0]}
                barSize={17}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Aucune donnée pour ces filtres" />
        )}
      </div>
    </article>
  );
}

function MonthlyChangeAnalysis({ model }) {
  const comparison = model.monthlyChange;
  const chartData = comparison.articles.slice(0, 8);
  const pct = comparison.changePct;
  const currentLabel = comparison.currentMonth
    ? monthLabel(comparison.currentMonth)
    : "Mois actuel";
  const previousLabel = comparison.previousMonth
    ? monthLabel(comparison.previousMonth)
    : "Mois précédent";
  return (
    <section className="panel monthly-change-panel">
      <header>
        <div>
          <span className="section-kicker">Évolution mensuelle</span>
          <h3>Comparaison avec le mois précédent</h3>
        </div>
        <span
          className={`change-badge ${comparison.delta >= 0 ? "up" : "down"}`}
        >
          {pct === null
            ? "N/D"
            : `${comparison.delta >= 0 ? "+" : ""}${formatNumber(pct, 1)}%`}
        </span>
      </header>
      <div className="comparison-summary">
        <div>
          <span>{previousLabel}</span>
          <strong>{formatNumber(comparison.previousQty, 1)}</strong>
          <small>unités</small>
        </div>
        <div className="comparison-arrow">→</div>
        <div>
          <span>{currentLabel}</span>
          <strong>{formatNumber(comparison.currentQty, 1)}</strong>
          <small>unités</small>
        </div>
        <div className="comparison-delta">
          <span>Variation</span>
          <strong>
            {comparison.delta >= 0 ? "+" : ""}
            {formatNumber(comparison.delta, 1)}
          </strong>
          <small>
            {comparison.cutoffDay < 31
              ? `jours 1 à ${comparison.cutoffDay} comparés`
              : "mois complets"}
          </small>
        </div>
      </div>
      <div className="chart-area tall">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ left: 14, right: 18 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="#e5e0d6"
                strokeDasharray="3 5"
              />
              <XAxis type="number" axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="designation"
                width={190}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) =>
                  value.length > 30 ? `${value.slice(0, 30)}…` : value
                }
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="previous"
                name={previousLabel}
                fill="#d8b75a"
                radius={[0, 6, 6, 0]}
                barSize={9}
              />
              <Bar
                dataKey="current"
                name={currentLabel}
                fill="#7a3024"
                radius={[0, 6, 6, 0]}
                barSize={9}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Pas assez de données pour comparer les mois" />
        )}
      </div>
    </section>
  );
}

function ConsumptionCalendar({ model }) {
  const calendar = model.calendar;
  return (
    <section className="dashboard-grid equal calendar-section">
      <article className="panel calendar-panel">
        <header>
          <div>
            <span className="section-kicker">Calendrier de consommation</span>
            <h3>Activité quotidienne — {calendar.label}</h3>
          </div>
          <span className="panel-note">Intensité par quantité</span>
        </header>
        <div className="calendar-weekdays">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {Array.from({ length: calendar.firstWeekday }, (_, index) => (
            <span className="calendar-blank" key={`blank-${index}`} />
          ))}
          {calendar.days.map((day) => {
            const intensity = calendar.maxQuantity
              ? day.quantity / calendar.maxQuantity
              : 0;
            const alpha = day.quantity ? 0.13 + intensity * 0.75 : 0.035;
            return (
              <div
                className={`calendar-day ${day.quantity ? "active" : ""}`}
                key={day.date}
                style={{
                  backgroundColor: `rgba(123, 47, 36, ${alpha})`,
                  color: intensity > 0.48 ? "#fffaf2" : "#5b4f47",
                }}
                title={`${day.date} · ${formatNumber(day.quantity, 1)} unités · ${day.documents} bons`}
              >
                <span>{day.day}</span>
                {day.quantity > 0 && (
                  <strong>
                    {formatNumber(day.quantity, day.quantity < 10 ? 1 : 0)}
                  </strong>
                )}
              </div>
            );
          })}
        </div>
        <div className="heat-legend">
          <span>Faible</span>
          {[0.08, 0.22, 0.4, 0.6, 0.82].map((alpha) => (
            <i
              key={alpha}
              style={{ backgroundColor: `rgba(123,47,36,${alpha})` }}
            />
          ))}
          <span>Élevée</span>
        </div>
      </article>
      <article className="panel chart-panel">
        <header>
          <div>
            <span className="section-kicker">Rythme hebdomadaire</span>
            <h3>Consommation par jour de semaine</h3>
          </div>
          <span className="panel-note">Filtres actifs · quantité</span>
        </header>
        <div className="chart-area tall">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={calendar.byWeekday}
              margin={{ left: -12, right: 8, top: 12 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="#e5e0d6"
                strokeDasharray="3 5"
              />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="quantity"
                name="Quantité"
                fill="#c99715"
                radius={[7, 7, 0, 0]}
                barSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}

function DemandFrequencyAnalysis({ model }) {
  const data = model.demandFrequency.slice(0, 10);
  const lastRequest = model.demandFrequency
    .map((row) => row.lastDate)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <>
      <section className="dashboard-grid equal frequency-section">
        <article className="panel chart-panel">
          <header>
            <div>
              <span className="section-kicker">Fréquence des demandes</span>
              <h3>Articles les plus souvent demandés</h3>
            </div>
            <span className="panel-note">Bons de sortie distincts</span>
          </header>
          <div className="chart-area tall">
            {data.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={data}
                  margin={{ left: 12, right: 18 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    stroke="#e5e0d6"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="designation"
                    width={190}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      value.length > 30 ? `${value.slice(0, 30)}…` : value
                    }
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="requests"
                    name="Demandes"
                    fill="#7a3024"
                    radius={[0, 7, 7, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Aucune demande pour ces filtres" />
            )}
          </div>
        </article>
        <article className="panel frequency-summary">
          <header>
            <div>
              <span className="section-kicker">Cadence</span>
              <h3>Lecture opérationnelle</h3>
            </div>
            <Repeat2 size={18} />
          </header>
          <div className="frequency-kpis">
            <div>
              <Repeat2 />
              <span>Demandes / article</span>
              <strong>
                {formatNumber(model.kpis.averageRequestsPerArticle, 1)}
              </strong>
            </div>
            <div>
              <Clock3 />
              <span>Dernière demande</span>
              <strong>
                {lastRequest
                  ? new Intl.DateTimeFormat("fr-FR").format(
                      new Date(`${lastRequest}T12:00:00`),
                    )
                  : "—"}
              </strong>
            </div>
          </div>
          <div className="frequency-list">
            {data.slice(0, 6).map((row) => (
              <div key={row.article}>
                <div>
                  <strong>{row.designation}</strong>
                  <small>
                    {row.cadence} ·{" "}
                    {row.averageGapDays === null
                      ? "une seule date"
                      : `tous les ${formatNumber(row.averageGapDays, 1)} jours`}
                  </small>
                </div>
                <b>
                  {row.requests}
                  <small>demandes</small>
                </b>
              </div>
            ))}
          </div>
        </article>
      </section>
      <CollapsiblePanel
        kicker="Détail de cadence"
        title="Fréquence par article"
        meta={`${formatNumber(model.demandFrequency.length)} articles`}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Cadence</th>
                <th>Demandes</th>
                <th>Jours actifs</th>
                <th>Qté totale</th>
                <th>Qté / demande</th>
                <th>Intervalle moyen</th>
                <th>Dernière demande</th>
                <th>SARL servies</th>
              </tr>
            </thead>
            <tbody>
              {model.demandFrequency.map((row) => (
                <tr key={row.article}>
                  <td>
                    <strong>{row.designation}</strong>
                    <small>{row.article}</small>
                  </td>
                  <td>
                    <span
                      className={`cadence ${row.cadence
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")}`}
                    >
                      {row.cadence}
                    </span>
                  </td>
                  <td>{row.requests}</td>
                  <td>{row.activeDays}</td>
                  <td>{formatNumber(row.quantity, 1)}</td>
                  <td>{formatNumber(row.averageQty, 1)}</td>
                  <td>
                    {row.averageGapDays === null
                      ? "—"
                      : `${formatNumber(row.averageGapDays, 1)} jours`}
                  </td>
                  <td>{row.lastDate}</td>
                  <td>{row.sarlCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!model.demandFrequency.length && (
            <EmptyState text="Aucune fréquence calculable" />
          )}
        </div>
      </CollapsiblePanel>
    </>
  );
}

function ConsumptionAnalysis({ model, filters }) {
  const period =
    filters.date ||
    (filters.month ? monthLabel(filters.month) : "Toute la période");
  const top = model.articles[0];
  const articleSummary = useMemo(() => {
    const grouped = new Map();
    model.consumption.forEach((row) => {
      const key = `${row.article}::${row.unit || ""}`;
      const item = grouped.get(key) || {
        article: row.article,
        designation: row.designation,
        unit: row.unit,
        quantity: 0,
        amount: 0,
        documents: new Set(),
        sarls: new Map(),
      };
      item.quantity += row.quantity;
      item.amount += row.amount;
      if (row.document) item.documents.add(row.document);
      item.sarls.set(
        row.sarl || "Non renseignée",
        (item.sarls.get(row.sarl || "Non renseignée") || 0) + row.quantity,
      );
      grouped.set(key, item);
    });
    return [...grouped.values()]
      .map((item) => ({
        ...item,
        documents: item.documents.size,
        mainSarl:
          [...item.sarls.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [model.consumption]);
  const summaryExportRows = articleSummary.map((row, index) => ({
    Rang: index + 1,
    Code_article: row.article,
    Désignation: row.designation,
    Unité: row.unit,
    Quantité_totale: row.quantity,
    Montant_total: row.amount,
    Documents_sortie: row.documents,
    SARL_principale: row.mainSarl,
  }));
  return (
    <>
      <section className="section-heading">
        <div className="eyebrow">
          <TrendingUp size={15} /> Analyse des sorties
        </div>
        <h2>Comprendre chaque axe de consommation</h2>
        <p>
          Volume, valeur, rythme journalier, article, SARL, demandeur, centre de
          coût, projet et gisement — tous alignés sur les filtres actifs.
        </p>
      </section>
      <section className="stats-grid four">
        <StatCard
          icon={TrendingUp}
          label="Consommation"
          value={formatNumber(model.kpis.consumptionQty, 1)}
          note={period}
          tone="peach"
        />
        <StatCard
          icon={CalendarDays}
          label="Moyenne / jour actif"
          value={formatNumber(model.kpis.averageDaily, 1)}
          note={`${model.daily.length} jours avec sortie`}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Valeur moyenne / ligne"
          value={formatMoney(model.kpis.averageLineValue)}
          note={`${formatNumber(model.consumption.length)} lignes`}
        />
        <StatCard
          icon={PackageCheck}
          label="Article principal"
          value={top?.designation || "—"}
          note={
            top
              ? `${formatNumber(top.quantity, 1)} unités · ${top.mainSarl}`
              : "Aucune donnée"
          }
          tone="green"
        />
      </section>
      <section className="dashboard-grid equal">
        <article className="panel chart-panel wide-panel">
          <header>
            <div>
              <span className="section-kicker">Répartition journalière</span>
              <h3>Quantités consommées par jour</h3>
            </div>
            <span className="panel-note">{period} · jours actifs</span>
          </header>
          <div className="chart-area tall">
            {model.daily.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={model.daily}
                  margin={{ left: -10, right: 14, top: 12 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#e5e0d6"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={26}
                  />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="quantity"
                    name="Quantité"
                    stroke="#c99715"
                    strokeWidth={2.5}
                    fill="#c9971529"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Aucune sortie journalière" />
            )}
          </div>
        </article>
        <RankChart
          kicker="Articles"
          title="Articles les plus consommés"
          subtitle="Noms des articles · quantité"
          data={model.articles}
          nameKey="designation"
          color="#7a3024"
          limit={10}
        />
      </section>
      <MonthlyChangeAnalysis model={model} />
      <ConsumptionCalendar model={model} />
      <DemandFrequencyAnalysis model={model} />
      <section className="dashboard-grid equal">
        <RankChart
          kicker="Personnes"
          title="Consommation par demandeur"
          subtitle="Top 8 · quantité"
          data={model.byRequester}
          color="#c99715"
        />
        <RankChart
          kicker="Organisation"
          title="Consommation par centre de coût"
          subtitle="Quantité"
          data={model.byCostCenter}
          color="#7a3024"
        />
        <RankChart
          kicker="Affectation"
          title="Consommation par projet"
          subtitle="Quantité"
          data={model.byProject}
          color="#d8b75a"
        />
        <RankChart
          kicker="Emplacement"
          title="Consommation par gisement"
          subtitle="Quantité"
          data={model.byLocation}
          color="#7291a7"
        />
      </section>
      <CollapsiblePanel
        kicker="Drill-down"
        title="Synthèse des sorties par article"
        meta={`${formatNumber(articleSummary.length)} articles · ${formatNumber(model.consumption.length)} lignes`}
        action={
          <>
            <button
              className="secondary-button"
              disabled={!articleSummary.length}
              onClick={() =>
                exportCsv(
                  summaryExportRows,
                  "synthese-sorties-par-article-abidi.csv",
                )
              }
            >
              <ArrowDownToLine size={16} /> Exporter synthèse
            </button>
            <button
              className="secondary-button"
              disabled={!model.consumption.length}
              onClick={() =>
                exportCsv(
                  consumptionExportRows(model.consumption),
                  "detail-sorties-abidi.csv",
                )
              }
            >
              <FileSpreadsheet size={16} /> Détail lignes
            </button>
          </>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rang</th>
                <th>Article</th>
                <th>U.M.</th>
                <th>Quantité totale</th>
                <th>Montant total</th>
                <th>Bons de sortie</th>
                <th>SARL principale</th>
              </tr>
            </thead>
            <tbody>
              {articleSummary.map((row, index) => (
                <tr key={`${row.article}-${row.unit}`}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{row.designation}</strong>
                    <small>{row.article}</small>
                  </td>
                  <td>{row.unit || "—"}</td>
                  <td>
                    <strong>{formatNumber(row.quantity, 1)}</strong>
                  </td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{formatNumber(row.documents)}</td>
                  <td>{row.mainSarl}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!articleSummary.length && (
            <EmptyState text="Aucune ligne de sortie" />
          )}
        </div>
      </CollapsiblePanel>
    </>
  );
}

function SarlComparison({ model, filters }) {
  const comparison = model.sarlComparison;
  const topSarl = comparison.rankings[0];
  const period =
    filters.date ||
    (filters.month ? monthLabel(filters.month) : "Toute la période");
  return (
    <>
      <section className="section-heading">
        <div className="eyebrow">
          <GitCompareArrows size={15} /> Comparaison SARL
        </div>
        <h2>Comparer les volumes, les tendances et les articles</h2>
        <p>
          Classement opérationnel des groupes selon les sorties enregistrées.
          Les valeurs sont absolues et suivent les filtres actifs.
        </p>
      </section>

      <section className="stats-grid four">
        <StatCard
          icon={TrendingUp}
          label="SARL principale"
          value={topSarl?.sarl || "—"}
          note={
            topSarl
              ? `${formatNumber(topSarl.quantity, 1)} unités · ${formatNumber(topSarl.share, 1)}% du total`
              : "Aucune donnée"
          }
          tone="peach"
        />
        <StatCard
          icon={Users}
          label="Groupes comparés"
          value={formatNumber(comparison.rankings.length)}
          note={period}
        />
        <StatCard
          icon={PackageCheck}
          label="Articles distincts"
          value={formatNumber(model.kpis.activeArticles)}
          note="Dans la sélection"
          tone="green"
        />
        <StatCard
          icon={CircleDollarSign}
          label="Valeur consommée"
          value={formatMoney(model.kpis.consumptionValue)}
          note="Somme des lignes de sortie"
          tone="gold"
        />
      </section>

      <section className="dashboard-grid two-one sarl-ranking-grid">
        <article className="panel chart-panel">
          <header>
            <div>
              <span className="section-kicker">Classement</span>
              <h3>Consommation totale par SARL</h3>
            </div>
            <span className="panel-note">{period} · quantité</span>
          </header>
          <div className="chart-area tall">
            {comparison.rankings.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={comparison.rankings}
                  margin={{ left: 10, right: 20 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    stroke="#e5e0d6"
                    strokeDasharray="3 5"
                  />
                  <XAxis type="number" axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="sarl"
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="quantity"
                    name="Quantité"
                    fill="#7a3024"
                    radius={[0, 8, 8, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Aucune SARL pour ces filtres" />
            )}
          </div>
        </article>
        <article className="panel sarl-scorecard">
          <header>
            <div>
              <span className="section-kicker">Indicateurs</span>
              <h3>Scorecard SARL</h3>
            </div>
            <span className="panel-note">Quantité · valeur · activité</span>
          </header>
          <div className="sarl-score-list">
            {comparison.rankings.map((row, index) => (
              <div key={row.sarl}>
                <span className="rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{row.sarl}</strong>
                  <small>
                    {row.documents} bons · {row.articles} articles ·{" "}
                    {formatNumber(row.averagePerDocument, 1)} unités/bon
                  </small>
                </div>
                <div className="sarl-score-values">
                  <b>{formatNumber(row.quantity, 1)}</b>
                  <small>
                    {formatMoney(row.amount)} · {formatNumber(row.share, 1)}%
                  </small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel chart-panel sarl-trend-panel">
        <header>
          <div>
            <span className="section-kicker">Évolution mensuelle</span>
            <h3>Consommation mensuelle par SARL</h3>
          </div>
          <span className="panel-note">Historique disponible · quantité</span>
        </header>
        <div className="sarl-legend">
          {comparison.trendNames.map((sarl, index) => (
            <span key={sarl}>
              <i style={{ background: COLORS[index % COLORS.length] }} />
              {sarl}
            </span>
          ))}
        </div>
        <div className="chart-area tall">
          {comparison.monthlyTrend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={comparison.monthlyTrend}
                margin={{ left: -8, right: 18, top: 12 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e5e0d6"
                  strokeDasharray="3 5"
                />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                {comparison.trendNames.map((sarl, index) => (
                  <Line
                    key={sarl}
                    type="monotone"
                    dataKey={sarl}
                    name={sarl}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2.2}
                    dot={{ r: 2.5, fill: "#fffdf9", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState text="Historique mensuel indisponible" />
          )}
        </div>
      </section>

      <section className="panel sarl-mix-panel">
        <header>
          <div>
            <span className="section-kicker">Mix articles</span>
            <h3>Articles dominants par SARL</h3>
          </div>
          <span className="panel-note">
            Top 5 · part de la consommation SARL
          </span>
        </header>
        <div className="sarl-mix-grid">
          {comparison.articleMix.map((group) => (
            <article key={group.sarl} className="sarl-mix-card">
              <div className="sarl-mix-title">
                <div>
                  <strong>{group.sarl}</strong>
                  <small>{formatNumber(group.total, 1)} unités</small>
                </div>
                <span>{group.articles.length} principaux</span>
              </div>
              <div className="sarl-mix-list">
                {group.articles.map((article, index) => (
                  <div key={article.article}>
                    <div>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong title={article.designation}>
                        {article.designation}
                      </strong>
                      <b>{formatNumber(article.quantity, 1)}</b>
                    </div>
                    <div className="mix-track">
                      <i
                        style={{
                          width: `${Math.min(100, Math.max(0, article.share))}%`,
                        }}
                      />
                    </div>
                    <small>
                      {formatNumber(article.share, 1)}% · {article.documents}{" "}
                      bons
                    </small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel sarl-heatmap-panel">
        <header>
          <div>
            <span className="section-kicker">Matrice SARL × article</span>
            <h3>Qui consomme les articles principaux ?</h3>
          </div>
          <span className="panel-note">Top 12 articles · quantité</span>
        </header>
        {comparison.heatmap.articles.length ? (
          <div className="sarl-heatmap-scroll">
            <div
              className="sarl-heatmap"
              style={{
                gridTemplateColumns: `145px repeat(${comparison.heatmap.articles.length}, minmax(78px, 1fr))`,
              }}
            >
              <div className="heat-corner">SARL / article</div>
              {comparison.heatmap.articles.map((article) => (
                <div
                  className="heat-article"
                  key={article.article}
                  title={article.designation}
                >
                  <strong>{article.designation}</strong>
                  <small>{article.article}</small>
                </div>
              ))}
              {comparison.heatmap.rows.flatMap((row) => [
                <div className="heat-sarl" key={`${row.sarl}-label`}>
                  <strong>{row.sarl}</strong>
                  <small>{formatNumber(row.total, 1)} unités</small>
                </div>,
                ...row.values.map((value) => {
                  const intensity = comparison.heatmap.maxQuantity
                    ? Math.max(0, value.quantity) /
                      comparison.heatmap.maxQuantity
                    : 0;
                  const alpha =
                    value.quantity > 0 ? 0.12 + intensity * 0.78 : 0.035;
                  return (
                    <div
                      className="heat-cell"
                      key={`${row.sarl}-${value.article}`}
                      style={{
                        backgroundColor: `rgba(123,47,36,${alpha})`,
                        color: intensity > 0.44 ? "#fffaf2" : "#5d5048",
                      }}
                      title={`${row.sarl} · ${value.designation} · ${formatNumber(value.quantity, 1)} unités`}
                    >
                      {value.quantity ? formatNumber(value.quantity, 1) : "—"}
                    </div>
                  );
                }),
              ])}
            </div>
          </div>
        ) : (
          <EmptyState text="Aucune donnée pour construire la matrice" />
        )}
      </section>
    </>
  );
}

function StockAnalysis({ model }) {
  return (
    <>
      <section className="section-heading">
        <div className="eyebrow">
          <Boxes size={15} /> Analyse du stock
        </div>
        <h2>Valeur, localisation et immobilisation du stock</h2>
        <p>
          Lecture par magasin, famille, gisement et article, avec détection du
          stock sans consommation sur la période filtrée.
        </p>
      </section>
      <section className="stats-grid four">
        <StatCard
          icon={Boxes}
          label="Quantité en stock"
          value={formatNumber(model.kpis.stockQty, 1)}
          note={`${formatNumber(model.stockArticles.length)} articles`}
          tone="green"
        />
        <StatCard
          icon={CircleDollarSign}
          label="Valeur du stock"
          value={formatMoney(model.kpis.stockValue)}
          note="Sur les coûts renseignés"
        />
        <StatCard
          icon={Layers3}
          label="Stock sans sortie"
          value={formatMoney(model.kpis.inactiveStockValue)}
          note={`${formatNumber(model.inactiveStock.length)} articles sur la période`}
          tone="gold"
        />
        <StatCard
          icon={AlertTriangle}
          label="Ruptures consommées"
          value={formatNumber(model.kpis.zeroStockConsumed)}
          note="Stock ≤ 0 avec consommation"
          tone="peach"
        />
      </section>
      <section className="dashboard-grid equal">
        <RankChart
          kicker="Magasins"
          title="Valeur de stock par magasin"
          subtitle="Montant"
          data={model.stockByWarehouse}
          dataKey="amount"
          color="#7a3024"
        />
        <RankChart
          kicker="Familles"
          title="Valeur de stock par famille"
          subtitle="Montant"
          data={model.stockByFamily}
          dataKey="amount"
          color="#d8b75a"
        />
        <RankChart
          kicker="Gisements"
          title="Quantité par gisement"
          subtitle="Quantité"
          data={model.stockByLocation}
          color="#7291a7"
        />
        <RankChart
          kicker="Articles"
          title="Articles à plus forte valeur"
          subtitle="Noms des articles · montant"
          data={model.stockArticles}
          nameKey="designation"
          dataKey="amount"
          color="#c99715"
          limit={10}
        />
      </section>
      <CollapsiblePanel
        kicker="Capital immobilisé"
        title="Stock positif sans consommation"
        meta="Dans la période et les segments filtrés"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Quantité</th>
                <th>Valeur</th>
                <th>Coût unitaire</th>
                <th>Action analyste</th>
              </tr>
            </thead>
            <tbody>
              {model.inactiveStock.slice(0, 100).map((row) => (
                <tr key={row.article}>
                  <td>
                    <strong>{row.designation}</strong>
                    <small>{row.article}</small>
                  </td>
                  <td>{formatNumber(row.quantity, 1)}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{formatMoney(row.unitCost)}</td>
                  <td>
                    <span className="status warning">Vérifier besoin</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!model.inactiveStock.length && (
            <EmptyState text="Aucun stock inactif avec ces filtres" />
          )}
        </div>
      </CollapsiblePanel>
      <CollapsiblePanel
        kicker="Inventaire"
        title="Détail des positions de stock"
        meta={`${formatNumber(model.stock.length)} positions`}
        className="stock-detail"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Réf. constructeur</th>
                <th>Réf. fournisseur</th>
                <th>Magasin</th>
                <th>Gisement</th>
                <th>Lot</th>
                <th>Expiration</th>
                <th>U.M.</th>
                <th>Emballage</th>
                <th>Coefficient</th>
                <th>Quantité</th>
                <th>Coût unitaire</th>
                <th>Montant</th>
                <th>Bloqué</th>
                <th>Famille</th>
                <th>Sous-famille</th>
                <th>Qté interne</th>
                <th>Montant interne</th>
                <th>Groupe comptable</th>
                <th>Fabriqué le</th>
                <th>Non stock</th>
                <th>Mouvement</th>
                <th>Document mvt</th>
                <th>Date mvt</th>
                <th>Qté calculée</th>
              </tr>
            </thead>
            <tbody>
              {model.stock.slice(0, 300).map((row, index) => (
                <tr
                  key={`${row.article}-${row.warehouse}-${row.location}-${row.lot}-${index}`}
                >
                  <td>
                    <strong>{row.designation}</strong>
                    <small>{row.article}</small>
                  </td>
                  <td>{row.manufacturerRef || "—"}</td>
                  <td>{row.supplierRef || "—"}</td>
                  <td>{row.warehouse}</td>
                  <td>{row.location}</td>
                  <td>{row.lot}</td>
                  <td>{row.expiry || "—"}</td>
                  <td>{row.unit}</td>
                  <td>{row.packaging}</td>
                  <td>{formatNumber(row.coefficient, 2)}</td>
                  <td>{formatNumber(row.quantity, 1)}</td>
                  <td>{formatMoney(row.unitCost)}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{row.blocked ? "Oui" : "Non"}</td>
                  <td>{row.familyLabel || row.family}</td>
                  <td>{row.subfamilyLabel || row.subfamily}</td>
                  <td>{formatNumber(row.internalQty, 1)}</td>
                  <td>{formatMoney(row.internalAmount)}</td>
                  <td>
                    {row.accountingGroupLabel || row.accountingGroup || "—"}
                  </td>
                  <td>{row.manufacturedDate || "—"}</td>
                  <td>{row.nonStock || "—"}</td>
                  <td>{row.movement || "—"}</td>
                  <td>{row.movementDocument || "—"}</td>
                  <td>{row.movementDate || "—"}</td>
                  <td>{formatNumber(row.calculatedQuantity, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>
    </>
  );
}

function Purchases({ model }) {
  const rows = model.purchases.filter((row) => row.recommended > 0);
  const history = model.purchases[0]?.historyMonths ?? [];
  const exportRows = rows.map((row) => ({
    Article: row.article,
    Désignation: row.designation,
    SARL: row.mainSarl,
    Stock: row.stock.toFixed(2),
    Prévision: row.forecast.toFixed(2),
    Sécurité: row.safety.toFixed(2),
    Quantité_recommandée: row.recommended,
    Coût_unitaire: row.unitCost.toFixed(2),
    Budget_estimé: row.estimatedCost.toFixed(2),
    Urgence: row.urgency,
  }));
  return (
    <>
      <section className="purchase-hero">
        <div>
          <div className="eyebrow">
            <Gauge size={15} /> Prévision du prochain mois
          </div>
          <h2>Préparer un achat groupé avant la rupture</h2>
          <p>
            Demande pondérée sur{" "}
            {history.map(monthLabel).join(" · ") || "les mois disponibles"},
            plus stock de sécurité, moins stock actuel.
          </p>
        </div>
        <div className="purchase-total">
          <span>Budget estimé connu</span>
          <strong>{formatMoney(model.kpis.purchaseBudget)}</strong>
          <small>Les articles sans coût sont exclus du budget</small>
        </div>
      </section>
      <section className="method-grid">
        <div>
          <span>01</span>
          <strong>Demande récente</strong>
          <small>20% / 30% / 50%, priorité au dernier mois complet.</small>
        </div>
        <div>
          <span>02</span>
          <strong>Réserve de sécurité</strong>
          <small>20% minimum, renforcée si la consommation varie.</small>
        </div>
        <div>
          <span>03</span>
          <strong>Besoin net</strong>
          <small>Prévision + sécurité − stock disponible.</small>
        </div>
      </section>
      <CollapsiblePanel
        kicker="Liste de travail"
        title="Plan d'achat recommandé"
        meta={`${formatNumber(rows.length)} articles`}
        action={
          <button
            className="secondary-button"
            onClick={() => exportCsv(exportRows, "plan-achat-abidi.csv")}
          >
            <ArrowDownToLine size={16} /> Exporter CSV
          </button>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Priorité</th>
                <th>Article</th>
                <th>SARL principale</th>
                <th>Stock</th>
                <th>Prévision</th>
                <th>Sécurité</th>
                <th>À acheter</th>
                <th>Budget estimé</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row) => (
                <tr key={row.article}>
                  <td>
                    <span
                      className={`status ${row.urgency === "Critique" ? "critical" : "warning"}`}
                    >
                      {row.urgency}
                    </span>
                  </td>
                  <td>
                    <strong>{row.designation}</strong>
                    <small>{row.article}</small>
                  </td>
                  <td>{row.mainSarl}</td>
                  <td>{formatNumber(row.stock, 1)}</td>
                  <td>{formatNumber(row.forecast, 1)}</td>
                  <td>{formatNumber(row.safety, 1)}</td>
                  <td className="buy-cell">{formatNumber(row.recommended)}</td>
                  <td>
                    {row.unitCost > 0 ? (
                      formatMoney(row.estimatedCost)
                    ) : (
                      <span className="missing-cost">Coût manquant</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <EmptyState text="Aucun achat recommandé pour ces filtres" />
          )}
        </div>
      </CollapsiblePanel>
      <div className="caveat">
        <AlertTriangle size={17} />
        <span>
          <strong>Avant de commander :</strong> ajouter plus tard les tarifs
          fournisseurs, délais de livraison, conditionnements et quantités
          minimales permettra de choisir le fournisseur éloigné seulement quand
          l’économie totale est réelle.
        </span>
      </div>
    </>
  );
}

function Anomalies({ model }) {
  return (
    <>
      <section className="section-heading">
        <div className="eyebrow">
          <AlertTriangle size={15} /> Contrôle des données
        </div>
        <h2>Les points qui peuvent fausser les décisions</h2>
        <p>
          Traitez d’abord les stocks négatifs et les valeurs de sortie
          négatives, puis complétez les coûts.
        </p>
      </section>
      <section className="anomaly-grid">
        {model.anomalies.cards.map((card) => (
          <article key={card.label} className={`anomaly-card ${card.severity}`}>
            <span>{card.label}</span>
            <strong>{formatNumber(card.count)}</strong>
            <small>
              {card.denominator
                ? `${formatNumber((card.count / card.denominator) * 100, 1)}% · ${card.impact}`
                : card.impact}
            </small>
          </article>
        ))}
      </section>
      <CollapsiblePanel
        kicker="Détail prioritaire"
        title="Anomalies identifiées"
        meta={`${model.anomalies.detail.length} lignes`}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Niveau</th>
                <th>Type</th>
                <th>Article</th>
                <th>Désignation stock</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {model.anomalies.detail.slice(0, 150).map((row, index) => (
                <tr key={`${row.type}-${row.article}-${index}`}>
                  <td>
                    <span className={`status ${row.severity}`}>
                      {row.severity === "critical" ? "Critique" : "Vérifier"}
                    </span>
                  </td>
                  <td>{row.type}</td>
                  <td>
                    <strong>{row.article}</strong>
                  </td>
                  <td>{row.designation}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!model.anomalies.detail.length && (
            <EmptyState text="Aucune anomalie prioritaire" />
          )}
        </div>
      </CollapsiblePanel>
    </>
  );
}

function DashboardSelector({ onSelect }) {
  return (
    <main className="dashboard-hub">
      <div className="hub-glow hub-glow-gold" />
      <div className="hub-glow hub-glow-burgundy" />
      <header className="hub-header">
        <div className="hub-brand">
          <img src="/brand/groupe-abidi-logo.png" alt="Groupe ABIDI" />
          <div>
            <span>Groupe ABIDI</span>
            <strong>Centre de pilotage</strong>
          </div>
        </div>
        <span className="hub-status">
          <i /> Données locales sécurisées
        </span>
      </header>
      <section className="hub-content">
        <div className="hub-intro">
          <div className="eyebrow">
            <Sparkles size={15} /> Espace décisionnel
          </div>
          <h1>Quel dashboard souhaitez-vous ouvrir&nbsp;?</h1>
          <p>
            Sélectionnez votre activité pour accéder à ses indicateurs, analyses
            et outils de pilotage.
          </p>
        </div>
        <div className="dashboard-choice-grid">
          <button
            className="dashboard-choice available"
            onClick={() => onSelect("magasin")}
          >
            <div className="choice-top">
              <span className="choice-icon">
                <Warehouse />
              </span>
              <span className="choice-status">Disponible</span>
            </div>
            <div className="choice-copy">
              <span>Dashboard 01</span>
              <h2>Magasin</h2>
              <p>
                Stock, sorties d’articles, consommation par SARL, anomalies et
                préparation des achats.
              </p>
            </div>
            <div className="choice-action">
              <span>Ouvrir le dashboard</span>
              <ArrowRight size={19} />
            </div>
          </button>
          <button
            className="dashboard-choice minoterie available"
            onClick={() => onSelect("minoterie")}
          >
            <div className="choice-top">
              <span className="choice-icon">
                <Factory />
              </span>
              <span className="choice-status">Disponible</span>
            </div>
            <div className="choice-copy">
              <span>Dashboard 02</span>
              <h2>Minoterie</h2>
              <p>
                Blé, production par Minoterie et par shift, ventes,
                recouvrement, caisse et anomalies.
              </p>
            </div>
            <div className="choice-action">
              <span>Ouvrir le dashboard</span>
              <ArrowRight size={19} />
            </div>
          </button>
          <button
            className="dashboard-choice attendance available"
            onClick={() => onSelect("attendance")}
          >
            <div className="choice-top">
              <span className="choice-icon">
                <Clock3 />
              </span>
              <span className="choice-status">Nouveau</span>
            </div>
            <div className="choice-copy">
              <span>Dashboard 03</span>
              <h2>Présence & Accès</h2>
              <p>
                <span dir="rtl">الحضور والانصراف والتحكم في الدخول</span> ·
                Pointage, présence, retards, absences et contrôle des accès.
              </p>
            </div>
            <div className="choice-action">
              <span>Ouvrir le module</span>
              <ArrowRight size={19} />
            </div>
          </button>
          <button
            className="dashboard-choice conserve available"
            onClick={() => onSelect("conserve")}
          >
            <div className="choice-top">
              <span className="choice-icon">
                <Clock3 />
              </span>
              <span className="choice-status">Nouveau</span>
            </div>
            <div className="choice-copy">
              <span>Dashboard 04</span>
              <h2>Conserverie</h2>
              <p>
                <span dir="rtl">conserverie Dashboard </span> · ventes and
                productions.
              </p>
            </div>
            <div className="choice-action">
              <span>Ouvrir le module</span>
              <ArrowRight size={19} />
            </div>
          </button>
        </div>
      </section>
      <footer className="hub-footer">
        <span>Groupe ABIDI · Pilotage des activités</span>
        <span>Choisissez un espace pour continuer</span>
      </footer>
    </main>
  );
}

function MinoteriePlaceholder({ onBack }) {
  return (
    <main className="minoterie-shell">
      <header className="minoterie-header">
        <div className="hub-brand">
          <img src="/brand/groupe-abidi-logo.png" alt="Groupe ABIDI" />
          <div>
            <span>Groupe ABIDI</span>
            <strong>Dashboard Minoterie</strong>
          </div>
        </div>
        <button className="back-to-hub" onClick={onBack}>
          <ArrowLeft size={17} /> Changer de dashboard
        </button>
      </header>
      <section className="minoterie-placeholder">
        <div className="minoterie-icon">
          <Factory size={38} />
        </div>
        <div className="eyebrow">
          <Sparkles size={15} /> Nouvel espace
        </div>
        <h1>Le dashboard Minoterie est prêt à être conçu.</h1>
        <p>
          La structure d’accueil est créée. Donnez-moi maintenant les données,
          les objectifs et les analyses que vous souhaitez pour la Minoterie.
        </p>
        <button className="primary-button" onClick={onBack}>
          <LayoutGrid size={17} /> Retour aux dashboards
        </button>
      </section>
    </main>
  );
}

function ConserveriePlaceholder({
  onBack,
  data,
  onImport,
  importMessage,
  importing,
  brsData,
  onImportBrs,
  brsMessage,
  brsImporting,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const tabs = [
    ["import", "Import données", Upload],
    ["overview", "Vue manager", BarChart3],
    ["stock", "Stock", Boxes],
    ["anomalies", "Anomalies", AlertTriangle],
  ];
  const rows = data?.rows || [];
  const familyTotals = [
    ...rows.reduce((map, row) => {
      const item = map.get(row.family) || {
        name: row.family || "Sans famille",
        value: 0,
        quantity: 0,
      };
      item.value += row.finalValue;
      item.quantity += row.finalQuantity;
      map.set(row.family, item);
      return map;
    }, new Map()),
  ]
    .map(([, item]) => ({
      ...item,
      share: data.totals.finalValue
        ? `${formatNumber((item.value / data.totals.finalValue) * 100, 1)} %`
        : "0 %",
    }))
    .sort((a, b) => b.value - a.value);
  const anomalyRows = rows.filter(
    (row) =>
      row.finalQuantity < 0 ||
      row.finalValue < 0 ||
      (row.finalQuantity > 0 && row.finalValue === 0),
  );
  const brsRisk = brsData
    ? brsData.metrics.negativeQuantity + brsData.metrics.negativeAmount
    : 0;
  const brsMissingCostRate = brsData
    ? (brsData.metrics.missingCost / brsData.metrics.lines) * 100
    : 0;
  const needsControl = Boolean(brsRisk || anomalyRows.length);
  const openFile = async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const imported = await onImport(file);
      if (imported) setActiveTab("overview");
    }
    event.target.value = "";
  };
  const openBrsFile = async (event) => {
    const file = event.target.files?.[0];
    if (file) await onImportBrs(file);
    event.target.value = "";
  };

  return (
    <div className={`mino-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="mino-sidebar">
        <div className="mino-brand">
          <img src="/brand/groupe-abidi-logo.png" alt="GROUPE ABIDI" />
          <div>
            <span>GROUPE ABIDI</span>
            <strong>Conserverie</strong>
          </div>
        </div>
        <button
          className="mino-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
          title={collapsed ? "Ouvrir le menu" : "Réduire le menu"}
        >
          {collapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <PanelLeftClose size={17} />
          )}
          <span>{collapsed ? "Ouvrir" : "Réduire"}</span>
        </button>
        <nav aria-label="Navigation Conserverie">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={activeTab === key ? "active" : ""}
              onClick={() => setActiveTab(key)}
              title={label}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="mino-switch" onClick={onBack}>
          <LayoutGrid size={17} />
          <span>Changer de dashboard</span>
        </button>
      </aside>
      <main className="mino-main">
        <header className="mino-topbar">
          <div>
            <span>Groupe ABIDI / Conserverie</span>
            <h1>{tabs.find(([key]) => key === activeTab)?.[1]}</h1>
          </div>
        </header>
        <section className="mino-content">
          {activeTab === "import" && (
            <>
              <div className="mino-title">
                <span>
                  <Upload size={15} /> Source de données
                </span>
                <h2>Importer la balance Conserverie</h2>
                <p>
                  Chargez un PDF au même format que la balance valorisée des
                  stocks. Les 14 pages seront analysées automatiquement.
                </p>
              </div>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Import PDF</span>
                    <h3>Balance valorisée des stocks</h3>
                  </div>
                  <small>
                    {data
                      ? `${data.rows.length} articles actuellement chargés`
                      : "Aucune donnée chargée"}
                  </small>
                </header>
                <label className="manager-kpi-import">
                  <Upload size={17} />
                  <span>
                    {importing
                      ? "Analyse du PDF en cours…"
                      : "Choisir un fichier PDF"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={openFile}
                  />
                </label>
                {importMessage && (
                  <div
                    className={
                      importMessage.type === "error"
                        ? "mino-error"
                        : "mino-success"
                    }
                  >
                    {importMessage.text}
                  </div>
                )}
                <div className="mino-alert-list">
                  <div className="info">
                    <span>
                      <CheckCircle2 size={15} />
                    </span>
                    <div>
                      <strong>Source principale</strong>
                      <small>Position et valeur du stock</small>
                    </div>
                    <p>
                      Le PDF alimente la situation de stock, les familles et les
                      anomalies de valorisation.
                    </p>
                  </div>
                </div>
              </section>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Import Excel</span>
                    <h3>Journal des régularisations stock</h3>
                  </div>
                  <small>
                    {brsData
                      ? `${brsData.metrics.lines} lignes actuellement chargées`
                      : "Aucune donnée chargée"}
                  </small>
                </header>
                <label className="manager-kpi-import">
                  <FileSpreadsheet size={17} />
                  <span>
                    {brsImporting
                      ? "Analyse du fichier Excel en cours…"
                      : "Choisir brs.xlsx"}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    hidden
                    onChange={openBrsFile}
                  />
                </label>
                {brsMessage && (
                  <div
                    className={
                      brsMessage.type === "error"
                        ? "mino-error"
                        : "mino-success"
                    }
                  >
                    {brsMessage.text}
                  </div>
                )}
                <div className="mino-alert-list">
                  <div className="info">
                    <span>
                      <AlertTriangle size={15} />
                    </span>
                    <div>
                      <strong>Source de contrôle</strong>
                      <small>Corrections et conversions</small>
                    </div>
                    <p>
                      Ce fichier ne mesure ni les ventes ni la production. Il
                      explique les corrections du stock.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
          {activeTab === "overview" && (
            <>
              {!data ? (
                <section className="mino-panel">
                  <div className="cost-accounting-empty">
                    <Upload />
                    <div>
                      <strong>Importez d'abord la balance PDF</strong>
                      <p>
                        La vue analyste sera calculée automatiquement à partir
                        de toutes les lignes reconnues.
                      </p>
                      <button onClick={() => setActiveTab("import")}>
                        Ouvrir l'import
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <section
                    className={`mino-hero ${needsControl ? "uncovered" : "covered"}`}
                  >
                    <div>
                      <span>
                        <Sparkles size={15} /> Conclusion analyste ·{" "}
                        {data.meta.fileName}
                      </span>
                      <h2>
                        {needsControl
                          ? "Contrôle requis avant décision d’achat."
                          : "Stock exploitable pour le pilotage."}
                      </h2>
                      <p>
                        {familyTotals[0]?.name} représente{" "}
                        {familyTotals[0]?.share} de la valeur finale.{" "}
                        {brsData
                          ? `${brsData.metrics.negativeQuantity} lignes BRS ont une quantité négative et ${formatNumber(brsMissingCostRate, 1)} % des régularisations n'ont pas de coût.`
                          : "Importez le journal BRS pour mesurer le risque de régularisation."}{" "}
                        {needsControl
                          ? "Valider les mouvements et les coûts avant de conclure sur la couverture du stock."
                          : "La prochaine étape est de suivre les mouvements et la consommation."}
                      </p>
                    </div>
                    <div className="mino-hero-ratio">
                      <small>Statut de décision</small>
                      <strong>
                        {needsControl ? "À contrôler" : "Exploitable"}
                      </strong>
                      <span>
                        {formatMoney(data.totals.finalValue)} de stock valorisé
                      </span>
                      <dl>
                        <div>
                          <dt>Articles reconnus</dt>
                          <dd>{formatNumber(rows.length)}</dd>
                        </div>
                        <div>
                          <dt>Anomalies stock / BRS</dt>
                          <dd>{formatNumber(anomalyRows.length + brsRisk)}</dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                  <div className="mino-kpi-grid four">
                    <article className="mino-kpi">
                      <div className="mino-kpi-icon">
                        <CircleDollarSign size={18} />
                      </div>
                      <div>
                        <small>Valeur immobilisée</small>
                        <strong>{formatMoney(data.totals.finalValue)}</strong>
                        <p>Valeur finale reportée</p>
                      </div>
                    </article>
                    <article className="mino-kpi">
                      <div className="mino-kpi-icon">
                        <Boxes size={18} />
                      </div>
                      <div>
                        <small>Stock physique</small>
                        <strong>
                          {formatNumber(data.totals.finalQuantity, 2)}
                        </strong>
                        <p>Quantité finale reportée</p>
                      </div>
                    </article>
                    <article className="mino-kpi">
                      <div className="mino-kpi-icon">
                        <TrendingUp size={18} />
                      </div>
                      <div>
                        <small>Familles actives</small>
                        <strong>{formatNumber(familyTotals.length)}</strong>
                        <p>Familles reconnues dans le PDF</p>
                      </div>
                    </article>
                    <article className="mino-kpi">
                      <div className="mino-kpi-icon">
                        <AlertTriangle size={18} />
                      </div>
                      <div>
                        <small>À contrôler</small>
                        <strong>{formatNumber(anomalyRows.length)}</strong>
                        <p>Lignes négatives ou non valorisées</p>
                      </div>
                    </article>
                  </div>
                  {brsData && (
                    <section className="mino-panel">
                      <header>
                        <div>
                          <span>Contrôle manager</span>
                          <h3>Impact des régularisations sur la décision</h3>
                        </div>
                        <small>{brsData.meta.fileName}</small>
                      </header>
                      <div className="mino-kpi-grid four">
                        <article className="mino-kpi">
                          <div className="mino-kpi-icon">
                            <Repeat2 size={18} />
                          </div>
                          <div>
                            <small>Lignes BRS</small>
                            <strong>
                              {formatNumber(brsData.metrics.lines)}
                            </strong>
                            <p>
                              {formatNumber(brsData.metrics.documents)}{" "}
                              documents ·{" "}
                              {formatNumber(brsData.metrics.articles)} articles
                            </p>
                          </div>
                        </article>
                        <article className="mino-kpi">
                          <div className="mino-kpi-icon">
                            <AlertTriangle size={18} />
                          </div>
                          <div>
                            <small>Risque quantité</small>
                            <strong>
                              {formatNumber(brsData.metrics.negativeQuantity)}
                            </strong>
                            <p>Lignes négatives à justifier</p>
                          </div>
                        </article>
                        <article className="mino-kpi">
                          <div className="mino-kpi-icon">
                            <CircleDollarSign size={18} />
                          </div>
                          <div>
                            <small>Risque valorisation</small>
                            <strong>
                              {formatNumber(brsMissingCostRate, 1)} %
                            </strong>
                            <p>Régularisations sans coût</p>
                          </div>
                        </article>
                        <article className="mino-kpi">
                          <div className="mino-kpi-icon">
                            <CheckCircle2 size={18} />
                          </div>
                          <div>
                            <small>Décision</small>
                            <strong>
                              {needsControl ? "Bloquer" : "Continuer"}
                            </strong>
                            <p>
                              {needsControl
                                ? "Valider avant achat"
                                : "Données exploitables"}
                            </p>
                          </div>
                        </article>
                      </div>
                      <div className="mino-alert-list">
                        <div>
                          <span>
                            <AlertTriangle size={15} />
                          </span>
                          <div>
                            <strong>Action immédiate</strong>
                            <small>Responsable : magasin + comptabilité</small>
                          </div>
                          <p>
                            Justifier les quantités négatives, compléter les
                            coûts manquants, puis recalculer la couverture avant
                            toute commande.
                          </p>
                        </div>
                      </div>
                    </section>
                  )}
                  <div className="mino-grid two-one">
                    <section className="mino-panel">
                      <header>
                        <div>
                          <span>Répartition financière</span>
                          <h3>Où est immobilisée la valeur ?</h3>
                        </div>
                        <small>Valeur finale</small>
                      </header>
                      <div className="mino-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={familyTotals}
                            layout="vertical"
                            margin={{ left: 18, right: 18 }}
                          >
                            <CartesianGrid
                              horizontal={false}
                              stroke="#e8dfd5"
                              strokeDasharray="3 5"
                            />
                            <XAxis type="number" hide />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={128}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(value) => `${formatMoney(value)} TND`}
                            />
                            <Bar
                              dataKey="value"
                              fill="#7a3024"
                              radius={[0, 7, 7, 0]}
                              barSize={21}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                    <section className="mino-panel">
                      <header>
                        <div>
                          <span>Lecture analyste</span>
                          <h3>Points d'attention</h3>
                        </div>
                      </header>
                      <div className="mino-alert-list">
                        <div className="info">
                          <span>
                            <CircleDollarSign size={15} />
                          </span>
                          <div>
                            <strong>Valeur concentrée</strong>
                            <small>Risque de surstock ciblé</small>
                          </div>
                          <p>
                            Revoir les matières premières à forte valeur avant
                            réapprovisionnement.
                          </p>
                        </div>
                        <div>
                          <span>
                            <AlertTriangle size={15} />
                          </span>
                          <div>
                            <strong>Qualité des données</strong>
                            <small>À contrôler</small>
                          </div>
                          <p>
                            Les quantités négatives et les valeurs négatives
                            doivent être justifiées.
                          </p>
                        </div>
                        <div className="info">
                          <span>
                            <Factory size={15} />
                          </span>
                          <div>
                            <strong>Énergie séparée</strong>
                            <small>Gasoil et chaudière</small>
                          </div>
                          <p>
                            Analyser le gasoil à part du stock de production.
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                  <section className="mino-panel">
                    <header>
                      <div>
                        <span>Répartition détaillée</span>
                        <h3>Valeur et quantité par famille</h3>
                      </div>
                      <small>Source : balance valorisée PDF</small>
                    </header>
                    <div className="mino-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Famille</th>
                            <th>Valeur finale</th>
                            <th>Part valeur</th>
                            <th>Quantité finale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {familyTotals.map((family) => (
                            <tr key={family.name}>
                              <td>
                                <strong>{family.name}</strong>
                              </td>
                              <td>{formatMoney(family.value)}</td>
                              <td>{family.share}</td>
                              <td>{family.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          {activeTab === "stock" && (
            <>
              <div className="mino-title">
                <span>
                  <Boxes size={15} /> Stock global
                </span>
                <h2>Articles stockables</h2>
                <p>
                  Extrait de la balance valorisée, avec famille, quantité finale
                  et valeur finale.
                </p>
              </div>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Balance complète</span>
                    <h3>Stock final par article</h3>
                  </div>
                  <small>{formatNumber(rows.length)} lignes reconnues</small>
                </header>
                {data ? (
                  <div className="mino-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Article</th>
                          <th>Désignation</th>
                          <th>Famille</th>
                          <th>Sous-famille</th>
                          <th>U.M.</th>
                          <th>Emballage</th>
                          <th>Qté initiale</th>
                          <th>Entrées</th>
                          <th>Sorties</th>
                          <th>Qté finale</th>
                          <th>Valeur finale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <strong>{row.articleCode}</strong>
                            </td>
                            <td>{row.description}</td>
                            <td>{row.family}</td>
                            <td>{row.subfamily}</td>
                            <td>{row.unit}</td>
                            <td>
                              {row.packaging} × {row.coefficient}
                            </td>
                            <td>{formatNumber(row.initialQuantity, 2)}</td>
                            <td>{formatNumber(row.entriesQuantity, 2)}</td>
                            <td>{formatNumber(row.exitsQuantity, 2)}</td>
                            <td>{formatNumber(row.finalQuantity, 2)}</td>
                            <td>{formatMoney(row.finalValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="cost-accounting-empty">
                    <Upload />
                    <div>
                      <strong>Aucune balance importée</strong>
                      <p>
                        Utilisez l'onglet Import données pour charger le PDF.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
          {activeTab === "anomalies" && (
            <>
              <div className="mino-title">
                <span>
                  <AlertTriangle size={15} /> Contrôle des données
                </span>
                <h2>Anomalies du stock</h2>
                <p>Les premières anomalies repérées dans la balance PDF.</p>
              </div>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>À vérifier</span>
                    <h3>Articles avec quantité ou valeur négative</h3>
                  </div>
                  <small>{formatNumber(anomalyRows.length)} lignes</small>
                </header>
                {data ? (
                  <div className="mino-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Article</th>
                          <th>Désignation</th>
                          <th>Famille</th>
                          <th>Qté finale</th>
                          <th>Valeur finale</th>
                          <th>Action analyste</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anomalyRows.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <strong>{row.articleCode}</strong>
                            </td>
                            <td>{row.description}</td>
                            <td>{row.family}</td>
                            <td className={row.finalQuantity < 0 ? "bad" : ""}>
                              {formatNumber(row.finalQuantity, 2)}
                            </td>
                            <td className={row.finalValue < 0 ? "bad" : ""}>
                              {formatMoney(row.finalValue)}
                            </td>
                            <td>
                              <span className="status-pill warn">
                                {row.finalQuantity < 0
                                  ? "Stock négatif"
                                  : row.finalValue < 0
                                    ? "Valeur négative"
                                    : "Valeur à compléter"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="cost-accounting-empty">
                    <AlertTriangle />
                    <div>
                      <strong>Aucune donnée à contrôler</strong>
                      <p>
                        Importez la balance PDF pour calculer les anomalies.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [selectedDashboard, setSelectedDashboard] = useState(null);
  const [data, setData] = useState(null);
  const [minoterieData, setMinoterieData] = useState(null);
  const [conserverieData, setConserverieData] = useState(null);
  const [conserverieBrsData, setConserverieBrsData] = useState(null);
  const [conserverieImporting, setConserverieImporting] = useState(false);
  const [conserverieBrsImporting, setConserverieBrsImporting] = useState(false);
  const [conserverieMessage, setConserverieMessage] = useState(null);
  const [conserverieBrsMessage, setConserverieBrsMessage] = useState(null);
  const [conserverieAvarie, setConserverieAvarie] = useState(null);
  const [conserverieOrdre, setConserverieOrdre] = useState(null);
  const [conserverieAvarieMessage, setConserverieAvarieMessage] =
    useState(null);
  const [conserverieOrdreMessage, setConserverieOrdreMessage] = useState(null);
  const [conserverieClients, setConserverieClients] = useState(null);
  const [conserverieClientsMessage, setConserverieClientsMessage] =
    useState(null);
  const [conserverieFellah, setConserverieFellah] = useState(null);
  const [conserverieFellahMessage, setConserverieFellahMessage] =
    useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [filters, setFilters] = useState({
    month: "",
    date: "",
    sarl: "",
    warehouse: "",
    location: "",
    family: "",
    requester: "",
    costCenter: "",
    project: "",
    search: "",
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("abidi-sidebar-collapsed") === "true",
  );

  useEffect(() => {
    const saved = localStorage.getItem("abidi-dashboard-data");
    if (saved) {
      try {
        setData(JSON.parse(saved));
        return;
      } catch {
        localStorage.removeItem("abidi-dashboard-data");
      }
    }
    fetch("/data/initial-data.json")
      .then((response) => {
        if (!response.ok) throw new Error("Jeu initial introuvable");
        return response.json();
      })
      .then(setData)
      .catch(() => setData({ stock: [], sorties: [], meta: {} }));
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("abidi-conserverie-avarie");
    if (saved)
      try {
        setConserverieAvarie(JSON.parse(saved));
      } catch {
        localStorage.removeItem("abidi-conserverie-avarie");
      }
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("abidi-conserverie-ordre");
    if (saved)
      try {
        setConserverieOrdre(JSON.parse(saved));
      } catch {
        localStorage.removeItem("abidi-conserverie-ordre");
      }
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("abidi-conserverie-clients");
    if (saved)
      try {
        setConserverieClients(JSON.parse(saved));
      } catch {
        localStorage.removeItem("abidi-conserverie-clients");
      }
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("abidi-conserverie-fellah");
    if (saved)
      try {
        setConserverieFellah(JSON.parse(saved));
      } catch {
        localStorage.removeItem("abidi-conserverie-fellah");
      }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("abidi-conserverie-stock");
    if (saved) {
      try {
        setConserverieData(JSON.parse(saved));
      } catch {
        localStorage.removeItem("abidi-conserverie-stock");
      }
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("abidi-conserverie-brs");
    if (saved) {
      try {
        setConserverieBrsData(JSON.parse(saved));
      } catch {
        localStorage.removeItem("abidi-conserverie-brs");
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "abidi-sidebar-collapsed",
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    const saved = localStorage.getItem("abidi-minoterie-data");
    const savedVersion = localStorage.getItem("abidi-minoterie-data-version");
    if (saved && savedVersion === MINOTERIE_DATA_VERSION) {
      try {
        setMinoterieData(JSON.parse(saved));
        return;
      } catch {
        localStorage.removeItem("abidi-minoterie-data");
      }
    }
    localStorage.removeItem("abidi-minoterie-data");
    localStorage.removeItem("abidi-minoterie-data-version");
    fetch("/data/minoterie-data.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Données Minoterie introuvables");
        return response.json();
      })
      .then(setMinoterieData)
      .catch(() => setMinoterieData(null));
  }, []);

  const model = useMemo(
    () => (data ? buildDashboard(data, filters) : null),
    [data, filters],
  );
  const importFile = async (file, kind) => {
    setMessage({ type: "loading", text: `Lecture de ${file.name}…` });
    try {
      const rows = await parseExcelFile(file, kind);
      const next = {
        ...data,
        [kind === "stock" ? "stock" : "sorties"]: rows,
        meta: {
          ...data.meta,
          [kind === "stock" ? "stockFile" : "sortiesFile"]: file.name,
          generatedAt: new Date().toISOString(),
        },
      };
      setData(next);
      try {
        localStorage.setItem("abidi-dashboard-data", JSON.stringify(next));
      } catch {
        /* The loaded session remains usable. */
      }
      setMessage({
        type: "ok",
        text: `${file.name} importé : ${formatNumber(rows.length)} lignes valides.`,
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };
  const importConserveriePdf = async (file) => {
    setConserverieImporting(true);
    setConserverieMessage({
      type: "loading",
      text: `Analyse de ${file.name}…`,
    });
    try {
      const { parseConserverieStockPdf } =
        await import("./lib/conserverie-stock-pdf.js");
      const parsed = await parseConserverieStockPdf(file);
      setConserverieData(parsed);
      localStorage.setItem("abidi-conserverie-stock", JSON.stringify(parsed));
      setConserverieMessage({
        type: "ok",
        text: `${file.name} analysé : ${formatNumber(parsed.rows.length)} articles sur ${parsed.meta.pages} pages.`,
      });
      return true;
    } catch (error) {
      setConserverieMessage({ type: "error", text: error.message });
      return false;
    } finally {
      setConserverieImporting(false);
    }
  };
  const importConserverieBrs = async (file) => {
    setConserverieBrsImporting(true);
    setConserverieBrsMessage({
      type: "loading",
      text: `Analyse de ${file.name}…`,
    });
    try {
      const { parseConserverieBrs } = await import("./lib/conserverie-brs.js");
      const parsed = await parseConserverieBrs(file);
      setConserverieBrsData(parsed);
      localStorage.setItem("abidi-conserverie-brs", JSON.stringify(parsed));
      setConserverieBrsMessage({
        type: "ok",
        text: `${file.name} analysé : ${formatNumber(parsed.metrics.lines)} lignes reconnues.`,
      });
    } catch (error) {
      setConserverieBrsMessage({ type: "error", text: error.message });
    } finally {
      setConserverieBrsImporting(false);
    }
  };
  const importConserverieAvarie = async (file) => {
    setConserverieAvarieMessage({
      type: "loading",
      text: `Analyse de ${file.name}…`,
    });
    try {
      const { parseConserverieAvariePdf } =
        await import("./lib/conserverie-avarie.js");
      const parsed = await parseConserverieAvariePdf(file);
      setConserverieAvarie(parsed);
      localStorage.setItem("abidi-conserverie-avarie", JSON.stringify(parsed));
      setConserverieAvarieMessage({
        type: "ok",
        text: `${parsed.totals.lines} lignes d’avarie reconnues.`,
      });
      return true;
    } catch (error) {
      setConserverieAvarieMessage({ type: "error", text: error.message });
      return false;
    }
  };
  const importConserverieOrdre = async (file) => {
    setConserverieOrdreMessage({
      type: "loading",
      text: `Analyse de ${file.name}…`,
    });
    try {
      const { parseConserverieOrdre } =
        await import("./lib/conserverie-avarie.js");
      const parsed = await parseConserverieOrdre(file);
      setConserverieOrdre(parsed);
      localStorage.setItem("abidi-conserverie-ordre", JSON.stringify(parsed));
      setConserverieOrdreMessage({
        type: "ok",
        text: `${parsed.totals.documents} ordres reconnus, dont ${parsed.totals.oualidDocuments} Oualid.`,
      });
      return true;
    } catch (error) {
      setConserverieOrdreMessage({ type: "error", text: error.message });
      return false;
    }
  };
  const importConserverieClients = async (file) => {
    setConserverieClientsMessage({
      type: "loading",
      text: `Analyse de ${file.name}…`,
    });
    try {
      const { parseConserverieClients } =
        await import("./lib/conserverie-clients.js");
      const parsed = await parseConserverieClients(file);
      setConserverieClients(parsed);
      localStorage.setItem("abidi-conserverie-clients", JSON.stringify(parsed));
      setConserverieClientsMessage({
        type: "ok",
        text: `${parsed.totals.clients} clients reconnus.`,
      });
      return true;
    } catch (error) {
      setConserverieClientsMessage({ type: "error", text: error.message });
      return false;
    }
  };
  const importConserverieFellah = async (file) => {
    setConserverieFellahMessage({
      type: "loading",
      text: `Analyse de ${file.name}…`,
    });
    try {
      const { parseConserverieFellah } =
        await import("./lib/conserverie-fellah.js");
      const parsed = await parseConserverieFellah(file);
      setConserverieFellah(parsed);
      localStorage.setItem("abidi-conserverie-fellah", JSON.stringify(parsed));
      setConserverieFellahMessage({
        type: "ok",
        text: `${parsed.totals.farmers} fellahs reconnus dans RECAP.`,
      });
      return true;
    } catch (error) {
      setConserverieFellahMessage({ type: "error", text: error.message });
      return false;
    }
  };

  if (!selectedDashboard)
    return <DashboardSelector onSelect={setSelectedDashboard} />;
  if (selectedDashboard === "attendance")
    return (
      <Suspense fallback={<DashboardLoader />}>
        <AttendanceDashboard onBack={() => setSelectedDashboard(null)} />
      </Suspense>
    );
  if (selectedDashboard === "conserve")
    return (
      <Suspense fallback={<DashboardLoader />}>
        <ConserverieDashboard
          data={conserverieData}
          onImport={importConserveriePdf}
          importMessage={conserverieMessage}
          importing={conserverieImporting}
          brsData={conserverieBrsData}
          onImportBrs={importConserverieBrs}
          brsMessage={conserverieBrsMessage}
          brsImporting={conserverieBrsImporting}
          avarieData={conserverieAvarie}
          ordreData={conserverieOrdre}
          onImportAvarie={importConserverieAvarie}
          onImportOrdre={importConserverieOrdre}
          avarieMessage={conserverieAvarieMessage}
          ordreMessage={conserverieOrdreMessage}
          clientsData={conserverieClients}
          onImportClients={importConserverieClients}
          clientsMessage={conserverieClientsMessage}
          fellahData={conserverieFellah}
          onImportFellah={importConserverieFellah}
          fellahMessage={conserverieFellahMessage}
          onBack={() => setSelectedDashboard(null)}
        />
      </Suspense>
    );
  if (selectedDashboard === "minoterie") {
    if (!minoterieData)
      return (
        <div className="loading-screen">
          <RefreshCw className="spin" />
          <span>Préparation du dashboard Minoterie…</span>
        </div>
      );
    return (
      <Suspense fallback={<DashboardLoader />}>
        <MinoterieDashboard
          data={minoterieData}
          onData={(next) => {
            setMinoterieData(next);
            try {
              localStorage.setItem(
                "abidi-minoterie-data",
                JSON.stringify(next),
              );
              localStorage.setItem(
                "abidi-minoterie-data-version",
                MINOTERIE_DATA_VERSION,
              );
            } catch {
              /* Session remains active. */
            }
          }}
          onBack={() => setSelectedDashboard(null)}
        />
      </Suspense>
    );
  }
  if (!data || !model)
    return (
      <div className="loading-screen">
        <RefreshCw className="spin" />
        <span>Préparation du tableau de bord…</span>
      </div>
    );
  const latestDate = data.sorties
    .map((row) => row.date)
    .sort()
    .at(-1);
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand/groupe-abidi-logo.png" alt="Groupe ABIDI" />
          <span>Pilotage stock & achats</span>
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((value) => !value)}
          aria-label={
            sidebarCollapsed
              ? "Ouvrir le menu latéral"
              : "Fermer le menu latéral"
          }
          title={sidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
          <span>{sidebarCollapsed ? "Ouvrir" : "Réduire"}</span>
        </button>
        <nav>
          <button
            title="Vue manager"
            className={activeTab === "overview" ? "active" : ""}
            data-tab="overview"
            onClick={() => setActiveTab("overview")}
          >
            <BarChart3 />
            <span>Vue manager</span>
          </button>
          <button
            title="Consommation"
            className={activeTab === "consumption" ? "active" : ""}
            data-tab="consumption"
            onClick={() => setActiveTab("consumption")}
          >
            <TrendingUp />
            <span>Consommation</span>
          </button>
          <button
            title="Comparaison SARL"
            className={activeTab === "sarlComparison" ? "active" : ""}
            data-tab="sarlComparison"
            onClick={() => setActiveTab("sarlComparison")}
          >
            <GitCompareArrows />
            <span>Comparaison SARL</span>
          </button>
          <button
            title="Analyse stock"
            className={activeTab === "stock" ? "active" : ""}
            data-tab="stock"
            onClick={() => setActiveTab("stock")}
          >
            <Boxes />
            <span>Analyse stock</span>
          </button>
          <button
            title="Plan d'achat"
            className={activeTab === "purchases" ? "active" : ""}
            data-tab="purchases"
            onClick={() => setActiveTab("purchases")}
          >
            <ShoppingCart />
            <span>Plan d'achat</span>
            {model.kpis.purchaseArticles > 0 && (
              <b>{model.kpis.purchaseArticles}</b>
            )}
          </button>
          <button
            title="Anomalies"
            className={activeTab === "anomalies" ? "active" : ""}
            data-tab="anomalies"
            onClick={() => setActiveTab("anomalies")}
          >
            <AlertTriangle />
            <span>Anomalies</span>
          </button>
        </nav>
        <button
          className="dashboard-switch"
          onClick={() => setSelectedDashboard(null)}
          title="Changer de dashboard"
        >
          <LayoutGrid size={17} />
          <span>Changer de dashboard</span>
        </button>
        <div
          className="sidebar-source"
          title={`Dernière sortie : ${latestDate ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${latestDate}T12:00:00`)) : "—"}`}
        >
          <Database size={17} />
          <div>
            <span>Dernière sortie</span>
            <strong>
              {latestDate
                ? new Intl.DateTimeFormat("fr-FR").format(
                    new Date(`${latestDate}T12:00:00`),
                  )
                : "—"}
            </strong>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <img
            className="topbar-logo"
            src="/brand/groupe-abidi-logo.png"
            alt=""
          />
          <div>
            <span className="breadcrumb">Opérations / Stock</span>
            <h1>
              {
                {
                  overview: "Vue manager",
                  consumption: "Analyse consommation",
                  sarlComparison: "Comparaison SARL",
                  stock: "Analyse stock",
                  purchases: "Plan d'achat",
                  anomalies: "Anomalies & qualité",
                }[activeTab]
              }
            </h1>
          </div>
          <div className="topbar-actions">
            <button
              className="mobile-dashboard-switch"
              onClick={() => setSelectedDashboard(null)}
              aria-label="Changer de dashboard"
            >
              <LayoutGrid size={17} />
            </button>
            <button
              className="data-button"
              onClick={() => {
                setUploadOpen(true);
                setMessage(null);
              }}
            >
              <Upload size={17} />
              <span>Actualiser les données</span>
            </button>
          </div>
        </header>
        <Filters filters={filters} setFilters={setFilters} model={model} />
        <div className="content">
          {activeTab === "overview" && (
            <Overview model={model} filters={filters} />
          )}{" "}
          {activeTab === "consumption" && (
            <ConsumptionAnalysis model={model} filters={filters} />
          )}{" "}
          {activeTab === "sarlComparison" && (
            <SarlComparison model={model} filters={filters} />
          )}{" "}
          {activeTab === "stock" && <StockAnalysis model={model} />}{" "}
          {activeTab === "purchases" && <Purchases model={model} />}{" "}
          {activeTab === "anomalies" && <Anomalies model={model} />}
        </div>
        <footer>
          <span>Données locales · Stock + sorties</span>
          <span>Prévision indicative, à valider avant commande</span>
        </footer>
      </main>
      {uploadOpen && (
        <UploadPanel
          data={data}
          onImport={importFile}
          onClose={() => setUploadOpen(false)}
          message={message}
        />
      )}
    </div>
  );
}
