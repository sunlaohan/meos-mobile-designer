import type { CanvasArtboard, SavedDesign } from '../types';
import { cloneNodes, duplicateNodes } from './nodeTree';

type ArtboardDocument = Pick<SavedDesign, 'title' | 'nodes' | 'report' | 'artboards' | 'activeArtboardId'>;

// Existing documents remain one editable artboard. Stable IDs avoid false dirty
// states when the same legacy document is opened in more than one window.
export function designArtboards(document: ArtboardDocument): CanvasArtboard[] {
  if (document.artboards !== undefined) {
    if (!Array.isArray(document.artboards) || !document.artboards.length) throw new Error('画板数据无效，请检查设计文档。');
    const ids = new Set<string>();
    return document.artboards.map(board => {
      if (!board || typeof board.id !== 'string' || !board.id || ids.has(board.id)
        || typeof board.title !== 'string' || !board.title.trim() || !Array.isArray(board.nodes)) throw new Error('画板数据无效，请检查设计文档。');
      ids.add(board.id);
      return JSON.parse(JSON.stringify(board));
    });
  }
  return [{ id: 'main', title: document.title || '页面 1', nodes: cloneNodes(document.nodes), ...(document.report ? { report: document.report } : {}) }];
}

export function artboardDocument(title: string, boards: CanvasArtboard[], activeId: string, updatedAt = new Date().toISOString()): SavedDesign {
  if (!boards.length) throw new Error('设计至少需要一个画板。');
  const artboards: CanvasArtboard[] = JSON.parse(JSON.stringify(boards));
  const active = artboards.find(board => board.id === activeId) || artboards[0];
  // Keep the active page in nodes/report for existing readers of compose/v1.
  return { version: 1, title, updatedAt, artboards, activeArtboardId: active.id, nodes: cloneNodes(active.nodes), report: active.report };
}

export function copyArtboard(board: CanvasArtboard, id: string, title: string): CanvasArtboard {
  // duplicateNodes remaps every nested ID and panel binding together.
  const duplicated = duplicateNodes(board.nodes, board.nodes.map(node => node.id), () => crypto.randomUUID());
  const copiedIds = new Set(duplicated.selectedIds);
  return { id, title, nodes: duplicated.nodes.filter(node => copiedIds.has(node.id)) };
}
