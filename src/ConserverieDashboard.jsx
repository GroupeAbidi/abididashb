import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Database,
  Factory,
  FileSpreadsheet,
  LayoutGrid,
  PackageSearch,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./minoterie.css";

const COLORS = [
  "#7a3024",
  "#c99715",
  "#3f6f68",
  "#9a6c61",
  "#758c94",
  "#a69b72",
];
const IMPORT_ACCESS_PASSWORD = "samer.0774";
const number = (value, digits = 0) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(
    value || 0,
  );
const money = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    value || 0,
  );
const avarieCategory = (description) => {
  const value = String(description || "")
    .trim()
    .toUpperCase();
  if (value.startsWith("BOITE")) return "Boîte vide";
  if (value.startsWith("CAISSE")) return "Emballage carton";
  if (/^(MI\/CT|DCT|MCT|MC\s|CT\s|HARISSA)/.test(value)) return "Produit fini";
  return "Matière première";
};
const KPI_EXPLANATIONS = {
  "Stock valorisé": {
    meaning:
      "يمثل القيمة المالية النهائية لجميع المواد الموجودة في كشف المخزون، وليس قيمة المبيعات أو الأرباح.",
    formula: "مجموع “Valeur finale” لكل مادة في ميزان المخزون.",
    source: "PDF Balance valorisée des stocks.",
    manager:
      "ركز أولًا على العائلات ذات القيمة الكبيرة؛ أي خطأ فيها يؤثر أكثر على قيمة المخزون.",
  },
  "Articles en anomalie": {
    meaning:
      "عدد المواد التي تظهر مشكلة كمية أو قيمة: كمية سالبة، أو كمية موجبة بلا قيمة مالية.",
    formula: "كمية نهائية سالبة + قيمة نهائية سالبة + كمية موجبة وقيمة صفر.",
    source: "PDF Balance valorisée des stocks.",
    manager:
      "لا تعتمد هذه المواد في قرار الشراء قبل فحص الحركة، الجرد المادي، والتكلفة.",
  },
  "Lignes BRS": {
    meaning:
      "عدد أسطر تسويات المخزون المسجلة في ملف BRS. السطر قد يكون تصحيح خطأ أو تحويل تغليف أو تحويل منتج.",
    formula: "عدّ جميع أسطر ملف Journal des régularisations stock.",
    source: "Excel BRS.",
    manager:
      "ارتفاع العدد لا يعني خطأ تلقائيًا، لكنه يزيد الحاجة إلى المراجعة والتوثيق.",
  },
  "Rapprochement BRS": {
    meaning:
      "نسبة أسطر BRS التي يشير رمز مادتها إلى مادة موجودة في كشف المخزون.",
    formula: "أسطر BRS المطابقة لرمز مادة في كشف المخزون ÷ كل أسطر BRS × 100.",
    source: "Excel BRS + PDF Balance valorisée.",
    manager:
      "هذه النسبة تؤكد تطابق المراجع فقط؛ لا تثبت صحة الكمية أو التكلفة أو الموافقة.",
  },
  "Exceptions stock": {
    meaning: "عدد تنبيهات جودة البيانات في كشف المخزون.",
    formula: "المواد ذات كمية سالبة أو قيمة سالبة أو كمية موجبة بلا قيمة.",
    source: "PDF Balance valorisée des stocks.",
    manager:
      "ابدأ بالمواد ذات القيمة الكبيرة أو الكمية السالبة لأنها الأعلى خطورة.",
  },
  "Sans valorisation": {
    meaning: "مواد لها رصيد فعلي موجب، لكن قيمتها المالية النهائية صفر.",
    formula: "Quantité finale > 0 و Valeur finale = 0.",
    source: "PDF Balance valorisée des stocks.",
    manager:
      "استكمل التكلفة قبل حساب قيمة المخزون أو تقييم خسارة التالف أو إعداد خطة شراء.",
  },
  "BRS à justifier": {
    meaning:
      "عدد أسطر BRS التي تحتاج مراجعة بسبب تكلفة مفقودة أو حركة كمية/مبلغ سالب.",
    formula:
      "الأسطر ذات تكلفة صفر أو كمية سالبة أو مبلغ سالب، مع عدّ السطر مرة واحدة.",
    source: "Excel BRS.",
    manager:
      "اطلب سبب الحركة والوثيقة الداعمة ثم صحح التكلفة إن كانت غير مسجلة.",
  },
  "Articles stock": {
    meaning: "عدد المواد المختلفة التي تم التعرف عليها من كشف المخزون.",
    formula: "عدّ أسطر المواد الفريدة في PDF بعد قراءة كشف المخزون.",
    source: "PDF Balance valorisée des stocks.",
    manager:
      "استخدمه كمؤشر على نطاق المراجعة وليس كمقياس للقيمة أو للكمية الإجمالية.",
  },
  "Valeur avarie": {
    meaning: "القيمة المالية للمواد التالفة أو المعاد إصلاحها في سجل الأضرار.",
    formula: "مجموع مبلغ كل سطر في avarie.pdf.",
    source: "PDF Journal avarie.",
    manager:
      "قارنها مع أوامر المسؤول وأسباب التلف لتحديد الخسائر التي تحتاج إجراءً وقائيًا.",
  },
  "Documents rapprochés": {
    meaning:
      "نسبة وثائق التالف في PDF التي تجد رقم إصلاح مطابقًا في ملف order.xlsx.",
    formula: "وثائق PDF المطابقة ÷ إجمالي وثائق PDF × 100.",
    source: "avarie.pdf + order.xlsx.",
    manager:
      "نسبة 100% تعني اكتمال الربط بين الملفين، لكنها لا تعني أن كل وثيقة تحمل أمر وليد.",
  },
  "Ordres Oualid": {
    meaning:
      "عدد وثائق التالف التي تحتوي ملاحظتها على كلمة OUALID، حتى عند اختلاف صياغة العبارة.",
    formula: "البحث عن OUALID داخل خانة Observation في order.xlsx.",
    source: "order.xlsx + avarie.pdf.",
    manager:
      "هذه فقط الوثائق المصنفة بأمر وليد. لا تخلطها مع بقية الملاحظات أو أسباب التلف.",
  },
  "Autres observations": {
    meaning:
      "وثائق تالف مطابقة في order.xlsx لكنها لا تحمل كلمة OUALID في الملاحظة.",
    formula: "كل الوثائق المطابقة − وثائق OUALID.",
    source: "order.xlsx + avarie.pdf.",
    manager:
      "راجع الملاحظة الأصلية لكل وثيقة لتحديد صاحب القرار أو سبب التلف قبل اعتمادها.",
  },
  "Chiffre d'affaires": {
    meaning:
      "إجمالي المبيعات المسجلة لكل الزبائن خلال الفترة المعروضة في كشف العملاء.",
    formula: "مجموع عمود Chiffre d’affaires لجميع العملاء.",
    source: "Excel clients au 08-2026.",
    manager:
      "قارنه بالتحصيلات وبأكبر العملاء لمعرفة ما إذا كان نمو المبيعات يتحول إلى سيولة فعلية.",
  },
  Encaissements: {
    meaning:
      "إجمالي المبالغ التي تم تحصيلها من العملاء خلال الفترة، وليس الرصيد المتبقي لديهم.",
    formula: "مجموع عمود Règlement / Paiements لجميع العملاء.",
    source: "Excel clients au 08-2026.",
    manager:
      "عندما يكون أقل من رقم المبيعات، راقب تطور الديون وركز على العملاء ذوي الرصيد المرتفع.",
  },
  "Créances à recouvrer": {
    meaning:
      "المبلغ الإجمالي الواجب تحصيله من العملاء؛ تُحتسب فقط الأرصدة الموجبة ولا تُخلط مع التسبيقات.",
    formula: "مجموع الأرصدة النهائية الموجبة لكل عميل.",
    source: "Excel clients au 08-2026.",
    manager:
      "هذه أولوية التحصيل. ابدأ بأكبر الديون وراجع آجال الاستحقاق قبل منح مبيعات آجلة جديدة.",
  },
  "Clients sans paiement": {
    meaning:
      "عدد العملاء الذين لديهم مبيعات مسجلة خلال الفترة لكن لا يوجد لهم أي تحصيل مسجل.",
    formula: "عدد العملاء: Chiffre d’affaires > 0 و Paiements = 0.",
    source: "Excel clients au 08-2026.",
    manager:
      "تحقق من الفاتورة والاستحقاق فورًا؛ قد تكون حالة تحصيل متأخر أو خطأ في تسجيل الدفعة.",
  },
  "Fellahs actifs": {
    meaning:
      "عدد الفلاحين الذين لديهم رقم عقد وسجل فعال في ورقة RECAP لسنة 2025.",
    formula: "عدّ السطور ذات رقم ترتيب رقمي في ورقة RECAP.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "يمثل نطاق المتابعة الفعلي؛ راجع العقود غير المكتملة قبل اعتماد إجمالي المساحات أو الكميات.",
  },
  "Superficie totale": {
    meaning: "إجمالي مساحة الأراضي المسجلة للفلاحين النشطين.",
    formula: "مجموع عمود Total Superficie.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "استعملها لفهم القدرة الزراعية ومقارنة الإنتاج المصرح به مع الإنتاج المتوقع.",
  },
  "Quantité prévue": {
    meaning: "الكمية المخططة حسب المساحة والمردود المعتمد في العقد.",
    formula: "مجموع Quantité Prévisionnelle في RECAP.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "لا تعتمد السطر الذي كميته المتوقعة صفر رغم وجود مساحة وكمية مصرح بها قبل تصحيحه.",
  },
  "Quantité déclarée": {
    meaning: "إجمالي كمية الطماطم المسجلة أو المستلمة من الفلاحين.",
    formula: "مجموع QNT DECLARE في RECAP.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "قارنها بالكمية المتوقعة لقياس الإنجاز الحقيقي، وليس بعمود الفرق غير المتجانس في الملف.",
  },
  "Taux de réalisation": {
    meaning: "نسبة الكمية المصرح بها إلى الكمية المتوقعة في العقود.",
    formula: "Quantité déclarée ÷ Quantité prévue × 100.",
    source: "Calcul dashboard à partir de RECAP.",
    manager:
      "انخفاض النسبة يحدد مناطق أو فلاحين يحتاجون متابعة ميدانية أو مراجعة مردود.",
  },
  "Solde net fellahs": {
    meaning: "صافي الفرق بين قيمة إنتاج الطماطم والتسبيقات المسجلة للفلاحين.",
    formula: "مجموع (قيمة الطماطم − التسبيق) لكل فلاح.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "إشارة موجبة تعني مبالغ مستحقة للفلاحين، والسالبة تعني تسبيقات أعلى من القيمة المسجلة.",
  },
  "À payer aux fellahs": {
    meaning:
      "إجمالي المبالغ التي ما زالت الشركة مطالبة بدفعها للفلاحين ذوي الرصيد الموجب.",
    formula: "مجموع الأرصدة الموجبة فقط.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "هذه هي أولوية الدفع. راجع أكبر الأرصدة والعقود قبل إعداد أمر التسديد.",
  },
  "Avances à régulariser": {
    meaning: "إجمالي فائض التسبيقات لدى الفلاحين ذوي الرصيد السالب.",
    formula: "القيمة المطلقة لمجموع الأرصدة السالبة فقط.",
    source: "Excel recap fellah.xlsx · feuille RECAP.",
    manager:
      "قرر لكل حالة هل يُسترجع المبلغ أم يُرحل للموسم التالي، بعد تأكيد التسبيقات المصدرية.",
  },
};
const PRIORITY_KPIS = new Set([
  "Stock valorisé",
  "Articles en anomalie",
  "BRS à justifier",
  "Valeur avarie",
  "Ordres Oualid",
  "Chiffre d'affaires",
  "Encaissements",
  "Créances à recouvrer",
  "Clients sans paiement",
  "Fellahs actifs",
  "Superficie totale",
  "Quantité prévue",
  "Quantité déclarée",
  "Taux de réalisation",
  "Solde net fellahs",
  "À payer aux fellahs",
  "Avances à régulariser",
]);
const TooltipCard = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="mino-tooltip">
      <strong>{label || payload[0]?.payload?.name}</strong>
      {payload[0]?.payload?.name && payload[0].payload.name !== label && (
        <em>{payload[0].payload.name}</em>
      )}
      {payload.map((item) => (
        <span key={item.dataKey}>
          {item.name}:{" "}
          {item.dataKey === "value" ? money(item.value) : number(item.value, 1)}
        </span>
      ))}
    </div>
  ) : null;
const ClientTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="mino-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          {item.name}: {money(item.value)}
        </span>
      ))}
    </div>
  ) : null;

function Kpi({ icon: Icon, label, value, detail, explanation, tone = "" }) {
  const [open, setOpen] = useState(false);
  const info = KPI_EXPLANATIONS[label] || {
    meaning:
      explanation ||
      `يعرض هذا المؤشر حالة «${label}» في البيانات المستوردة حاليًا.`,
    formula: detail,
    source: "ملفات المخزون المستوردة.",
    manager:
      "استخدم القيمة مع التنبيهات والرسوم البيانية لتحديد أولوية المراجعة.",
  };
  return (
    <div className="fellah-dashboard">
      <article
        className={`mino-kpi ${tone} ${PRIORITY_KPIS.has(label) ? "priority-kpi" : "secondary-kpi"}`}
      >
        <button
          className="mino-kpi-icon"
          onClick={() => setOpen(true)}
          aria-label={`Afficher l'explication : ${label}`}
        >
          <Icon size={18} />
        </button>
        <div>
          <small>{label}</small>
          <strong>{value}</strong>
          <p>{detail}</p>
        </div>
      </article>
      {open && (
        <div
          className="credit-calc-layer"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="credit-calc-box manager-kpi-explanation"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`explain-${label}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="credit-calc-close"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              <X />
            </button>
            <span>شرح المؤشر للمدير</span>
            <h3 id={`explain-${label}`}>{label}</h3>
            <div className="manager-kpi-result">
              <small>القيمة حسب البيانات الحالية</small>
              <strong>{value}</strong>
            </div>
            <div className="manager-kpi-section" dir="rtl">
              <h4>ماذا يعني هذا المؤشر؟</h4>
              <p>{info.meaning}</p>
            </div>
            <div className="manager-kpi-section" dir="rtl">
              <h4>كيف تم حسابه؟</h4>
              <code>{info.formula}</code>
              <p>{detail}</p>
            </div>
            <div className="manager-kpi-section sources" dir="rtl">
              <h4>مصدر البيانات</h4>
              <p>
                <Database size={15} />
                <span>{info.source}</span>
              </p>
            </div>
            <div className="manager-kpi-manager" dir="rtl">
              <strong>قراءة المدير</strong>
              <p>{info.manager}</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function OptionalTable({ title, note, children }) {
  return (
    <details className="optional-table">
      <summary>
        <span>
          <FileSpreadsheet />
          <i>
            <strong>{title}</strong>
            <small>{note}</small>
          </i>
        </span>
        <b>
          Afficher le détail <ArrowLeft />
        </b>
      </summary>
      <div className="optional-table-body">{children}</div>
    </details>
  );
}

export default function ConserverieDashboard({
  onBack,
  data,
  onImport,
  importMessage,
  importing,
  brsData,
  onImportBrs,
  brsMessage,
  brsImporting,
  avarieData,
  ordreData,
  onImportAvarie,
  onImportOrdre,
  avarieMessage,
  ordreMessage,
  clientsData,
  onImportClients,
  clientsMessage,
  fellahData,
  onImportFellah,
  fellahMessage,
}) {
  const [tab, setTab] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [importUnlocked, setImportUnlocked] = useState(false);
  const [importPasswordOpen, setImportPasswordOpen] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importPasswordError, setImportPasswordError] = useState("");
  const stockInput = useRef();
  const brsInput = useRef();
  const avarieInput = useRef();
  const ordreInput = useRef();
  const clientsInput = useRef();
  const fellahInput = useRef();
  const rows = data?.rows || [];
  const brsRows = brsData?.rows || [];
  const insights = useMemo(() => {
    const families = [
      ...rows
        .reduce((map, row) => {
          const item = map.get(row.family || "Sans famille") || {
            name: row.family || "Sans famille",
            value: 0,
            quantity: 0,
            articles: 0,
          };
          item.value += row.finalValue;
          item.quantity += row.finalQuantity;
          item.articles += 1;
          map.set(item.name, item);
          return map;
        }, new Map())
        .values(),
    ].sort((a, b) => b.value - a.value);
    const anomalies = rows.filter(
      (r) =>
        r.finalQuantity < 0 ||
        r.finalValue < 0 ||
        (r.finalQuantity > 0 && r.finalValue === 0),
    );
    const brsTypes = [
      ...brsRows
        .reduce(
          (map, row) =>
            map.set(
              row.type || "Non classé",
              (map.get(row.type || "Non classé") || 0) + 1,
            ),
          new Map(),
        )
        .entries(),
    ]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const byArticle = new Map(rows.map((row) => [row.articleCode, row]));
    const brsIssues = brsRows
      .filter((r) => r.quantity < 0 || r.amount < 0 || r.cost === 0)
      .map((r) => ({ ...r, stock: byArticle.get(r.articleCode) }));
    const matched = brsRows.filter((r) => byArticle.has(r.articleCode)).length;
    const monthlyBrs = [
      ...brsRows
        .reduce((map, row) => {
          const parts = String(row.date || "").match(
            /(\d{2})\/(\d{2})\/(\d{4})/,
          );
          const key = parts ? `${parts[3]}-${parts[2]}` : "Sans date";
          const item = map.get(key) || {
            month: key === "Sans date" ? key : `${parts[2]}/${parts[3]}`,
            lignes: 0,
            negatifs: 0,
            sansCout: 0,
          };
          item.lignes += 1;
          if (row.quantity < 0 || row.amount < 0) item.negatifs += 1;
          if (row.cost === 0) item.sansCout += 1;
          map.set(key, item);
          return map;
        }, new Map())
        .entries(),
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, item]) => item);
    const stockHealth = [
      {
        name: "Stock conforme",
        value: Math.max(rows.length - anomalies.length, 0),
      },
      {
        name: "Qté négative",
        value: rows.filter((r) => r.finalQuantity < 0).length,
      },
      {
        name: "Valeur négative",
        value: rows.filter((r) => r.finalValue < 0 && r.finalQuantity >= 0)
          .length,
      },
      {
        name: "Sans valorisation",
        value: rows.filter((r) => r.finalQuantity > 0 && r.finalValue === 0)
          .length,
      },
    ].filter((item) => item.value > 0);
    return {
      families,
      anomalies,
      brsTypes,
      brsIssues,
      matched,
      monthlyBrs,
      stockHealth,
      negativeQty: rows.filter((r) => r.finalQuantity < 0).length,
      unvalued: rows.filter((r) => r.finalQuantity > 0 && r.finalValue === 0)
        .length,
      missingCost: brsRows.filter((r) => r.cost === 0).length,
      negativeBrs: brsRows.filter((r) => r.quantity < 0 || r.amount < 0).length,
    };
  }, [rows, brsRows]);
  const riskCount =
    insights.anomalies.length + insights.negativeBrs + insights.missingCost;
  const avarie = useMemo(() => {
    if (!avarieData || !ordreData) return null;
    const orders = new Map(
      ordreData.orders.map((row) => [row.documentNo, row]),
    );
    const docs = [
      ...avarieData.records
        .reduce((map, row) => {
          const item = map.get(row.documentNo) || {
            documentNo: row.documentNo,
            date: row.date,
            amount: 0,
            quantity: 0,
            lines: 0,
          };
          item.amount += row.amount;
          item.quantity += row.quantity;
          item.lines += 1;
          map.set(row.documentNo, item);
          return map;
        }, new Map())
        .values(),
    ].map((row) => ({ ...row, order: orders.get(row.documentNo) }));
    const monthly = [
      ...avarieData.records
        .reduce((map, row) => {
          const [, month, year] =
            String(row.date).match(/^\d{2}\/(\d{2})\/(\d{4})$/) || [];
          const key = month && year ? `${year}-${month}` : "Sans date";
          const item = map.get(key) || {
            key,
            month: month && year ? `${month}/${year}` : key,
            quantity: 0,
            oualidQuantity: 0,
            lines: 0,
          };
          item.quantity += row.quantity;
          item.lines += 1;
          if (orders.get(row.documentNo)?.oualidOrder)
            item.oualidQuantity += row.quantity;
          map.set(key, item);
          return map;
        }, new Map())
        .entries(),
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, item]) => item);
    const records = avarieData.records.map((row) => ({
      ...row,
      category: row.category || avarieCategory(row.description),
      order: orders.get(row.documentNo),
    }));
    const categories = [
      ...records
        .reduce((map, row) => {
          const item = map.get(row.category) || {
            name: row.category,
            quantity: 0,
            value: 0,
            lines: 0,
          };
          item.quantity += row.quantity;
          item.value += row.amount;
          item.lines += 1;
          map.set(row.category, item);
          return map;
        }, new Map())
        .values(),
    ].sort((a, b) => b.quantity - a.quantity);
    return {
      docs,
      records,
      monthly,
      categories,
      matched: docs.filter((row) => row.order).length,
      oualid: docs.filter((row) => row.order?.oualidOrder),
      nonOualid: docs.filter((row) => row.order && !row.order.oualidOrder),
      withoutOrder: docs.filter((row) => !row.order),
      ordersWithoutPdf: ordreData.orders.filter(
        (row) => !docs.some((doc) => doc.documentNo === row.documentNo),
      ),
    };
  }, [avarieData, ordreData]);
  const tabs = [
    ["overview", "Stock intégré", BarChart3],
    ["clients", "Clients & recouvrement", Users],
    ["fellah", "FELLAH", Factory],
    ["import", "Sources & import", Upload],
  ];
  const importFile = async (event, handler, nextTab) => {
    const file = event.target.files?.[0];
    if (file) {
      const ok = await handler(file);
      if (ok && nextTab) setTab(nextTab);
    }
    event.target.value = "";
  };
  const openImport = () => {
    if (importUnlocked) {
      setTab("import");
      return;
    }
    setImportPassword("");
    setImportPasswordError("");
    setImportPasswordOpen(true);
  };
  const validateImportPassword = (event) => {
    event.preventDefault();
    if (importPassword !== IMPORT_ACCESS_PASSWORD) {
      setImportPasswordError("Mot de passe incorrect.");
      return;
    }
    setImportUnlocked(true);
    setImportPasswordOpen(false);
    setImportPasswordError("");
    setTab("import");
  };
  const empty = (
    <section className="mino-panel">
      <div className="cost-accounting-empty">
        <Database />
        <div>
          <strong>Chargez la balance stock pour commencer</strong>
          <p>
            La vue professionnelle est calculée uniquement à partir de la
            balance valorisée et du journal BRS.
          </p>
          <button onClick={openImport}>Ouvrir les sources</button>
        </div>
      </div>
    </section>
  );
  return (
    <div
      className={`mino-shell conserve-powerbi ${collapsed ? "collapsed" : ""}`}
    >
      <aside className="mino-sidebar">
        <div className="mino-brand">
          <img src="/brand/groupe-abidi-logo.png" alt="Groupe ABIDI" />
          <div>
            <span>Groupe ABIDI</span>
            <strong>Conserverie</strong>
          </div>
        </div>
        <button
          className="mino-collapse"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <ArrowLeft />
          ) : (
            <ArrowLeft style={{ transform: "rotate(180deg)" }} />
          )}
          <span>{collapsed ? "Ouvrir" : "Réduire"}</span>
        </button>
        <nav aria-label="Navigation Conserverie">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => (key === "import" ? openImport() : setTab(key))}
              title={label}
            >
              <Icon />
              <span>{label}</span>
              {key === "regularisations" &&
                brsData &&
                insights.negativeBrs + insights.missingCost > 0 && (
                  <b>{insights.negativeBrs + insights.missingCost}</b>
                )}
            </button>
          ))}
        </nav>
        <button className="mino-switch" onClick={onBack}>
          <LayoutGrid />
          <span>Changer de dashboard</span>
        </button>
      </aside>
      <main className="mino-main">
        <header className="mino-topbar">
          <div>
            <span>Groupe ABIDI / Conserverie / contrôle stock</span>
            <h1>{tabs.find(([key]) => key === tab)?.[1]}</h1>
          </div>
          <button className="mino-upload" onClick={openImport}>
            <Upload />
            <span>Actualiser les sources</span>
          </button>
        </header>
        <section className="mino-content">
          {tab === "import" && (
            <>
              <div className="mino-title">
                <span>
                  <Database /> Gouvernance des données
                </span>
                <h2>Sources de contrôle du stock</h2>
                <p>
                  La balance valorisée décrit la position du stock. Le BRS
                  explique et contrôle les régularisations : il ne doit pas être
                  assimilé aux ventes ou à la production.
                </p>
              </div>
              <div className="import-summary">
                <div>
                  <FileSpreadsheet />
                  <div>
                    <span>Balance valorisée</span>
                    <strong>
                      {data
                        ? `${number(rows.length)} articles`
                        : "Non importée"}
                    </strong>
                  </div>
                </div>
                <div>
                  <ClipboardCheck />
                  <div>
                    <span>Journal BRS</span>
                    <strong>
                      {brsData
                        ? `${number(brsData.metrics.lines)} lignes`
                        : "Non importé"}
                    </strong>
                  </div>
                </div>
              </div>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Source principale</span>
                    <h3>Balance valorisée des stocks</h3>
                  </div>
                  <small>{data?.meta?.fileName || "PDF requis"}</small>
                </header>
                <label className="manager-kpi-import">
                  <Upload />
                  <span>
                    {importing
                      ? "Analyse en cours…"
                      : "Importer le PDF de stock"}
                  </span>
                  <input
                    ref={stockInput}
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => importFile(e, onImport, "overview")}
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
              </section>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Source de justification</span>
                    <h3>Journal des régularisations BRS</h3>
                  </div>
                  <small>{brsData?.meta?.fileName || "Excel requis"}</small>
                </header>
                <label className="manager-kpi-import">
                  <FileSpreadsheet />
                  <span>
                    {brsImporting
                      ? "Analyse en cours…"
                      : "Importer le fichier BRS"}
                  </span>
                  <input
                    ref={brsInput}
                    type="file"
                    accept=".xlsx,.xls"
                    hidden
                    onChange={(e) => importFile(e, onImportBrs)}
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
              </section>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Import lié obligatoire</span>
                    <h3>Avarie stock + ordre manager</h3>
                  </div>
                  <small>Les deux fichiers sont requis pour l’analyse</small>
                </header>
                <div className="conserve-paired-import">
                  <label className="manager-kpi-import">
                    <AlertTriangle />
                    <span>Importer avarie.pdf</span>
                    <input
                      ref={avarieInput}
                      type="file"
                      accept="application/pdf,.pdf"
                      hidden
                      onChange={(e) => importFile(e, onImportAvarie)}
                    />
                  </label>
                  <label className="manager-kpi-import">
                    <ClipboardCheck />
                    <span>Importer ordre.xls</span>
                    <input
                      ref={ordreInput}
                      type="file"
                      accept=".xlsx,.xls"
                      hidden
                      onChange={(e) => importFile(e, onImportOrdre)}
                    />
                  </label>
                </div>
                {avarieMessage && (
                  <div
                    className={
                      avarieMessage.type === "error"
                        ? "mino-error"
                        : "mino-success"
                    }
                  >
                    {avarieMessage.text}
                  </div>
                )}
                {ordreMessage && (
                  <div
                    className={
                      ordreMessage.type === "error"
                        ? "mino-error"
                        : "mino-success"
                    }
                  >
                    {ordreMessage.text}
                  </div>
                )}
              </section>
              <section className="mino-panel">
                <header>
                  <div>
                    <span>Sources de pilotage</span>
                    <h3>Clients et FELLAH</h3>
                  </div>
                  <small>Fichiers Excel indépendants</small>
                </header>
                <div className="conserve-paired-import">
                  <button
                    className="manager-kpi-import"
                    type="button"
                    onClick={() => clientsInput.current?.click()}
                  >
                    <Users />
                    <span>
                      {clientsData
                        ? `Remplacer la balance clients (${clientsData.totals.clients} clients)`
                        : "Importer la balance clients"}
                    </span>
                  </button>
                  <button
                    className="manager-kpi-import"
                    type="button"
                    onClick={() => fellahInput.current?.click()}
                  >
                    <Factory />
                    <span>
                      {fellahData
                        ? `Remplacer le récapitulatif FELLAH (${fellahData.totals.farmers} fellahs)`
                        : "Importer recap fellah.xlsx"}
                    </span>
                  </button>
                </div>
                {clientsMessage && (
                  <div
                    className={
                      clientsMessage.type === "error"
                        ? "mino-error"
                        : "mino-success"
                    }
                  >
                    {clientsMessage.text}
                  </div>
                )}
                {fellahMessage && (
                  <div
                    className={
                      fellahMessage.type === "error"
                        ? "mino-error"
                        : "mino-success"
                    }
                  >
                    {fellahMessage.text}
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "overview" &&
            (data ? (
              <>
                <section
                  className={`mino-hero ${riskCount ? "uncovered" : "covered"}`}
                >
                  <div>
                    <span>
                      <Factory /> Cockpit de contrôle stock
                    </span>
                    <h2>
                      {riskCount
                        ? "Fiabilisation requise avant toute décision d’achat."
                        : "Position de stock exploitable."}
                    </h2>
                    <p>
                      La balance est la référence de stock. Les régularisations
                      BRS doivent être justifiées, valorisées et rapprochées de
                      cette balance avant d’utiliser les résultats pour
                      commander ou valoriser.
                    </p>
                  </div>
                  <div className="mino-hero-ratio">
                    <small>Valeur de stock</small>
                    <strong>{money(data.totals.finalValue)}</strong>
                    <span>à la date du document</span>
                    <dl>
                      <div>
                        <dt>Articles</dt>
                        <dd>{number(rows.length)}</dd>
                      </div>
                      <div>
                        <dt>Signaux de contrôle</dt>
                        <dd className={riskCount ? "negative" : ""}>
                          {number(riskCount)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>
                <div className="mino-kpi-grid four">
                  <Kpi
                    icon={Boxes}
                    label="Stock valorisé"
                    value={money(data.totals.finalValue)}
                    detail="Valeur finale de la balance"
                    tone="gold"
                  />
                  <Kpi
                    icon={PackageSearch}
                    label="Articles en anomalie"
                    value={number(insights.anomalies.length)}
                    detail={`${insights.negativeQty} quantités négatives · ${insights.unvalued} non valorisés`}
                    tone="alert"
                  />
                  <Kpi
                    icon={ClipboardCheck}
                    label="Lignes BRS"
                    value={brsData ? number(brsData.metrics.lines) : "—"}
                    detail={
                      brsData
                        ? `${number(brsData.metrics.documents)} documents analysés`
                        : "Journal BRS à importer"
                    }
                    tone="burgundy"
                  />
                  <Kpi
                    icon={ShieldCheck}
                    label="Rapprochement BRS"
                    value={
                      brsData
                        ? `${number((insights.matched / brsData.metrics.lines) * 100, 1)} %`
                        : "—"
                    }
                    detail={
                      brsData ? "Articles BRS trouvés en stock" : "Indisponible"
                    }
                    tone="green"
                  />
                </div>
                <div className="conserve-chart-grid">
                  <section className="mino-panel conserve-feature-chart">
                    <header>
                      <div>
                        <span>Concentration financière</span>
                        <h3>Valeur du stock par famille</h3>
                      </div>
                      <small>Valeur finale</small>
                    </header>
                    <div className="mino-chart tall">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={insights.families.slice(0, 8)}
                          layout="vertical"
                          margin={{ left: 12, right: 24 }}
                        >
                          <CartesianGrid
                            horizontal={false}
                            stroke="#e8dfd5"
                            strokeDasharray="3 5"
                          />
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={145} />
                          <Tooltip content={<TooltipCard />} />
                          <Bar
                            dataKey="value"
                            name="Valeur"
                            fill="#7a3024"
                            radius={[0, 8, 8, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                  <section className="mino-panel">
                    <header>
                      <div>
                        <span>État de la balance</span>
                        <h3>Santé des articles</h3>
                      </div>
                      <small>{number(rows.length)} articles</small>
                    </header>
                    <div className="mino-donut">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={insights.stockHealth}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                          >
                            {insights.stockHealth.map((item, i) => (
                              <Cell
                                key={item.name}
                                fill={
                                  ["#3f6f68", "#a33c2e", "#c99715", "#9a6c61"][
                                    i
                                  ]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<TooltipCard />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div>
                        <strong>
                          {number(rows.length - insights.anomalies.length)}
                        </strong>
                        <span>conformes</span>
                      </div>
                    </div>
                    <div className="mino-legend">
                      {insights.stockHealth.map((item, i) => (
                        <div key={item.name}>
                          <i
                            style={{
                              background: [
                                "#3f6f68",
                                "#a33c2e",
                                "#c99715",
                                "#9a6c61",
                              ][i],
                            }}
                          />
                          <span>{item.name}</span>
                          <b>{number(item.value)}</b>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                {brsData && (
                  <div className="conserve-chart-grid brs">
                    <section className="mino-panel conserve-feature-chart">
                      <header>
                        <div>
                          <span>Activité BRS</span>
                          <h3>Régularisations par mois</h3>
                        </div>
                        <small>Lignes et exceptions</small>
                      </header>
                      <div className="mino-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={insights.monthlyBrs}
                            margin={{ left: -18, right: 16, top: 12 }}
                          >
                            <defs>
                              <linearGradient
                                id="brsLines"
                                x1="0"
                                x2="0"
                                y1="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#c99715"
                                  stopOpacity={0.4}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#c99715"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              vertical={false}
                              stroke="#e8dfd5"
                              strokeDasharray="3 5"
                            />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip content={<TooltipCard />} />
                            <Area
                              type="monotone"
                              dataKey="lignes"
                              name="Lignes BRS"
                              stroke="#c99715"
                              strokeWidth={3}
                              fill="url(#brsLines)"
                            />
                            <Area
                              type="monotone"
                              dataKey="negatifs"
                              name="Négatifs"
                              stroke="#a33c2e"
                              strokeWidth={2}
                              fill="transparent"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                    <section className="mino-panel">
                      <header>
                        <div>
                          <span>Nature des mouvements</span>
                          <h3>Répartition BRS</h3>
                        </div>
                      </header>
                      <div className="mino-donut">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={insights.brsTypes}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={55}
                              outerRadius={85}
                              paddingAngle={3}
                            >
                              {insights.brsTypes.map((item, i) => (
                                <Cell
                                  key={item.name}
                                  fill={COLORS[i % COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<TooltipCard />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div>
                          <strong>{number(brsData.metrics.lines)}</strong>
                          <span>lignes BRS</span>
                        </div>
                      </div>
                      <div className="mino-legend">
                        {insights.brsTypes.map((item, i) => (
                          <div key={item.name}>
                            <i
                              style={{ background: COLORS[i % COLORS.length] }}
                            />
                            <span>{item.name}</span>
                            <b>{number(item.value)}</b>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
                <section className="mino-panel">
                  <header>
                    <div>
                      <span>Actions prioritaires</span>
                      <h3>File de contrôle</h3>
                    </div>
                  </header>
                  <div className="mino-alert-list">
                    <div>
                      <span>
                        <AlertTriangle />
                      </span>
                      <div>
                        <strong>Valorisation</strong>
                        <small>Priorité haute</small>
                      </div>
                      <p>
                        {brsData
                          ? `${number(insights.missingCost)} lignes BRS sans coût à compléter.`
                          : "Importer le BRS pour contrôler les coûts."}
                      </p>
                    </div>
                    <div>
                      <span>
                        <PackageSearch />
                      </span>
                      <div>
                        <strong>Stock</strong>
                        <small>À investiguer</small>
                      </div>
                      <p>
                        {number(insights.anomalies.length)} articles comportent
                        un signal de quantité ou de valorisation.
                      </p>
                    </div>
                    <div className="info">
                      <span>
                        <CheckCircle2 />
                      </span>
                      <div>
                        <strong>Rapprochement</strong>
                        <small>Couverture source</small>
                      </div>
                      <p>
                        {brsData
                          ? `${number(insights.matched)} lignes BRS correspondent à un article de la balance.`
                          : "La balance est chargée et prête au rapprochement."}
                      </p>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              empty
            ))}
          {tab === "integrity" &&
            (data ? (
              <>
                <div className="mino-title">
                  <span>
                    <ShieldCheck /> Qualité de la balance
                  </span>
                  <h2>Intégrité et exceptions stock</h2>
                  <p>
                    Ces signaux nécessitent une vérification métier ; ils ne
                    constituent pas automatiquement une erreur comptable.
                  </p>
                </div>
                <div className="mino-kpi-grid four">
                  <Kpi
                    icon={AlertTriangle}
                    label="Exceptions totales"
                    value={number(insights.anomalies.length)}
                    detail="À analyser article par article"
                    tone="alert"
                  />
                  <Kpi
                    icon={Boxes}
                    label="Qtés négatives"
                    value={number(insights.negativeQty)}
                    detail="Risque de rupture ou mouvement non saisi"
                    tone="alert"
                  />
                  <Kpi
                    icon={FileSpreadsheet}
                    label="Valeur négative"
                    value={number(rows.filter((r) => r.finalValue < 0).length)}
                    detail="À réconcilier avec comptabilité"
                    tone="alert"
                  />
                  <Kpi
                    icon={CircleDollarSign}
                    label="Sans valorisation"
                    value={number(insights.unvalued)}
                    detail="Stock positif avec valeur nulle"
                    tone="gold"
                  />
                </div>
                <ExceptionTable rows={insights.anomalies} />
              </>
            ) : (
              empty
            ))}
          {tab === "regularisations" &&
            (brsData ? (
              <>
                <div className="mino-title">
                  <span>
                    <ClipboardCheck /> Audit des régularisations
                  </span>
                  <h2>Contrôle BRS avant analyse du stock</h2>
                  <p>
                    Les BRS servent à expliquer les corrections et conversions.
                    Les coûts manquants et mouvements négatifs doivent être
                    validés avant leur utilisation analytique.
                  </p>
                </div>
                <div className="mino-kpi-grid four">
                  <Kpi
                    icon={FileSpreadsheet}
                    label="Documents BRS"
                    value={number(brsData.metrics.documents)}
                    detail={`${number(brsData.metrics.lines)} lignes`}
                    tone="burgundy"
                  />
                  <Kpi
                    icon={AlertTriangle}
                    label="Mouvements négatifs"
                    value={number(insights.negativeBrs)}
                    detail="Quantité ou montant négatif"
                    tone="alert"
                  />
                  <Kpi
                    icon={CircleDollarSign}
                    label="Coûts manquants"
                    value={number(insights.missingCost)}
                    detail={`${number((insights.missingCost / brsData.metrics.lines) * 100, 1)} % des lignes`}
                    tone="alert"
                  />
                  <Kpi
                    icon={CheckCircle2}
                    label="Articles rapprochés"
                    value={`${number((insights.matched / brsData.metrics.lines) * 100, 1)} %`}
                    detail="Présents dans la balance stock"
                    tone="green"
                  />
                </div>
                <div className="mino-grid equal">
                  <section className="mino-panel">
                    <header>
                      <div>
                        <span>Nature des mouvements</span>
                        <h3>Types de régularisation</h3>
                      </div>
                    </header>
                    <div className="mino-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={insights.brsTypes}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={55}
                            outerRadius={86}
                            paddingAngle={3}
                          >
                            {insights.brsTypes.map((item, i) => (
                              <Cell
                                key={item.name}
                                fill={COLORS[i % COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<TooltipCard />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                  <BRSExceptionTable rows={insights.brsIssues} />
                </div>
              </>
            ) : (
              <section className="mino-panel">
                <div className="cost-accounting-empty">
                  <ClipboardCheck />
                  <div>
                    <strong>Importez le journal BRS</strong>
                    <p>
                      Il est indispensable pour distinguer une position de stock
                      d’une régularisation à justifier.
                    </p>
                    <button onClick={() => setTab("import")}>
                      Ouvrir les sources
                    </button>
                  </div>
                </div>
              </section>
            ))}
          {tab === "avarie" && (
            <AvarieView
              avarie={avarie}
              avarieData={avarieData}
              ordreData={ordreData}
              onImport={() => setTab("import")}
            />
          )}
          {tab === "stock" && (data ? <StockTable rows={rows} /> : empty)}
          {tab === "overview" && data && (
            <IntegratedStockControls
              insights={insights}
              rows={rows}
              brsData={brsData}
              avarie={avarie}
              avarieData={avarieData}
              ordreData={ordreData}
              onImport={() => setTab("import")}
            />
          )}
          {tab === "clients" && (
            <ClientsDashboard
              data={clientsData}
              onImport={() => clientsInput.current?.click()}
              message={clientsMessage}
            />
          )}
          {tab === "fellah" && (
            <FellahView
              data={fellahData}
              onImport={() => fellahInput.current?.click()}
              message={fellahMessage}
            />
          )}
          <input
            ref={clientsInput}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(event) => importFile(event, onImportClients)}
          />
          <input
            ref={fellahInput}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(event) => importFile(event, onImportFellah)}
          />
        </section>
      </main>
      {importPasswordOpen && (
        <div
          className="credit-calc-layer"
          role="presentation"
          onMouseDown={() => setImportPasswordOpen(false)}
        >
          <form
            className="credit-calc-box import-password-dialog"
            onSubmit={validateImportPassword}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="credit-calc-close"
              type="button"
              onClick={() => setImportPasswordOpen(false)}
              aria-label="Fermer"
            >
              <X />
            </button>
            <span>Accès protégé</span>
            <h3>Sources & import</h3>
            <p>
              Entrez le mot de passe pour accéder à l’importation et au
              remplacement des fichiers.
            </p>
            <label>
              <small>Mot de passe</small>
              <input
                type="password"
                autoFocus
                value={importPassword}
                onChange={(event) => setImportPassword(event.target.value)}
                aria-label="Mot de passe Sources et import"
              />
            </label>
            {importPasswordError && (
              <div className="import-password-error">{importPasswordError}</div>
            )}
            <button className="import-password-submit" type="submit">
              Ouvrir Sources & import
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function FellahView({ data, onImport, message }) {
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const [query, setQuery] = useState("");
  const [chartInfo, setChartInfo] = useState(null);
  if (!data)
    return (
      <>
        <div className="mino-title">
          <span>
            <Factory /> Filière tomate
          </span>
          <h2>FELLAH</h2>
          <p>
            Suivi des contrats, quantités de tomate, avances et soldes des
            fellahs.
          </p>
        </div>
        <section className="mino-panel">
          <div className="cost-accounting-empty">
            <Factory />
            <div>
              <strong>Importez le récapitulatif FELLAH</strong>
              <p>
                Le dashboard utilisera uniquement la feuille officielle RECAP de
                l’année 2025.
              </p>
              <button onClick={onImport}>Importer recap fellah.xlsx</button>
              {message && <p>{message.text}</p>}
            </div>
          </div>
        </section>
      </>
    );
  const sum = (rows, key) =>
    rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const wilayas = [...new Set(data.farmers.map((row) => row.wilaya))].sort();
  const communes = [
    ...new Set(
      data.farmers
        .filter((row) => !wilaya || row.wilaya === wilaya)
        .map((row) => row.commune),
    ),
  ].sort();
  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const scoped = data.farmers
    .filter(
      (row) =>
        (!wilaya || row.wilaya === wilaya) &&
        (!commune || row.commune === commune),
    )
    .filter(
      (row) =>
        !normalizedQuery ||
        `${row.order} ${row.name} ${row.commune}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(normalizedQuery),
    );
  const totals = {
    farmers: scoped.length,
    area: sum(scoped, "area"),
    expected: sum(scoped, "expected"),
    declared: sum(scoped, "declared"),
    actualGap: sum(scoped, "actualGap"),
    tomatoValue: sum(scoped, "tomatoValue"),
    advance: sum(scoped, "advance"),
    balance: sum(scoped, "balance"),
  };
  const rate = totals.expected ? (totals.declared / totals.expected) * 100 : 0;
  const byWilaya = [
    ...scoped
      .reduce((map, row) => {
        const item = map.get(row.wilaya) || {
          name: row.wilaya,
          expected: 0,
          declared: 0,
          area: 0,
        };
        item.expected += row.expected;
        item.declared += row.declared;
        item.area += row.area;
        map.set(row.wilaya, item);
        return map;
      }, new Map())
      .values(),
  ].sort((a, b) => b.expected - a.expected);
  const topDeclared = [...scoped]
    .sort((a, b) => b.declared - a.declared)
    .slice(0, 8)
    .map((row) => ({ ...row, label: `${row.order} · ${row.name}` }));
  const topPositive = [...scoped]
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8)
    .map((row) => ({ ...row, label: `${row.order} · ${row.name}` }));
  const topNegative = [...scoped]
    .filter((row) => row.balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      label: `${row.order} · ${row.name}`,
      balanceAbs: Math.abs(row.balance),
    }));
  const balances = [
    {
      name: "À payer aux fellahs",
      value: sum(
        scoped.filter((row) => row.balance > 0),
        "balance",
      ),
    },
    {
      name: "Avances à régulariser",
      value: Math.abs(
        sum(
          scoped.filter((row) => row.balance < 0),
          "balance",
        ),
      ),
    },
  ];
  const settledCount = scoped.filter((row) => row.balance === 0).length;
  const controls = scoped.filter(
    (row) =>
      row.formulaUsesNewYield ||
      row.missingExpected ||
      (row.tomatoValue > 0 && row.advance > row.tomatoValue),
  );
  const positiveBalance = balances[0].value;
  const negativeBalance = balances[1].value;
  const status = (row) => {
    if (row.missingExpected) return ["Prévu manquant", "warn"];
    if (row.formulaUsesNewYield) return ["Rendement à vérifier", "warn"];
    if (row.advance > row.tomatoValue) return ["Avance à régulariser", "warn"];
    if (row.actualGap > 0) return ["Sous prévision", "warn"];
    if (row.actualGap < 0) return ["Au-dessus du prévu", "ok"];
    return ["Conforme", "ok"];
  };
  const openChartInfo = (title, meaning, formula, manager) =>
    setChartInfo({ title, meaning, formula, manager });
  return (
    <>
      <div className="mino-title">
        <span>
          <Factory /> Filière tomate · 2025
        </span>
        <h2>FELLAH — contrats, récolte et soldes</h2>
        <p>
          Source officielle : feuille <strong>RECAP</strong>. La différence de
          quantité est recalculée sur quantité prévue − quantité déclarée.
        </p>
      </div>
      <section className="mino-hero covered">
        <div>
          <span>
            <CircleDollarSign /> Lecture financière
          </span>
          <h2>
            {totals.balance < 0
              ? "Les avances dépassent la valeur déclarée."
              : "Des montants restent à payer aux fellahs."}
          </h2>
          <p>
            Valeur tomate : {money(totals.tomatoValue)} DA · Avances :{" "}
            {money(totals.advance)} DA · Solde net : {money(totals.balance)} DA.
          </p>
        </div>
        <div className="mino-hero-ratio">
          <small>Taux de réalisation</small>
          <strong>{number(rate, 1)} %</strong>
          <span>{number(totals.declared)} kg déclarés</span>
        </div>
      </section>
      <section className="mino-panel fellah-filter-panel">
        <header>
          <div>
            <span>Filtres</span>
            <h3>Périmètre d’analyse</h3>
          </div>
          <small>{number(scoped.length)} fellahs affichés</small>
        </header>
        <div className="fellah-slicers">
          <label className="avarie-slicer">
            <span>Wilaya</span>
            <select
              value={wilaya}
              onChange={(event) => {
                setWilaya(event.target.value);
                setCommune("");
              }}
            >
              <option value="">Toutes les wilayas</option>
              {wilayas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="avarie-slicer">
            <span>Commune</span>
            <select
              value={commune}
              onChange={(event) => setCommune(event.target.value)}
            >
              <option value="">Toutes les communes</option>
              {communes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="fellah-search">
            <span>Rechercher</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, contrat ou commune"
            />
          </label>
          {(wilaya || commune || query) && (
            <button
              onClick={() => {
                setWilaya("");
                setCommune("");
                setQuery("");
              }}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      </section>
      <div className="fellah-section-heading">
        <span>Vue décisionnelle</span>
        <h3>Contrats et récolte</h3>
      </div>
      <div className="mino-kpi-grid four">
        <Kpi
          icon={Users}
          label="Fellahs actifs"
          value={number(totals.farmers)}
          detail="Contrats actifs dans RECAP"
          tone="green"
        />
        <Kpi
          icon={Factory}
          label="Superficie totale"
          value={`${number(totals.area, 2)} ha`}
          detail="Surface contractuelle"
          tone="gold"
        />
        <Kpi
          icon={Boxes}
          label="Quantité prévue"
          value={`${number(totals.expected)} kg`}
          detail="Plan contractuel"
          tone="gold"
        />
        <Kpi
          icon={PackageSearch}
          label="Quantité déclarée"
          value={`${number(totals.declared)} kg`}
          detail={`${number(totals.actualGap)} kg d’écart réel`}
          tone="green"
        />
        <Kpi
          icon={BarChart3}
          label="Taux de réalisation"
          value={`${number(rate, 1)} %`}
          detail="Déclaré ÷ prévu"
          tone="burgundy"
        />
        <Kpi
          icon={CircleDollarSign}
          label="Solde net fellahs"
          value={`${money(totals.balance)} DA`}
          detail={
            totals.balance < 0
              ? "Avances supérieures à la valeur"
              : "Montants à payer"
          }
          tone={totals.balance < 0 ? "alert" : "green"}
        />
      </div>
      <section className="fellah-manager-reading">
        <div>
          <span>Lecture production</span>
          <strong>{number(rate, 1)} % réalisé</strong>
          <p>
            {number(Math.abs(totals.actualGap))} kg{" "}
            {totals.actualGap >= 0
              ? "sous le prévisionnel"
              : "au-dessus du prévisionnel"}
          </p>
        </div>
        <div>
          <span>Engagement à payer</span>
          <strong>{money(positiveBalance)} DA</strong>
          <p>
            {number(scoped.filter((row) => row.balance > 0).length)} fellahs
            avec solde positif
          </p>
        </div>
        <div className="risk">
          <span>Avances à régulariser</span>
          <strong>{money(negativeBalance)} DA</strong>
          <p>
            {number(scoped.filter((row) => row.balance < 0).length)} fellahs
            avec solde négatif
          </p>
        </div>
        <div className={controls.length ? "risk" : "ok"}>
          <span>Qualité des données</span>
          <strong>{number(controls.length)} alertes</strong>
          <p>Contrats nécessitant une validation</p>
        </div>
      </section>
      <div className="fellah-section-heading">
        <span>Performance agricole</span>
        <h3>Récolte et couverture territoriale</h3>
      </div>
      <div className="conserve-chart-grid">
        <section className="mino-panel conserve-feature-chart">
          <header>
            <div>
              <span>Récolte par zone</span>
              <h3>Prévisionnel et déclaré par wilaya</h3>
            </div>
            <small>kg</small>
          </header>
          <div
            className="mino-chart tall fellah-clickable-chart"
            role="button"
            tabIndex={0}
            onClick={() =>
              openChartInfo(
                "Prévisionnel et déclaré par wilaya",
                "يعرض هذا الرسم مقارنة الكمية المتوقعة مع الكمية المصرح بها في كل ولاية، وفق الفلاتر المختارة.",
                "لكل ولاية: مجموع Quantité Prévisionnelle ومجموع QNT DECLARE من ورقة RECAP.",
                "ابدأ بالولاية ذات أكبر فرق بين المتوقع والمصرح به، ثم راجع البلديات والعقود داخلها.",
              )
            }
            onKeyDown={(event) =>
              event.key === "Enter" &&
              openChartInfo(
                "Prévisionnel et déclaré par wilaya",
                "يعرض هذا الرسم مقارنة الكمية المتوقعة مع الكمية المصرح بها في كل ولاية، وفق الفلاتر المختارة.",
                "لكل ولاية: مجموع Quantité Prévisionnelle ومجموع QNT DECLARE من ورقة RECAP.",
                "ابدأ بالولاية ذات أكبر فرق بين المتوقع والمصرح به، ثم راجع البلديات والعقود داخلها.",
              )
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byWilaya}
                margin={{ left: 0, right: 18, top: 10 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e8dfd5"
                  strokeDasharray="3 5"
                />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip content={<TooltipCard />} />
                <Bar
                  dataKey="expected"
                  name="Quantité prévue"
                  fill="#c99715"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="declared"
                  name="Quantité déclarée"
                  fill="#3f6f68"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="mino-panel">
          <header>
            <div>
              <span>Top récolte</span>
              <h3>Fellahs par quantité déclarée</h3>
            </div>
            <small>Top 8</small>
          </header>
          <div
            className="mino-chart tall fellah-clickable-chart"
            role="button"
            tabIndex={0}
            onClick={() =>
              openChartInfo(
                "Fellahs par quantité déclarée",
                "يرتب الفلاحين حسب إجمالي الكمية المصرح بها، ولا يمثل بالضرورة المبلغ المستحق أو جودة العقد.",
                "ترتيب تنازلي لمجموع QNT DECLARE لكل فلاح بعد تطبيق الفلاتر، ثم عرض أكبر 8.",
                "استخدمه لتحديد الفلاحين ذوي الأثر الأكبر على حجم المحصول، ثم راجع نسبة إنجازهم ورصيدهم المالي بشكل منفصل.",
              )
            }
            onKeyDown={(event) =>
              event.key === "Enter" &&
              openChartInfo(
                "Fellahs par quantité déclarée",
                "يرتب الفلاحين حسب إجمالي الكمية المصرح بها، ولا يمثل بالضرورة المبلغ المستحق أو جودة العقد.",
                "ترتيب تنازلي لمجموع QNT DECLARE لكل فلاح بعد تطبيق الفلاتر، ثم عرض أكبر 8.",
                "استخدمه لتحديد الفلاحين ذوي الأثر الأكبر على حجم المحصول، ثم راجع نسبة إنجازهم ورصيدهم المالي بشكل منفصل.",
              )
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topDeclared}
                layout="vertical"
                margin={{ left: 10, right: 16 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#e8dfd5"
                  strokeDasharray="3 5"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={145}
                  tickFormatter={(value) =>
                    value.length > 24 ? `${value.slice(0, 24)}…` : value
                  }
                />
                <Tooltip content={<TooltipCard />} />
                <Bar
                  dataKey="declared"
                  name="Quantité déclarée"
                  fill="#7a3024"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <div className="fellah-section-heading">
        <span>Risque financier</span>
        <h3>Soldes, paiements et régularisations</h3>
      </div>
      <div className="conserve-chart-grid">
        <section className="mino-panel">
          <header>
            <div>
              <span>Situation des soldes</span>
              <h3>À payer, avances et réglés</h3>
            </div>
            <small>DA · sauf soldes réglés</small>
          </header>
          <div
            className="mino-donut fellah-clickable-chart"
            role="button"
            tabIndex={0}
            onClick={() =>
              openChartInfo(
                "Situation des soldes",
                "يوضح القيم المالية للأرصدة المفتوحة فقط: ما يجب دفعه للفلاحين، وفائض التسبيقات الذي يحتاج تسوية.",
                "الرصيد = قيمة الطماطم − التسبيق. تجمع الأرصدة الموجبة في فئة À payer، والقيمة المطلقة للأرصدة السالبة في فئة Avances à régulariser.",
                "لا تعتبر فائض التسبيق خسارة تلقائية؛ حدد لكل فلاح هل يُسترجع المبلغ أو يُرحل للموسم القادم بعد التحقق من مصدر التسبيق.",
              )
            }
            onKeyDown={(event) =>
              event.key === "Enter" &&
              openChartInfo(
                "Situation des soldes",
                "يوضح القيم المالية للأرصدة المفتوحة فقط: ما يجب دفعه للفلاحين، وفائض التسبيقات الذي يحتاج تسوية.",
                "الرصيد = قيمة الطماطم − التسبيق. تجمع الأرصدة الموجبة في فئة À payer، والقيمة المطلقة للأرصدة السالبة في فئة Avances à régulariser.",
                "لا تعتبر فائض التسبيق خسارة تلقائية؛ حدد لكل فلاح هل يُسترجع المبلغ أو يُرحل للموسم القادم بعد التحقق من مصدر التسبيق.",
              )
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={balances}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  <Cell fill="#3f6f68" />
                  <Cell fill="#7a3024" />
                </Pie>
                <Tooltip content={<TooltipCard />} />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <strong>
                {number(scoped.filter((row) => row.balance !== 0).length)}
              </strong>
              <span>dossiers ouverts</span>
            </div>
          </div>
          <div className="mino-legend">
            {balances.map((row, index) => (
              <div key={row.name}>
                <i
                  style={{
                    background: ["#3f6f68", "#7a3024"][index],
                  }}
                />
                <span>{row.name}</span>
                <b>{`${money(row.value)} DA`}</b>
              </div>
            ))}
          </div>
          <p className="fellah-settled-note">
            <CheckCircle2 /> {number(settledCount)} contrats avec solde réglé
          </p>
        </section>
        <section className="mino-panel">
          <header>
            <div>
              <span>Contrôles données</span>
              <h3>Contrats à vérifier</h3>
            </div>
            <small>{number(controls.length)} cas</small>
          </header>
          <details className="fellah-controls-details">
            <summary>
              <span>Afficher les contrôles détaillés</span>
              <ArrowLeft />
            </summary>
            <div className="mino-alert-list">
              {controls.length ? (
                controls.map((row) => (
                  <div key={row.order}>
                    <span>
                      <AlertTriangle />
                    </span>
                    <div>
                      <strong>
                        {row.order} · {row.name}
                      </strong>
                      <small>{row.commune}</small>
                    </div>
                    <p>
                      {row.missingExpected
                        ? "Quantité prévue absente malgré une quantité déclarée."
                        : row.formulaUsesNewYield
                          ? "Écart basé sur le nouveau rendement, actuellement vide."
                          : "Avance supérieure à la valeur de tomate enregistrée."}
                    </p>
                  </div>
                ))
              ) : (
                <div className="info">
                  <span>
                    <CheckCircle2 />
                  </span>
                  <div>
                    <strong>Aucun signal</strong>
                    <small>Selon le filtre actuel</small>
                  </div>
                  <p>
                    Les contrats affichés ne présentent pas cette anomalie de
                    calcul.
                  </p>
                </div>
              )}
              <div className="info">
                <span>
                  <Database />
                </span>
                <div>
                  <strong>Avances liées</strong>
                  <small>À rapprocher</small>
                </div>
                <p>
                  {data.meta.externalAdvanceLinks
                    ? "Les avances sont issues de formules liées à des fichiers externes ; validez-les avant règlement."
                    : "Aucun lien externe détecté dans les avances importées."}
                </p>
              </div>
            </div>
          </details>
        </section>
      </div>
      <div className="fellah-section-heading">
        <span>Actions prioritaires</span>
        <h3>Décisions de paiement et de régularisation</h3>
      </div>
      <div className="conserve-chart-grid">
        <section className="mino-panel">
          <header>
            <div>
              <span>Priorité de paiement</span>
              <h3>Fellahs à payer</h3>
            </div>
            <small>Top 8 soldes positifs · DA</small>
          </header>
          <div
            className="mino-chart tall fellah-clickable-chart"
            role="button"
            tabIndex={0}
            onClick={() =>
              openChartInfo(
                "Fellahs à payer",
                "يعرض أكبر الفلاحين ذوي الرصيد الموجب؛ أي المبالغ التي ما زالت الشركة مطالبة بدفعها لهم.",
                "الرصيد الموجب = قيمة الطماطم − التسبيق، ثم ترتيب تنازلي وعرض أكبر 8 أرصدة موجبة.",
                "هذه قائمة أولوية الدفع. تحقق من العقد والتسبيق وكمية الطماطم قبل إصدار أمر الدفع.",
              )
            }
            onKeyDown={(event) =>
              event.key === "Enter" &&
              openChartInfo(
                "Fellahs à payer",
                "يعرض أكبر الفلاحين ذوي الرصيد الموجب؛ أي المبالغ التي ما زالت الشركة مطالبة بدفعها لهم.",
                "الرصيد الموجب = قيمة الطماطم − التسبيق، ثم ترتيب تنازلي وعرض أكبر 8 أرصدة موجبة.",
                "هذه قائمة أولوية الدفع. تحقق من العقد والتسبيق وكمية الطماطم قبل إصدار أمر الدفع.",
              )
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topPositive}
                layout="vertical"
                margin={{ left: 10, right: 16 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#e8dfd5"
                  strokeDasharray="3 5"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={145}
                  tickFormatter={(value) =>
                    value.length > 24 ? `${value.slice(0, 24)}…` : value
                  }
                />
                <Tooltip content={<ClientTooltip />} />
                <Bar
                  dataKey="balance"
                  name="Solde à payer"
                  fill="#3f6f68"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="mino-panel">
          <header>
            <div>
              <span>Priorité de régularisation</span>
              <h3>Avances excédentaires</h3>
            </div>
            <small>Top 8 soldes négatifs · DA</small>
          </header>
          <div
            className="mino-chart tall fellah-clickable-chart"
            role="button"
            tabIndex={0}
            onClick={() =>
              openChartInfo(
                "Avances excédentaires",
                "يعرض أكبر الأرصدة السالبة، حيث التسبيق المسجل أعلى من قيمة الطماطم المسجلة للفلاح.",
                "القيمة المعروضة هي القيمة المطلقة للرصيد السالب = التسبيق − قيمة الطماطم، ثم ترتيب تنازلي لأكبر 8 حالات.",
                "ابدأ بأكبر الحالات، ثم قرر مع الإدارة: استرجاع، تسوية، أو ترحيل للموسم المقبل. لا تعتمد القرار قبل تأكيد التسبيقات المرتبطة بمصدر خارجي.",
              )
            }
            onKeyDown={(event) =>
              event.key === "Enter" &&
              openChartInfo(
                "Avances excédentaires",
                "يعرض أكبر الأرصدة السالبة، حيث التسبيق المسجل أعلى من قيمة الطماطم المسجلة للفلاح.",
                "القيمة المعروضة هي القيمة المطلقة للرصيد السالب = التسبيق − قيمة الطماطم، ثم ترتيب تنازلي لأكبر 8 حالات.",
                "ابدأ بأكبر الحالات، ثم قرر مع الإدارة: استرجاع، تسوية، أو ترحيل للموسم المقبل. لا تعتمد القرار قبل تأكيد التسبيقات المرتبطة بمصدر خارجي.",
              )
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topNegative}
                layout="vertical"
                margin={{ left: 10, right: 16 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#e8dfd5"
                  strokeDasharray="3 5"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={145}
                  tickFormatter={(value) =>
                    value.length > 24 ? `${value.slice(0, 24)}…` : value
                  }
                />
                <Tooltip content={<ClientTooltip />} />
                <Bar
                  dataKey="balanceAbs"
                  name="Avance à régulariser"
                  fill="#7a3024"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      {data.control?.walidAvailable && (
        <section className="mino-panel fellah-reconciliation">
          <header>
            <div>
              <span>Contrôle non fusionné</span>
              <h3>RECAP vs RECAP pour Walid</h3>
            </div>
            <small>Les deux feuilles restent séparées</small>
          </header>
          <div className="mino-alert-list">
            <div
              className={
                Math.abs(data.control.walidAdvanceDifference) > 0.01
                  ? ""
                  : "info"
              }
            >
              <span>
                {Math.abs(data.control.walidAdvanceDifference) > 0.01 ? (
                  <AlertTriangle />
                ) : (
                  <CheckCircle2 />
                )}
              </span>
              <div>
                <strong>Écart des avances finales</strong>
                <small>À justifier avant toute fusion</small>
              </div>
              <p>
                RECAP : {money(data.control.recapFinalAdvance)} DA · Walid :{" "}
                {money(data.control.walidFinalAdvance)} DA · Écart :{" "}
                {money(data.control.walidAdvanceDifference)} DA.
              </p>
            </div>
          </div>
        </section>
      )}
      {chartInfo && (
        <div
          className="credit-calc-layer"
          role="presentation"
          onMouseDown={() => setChartInfo(null)}
        >
          <section
            className="credit-calc-box manager-kpi-explanation fellah-chart-explanation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fellah-chart-info"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="credit-calc-close"
              onClick={() => setChartInfo(null)}
              aria-label="Fermer"
            >
              <X />
            </button>
            <span>شرح الرسم للمدير</span>
            <h3 id="fellah-chart-info">{chartInfo.title}</h3>
            <div className="manager-kpi-section" dir="rtl">
              <h4>ماذا يعرض هذا الرسم؟</h4>
              <p>{chartInfo.meaning}</p>
            </div>
            <div className="manager-kpi-section" dir="rtl">
              <h4>كيف تم حسابه؟</h4>
              <code>{chartInfo.formula}</code>
            </div>
            <div className="manager-kpi-section sources" dir="rtl">
              <h4>مصدر البيانات</h4>
              <p>
                <Database size={15} />
                <span>
                  recap fellah.xlsx · ورقة RECAP · حسب الفلاتر الحالية
                </span>
              </p>
            </div>
            <div className="manager-kpi-manager" dir="rtl">
              <strong>قراءة المدير</strong>
              <p>{chartInfo.manager}</p>
            </div>
          </section>
        </div>
      )}
      <OptionalTable
        title="Détail des contrats FELLAH"
        note={`${number(scoped.length)} fellahs · trié par solde`}
      >
        <section className="mino-panel">
          <div className="mino-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Contrat</th>
                  <th>Fellah</th>
                  <th>Wilaya</th>
                  <th>Commune</th>
                  <th>Surface</th>
                  <th>Prévu kg</th>
                  <th>Déclaré kg</th>
                  <th>Écart réel kg</th>
                  <th>Valeur tomate</th>
                  <th>Avance</th>
                  <th>Solde</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {[...scoped]
                  .sort((a, b) => b.balance - a.balance)
                  .map((row) => (
                    <tr key={row.order}>
                      <td>
                        <strong>{row.order}</strong>
                      </td>
                      <td>{row.name}</td>
                      <td>{row.wilaya}</td>
                      <td>{row.commune}</td>
                      <td>{number(row.area, 2)}</td>
                      <td>{number(row.expected)}</td>
                      <td>{number(row.declared)}</td>
                      <td
                        className={
                          row.actualGap > 0
                            ? "bad"
                            : row.actualGap < 0
                              ? "advance-value"
                              : ""
                        }
                      >
                        {number(row.actualGap)}
                      </td>
                      <td>{money(row.tomatoValue)}</td>
                      <td>{money(row.advance)}</td>
                      <td
                        className={
                          row.balance < 0
                            ? "bad"
                            : row.balance > 0
                              ? "advance-value"
                              : ""
                        }
                      >
                        {money(row.balance)}
                      </td>
                      <td>
                        <span className={`status-pill ${status(row)[1]}`}>
                          {status(row)[0]}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </OptionalTable>
    </>
  );
}
function ExceptionTable({ rows }) {
  return (
    <section className="mino-panel">
      <header>
        <div>
          <span>Exceptions détectées</span>
          <h3>Articles à vérifier</h3>
        </div>
        <small>{number(rows.length)} lignes</small>
      </header>
      <div className="mino-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th>Désignation</th>
              <th>Famille</th>
              <th>Qté finale</th>
              <th>Valeur finale</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <strong>{r.articleCode}</strong>
                </td>
                <td>{r.description}</td>
                <td>{r.family}</td>
                <td className={r.finalQuantity < 0 ? "bad" : ""}>
                  {number(r.finalQuantity, 2)}
                </td>
                <td className={r.finalValue < 0 ? "bad" : ""}>
                  {money(r.finalValue)}
                </td>
                <td>
                  <span className="status-pill warn">
                    {r.finalQuantity < 0
                      ? "Qté négative"
                      : r.finalValue < 0
                        ? "Valeur négative"
                        : "Sans valeur"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function BRSExceptionTable({ rows }) {
  return (
    <section className="mino-panel">
      <header>
        <div>
          <span>File de validation</span>
          <h3>BRS à justifier</h3>
        </div>
        <small>{number(rows.length)} lignes</small>
      </header>
      <div className="mino-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Document</th>
              <th>Article</th>
              <th>Type</th>
              <th>Qté</th>
              <th>Coût</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 250).map((r, i) => (
              <tr key={`${r.regularization}-${r.articleCode}-${i}`}>
                <td>{r.date}</td>
                <td>
                  <strong>{r.regularization}</strong>
                </td>
                <td>
                  {r.articleCode}
                  <small>{r.description}</small>
                </td>
                <td>{r.type}</td>
                <td className={r.quantity < 0 ? "bad" : ""}>
                  {number(r.quantity, 2)}
                </td>
                <td className={r.cost === 0 ? "bad" : ""}>{money(r.cost)}</td>
                <td>
                  <span className="status-pill warn">
                    {r.cost === 0
                      ? "Coût manquant"
                      : r.quantity < 0 || r.amount < 0
                        ? "Négatif"
                        : "À vérifier"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function IntegratedStockControls({
  insights,
  rows,
  brsData,
  avarie,
  avarieData,
  ordreData,
  onImport,
}) {
  return (
    <div className="integrated-stock-controls">
      <div className="mino-title">
        <span>
          <ShieldCheck /> Contrôles intégrés
        </span>
        <h2>Qualité, régularisations et avarie</h2>
        <p>
          Une seule lecture du stock : position, exceptions, BRS et avarie sont
          reliés dans le même espace d’analyse.
        </p>
      </div>
      <div className="mino-kpi-grid four">
        <Kpi
          icon={AlertTriangle}
          label="Exceptions stock"
          value={number(insights.anomalies.length)}
          detail={`${number(insights.negativeQty)} quantités négatives`}
          tone="alert"
        />
        <Kpi
          icon={CircleDollarSign}
          label="Sans valorisation"
          value={number(insights.unvalued)}
          detail="Stock positif à valeur nulle"
          tone="gold"
        />
        <Kpi
          icon={ClipboardCheck}
          label="BRS à justifier"
          value={brsData ? number(insights.brsIssues.length) : "—"}
          detail={
            brsData ? "Coût manquant ou mouvement négatif" : "BRS non importé"
          }
          tone="burgundy"
        />
        <Kpi
          icon={PackageSearch}
          label="Articles stock"
          value={number(rows.length)}
          detail="Balance PDF complète"
          tone="green"
        />
      </div>
      {avarie && <AvarieMonthlyChart avarie={avarie} />}
      <AvarieView
        avarie={avarie}
        avarieData={avarieData}
        ordreData={ordreData}
        onImport={onImport}
      />
      <OptionalTable
        title="Exceptions de stock"
        note={`${number(insights.anomalies.length)} articles à vérifier`}
      >
        <ExceptionTable rows={insights.anomalies} />
      </OptionalTable>
      {brsData && (
        <OptionalTable
          title="File de validation BRS"
          note={`${number(insights.brsIssues.length)} lignes à justifier`}
        >
          <BRSExceptionTable rows={insights.brsIssues} />
        </OptionalTable>
      )}
      <OptionalTable
        title="Balance détaillée du stock"
        note={`${number(rows.length)} articles reconnus`}
      >
        <StockTable rows={rows} />
      </OptionalTable>
    </div>
  );
}

function AvarieMonthlyChart({ avarie }) {
  const [category, setCategory] = useState("");
  const scoped = category
    ? avarie.records.filter((row) => row.category === category)
    : avarie.records;
  const monthly = [
    ...scoped
      .reduce((map, row) => {
        const [, month, year] =
          String(row.date).match(/^\d{2}\/(\d{2})\/(\d{4})$/) || [];
        const key = month && year ? `${year}-${month}` : "Sans date";
        const item = map.get(key) || {
          key,
          month: month && year ? `${month}/${year}` : key,
          quantity: 0,
          oualidQuantity: 0,
        };
        item.quantity += row.quantity;
        if (row.order?.oualidOrder) item.oualidQuantity += row.quantity;
        map.set(key, item);
        return map;
      }, new Map())
      .entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, item]) => item);
  const categories = [
    ...scoped
      .reduce((map, row) => {
        const item = map.get(row.category) || {
          name: row.category,
          quantity: 0,
        };
        item.quantity += row.quantity;
        map.set(row.category, item);
        return map;
      }, new Map())
      .values(),
  ].sort((a, b) => b.quantity - a.quantity);
  return (
    <div className="conserve-chart-grid brs">
      <section className="mino-panel conserve-feature-chart avarie-monthly-chart">
        <header>
          <div>
            <span>Activité avarie</span>
            <h3>Avaries par mois</h3>
          </div>
          <label className="avarie-slicer">
            <span>Catégorie</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Toutes les catégories</option>
              {avarie.categories.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="mino-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={monthly}
              margin={{ left: -12, right: 18, top: 12 }}
            >
              <defs>
                <linearGradient id="avarieQuantity" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#c99715" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="#c99715" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#e8dfd5"
                strokeDasharray="3 5"
              />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip content={<TooltipCard />} />
              <Area
                type="monotone"
                dataKey="quantity"
                name="Quantité avarie"
                stroke="#c99715"
                strokeWidth={3}
                fill="url(#avarieQuantity)"
              />
              <Area
                type="monotone"
                dataKey="oualidQuantity"
                name="Quantité ordre Oualid"
                stroke="#7a3024"
                strokeWidth={2.5}
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="mino-panel">
        <header>
          <div>
            <span>Filtre avarie</span>
            <h3>Quantité par nature</h3>
          </div>
          <small>{category || "Classification automatique"}</small>
        </header>
        <div className="mino-donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categories}
                dataKey="quantity"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {categories.map((item, index) => (
                  <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<TooltipCard />} />
            </PieChart>
          </ResponsiveContainer>
          <div>
            <strong>
              {number(
                scoped.reduce((sum, row) => sum + row.quantity, 0),
                1,
              )}
            </strong>
            <span>quantité</span>
          </div>
        </div>
        <div className="mino-legend">
          {categories.map((item, index) => (
            <div key={item.name}>
              <i style={{ background: COLORS[index % COLORS.length] }} />
              <span>{item.name}</span>
              <b>{number(item.quantity, 1)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ClientsDashboard({ data, onImport, message }) {
  const [period, setPeriod] = useState("");
  if (!data)
    return (
      <section className="mino-panel">
        <div className="cost-accounting-empty">
          <Users />
          <div>
            <strong>Importez la balance clients</strong>
            <p>
              Chargez la Balance Client En Livraison pour analyser chiffre
              d’affaires, encaissements et créances.
            </p>
            <button onClick={onImport}>Importer le fichier clients</button>
            {message && <p>{message.text}</p>}
          </div>
        </div>
      </section>
    );
  const clients = data.clients;
  const reportingPeriod = data.meta?.period || "";
  const periodLabel = reportingPeriod
    ? new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(new Date(`${reportingPeriod}-01T12:00:00`))
    : "Période du fichier";
  const debtors = clients
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const clientFinance = [
    { name: "Chiffre d’affaires", amount: data.totals.sales, color: "#c99715" },
    { name: "Encaissements", amount: data.totals.payments, color: "#3f6f68" },
    {
      name: "Créances à recouvrer",
      amount: data.totals.receivable,
      color: "#7a3024",
    },
    { name: "Avances clients", amount: data.totals.advances, color: "#9a6c61" },
  ];
  return (
    <>
      <div className="mino-title">
        <span>
          <Users /> Performance clients
        </span>
        <h2>Ventes, encaissements et créances</h2>
        <p>Balance Client En Livraison · période chargée : {periodLabel}.</p>
      </div>
      <section className="mino-hero covered">
        <div>
          <span>
            <CreditCard /> Lecture de recouvrement
          </span>
          <h2>Les créances clients restent le principal point de décision.</h2>
          <p>
            Les ventes et paiements proviennent directement de la balance
            importée. La créance est la somme des soldes clients positifs ; les
            avances sont séparées.
          </p>
        </div>
        <div className="mino-hero-ratio">
          <small>Créances à recouvrer</small>
          <strong>{money(data.totals.receivable)}</strong>
          <span>{number(debtors.length)} clients débiteurs</span>
        </div>
      </section>
      <div className="mino-kpi-grid four">
        <Kpi
          icon={CircleDollarSign}
          label="Chiffre d'affaires"
          value={money(data.totals.sales)}
          detail="Ventes facturées de la période"
          tone="gold"
        />
        <Kpi
          icon={CreditCard}
          label="Encaissements"
          value={money(data.totals.payments)}
          detail="Paiements enregistrés"
          tone="green"
        />
        <Kpi
          icon={AlertTriangle}
          label="Créances à recouvrer"
          value={money(data.totals.receivable)}
          detail="Somme des soldes clients positifs"
          tone="alert"
        />
        <Kpi
          icon={Users}
          label="Clients sans paiement"
          value={number(data.totals.unpaid)}
          detail="Vente positive sans paiement"
          tone="burgundy"
        />
      </div>
      <section className="mino-panel conserve-feature-chart">
        <header>
          <div>
            <span>Pilotage financier</span>
            <h3>Synthèse financière de la période</h3>
          </div>
          <label className="avarie-slicer">
            <span>Filtre période</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="">Toutes les périodes</option>
              {reportingPeriod && (
                <option value={reportingPeriod}>{periodLabel}</option>
              )}
            </select>
          </label>
        </header>
        <p className="conserve-chart-note">
          Les encaissements et le chiffre d’affaires sont des flux ; créances et
          avances sont des positions de balance.
        </p>
        <div className="mino-chart x-tall">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={clientFinance}
              margin={{ left: 6, right: 18, top: 22 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="#e8dfd5"
                strokeDasharray="3 5"
              />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
              <YAxis />
              <Tooltip cursor={false} content={<ClientTooltip />} />
              <Bar dataKey="amount" name="Montant" radius={[6, 6, 0, 0]}>
                {clientFinance.map((row) => (
                  <Cell key={row.name} fill={row.color} />
                ))}
                <LabelList
                  dataKey="amount"
                  position="top"
                  formatter={(value) => money(value)}
                  style={{ fill: "#5e514a", fontSize: 10, fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <OptionalTable
        title="Détail clients"
        note={`${number(clients.length)} clients · trié par créance`}
      >
        <section className="mino-panel">
          <div className="mino-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Client</th>
                  <th>Solde antérieur</th>
                  <th>CA</th>
                  <th>Paiement</th>
                  <th>Solde</th>
                </tr>
              </thead>
              <tbody>
                {[...clients]
                  .sort((a, b) => b.balance - a.balance)
                  .map((row) => (
                    <tr key={row.code}>
                      <td>
                        <strong>{row.code}</strong>
                      </td>
                      <td>{row.name}</td>
                      <td>{money(row.opening)}</td>
                      <td>{money(row.sales)}</td>
                      <td>{money(row.payments)}</td>
                      <td className={row.balance > 0 ? "bad" : "advance-value"}>
                        {money(row.balance)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </OptionalTable>
    </>
  );
}
function AvarieView({ avarie, avarieData, ordreData, onImport }) {
  if (!avarie)
    return (
      <section className="mino-panel">
        <div className="cost-accounting-empty">
          <AlertTriangle />
          <div>
            <strong>Import lié requis</strong>
            <p>
              Importez ensemble le PDF avarie et le fichier ordre manager.
              L’analyse d’autorisation ne s’affiche que lorsque les deux sources
              sont présentes.
            </p>
            <button onClick={onImport}>Importer les deux fichiers</button>
          </div>
        </div>
      </section>
    );
  const statusData = (field) => [
    {
      name: "Ordre Oualid",
      value: avarie.oualid.reduce((s, r) => s + r[field], 0),
    },
    {
      name: "Autres observations",
      value: avarie.nonOualid.reduce((s, r) => s + r[field], 0),
    },
  ];
  return (
    <>
      <div className="mino-title">
        <span>
          <AlertTriangle /> Pertes et autorisations
        </span>
        <h2>Avarie stock et ordre manager</h2>
        <p>
          Seule une observation contenant <strong>OUALID</strong>, quelle que
          soit son écriture, est classée « Ordre manager Oualid ».
        </p>
      </div>
      <div className="mino-kpi-grid four">
        <Kpi
          icon={AlertTriangle}
          label="Valeur avarie"
          value={money(avarieData.totals.amount)}
          detail={`${number(avarieData.totals.lines)} lignes d’articles`}
          tone="alert"
        />
        <Kpi
          icon={Boxes}
          label="Quantité avarie"
          value={number(avarieData.totals.quantity, 2)}
          detail="Quantité physique de toutes les lignes"
          tone="gold"
        />
        <Kpi
          icon={CheckCircle2}
          label="Ordres Oualid"
          value={number(avarie.oualid.length)}
          detail={`${money(avarie.oualid.reduce((sum, row) => sum + row.amount, 0))} dans le PDF`}
          tone="green"
        />
        <Kpi
          icon={PackageSearch}
          label="Autres observations"
          value={number(avarie.nonOualid.length)}
          detail="Documents sans mention Oualid"
          tone="burgundy"
        />
      </div>
      <section className="mino-panel">
        <header>
          <div>
            <span>Autorisation</span>
            <h3>Quantité et valeur avarie par statut</h3>
          </div>
          <small>Ordre Oualid vs autres observations</small>
        </header>
        <div className="mino-grid equal">
          <div>
            <div className="mino-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData("quantity")}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    <Cell fill="#3f6f68" />
                    <Cell fill="#c99715" />
                  </Pie>
                  <Tooltip content={<TooltipCard />} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                <strong>{number(avarieData.totals.quantity, 1)}</strong>
                <span>quantité</span>
              </div>
            </div>
            <div className="mino-legend">
              {statusData("quantity").map((item, i) => (
                <div key={item.name}>
                  <i style={{ background: i ? "#c99715" : "#3f6f68" }} />
                  <span>{item.name}</span>
                  <b>{number(item.value, 1)}</b>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mino-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData("amount")}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    <Cell fill="#3f6f68" />
                    <Cell fill="#c99715" />
                  </Pie>
                  <Tooltip content={<TooltipCard />} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                <strong>{money(avarieData.totals.amount)}</strong>
                <span>valeur</span>
              </div>
            </div>
            <div className="mino-legend">
              {statusData("amount").map((item, i) => (
                <div key={item.name}>
                  <i style={{ background: i ? "#c99715" : "#3f6f68" }} />
                  <span>{item.name}</span>
                  <b>{money(item.value)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mino-panel">
        <header>
          <div>
            <span>Règle appliquée</span>
            <h3>Détection tolérante Oualid</h3>
          </div>
        </header>
        <div className="mino-alert-list">
          <div className="info">
            <span>
              <CheckCircle2 />
            </span>
            <div>
              <strong>Mot-clé unique</strong>
              <small>Insensible à la forme</small>
            </div>
            <p>
              Seule une observation contenant « OUALID » est reconnue comme
              ordre manager.
            </p>
          </div>
          <div>
            <span>
              <AlertTriangle />
            </span>
            <div>
              <strong>Autres observations</strong>
              <small>À analyser</small>
            </div>
            <p>
              {number(avarie.nonOualid.length)} documents sont rapprochés mais
              ne portent pas la mention Oualid.
            </p>
          </div>
          <div className="info">
            <span>
              <ClipboardCheck />
            </span>
            <div>
              <strong>Rapprochement des sources</strong>
              <small>Exhaustivité</small>
            </div>
            <p>
              {number(avarie.withoutOrder.length)} documents PDF sans Excel
              associé ; {number(avarie.ordersWithoutPdf.length)} lignes Excel
              sans PDF associé.
            </p>
          </div>
        </div>
      </section>
      <OptionalTable
        title="Registre avarie × ordre manager"
        note="Clé : N° Bon / N° Réforme"
      >
        <section className="mino-panel">
          <div className="mino-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Date</th>
                  <th>Lignes</th>
                  <th>Quantité</th>
                  <th>Valeur PDF</th>
                  <th>Ordre Excel</th>
                  <th>Observation</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {avarie.docs
                  .sort((a, b) => b.amount - a.amount)
                  .map((row) => (
                    <tr key={row.documentNo}>
                      <td>
                        <strong>{row.documentNo}</strong>
                      </td>
                      <td>{row.date}</td>
                      <td>{number(row.lines)}</td>
                      <td>{number(row.quantity, 2)}</td>
                      <td>{money(row.amount)}</td>
                      <td>{row.order ? money(row.order.amount) : "—"}</td>
                      <td>{row.order?.observation || "—"}</td>
                      <td>
                        <span
                          className={`status-pill ${row.order?.oualidOrder ? "ok" : "warn"}`}
                        >
                          {row.order?.oualidOrder
                            ? "Ordre Oualid"
                            : row.order
                              ? "Sans Oualid"
                              : "Sans ordre"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </OptionalTable>
    </>
  );
}
function StockTable({ rows }) {
  return (
    <>
      <div className="mino-title">
        <span>
          <Boxes /> Référence opérationnelle
        </span>
        <h2>Balance détaillée du stock</h2>
        <p>
          Vue complète des articles reconnus dans le PDF ; les unités ne sont
          pas agrégées entre elles.
        </p>
      </div>
      <section className="mino-panel">
        <header>
          <div>
            <span>Stock final</span>
            <h3>Articles, quantités et valeur</h3>
          </div>
          <small>{number(rows.length)} articles</small>
        </header>
        <div className="mino-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Désignation</th>
                <th>Famille</th>
                <th>U.M.</th>
                <th>Entrées</th>
                <th>Sorties</th>
                <th>Qté finale</th>
                <th>Valeur finale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <strong>{r.articleCode}</strong>
                  </td>
                  <td>{r.description}</td>
                  <td>{r.family}</td>
                  <td>{r.unit}</td>
                  <td>{number(r.entriesQuantity, 2)}</td>
                  <td>{number(r.exitsQuantity, 2)}</td>
                  <td className={r.finalQuantity < 0 ? "bad" : ""}>
                    {number(r.finalQuantity, 2)}
                  </td>
                  <td className={r.finalValue < 0 ? "bad" : ""}>
                    {money(r.finalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
