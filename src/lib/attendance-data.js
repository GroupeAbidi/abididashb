const clean = (value) => String(value ?? '').trim();

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  const match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return '';
}

function normalizeTime(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toTimeString().slice(0, 5);
  if (typeof value === 'number') {
    const total = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  const match = clean(value).match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function rowsToTransactions(rows) {
  return rows.map((row, index) => ({
    row: index + 3,
    employeeId: clean(row["Numéro d'employé"] ?? row.employeeId),
    employeeName: clean(row.Prénom ?? row.employeeName),
    department: clean(row.Département ?? row.department) || 'Non affecté',
    date: normalizeDate(row.Date ?? row.date),
    time: normalizeTime(row.Temps ?? row.time),
    punchState: clean(row['Etat du pointage'] ?? row.punchState),
    workCode: clean(row['Code de travail'] ?? row.workCode),
    source: clean(row['Sources de données'] ?? row.source),
  })).filter((row) => row.employeeId && row.date && row.time);
}

export async function parseAttendanceWorkbook(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 1, defval: '' });
  const transactions = rowsToTransactions(rows);
  if (!transactions.length) throw new Error('Aucune transaction reconnue. Vérifiez les en-têtes du fichier ZKBioTime.');
  return { meta: { sourceFile: file.name, importedAt: new Date().toISOString(), sheet: sheetName }, transactions };
}

export async function parseMonthlyAttendanceWorkbook(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: '', raw: false });
  const dayColumns = (matrix[0] || []).filter((header) => /^\d{2}$/.test(clean(header)));
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: '', raw: false });
  const stamp = sheetName.match(/^(20\d{2})(\d{2})(\d{2})/);
  const populatedDays = dayColumns.filter((day) => rows.some((row) => clean(row[day]))).map(Number);
  let period = stamp ? `${stamp[1]}-${stamp[2]}` : '';
  if (stamp && populatedDays.length && Math.max(...populatedDays) > Number(stamp[3])) {
    const previous = new Date(Date.UTC(Number(stamp[1]), Number(stamp[2]) - 2, 1));
    period = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const employees = rows.filter((row) => clean(row["Numéro d'employé"])).map((row) => ({
    employeeId: clean(row["Numéro d'employé"]), employeeName: clean(row.Prénom), department: clean(row.Département) || 'Non affecté', days: Object.fromEntries(dayColumns.map((day) => [day, clean(row[day])])),
    regularDays: Number(row['Régulier(D)'] || 0), late: clean(row['En retard(HH:MM)']), early: clean(row['Départ anticipé(HH:MM)']), absenceDays: Number(row['Absence(D)'] || 0), overtime: Number(row['HS normales(H)'] || 0), annualLeave: Number(row['Congé annuel(D)'] || 0), sickLeave: Number(row['Congé maladie(D)'] || 0), missionDays: Number(row['MISSION(D)'] || 0), exitPermit: clean(row['BON DE SORTIE(HH:MM)']),
  }));
  if (!employees.length) throw new Error('Aucun employé reconnu dans le fichier Pointage mensuel.');
  return { meta: { sourceFile: file.name, importedAt: new Date().toISOString(), sheet: sheetName, period, dayColumns }, employees };
}

