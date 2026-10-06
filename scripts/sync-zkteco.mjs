import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.ZK_BASE_URL || 'http://192.168.5.200').replace(/\/$/, '');
const username = process.env.ZK_USERNAME;
const password = process.env.ZK_PASSWORD;
const output = path.resolve('public/data/attendance-data.json');

if (!username || !password) {
  throw new Error('ZK_USERNAME and ZK_PASSWORD are required in the local environment. Credentials are never written to the dashboard data.');
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return response.json();
}

const auth = await request(`${baseUrl}/jwt-api-token-auth/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const token = auth.token || auth.access;
if (!token) throw new Error('ZKBioTime authenticated but did not return a JWT token.');
const headers = { Authorization: `JWT ${token}`, Accept: 'application/json' };

async function allPages(endpoint) {
  let url = `${baseUrl}${endpoint}`;
  const data = [];
  while (url) {
    const page = await request(url, { headers });
    data.push(...(page.data || page.results || []));
    url = page.next || null;
  }
  return data;
}

const [employees, transactions, terminals, departments, positions] = await Promise.all([
  allPages('/personnel/api/employees/'),
  allPages('/iclock/api/transactions/'),
  allPages('/iclock/api/terminals/'),
  allPages('/personnel/api/departments/'),
  allPages('/personnel/api/positions/'),
]);

const payload = {
  meta: {
    source: 'ZKBioTime API',
    baseUrl,
    generatedAt: new Date().toISOString(),
    syncState: 'complete',
    counts: {
      employees: employees.length,
      transactions: transactions.length,
      terminals: terminals.length,
      departments: departments.length,
      positions: positions.length,
    },
  },
  employees,
  transactions,
  terminals,
  departments,
  positions,
};

await fs.mkdir(path.dirname(output), { recursive: true });
const temporary = `${output}.tmp`;
await fs.writeFile(temporary, JSON.stringify(payload));
await fs.rename(temporary, output);
console.log(`Synced ${employees.length} employees and ${transactions.length} attendance transactions.`);
