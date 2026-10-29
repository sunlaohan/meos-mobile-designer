import fs from 'node:fs';
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { passwordHash } from '../server/account-core.mjs';

if (!process.stdin.isTTY) throw new Error('请在交互终端中运行，避免通过命令参数暴露密码。');
process.stdout.write('设置管理员密码（输入不回显，至少 8 位）：');
process.stdin.setRawMode(true);
readline.emitKeypressEvents(process.stdin);
let value = '';
process.stdin.on('keypress', async (text, key) => {
  if (key.ctrl && key.name === 'c') { process.stdin.setRawMode(false); process.exit(1); }
  if (key.name === 'backspace') { value = value.slice(0, -1); return; }
  if (key.name !== 'return') { if (!key.ctrl && !key.meta && text) value += text; return; }
  process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
  if (value.length < 8) { console.error('密码至少需要 8 位。'); process.exitCode = 1; return; }
  let env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  const config = { DESIGNER_ADMIN_USERNAME: 'admin', DESIGNER_ADMIN_PASSWORD_HASH: passwordHash(value), DESIGNER_ADMIN_SESSION_SECRET: randomBytes(48).toString('hex') };
  for (const [name, setting] of Object.entries(config)) { env = env.replace(new RegExp(`^${name}=.*\n?`, 'm'), ''); env += `\n${name}=${setting}\n`; }
  fs.writeFileSync('.env.local', env, { mode: 0o600 }); fs.chmodSync('.env.local', 0o600);
  console.log('管理员密码哈希及会话签名密钥已更新。请重启服务，已有管理员会话将失效。');
});
