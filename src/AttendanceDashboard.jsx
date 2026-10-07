import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BadgeCheck, CalendarDays, ChevronRight, CircleDollarSign, Download, FileCheck2, FileSpreadsheet, LayoutDashboard, ListChecks, Menu, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Settings2, ShieldCheck, Upload, Users, X } from 'lucide-react';
import { buildAgrosatiControl, CONTROL_COMPANIES, DEFAULT_CONTROL_RULES, exportControlAnomalies, parseHrWorkbook, parseMachineWorkbook, parsePayrollWorkbook } from './lib/agrosati-control.js';
import { archiveImportedFile, loadSavedState, saveDashboardState } from './lib/persistence.js';
import './minoterie.css';

const money = new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 });
const STATUS = {
  correct: ['Conforme', 'ok'], 'missing-hr': ['RH manquant', 'danger'], 'missing-machine': ['Machine manquante', 'danger'],
  'missing-base': ['Base salariale manquante', 'danger'],
  'duplicate-hr': ['Doublon RH', 'warning'], 'rh-difference': ['Écart RH / machine', 'danger'], review: ['Révision manuelle', 'warning'],
  'absence-payroll': ['Retenue temps incorrecte', 'danger'], 'base-salary-payroll': ['Salaire base incorrect', 'danger'], 'presence-payroll': ['Présence paie incorrecte', 'danger'],
};
const TABS = [
  ['overview', "Vue d'ensemble", LayoutDashboard],
  ['employees', 'Contrôle salariés', ListChecks],
  ['anomalies', 'Anomalies', AlertTriangle],
  ['settings', 'Paramètres', Settings2],
  ['sources', 'Sources de données', FileSpreadsheet],
];

function StatusBadge({ value }) {
  const [label, tone] = STATUS[value] || [value, 'warning'];
  return <span className={`control-status ${tone}`}>{label}</span>;
}

function SourceButton({ kind, title, data, loading, error, onClick }) {
  return <button type="button" className={data ? 'loaded' : ''} onClick={onClick} disabled={loading}>
    <span>{data ? <FileCheck2 /> : <FileSpreadsheet />}</span><div><small>{kind}</small><strong>{loading ? 'Lecture en cours...' : title}</strong><p className={error ? 'source-error' : ''}>{error || data?.meta?.fileName || 'Sélectionner un fichier Excel'}</p></div>{data ? <BadgeCheck /> : <Upload />}
  </button>;
}

