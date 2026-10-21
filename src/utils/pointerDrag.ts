type DragSession<T> = {
  value: T;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  dragging: boolean;
  pointerInWindow: boolean;
  capture: HTMLElement;
  document: Document;
  window: Window;
};

export type DragReleaseEvent = PointerEvent | MouseEvent;

export function createPointerDrag<T, Prepared = undefined>(options: {
  onMove: (value: T, event: PointerEvent) => void;
  prepareDrop?: (value: T, event: DragReleaseEvent) => Prepared;
  onDrop: (value: T, event: DragReleaseEvent, prepared: Prepared | undefined) => void;
  onReset: () => void;
}) {
  let session: DragSession<T> | null = null;
  let suppressClick = false;

  function clear() {
    const previous = session;
    session = null;
    if (previous) {
      previous.window.removeEventListener('pointermove', move, true);
      previous.window.removeEventListener('pointerup', finish, true);
      previous.window.removeEventListener('mouseup', mouseup, true);
      previous.window.removeEventListener('pointercancel', cancelPointer, true);
      previous.window.removeEventListener('keydown', keydown, true);
      previous.window.removeEventListener('blur', cancel);
      previous.document.removeEventListener('visibilitychange', visibilitychange);
      if (previous.capture.hasPointerCapture(previous.pointerId)) previous.capture.releasePointerCapture(previous.pointerId);
    }
    options.onReset();
  }

  function cancel() {
    if (session) suppressClick = true;
    clear();
  }

  function cancelPointer(event: PointerEvent) {
    if (event.pointerId === session?.pointerId) cancel();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  function visibilitychange() {
    if (session?.document.hidden) cancel();
  }

  function insideWindow(event: MouseEvent) {
    return !!session && event.clientX >= 0 && event.clientY >= 0
      && event.clientX < session.window.innerWidth && event.clientY < session.window.innerHeight;
  }

  function move(event: PointerEvent) {
    if (!session || event.pointerId !== session.pointerId) return;
    // A release can report the cleared button on pointermove before pointerup.
    // Complete the same gesture here; the later up event must not drop it twice.
    if (!(event.buttons & 1)) {
      if (session.pointerInWindow && insideWindow(event)) complete(event);
      else cancel();
      return;
    }
    session.pointerInWindow = insideWindow(event);
    if (!session.dragging && Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 5) return;
    session.dragging = true;
    suppressClick = true;
    event.preventDefault();
    options.onMove(session.value, event);
  }

  function complete(event: DragReleaseEvent) {
    if (!session) return;
    const previous = session;
    let prepared: Prepared | undefined;
    // Resolve against the visible preview before releasing capture or clearing it.
    try {
      if (previous.dragging) prepared = options.prepareDrop?.(previous.value, event);
    } finally { clear(); }
    if (previous.dragging) {
      event.preventDefault();
      options.onDrop(previous.value, event, prepared);
    }
  }

  function finish(event: PointerEvent) {
    if (event.pointerId === session?.pointerId) complete(event);
  }

  function mouseup(event: MouseEvent) {
    if (session?.pointerType === 'mouse' && event.button === 0) complete(event);
  }

  function start(event: PointerEvent, value: T, captureElement = event.currentTarget as HTMLElement) {
    if (event.button !== 0 || !event.isPrimary || session) return;
    const capture = captureElement;
    const document = capture.ownerDocument;
    const window = document.defaultView;
    if (!window) return;
    suppressClick = false;
    session = { value, pointerId: event.pointerId, pointerType: event.pointerType || 'mouse', startX: event.clientX, startY: event.clientY, dragging: false, pointerInWindow: true, capture, document, window };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('mouseup', mouseup, true);
    window.addEventListener('pointercancel', cancelPointer, true);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibilitychange);
    // Global listeners continue tracking if the browser releases capture early.
    event.preventDefault();
    try { capture.setPointerCapture(event.pointerId); }
    catch { cancel(); }
  }

  return { start, cancel, resetClick: () => { suppressClick = false; }, allowsClick: (event: MouseEvent) => event.detail === 0 || !suppressClick };
}
