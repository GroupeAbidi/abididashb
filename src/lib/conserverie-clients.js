import * as XLSX from 'xlsx';

const clean = (value) => String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const number = (value) => { const parsed = Number(clean(value).replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0; };

export async function parseConserverieClients(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const clients = matrix.filter((row) => /^C\d+$/i.test(clean(row[0]))).map((row) => ({ code: clean(row[0]), name: clean(row[1]), opening: number(row[3]), sales: number(row[7]), payments: number(row[10]), balance: number(row[12]), share: number(row[15]) }));
  if (!clients.length) throw new Error('Aucun client reconnu. Le fichier doit être une Balance Client En Livraison.');
  const sum = (field) => clients.reduce((total, row) => total + row[field], 0);
  const receivable = clients.filter((row) => row.balance > 0).reduce((total, row) => total + row.balance, 0);
  const advances = Math.abs(clients.filter((row) => row.balance < 0).reduce((total, row) => total + row.balance, 0));
  const match = file.name.match(/(\d{1,2})[-_](\d{4})/);
  const period = match ? `${match[2]}-${match[1].padStart(2, '0')}` : '';
  return { clients, totals: { clients: clients.length, opening: sum('opening'), sales: sum('sales'), payments: sum('payments'), balance: sum('balance'), receivable, advances, unpaid: clients.filter((row) => row.sales > 0 && row.payments === 0).length }, meta: { fileName: file.name, period, importedAt: new Date().toISOString() } };
}
