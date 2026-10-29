import type { SavedDesign } from '../types';
import { cloneDesign, createDesignDraftStore, designContentKey, type DesignDraft, type DraftStorage } from './designDrafts';

export const AUTOSAVE_DELAY = 2_000;
export const AUTOSAVE_MAX_WAIT = 30_000;
export const SAVE_TIMEOUT = 20_000;
export type SaveFailureKind = 'conflict' | 'auth' | 'validation' | 'network' | 'server';
export class DesignSaveError extends Error {
  constructor(public kind: SaveFailureKind, message: string) { super(message); this.name = 'DesignSaveError'; }
}
export interface AutosaveState {
  status: 'saved' | 'pending' | 'saving' | 'offline' | 'error' | 'conflict' | 'recovery';
  dirty: boolean;
  saving: boolean;
  online: boolean;
  localSaved: boolean;
  localError: string;
  error: string;
  savedAt: string;
  localAt: string;
  drafts: DesignDraft[];
}
type Clock = { now(): number; setTimeout(callback: () => void, delay: number): any; clearTimeout(timer: any): void };
interface Options {
  ownerId: string;
  pageId: string;
  writerId: string;
  initial: SavedDesign;
  enabled?: boolean;
  storage: () => DraftStorage;
  online: () => boolean;
  save(document: SavedDesign, signal: AbortSignal): Promise<string>;
  publish(state: AutosaveState): void;
  clock?: Clock;
}

