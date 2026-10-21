import type { CanvasNode } from '../types';
import { canHaveChildren, containsNode, findNode } from './nodeTree';

export const LAYER_INDENT = 18;
export function advanceLayerHover(previous: { id: string; since: number }, id: string, now: number) {
  const hover = previous.id === id ? previous : { id, since: now };
  return { hover, ready: !!id && now - hover.since >= 550 };
}
export interface FlatLayer {
  node: CanvasNode;
  parentId: string | null;
  index: number;
  depth: number;
  acceptsChildren: boolean;
}
export interface LayerDropTarget {
  id: string;
  parentId: string | null;
  index: number;
  depth: number;
  position: 'before' | 'after' | 'inside';
  root: boolean;
}

export function flattenLayers(nodes: CanvasNode[], collapsed: ReadonlySet<string>) {
  const result: FlatLayer[] = [];
  function visit(items: CanvasNode[], parentId: string | null, depth: number) {
    items.forEach((node, index) => {
      result.push({ node, parentId, index, depth, acceptsChildren: canHaveChildren(node) });
      if (!collapsed.has(node.id) && canHaveChildren(node)) visit(node.children || [], node.id, depth + 1);
    });
  }
  visit(nodes, null, 0);
  return result;
}

// Work in the visible preorder, but return indexes in the original tree for moveNode.
export function projectLayerDrop(nodes: CanvasNode[], rows: FlatLayer[], sourceId: string, hoveredId: string, position: LayerDropTarget['position'], requestedDepth: number): LayerDropTarget | null {
  const source = sourceId ? findNode(nodes, sourceId)?.node : undefined;
  if (sourceId && !source) return null;
  const visible = rows.filter(({ node }) => !source || !containsNode(source, node.id));
  const hoveredIndex = visible.findIndex(({ node }) => node.id === hoveredId);
  const hovered = visible[hoveredIndex];
  if (!hovered) return null;
  if (position === 'inside' && !hovered.acceptsChildren) return null;
  if (position === 'inside' && hovered.acceptsChildren) {
    return { id: hoveredId, parentId: hoveredId, index: hovered.node.children?.length || 0, depth: hovered.depth + 1, position, root: false };
  }
  let boundary = hoveredIndex + (position === 'after' ? 1 : 0);
  // Dragging left beside a group can place the item after its entire subtree.
  if (position === 'after' && requestedDepth <= hovered.depth) {
    while (boundary < visible.length && visible[boundary].depth > hovered.depth) boundary += 1;
  }
  const previous = visible[boundary - 1];
  const next = visible[boundary];
  const minDepth = next?.depth || 0;
  const maxDepth = previous ? previous.depth + (previous.acceptsChildren ? 1 : 0) : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, Math.max(0, Math.round(requestedDepth))));
  let parentId: string | null = null;
  if (depth > 0) {
    for (let index = boundary - 1; index >= 0; index -= 1) {
      if (visible[index].depth === depth - 1 && visible[index].acceptsChildren) { parentId = visible[index].node.id; break; }
    }
    if (!parentId) return null;
  }
  if (source && parentId && containsNode(source, parentId)) return null;
  const parent = parentId ? findNode(nodes, parentId)?.node : null;
  let index = parent ? parent.children?.length || 0 : nodes.length;
  for (let cursor = boundary; cursor < visible.length; cursor += 1) {
    const row = visible[cursor];
    if (row.depth < depth) break;
    if (row.depth === depth && row.parentId === parentId) { index = row.index; break; }
  }
  return { id: hoveredId, parentId, index, depth, position: position === 'before' ? 'before' : 'after', root: false };
}

export function layerScrollVelocity(pointerY: number, top: number, bottom: number) {
  const edge = Math.min(64, (bottom - top) / 4);
  if (pointerY < top - 24 || pointerY > bottom + 24 || edge <= 0) return 0;
  if (pointerY < top + edge) return -640 * Math.min(1, (top + edge - pointerY) / edge) ** 2;
  if (pointerY > bottom - edge) return 640 * Math.min(1, (pointerY - bottom + edge) / edge) ** 2;
  return 0;
}
