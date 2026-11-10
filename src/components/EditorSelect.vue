<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, ChevronDown } from 'lucide-vue-next';
import { useI18n } from '../utils/i18n';
import { nextEnabledOption, selectedOptionIndex, selectMenuPosition, type EditorSelectOption } from '../utils/selectOptions';

const props = withDefaults(defineProps<{
  modelValue?: unknown;
  options?: readonly EditorSelectOption[];
  id?: string;
  ariaLabel?: string;
  ariaLabelledby?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'compact' | 'default';
}>(), { options: () => [], size: 'default' });
const emit = defineEmits<{ (event: 'update:modelValue', value: string | number): void }>();
const { t } = useI18n();
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const popup = ref<HTMLElement>();
const opened = ref(false);
const active = ref(-1);
const menuId = `editor-select-${getCurrentInstance()!.uid}-options`;
const selected = computed(() => selectedOptionIndex(props.options, props.modelValue));
const selectedDescription = computed(() => props.options[selected.value]?.description);
const hasDescriptions = computed(() => props.options.some(option => option.description));
const unavailable = computed(() => props.disabled || !props.options.some(option => !option.disabled));
const display = computed(() => props.options[selected.value]?.label || (props.modelValue !== undefined && props.modelValue !== null && props.modelValue !== '' ? String(props.modelValue) : props.placeholder || t('请选择')));
const position = ref<Record<string, string>>({});
const upwards = ref(false);
let observer: ResizeObserver | undefined;
let frame = 0;
let typed = '';
let typedAt = 0;

