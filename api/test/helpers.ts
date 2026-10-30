import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const clientBuildExists = existsSync(join(apiRoot, '../client/dist/index.html'));

export async function startServer() {
  const root = await mkdtemp(join(tmpdir(), 'booktracker-api-test-'));
  // Isolate even the pre-DATA_DIR implementation from the developer's local data.
  await cp(join(apiRoot, 'src'), join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await symlink(join(apiRoot, 'node_modules'), join(root, 'node_modules'));
  if (clientBuildExists) {
    await mkdir(join(root, 'dist-client'), { recursive: true });
    await cp(join(apiRoot, '../client/dist'), join(root, 'dist-client/dist'), { recursive: true });
  }
  const socket = createServer();
  try {
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => socket.close(err => err ? reject(err) : resolve()));
  const dataDir = join(root, 'isolated-data');
  const adminKey = 'test-admin-key';
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir,
      JWT_SECRET: 'isolated-test-secret-at-least-thirty-two-characters', ADMIN_KEY: adminKey,
      REGISTRATION_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = once(child, 'exit');
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    await rm(root, { recursive: true, force: true });
  }
  const url = `http://127.0.0.1:${port}`;
  async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
    return fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
  }
  try {
    const deadline = Date.now() + 15000;
    while (true) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(output);
      try { if ((await request('/api/auth/config')).ok) break; } catch { /* starting */ }
      if (Date.now() > deadline) throw new Error(`Server did not start: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) { await stop(); throw error; }
  return { url, dataDir, request, stop,
    async createUser(username: string, password = 'test-password', headers: Record<string, string> = {}) {
      const response = await request('/api/admin/create-user', { adminKey, username, password }, headers);
      if (response.status !== 201) throw new Error(`Create user: ${response.status} ${await response.text()}`);
    }, adminKey };
}