const MONTHS = { janvier: '01', fevrier: '02', février: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', aout: '08', août: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12', décembre: '12' };
const normalizedText = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ARABIC_LATIN = { 'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'t','ج':'j','ح':'h','خ':'k','د':'d','ذ':'d','ر':'r','ز':'z','س':'s','ش':'ch','ص':'s','ض':'d','ط':'t','ظ':'d','ع':'a','غ':'gh','ف':'f','ق':'k','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','ة':'a','و':'ou','ي':'i','ى':'a','ئ':'i','ؤ':'ou','ء':'' };
const phoneticName = (value) => normalizedText([...clean(value)].map((character) => ARABIC_LATIN[character] ?? character).join(''))
  .replace(/ch/g, 'c').replace(/sh/g, 'c').replace(/gh/g, 'g').replace(/kh/g, 'k').replace(/dj/g, 'j').replace(/ou/g, 'u').replace(/ph/g, 'f')
  .split(' ').map((word) => word.replace(/[aeiouy]/g, '')).filter(Boolean).sort().join(' ');
const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) { const above = previous[j]; previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)); diagonal = above; }
  }
  return previous[right.length];
};
const nameSimilarity = (left, right) => {
  const a = phoneticName(left); const b = phoneticName(right);
  if (!a || !b) return 1 - editDistance(a, b) / Math.max(a.length, b.length, 1);
  return 0;
};
const inferPeriod = (fileName, sheetNames) => {
  const fileText = normalizedText(fileName);
  const text = normalizedText(`${fileName} ${sheetNames.join(' ')}`);
  const year = text.match(/20\d{2}/)?.[0] || '';
  const month = Object.entries(MONTHS).find(([name]) => fileText.includes(normalizedText(name)))?.[1] || Object.entries(MONTHS).find(([name]) => text.includes(normalizedText(name)))?.[1] || '';
  return year && month ? `${year}-${month}` : '';
};

export async function parseManualHrWorkbook(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true });
  const period = inferPeriod(file.name, workbook.SheetNames);
  const records = [];
  const invalidCells = [];
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    const headerRows = matrix.map((row, index) => ({ row, index })).filter(({ row }) => row.slice(2, 33).filter((value) => /^\d{1,2}$/.test(clean(value))).length >= 25);
    for (const { index: headerIndex, row: header } of headerRows) {
      for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
        if (headerRows.some((item) => item.index === rowIndex)) break;
        const row = matrix[rowIndex];
        const employeeName = clean(row[1]);
        const values = row.slice(2, 33).map(clean);
        if (!employeeName || !values.some(Boolean) || /المجموع|الساعات|الفوج|عمال|التنقيط|الاسم/.test(employeeName)) continue;
        const employeeId = clean(row[0]);
        const days = {};
        header.slice(2, 33).forEach((dayValue, offset) => {
          const day = clean(dayValue).padStart(2, '0');
          if (/^\d{2}$/.test(day) && values[offset]) days[day] = values[offset];
        });
        records.push({ key: `${sheetName}-${rowIndex + 1}`, sheet: sheetName, row: rowIndex + 1, employeeId, employeeName, normalizedName: normalizedText(employeeName), days });
      }
    }
  }
  if (!records.length) throw new Error('Aucune ligne RH journalière reconnue dans le fichier.');
  return { meta: { sourceFile: file.name, importedAt: new Date().toISOString(), period, sheets: workbook.SheetNames }, records, invalidCells };
}

