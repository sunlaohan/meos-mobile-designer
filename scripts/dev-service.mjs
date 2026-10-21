import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const action = process.argv[2] || 'status';
if (process.platform !== 'darwin' || !['start', 'restart', 'stop', 'status'].includes(action)) {
  console.error('用法（macOS）：node scripts/dev-service.mjs start|restart|stop|status');
  process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const label = 'com.sunlei.meos-mobile-designer.dev';
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${label}`;
const plist = path.join(homedir(), 'Library/LaunchAgents', `${label}.plist`);
const logDirectory = path.join(homedir(), 'Library/Logs/meos-mobile-designer');
const url = 'http://localhost:4173/';
const launchctl = (...args) => spawnSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 10_000 });
const status = () => launchctl('print', target);
const xml = (value) => String(value).replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);

function check(result) {
  if (result.status !== 0) throw result.error || new Error(result.stderr.trim() || 'launchctl 执行失败');
}

async function unload() {
  if (status().status !== 0) return;
  check(launchctl('bootout', target));
  // bootout can return while launchd is still tearing down the old job.
  const deadline = Date.now() + 10_000;
  while (status().status === 0) {
    if (Date.now() >= deadline) throw new Error('旧服务尚未卸载完成，请稍后重试。');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function ready() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      const body = await response.text();
      if (response.ok && body.includes('/@vite/client')) return;
    } catch { /* Wait for launchd and Vite to finish starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`服务未在 30 秒内就绪，请检查 ${logDirectory}`);
}

try {
  if (action === 'stop') {
    await unload();
    await rm(plist, { force: true });
    console.log('服务已停止，并取消登录时自动启动。');
  } else if (action === 'status') {
    const result = status();
    if (result.status !== 0) throw new Error('服务尚未启动，运行 pnpm service:start。');
    console.log(result.stdout.split('\n').filter((line) => /^\s*(state|pid|runs|last exit code|last terminating signal) =/.test(line)).join('\n'));
    await ready();
    console.log(`页面可访问：${url}\n日志：${logDirectory}`);
  } else {
    if (action === 'restart') await unload();
    if (status().status !== 0) {
      await mkdir(path.dirname(plist), { recursive: true });
      await mkdir(logDirectory, { recursive: true });
      const args = [process.execPath, path.join(root, 'node_modules/vite/bin/vite.js'), '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '4173', '--strictPort'];
      await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(`${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(path.join(logDirectory, 'stdout.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDirectory, 'stderr.log'))}</string>
</dict></plist>
`, { mode: 0o600 });
      check(launchctl('bootstrap', domain, plist));
    }
    await ready();
    console.log(`服务已就绪：${url}\n由 launchd 常驻管理，退出后自动重启，登录时自动启动。\n日志：${logDirectory}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