export function createDesignAutosave(options: Options) {
  const clock = options.clock || {
    now: () => Date.now(),
    setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer: any) => globalThis.clearTimeout(timer),
  };
  const store = createDesignDraftStore(options.storage, options.ownerId, options.pageId);
  let enabled = options.enabled !== false;
  let disposed = false;
  let current = cloneDesign(options.initial);
  let acknowledged = designContentKey(current);
  let baseRevision = options.initial.updatedAt;
  let draftBaseRevision = baseRevision;
  let online = options.online();
  let firstDirtyAt: number | undefined;
  let lastChangedAt = clock.now();
  let timer: any;
  let timeout: any;
  let request: AbortController | undefined;
  let flight: Promise<boolean> | undefined;
  let flightKey = '';
  let uncertainRemote = false;
  let failures = 0;
  let retryAt = 0;
  let blocked: '' | 'recovery' | 'conflict' | 'auth' | 'validation' = '';
  let reviewBlocked: '' | 'conflict' | 'auth' | 'validation' = '';
  let error = '';
  let localError = '';
  let ownDraft: DesignDraft | undefined;
  let recovered: DesignDraft | undefined;
  let drafts: DesignDraft[] = [];
  let backupSequence = 0;
  const dirty = () => designContentKey(current) !== acknowledged || uncertainRemote || (!!flight && flightKey !== designContentKey(current));
  function snapshot(): AutosaveState {
    const changed = dirty();
    return {
      status: blocked === 'recovery' ? 'recovery' : blocked === 'conflict' ? 'conflict' : !changed ? 'saved'
        : !online ? 'offline' : flight ? 'saving' : error ? 'error' : 'pending',
      dirty: changed, saving: !!flight, online, localSaved: !!ownDraft && designContentKey(ownDraft.document) === designContentKey(current),
      localError, error, savedAt: baseRevision, localAt: ownDraft?.modifiedAt || '', drafts: [...drafts],
    };
  }
  function publish() { if (!disposed) options.publish(snapshot()); }
  function refreshDrafts() {
    if (!enabled || disposed) return;
    try { drafts = store.list(); } catch { localError = '无法读取本机草稿，请检查浏览器存储权限。'; }
  }
  function cancelTimer() { clock.clearTimeout(timer); timer = undefined; }
  function persist() {
    if (!enabled || disposed || !dirty()) return;
    const draft: DesignDraft = { version: 1, ownerId: options.ownerId, pageId: options.pageId, writerId: options.writerId,
      baseRevision: draftBaseRevision, modifiedAt: new Date(lastChangedAt).toISOString(), document: cloneDesign(current) };
    try { store.put(draft); ownDraft = draft; localError = ''; }
    catch { ownDraft = undefined; localError = '本机草稿保存失败，可能是空间不足或存储被禁用。请联网保存或导出备份。'; }
    refreshDrafts();
  }
  function schedule() {
    cancelTimer();
    if (!enabled || disposed || blocked || flight || !online || !dirty()) return;
    const due = retryAt || Math.min(lastChangedAt + AUTOSAVE_DELAY, (firstDirtyAt ?? clock.now()) + AUTOSAVE_MAX_WAIT);
    timer = clock.setTimeout(() => { timer = undefined; void flush(); }, Math.max(0, due - clock.now()));
  }
  function update(document: SavedDesign) {
    if (!enabled || disposed) return;
    const key = designContentKey(document);
    if (key === designContentKey(current)) return;
    current = cloneDesign(document);
    lastChangedAt = clock.now();
    if (blocked === 'validation') { blocked = ''; error = ''; }
    if (dirty()) {
      firstDirtyAt ??= lastChangedAt;
      persist();
    } else {
      firstDirtyAt = undefined;
      if (ownDraft) { try { store.remove(ownDraft); } catch { /* Cloud content is already safe. */ } ownDraft = undefined; refreshDrafts(); }
      if (!blocked) error = '';
    }
    schedule(); publish();
  }
  async function flush(): Promise<boolean> {
    cancelTimer();
    if (!enabled || disposed) return false;
    if (flight) return flight;
    if (!dirty()) { publish(); return true; }
    persist();
    if (!online || blocked) { publish(); return false; }
    if (!current.title.trim() || current.title.trim().length > 100) {
      blocked = 'validation'; error = '页面名称需为 1–100 个字符。'; publish(); return false;
    }
    const document = cloneDesign(current);
    document.title = document.title.trim();
    document.updatedAt = new Date(clock.now()).toISOString();
    const sentKey = designContentKey(document);
    flightKey = sentKey;
    const controller = new AbortController();
    request = controller;
    let rejectTimeout: (reason: unknown) => void;
    const deadline = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    controller.signal.addEventListener('abort', () => rejectTimeout(new DesignSaveError('network', '云端连接已中断，本机草稿已保留。')), { once: true });
    timeout = clock.setTimeout(() => {
      controller.abort();
      rejectTimeout(new DesignSaveError('network', '云端保存超时，本机草稿已保留。'));
    }, SAVE_TIMEOUT);
    // Start after flight is assigned, so synchronous changes cannot launch a second write.
    flight = Promise.resolve().then(async () => {
      try {
        const revision = await Promise.race([options.save(document, controller.signal), deadline]);
        if (disposed || controller.signal.aborted) return false;
        acknowledged = sentKey; uncertainRemote = false; baseRevision = draftBaseRevision = revision; failures = 0; retryAt = 0; error = '';
        if (recovered) { try { store.remove(recovered); } catch { /* Keep an extra backup if removal is unavailable. */ } recovered = undefined; }
        if (dirty()) persist();
        else {
          firstDirtyAt = undefined;
          if (ownDraft) { try { store.remove(ownDraft); } catch { /* Keeping a redundant backup is safe. */ } ownDraft = undefined; }
          refreshDrafts();
        }
        return !dirty();
      } catch (failure) {
        if (disposed) return false;
        uncertainRemote = true;
        const kind = failure instanceof DesignSaveError ? failure.kind : 'server';
        error = failure instanceof Error ? failure.message : '云端同步失败，本机草稿已保留。';
        if (kind === 'conflict' || kind === 'auth' || kind === 'validation') blocked = kind;
        else { retryAt = clock.now() + Math.min(60_000, 5_000 * 2 ** Math.min(failures++, 4)); }
        persist();
        return false;
      } finally {
        clock.clearTimeout(timeout); timeout = undefined; request = undefined; flight = undefined; flightKey = '';
        schedule(); publish();
      }
    });
    publish();
    return flight;
  }
  function connectivityChanged(value = options.online()) {
    online = value;
    if (online) { failures = 0; retryAt = 0; if (!blocked) error = ''; }
    persist(); cancelTimer(); publish();
    if (online && dirty() && !blocked) void flush();
  }
  function retry() {
    if (blocked === 'conflict' || blocked === 'recovery') return Promise.resolve(false);
    blocked = ''; error = ''; retryAt = 0; online = options.online();
    return flush();
  }
  function reviewDrafts() {
    if (flight || !enabled || disposed) return;
    refreshDrafts(); if (blocked !== 'recovery') reviewBlocked = blocked;
    blocked = 'recovery'; cancelTimer(); publish();
  }
  function keepCurrent() { if (blocked === 'recovery') { blocked = reviewBlocked; if (!blocked) error = ''; schedule(); publish(); } }
  function restore(writerId: string): SavedDesign | undefined {
    if (flight || !enabled || disposed) return;
    let draft: DesignDraft | undefined;
    try { draft = store.read(writerId); } catch { localError = '无法读取本机草稿。'; publish(); return; }
    if (!draft) return;
    // Restoring another version must also preserve the currently edited version.
    if (dirty() && designContentKey(current) !== designContentKey(draft.document)) {
      try {
        store.put({ version: 1, ownerId: options.ownerId, pageId: options.pageId,
          writerId: `${options.writerId}-backup-${clock.now()}-${++backupSequence}`, baseRevision: draftBaseRevision,
          modifiedAt: new Date(clock.now()).toISOString(), document: cloneDesign(current) });
      } catch { localError = '无法备份当前修改，已取消恢复。请先导出当前设计。'; publish(); return; }
    }
    current = cloneDesign(draft.document); recovered = draft;
    draftBaseRevision = draft.baseRevision;
    blocked = draft.baseRevision === baseRevision ? '' : 'conflict';
    error = blocked ? '云端版本已变化，本机草稿未覆盖云端。可将当前草稿另存为副本。' : '';
    firstDirtyAt = lastChangedAt = clock.now();
    persist(); schedule(); publish();
    return cloneDesign(current);
  }
  function setEnabled(value: boolean) {
    enabled = value; cancelTimer();
    if (enabled) schedule();
  }
  function dispose(persistDraft = true) {
    if (disposed) return;
    if (persistDraft) persist();
    disposed = true; cancelTimer(); clock.clearTimeout(timeout); request?.abort();
  }
  function finishCopy(document: SavedDesign) {
    if (designContentKey(document) !== designContentKey(current)) return false;
    if (ownDraft) { try { store.remove(ownDraft); } catch { /* The cloud copy is safe. */ } }
    if (recovered) { try { store.remove(recovered); } catch { /* Keep redundant backup. */ } }
    dispose(false); return true;
  }
  if (enabled) {
    refreshDrafts();
    // Do not interrupt with drafts whose exact content is already in the cloud.
    const pending = drafts.filter(draft => designContentKey(draft.document) !== acknowledged);
    if (pending.length) blocked = 'recovery';
  }
  publish();
  return { update, flush, retry, connectivityChanged, persist, reviewDrafts, keepCurrent, restore, setEnabled, dispose, finishCopy,
    refresh: () => { refreshDrafts(); publish(); }, getSnapshot: snapshot, getDocument: () => cloneDesign(current) };
}
