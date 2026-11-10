import type { CanvasArtboard, CanvasNode, DesignSource, PageBuildRequest } from '../types';
import { validateAttachments } from '../../shared/attachments.mjs';

export type DeliveryMode = 'update' | 'new';
export function sourceFromRequest(request: PageBuildRequest, nodes: CanvasNode[]): DesignSource {
  return JSON.parse(JSON.stringify({ inputMode: request.inputMode || 'requirements', prompt: request.prompt,
    attachments: validateAttachments(request.attachments), initialNodes: nodes }));
}
export function suggestedDeliveryMode(board?: CanvasArtboard): DeliveryMode {
  const mode = board?.source?.inputMode || board?.report?.generation?.inputMode;
  return mode === 'requirements' || (!mode && !!board?.report?.prompt) ? 'new' : 'update';
}
export function boardSource(board: CanvasArtboard): DesignSource {
  return board.source || { inputMode: board.report?.generation?.inputMode || 'requirements', prompt: board.report?.prompt || '', attachments: [] };
}
