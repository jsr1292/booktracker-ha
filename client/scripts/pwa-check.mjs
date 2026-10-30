#!/usr/bin/env node
// Run after `npm run build` in client, using Node 20 for better-sqlite3.
// The API is compiled into a temporary install and client/dist is copied to
// that install's dist-client/dist. No project data or existing API build is used.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = resolve(clientRoot, '../api');
let root;
let child;
let childExited;
let browser;
let serverLog = '';
const violations = new Set();
let stage = 'preflight';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function run() {
  assert.equal(process.versions.node.split('.')[0], '20', 'Use Node 20: better-sqlite3 requires its Node 20 ABI');
  assert.ok(existsSync(join(clientRoot, 'dist/index.html')), 'Missing client build: run npm run build in client first');
  assert.ok(existsSync(join(clientRoot, 'dist/sw.js')), 'Client build has no service worker');
  root = await mkdtemp(join(tmpdir(), 'booktracker-pwa-'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await symlink(join(apiRoot, 'node_modules'), join(root, 'node_modules'));
  stage = 'compile API';
  const build = spawnSync(process.execPath, [join(apiRoot, 'node_modules/typescript/bin/tsc'),
    '--project', join(apiRoot, 'tsconfig.json'), '--outDir', join(root, 'dist')], { encoding: 'utf8' });
  assert.equal(build.status, 0, `API build failed: ${build.error ?? ''}\n${build.stdout}\n${build.stderr}`);
  await mkdir(join(root, 'dist-client'));
  await cp(join(clientRoot, 'dist'), join(root, 'dist-client/dist'), { recursive: true });
  stage = 'start isolated API';
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const adminKey = 'pwa-test-admin-key';
  child = spawn(process.execPath, [join(root, 'dist/index.js')], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DATA_DIR: join(root, 'data'),
      JWT_SECRET: 'pwa-test-secret-at-least-thirty-two-characters', ADMIN_KEY: adminKey,
      REGISTRATION_ENABLED: 'false' },
  });
  child.stdout.on('data', chunk => { serverLog += chunk; });
  child.stderr.on('data', chunk => { serverLog += chunk; });
  childExited = once(child, 'exit');
  const request = (path, body) => fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const deadline = Date.now() + 15000;
  while (true) {
    assert.equal(child.exitCode, null, `API exited: ${serverLog}`);
    try { if ((await request('/api/auth/config')).ok) break; } catch { /* still starting */ }
    assert.ok(Date.now() < deadline, `API did not become ready: ${serverLog}`);
    await delay(50);
  }
  stage = 'create and log in test user';
  const credentials = { username: 'pwa-reader', password: 'pwa-test-password' };
  const created = await request('/api/admin/create-user', { adminKey, ...credentials });
  assert.equal(created.status, 201, `Create user failed: ${await created.text()}`);
  const login = await request('/api/auth/login', credentials);
  assert.equal(login.status, 200, 'Login failed');
  const { token } = await login.json();

  stage = 'launch Chromium';
  browser = await chromium.launch({ args: [
    // Requests not handled by a fixture cannot reach external hosts (including preconnects).
    '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--disable-background-networking',
  ] });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  context.setDefaultTimeout(15000);
  context.on('console', message => {
    if (/content.security.policy|violat.*directive|refused to (load|connect|execute)/i.test(message.text())) {
      violations.add(message.text());
    }
  });
  await context.exposeBinding('reportCspViolation', (_source, message) => { violations.add(message); });
  await context.addInitScript(({ token, origin }) => {
    if (location.origin === origin) {
      localStorage.setItem('booktracker_token', token);
      localStorage.setItem('booktracker_username', 'pwa-reader');
    }
    document.addEventListener('securitypolicyviolation', event => {
      window.reportCspViolation(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  }, { token, origin });
  // Context routing also catches service-worker-owned font requests in Chromium.
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'fonts.googleapis.com') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '/* offline font fixture */' });
    }
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const title = 'PWA regression fixture';
  let searchHits = 0;
  let coverHits = 0;
  // These page routes do not bypass CSP: blocked requests never reach them.
  await page.route('https://openlibrary.org/**', async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === '/search.json') {
      searchHits++;
      body = { numFound: 1, docs: [{ key: '/works/OL1W', title, author_name: ['Fixture Author'],
        cover_i: 123, number_of_pages_median: 320, language: ['eng'], first_publish_year: 2020 }] };
    } else if (url.pathname === '/works/OL1W.json') {
      body = { key: '/works/OL1W', title, description: 'Offline fixture', subjects: ['Fiction'] };
    } else {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route('https://covers.openlibrary.org/**', route => {
    coverHits++;
    return route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  });

  stage = 'first load and service worker activation';
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  stage = 'second load from the service worker';
  const navigation = await page.reload({ waitUntil: 'load' });
  assert.ok(navigation?.fromServiceWorker(), 'Second navigation was not served by the service worker');
  assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'Second page has no controlling worker');

  stage = 'search and cover under cached CSP';
  await page.getByTitle('Add book', { exact: true }).click();
  await page.getByPlaceholder('Start typing a book title...').fill('PWA regression');
  await page.getByText(title, { exact: true }).waitFor({ state: 'visible' });
  assert.ok(searchHits > 0, 'Open Library search did not reach its stub (check CSP)');
  const cover = page.locator('img[src^="https://covers.openlibrary.org/"]').first();
  await cover.waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.images].some(img =>
    img.src.startsWith('https://covers.openlibrary.org/') && img.complete && img.naturalWidth > 0));
  assert.ok(coverHits > 0, 'Cover did not reach its stub (check CSP)');
  await page.getByText(title, { exact: true }).click();
  const saved = page.waitForResponse(response => response.url() === `${origin}/api/books`
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add Book', exact: true }).click();
  assert.equal((await saved).status(), 201, 'Adding the fixture book failed');
  await page.locator('.modal-overlay').waitFor({ state: 'hidden' });

  stage = 'idle main thread over three seconds';
  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics
    .map(({ name, value }) => [name, value]));
  await page.waitForLoadState('networkidle');
  const before = await metrics();
  await delay(3000);
  const after = await metrics();
  const elapsed = after.Timestamp - before.Timestamp;
  const busy = (after.TaskDuration - before.TaskDuration) / elapsed;
  assert.ok(elapsed >= 2.9 && Number.isFinite(busy) && busy < 0.5,
    `Idle main thread busy ${(busy * 100).toFixed(1)}% over ${elapsed.toFixed(2)}s; expected <50%`);
  assert.equal(violations.size, 0, `CSP violations:\n${[...violations].join('\n')}`);
  console.log(`PWA check passed: worker navigation, search, cover, save, no CSP violations; idle CPU ${(busy * 100).toFixed(1)}%`);
}

try { await run(); }
catch (error) {
  console.error(`PWA check failed during ${stage}: ${error.message}`);
  if (violations.size) console.error([...violations].join('\n'));
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await childExited; } finally { clearTimeout(forceKill); }
  }
  if (root) await rm(root, { recursive: true, force: true });
}
