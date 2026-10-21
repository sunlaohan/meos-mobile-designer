import type { CanvasNode } from '../types';
import { containsNode, findNode } from './nodeTree';
import { isCanvasPanel } from './canvasPresentation';

export interface AssociatedPanelEdit {
  sourceId: string;
  event: string;
  targetId: string;
}

export function associatedPanelEdit(nodes: CanvasNode[], sourceId: string, event: string): AssociatedPanelEdit | null {
  const action = findNode(nodes, sourceId)?.node.actions?.[event];
  const target = action && findNode(nodes, action.targetId)?.node;
  if (action?.type !== 'open-panel' || !target || !isCanvasPanel(target) || containsNode(target, sourceId)) return null;
  return { sourceId, event, targetId: target.id };
}

export function validPanelEdit(nodes: CanvasNode[], edit: AssociatedPanelEdit) {
  return associatedPanelEdit(nodes, edit.sourceId, edit.event)?.targetId === edit.targetId;
}

export function selectionInPanelEdit(nodes: CanvasNode[], edit: AssociatedPanelEdit, selectedIds: string[]) {
  const target = findNode(nodes, edit.targetId)?.node;
  return !!target && selectedIds.length > 0 && selectedIds.every((id) => containsNode(target, id));
}
