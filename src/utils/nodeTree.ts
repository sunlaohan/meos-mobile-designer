import type { CanvasNode } from '../types';
import { panelSlotTypes, nativeSlotTypes, nativeCompositionTypes as nativeTypes } from '../../shared/association-controls.mjs';

export const CONTAINER_TYPE = 'container-group';
export const nativeCompositionTypes = new Set(nativeTypes);

export function isContainer(node: CanvasNode) {
  return node.type === CONTAINER_TYPE;
}

export function canHaveChildren(node: CanvasNode) {
  return isContainer(node) || ['background', 'form', 'info-card', 'list', 'pull-refresh', ...nativeSlotTypes, ...panelSlotTypes].includes(node.type);
}

export function cloneNodes(nodes: CanvasNode[]): CanvasNode[] {
  return JSON.parse(JSON.stringify(nodes));
}

export interface NodeLocation {
  node: CanvasNode;
  siblings: CanvasNode[];
  index: number;
  parentId: string | null;
}

export function findNode(nodes: CanvasNode[], id: string, parentId: string | null = null): NodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, siblings: nodes, index, parentId };
    const found = node.children && findNode(node.children, id, node.id);
    if (found) return found;
  }
  return null;
}

export function flattenNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children || [])]);
}

export function containsNode(node: CanvasNode, id: string): boolean {
  return node.id === id || (node.children || []).some((child) => containsNode(child, id));
}

export function selectionRoots(nodes: CanvasNode[], ids: string[]): CanvasNode[] {
  const selected = new Set(ids);
  return nodes.flatMap((node) => selected.has(node.id) ? [node] : selectionRoots(node.children || [], ids));
}

export function canGroupNodes(nodes: CanvasNode[], ids: string[]) {
  const selected = selectionRoots(nodes, ids);
  if (!selected.length || selected.length !== ids.length) return false;
  const locations = selected.map((node) => findNode(nodes, node.id)!);
  return locations.every((location) => location.parentId === locations[0].parentId);
}

export function groupNodes(nodes: CanvasNode[], ids: string[], id: string) {
  if (!canGroupNodes(nodes, ids)) return null;
  const next = cloneNodes(nodes);
  const selected = selectionRoots(next, ids);
  const location = findNode(next, selected[0].id)!;
  const selectedIds = new Set(ids);
  const group: CanvasNode = {
    id,
    type: CONTAINER_TYPE,
    props: {
      name: '容器组', fill: 'transparent', borderRadius: 0, gap: 0,
      paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    },
    children: selected,
  };
  const remaining = location.siblings.filter((node) => !selectedIds.has(node.id));
  remaining.splice(location.index, 0, group);
  location.siblings.splice(0, location.siblings.length, ...remaining);
  return { nodes: next, group };
}

export function ungroupNode(nodes: CanvasNode[], id: string) {
  const next = cloneNodes(nodes);
  const location = findNode(next, id);
  if (!location || !isContainer(location.node)) return null;
  const children = location.node.children || [];
  location.siblings.splice(location.index, 1, ...children);
  return { nodes: next, childIds: children.map((node) => node.id) };
}

export function moveNode(nodes: CanvasNode[], id: string, index: number, parentId: string | null = null) {
  const next = cloneNodes(nodes);
  const source = findNode(next, id);
  if (!source) return null;
  if (parentId && containsNode(source.node, parentId)) return null;
  const parent = parentId ? findNode(next, parentId)?.node : null;
  if (parentId && (!parent || !canHaveChildren(parent))) return null;
  const target = parent ? (parent.children ||= []) : next;
  const targetIndex = source.siblings === target && source.index < index ? index - 1 : index;
  source.siblings.splice(source.index, 1);
  target.splice(Math.max(0, Math.min(targetIndex, target.length)), 0, source.node);
  return next;
}

export function removeNodes(nodes: CanvasNode[], ids: string[]): CanvasNode[] {
  const selected = new Set(ids);
  function remove(items: CanvasNode[]): CanvasNode[] {
    return items.filter((node) => !selected.has(node.id)).map((node) => ({ ...node, ...(node.children ? { children: remove(node.children) } : {}) }));
  }
  const next = remove(nodes);
  const remaining = new Set(flattenNodes(next).map((node) => node.id));
  for (const node of flattenNodes(next)) {
    if (!node.actions) continue;
    node.actions = Object.fromEntries(Object.entries(node.actions).filter(([, action]) => remaining.has(action.targetId)));
    if (!Object.keys(node.actions).length) delete node.actions;
  }
  return next;
}

export function duplicateNodes(nodes: CanvasNode[], ids: string[], makeId: () => string) {
  const selected = new Set(selectionRoots(nodes, ids).map((node) => node.id));
  const duplicatedIds: string[] = [];
  const copiedIds = new Map<string, string>();
  function copy(node: CanvasNode): CanvasNode {
    const id = makeId();
    copiedIds.set(node.id, id);
    return { ...cloneNodes([node])[0], id, ...(node.children ? { children: node.children.map(copy) } : {}) };
  }
  function visit(items: CanvasNode[]): CanvasNode[] {
    return items.flatMap((node) => {
      if (selected.has(node.id)) {
        const duplicate = copy(node);
        duplicatedIds.push(duplicate.id);
        return [node, duplicate];
      }
      return [{ ...node, ...(node.children ? { children: visit(node.children) } : {}) }];
    });
  }
  const result = visit(cloneNodes(nodes));
  const duplicateIds = new Set(copiedIds.values());
  for (const node of flattenNodes(result)) {
    if (duplicateIds.has(node.id)) {
      for (const action of Object.values(node.actions || {})) action.targetId = copiedIds.get(action.targetId) || action.targetId;
    }
  }
  return { nodes: result, selectedIds: duplicatedIds };
}

function cssLength(value: unknown, allowNegative = false) {
  if (typeof value === 'string' && value.trim() && !Number.isFinite(Number(value))) return value.trim();
  const number = Number(value);
  return `${Number.isFinite(number) ? (allowNegative ? number : Math.max(0, number)) : 0}px`;
}

export function getContainerStyle(node: CanvasNode): Record<string, string> {
  return {
    display: 'flex', flexDirection: 'column', minWidth: '0', overflow: 'hidden',
    background: String(node.props.fill || 'transparent'),
    borderRadius: cssLength(node.props.borderRadius),
    paddingTop: cssLength(node.props.paddingTop), paddingRight: cssLength(node.props.paddingRight),
    paddingBottom: cssLength(node.props.paddingBottom), paddingLeft: cssLength(node.props.paddingLeft),
    marginTop: cssLength(node.props.marginTop, true), marginRight: cssLength(node.props.marginRight, true),
    marginBottom: cssLength(node.props.marginBottom, true), marginLeft: cssLength(node.props.marginLeft, true),
    gap: cssLength(node.props.gap),
  };
}

const backgroundLayoutKeys = new Set([
  'fill', 'borderRadius', 'gap',
  ...['padding', 'margin'].flatMap((prefix) => ['Top', 'Right', 'Bottom', 'Left'].map((side) => `${prefix}${side}`)),
]);

export function getBackgroundProps(node: CanvasNode) {
  return Object.fromEntries(Object.entries(node.props).filter(([key]) => !backgroundLayoutKeys.has(key)));
}

export function getBackgroundStyle(node: CanvasNode): Record<string, string> {
  const style: Record<string, string> = { ...getContainerStyle(node), boxSizing: 'border-box' };
  // Leave the native theme's color/image intact until the user chooses a fill.
  if (!node.props.fill) delete style.background;
  return style;
}
