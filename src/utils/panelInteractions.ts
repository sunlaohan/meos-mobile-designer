import type { CanvasNode } from '../types';
import { cloneNodes, containsNode, findNode, flattenNodes, removeNodes } from './nodeTree';
import { isCanvasPanel } from './canvasPresentation';
import { triggerEventOptions } from '../../shared/association-controls.mjs';

export function triggerEvents(node: CanvasNode) { return triggerEventOptions[node.type] || []; }

export function panelTargets(nodes: CanvasNode[], source: CanvasNode) {
  return flattenNodes(nodes).filter((node) => isCanvasPanel(node) && !containsNode(node, source.id));
}

// Shared by the selector and drag-and-drop; a single document commit makes either operation undoable.
export function bindPanel(nodes: CanvasNode[], sourceId: string, event: string, targetId: string, created?: CanvasNode) {
  const next = cloneNodes(nodes);
  const source = findNode(next, sourceId)?.node;
  if (!source || !triggerEvents(source).some((item) => item.value === event)) return null;
  if (created) {
    if (!isCanvasPanel(created) || findNode(next, created.id) || created.id !== targetId) return null;
    const panel = cloneNodes([created])[0];
    panel.props.show = false;
    next.push(panel);
  }
  if (targetId && !panelTargets(next, source).some((node) => node.id === targetId)) return null;
  const actions = { ...source.actions };
  if (targetId) actions[event] = { type: 'open-panel', targetId };
  else delete actions[event];
  if (Object.keys(actions).length) source.actions = actions;
  else delete source.actions;
  return next;
}

// Deleting an associated control is distinct from unlinking or replacing it.
// Remove its subtree and all references together so one undo restores everything.
export function removeAssociatedPanel(nodes: CanvasNode[], sourceId: string, event: string) {
  const source = findNode(nodes, sourceId)?.node;
  if (!source || !triggerEvents(source).some((item) => item.value === event)) return null;
  const targetId = source.actions?.[event]?.targetId;
  if (!targetId) return null;
  const target = findNode(nodes, targetId)?.node;
  // Stale or invalid bindings can be cleared without deleting an unrelated layer
  // or an ancestor containing the trigger itself.
  if (!target || !isCanvasPanel(target) || containsNode(target, sourceId)) {
    return bindPanel(nodes, sourceId, event, '');
  }
  return removeNodes(nodes, [targetId]);
}
