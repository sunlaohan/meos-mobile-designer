import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createAiService, normalizeModels, parseModelJson, selectDefaultModel, selectRecommendedModels, validatePage } from '../server/ai-core.mjs';

const catalog = JSON.parse(await fs.readFile(new URL('../server/component-catalog.json', import.meta.url), 'utf8'));
const node = (id, type, props = {}, extra = {}) => ({ id, type, props, ...extra });
const page = (...nodes) => ({ title: '设备详情', nodes });

test('网关模型去重并排除非对话类型，默认选择 Gemini，优先保留服务端配置', () => {
  const models = normalizeModels({ data: [{ id: 'deepseek-v4-flash' }, { id: 'gemini-3.8-flash' }, { id: 'gemini-3.7-flash' }, { id: 'gemini-3.8-flash' }, { id: 'kinfra-text-embedding-4b' }] });
  assert.equal(models.length, 3);
  assert.equal(selectDefaultModel(models, ''), 'gemini-3.8-flash');
  assert.equal(selectDefaultModel(models, 'gemini-3.7-flash'), 'gemini-3.7-flash');
  assert.equal(models[1].family, 'Gemini');
});

test('每个厂家只留一个精选型号，排除翻译、同厂重复版本和高价旗舰，保留 Gemini 默认', () => {
  const ids = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview', 'deepseek-v4-flash', 'deepseek-v4.1-flash', 'deepseek-v4-pro', 'qwen3.5-flash', 'qwen3.8-max', 'gpt-5.6-luna', 'gpt-5.6-sol', 'claude-sonnet-4-6', 'claude-opus-5', 'glm-5-turbo', 'glm-5.3', 'kimi-k2.6', 'kimi-k3', 'hy3', 'hy-mt2-lite', 'minimax-m3', 'minimax-m2.7', 'mimo-v2.5-pro'];
  const models = selectRecommendedModels(normalizeModels({ data: ids.map((id) => ({ id })) }));
  assert.equal(models.length, 10);
  assert.equal(new Set(models.map((model) => model.family)).size, 10);
  assert.ok(models.every((model) => model.label.includes(' · ')));
  assert.equal(selectDefaultModel(models, 'gemini-3.7-flash'), 'gemini-3.8-flash');
  assert.ok(models.some((model) => model.id === 'deepseek-v4-flash'));
  assert.ok(models.some((model) => model.id === 'minimax-m2.7'));
  assert.ok(!models.some((model) => /^(?:claude-opus|qwen.*-max|hy-mt|gpt.*-sol|deepseek-v4-pro)/.test(model.id)));
  const fallback = selectRecommendedModels(normalizeModels({ data: [{ id: 'gemini-3.7-flash' }, { id: 'unreviewed-new-model' }] }));
  assert.deepEqual(fallback.map((model) => model.id), ['gemini-3.7-flash']);
});

test('解析 fenced JSON，但拒绝截断或夹杂代码的模型响应', () => {
  assert.deepEqual(parseModelJson('```json\n{"nodes":[]}\n```'), { nodes: [] });
  assert.throws(() => parseModelJson('这里是页面 {"nodes":[]}'), /完整 JSON/);
  assert.throws(() => parseModelJson(null), /没有返回文本/);
});

test('校验真实公开属性、类型、选项，拒绝自绘或不存在的组件和属性', () => {
  assert.ok(validatePage(page(node('a', 'nav-bar', { title: '设备详情', leftArrow: true })), catalog).nodes.length);
  for (const invalid of [node('a', 'config-provider'), node('a', 'custom-html'), node('a', 'button', { fabricated: true }), node('a', 'nav-bar', { leftArrow: 'true' }), node('a', 'button', { type: 'invented' }), node('a', 'button', { style: 'color:red' })]) assert.throws(() => validatePage(page(invalid), catalog));
  assert.throws(() => validatePage(page(node('a', 'button', {}, { children: [node('b', 'tag')] })), catalog), /子组件插槽/);
});