function manualHours(value) {
  const text = clean(value).replace(',', '.');
  const match = text.match(/^(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minuteText = match[2] || '0';
  const minutes = minuteText === '5' ? 50 : Number(minuteText.padEnd(2, '0'));
  if (minutes > 59) return null;
  return hours * 60 + minutes;
}

export function buildControlModel(manualData, monthlyData, rules, mappings = {}) {
  const manual = manualData?.records || [];
  const monthly = monthlyData?.employees || [];
  const monthlyPeriodRaw = clean(monthlyData?.meta?.sheet).match(/^(20\d{2})(\d{2})/);
  const monthlyPeriod = clean(monthlyData?.meta?.period) || (monthlyPeriodRaw ? `${monthlyPeriodRaw[1]}-${monthlyPeriodRaw[2]}` : '');
  const periodMismatch = Boolean(manualData?.meta?.period && monthlyPeriod && manualData.meta.period !== monthlyPeriod);
  const monthlyById = new Map(monthly.map((employee) => [employee.employeeId.toUpperCase(), employee]));
  const monthlyByName = new Map(monthly.map((employee) => [normalizedText(employee.employeeName), employee]));
  const baseMinutes = Number(rules.baseHours || 8) * 60;
  const firstLimit = toMinutes(rules.firstLimit || '08:15');
  const secondLimit = toMinutes(rules.secondLimit || '08:30');
  const rows = [];
  const unmatched = [];
  const matchedEmployees = new Set();
  let automaticMatches = 0;
  for (const person of periodMismatch ? [] : manual) {
    const idMatch = /^[A-Z]\d+/i.test(person.employeeId) ? monthlyById.get(person.employeeId.toUpperCase()) : null;
    const savedMatch = monthlyById.get(clean(mappings[person.key]).toUpperCase());
    const exactNameMatch = monthlyByName.get(person.normalizedName);
    const candidates = candidatesByScore(person.employeeName, monthly);
    const confidentCandidate = candidates[0]?.score >= 0.76 && candidates[0].score - (candidates[1]?.score || 0) >= 0.06 ? candidates[0].employee : null;
    const employee = savedMatch || idMatch || exactNameMatch || confidentCandidate;
    if (!employee) { unmatched.push({ ...person, suggestions: candidates.slice(0, 3) }); continue; }
    if (!savedMatch && !idMatch && !exactNameMatch && confidentCandidate) automaticMatches += 1;
    matchedEmployees.add(employee.employeeId);
    for (const [day, manualValue] of Object.entries(person.days)) {
      const enteredMinutes = manualHours(manualValue);
      const monthlyValue = clean(employee.days?.[day]);
      const range = monthlyValue.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      const arrival = range?.[1]?.padStart(5, '0') || (/^\d{1,2}:\d{2}$/.test(monthlyValue) ? monthlyValue.padStart(5, '0') : '');
      let expectedMinutes = null;
      let appliedRule = '';
      if (arrival) {
        const arrivalMinutes = toMinutes(arrival);
        if (arrivalMinutes > secondLimit) { expectedMinutes = Math.max(0, baseMinutes - Number(rules.secondDeduction || 60)); appliedRule = `Après ${rules.secondLimit}`; }
        else if (arrivalMinutes > firstLimit) { expectedMinutes = Math.max(0, baseMinutes - Number(rules.firstDeduction || 10)); appliedRule = `Après ${rules.firstLimit}`; }
        else { expectedMinutes = baseMinutes; appliedRule = 'À l’heure'; }
      }
      const comparable = enteredMinutes !== null && expectedMinutes !== null;
      const difference = comparable ? enteredMinutes - expectedMinutes : null;
      rows.push({ employeeId: employee.employeeId, employeeName: employee.employeeName, department: employee.department, day, manualValue, enteredMinutes, monthlyValue, arrival, expectedMinutes, difference, appliedRule, status: !comparable ? 'nonComparable' : Math.abs(difference) <= Number(rules.tolerance || 0) ? 'match' : 'difference' });
    }
  }
  const comparable = rows.filter((row) => row.status !== 'nonComparable');
  return { rows, unmatched, periodMismatch, manualPeriod: manualData?.meta?.period || '', monthlyPeriod, matchedEmployees: matchedEmployees.size, kpis: { manualEmployees: manual.length, monthlyEmployees: monthly.length, matchedEmployees: matchedEmployees.size, automaticMatches, unmatchedEmployees: periodMismatch ? 0 : unmatched.length, comparable: comparable.length, matches: comparable.filter((row) => row.status === 'match').length, differences: comparable.filter((row) => row.status === 'difference').length, nonComparable: rows.filter((row) => row.status === 'nonComparable').length }, differences: rows.filter((row) => row.status === 'difference').sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)) };
}

function candidatesByScore(manualName, monthlyEmployees) {
  return monthlyEmployees.map((employee) => ({ employee, score: nameSimilarity(manualName, employee.employeeName) })).sort((a, b) => b.score - a.score);
}

