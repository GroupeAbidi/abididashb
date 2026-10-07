const text = (value) => String(value ?? '').trim();
const number = (value) => {
  const parsed = Number(text(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeMatricule = (value) => text(value).replace(/^_+/, '').toUpperCase();

const toMinutes = (value) => {
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const normalizeDay = (value) => text(value).padStart(2, '0');
const SATURDAY_ONLY_EMPLOYEES = new Set(['T0121', 'T0098']);
const FULL_SHIFT_ON_PRESENCE_EMPLOYEES = new Set(['A0239']);

const isSaturday = (period, day) => {
  const match = text(period).match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  return new Date(Number(match[1]), Number(match[2]) - 1, day).getDay() === 6;
};

export const DEFAULT_CONTROL_RULES = {
  shiftStarts: ['08:00', '16:00', '00:00'],
  shiftHours: 8,
  entryGraceMinutes: 15,
  penaltyStepMinutes: 30,
  penaltyStepHours: 0.5,
  exitGraceMinutes: 10,
  payrollDays: 22,
};

export const CONTROL_COMPANIES = [
  { key: 'AGROSATI', label: 'AGROSATI', sheetPattern: /AGROSATI/i },
  { key: 'CONSERVERIE', label: 'CONSERVERIE', sheetPattern: /conserverie/i },
  { key: 'MGK', label: 'MGK-PVC', sheetPattern: /MGK/i },
  { key: 'MINOTERIE', label: 'MINOTERIE', sheetPattern: /MINOTERIE/i },
  { key: 'GROUPE', label: 'SARL GROUPE', sheetPattern: /ADMINISTRATION|GROUPE/i },
  { key: 'TRANSPORT', label: 'TRANSPORT', sheetPattern: /TRANSPORT/i },
];

async function workbookFrom(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return { XLSX, workbook };
}

export async function parseMachineWorkbook(file) {
  const { XLSX, workbook } = await workbookFrom(file);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
  const headerIndex = rows.findIndex((row) => row.length > 40 && text(row[0]) && text(row[1]));
  if (headerIndex < 0) throw new Error('Le format du pointage machine n’est pas reconnu.');
  const header = rows[headerIndex];
  const dayIndexes = header.map((value, index) => (/^\d{2}$/.test(text(value)) ? index : -1)).filter((index) => index >= 0);
  const employees = rows.slice(headerIndex + 1).filter((row) => /^[A-Z]\d+$/i.test(normalizeMatricule(row[0]))).map((row) => ({
    employeeId: normalizeMatricule(row[0]),
    employeeName: text(row[1]),
    department: text(row[2]) || 'Non affecté',
    days: Object.fromEntries(dayIndexes.map((index) => [normalizeDay(header[index]), text(row[index])])),
  }));
  const missingMatriculeRows = rows.slice(headerIndex + 1).map((row, index) => ({ row, rowNumber: headerIndex + index + 2 })).filter(({ row }) => !normalizeMatricule(row[0]) && text(row[1]) && row.slice(3, 33).some((value) => text(value))).map(({ row, rowNumber }) => ({ row: rowNumber, employeeName: text(row[1]), department: text(row[2]) }));
  if (!employees.length) throw new Error('Aucun employé reconnu dans le pointage machine.');
  const stamp = sheetName.match(/^(20\d{2})(\d{2})(\d{2})/);
  const period = stamp ? `${stamp[1]}-${String(Number(stamp[2]) - (Number(stamp[3]) < 15 ? 1 : 0)).padStart(2, '0')}` : '';
  return { meta: { fileName: file.name, sheetName, period }, employees, missingMatriculeRows };
}

export async function parseHrWorkbook(file) {
  const { XLSX, workbook } = await workbookFrom(file);
  const records = [];
  const missingMatriculeRows = [];
  for (const sheetName of workbook.SheetNames) {
    if (/rapport|feuil/i.test(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const employeeId = normalizeMatricule(row[2]);
      const employeeName = text(row[1]);
      const dayValues = row.slice(3, 34).map(text);
      if (!/^[A-Z]\d+$/i.test(employeeId) || !employeeName) {
        if (!employeeId && employeeName && dayValues.some(Boolean) && /^\d+$/.test(text(row[0]))) missingMatriculeRows.push({ sheetName, row: rowIndex + 1, employeeName });
        continue;
      }
      const days = {};
      for (let day = 1; day <= 31; day += 1) days[String(day).padStart(2, '0')] = text(row[day + 2]);
      records.push({ key: `${sheetName}-${rowIndex + 1}`, sheetName, row: rowIndex + 1, employeeId, employeeName, days });
    }
  }
  if (!records.length) throw new Error('Aucune ligne RH avec matricule reconnue.');
  const periodText = `${file.name} ${workbook.SheetNames.join(' ')}`;
  const year = periodText.match(/20\d{2}/)?.[0] || '';
  const month = /sept/i.test(periodText) || /09/.test(file.name) ? '09' : '';
  return { meta: { fileName: file.name, period: year && month ? `${year}-${month}` : '', sheets: workbook.SheetNames }, records, missingMatriculeRows };
}

export async function parsePayrollWorkbook(file) {
  const { XLSX, workbook } = await workbookFrom(file);
  let sheetName = '';
  let rows = [];
  let headerIndex = -1;
  for (const candidate of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[candidate], { header: 1, defval: '', raw: false });
    const found = matrix.findIndex((row) => row.some((value) => /NET A PAYER/i.test(text(value))));
    if (found >= 0) { sheetName = candidate; rows = matrix; headerIndex = found; break; }
  }
  if (headerIndex < 0) throw new Error('Le journal de paie n’est pas reconnu.');
  const payrollRows = rows.slice(headerIndex + 1);
  const employees = payrollRows.filter((row) => /^[A-Z]\d+$/i.test(normalizeMatricule(row[0]))).map((row) => ({
    employeeId: normalizeMatricule(row[0]), employeeName: text(row[1]), role: text(row[2]),
    presenceDays: number(row[5]), baseSalary: number(row[6]), leaveDays: number(row[7]), leaveAmount: number(row[8]),
    seniority: number(row[9]), nuisance: number(row[10]), performance: number(row[11]), overtime: number(row[12]),
    leaveCount: number(row[13]), leavePay: number(row[14]), responsibility: number(row[15]), stc: number(row[16]), overtimeAdjustment: number(row[17]),
    positionSalary: number(row[18]), socialSecurity: number(row[19]), transport: number(row[20]), meal: number(row[21]),
    taxableSalary: number(row[22]), incomeTax: number(row[23]), taxableGross: number(row[24]), singleSalary: number(row[25]),
    sickLeaveDeduction: number(row[26]), absenceDeduction: number(row[27]), salaryDeduction: number(row[28]), netPay: number(row[29]),
  }));
  const missingMatriculeRows = payrollRows.map((row, index) => ({ row, rowNumber: headerIndex + index + 2 })).filter(({ row }) => !normalizeMatricule(row[0]) && text(row[1]) && row.slice(5, 30).some((value) => number(value) !== 0)).map(({ row, rowNumber }) => ({ row: rowNumber, employeeName: text(row[1]) }));
  if (!employees.length) throw new Error('Aucun salarié reconnu dans le journal de paie.');
  const periodLabel = rows.slice(0, headerIndex).flat().map(text).find((value) => /Mois de/i.test(value)) || '';
  const year = periodLabel.match(/20\d{2}/)?.[0] || '';
  return { meta: { fileName: file.name, sheetName, period: year && /sept/i.test(periodLabel) ? `${year}-09` : '' }, employees, missingMatriculeRows };
}

export function calculateMachineDay(value, customRules = DEFAULT_CONTROL_RULES) {
  const rules = { ...DEFAULT_CONTROL_RULES, ...customRules };
  const match = text(value).match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!match) return { raw: text(value), first: '', last: '', creditedHours: null, shift: 'unknown' };
  const first = match[1].padStart(5, '0');
  const last = match[2].padStart(5, '0');
  const firstMinutes = toMinutes(first);
  const lastMinutes = toMinutes(last);
  const starts = rules.shiftStarts.map(toMinutes).filter(Number.isFinite);
  const candidates = starts.map((start) => {
    let delta = firstMinutes - start;
    if (delta >= 12 * 60) delta -= 24 * 60;
    if (delta < -12 * 60) delta += 24 * 60;
    return { start, delta };
  }).sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta));
  const { start, delta } = candidates[0] || { start: 8 * 60, delta: firstMinutes - 8 * 60 };
  const normalizedFirst = start + delta;
  const end = start + Number(rules.shiftHours || 8) * 60;
  let normalizedLast = lastMinutes;
  while (normalizedLast < normalizedFirst) normalizedLast += 24 * 60;
  const delay = Math.max(0, normalizedFirst - start);
  const stepMinutes = Math.max(1, Number(rules.penaltyStepMinutes || 30));
  const stepHours = Math.max(0, Number(rules.penaltyStepHours || 0.5));
  const arrivalPenalty = delay <= Number(rules.entryGraceMinutes || 0) ? 0 : Math.ceil(delay / stepMinutes) * stepHours;
  const earlyMinutes = Math.max(0, end - Number(rules.exitGraceMinutes || 0) - normalizedLast);
  const earlyPenalty = earlyMinutes ? Math.ceil(earlyMinutes / stepMinutes) * stepHours : 0;
  const shiftHour = Math.floor(start / 60);
  const shiftMinute = start % 60;
  const endClock = (start + Number(rules.shiftHours || 8) * 60) % (24 * 60);
  return {
    raw: text(value), first, last, arrivalPenalty, earlyPenalty,
    creditedHours: Math.max(0, Number(rules.shiftHours || 8) - arrivalPenalty - earlyPenalty),
    shift: `shift-${String(shiftHour).padStart(2, '0')}${String(shiftMinute).padStart(2, '0')}`,
    shiftLabel: `${String(shiftHour).padStart(2, '0')}:${String(shiftMinute).padStart(2, '0')}–${String(Math.floor(endClock / 60)).padStart(2, '0')}:${String(endClock % 60).padStart(2, '0')}`,
  };
}

function hrHours(value) {
  const normalized = text(value).replace(',', '.').replace(/\++$/, '');
  return /^\d+(?:\.\d+)?$/.test(normalized) ? number(normalized) : null;
}

function nearlyEqual(left, right, tolerance = 0.01) { return Math.abs(left - right) <= tolerance; }

export function buildAgrosatiControl(machineData, hrData, payrollData, customRules = DEFAULT_CONTROL_RULES, salaryBaseData = null, companyKey = 'AGROSATI') {
  if (!machineData || !hrData || !payrollData) return null;
  const rules = { ...DEFAULT_CONTROL_RULES, ...customRules };
  const company = CONTROL_COMPANIES.find((item) => item.key === companyKey) || CONTROL_COMPANIES[0];
  const salaryBaseById = new Map((salaryBaseData?.employees || []).map((employee) => [employee.employeeId, employee]));
  const machineEmployees = machineData.employees.filter((employee) => salaryBaseById.get(employee.employeeId)?.company === company.key);
  const machineById = new Map(machineEmployees.map((employee) => [employee.employeeId, employee]));
  const hrRecordsById = new Map();
  for (const record of hrData.records) {
    if (!hrRecordsById.has(record.employeeId)) hrRecordsById.set(record.employeeId, []);
    hrRecordsById.get(record.employeeId).push(record);
  }
  const hrPrimary = new Map([...hrRecordsById].map(([id, records]) => [id, records.find((record) => company.sheetPattern.test(record.sheetName)) || records[0]]));
  const payrollById = new Map(payrollData.employees.map((employee) => [employee.employeeId, employee]));
  const controlPeriod = machineData.meta?.period || hrData.meta?.period || payrollData.meta?.period;
  const restDays = {};
  for (let day = 1; day <= 31; day += 1) {
    const key = String(day).padStart(2, '0');
    const values = [...hrPrimary.values()].map((record) => text(record.days[key])).filter(Boolean);
    restDays[key] = values.length > 0 && values.filter((value) => value === 'R').length / values.length >= 0.45;
  }

  const employees = payrollData.employees.map((payroll) => {
    const machine = machineById.get(payroll.employeeId) || null;
    const hr = hrPrimary.get(payroll.employeeId) || null;
    const salaryBaseRecord = salaryBaseById.get(payroll.employeeId) || null;
    const duplicateHr = (hrRecordsById.get(payroll.employeeId) || []).length > 1;
    const saturdayOnly = SATURDAY_ONLY_EMPLOYEES.has(payroll.employeeId);
    const fullShiftOnPresence = FULL_SHIFT_ON_PRESENCE_EMPLOYEES.has(payroll.employeeId);
    const days = [];
    for (let day = 1; day <= 30; day += 1) {
      const key = String(day).padStart(2, '0');
      const machinePunch = calculateMachineDay(machine?.days[key], rules);
      const punch = fullShiftOnPresence && machinePunch.raw
        ? { ...machinePunch, creditedHours: Number(rules.shiftHours || 8), arrivalPenalty: 0, earlyPenalty: 0 }
        : machinePunch;
      const rhValue = text(hr?.days[key]);
      const enteredHours = hrHours(rhValue);
      let status = 'empty';
      let label = 'Sans donnée';
      const requiredDay = !saturdayOnly || isSaturday(controlPeriod, day);
      if (!requiredDay) { status = punch.raw ? 'review' : 'rest'; label = punch.raw ? 'Présence hors samedi' : 'Présence non requise'; }
      else if (!hr) { status = 'missing-hr'; label = 'RH manquant'; }
      else if (rhValue === 'R') { status = punch.raw ? 'rh-difference' : 'rest'; label = punch.raw ? 'Pointage sur repos' : 'Repos'; }
      else if (!punch.raw && rhValue === 'A' && !restDays[key]) { status = 'absence'; label = 'Absence validée'; }
      else if (!punch.raw && ['C', 'M', 'M/A', 'DC'].includes(rhValue.toUpperCase())) { status = 'review'; label = 'Justificatif à vérifier'; }
      else if (!punch.raw && enteredHours !== null) { status = 'rh-difference'; label = 'Heures RH sans pointage'; }
      else if (punch.raw && rhValue === 'A') { status = 'rh-difference'; label = 'Pointage mais RH absent'; }
      else if (fullShiftOnPresence && punch.raw && enteredHours !== null) { status = 'correct'; label = 'Présence validée · 8h'; }
      else if (punch.creditedHours !== null && enteredHours !== null) { status = nearlyEqual(punch.creditedHours, enteredHours) ? 'correct' : 'rh-difference'; label = status === 'correct' ? 'Conforme' : 'Heures différentes'; }
      else if (punch.raw && !rhValue) { status = 'rh-difference'; label = 'Pointage absent du RH'; }
      else if (!punch.raw && rhValue === 'A' && restDays[key]) { status = 'review'; label = 'Absence sur jour de repos'; }
      days.push({ day: key, machineValue: punch.raw, first: punch.first, last: punch.last, calculatedHours: punch.creditedHours, arrivalPenalty: punch.arrivalPenalty || 0, earlyPenalty: punch.earlyPenalty || 0, shift: punch.shift, shiftLabel: punch.shiftLabel || '', rhValue, enteredHours, status, label, restDay: restDays[key] });
    }
    const unpaidAbsences = days.filter((day) => day.status === 'absence').length;
    const justifiedCodes = new Set(['R', 'C', 'M', 'M/A', 'DC']);
    const unpaidHours = days.reduce((total, day) => {
      if ((saturdayOnly && !isSaturday(controlPeriod, Number(day.day))) || !day.machineValue || day.calculatedHours === null || justifiedCodes.has(day.rhValue.toUpperCase())) return total;
      return total + day.arrivalPenalty + day.earlyPenalty;
    }, 0);
    const rhDifferences = days.filter((day) => day.status === 'rh-difference').length;
    const reviews = days.filter((day) => day.status === 'review').length;
    const payrollDays = Math.max(1, Number(rules.payrollDays || 22));
    const hourlyBase = salaryBaseRecord ? salaryBaseRecord.baseSalary / payrollDays / Number(rules.shiftHours || 8) : 0;
    const expectedAbsenceDeduction = salaryBaseRecord ? unpaidAbsences * salaryBaseRecord.baseSalary / payrollDays + unpaidHours * hourlyBase : null;
    const expectedBaseAfterAttendance = salaryBaseRecord ? Math.max(0, salaryBaseRecord.baseSalary - expectedAbsenceDeduction) : null;
    const scheduledDays = saturdayOnly ? days.filter((day) => isSaturday(controlPeriod, Number(day.day))).length : payrollDays;
    const expectedPresence = Math.max(0, scheduledDays - unpaidAbsences);
    const calculatedNet = payroll.taxableSalary - payroll.incomeTax + payroll.singleSalary - payroll.salaryDeduction;
    const absenceMismatch = salaryBaseRecord ? !nearlyEqual(expectedAbsenceDeduction, payroll.absenceDeduction, 0.02) : false;
    const baseSalaryMismatch = salaryBaseRecord ? !nearlyEqual(expectedBaseAfterAttendance, payroll.baseSalary, 0.02) : false;
    const presenceMismatch = !nearlyEqual(expectedPresence, payroll.presenceDays, 0.01) && payroll.leaveDays === 0;
    const netMismatch = !nearlyEqual(calculatedNet, payroll.netPay, 0.02);
    const issues = [];
    if (!salaryBaseRecord) issues.push('missing-base');
    if (!hr) issues.push('missing-hr');
    if (!machine) issues.push('missing-machine');
    if (duplicateHr) issues.push('duplicate-hr');
    if (rhDifferences) issues.push('rh-difference');
    if (reviews) issues.push('review');
    if (absenceMismatch) issues.push('absence-payroll');
    if (baseSalaryMismatch) issues.push('base-salary-payroll');
    if (presenceMismatch) issues.push('presence-payroll');
    if (netMismatch) issues.push('net-payroll');
    return { employeeId: payroll.employeeId, employeeName: payroll.employeeName, role: payroll.role, company: company.key, companyLabel: company.label, machine, hr, payroll, salaryBaseRecord, contractualBaseSalary: salaryBaseRecord?.baseSalary ?? null, unpaidAbsences, unpaidHours, rhDifferences, reviews, expectedAbsenceDeduction, expectedBaseAfterAttendance, expectedPresence, calculatedNet, absenceMismatch, baseSalaryMismatch, presenceMismatch, netMismatch, days, issues, status: issues.length ? issues[0] : 'correct' };
  });
  const nonPayroll = machineEmployees.filter((employee) => !payrollById.has(employee.employeeId));
  return {
    company, employees, nonPayroll, restDays, rules,
    kpis: {
      controlled: employees.length,
      rhDifferences: employees.filter((employee) => employee.rhDifferences > 0).length,
      pendingReviews: employees.filter((employee) => employee.reviews > 0 || !employee.hr).length,
      payrollAnomalies: employees.filter((employee) => employee.absenceMismatch || employee.baseSalaryMismatch || employee.presenceMismatch || employee.netMismatch).length,
      salaryBaseMissing: employees.filter((employee) => !employee.salaryBaseRecord).length,
      totalNet: employees.reduce((sum, employee) => sum + employee.payroll.netPay, 0),
      totalAbsenceDeductions: employees.reduce((sum, employee) => sum + employee.payroll.absenceDeduction, 0),
    },
  };
}

export async function exportControlAnomalies(model) {
  const XLSX = await import('xlsx');
  const rows = model.employees.filter((employee) => employee.issues.length).map((employee) => ({
    Matricule: employee.employeeId, Salarié: employee.employeeName, Fonction: employee.role,
    'Salaire base contractuel': employee.contractualBaseSalary, 'Absences validées': employee.unpaidAbsences,
    'Heures à déduire': employee.unpaidHours, 'Salaire base attendu': employee.expectedBaseAfterAttendance,
    'Salaire base paie': employee.payroll.baseSalary, 'Présence attendue': employee.expectedPresence,
    'Présence paie': employee.payroll.presenceDays, 'Retenue absence attendue': employee.expectedAbsenceDeduction,
    'Retenue absence paie': employee.payroll.absenceDeduction, 'Net calculé': employee.calculatedNet,
    'Net à payer': employee.payroll.netPay, 'Écarts RH': employee.rhDifferences, 'Révisions': employee.reviews,
    Anomalies: employee.issues.join(', '),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Anomalies');
  XLSX.writeFile(workbook, `controle_presence_paie_${model.company?.key?.toLowerCase() || 'societe'}.xlsx`);
}
