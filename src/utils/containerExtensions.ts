import type { CanvasNode, ContainerExtensionKind, ContainerExtensions, PropertySchema } from '../types';
import { cloneNodes, containsNode, findNode, flattenNodes } from './nodeTree';

const text = (key: string, label: string): PropertySchema => ({ key, label, control: 'text' });
const number = (key: string, label: string, max = 2000): PropertySchema => ({ key, label, control: 'number', min: 0, max });
export const containerExtensionDefinitions: { kind: ContainerExtensionKind; name: string; component: string; description: string; defaults: Record<string, any>; fields: PropertySchema[] }[] = [
  { kind: 'pull-refresh', name: '下拉刷新', component: 'PullRefresh', description: '向下拉动容器，刷新内容', defaults: { headHeight: 50, pullDistance: 50, pullingText: '下拉即可刷新…', loosingText: '释放即可刷新…', loadingText: '刷新中…', successText: '刷新成功' }, fields: [number('pullDistance', '触发距离（px）'), number('headHeight', '提示区高度（px）'), text('pullingText', '下拉提示'), text('loosingText', '释放提示'), text('loadingText', '刷新中提示'), text('successText', '成功提示')] },
  { kind: 'list', name: '触底加载', component: 'List', description: '滚动接近底部时加载更多，可组合下拉刷新', defaults: { offset: 300, loadingText: '加载中…', finishedText: '没有更多了', errorText: '加载失败，点击重试', immediateCheck: true }, fields: [number('offset', '触发距离（px）'), text('loadingText', '加载中提示'), text('finishedText', '加载完成提示'), text('errorText', '失败提示'), { key: 'immediateCheck', label: '进入页面时检查', control: 'boolean' }] },
  { kind: 'lazyload', name: '懒加载', component: 'Lazyload', description: '容器进入可视区后再渲染内容', defaults: { placeholderHeight: 160 }, fields: [{ ...number('placeholderHeight', '占位高度（px）', 5000), min: 1, help: '设计器占位设置，不是组件 Props' }] },
  { kind: 'sticky', name: '吸顶／吸底', component: 'Sticky', description: '滚动时固定小分组，适合筛选栏、工具栏', defaults: { position: 'top', offsetTop: 0, offsetBottom: 0, zIndex: 99 }, fields: [{ key: 'position', label: '吸附位置', control: 'select', options: [{ label: '顶部', value: 'top' }, { label: '底部', value: 'bottom' }] }, number('offsetTop', '顶部距离（px）'), number('offsetBottom', '底部距离（px）'), number('zIndex', '层级', 9999)] },
];
export const extensionOrder = containerExtensionDefinitions.map(({ kind }) => kind);
export function supportsContainerExtensions(node: CanvasNode) { return ['container-group', 'background'].includes(node.type) && node.layoutRole !== 'spacer'; }
export function normalizedExtensions(node: CanvasNode): ContainerExtensions {
  if (!supportsContainerExtensions(node)) return {};
  return Object.fromEntries(containerExtensionDefinitions.flatMap((definition) => {
    const config = node.extensions?.[definition.kind];
    if (!config || typeof config !== 'object') return [];
    const props = { ...definition.defaults };
    for (const field of definition.fields) {
      const value = config.props?.[field.key];
      if (value === undefined) continue;
      if (field.control === 'number') {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) props[field.key] = Math.min(field.max ?? Infinity, Math.max(field.min ?? 0, numeric));
      } else if (field.control === 'boolean') props[field.key] = value === true;
      else if (field.control === 'select') {
        if (field.options?.some((option) => option.value === value)) props[field.key] = value;
      } else if (typeof value === 'string') props[field.key] = value;
    }
    return [[definition.kind, { enabled: config.enabled !== false, props }]];
  }));
}
export function extensionConflict(nodes: CanvasNode[], id: string, kind: ContainerExtensionKind): string {
  const location = findNode(nodes, id);
  if (!location) return '容器已不存在';
  const active = (node: CanvasNode) => node.type === kind || normalizedExtensions(node)[kind]?.enabled;
  let parent = location.parentId ? findNode(nodes, location.parentId) : null;
  while (parent) {
    if (active(parent.node)) return '父级容器已启用同类扩展';
    parent = parent.parentId ? findNode(nodes, parent.parentId) : null;
  }
  if (flattenNodes(location.node.children || []).some(active)) return '子图层已启用同类扩展';
  return '';
}
export function updateContainerExtensions(nodes: CanvasNode[], id: string, extensions: ContainerExtensions) {
  const next = cloneNodes(nodes);
  const node = findNode(next, id)?.node;
  if (!node || !supportsContainerExtensions(node)) return null;
  node.extensions = normalizedExtensions({ ...node, extensions });
  for (const kind of extensionOrder) if (node.extensions[kind]?.enabled && extensionConflict(next, id, kind)) return null;
  if (!Object.keys(node.extensions).length) delete node.extensions;
  return next;
}
export function extensionTreeError(nodes: CanvasNode[]) {
  for (const node of flattenNodes(nodes)) for (const kind of extensionOrder) {
    if (normalizedExtensions(node)[kind]?.enabled && extensionConflict(nodes, node.id, kind)) return `「${containerExtensionDefinitions.find((item) => item.kind === kind)!.name}」不能在父子容器中重复启用`;
  }
  return '';
}
// Old/imported documents may contain duplicates: only execute the outermost one.
export function effectiveExtensions(node: CanvasNode, nodes: CanvasNode[]) {
  const extensions = normalizedExtensions(node);
  for (const kind of extensionOrder) {
    if (extensions[kind]?.enabled && flattenNodes(nodes).some((parent) => parent.id !== node.id && containsNode(parent, node.id) && (parent.type === kind || normalizedExtensions(parent)[kind]?.enabled))) extensions[kind]!.enabled = false;
  }
  return extensions;
}
