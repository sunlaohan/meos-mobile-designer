import { getDefinition } from '../data/componentCatalog';
import type { CanvasNode, PageBuildReport } from '../types';
import { getComponentDocsUrl } from './componentDocs';
import { flattenNodes, getBackgroundProps, getBackgroundStyle, getContainerStyle, isContainer } from './nodeTree';
import { isCanvasPanel } from './canvasPresentation';
import { anchoredPanelTypes, associationControls } from '../../shared/association-controls.mjs';
import { containerExtensionDefinitions, effectiveExtensions, normalizedExtensions } from './containerExtensions';
import { createContainerExtensionRuntime } from '../../shared/container-extension-runtime.mjs';

const componentNames: Record<string, string> = {
  'tree-select': 'TreeSelect',
  'quantity-input': 'BatchMultiSelect',
  'material-action-bar': 'MaterialActionList',
  'material-display-bar': 'MaterialPreviewList',
  'multi-person-select': 'MultiSelect',
  'single-person-select': 'PersonSelect',
  'nav-bar': 'NavBar',
  'blue-mark-header': 'BlueMarkHeader',
  'title-bar': 'TitleBar',
  search: 'Search',
  cell: 'Cell',
  field: 'Field',
  button: 'Button',
  tag: 'Tag',
  switch: 'Switch',
  stepper: 'Stepper',
  'notice-bar': 'NoticeBar',
  progress: 'Progress',
  image: 'Image',
  divider: 'Divider',
  'info-card': 'InfoCard',
  'work-order-card': 'WorkOrderCard',
  'bottom-action-bar': 'BottomActionBar',
  empty: 'Empty',
  loading: 'Loading',
};

const selectionTypes = new Set(['tree-select', 'quantity-input']);
const namedModels = ['active', 'currentRate', 'showMore'];

