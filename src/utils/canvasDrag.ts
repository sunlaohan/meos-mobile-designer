import type { CanvasNode } from '../types';
import { canvasDropAt, confirmCanvasDrop, type CanvasDropTarget } from './canvasDrop';
import { componentDragState as state } from './componentDragState';
import { createPointerDrag } from './pointerDrag';

export interface CanvasDragItem { type: string; sourceId?: string }
export type CanvasDragIntent =
  | { kind: 'canvas'; target: CanvasDropTarget }
  | { kind: 'associate'; sourceId: string; event: string };

export function canvasScrollVelocity(y: number, top: number, bottom: number) {
  const edge = Math.min(48, (bottom - top) / 4);
  if (edge <= 0 || y < top || y > bottom) return 0;
  if (y < top + edge) return -560 * ((top + edge - y) / edge) ** 2;
  if (y > bottom - edge) return 560 * ((y - bottom + edge) / edge) ** 2;
  return 0;
}

// Scroll the visible surface, including the outer canvas when a zoomed phone is clipped.
export function scrollCanvasAt(x: number, y: number, elapsed: number) {
  const element = document.elementFromPoint(x, y);
  const phone = element?.closest<HTMLElement>('.phone-frame:not(.phone-frame--preview)');
  if (!phone || element?.closest('.phone-fixed-layer, .phone-top-fixed-layer')) return false;
  const candidates: HTMLElement[] = [];
  let parent = element as HTMLElement | null;
  while (parent) {
    if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) candidates.push(parent);
    parent = parent.parentElement;
  }
  for (const scroller of candidates) {
    const box = scroller.getBoundingClientRect();
    let top = box.top; let bottom = box.bottom;
    if (scroller.classList.contains('phone-content')) {
      top = Math.max(top, phone.querySelector('.phone-top-fixed-layer')?.getBoundingClientRect().bottom ?? top);
      bottom = Math.min(bottom, phone.querySelector('.phone-fixed-layer')?.getBoundingClientRect().top ?? bottom);
    }
    const outer = candidates.slice(candidates.indexOf(scroller) + 1);
    // Reveal the rest of the phone before scrolling its partially hidden contents.
    if (outer.some((container) => {
      const clip = container.getBoundingClientRect();
      const clipTop = Math.max(0, clip.top); const clipBottom = Math.min(window.innerHeight, clip.bottom);
      return (y < clipTop + 48 && top < clipTop && container.scrollTop > 0)
        || (y > clipBottom - 48 && bottom > clipBottom && container.scrollTop < container.scrollHeight - container.clientHeight);
    })) continue;
    for (const container of outer) {
      const clip = container.getBoundingClientRect();
      top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
    }
    top = Math.max(0, top); bottom = Math.min(window.innerHeight, bottom);
    const velocity = canvasScrollVelocity(y, top, bottom);
    if (!velocity) continue;
    const scale = box.width / scroller.offsetWidth || 1;
    const before = scroller.scrollTop;
    scroller.scrollTop += velocity * Math.min(32, elapsed) / 1000 / scale;
    if (scroller.scrollTop !== before) return true;
  }
  return false;
}

export function createCanvasDrag(options: {
  nodes: () => CanvasNode[];
  allowAssociation?: boolean;
  onDrop: (item: CanvasDragItem, intent: CanvasDragIntent) => void;
}) {
  let item: CanvasDragItem | null = null;
  let point = { x: 0, y: 0 };
  let frame = 0;
  let previousTime = 0;

  function update() {
    if (!item) return;
    const association = options.allowAssociation ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-panel-trigger]') : null;
    Object.assign(state, {
      type: item.type, sourceId: item.sourceId || '', x: point.x, y: point.y,
      associationId: association?.dataset.panelTrigger || '',
      target: association ? null : canvasDropAt(options.nodes(), item.type, point.x, point.y, item.sourceId),
    });
  }

  function tick(time: number) {
    frame = 0;
    if (!item) return;
    const scrolled = scrollCanvasAt(point.x, point.y, previousTime ? time - previousTime : 16);
    previousTime = time;
    update();
    if (scrolled) schedule();
  }
  function schedule() {
    if (item && !frame) frame = requestAnimationFrame(tick);
  }

  return createPointerDrag<CanvasDragItem, CanvasDragIntent | null>({
    onMove(value, event) {
      if (!item) {
        item = value;
        document.documentElement.classList.add('is-canvas-dragging');
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
      }
      point = { x: event.clientX, y: event.clientY };
      schedule();
    },
    prepareDrop(value, event) {
      const { clientX: x, clientY: y } = event;
      const element = document.elementFromPoint(x, y);
      const association = options.allowAssociation ? element?.closest<HTMLElement>('[data-panel-trigger]') : null;
      if (association) return { kind: 'associate', sourceId: association.dataset.panelTrigger!, event: association.dataset.triggerEvent! };
      const target = confirmCanvasDrop(options.nodes(), state, canvasDropAt(options.nodes(), value.type, x, y, value.sourceId), x, y, value.sourceId);
      if (target) return { kind: 'canvas', target };
      return null;
    },
    onDrop(value, _event, intent) { if (intent) options.onDrop(value, intent); },
    onReset() {
      if (!item) return;
      item = null;
      cancelAnimationFrame(frame); frame = 0; previousTime = 0;
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.documentElement.classList.remove('is-canvas-dragging');
      Object.assign(state, { type: '', sourceId: '', x: 0, y: 0, associationId: '', target: null });
    },
  });
}
