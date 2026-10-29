import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { ref } from 'vue';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let createNotificationCenter, useAsyncAction;
try {
  ({ createNotificationCenter } = await server.ssrLoadModule('/src/utils/notifications.ts'));
  ({ useAsyncAction } = await server.ssrLoadModule('/src/utils/useAsyncAction.ts'));
} finally { await server.close(); }

function clock() {
  let time = 0, sequence = 0;
  const timers = new Map();
  return {
    setTimeout(callback, duration) { const id = ++sequence; timers.set(id, { callback, at: time + duration }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(duration) { time += duration; for (const [id, task] of [...timers]) if (task.at <= time) { timers.delete(id); task.callback(); } },
    get pending() { return timers.size; },
  };
}

test('请求进行中只有对应按钮处于加载状态，重复提交不会执行', async () => {
  const errors = [], operation = useAsyncAction(error => errors.push(error));
  let finish, count = 0;
  const pending = operation.run('reset', () => { count++; return new Promise(resolve => { finish = resolve; }); });
  assert.equal(operation.busy.value, true); assert.equal(operation.pending.value, 'reset');
  await operation.run('reset', async () => { count++; });
  await operation.run('logout', async () => { count++; });
  assert.equal(count, 1); assert.equal(operation.pending.value, 'reset');
  finish(); await pending;
  assert.equal(operation.busy.value, false); assert.equal(operation.pending.value, ''); assert.deepEqual(errors, []);
});
test('请求失败恢复按钮，保留错误，并允许下一次操作', async () => {
  const errors = [], failure = new Error('rate limit'), operation = useAsyncAction(error => errors.push(error));
  await operation.run('reset', async () => { throw failure; });
  assert.deepEqual(errors, [failure]); assert.equal(operation.busy.value, false);
  let retried = false;
  await operation.run('reset', async () => { retried = true; }); assert.equal(retried, true);
});
test('页面仍在加载时阻止操作，加载完成后可以提交', async () => {
  const loading = ref(true); let calls = 0;
  const operation = useAsyncAction(() => {}, () => loading.value);
  await operation.run('create', async () => { calls++; }); assert.equal(calls, 0);
  loading.value = false; await operation.run('create', async () => { calls++; }); assert.equal(calls, 1);
});
test('顶部成功与错误提示分别停留，并可手动关闭', () => {
  const timer = clock(); let messages = [];
  const center = createNotificationCenter(value => { messages = value; }, timer);
  center.notify('Saved'); const error = center.notify('Try later', 'error');
  timer.advance(5000); assert.deepEqual(messages.map(item => item.message), ['Try later']);
  center.dismiss(error); assert.deepEqual(messages, []); assert.equal(timer.pending, 0);
});
test('重复提示不会堆叠，最多显示三条，清理时没有遗留定时器', () => {
  const timer = clock(); let messages = [];
  const center = createNotificationCenter(value => { messages = value; }, timer);
  center.notify('Repeated', 'error'); center.notify('Repeated', 'error'); assert.equal(messages.length, 1); assert.equal(timer.pending, 1);
  for (const text of ['Second', 'Third', 'Fourth']) center.notify(text);
  assert.deepEqual(messages.map(item => item.message), ['Second', 'Third', 'Fourth']); assert.equal(timer.pending, 3);
  center.clear(); assert.deepEqual(messages, []); assert.equal(timer.pending, 0);
});
test('阅读或键盘聚焦时暂停提示消失，离开后恢复', () => {
  const timer = clock(); let messages = [];
  const center = createNotificationCenter(value => { messages = value; }, timer);
  const id = center.notify('Try again', 'error'); timer.advance(7000); center.pause(id);
  timer.advance(10000); assert.equal(messages.length, 1);
  center.resume(id); timer.advance(8000); assert.equal(messages.length, 0);
});
test('警告保留阅读时间，普通信息自动消失，不替换用户消息原文', () => {
  const timer = clock(); let messages = [];
  const center = createNotificationCenter(value => { messages = value; }, timer);
  const text = '用户原始名称 · {0}';
  center.notify(text, 'warning'); center.notify('Information', 'info');
  timer.advance(5000); assert.equal(messages.length, 1); assert.equal(messages[0].message, text);
  timer.advance(3000); assert.equal(messages.length, 0);
});
test('一次提交的多个无效字段合并为一条全局提示，并聚焦第一个字段', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  let useFormValidation;
  try { ({ useFormValidation } = await server.ssrLoadModule('/src/utils/useFormValidation.ts')); }
  finally { await server.close(); }
  const messages = [], form = {}, labels = [{ childNodes: [{ nodeType: 3, textContent: '邮箱' }] }];
  let focused = 0, prevented = 0;
  const { onInvalid } = useFormValidation(message => messages.push(message));
  const field = { form, labels, validity: { valueMissing: true }, focus: () => focused++ };
  const event = { target: field, preventDefault: () => prevented++ };
  onInvalid(event); onInvalid(event);
  assert.deepEqual(messages, ['请填写邮箱。']); assert.equal(focused, 1); assert.equal(prevented, 2);
  await Promise.resolve(); field.validity = { typeMismatch: true }; field.type = 'email';
  onInvalid(event); assert.deepEqual(messages, ['请填写邮箱。', '请输入有效的邮箱地址。']);
});
