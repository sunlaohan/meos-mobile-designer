import type { SavedDesign } from '../types';

export interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface DesignDraft {
  version: 1;
  ownerId: string;
  pageId: string;
  writerId: string;
  baseRevision: string;
  modifiedAt: string;
  document: SavedDesign;
}

// JSONB may reorder object keys. Compare content, never timestamps or key order.
export function designContentKey(document: Pick<SavedDesign, 'title' | 'nodes' | 'report'>): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]))
      : value;
  return JSON.stringify(canonical({ title: document.title.trim(), nodes: document.nodes, report: document.report }));
}
export function cloneDesign(document: SavedDesign): SavedDesign { return JSON.parse(JSON.stringify(document)); }

export function createDesignDraftStore(getStorage: () => DraftStorage, ownerId: string, pageId: string) {
  const prefix = `compose:design-draft:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(pageId)}:`;
  const key = (writerId: string) => `${prefix}${encodeURIComponent(writerId)}`;
  function read(writerId: string): DesignDraft | undefined {
    const raw = getStorage().getItem(key(writerId));
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.version === 1 && draft.ownerId === ownerId && draft.pageId === pageId && draft.writerId === writerId
        && typeof draft.baseRevision === 'string' && Number.isFinite(Date.parse(draft.modifiedAt))
        && draft.document?.version === 1 && typeof draft.document.title === 'string' && Array.isArray(draft.document.nodes)) return draft;
    } catch { /* Do not apply malformed local data to the canvas. */ }
  }
  function list(): DesignDraft[] {
    const storage = getStorage();
    const ids: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const item = storage.key(i);
      if (item?.startsWith(prefix)) { try { ids.push(decodeURIComponent(item.slice(prefix.length))); } catch { /* Unrelated malformed key. */ } }
    }
    return ids.flatMap(id => { const draft = read(id); return draft ? [draft] : []; })
      .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
  }
  function put(draft: DesignDraft) {
    if (draft.ownerId !== ownerId || draft.pageId !== pageId) throw new Error('草稿与当前账号或页面不一致。');
    getStorage().setItem(key(draft.writerId), JSON.stringify(draft));
  }
  // A late acknowledgement must not delete newer edits, even in another tab.
  function remove(draft: DesignDraft) {
    const current = read(draft.writerId);
    if (current && current.modifiedAt === draft.modifiedAt && designContentKey(current.document) === designContentKey(draft.document)) getStorage().removeItem(key(draft.writerId));
  }
  return { prefix, list, put, read, remove };
}