test('拒绝 HTML、脚本 URL、原型污染和重复 ID', () => {
  for (const value of ['<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'data:text/html,test']) assert.throws(() => validatePage(page(node('a', 'button', { text: value })), catalog), /HTML|脚本/);
  assert.throws(() => validatePage(JSON.parse('{"title":"x","nodes":[],"__proto__":{}}'), catalog), /不安全/);
  assert.throws(() => validatePage(page(node('a', 'tag'), node('a', 'tag')), catalog), /重复/);
});

test('重新分配节点 ID，并重连合法面板入口；面板初始隐藏', () => {
  const result = validatePage(page(node('trigger', 'cell', { title: '编辑', rightIcon: 'arrow' }, { actions: { click: { type: 'open-panel', targetId: 'panel' } } }), node('panel', 'form-panel', { title: '编辑设备', show: true }, { children: [node('form', 'form', {}, { children: [node('field', 'field', { label: '名称', type: 'textarea', rows: 1 })] })] })), catalog);
  assert.notEqual(result.nodes[0].id, 'trigger');
  assert.equal(result.nodes[0].actions.click.targetId, result.nodes[1].id);
  assert.equal(result.nodes[1].props.show, false);
  assert.throws(() => validatePage(page(node('a', 'cell', {}, { actions: { click: { type: 'open-panel', targetId: 'missing' } } })), catalog), /目标无效/);
});

test('AI 关联校验使用与编辑器相同的全量控件清单，楼层选择等行内控件不会被当作弹层', async () => {
  const { canvasPanelTypes } = await import('../shared/association-controls.mjs');
  for (const type of canvasPanelTypes) {
    const result = validatePage(page(node('trigger', 'cell', {}, { actions: { click: { type: 'open-panel', targetId: 'target' } } }), node('target', type)), catalog);
    assert.equal(result.nodes[1].props.show, false, type);
    assert.equal(result.nodes[0].actions.click.targetId, result.nodes[1].id, type);
  }
  assert.throws(() => validatePage(page(node('trigger', 'cell', {}, { actions: { click: { type: 'open-panel', targetId: 'inline' } } }), node('inline', 'floor-select')), catalog), /目标无效/);
});

function fakeService(responses) {
  const calls = [];
  const documents = [];
  const service = createAiService({
    baseUrl: 'https://gateway.example/v1', apiKey: 'private-test-key', preferredModel: 'gemini-3.8-flash', catalog,
    loadSkill: async () => 'Real installed Skill text', loadComponentDocs: async (types) => { documents.push(types); return 'Actual selected component README and demo'; },
    fetchImpl: async (url, options) => { calls.push({ url, options }); const response = responses.shift(); return new Response(JSON.stringify(response.body), { status: response.status || 200 }); },
  });
  return { service, calls, documents };
}
const modelList = { body: { data: [{ id: 'gemini-3.8-flash' }] } };
const completion = (body) => ({ body: { model: 'gemini-3.8-flash', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }], usage: { total_tokens: 25 } } });

test('AI 接受编辑器全部真实入口事件，拒绝组件不支持的事件与打开父面板', async () => {
  const { triggerEventOptions } = await import('../shared/association-controls.mjs');
  for (const [type, events] of Object.entries(triggerEventOptions)) for (const { value: event } of events) {
    const result = validatePage(page(node('source', type, {}, { actions: { [event]: { type: 'open-panel', targetId: 'panel' } } }), node('panel', 'content-panel')), catalog);
    assert.equal(result.nodes[0].actions[event].targetId, result.nodes[1].id, `${type}.${event}`);
  }
  for (const [type, event] of [['button', 'confirm'], ['bottom-action-bar', 'click'], ['nav-bar', 'click'], ['background', 'click']]) {
    assert.throws(() => validatePage(page(node('source', type, {}, { actions: { [event]: { type: 'open-panel', targetId: 'panel' } } }), node('panel', 'content-panel')), catalog), /事件或目标无效/);
  }
  assert.throws(() => validatePage(page(node('panel', 'form-panel', {}, { children: [node('child', 'button', {}, { actions: { click: { type: 'open-panel', targetId: 'panel' } } })] })), catalog), /父面板/);
});

