import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { clientBuildExists, startServer } from './helpers.js';

let server: Awaited<ReturnType<typeof startServer>>;
let token: string;
before(async () => {
  server = await startServer();
  await server.createUser('reader');
  const login = await server.request('/api/auth/login', { username: 'reader', password: 'test-password' });
  assert.equal(login.status, 200);
  token = (await login.json()).token;
});
after(async () => { await server?.stop(); });

test('DATA_DIR isolates the database', () => {
  assert.ok(existsSync(join(server.dataDir, 'database.sqlite')));
});

test('/api/stats returns 200 with a book present (GROUP_CONCAT regression)', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const created = await server.request('/api/books', {
    title: 'Regression book', status: 'finished', date_finished: '2026-10-30',
  }, headers);
  assert.equal(created.status, 201);
  const stats = await server.request('/api/stats', undefined, headers);
  assert.equal(stats.status, 200);
  assert.equal((await stats.json()).total_books, 1);
});

for (const path of ['/', '/index.html', '/sw.js']) {
  test(`${path} CSP permits required hosts (skipped only when no client build exists)`, {
    skip: clientBuildExists ? false : 'No client build exists',
  }, async () => {
    const response = await server.request(path);
    assert.equal(response.status, 200);
    const csp = response.headers.get('content-security-policy') ?? '';
    const connect = csp.split(';').find(directive => directive.trim().startsWith('connect-src')) ?? '';
    for (const host of path === '/sw.js'
      ? ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']
      : ['https://openlibrary.org']) assert.ok(connect.includes(host), csp);
  });
}

let ipCounter = 0;
const rotatedIp = () => ({ 'X-Forwarded-For': `203.0.113.${++ipCounter}` });

test('rotating forwarded IPs cannot bypass account lock; another account can log in', async () => {
  await server.createUser('other-reader', 'test-password', rotatedIp());
  for (let i = 0; i < 10; i++) {
    const response = await server.request('/api/auth/login', {
      username: i % 2 ? ' Reader ' : 'reader', password: 'wrong-password',
    }, rotatedIp());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid credentials' });
  }
  const locked = await server.request('/api/auth/login', {
    username: 'reader', password: 'test-password',
  }, rotatedIp());
  assert.equal(locked.status, 429);
  assert.deepEqual(await locked.json(), { error: 'Too many attempts, please try again later' });
  const other = await server.request('/api/auth/login', {
    username: 'other-reader', password: 'test-password',
  }, rotatedIp());
  assert.equal(other.status, 200);
});

test('unknown usernames also accumulate failures', async () => {
  for (let i = 0; i < 10; i++) {
    const response = await server.request('/api/auth/login', {
      username: 'unknown-reader', password: 'wrong-password',
    }, rotatedIp());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid credentials' });
  }
  const response = await server.request('/api/auth/login', {
    username: 'unknown-reader', password: 'wrong-password',
  }, rotatedIp());
  assert.equal(response.status, 429);
});

test('startup can provision more than five users from one address', async () => {
  for (let i = 0; i < 6; i++) await server.createUser(`startup-${i}`);
});

// Keep last: it leaves the admin endpoint locked on this server.
test('a locked admin endpoint refuses the correct key too, so guessing gets no answer', async () => {
  for (let i = 0; i < 10; i++) {
    const response = await server.request('/api/admin/create-user', {
      adminKey: 'wrong-key', username: `attacker-${i}`, password: 'test-password',
    }, rotatedIp());
    assert.equal(response.status, 401);
  }
  for (const adminKey of ['wrong-key', server.adminKey]) {
    const locked = await server.request('/api/admin/create-user', {
      adminKey, username: 'another-attacker', password: 'test-password',
    }, rotatedIp());
    assert.equal(locked.status, 429);
  }
});