const hhmmMinutes = (value) => /^\d{1,2}:\d{2}$/.test(value || '') ? toMinutes(value.padStart(5, '0')) : 0;
export function buildMonthlyAttendanceModel(data, filters) {
  const all = data?.employees || [];
  const employees = all.filter((employee) => (!filters.department || employee.department === filters.department) && (!filters.employee || employee.employeeId === filters.employee) && (!filters.search || `${employee.employeeId} ${employee.employeeName}`.toLocaleLowerCase('fr').includes(filters.search.toLocaleLowerCase('fr'))));
  const sum = (field) => employees.reduce((total, employee) => total + Number(employee[field] || 0), 0);
  const byDepartment = [...new Set(employees.map((employee) => employee.department))].map((department) => {
    const rows = employees.filter((employee) => employee.department === department);
    return { department, employees: rows.length, regular: rows.reduce((s, r) => s + r.regularDays, 0), absence: rows.reduce((s, r) => s + r.absenceDays, 0), late: rows.filter((r) => hhmmMinutes(r.late) > 0).length, early: rows.filter((r) => hhmmMinutes(r.early) > 0).length, overtime: rows.reduce((s, r) => s + r.overtime, 0) };
  }).sort((a, b) => b.employees - a.employees);
  const alerts = employees.filter((employee) => employee.absenceDays || hhmmMinutes(employee.late) || hhmmMinutes(employee.early) || employee.overtime).sort((a, b) => b.absenceDays - a.absenceDays || hhmmMinutes(b.late) - hhmmMinutes(a.late));
  return { employees, byDepartment, alerts, kpis: { roster: employees.length, regularDays: sum('regularDays'), absenceDays: sum('absenceDays'), lateEmployees: employees.filter((e) => hhmmMinutes(e.late)).length, lateMinutes: employees.reduce((s, e) => s + hhmmMinutes(e.late), 0), earlyEmployees: employees.filter((e) => hhmmMinutes(e.early)).length, overtime: sum('overtime'), noPunch: employees.filter((e) => Object.values(e.days || {}).every((value) => !value)).length } };
}

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function buildAttendanceModel(data, filters, monthlyData = null) {
  const allRows = data?.transactions || [];
  const departments = [...new Set(allRows.map((row) => row.department))].sort((a, b) => a.localeCompare(b, 'fr'));
  const dates = [...new Set(allRows.map((row) => row.date))].sort();
  const employeeOptions = [...new Map(allRows.map((row) => [row.employeeId, { id: row.employeeId, name: row.employeeName, department: row.department }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const scoped = allRows.filter((row) => (!filters.department || row.department === filters.department) && (!filters.date || row.date === filters.date) && (!filters.employee || row.employeeId === filters.employee));
  const duplicateKey = (row) => `${row.employeeId}|${row.date}|${row.time}`;
  const unique = [...new Map(scoped.map((row) => [duplicateKey(row), row])).values()];
  const duplicates = scoped.length - unique.length;
  const groups = new Map();
  for (const row of unique) {
    const key = `${row.employeeId}|${row.date}`;
    if (!groups.has(key)) groups.set(key, { employeeId: row.employeeId, employeeName: row.employeeName, department: row.department, date: row.date, punches: [] });
    groups.get(key).punches.push(row.time);
  }
  const monthlyPeriod = clean(monthlyData?.meta?.period).replace('-', '') || clean(monthlyData?.meta?.sheet).slice(0, 6);
  const monthlyById = new Map((monthlyData?.employees || []).map((employee) => [employee.employeeId, employee]));
  const calculatedDays = [...groups.values()].map((day) => {
    const punches = [...day.punches].sort();
    const monthlyValue = day.date.replaceAll('-', '').startsWith(monthlyPeriod) ? clean(monthlyById.get(day.employeeId)?.days?.[day.date.slice(-2)]) : '';
    const monthlyRange = monthlyValue.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    const first = monthlyRange ? monthlyRange[1].padStart(5, '0') : punches[0];
    const last = monthlyRange ? monthlyRange[2].padStart(5, '0') : punches.length > 1 ? punches.at(-1) : '';
    let durationMinutes = null;
    if (last) {
      durationMinutes = toMinutes(last) - toMinutes(first);
      if (durationMinutes < 0) durationMinutes += 24 * 60;
    }
    const incomplete = !last;
    const durationAnomaly = durationMinutes !== null && (durationMinutes < 60 || durationMinutes > 14 * 60);
    return { ...day, punches, first, last, durationMinutes, incomplete, durationAnomaly, calculationSource: monthlyRange ? 'Pointage mensuel' : 'Transactions', afterThreshold: toMinutes(first) > toMinutes(filters.threshold) };
  });
  const days = calculatedDays.filter((day) => {
    if (filters.status === 'complete' && day.incomplete) return false;
    if (filters.status === 'incomplete' && !day.incomplete) return false;
    return true;
  }).sort((a, b) => `${b.date}${b.first}`.localeCompare(`${a.date}${a.first}`));
  const employeeMap = new Map();
  for (const day of days) {
    if (!employeeMap.has(day.employeeId)) employeeMap.set(day.employeeId, { id: day.employeeId, name: day.employeeName, department: day.department, days: [], punches: 0 });
    const employee = employeeMap.get(day.employeeId);
    employee.days.push(day);
    employee.punches += day.punches.length;
  }
  const employees = [...employeeMap.values()].map((employee) => ({
    ...employee,
    incompleteDays: employee.days.filter((day) => day.incomplete).length,
    afterThreshold: employee.days.filter((day) => day.afterThreshold).length,
    avgArrival: average(employee.days.map((day) => toMinutes(day.first))),
    avgDuration: average(employee.days.filter((day) => day.durationMinutes !== null && !day.durationAnomaly).map((day) => day.durationMinutes)),
  })).sort((a, b) => b.incompleteDays - a.incompleteDays || a.name.localeCompare(b.name));
  const query = filters.search.trim().toLocaleLowerCase('fr');
  const visibleEmployees = query ? employees.filter((employee) => `${employee.id} ${employee.name} ${employee.department}`.toLocaleLowerCase('fr').includes(query)) : employees;
  const visibleEmployeeIds = new Set(visibleEmployees.map((employee) => employee.id));
  const visibleDays = days.filter((day) => visibleEmployeeIds.has(day.employeeId));
  const byDate = dates.filter((date) => !filters.date || date === filters.date).map((date) => {
    const dateDays = days.filter((day) => day.date === date);
    return { date, label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)), employees: dateDays.length, punches: dateDays.reduce((sum, day) => sum + day.punches.length, 0), incomplete: dateDays.filter((day) => day.incomplete).length };
  });
  const byDepartment = departments.filter((department) => !filters.department || department === filters.department).map((department) => {
    const departmentDays = days.filter((day) => day.department === department);
    return { name: department, employees: new Set(departmentDays.map((day) => day.employeeId)).size, days: departmentDays.length, incomplete: departmentDays.filter((day) => day.incomplete).length };
  }).sort((a, b) => b.employees - a.employees);
  const durationValues = days.filter((day) => day.durationMinutes !== null && !day.durationAnomaly).map((day) => day.durationMinutes);
  return { departments, dates, employeeOptions, unique, duplicates, days: visibleDays, employees: visibleEmployees, byDate, byDepartment, kpis: { employees: employeeMap.size, punches: days.reduce((sum, day) => sum + day.punches.length, 0), employeeDays: days.length, incompleteDays: days.filter((day) => day.incomplete).length, durationAnomalies: days.filter((day) => day.durationAnomaly).length, afterThreshold: days.filter((day) => day.afterThreshold).length, avgDuration: average(durationValues) } };
}

export function formatMinutes(value, asClock = false) {
  if (!Number.isFinite(value)) return '—';
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return asClock ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : `${hours}h ${String(minutes).padStart(2, '0')}`;
}