test('无入口面板及封闭的面板循环被拒绝；从页面逐级打开的嵌套交互有效', () => {
  assert.throws(() => validatePage(page(node('panel', 'radio-panel')), catalog), /没有可从页面触发/);
  const panels = [
    node('a', 'form-panel', {}, { children: [node('open-b', 'button', {}, { actions: { click: { type: 'open-panel', targetId: 'b' } } })] }),
    node('b', 'form-panel', {}, { children: [node('open-a', 'button', {}, { actions: { click: { type: 'open-panel', targetId: 'a' } } })] }),
  ];
  assert.throws(() => validatePage(page(...panels), catalog), /没有可从页面触发/);
  const result = validatePage(page(node('entry', 'cell', {}, { actions: { click: { type: 'open-panel', targetId: 'a' } } }), ...panels), catalog);
  assert.equal(result.nodes[1].children[0].actions.click.targetId, result.nodes[2].id);
  assert.equal(result.nodes[2].children[0].actions.click.targetId, result.nodes[1].id);
  assert.equal(result.nodes[1].props.show, false);
});

const interactionPlan = {
  recipeId: 'form', title: '创建报事工单',
  elements: [
    { id: 'nav', element: '导航栏', component: 'nav-bar' },
    { id: 'category', element: '报事分类入口', component: 'cell' },
    { id: 'category-panel', element: '报事分类选择', component: 'radio-panel' },
    { id: 'priority', element: '优先级入口', component: 'cell' },
    { id: 'priority-panel', element: '优先级选择', component: 'radio-panel' },
  ],
  interactions: [
    { sourceId: 'category', event: 'click', targetId: 'category-panel' },
    { sourceId: 'priority', event: 'click', targetId: 'priority-panel' },
  ],
};
const interactivePage = () => page(
  node('nav', 'nav-bar'),
  node('category', 'cell', { title: '报事分类' }),
  node('category-panel', 'radio-panel', { title: '选择分类', show: true }),
  node('priority', 'cell', { title: '优先级' }),
  node('priority-panel', 'radio-panel', { title: '选择优先级', show: true }),
);

test('生成节点漏写 actions 时按规划自动绑定，同类字段和面板精确区分，报告保存真实关系', async () => {
  const { service, calls } = fakeService([modelList, completion(interactionPlan), completion(interactivePage())]);
  const result = await service.generate({ prompt: '报事分类和优先级分别打开各自选择面板' });
  assert.equal(calls.length, 3, '自动绑定不需要额外模型调用');
  assert.equal(result.nodes[1].actions.click.targetId, result.nodes[2].id);
  assert.equal(result.nodes[3].actions.click.targetId, result.nodes[4].id);
  assert.notEqual(result.nodes[2].id, result.nodes[4].id);
  assert.equal(result.nodes[2].props.show, false);
  assert.equal(result.report.interactions.length, 2);
  assert.deepEqual(result.report.interactions[0], { sourceId: result.nodes[1].id, source: '报事分类', event: 'click', targetId: result.nodes[2].id, target: '选择分类' });
  assert.match(result.summary, /2 条交互/);
  const planningPrompt = JSON.parse(calls[1].options.body).messages[0].content;
  assert.match(planningPrompt, /triggerEvents/);
  assert.match(planningPrompt, /click-action/);
  assert.match(planningPrompt, /sourceId/);
});

test('规划使用错误事件或同一入口重复绑定时明确拒绝，不产生静默无效配置', async () => {
  for (const interactions of [
    [{ sourceId: 'category', event: 'confirm', targetId: 'category-panel' }],
    [...interactionPlan.interactions, { sourceId: 'category', event: 'click', targetId: 'priority-panel' }],
  ]) {
    const { service, calls } = fakeService([modelList, completion({ ...interactionPlan, interactions })]);
    await assert.rejects(service.generate({ prompt: '分类选择' }), /交互规划.*无效/);
    assert.equal(calls.length, 2);
  }
});

