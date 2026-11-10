export interface EditorSelectOption { label: string; description?: string; value: string | number; disabled?: boolean }

export function selectedOptionIndex(options: readonly EditorSelectOption[], value: unknown) {
  const exact = options.findIndex(option => option.value === value);
  // Older native selects wrote numeric option values back as strings.
  return exact >= 0 ? exact : typeof value === 'string' || typeof value === 'number'
    ? options.findIndex(option => String(option.value) === String(value)) : -1;
}

export function nextEnabledOption(options: readonly EditorSelectOption[], start: number, direction: 1 | -1) {
  for (let step = 1; step <= options.length; step++) {
    const index = ((start + step * direction) % options.length + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
}

export function selectMenuPosition(anchor: { left: number; top: number; bottom: number; width: number }, viewport: { width: number; height: number }, desiredHeight: number) {
  const edge = 8, gap = 6;
  const width = Math.min(Math.max(anchor.width, 176), Math.max(0, viewport.width - edge * 2));
  const below = Math.max(0, viewport.height - anchor.bottom - gap - edge);
  const above = Math.max(0, anchor.top - gap - edge);
  const upwards = below < Math.min(desiredHeight, 152) && above > below;
  const maxHeight = Math.min(304, upwards ? above : below);
  return {
    left: Math.max(edge, Math.min(anchor.left, viewport.width - width - edge)),
    top: upwards ? Math.max(edge, anchor.top - gap - Math.min(desiredHeight, maxHeight)) : anchor.bottom + gap,
    width, maxHeight, upwards,
  };
}
