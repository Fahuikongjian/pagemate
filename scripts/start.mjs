import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) { console.error('Please install Node.js 24 LTS (minimum 22.13): https://nodejs.org/'); process.exit(1); }
const runNpm = (command) => {
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const result = existsSync(npmCli)
    ? spawnSync(process.execPath, [npmCli, ...command.split(' ')], { cwd: root, stdio: 'inherit', windowsHide: true })
    : process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${command}`], { cwd: root, stdio: 'inherit', windowsHide: true })
    : spawnSync('npm', [command], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!existsSync('node_modules')) runNpm('ci');
if (!existsSync('.env')) copyFileSync('.env.example', '.env');
const envFile = readFileSync('.env', 'utf8');
const port = Number(process.env.PORT || /^PORT=(\d+)/m.exec(envFile)?.[1] || 3210);
const url = `http://localhost:${port}`;
const ready = async () => { try { const r = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(1500) }); return r.ok && typeof (await r.json()).authenticated === 'boolean'; } catch { return false; } };
const openBrowser = () => { console.log(`\nPageMate: ${url}\nKeep this console open while studying. Press Ctrl+C to stop.\n`); if (!process.argv.includes('--no-browser') && process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }).unref(); };
if (await ready()) { openBrowser(); process.exit(0); }
if (!process.argv.includes('--skip-build') || !existsSync('dist/index.html')) runNpm('run build');
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production'], { cwd: root, stdio: 'inherit', windowsHide: true });
mkdirSync('data', { recursive: true }); writeFileSync('data/server.pid', String(child.pid));
let started = false;
for (let i = 0; i < 50; i++) { if (child.exitCode !== null) process.exit(child.exitCode || 1); if (await ready()) { started = true; break; } await new Promise(r => setTimeout(r, 300)); }
if (!started) { child.kill(); console.error('PageMate did not start. Review the error above.'); process.exit(1); }
openBrowser();
process.on('SIGINT', () => { child.kill(); process.exit(0); });
process.on('SIGTERM', () => { child.kill(); process.exit(0); });
child.on('exit', code => process.exit(code || 0));