test('遗漏规划面板时自动修正一次并补齐绑定，不能删除面板绕过校验', async () => {
  const missing = interactivePage();
  missing.nodes = missing.nodes.filter((item) => item.id !== 'category-panel');
  const { service, calls } = fakeService([modelList, completion(interactionPlan), completion(missing), completion(interactivePage())]);
  const result = await service.generate({ prompt: '分类和优先级选择' });
  assert.equal(calls.length, 4);
  assert.equal(result.nodes[1].actions.click.targetId, result.nodes[2].id);
  const retry = JSON.parse(calls[3].options.body).messages;
  assert.match(retry.at(-1).content, /category-panel/);
  assert.match(retry.at(-1).content, /不能删除/);
  const failed = fakeService([modelList, completion(interactionPlan), completion(missing), completion(missing)]);
  await assert.rejects(failed.service.generate({ prompt: '分类和优先级选择' }), /仍不完整.*未写入画板/);
  assert.equal(failed.calls.length, 4, '修正次数有明确上限');
});

test('规划未列明绑定但生成了孤立面板时，要求模型补上真实入口；不能把待接入说明当作绑定', async () => {
  const planned = { recipeId: 'detail', title: '设备详情', elements: [{ component: 'nav-bar' }, { component: 'button' }, { component: 'content-panel' }] };
  const unbound = page(node('nav', 'nav-bar'), node('open', 'button', { text: '查看说明' }), node('panel', 'content-panel', { title: '设备说明' }));
  unbound.warnings = ['说明按钮交互待接入'];
  const bound = structuredClone(unbound);
  bound.nodes[1].actions = { click: { type: 'open-panel', targetId: 'panel' } };
  const { service, calls } = fakeService([modelList, completion(planned), completion(unbound), completion(bound)]);
  const result = await service.generate({ prompt: '点击按钮显示设备说明' });
  assert.equal(result.nodes[1].actions.click.targetId, result.nodes[2].id);
  assert.equal(calls.length, 4);
  const deleted = fakeService([modelList, completion(planned), completion(unbound), completion(page(node('nav', 'nav-bar'), node('open', 'button')))]);
  await assert.rejects(deleted.service.generate({ prompt: '点击按钮显示设备说明' }), /仍不完整.*未写入画板/);
});

test('真实两阶段工作流按选择的模型请求，并加载选中组件文档，密钥只在服务端请求头', async () => {
  const { service, calls, documents } = fakeService([modelList, completion({ recipeId: 'detail', title: '设备详情', elements: [{ element: '导航', component: 'nav-bar', variant: '基础用法' }], warnings: [] }), completion(page(node('nav', 'nav-bar', { title: '设备详情' })))]);
  const result = await service.generate({ prompt: '设备详情页', model: 'gemini-3.8-flash' });
  assert.equal(result.report.generation.actualModel, 'gemini-3.8-flash');
  assert.deepEqual(documents, [['nav-bar']]);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer private-test-key'));
  assert.ok(calls.slice(1).every((call) => JSON.parse(call.options.body).model === 'gemini-3.8-flash'));
  assert.ok(!JSON.stringify(result).includes('private-test-key'));
  assert.ok(JSON.parse(calls[2].options.body).messages[0].content.includes('Actual selected component README'));
  await service.models();
  assert.equal(calls.length, 3, 'Model list should be cached');
});

test('上游权限/限流错误如实显示并脱敏，不静默切换模型或离线结果', async () => {
  const { service, calls } = fakeService([modelList, { status: 403, body: { error: 'bad private-test-key' } }]);
  await assert.rejects(service.generate({ prompt: '设备详情', model: 'gemini-3.8-flash' }), (error) => error.status === 403 && error.message.includes('没有此模型') && !error.message.includes('private-test-key'));
  assert.equal(calls.length, 2);
});

