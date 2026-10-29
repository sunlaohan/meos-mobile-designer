export interface AssociationControl {
  type: string;
  group: string;
  slot?: boolean;
  anchor?: boolean;
  componentApi?: boolean;
}
export const associationControls: AssociationControl[];
export const canvasPanelTypes: string[];
export const panelSlotTypes: string[];
export const anchoredPanelTypes: string[];
export const nativeCompositionTypes: string[];
export const nativeSlotTypes: string[];
export const triggerEventOptions: Record<string, { value: string; label: string }[]>;
