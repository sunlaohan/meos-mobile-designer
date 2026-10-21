import type { CanvasNode } from '../types';
import { findNode, type NodeLocation } from './nodeTree';
import { canvasPanelTypes } from '../../shared/association-controls.mjs';

export { canvasPanelTypes };
const panelTypes = new Set<string>(canvasPanelTypes);

export function isCanvasPanel(node: CanvasNode) { return panelTypes.has(node.type); }

export function isTopFixedCanvasNode(node: CanvasNode) {
  return node.type === 'nav-bar' && node.props.fixed === true;
}

export function isFixedCanvasNode(node: CanvasNode) {
  return isTopFixedCanvasNode(node) || (node.type === 'bottom-action-bar' && node.props.fixed !== false);
}

// Opening a child panel brings it to the front; closing it returns to its parent.
export function reconcilePanelStack(previous: string[], openIds: string[]) {
  const open = new Set(openIds);
  return [...new Set([...previous.filter((id) => open.has(id)), ...openIds])];
}

// Presentation only: retain the saved hierarchy and the original drop indexes.
export function canvasPresentation(nodes: CanvasNode[]) {
  const fixed: NodeLocation[] = [];
  const topFixed: NodeLocation[] = [];
  const panels: NodeLocation[] = [];
  function visit(items: CanvasNode[], parentId: string | null = null, withinPanel = false): CanvasNode[] {
    return items.flatMap((node, index) => {
      const location = { node, siblings: items, parentId, index };
      if (isCanvasPanel(node)) {
        panels.push(location);
        if (node.children) location.node = { ...node, children: visit(node.children, node.id, true) };
        return [];
      }
      if (!withinPanel && isTopFixedCanvasNode(node)) {
        topFixed.push(location);
        // Keep a layout-only placeholder at its original position when requested.
        return node.props.placeholder ? [node] : [];
      }
      if (!withinPanel && isFixedCanvasNode(node)) { fixed.push(location); return []; }
      return [{ ...node, ...(node.children ? { children: visit(node.children, node.id, withinPanel) } : {}) }];
    });
  }
  const flow = visit(nodes);
  return { flow, fixed, topFixed, panels };
}

export function panelForSelection(nodes: CanvasNode[], id: string) {
  let location = findNode(nodes, id);
  while (location) {
    if (isCanvasPanel(location.node)) return location.node.id;
    location = location.parentId ? findNode(nodes, location.parentId) : null;
  }
  return '';
}