test('仅根据描述生成标题、类型和状态，导航与页面标题一致，忽略旧手填配置', async () => {
  const planned = { recipeId: 'detail', state: 'empty', title: '设备档案', elements: [{ element: '导航', component: 'nav-bar', variant: '基础用法' }] };
  const { service, calls } = fakeService([modelList, completion(planned), completion({ title: '错误的页面标题', nodes: [node('nav', 'nav-bar', { title: '旧导航标题' })] })]);
  const result = await service.generate({ prompt: '做一个设备档案页，展示暂无数据', title: '旧手填标题', recipeId: 'form', state: 'disabled' });
  assert.equal(result.title, '设备档案');
  assert.equal(result.nodes[0].props.title, result.title);
  assert.equal(result.report.recipeId, 'detail');
  assert.equal(result.report.state, 'empty');
  const sent = JSON.parse(JSON.parse(calls[1].options.body).messages[1].content);
  assert.deepEqual(sent, { prompt: '做一个设备档案页，展示暂无数据' });
});

test('图片与代码附件进入两阶段上下文，仅附件也可生成；结果仅保留附件元信息', async () => {
  const content = '<template><h1>参考设备档案</h1></template>';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg1kAAAAASUVORK5CYII=';
  const attachments = [
    { id: 'image', name: 'reference.png', kind: 'image', mimeType: 'image/png', size: Buffer.from(png.split(',')[1], 'base64').length, content: png },
    { id: 'code', name: 'page.vue', kind: 'code', mimeType: 'text/plain', size: Buffer.byteLength(content), content },
  ];
  const { service, calls } = fakeService([modelList, completion({ recipeId: 'detail', title: '设备档案', elements: [{ element: '导航', component: 'nav-bar', variant: '基础用法' }] }), completion(page(node('nav', 'nav-bar')))]);
  const result = await service.generate({ prompt: '', attachments });
  for (const call of calls.slice(1)) {
    const user = JSON.parse(call.options.body).messages[1].content;
    assert.equal(user[1].image_url.url, png);
    assert.ok(user[0].text.includes('codeAttachments'));
    assert.ok(user[0].text.includes('参考设备档案'));
  }
  assert.equal(result.report.attachments.length, 2);
  assert.ok(!JSON.stringify(result).includes(png));
  assert.ok(!JSON.stringify(result).includes(content));
});

test('不支持图片的模型明确拒绝，文件校验失败不向网关发送内容', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg1kAAAAASUVORK5CYII=';
  const attachment = { id: 'image', name: 'reference.png', kind: 'image', mimeType: 'image/png', size: Buffer.from(png.split(',')[1], 'base64').length, content: png };
  const { service, calls } = fakeService([{ body: { data: [{ id: 'glm-5-turbo' }] } }]);
  await assert.rejects(service.generate({ prompt: '参考图片', model: 'glm-5-turbo', attachments: [attachment] }), /暂未接入图片/);
  assert.equal(calls.length, 1);
  await assert.rejects(service.generate({ prompt: '参考图片', attachments: [{ ...attachment, size: -1 }] }), /大小校验/);
  assert.equal(calls.length, 1);
});

test('拒绝不存在的模型、空需求及输出被截断，避免将不完整结果送入画布', async () => {
  const { service, calls } = fakeService([modelList]);
  await assert.rejects(service.generate({ prompt: '' }), /页面需求/);
  await assert.rejects(service.generate({ prompt: '设备详情', model: 'unknown' }), /刷新模型/);
  assert.equal(calls.length, 1);
  const short = fakeService([modelList, { body: { choices: [{ finish_reason: 'length', message: { content: '{' } }] } }]);
  await assert.rejects(short.service.generate({ prompt: '设备详情' }), /长度限制/);
});

test('取消生成会向上游传递中止信号，失败后不产生页面结果', async () => {
  const controller = new AbortController();
  const { service, calls } = fakeService([modelList]);
  await service.models();
  // A separate service simulates fetch cancellation after model discovery.
  const cancellable = createAiService({ baseUrl: 'https://gateway.example/v1', apiKey: 'test', catalog, loadSkill: async () => '', loadComponentDocs: async () => '', fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(modelList.body));
    assert.ok(options.signal);
    controller.abort();
    throw new DOMException('Cancelled', 'AbortError');
  } });
  await assert.rejects(cancellable.generate({ prompt: '设备详情' }, controller.signal), /已取消/);
  assert.equal(calls.length, 1);
});