function Kpi({ icon: Icon, label, value, detail, alert }) {
  return <article className={`attendance-kpi ${alert ? 'alert' : ''}`}><Icon /><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function EmployeeDetail({ employee, onClose }) {
  if (!employee) return null;
  const { payroll } = employee;
  return <div className="control-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="control-detail" aria-label={`Détail de ${employee.employeeName}`}>
      <header><div><span>{employee.employeeId} · {employee.role}</span><h2>{employee.employeeName}</h2></div><button type="button" onClick={onClose} title="Fermer"><X /></button></header>
      <div className="control-detail-summary">
        <div><span>Base contractuelle</span><strong>{employee.contractualBaseSalary === null ? '—' : `${money.format(employee.contractualBaseSalary)} DA`}</strong></div><div><span>Heures à déduire</span><strong>{decimal.format(employee.unpaidHours)} h</strong></div><div><span>Retenue attendue</span><strong>{employee.expectedAbsenceDeduction === null ? '—' : `${money.format(employee.expectedAbsenceDeduction)} DA`}</strong></div><div><span>Supplémentaire réel</span><strong>+ {money.format(employee.realOvertime)} DA</strong></div><div><span>Solde présence</span><strong>{employee.finalPresenceBalance === null ? '—' : `${money.format(employee.finalPresenceBalance)} DA`}</strong></div>
      </div>
      <section><div className="control-detail-title"><div><span>Contrôle journalier</span><h3>Machine contre pointage RH</h3></div><small>Calculé avec les paramètres actifs du dashboard.</small></div>
        <div className="control-day-grid">{employee.days.map((day) => <article key={day.day} className={day.status}><header><strong>{day.day} sept.</strong><span>{day.label}</span></header><dl><div><dt>Machine</dt><dd>{day.machineValue || '—'}</dd></div><div><dt>Poste</dt><dd>{day.shiftLabel || '—'}</dd></div><div><dt>Calcul</dt><dd>{day.calculatedHours === null ? '—' : `${decimal.format(day.calculatedHours)} h`}</dd></div><div><dt>RH</dt><dd>{day.rhValue || '—'}</dd></div></dl></article>)}</div>
      </section>
      <section><div className="control-detail-title"><div><span>Contrôle salaire</span><h3>Solde après présence</h3></div><small>Base après retenue: {employee.expectedBaseAfterAttendance === null ? '—' : `${money.format(employee.expectedBaseAfterAttendance)} DA`}</small></div>
        <div className="control-payroll-grid"><div><span>Base contractuelle</span><strong>{employee.contractualBaseSalary === null ? '—' : `${money.format(employee.contractualBaseSalary)} DA`}</strong></div><div><span>Retenue attendue</span><strong>− {money.format(employee.expectedAbsenceDeduction)} DA</strong></div><div><span>Supplémentaire réel</span><strong>+ {money.format(employee.realOvertime)} DA</strong></div><div className="total"><span>Solde présence</span><strong>{employee.finalPresenceBalance === null ? '—' : `${money.format(employee.finalPresenceBalance)} DA`}</strong></div></div>
      </section>
    </aside>
  </div>;
}

export default function AttendanceDashboard({ onBack }) {
  const inputs = { machine: useRef(null), hr: useRef(null), payroll: useRef(null) };
  const [sources, setSources] = useState({ machine: null, hr: null, payroll: null });
  const [payrollSources, setPayrollSources] = useState({});
  const payrollImportCompany = useRef('AGROSATI');
  const [loading, setLoading] = useState(''); const [errors, setErrors] = useState({});
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [companyFilter, setCompanyFilter] = useState('');
  const [selected, setSelected] = useState(null); const [showNonPayroll, setShowNonPayroll] = useState(false);
  const [tab, setTab] = useState('overview'); const [collapsed, setCollapsed] = useState(false);
  const [rules, setRules] = useState(() => ({ ...DEFAULT_CONTROL_RULES, shiftStarts: [...DEFAULT_CONTROL_RULES.shiftStarts] }));
  const [salaryBaseData, setSalaryBaseData] = useState(null);
  const [salaryBaseError, setSalaryBaseError] = useState('');
  useEffect(() => { fetch('/data/salary-base.json').then((response) => { if (!response.ok) throw new Error('Base salariale introuvable.'); return response.json(); }).then(setSalaryBaseData).catch((error) => setSalaryBaseError(error.message)); }, []);
  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      try {
        const [machine, hr, ...payroll] = await Promise.all([
          loadSavedState('attendance-machine'), loadSavedState('attendance-hr'),
          ...CONTROL_COMPANIES.map((company) => loadSavedState(`attendance-payroll-${company.key.toLowerCase()}`)),
        ]);
        if (!mounted) return;
        if (machine) setSources((current) => ({ ...current, machine }));
        if (hr) setSources((current) => ({ ...current, hr }));
        const restoredPayroll = Object.fromEntries(payroll.map((data, index) => [CONTROL_COMPANIES[index].key, data]).filter(([, data]) => data));
        if (Object.keys(restoredPayroll).length) {
          setPayrollSources(restoredPayroll);
          setSources((current) => ({ ...current, payroll: Object.values(restoredPayroll)[0] }));
        }
      } catch { /* Imports can still be loaded manually when the server is offline. */ }
    };
    restore();
    return () => { mounted = false; };
  }, []);
  const importCoverage = useMemo(() => {
    const reference = salaryBaseData?.employees || [];
    if (!reference.length) return [];
    const missingEmployees = (data, company) => {
      if (!data) return [];
      const expected = company ? reference.filter((employee) => employee.company === company) : reference;
      const sourceIds = new Set((data.employees || data.records || []).map((employee) => employee.employeeId).filter(Boolean));
      return expected.filter((employee) => !sourceIds.has(employee.employeeId));
    };
    const source = (key, label, data, company) => data && ({ key, label, fileName: data.meta?.fileName, missing: missingEmployees(data, company), withoutMatricule: data.missingMatriculeRows || [] });
    return [
      source('machine', 'Pointage machine', sources.machine),
      source('hr', 'Pointage administratif RH', sources.hr),
      ...CONTROL_COMPANIES.map((company) => source(`payroll-${company.key}`, `Journal de paie - ${company.label}`, payrollSources[company.key], company.key)),
    ].filter(Boolean);
  }, [payrollSources, salaryBaseData, sources.hr, sources.machine]);
  const companyModels = useMemo(() => CONTROL_COMPANIES.map((company) => buildAgrosatiControl(sources.machine, sources.hr, payrollSources[company.key], rules, salaryBaseData, company.key)).filter(Boolean), [sources.machine, sources.hr, payrollSources, rules, salaryBaseData]);
  const model = useMemo(() => {
    if (!companyModels.length) return null;
    const employees = companyModels.flatMap((companyModel) => companyModel.employees);
    const nonPayroll = companyModels.flatMap((companyModel) => companyModel.nonPayroll);
    const sum = (key) => companyModels.reduce((total, companyModel) => total + Number(companyModel.kpis[key] || 0), 0);
    return { company: { key: 'TOUTES', label: 'Toutes les sociétés' }, employees, nonPayroll, rules, kpis: { controlled: sum('controlled'), rhDifferences: sum('rhDifferences'), pendingReviews: sum('pendingReviews'), payrollAnomalies: sum('payrollAnomalies'), salaryBaseMissing: sum('salaryBaseMissing'), totalPresenceBalance: sum('totalPresenceBalance'), totalAbsenceDeductions: sum('totalAbsenceDeductions') } };
  }, [companyModels, rules]);
  const periods = [sources.machine?.meta?.period, sources.hr?.meta?.period, ...Object.values(payrollSources).map((payroll) => payroll.meta?.period)].filter(Boolean);
  const periodMismatch = new Set(periods).size > 1;
  const importFile = async (type, file) => {
    if (!file) return; setLoading(type); const errorKey = type === 'payroll' ? payrollImportCompany.current : type; setErrors((current) => ({ ...current, [errorKey]: '' }));
    try {
      const parser = type === 'machine' ? parseMachineWorkbook : type === 'hr' ? parseHrWorkbook : parsePayrollWorkbook;
      const parsed = await parser(file);
      if (type === 'payroll') {
        const company = payrollImportCompany.current;
        parsed.meta.company = company;
        setPayrollSources((current) => ({ ...current, [company]: parsed }));
        setSources((current) => ({ ...current, payroll: parsed }));
        void saveDashboardState(`attendance-payroll-${company.toLowerCase()}`, parsed).catch(() => {});
        void archiveImportedFile('attendance', `payroll_${company.toLowerCase()}`, file).catch(() => {});
      } else {
        setSources((current) => ({ ...current, [type]: parsed }));
        void saveDashboardState(`attendance-${type}`, parsed).catch(() => {});
        void archiveImportedFile('attendance', type, file).catch(() => {});
      }
    } catch (error) { const key = type === 'payroll' ? payrollImportCompany.current : type; setErrors((current) => ({ ...current, [key]: error.message || 'Fichier non reconnu.' })); }
    finally { setLoading(''); }
  };
  const pickPayrollFile = (company) => { payrollImportCompany.current = company; inputs.payroll.current?.click(); };
  const updateRule = (key, value) => setRules((current) => ({ ...current, [key]: value }));
  const updateShift = (index, value) => setRules((current) => ({ ...current, shiftStarts: current.shiftStarts.map((shift, shiftIndex) => shiftIndex === index ? value : shift) }));
  const resetRules = () => setRules({ ...DEFAULT_CONTROL_RULES, shiftStarts: [...DEFAULT_CONTROL_RULES.shiftStarts] });
  const visibleEmployees = useMemo(() => {
    if (!model) return []; const query = search.trim().toLocaleLowerCase('fr');
    return model.employees.filter((employee) => (!companyFilter || employee.company === companyFilter) && (!query || `${employee.employeeId} ${employee.employeeName} ${employee.role}`.toLocaleLowerCase('fr').includes(query)) && (!status || employee.status === status || employee.issues.includes(status)));
  }, [companyFilter, model, search, status]);
  useEffect(() => { if (!search && !status) setCompanyFilter(''); }, [search, status]);
  const displayedEmployees = tab === 'anomalies' ? visibleEmployees.filter((employee) => employee.issues.length) : visibleEmployees;
  const tabTitle = TABS.find(([key]) => key === tab)?.[1] || "Vue d'ensemble";

  const payrollImportedCount = Object.keys(payrollSources).length;
  const importedCount = [sources.machine, sources.hr].filter(Boolean).length + payrollImportedCount;
  const anomalyCount = model?.employees.filter((employee) => employee.issues.length).length || 0;
  return <div className={`mino-shell attendance-mino-shell ${collapsed ? 'collapsed' : ''}`}>
    <aside className="mino-sidebar">
      <div className="mino-brand"><img src="/brand/groupe-abidi-logo.png" alt="Groupe ABIDI" /><div><span>Groupe ABIDI</span><strong>Présence & Accès</strong></div></div>
      <button className="mino-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Ouvrir le menu' : 'Réduire le menu'}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>{collapsed ? 'Ouvrir' : 'Réduire'}</span></button>
      <nav aria-label="Navigation Présence et Accès">{TABS.map(([key, label, Icon]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)} title={label}><Icon /><span>{label}</span>{key === 'anomalies' && anomalyCount > 0 && <b>{anomalyCount}</b>}{key === 'sources' && importedCount > 0 && <b>{importedCount}/3</b>}</button>)}</nav>
      <button className="mino-switch" onClick={onBack}><ArrowLeft /><span>Changer de dashboard</span></button>
      <div className="mino-source"><FileCheck2 /><div><span>Sources actives</span><strong>{importedCount}/3 fichiers</strong><small>{model ? `${model.kpis.controlled} salariés contrôlés` : 'Importation requise'}</small></div></div>
    </aside>
    <main className="mino-main attendance-main">
      <header className="mino-topbar"><button className="mino-mobile-menu" onClick={() => setCollapsed((value) => !value)}><Menu /></button><div><span>Opérations / Présence & Accès</span><h1>{tabTitle}</h1></div>{tab === 'anomalies' && model ? <button className="mino-upload" onClick={() => exportControlAnomalies(model)}><Download /><span>Exporter les anomalies</span></button> : tab !== 'sources' && <button className="mino-upload" onClick={() => setTab('sources')}><FileSpreadsheet /><span>Actualiser les sources</span></button>}</header>
      {Object.keys(inputs).map((type) => <input key={type} ref={inputs[type]} hidden type="file" accept=".xlsx,.xls" onChange={(event) => { importFile(type, event.target.files?.[0]); event.target.value = ''; }} />)}
      <div className="mino-content attendance-dashboard control-workspace">
        {tab === 'overview' && <><section className="control-hero"><div><span><ShieldCheck /> AGROSATI · SEPTEMBRE 2026</span><h2>Rapprochement machine, RH et paie</h2><p>Contrôle de trois postes, des absences et du solde présence sur une base de {rules.payrollDays} jours.</p></div>{model && <button className="mino-upload" type="button" onClick={() => setTab('employees')}><ListChecks /><span>Ouvrir le contrôle</span></button>}</section>{model ? <section className="attendance-kpi-grid control-kpis"><Kpi icon={Users} label="Salariés contrôlés" value={model.kpis.controlled} detail={`${model.nonPayroll.length} AGROSATI hors paie`} /><Kpi icon={AlertTriangle} label="Écarts RH" value={model.kpis.rhDifferences} detail="Machine différente du RH" alert={model.kpis.rhDifferences > 0} /><Kpi icon={CalendarDays} label="À réviser" value={model.kpis.pendingReviews} detail="Justificatif ou horaire spécial" alert={model.kpis.pendingReviews > 0} /><Kpi icon={ShieldCheck} label="Anomalies paie" value={model.kpis.payrollAnomalies} detail="Présence et retenues" alert={model.kpis.payrollAnomalies > 0} /><Kpi icon={CircleDollarSign} label="Solde présence" value={`${money.format(model.kpis.totalPresenceBalance)} DA`} detail="Base après retenues + supplément réel" /><Kpi icon={CircleDollarSign} label="Retenues absences" value={`${money.format(model.kpis.totalAbsenceDeductions)} DA`} detail="Montant déclaré en paie" /></section> : <section className="control-empty"><FileSpreadsheet /><h3>Importez les trois fichiers Excel</h3><p>Ouvrez l’onglet Sources de données pour charger le pointage machine, le pointage RH et le journal de paie.</p><button className="attendance-reset" onClick={() => setTab('sources')}>Ouvrir les sources</button></section>}</>}

        {(tab === 'employees' || tab === 'anomalies') && model && <section className="attendance-filterbar control-company-filter"><label><span>Société</span><select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="">Toutes les sociétés</option>{CONTROL_COMPANIES.map((company) => <option key={company.key} value={company.key}>{company.label}</option>)}</select></label></section>}
        {(tab === 'employees' || tab === 'anomalies') && (model ? <><section className="attendance-filterbar control-filterbar"><label className="attendance-search"><span>Rechercher</span><div><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Matricule, salarié, fonction..." /></div></label><label><span>Statut de contrôle</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item[0]}</option>)}</select></label><button type="button" className="attendance-reset" onClick={() => { setSearch(''); setStatus(''); }}>Réinitialiser</button></section><section className="attendance-card attendance-employee-card control-table-card"><header><div><span>{tab === 'anomalies' ? 'Cas à traiter' : 'Contrôle individuel'}</span><h2>{tab === 'anomalies' ? 'Anomalies détectées' : 'Salariés du journal de paie'}</h2></div><small>{displayedEmployees.length} sur {model.employees.length} salariés</small></header><div className="attendance-table-wrap"><table><thead><tr><th>Salarié</th><th>Écarts RH</th><th>Absences</th><th>Présence attendue / paie</th><th>Retenue attendue</th><th>Retenue paie</th><th>Solde présence</th><th>Statut</th><th /></tr></thead><tbody>{displayedEmployees.map((employee) => <tr key={employee.employeeId} onClick={() => setSelected(employee)}><td><strong>{employee.employeeName}</strong><small>{employee.employeeId} · {employee.role}</small></td><td><span className={employee.rhDifferences ? 'attendance-danger' : 'attendance-ok'}>{employee.rhDifferences}</span></td><td>{employee.unpaidAbsences}</td><td>{employee.expectedPresence} / {decimal.format(employee.payroll.presenceDays)}</td><td>{money.format(employee.expectedAbsenceDeduction)} DA</td><td>{money.format(employee.payroll.absenceDeduction)} DA</td><td><strong>{employee.finalPresenceBalance === null ? '—' : `${money.format(employee.finalPresenceBalance)} DA`}</strong></td><td><StatusBadge value={employee.status} /></td><td><button type="button" className="control-row-action" title="Voir le détail"><ChevronRight /></button></td></tr>)}</tbody></table>{!displayedEmployees.length && <div className="attendance-empty">Aucun salarié ne correspond aux filtres.</div>}</div></section>{tab === 'employees' && <section className="attendance-card control-unmatched"><header><div><span>Population machine</span><h2>AGROSATI hors journal de paie</h2></div><button type="button" className="attendance-reset" onClick={() => setShowNonPayroll((value) => !value)}>{showNonPayroll ? 'Masquer' : `Afficher (${model.nonPayroll.length})`}</button></header>{showNonPayroll && <div>{model.nonPayroll.map((employee) => <span key={employee.employeeId}>{employee.employeeName}<small>{employee.employeeId}</small></span>)}</div>}</section>}</> : <section className="control-empty"><FileSpreadsheet /><h3>Données de contrôle indisponibles</h3><p>Importez les trois fichiers depuis l’onglet Sources de données.</p><button className="attendance-reset" onClick={() => setTab('sources')}>Ouvrir les sources</button></section>)}

        {tab === 'settings' && <section className="attendance-card control-rules-card"><header><div><span>Paramètres de calcul</span><h2>Horaires et règles de déduction</h2></div><Settings2 /></header><div className="control-rule-grid">{rules.shiftStarts.map((shift, index) => <label key={index}><span>Début poste {index + 1}</span><input type="time" value={shift} onChange={(event) => updateShift(index, event.target.value)} /></label>)}<label><span>Heures / poste</span><input type="number" min="1" max="24" step="0.5" value={rules.shiftHours} onChange={(event) => updateRule('shiftHours', Number(event.target.value))} /></label><label><span>Tolérance entrée (min)</span><input type="number" min="0" max="120" step="1" value={rules.entryGraceMinutes} onChange={(event) => updateRule('entryGraceMinutes', Number(event.target.value))} /></label><label><span>Palier retard (min)</span><input type="number" min="1" max="120" step="1" value={rules.penaltyStepMinutes} onChange={(event) => updateRule('penaltyStepMinutes', Number(event.target.value))} /></label><label><span>Déduction / palier (h)</span><input type="number" min="0" max="8" step="0.5" value={rules.penaltyStepHours} onChange={(event) => updateRule('penaltyStepHours', Number(event.target.value))} /></label><label><span>Tolérance sortie (min)</span><input type="number" min="0" max="120" step="1" value={rules.exitGraceMinutes} onChange={(event) => updateRule('exitGraceMinutes', Number(event.target.value))} /></label><label><span>Base mensuelle (jours)</span><input type="number" min="1" max="31" step="1" value={rules.payrollDays} onChange={(event) => updateRule('payrollDays', Number(event.target.value))} /></label><button type="button" onClick={resetRules}><RotateCcw /> Réinitialiser</button></div></section>}

        {tab === 'sources' && <>{periodMismatch && <div className="control-period-warning"><AlertTriangle /><div><h3>Les périodes ne correspondent pas</h3><p>Importez trois fichiers du même mois avant d’utiliser les résultats de contrôle.</p></div></div>}<section className="control-import-grid"><SourceButton kind="Source 01" title="Pointage machine" data={sources.machine} loading={loading === 'machine'} error={errors.machine} onClick={() => inputs.machine.current?.click()} /><SourceButton kind="Source 02" title="Pointage administratif RH" data={sources.hr} loading={loading === 'hr'} error={errors.hr} onClick={() => inputs.hr.current?.click()} /><SourceButton kind="Source 03" title="Journal légal de paie" data={sources.payroll} loading={loading === 'payroll'} error={errors.payroll} onClick={() => inputs.payroll.current?.click()} /></section><section className="control-empty control-source-summary"><FileCheck2 /><h3>{importedCount === 3 ? 'Toutes les sources sont prêtes' : `${importedCount}/3 sources importées`}</h3><p>{model ? `${model.kpis.controlled} salariés sont disponibles pour le rapprochement.` : 'Le contrôle démarrera automatiquement après le troisième import.'}</p>{model && <button className="attendance-reset" onClick={() => setTab('overview')}>Voir la synthèse</button>}</section></>}
        {tab === 'sources' && <section className="attendance-card control-payroll-sources"><header><div><span>Journaux légaux de paie</span><h2>Importation par société</h2></div><small>{payrollImportedCount}/6 journaux importés</small></header><div className="control-payroll-imports">{CONTROL_COMPANIES.map((company) => <SourceButton key={company.key} kind="Journal de paie" title={company.label} data={payrollSources[company.key]} loading={loading === 'payroll'} error={errors[company.key]} onClick={() => pickPayrollFile(company.key)} />)}</div></section>}
        {tab === 'sources' && importCoverage.length > 0 && <section className="attendance-card control-coverage-card"><header><div><span>Contrôle des matricules</span><h2>Couverture des fichiers importés</h2></div><small>Comparaison avec la base salariale enregistrée</small></header><div className="control-coverage-grid">{importCoverage.map((source) => <article key={source.key} className="control-coverage-source"><header><div><strong>{source.label}</strong><small>{source.fileName}</small></div><span>{source.missing.length + source.withoutMatricule.length} à traiter</span></header><details><summary>Salariés absents du fichier <b>{source.missing.length}</b></summary><div className="control-coverage-list">{source.missing.length ? source.missing.map((employee) => <div key={employee.employeeId}><strong>{employee.employeeName}</strong><small>{employee.employeeId} · {employee.company}</small></div>) : <p>Tous les salariés de la référence sont trouvés.</p>}</div></details><details><summary>Lignes sans matricule <b>{source.withoutMatricule.length}</b></summary><div className="control-coverage-list">{source.withoutMatricule.length ? source.withoutMatricule.map((row) => <div key={`${row.sheetName || ''}-${row.row}-${row.employeeName}`}><strong>{row.employeeName}</strong><small>{row.sheetName ? `${row.sheetName} · ` : ''}Ligne {row.row}{row.department ? ` · ${row.department}` : ''}</small></div>) : <p>Aucune ligne de données sans matricule.</p>}</div></details></article>)}</div></section>}
      </div>
    </main><EmployeeDetail employee={selected} onClose={() => setSelected(null)} />
  </div>;
}
