import { reactive } from 'vue';
import type { CanvasDropPreview } from './canvasDrop';

export const componentDragState = reactive({ type: '', sourceId: '', x: 0, y: 0, associationId: '', target: null as CanvasDropPreview | null });
