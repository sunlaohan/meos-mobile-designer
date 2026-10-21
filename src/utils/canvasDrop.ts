import type { CanvasNode } from '../types';
import { canHaveChildren, containsNode, findNode } from './nodeTree';
import { isCanvasPanel, isFixedCanvasNode } from './canvasPresentation';

export interface DropRect { left: number; top: number; width: number; height: number }
export interface CanvasDropTarget {
  parentId: string | null;
  index: number;
  anchorId: string;
  position: 'before' | 'after' | 'inside' | 'append';
}
export interface CanvasDropPreview extends CanvasDropTarget {
  mode: 'flow' | 'panel';
  indicator: { left: number; top: number; width: number; labelBelow: boolean } | null;
  highlight: DropRect | null;
  appendZone?: DropRect | null;
}

// Return document indexes, even when fixed bars and closed panels are absent from the flow.
export function projectCanvasDrop(
  nodes: CanvasNode[],
  rects: (DropRect & { id: string })[],
  point: { y: number; hoveredId?: string; parentId?: string | null; edgeSize?: number; sourceId?: string },
): CanvasDropTarget | null {
  const bounds = new Map(rects.map((rect) => [rect.id, rect]));
  const source = point.sourceId ? findNode(nodes, point.sourceId) : null;
  if (point.sourceId && !source) return null;
  function inside(parentId: string | null): CanvasDropTarget | null {
    if (source && parentId && containsNode(source.node, parentId)) return null;
    const parent = parentId ? findNode(nodes, parentId)?.node : null;
    if (parentId && (!parent || !canHaveChildren(parent))) return null;
    const siblings = parent ? parent.children || [] : nodes;
    let last: CanvasDropTarget | null = null;
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index];
      const rect = bounds.get(node.id);
      if (!rect || node.id === source?.node.id || isCanvasPanel(node) || isFixedCanvasNode(node)) continue;
      if (point.y < rect.top + rect.height / 2) return { parentId, index, anchorId: node.id, position: 'before' };
      last = { parentId, index: index + 1, anchorId: node.id, position: 'after' };
    }
    const lastRect = last && bounds.get(last.anchorId);
    if (last && lastRect && point.y >= lastRect.top + lastRect.height + (point.edgeSize ?? 12)) {
      return { ...last, index: siblings.length, position: 'append' };
    }
    return last || { parentId, index: siblings.length, anchorId: parentId || '', position: 'inside' };
  }
  const hovered = point.hoveredId ? findNode(nodes, point.hoveredId) : null;
  // The source keeps its space during dragging, but cannot become its own parent or anchor.
  if (source && hovered && containsNode(source.node, hovered.node.id)) return inside(source.parentId);
  const rect = hovered && bounds.get(hovered.node.id);
  if (!hovered || !rect || isCanvasPanel(hovered.node) || isFixedCanvasNode(hovered.node)) return inside(point.parentId || null);
  const edge = Math.min(point.edgeSize ?? 12, rect.height / 4);
  if (hovered.node.type === 'background' || (canHaveChildren(hovered.node) && point.y >= rect.top + edge && point.y <= rect.top + rect.height - edge)) return inside(hovered.node.id);
  const after = point.y >= rect.top + rect.height / 2;
  return { parentId: hovered.parentId, index: hovered.index + (after ? 1 : 0), anchorId: hovered.node.id, position: after ? 'after' : 'before' };
}

export function confirmCanvasDrop(
  nodes: CanvasNode[],
  preview: { target: CanvasDropTarget | null; x: number; y: number },
  current: CanvasDropTarget | null,
  x: number,
  y: number,
  sourceId?: string,
): CanvasDropTarget | null {
  if (!current) return null;
  const source = sourceId ? findNode(nodes, sourceId)?.node : null;
  if (sourceId && !source) return null;
  if (source && current.parentId && containsNode(source, current.parentId)) return null;
  const previous = preview.target;
  const parent = previous?.parentId ? findNode(nodes, previous.parentId)?.node : null;
  const siblings = previous?.parentId ? parent?.children || [] : nodes;
  const valid = previous && (!previous.parentId || (parent && canHaveChildren(parent))) && previous.index >= 0 && previous.index <= siblings.length
    && (!source || (!previous.parentId || !containsNode(source, previous.parentId)));
  // Small release jitter must not move a confirmed insertion to another container.
  return valid && Math.hypot(x - preview.x, y - preview.y) <= 8 ? { ...previous } : current;
}

function intersect(a: DropRect, b: DropRect): DropRect | null {
  const left = Math.max(a.left, b.left); const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width); const bottom = Math.min(a.top + a.height, b.top + b.height);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

