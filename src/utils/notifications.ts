import { readonly, ref } from 'vue';

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';
export interface Notification { id: number; message: string; kind: NotificationKind }
type Scheduler = { setTimeout: (callback: () => void, delay: number) => unknown; clearTimeout: (timer: any) => void };

export function createNotificationCenter(publish: (items: Notification[]) => void, clock: Scheduler = globalThis) {
  let items: Notification[] = [];
  let sequence = 0;
  const timers = new Map<number, unknown>();
  const update = () => publish([...items]);
  function pause(id: number) { if (timers.has(id)) clock.clearTimeout(timers.get(id)); timers.delete(id); }
  function dismiss(id: number) { pause(id); items = items.filter(item => item.id !== id); update(); }
  function resume(id: number) {
    pause(id);
    const item = items.find(item => item.id === id);
    if (item) timers.set(id, clock.setTimeout(() => dismiss(id), item.message.length > 90 ? 12000 : ['error', 'warning'].includes(item.kind) ? 8000 : 5000));
  }
  function notify(message: string, kind: NotificationKind = 'success') {
    if (!message.trim()) return;
    // Repeated feedback remains visible without filling the screen with duplicates.
    for (const item of [...items]) if (item.message === message && item.kind === kind) dismiss(item.id);
    while (items.length >= 3) dismiss(items[0].id);
    const item = { id: ++sequence, message, kind };
    items.push(item); update(); resume(item.id);
    return item.id;
  }
  function clear() { for (const item of items) pause(item.id); items = []; update(); }
  return { notify, dismiss, pause, resume, clear };
}

const messages = ref<Notification[]>([]);
const center = createNotificationCenter(items => { messages.value = items; });
export function useNotifications() { return { messages: readonly(messages), ...center }; }