function pascalCase(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function kebabCase(input: string) {
  return input.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function serializeProp(key: string, value: unknown) {
  const name = kebabCase(key);
  if (value === undefined || value === '') return '';
  if (value === true) return ` ${name}`;
  if (value === false) return ` :${name}="false"`;
  if (typeof value === 'string') return ` ${name}="${value.replaceAll('"', '&quot;')}"`;
  return ` :${name}='${JSON.stringify(value)}'`;
}

function serializeStyle(style: Record<string, string>) {
  return ` :style='${JSON.stringify(style).replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}'`;
}

function describeLayout(style: Record<string, string>) {
  return `填充 ${style.background || '默认主题'}；圆角 ${style.borderRadius}；组件间距 ${style.gap}；内边距（上右下左）${['Top', 'Right', 'Bottom', 'Left'].map((side) => style[`padding${side}`]).join('/')}；外边距（上右下左）${['Top', 'Right', 'Bottom', 'Left'].map((side) => style[`margin${side}`]).join('/')}`;
}

function nodeToVue(node: CanvasNode, depth = 2, anchoredIds = new Set<string>(), allNodes: CanvasNode[] = [], unwrapped = false): string {
  const indent = '  '.repeat(depth);
  const extensions = Object.fromEntries(Object.entries(effectiveExtensions(node, allNodes)).filter(([, config]) => config.enabled));
  if (!unwrapped && Object.keys(extensions).length) {
    const value = JSON.stringify(extensions).replaceAll('&', '&amp;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `${indent}<ContainerBehavior :extensions='${value}' :simulate="false" @refresh="handleContainerEvent('${node.id}', 'refresh', $event)" @load="handleContainerEvent('${node.id}', 'load', $event)">\n${nodeToVue(node, depth + 1, anchoredIds, allNodes, true)}\n${indent}</ContainerBehavior>`;
  }
  if (isContainer(node)) {
    return `${indent}<div class="designer-container"${serializeStyle(getContainerStyle(node))}>\n${(node.children || []).map((child) => nodeToVue(child, depth + 1, anchoredIds, allNodes)).join('\n')}\n${indent}</div>`;
  }
  const component = componentNames[node.type] || pascalCase(node.type);
  const props = Object.entries(node.type === 'background' ? getBackgroundProps(node) : node.props)
    .filter(([key]) => !['expanded', 'modelValue', 'show', ...namedModels].includes(key) && !(node.type === 'tree-select' && key === 'expandedKeys'))
    .map(([key, value]) => serializeProp(key, value))
    .join('') + (node.type === 'background' ? serializeStyle(getBackgroundStyle(node)) : '');
  const model = (Object.prototype.hasOwnProperty.call(node.props, 'modelValue') || selectionTypes.has(node.type)
    ? ` v-model="state['${node.id}']"`
    : node.type === 'work-order-card'
      ? ` v-model:expanded="state['${node.id}']"`
      : '') + (isCanvasPanel(node) || Object.prototype.hasOwnProperty.call(node.props, 'show') ? ` v-model:show="state['${node.id}:show']"` : '')
    + (node.type === 'tree-select' ? ` v-model:expanded-keys="state['${node.id}:expandedKeys']"` : '')
    + (node.type === 'quantity-input' ? ` v-model:expanded="state['${node.id}:expanded']"` : '')
    + namedModels.filter((key) => Object.prototype.hasOwnProperty.call(node.props, key)).map((key) => ` v-model:${kebabCase(key)}="state['${node.id}:${key}']"`).join('');
  const events = Object.entries(node.actions || {}).map(([event, action]) =>
    /^[a-z]+(?:-[a-z]+)*$/.test(event) ? anchoredIds.has(action.targetId)
      ? ` @${event}="openAssociatedControl('${action.targetId}', '${node.id}')"`
      : ` @${event}="state['${action.targetId}:show'] = true"` : '',
  ).join('');
  const source = Object.values(node.actions || {}).some((action) => anchoredIds.has(action.targetId)) ? ` data-association-source="${node.id}"` : '';
  const closeEvent = ['number-keyboard', 'overlay', 'calendar'].includes(node.type)
    ? ` @${node.type === 'number-keyboard' ? 'blur' : node.type === 'overlay' ? 'click' : 'confirm'}="state['${node.id}:show'] = false"` : '';

  if (anchoredPanelTypes.includes(node.type)) return `${indent}<div class="association-anchor" :style="anchors['${node.id}']">\n${indent}  <${component}${model}${props}${events}>\n${indent}    <template #reference><span class="association-reference" /></template>\n${indent}  </${component}>\n${indent}</div>`;
  if (node.children?.length) return `${indent}<${component}${model}${props}${source}${events}${closeEvent}>\n${node.children.map((child) => nodeToVue(child, depth + 1, anchoredIds, allNodes)).join('\n')}\n${indent}</${component}>`;
  if (node.content) return `${indent}<${component}${model}${props}${source}${events}${closeEvent}>${node.content}</${component}>`;
  return `${indent}<${component}${model}${props}${source}${events}${closeEvent} />`;
}

export function toVueSfc(title: string, nodes: CanvasNode[]) {
  const configured = flattenNodes(nodes).filter((node) => Object.values(effectiveExtensions(node, nodes)).some((config) => config?.enabled));
  const hasExtensions = configured.length > 0;
  const hasLazyload = configured.some((node) => effectiveExtensions(node, nodes).lazyload?.enabled);
  const components = flattenNodes(nodes).filter((node) => !isContainer(node));
  const apiComponents = associationControls.filter((control) => control.componentApi && components.some((node) => node.type === control.type)).map(({ type }) => pascalCase(type));
  const imports = [...new Set([...components.filter((node) => node.type !== 'toast').map((node) => {
    const name = componentNames[node.type] || pascalCase(node.type);
    return apiComponents.includes(name) ? `${name} as ${name}Api` : name;
  }), ...(hasExtensions ? ['PullRefresh', 'List', 'Sticky'] : [])])].join(', ');
  const componentSetup = apiComponents.map((name) => `const ${name} = ${name}Api.Component;`).join('\n');
  const toastImport = components.some((node) => node.type === 'toast') ? "import Toast from 'persagy-vant/lib/toast/Toast';\n" : '';
  const anchoredIds = new Set(components.filter((node) => anchoredPanelTypes.includes(node.type)).map((node) => node.id));
  let anchorSetup = anchoredIds.size ? `\nconst anchors = reactive<Record<string, Record<string, string>>>({});\nfunction openAssociatedControl(targetId: string, sourceId: string) {\n  const source = document.querySelector('[data-association-source="' + CSS.escape(sourceId) + '"]');\n  const rect = source?.getBoundingClientRect();\n  if (rect) anchors[targetId] = { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' };\n  (state as Record<string, unknown>)[targetId + ':show'] = true;\n}\n` : '';
  if (hasExtensions) anchorSetup = anchorSetup.replace('reactive<Record<string, Record<string, string>>>', 'reactive').replace('targetId: string, sourceId: string', 'targetId, sourceId').replace('(state as Record<string, unknown>)', 'state');
  const extensionSetup = hasExtensions ? `\n${hasLazyload ? "getCurrentInstance()?.appContext.app.use(Lazyload, { lazyComponent: true });\n" : ''}const ContainerBehavior = (${createContainerExtensionRuntime.toString()})({ defineComponent, h, ref, computed, watch, onMounted, onBeforeUnmount, nextTick, resolveComponent, PullRefresh, List, Sticky });\n\n// 按容器 ID 接入业务接口。refresh 返回完成结果，load 返回 { finished: boolean }。\n// 例如：'容器ID': { refresh: async () => { await fetchFirstPage(); }, load: async () => ({ finished: await fetchNextPage() }) }\nconst containerDataHandlers = {};\nasync function handleContainerEvent(id, kind, control) {\n  const handler = containerDataHandlers[id]?.[kind];\n  // 未接入接口时安全结束，不会发出请求或无限触发加载。\n  if (!handler) { control.complete({ finished: kind === 'load' }); return; }\n  try { control.complete((await handler()) || {}); } catch { control.fail(); }\n}\n` : '';
  const notifySetup = components.filter((node) => node.type === 'notify').map((node) => {
    const duration = Number(node.props.duration ?? 3000);
    return duration > 0 && Number.isFinite(duration) ? `watch(() => state['${node.id}:show'], (show, _, onCleanup) => {\n  if (!show) return;\n  const timer = setTimeout(() => { state['${node.id}:show'] = false; }, ${duration});\n  onCleanup(() => clearTimeout(timer));\n});` : '';
  }).filter(Boolean).join('\n');
  const stateEntries = components
    .flatMap((node) => [
      ...(Object.prototype.hasOwnProperty.call(node.props, 'modelValue') || node.type === 'work-order-card' || selectionTypes.has(node.type)
        ? [`  '${node.id}': ${JSON.stringify(node.props.modelValue ?? (selectionTypes.has(node.type) ? [] : node.props.expanded ?? false))}`] : []),
      ...(isCanvasPanel(node) || Object.prototype.hasOwnProperty.call(node.props, 'show') ? [`  '${node.id}:show': ${JSON.stringify(node.props.show ?? false)}`] : []),
      ...(node.type === 'tree-select' ? [`  '${node.id}:expandedKeys': ${JSON.stringify(node.props.expandedKeys ?? [])}`] : []),
      ...(node.type === 'quantity-input' ? [`  '${node.id}:expanded': ${JSON.stringify(node.props.expanded ?? false)}`] : []),
      ...namedModels.filter((key) => Object.prototype.hasOwnProperty.call(node.props, key)).map((key) => `  '${node.id}:${key}': ${JSON.stringify(node.props[key])}`),
    ])
    .join(',\n');

  return `<template>\n  <main class="${title.replaceAll(' ', '-').toLowerCase()}">\n${nodes.map((node) => nodeToVue(node, 2, anchoredIds, nodes)).join('\n')}\n  </main>\n</template>\n\n<script setup${hasExtensions ? '' : ' lang="ts"'}>\nimport { reactive${hasExtensions ? ', defineComponent, h, ref, computed, watch, onMounted, onBeforeUnmount, nextTick, resolveComponent, getCurrentInstance' : notifySetup ? ', watch' : ''} } from 'vue';\n${imports ? `import { ${imports} } from 'persagy-vant';\n` : ''}${hasLazyload ? "import Lazyload from 'persagy-vant/es/lazyload/index.mjs';\n" : ''}${toastImport}import 'persagy-vant/lib/index.css';\n${componentSetup ? `\n${componentSetup}\n` : ''}\nconst state = reactive({\n${stateEntries}\n});\n${anchorSetup}${extensionSetup}${notifySetup ? `\n${notifySetup}\n` : ''}</script>\n\n<style scoped>\nmain { min-height: 100vh; background: var(--van-gray-1); }\n.designer-container { box-sizing: border-box; }\n${hasExtensions ? '.container-extension-placeholder { display: grid; place-items: center; background: #f3f6fa; color: #7b8798; font-size: 14px; }\n' : ''}${anchoredIds.size ? '.association-anchor { position: fixed; left: 50%; top: 30%; width: 1px; height: 1px; pointer-events: none; }\n.association-reference { display: block; width: 100%; height: 100%; }\n' : ''}</style>\n`;
}

export function toJson(title: string, nodes: CanvasNode[], report?: PageBuildReport) {
  return JSON.stringify({ schema: 'compose/v1', title, components: nodes, ...(report ? { report } : {}) }, null, 2);
}

export function toMarkdown(title: string, nodes: CanvasNode[], report?: PageBuildReport) {
  const rows: string[] = [];
  function visit(items: CanvasNode[], prefix = '', parent = '页面') {
    items.forEach((node, index) => {
      const sequence = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      if (isContainer(node)) {
        const name = String(node.props.name || '容器组').replaceAll('|', '\\|');
        const style = getContainerStyle(node);
        rows.push(`| ${sequence} | ${name} | 容器 | ${parent} | ${describeLayout(style)} |`);
        visit(node.children || [], sequence, `${name}（${sequence}）`);
      } else {
        const definition = getDefinition(node.type);
        rows.push(`| ${sequence} | ${definition.name} | \`${definition.englishName}\` | ${parent} | ${definition.description}${node.type === 'background' ? `；${describeLayout(getBackgroundStyle(node))}` : ''} |`);
        if (node.children?.length) visit(node.children, sequence, `${definition.name}（${sequence}）`);
      }
    });
  }
  visit(nodes);
  const unique = [...new Set(flattenNodes(nodes).filter((node) => !isContainer(node)).map((node) => node.type))];
  const links = unique.map((type) => {
    const definition = getDefinition(type);
    return `- [${definition.name}](${getComponentDocsUrl(definition.docsPath)})：${definition.description}`;
  });

  const extensionNotes = flattenNodes(nodes).flatMap((node) => Object.entries(normalizedExtensions(node)).map(([kind, config]) => {
    const definition = containerExtensionDefinitions.find((item) => item.kind === kind)!;
    const name = String(node.props.name || node.props.title || (isContainer(node) ? '容器组' : getDefinition(node.type).name)).replaceAll('|', '\\|');
    return `- ${name}（${node.id}）：[${definition.name}](${getComponentDocsUrl(kind)})，${config.enabled ? '启用' : '停用'}；参数 ${JSON.stringify(config.props)}。`;
  }));

  return `# ${title}\n\n由 Compose 生成。\n\n## 页面结构\n\n| 顺序 | 组件 / 容器 | 代码名 | 父级 | 职责 / 布局 |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## 组件复用清单\n\n${links.join('\n')}\n${extensionNotes.length ? `\n## 容器扩展\n\n${extensionNotes.join('\n')}\n\n编辑态不执行扩展。预览模拟刷新和加载；Vue 导出保留真实组件、懒加载注册及 containerDataHandlers 接口接入位置。容器加载状态不写入设计文档。\n` : ''}\n## 规范落实项\n\n- 页面和容器采用纵向自动布局，容器的填充、圆角、内外边距和组件间距均保留在导出中。\n- 业务组件 Props 来自 Persagy Vant 公开 API；容器为页面布局元素。\n- 设计 JSON 保存完整父子关系，Vue 代码使用嵌套布局容器。\n${report ? skillReportMarkdown(report) : ''}`;
}

function skillReportMarkdown(report: PageBuildReport) {
  const link = (type: string) => { const definition = getDefinition(type); return `[${definition.name}](${getComponentDocsUrl(definition.docsPath)})`; };
  const mappings = report.elements.map((item) => `- ${item.element} → ${link(item.component)}：${item.variant}`).join('\n');
  const variants = report.elements.map((item) => `- ${link(item.component)}：${item.variant}；公开属性 ${item.props.map((prop) => `\`${prop}\``).join('、') || '默认属性'}`).join('\n');
  const panelItems = report.elements.filter((item) => associationControls.some(({ type }) => type === item.component));
  const interactionNotes = report.interactions
    ? report.interactions.map((binding) => `- ${binding.source}（${binding.event}） → ${binding.target}：已绑定，目标默认收起。`).join('\n') || '- 无需要关联的弹出控件。'
    : panelItems.map((item) => `- ${link(item.component)}：${item.variant}；保持组件原始样式。请在预览中核对入口及业务行为。`).join('\n') || '- 无动态面板。';
  const attachmentNotes = report.attachments?.length ? `\n## 参考附件\n\n${report.attachments.map((item) => `- ${item.name.replace(/[\[\]`]/g, '')}（${item.kind === 'image' ? '图片' : '代码'}，${Math.ceil(item.size / 1024)}KB）`).join('\n')}\n` : '';
  return `\n## Skill 来源\n\n- ${report.skill} ${report.version}；文档指纹 ${report.fingerprint}\n- 配方：${report.recipeTitle}；状态：${report.state}\n${report.generation ? `- 生成模型：${report.generation.actualModel}；请求型号：${report.generation.requestedModel}\n` : ''}- 已读取：${report.sourceFiles.join('、')}\n${attachmentNotes}\n## 元素-组件匹配\n\n${mappings}\n\n## 组件变体选型\n\n${variants}\n\n## Skill 规范落实项\n\n${report.rules.map((rule) => `- ${rule}`).join('\n')}\n\n## 动态面板验收\n\n${interactionNotes}\n\n## 业务与数据兼容核查\n\n${report.warnings.map((warning) => `- ${warning}`).join('\n')}\n- ${report.generation ? '通过公司网关调用所选模型生成设计草稿，未接入业务数据服务。' : '未调用大模型或业务服务，未更改既有接口。'}\n\n## 组件覆盖率\n\n- 组件结构覆盖率：${report.coverage.percent}%（${report.coverage.covered}/${report.coverage.total}）。纯页面布局容器不计入分母。\n- 保留组件默认视觉；未覆盖组件 CSS 变量。页面草稿不代表业务全流程已经验收。\n`;
}

export function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