function close(focus = false) {
  opened.value = false;
  typed = '';
  if (focus) trigger.value?.focus({ preventScroll: true });
}
function updatePosition() {
  const anchor = trigger.value?.getBoundingClientRect();
  if (!anchor || anchor.bottom < 0 || anchor.top > window.innerHeight || anchor.right < 0 || anchor.left > window.innerWidth) { close(); return; }
  const layout = selectMenuPosition(anchor, { width: window.innerWidth, height: window.innerHeight }, popup.value ? popup.value.scrollHeight + 2 : props.options.reduce((height, option) => height + (option.description ? 56 : 38), 12));
  upwards.value = layout.upwards;
  position.value = Object.fromEntries(['left', 'top', 'width', 'maxHeight'].map(key => [key, `${layout[key as 'left' | 'top' | 'width' | 'maxHeight']}px`]));
}
function resize() {
  if (!opened.value) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(updatePosition);
}
async function revealActive() {
  await nextTick();
  popup.value?.querySelector<HTMLElement>(`[data-option-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' });
}
async function open(direction: 1 | -1 = 1) {
  if (unavailable.value) return;
  active.value = selected.value >= 0 && !props.options[selected.value].disabled ? selected.value
    : nextEnabledOption(props.options, direction === 1 ? -1 : 0, direction);
  opened.value = true;
  updatePosition();
  await nextTick(); updatePosition(); void revealActive();
}
function choose(index: number) {
  const option = props.options[index];
  if (!option || option.disabled || unavailable.value) return;
  if (option.value !== props.modelValue) emit('update:modelValue', option.value);
  close(true);
}
function keydown(event: KeyboardEvent) {
  if (unavailable.value || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const handled = () => { event.preventDefault(); event.stopPropagation(); };
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    handled(); const direction = event.key === 'ArrowDown' ? 1 : -1;
    if (!opened.value) void open(direction);
    else { active.value = nextEnabledOption(props.options, active.value, direction); void revealActive(); }
  } else if (event.key === 'Enter' || event.key === ' ') {
    handled(); if (opened.value) choose(active.value); else void open();
  } else if ((event.key === 'Home' || event.key === 'End') && opened.value) {
    handled(); active.value = nextEnabledOption(props.options, event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1); void revealActive();
  } else if (event.key === 'Escape' && opened.value) {
    handled(); close(true);
  } else if (event.key === 'Tab') close();
  else if (event.key.length === 1) {
    handled(); const now = Date.now();
    typed = now - typedAt < 700 ? typed + event.key : event.key; typedAt = now;
    const query = typed.normalize('NFKC').toLocaleLowerCase();
    const repeated = [...query].every(char => char === query[0]);
    const prefix = repeated ? query[0] : query;
    const start = repeated ? active.value : -1;
    const index = Array.from({ length: props.options.length }, (_, offset) => (start + offset + 1) % props.options.length)
      .find(index => !props.options[index].disabled && props.options[index].label.normalize('NFKC').toLocaleLowerCase().startsWith(prefix));
    if (index !== undefined) { if (!opened.value) void open(); active.value = index; void revealActive(); }
  }
}
function outside(event: PointerEvent) {
  if (opened.value && !root.value?.contains(event.target as Node) && !popup.value?.contains(event.target as Node)) close();
}
function scroll(event: Event) { if (opened.value && !popup.value?.contains(event.target as Node)) close(); }
watch(() => props.modelValue, () => { if (opened.value) { active.value = selected.value; void revealActive(); } });
watch(() => props.options, () => { if (opened.value) { active.value = selected.value >= 0 ? selected.value : nextEnabledOption(props.options, -1, 1); resize(); } });
watch(unavailable, value => { if (value) close(); });
onMounted(() => {
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', resize);
  observer = new ResizeObserver(resize); if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('scroll', scroll, true);
  window.removeEventListener('resize', resize);
  observer?.disconnect(); cancelAnimationFrame(frame);
});
</script>

<template>
  <div ref="root" class="editor-select" :class="{ 'editor-select--compact': size === 'compact', 'editor-select--described': hasDescriptions, 'is-open': opened, 'is-disabled': unavailable }">
    <button :id="id" ref="trigger" type="button" role="combobox" class="editor-select-trigger" :aria-label="ariaLabel" :aria-labelledby="ariaLabelledby" :aria-expanded="opened" :aria-controls="opened ? menuId : undefined" :aria-activedescendant="opened && active >= 0 ? `${menuId}-${active}` : undefined" aria-haspopup="listbox" :disabled="unavailable" :title="[display, selectedDescription].filter(Boolean).join('\n')" @click.stop="opened ? close() : open()" @keydown="keydown" @blur="close()">
      <span class="editor-select-value" :class="{ 'is-placeholder': selected < 0 && (modelValue === undefined || modelValue === null || modelValue === '') }"><span class="editor-select-label">{{ display }}</span><small v-if="selectedDescription" class="editor-select-description">{{ selectedDescription }}</small></span>
      <ChevronDown :size="16" class="select-chevron" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <div v-if="opened" :id="menuId" ref="popup" class="editor-select-menu" :class="{ 'editor-select-menu--above': upwards, 'editor-select-menu--described': hasDescriptions }" :style="position" role="listbox" :aria-label="ariaLabel" :aria-labelledby="ariaLabelledby" @pointerdown.prevent>
        <button v-for="(option, index) in options" :id="`${menuId}-${index}`" :key="`${typeof option.value}:${option.value}`" type="button" role="option" tabindex="-1" class="editor-select-option" :class="{ 'is-active': index === active }" :data-option-index="index" :aria-selected="index === selected" :aria-disabled="option.disabled || undefined" :disabled="option.disabled" :title="[option.label, option.description].filter(Boolean).join('\n')" @mouseenter="!option.disabled && (active = index)" @click.stop="choose(index)">
          <span><span class="editor-select-label">{{ option.label }}</span><small v-if="option.description" class="editor-select-description">{{ option.description }}</small></span><Check v-if="index === selected" :size="16" aria-hidden="true" /><i v-else class="editor-select-check-space" aria-hidden="true" />
        </button>
      </div>
    </Teleport>
  </div>
</template>