export function canvasDropAt(nodes: CanvasNode[], type: string, x: number, y: number, sourceId?: string): CanvasDropPreview | null {
  const element = document.elementFromPoint(x, y);
  const phone = element?.closest<HTMLElement>('.phone-frame:not(.phone-frame--preview)');
  const content = phone?.querySelector<HTMLElement>('.phone-content');
  if (!phone || !content) return null;
  const slot = element?.closest<HTMLElement>('[data-slot-parent]');
  const docked = element?.closest('.phone-fixed-layer, .phone-top-fixed-layer');
  if (!slot && !docked && !element?.closest('.phone-content')) return null;
  const surface = slot || content;
  const scale = phone.getBoundingClientRect().width / phone.offsetWidth;
  let viewport: DropRect = content.getBoundingClientRect();
  if (slot) {
    viewport = slot.closest<HTMLElement>('.van-popup')?.getBoundingClientRect() || viewport;
  } else {
    const top = phone.querySelector('.phone-top-fixed-layer')?.getBoundingClientRect().bottom ?? viewport.top;
    const bottom = phone.querySelector('.phone-fixed-layer')?.getBoundingClientRect().top ?? viewport.top + viewport.height;
    viewport = { left: viewport.left, width: viewport.width, top: Math.max(viewport.top, top), height: Math.max(0, Math.min(viewport.top + viewport.height, bottom) - Math.max(viewport.top, top)) };
  }
  const scroll = phone.closest('.canvas-scroll, .preview-canvas');
  const clip = intersect(viewport, scroll?.getBoundingClientRect() || viewport);
  const visible = clip && intersect(clip, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  if (!visible) return null;
  const elements = new Map(Array.from(surface.querySelectorAll<HTMLElement>('[data-node-id]')).map((node) => [node.dataset.nodeId!, node]));
  const rects = [...elements].map(([id, node]) => {
    const rect = node.getBoundingClientRect();
    return { id, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }).filter((rect) => rect.width > 0 && rect.height > 0);
  let hoveredId = docked ? undefined : element?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
  let projectedY = y;
  const lastRoot = [...content.children].reverse().find((child) => child.hasAttribute('data-node-id')) as HTMLElement | undefined;
  const lastNode = lastRoot && findNode(nodes, lastRoot.dataset.nodeId!)?.node;
  const bottomDock = element?.closest('.phone-fixed-layer');
  if (!slot && (bottomDock || (!hoveredId && lastRoot && y >= lastRoot.getBoundingClientRect().bottom))) {
    // The footer and trailing page padding append to the page background.
    hoveredId = lastNode?.type === 'background' ? lastNode.id : undefined;
    projectedY = Infinity;
  }
  const target = projectCanvasDrop(nodes, rects, {
    y: projectedY, hoveredId,
    parentId: slot?.dataset.slotParent || null, edgeSize: 12 * scale, sourceId,
  });
  if (!target) return null;
  const parentElement = target.parentId ? elements.get(target.parentId) : null;
  const body = target.parentId
    ? (slot?.dataset.slotParent === target.parentId ? slot : surface.querySelector<HTMLElement>(`[data-canvas-children="${CSS.escape(target.parentId)}"]`)) || parentElement
    : content;
  if (!body) return null;
  const bodyBox = body.getBoundingClientRect();
  const style = getComputedStyle(body);
  const paddingLeft = parseFloat(style.paddingLeft) * scale || 0;
  const paddingRight = parseFloat(style.paddingRight) * scale || 0;
  const paddingTop = parseFloat(style.paddingTop) * scale || 0;
  const anchor = rects.find(({ id }) => id === target.anchorId);
  const left = Math.max(visible.left + 2, anchor && target.position !== 'inside' ? anchor.left : bodyBox.left + paddingLeft);
  const right = Math.min(visible.left + visible.width - 2, anchor && target.position !== 'inside' ? anchor.left + anchor.width : bodyBox.right - paddingRight);
  const top = anchor && target.position !== 'inside' ? anchor.top + (target.position !== 'before' ? anchor.height : 0) : bodyBox.top + paddingTop;
  const lineTop = Math.max(visible.top + 2, Math.min(visible.top + visible.height - 2, top));
  const panel = isCanvasPanel({ type } as CanvasNode);
  return {
    ...target, mode: panel ? 'panel' : 'flow',
    indicator: panel ? null : { left, top: lineTop, width: Math.max(0, right - left), labelBelow: lineTop < visible.top + 28 },
    highlight: panel ? visible : target.parentId ? intersect(bodyBox, visible) : target.position === 'inside' ? { left: visible.left + 4, top: visible.top + 4, width: visible.width - 8, height: Math.min(60 * scale, visible.height - 8) } : null,
    appendZone: !panel && target.position === 'append' ? intersect({ left, top: lineTop + 3, width: Math.max(0, right - left), height: Math.max(0, visible.top + visible.height - lineTop - 3) }, visible) : null,
  };
}
