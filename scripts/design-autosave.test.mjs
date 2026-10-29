import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'compose-autosave-test-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { createDesignAutosave, DesignSaveError } = await server.ssrLoadModule('/src/utils/designAutosave.ts');
const { createDesignDraftStore, designContentKey } = await server.ssrLoadModule('/src/utils/designDrafts.ts');
await server.close(); await rm(cacheDir, { recursive: true, force: true });
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fakeClock() {
  let now = Date.parse('2026-10-28T00:00:00Z'), next = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(ms) {
      const end = now + ms;
      for (let limit = 0; limit < 1000; limit++) {
        const entry = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) { now = end; await drain(); return; }
        now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); await drain();
      }
      throw new Error('Timer loop');
    },
  };
}
function storage() {
  const values = new Map();
  return { values, blocked: false, get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem(key) { if (this.blocked) throw Error('Storage unavailable'); return values.get(key) ?? null; },
    setItem(key, value) { if (this.blocked) throw Error('Quota exceeded'); values.set(key, value); }, removeItem: key => values.delete(key) };
}
const doc = (title = '初始页面') => ({ version: 1, title, updatedAt: '2026-10-28T00:00:00Z', nodes: [{ id: 'cell', type: 'cell', props: { title } }] });
function setup(options = {}) {
  const clock = options.clock || fakeClock(), disk = options.disk || storage(), calls = [];
  let connected = options.online ?? true, latest;
  const manager = createDesignAutosave({ ownerId: options.owner || 'owner-a', pageId: options.page || 'page-a', writerId: options.writer || 'tab-a',
    initial: options.initial || doc(), enabled: options.enabled, clock, storage: () => disk, online: () => connected,
    save: (document, signal) => { calls.push({ document, signal }); return options.save ? options.save(document, signal) : Promise.resolve(`revision-${calls.length}`); },
    publish: state => { latest = state; },
  });
  return { manager, clock, disk, calls, state: () => latest, online(value) { connected = value; manager.connectivityChanged(); },
    drafts: () => createDesignDraftStore(() => disk, options.owner || 'owner-a', options.page || 'page-a').list() };
}

