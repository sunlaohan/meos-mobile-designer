import type { CanvasNode } from '../types';
import { containsNode, findNode, selectionRoots } from './nodeTree';

export interface LayerSelectionModifiers { shift?: boolean; toggle?: boolean }

// Select the visible tree interval. Selecting a parent already includes its
// subtree, so retain only selection roots to keep grouping/deletion unambiguous.
export function selectLayerInterval(nodes: CanvasNode[], visibleIds: string[], selectedIds: string[], anchorId: string, targetId: string, modifiers: LayerSelectionModifiers = {}) {
  const roots = (ids: string[]) => selectionRoots(nodes, [...new Set(ids)]).map((node) => node.id);
  const visible = [...new Set(visibleIds)].filter((id) => !!findNode(nodes, id));
  const current = roots(selectedIds);
  if (!visible.includes(targetId)) return { selectedIds: current, anchorId };
  if (modifiers.shift) {
    const anchor = visible.includes(anchorId) ? anchorId : [...selectedIds].reverse().find((id) => visible.includes(id)) || targetId;
    const start = visible.indexOf(anchor), end = visible.indexOf(targetId);
    const interval = visible.slice(Math.min(start, end), Math.max(start, end) + 1);
    return { selectedIds: roots(modifiers.toggle ? [...current, ...interval] : interval), anchorId: anchor };
  }
  if (modifiers.toggle) {
    const target = findNode(nodes, targetId)!.node;
    const next = current.includes(targetId) ? current.filter((id) => id !== targetId) : [...current.filter((id) => {
      const node = findNode(nodes, id)!.node;
      return !containsNode(node, targetId) && !containsNode(target, id);
    }), targetId];
    return { selectedIds: roots(next), anchorId: targetId };
  }
  return { selectedIds: [targetId], anchorId: targetId };
}
