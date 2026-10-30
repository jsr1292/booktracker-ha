import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { clientBuildExists, startServer } from './helpers.js';
import { safeIsbn, safeWorkKey, safeCurrentPage } from '../src/shared/validation.js';

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

test('edition and progress validators reject malformed values', () => {
  assert.equal(safeIsbn('0-306-40615-2'), '0306406152');
  assert.equal(safeIsbn('0 8044 2957 x'), '080442957X');
  assert.equal(safeIsbn('9780306406157'), '9780306406157');
  assert.equal(safeIsbn('bad'), null);
  assert.equal(safeWorkKey('/works/OL123W'), '/works/OL123W');
  assert.equal(safeWorkKey('/books/OL123M'), null);
  assert.equal(safeCurrentPage(120, 100), 100);
  assert.equal(safeCurrentPage(0, 100), null);
  assert.equal(safeCurrentPage(1.5, null), null);
});

test('legacy database rows survive the additive schema migration', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'booktracker-legacy-'));
  const path = join(dataDir, 'database.sqlite');
  const legacy = new Database(path);
  legacy.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT, status TEXT NOT NULL,
    rating INTEGER, pages INTEGER, genre TEXT, language TEXT, cover_url TEXT, description TEXT,
    date_started TEXT, date_finished TEXT, planned_date TEXT, notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL);`);
  legacy.prepare("INSERT INTO books (id,title,status,created_at,updated_at) VALUES (1,'Old book','reading','2020-01-01','2020-01-01')").run();
  legacy.prepare("INSERT INTO users (id,username,password_hash,created_at) VALUES (1,'old','hash','2020-01-01')").run();
  legacy.close();
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: join(process.cwd()), env: { ...process.env, DATA_DIR: dataDir, PORT: '0',
      JWT_SECRET: 'migration-test-secret-at-least-thirty-two-characters', ADMIN_KEY: 'migration-test-admin' },
    stdio: 'ignore',
  });
  try {
    const deadline = Date.now() + 5000;
    let migrated = false;
    while (Date.now() < deadline) {
      const check = new Database(path);
      const columns = check.pragma('table_info(books)') as { name: string }[];
      migrated = columns.some(column => column.name === 'openlibrary_key');
      check.close();
      if (migrated) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(migrated, 'schema was not migrated');
    const check = new Database(path);
    try {
      assert.equal((check.prepare('SELECT title FROM books WHERE id=1').get() as { title: string }).title, 'Old book');
      assert.equal((check.prepare('SELECT reading_goal FROM users WHERE id=1').get() as { reading_goal: number }).reading_goal, 12);
      for (const column of ['current_page', 'isbn', 'openlibrary_key']) {
        assert.ok((check.pragma('table_info(books)') as { name: string }[]).some(info => info.name === column));
      }
    } finally { check.close(); }
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('book progress and edition survive create, patch and put; settings stay per user', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const created = await server.request('/api/books', { title: 'Progress book', status: 'reading', pages: 100,
    current_page: 120, isbn: '0-306-40615-2', openlibrary_key: '/works/OL123W' }, headers);
  assert.equal(created.status, 201);
  const book = await created.json();
  assert.equal(book.current_page, 100);
  assert.equal(book.isbn, '0306406152');
  assert.equal(book.openlibrary_key, '/works/OL123W');
  const patch = await fetch(`${server.url}/api/books/${book.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_page: null, isbn: null }) });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).current_page, null);
  const put = await fetch(`${server.url}/api/books/${book.id}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Progress book', author: 'Author', status: 'reading', pages: 200, current_page: 15,
      isbn: '9780306406157', openlibrary_key: '/works/OL456W' }) });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).current_page, 15);
  assert.deepEqual(await (await server.request('/api/settings', undefined, headers)).json(), { reading_goal: 12 });
  const updated = await fetch(`${server.url}/api/settings`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ reading_goal: 37 }) });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { reading_goal: 37 });
  for (const reading_goal of [0, 1001, 1.5, '12']) {
    const invalid = await fetch(`${server.url}/api/settings`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ reading_goal }) });
    assert.equal(invalid.status, 400);
  }
  await server.createUser('settings-other', 'test-password', rotatedIp());
  const login = await server.request('/api/auth/login', { username: 'settings-other', password: 'test-password' }, rotatedIp());
  assert.equal(login.status, 200);
  const otherHeaders = { Authorization: `Bearer ${(await login.json()).token}` };
  assert.deepEqual(await (await server.request('/api/settings', undefined, otherHeaders)).json(), { reading_goal: 12 });
  assert.deepEqual(await (await server.request('/api/books', undefined, otherHeaders)).json(), []);
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