test('停止编辑 2 秒保存，变更立即备份本机，未修改时不写云端', async () => {
  const h = setup(); await h.clock.advance(60000); assert.equal(h.calls.length, 0);
  h.manager.update(doc('第一笔')); assert(h.state().localSaved); assert.equal(h.drafts()[0].document.title, '第一笔');
  await h.clock.advance(1900); h.manager.update(doc('最新一笔')); await h.clock.advance(1999); assert.equal(h.calls.length, 0);
  await h.clock.advance(1); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].document.title, '最新一笔');
  assert.equal(h.state().status, 'saved'); assert.equal(h.drafts().length, 0);
  await h.manager.flush(); assert.equal(h.calls.length, 1); h.manager.dispose();
});
test('连续编辑最多等待 30 秒，自动保存无并发请求', async () => {
  const h = setup(); h.manager.update(doc('0'));
  for (let i = 1; i <= 40; i++) { await h.clock.advance(1000); h.manager.update(doc(String(i))); }
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].document.title, '29');
  await h.clock.advance(2000); assert.equal(h.calls.at(-1).document.title, '40'); h.manager.dispose();
});
test('保存期间继续编辑，旧请求不能删除新草稿，新版本随后串行同步', async () => {
  let resolve; const h = setup({ save: () => new Promise(done => { resolve = done; }) });
  h.manager.update(doc('发送中')); const flight = h.manager.flush(); await drain();
  h.manager.update(doc('新修改')); const joined = h.manager.flush(); await drain(); assert.equal(h.calls.length, 1);
  resolve('rev-2'); assert.equal(await flight, false); assert.equal(await joined, false);
  assert.equal(h.drafts()[0].document.title, '新修改'); assert.equal(h.drafts()[0].baseRevision, 'rev-2');
  await h.clock.advance(2000); assert.equal(h.calls.length, 2); resolve('rev-3'); await drain();
  assert.equal(h.state().status, 'saved'); assert.equal(h.drafts().length, 0); h.manager.dispose();
});
test('保存中撤销回旧内容也保留草稿，避免迟到写入丢失撤销', async () => {
  let resolve; const h = setup({ save: () => new Promise(done => { resolve = done; }) });
  h.manager.update(doc('B')); const flight = h.manager.flush(); await drain(); h.manager.update(doc());
  assert(h.state().localSaved); assert.equal(h.drafts()[0].document.title, '初始页面');
  resolve('rev-B'); assert.equal(await flight, false); assert(h.state().dirty); h.manager.dispose();
  const reopened = setup({ disk: h.disk, writer: 'next-tab', initial: { ...doc('B'), updatedAt: 'rev-B' } });
  assert.equal(reopened.state().status, 'recovery'); reopened.manager.restore('tab-a');
  assert.equal(reopened.manager.getDocument().title, '初始页面'); reopened.manager.dispose();
});
test('离线不发请求，本机保留最新内容，重新联网立即同步', async () => {
  const h = setup({ online: false }); h.manager.update(doc('离线 A')); await h.clock.advance(60000); h.manager.update(doc('离线 B'));
  assert.equal(h.state().status, 'offline'); assert(h.state().localSaved); assert.equal(h.calls.length, 0);
  h.online(true); await drain(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].document.title, '离线 B');
  assert.equal(h.state().status, 'saved'); assert.equal(h.drafts().length, 0); h.manager.dispose();
});
test('浏览器显示在线但网络失败时退避重试，保留最新修改', async () => {
  let fail = true; const h = setup({ save: () => fail ? Promise.reject(new DesignSaveError('network', 'network unavailable')) : Promise.resolve('rev-ok') });
  h.manager.update(doc('失败')); await h.clock.advance(2000); assert.equal(h.state().status, 'error'); assert(h.state().localSaved);
  h.manager.update(doc('最新内容')); await h.clock.advance(4999); assert.equal(h.calls.length, 1); await h.clock.advance(1); assert.equal(h.calls.length, 2);
  fail = false; await h.clock.advance(10000); assert.equal(h.calls.length, 3); assert.equal(h.calls.at(-1).document.title, '最新内容');
  assert.equal(h.state().status, 'saved'); h.manager.dispose();
});
test('自动重试不伪造草稿编辑时间，恢复列表仍按真实编辑顺序排列', async () => {
  const h = setup({ save: () => Promise.reject(new DesignSaveError('network', 'unavailable')) });
  h.manager.update(doc('实际编辑')); const editedAt = h.drafts()[0].modifiedAt;
  await h.clock.advance(40000); assert.equal(h.drafts()[0].modifiedAt, editedAt); h.manager.dispose();
});
test('20 秒超时释放保存状态并保留草稿，卸载中断请求及所有重试', async () => {
  const h = setup({ save: () => new Promise(() => {}) }); h.manager.update(doc('超时内容'));
  const pending = h.manager.flush(); await drain(); await h.clock.advance(20000); assert.equal(await pending, false);
  assert(h.calls[0].signal.aborted); assert(!h.state().saving); assert(h.state().localSaved);
  await h.clock.advance(5000); assert.equal(h.calls.length, 2); h.manager.dispose(); await drain(); assert(h.calls[1].signal.aborted);
  await h.clock.advance(600000); assert.equal(h.calls.length, 2); assert.equal(h.drafts()[0].document.title, '超时内容');
});
test('冲突暂停自动保存，查看并关闭草稿不能解除冲突或覆盖云端', async () => {
  const h = setup({ save: () => Promise.reject(new DesignSaveError('conflict', 'other window updated')) });
  h.manager.update(doc('本机版本')); await h.clock.advance(2000); assert.equal(h.state().status, 'conflict');
  h.manager.reviewDrafts(); h.manager.keepCurrent(); assert.equal(h.state().status, 'conflict');
  h.manager.update(doc('冲突后继续编辑')); h.online(true); await h.clock.advance(600000); assert.equal(h.calls.length, 1);
  assert.equal(await h.manager.retry(), false); assert.equal(h.drafts()[0].document.title, '冲突后继续编辑'); h.manager.dispose();
});
test('恢复旧基线草稿不覆盖新云端，刷新后也不误认为可自动覆盖', async () => {
  const h = setup({ online: false }); h.manager.update(doc('离线旧基线')); h.manager.dispose();
  const cloud = { ...doc('其他窗口新版本'), updatedAt: 'rev-other' };
  const next = setup({ disk: h.disk, writer: 'tab-b', initial: cloud }); assert.equal(next.state().status, 'recovery');
  next.manager.restore('tab-a'); assert.equal(next.state().status, 'conflict'); next.manager.update(doc('本机接着改'));
  assert.equal(next.drafts().find(draft => draft.writerId === 'tab-b').baseRevision, doc().updatedAt); next.manager.dispose();
  const third = setup({ disk: h.disk, writer: 'tab-c', initial: cloud }); third.manager.restore('tab-b');
  assert.equal(third.state().status, 'conflict'); await third.clock.advance(60000); assert.equal(third.calls.length, 0); third.manager.dispose();
});
test('同基线草稿恢复后自动保存，选择当前版本不会删除其他窗口草稿', async () => {
  const disk = storage(), one = setup({ disk, writer: 'one', online: false }); one.manager.update(doc('one')); one.manager.dispose();
  const two = setup({ disk, writer: 'two', online: false }); two.manager.keepCurrent(); two.manager.update(doc('two')); two.manager.dispose();
  const h = setup({ disk, writer: 'three' }); assert.equal(h.state().drafts.length, 2); h.manager.keepCurrent(); assert.equal(h.drafts().length, 2);
  h.manager.reviewDrafts(); assert.equal(h.manager.restore('one').title, 'one'); await h.clock.advance(2000);
  assert.equal(h.state().status, 'saved'); assert.deepEqual(h.drafts().map(draft => draft.writerId), ['two']); h.manager.dispose();
});
test('账号、页面及窗口草稿独立，无效数据忽略，迟到删除不删除新内容', () => {
  const disk = storage(), a = setup({ disk, online: false }), b = setup({ disk, owner: 'owner-b', online: false }), c = setup({ disk, page: 'page-b', online: false });
  a.manager.update(doc('a')); b.manager.update(doc('b')); c.manager.update(doc('c')); assert.deepEqual(a.drafts().map(draft => draft.document.title), ['a']);
  const store = createDesignDraftStore(() => disk, 'owner-a', 'page-a'), old = store.list()[0];
  a.manager.update(doc('newer')); store.remove(old); assert.equal(a.drafts()[0].document.title, 'newer');
  disk.setItem(`${store.prefix}invalid`, '{'); assert.equal(store.list().length, 1); a.manager.dispose(); b.manager.dispose(); c.manager.dispose();
});
test('存储被禁用或超额时不谎报已存本机，仍能联网保存云端', async () => {
  const disk = storage(); disk.blocked = true; const h = setup({ disk }); h.manager.update(doc('没有本机保护'));
  assert(!h.state().localSaved); assert(h.state().localError); await h.clock.advance(2000);
  assert.equal(h.state().status, 'saved'); assert.equal(h.calls.length, 1); h.manager.dispose();
});
test('无效标题暂不上传但保留草稿，补全后恢复自动保存', async () => {
  const h = setup(); h.manager.update(doc('')); await h.clock.advance(2000);
  assert.equal(h.calls.length, 0); assert(h.state().localSaved); assert.equal(h.state().status, 'error');
  h.manager.update(doc('完整标题')); await h.clock.advance(2000); assert.equal(h.state().status, 'saved'); h.manager.dispose();
});
test('预览和临时 URL 设计不读写本机草稿，也不上传到真实页面', async () => {
  const h = setup({ enabled: false }); h.manager.update(doc('不可持久化')); h.online(true); await h.clock.advance(60000);
  assert.equal(await h.manager.flush(), false); assert.equal(h.calls.length, 0); assert.equal(h.disk.length, 0); h.manager.dispose();
});
test('恢复不同草稿前备份当前修改，备份失败则拒绝恢复', () => {
  const disk = storage(), old = setup({ disk, writer: 'old', online: false }); old.manager.update(doc('待恢复')); old.manager.dispose();
  const h = setup({ disk, online: false }); h.manager.keepCurrent(); h.manager.update(doc('当前未同步')); h.manager.reviewDrafts();
  disk.blocked = true; assert.equal(h.manager.restore('old'), undefined); assert.equal(h.manager.getDocument().title, '当前未同步');
  disk.blocked = false; assert.equal(h.manager.restore('old').title, '待恢复'); assert(h.drafts().some(draft => draft.document.title === '当前未同步')); h.manager.dispose();
});
test('JSON 键顺序、保存时间及标题首尾空格不造成重复上传和假冲突', () => {
  const a = doc(), b = { ...a, updatedAt: 'changed', title: ` ${a.title} `, nodes: [{ props: { title: a.title }, type: 'cell', id: 'cell' }] };
  assert.equal(designContentKey(a), designContentKey(b)); const h = setup(); h.manager.update(b);
  assert(!h.state().dirty); assert.equal(h.disk.length, 0); h.manager.dispose();
});
test('成功另存副本只清理已提交的草稿，失败或不同快照不能清理', () => {
  const h = setup({ online: false }); h.manager.update(doc('副本')); assert.equal(h.manager.finishCopy(doc('不是这个版本')), false);
  assert.equal(h.drafts().length, 1); assert.equal(h.manager.finishCopy(h.manager.getDocument()), true); assert.equal(h.drafts().length, 0);
});
test('默认定时器保留浏览器全局接收者，避免 Illegal invocation', () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const disk = storage();
  try {
    globalThis.setTimeout = function () { assert.equal(this, globalThis); return 1; };
    globalThis.clearTimeout = function () { assert.equal(this, globalThis); };
    const manager = createDesignAutosave({ ownerId: 'timer-owner', pageId: 'timer-page', writerId: 'timer-writer', initial: doc(), storage: () => disk, online: () => true, save: async () => 'rev', publish() {} });
    manager.update(doc('timer')); manager.dispose();
  } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});
test('编辑器接入生命周期保护、账号隔离及云端版本条件', async () => {
  const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8'), account = await readFile(new URL('../src/AccountApp.vue', import.meta.url), 'utf8');
  const client = await readFile(new URL('../src/utils/accountClient.ts', import.meta.url), 'utf8');
  for (const event of ['online', 'offline', 'visibilitychange', 'pagehide', 'beforeunload', 'storage']) assert(app.includes(`addEventListener('${event}'`));
  assert.match(app, /autosave\.dispose\(\)/); assert.match(account, /:owner-id="session\.user\.id"/);
  assert.match(client, /eq\('updated_at', page.updated_at\)/); assert.match(client, /designContentKey\(\{ \.\.\.latest.document, title: latest.title \}\)/);
  assert.match(account, /createPage\(title, \{ \.\.\.document, title \}, controller.signal\)/);
});
