import { reactive } from 'vue';
import type { LayerDropTarget } from './layerDrop';

export const layerDragState = reactive({
  sourceId: '', target: null as LayerDropTarget | null,
  association: null as { sourceId: string; event: string } | null,
  x: 0, y: 0, label: '', detail: '',
  indicator: null as { left: number; top: number; width: number } | null,
});
