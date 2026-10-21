<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Icon as VanIcon } from 'persagy-vant';
import { Check, ChevronDown, Image as ImageIcon, RotateCcw, Search, X } from 'lucide-vue-next';
import { iconNames, isBuiltinIcon, isImageIcon, searchIcons, validCustomIcon } from '../utils/iconCatalog';

const props = defineProps<{ id: string; label: string; modelValue: unknown }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string | undefined): void }>();
const anchor = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const popup = ref<HTMLElement>();
const opened = ref(false);
const mode = ref<'library' | 'custom'>('library');
const query = ref('');
const draft = ref('');
const error = ref('');
const position = ref({ left: '0px', top: '0px', width: '390px', maxHeight: '480px' });
const currentValue = computed(() => typeof props.modelValue === 'string' ? props.modelValue : '');
const isDefault = computed(() => props.modelValue === undefined || props.modelValue === null);
const currentLabel = computed(() => isDefault.value ? '默认' : !currentValue.value ? '无图标' : isImageIcon(currentValue.value) ? '自定义图片' : currentValue.value);
const pickerLabel = computed(() => `选择${props.label.includes('图标') ? props.label.replace(/名称$/, '') : `${props.label}图标`}`);
const results = computed(() => searchIcons(query.value));

function updatePosition() {
  const rect = anchor.value?.getBoundingClientRect();
  if (!rect || !popup.value) return;
  const below = window.innerHeight - rect.bottom - 19;
  const above = rect.top - 19;
  const openBelow = below >= 360 || below >= above;
  const maxHeight = Math.max(120, Math.min(480, openBelow ? below : above));
  const height = Math.min(popup.value.scrollHeight, maxHeight);
  const width = Math.min(Math.max(rect.width, 390), window.innerWidth - 24);
  position.value = {
    left: `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`,
    top: `${openBelow ? rect.bottom + 7 : Math.max(12, rect.top - height - 7)}px`,
    width: `${width}px`, maxHeight: `${maxHeight}px`,
  };
}

async function focusInput() {
  await nextTick();
  updatePosition();
  popup.value?.querySelector<HTMLInputElement>('input')?.focus();
}
async function open() {
  if (opened.value) { close(); return; }
  query.value = '';
  error.value = '';
  draft.value = currentValue.value;
  mode.value = !isDefault.value && currentValue.value && !isBuiltinIcon(currentValue.value) ? 'custom' : 'library';
  opened.value = true;
  await focusInput();
}
function close(restoreFocus = true) {
  opened.value = false;
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}
function choose(value: string | undefined) {
  if (value !== props.modelValue) emit('update:modelValue', value);
  close();
}
function applyCustom() {
  const value = draft.value.trim();
  if (!validCustomIcon(value)) { error.value = '请输入有效的图片链接或自定义图标名称。'; return; }
  choose(value);
}
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (!anchor.value?.contains(target) && !popup.value?.contains(target)) close(false);
}
function onScroll(event: Event) {
  if (!popup.value?.contains(event.target as Node)) updatePosition();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key === 'Tab') {
    const controls = [...(popup.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input') || [])];
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
    else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0]?.focus(); }
    return;
  }
  if (mode.value !== 'library') return;
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement && results.value.length === 1) {
    event.preventDefault(); choose(results.value[0]); return;
  }
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  if (event.target instanceof HTMLInputElement && event.key !== 'ArrowDown') return;
  const options = [...(popup.value?.querySelectorAll<HTMLButtonElement>('[data-icon-name]') || [])];
  if (!options.length) return;
  event.preventDefault();
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  const offsets: Record<string, number> = { ArrowDown: 4, ArrowUp: -4, ArrowLeft: -1, ArrowRight: 1 };
  const offset = offsets[event.key] || 0;
  const next = event.key === 'Home' || index < 0 ? 0 : event.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + offset));
  options[next]?.focus();
  options[next]?.scrollIntoView({ block: 'nearest' });
}
function removeListeners() {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', updatePosition);
}
watch(opened, (value) => {
  removeListeners();
  if (value) {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
  }
});
watch([query, mode], async () => { if (opened.value) await focusInput(); });
watch(() => props.id, () => close(false));
onBeforeUnmount(removeListeners);
</script>

<template>
  <div ref="anchor" class="icon-picker-control">
    <button :id="id" ref="trigger" type="button" class="icon-picker-trigger" :class="{ active: opened }" :aria-label="pickerLabel" aria-haspopup="dialog" :aria-expanded="opened" :aria-controls="opened ? `${id}-icons` : undefined" @click="open">
      <span class="icon-picker-current-preview" aria-hidden="true"><VanIcon v-if="isBuiltinIcon(currentValue)" :name="currentValue" :size="20" /><img v-else-if="isImageIcon(currentValue)" :src="currentValue" alt="" referrerpolicy="no-referrer" /><ImageIcon v-else :size="18" /></span>
      <span class="icon-picker-current-name" :title="currentValue || currentLabel">{{ currentLabel }}</span><ChevronDown :size="14" />
    </button>
    <Teleport to="body">
      <section v-if="opened" :id="`${id}-icons`" ref="popup" class="icon-picker-popover" :style="position" role="dialog" :aria-label="pickerLabel" @keydown.stop="onKeydown">
        <header class="icon-picker-header"><strong>选择图标</strong><small>{{ iconNames.length }} 个内置图标</small><button type="button" aria-label="关闭图标选择" @click="close()"><X :size="16" /></button></header>
        <div class="icon-picker-tabs" role="tablist" aria-label="图标来源"><button type="button" role="tab" :aria-selected="mode === 'library'" @click="mode = 'library'">图标库</button><button type="button" role="tab" :aria-selected="mode === 'custom'" @click="mode = 'custom'">图片 / 自定义</button></div>
        <template v-if="mode === 'library'">
          <label class="icon-picker-search"><Search :size="16" /><input v-model="query" aria-label="搜索图标名称" placeholder="搜索名称或中文，如 arrow / 箭头" autocomplete="off" spellcheck="false" /><button v-if="query" type="button" aria-label="清空图标搜索" @click="query = ''"><X :size="14" /></button></label>
          <div class="icon-picker-actions"><button type="button" :aria-pressed="isDefault" @click="choose(undefined)"><RotateCcw :size="14" />默认<Check v-if="isDefault" :size="13" /></button><button type="button" :aria-pressed="!isDefault && !currentValue" @click="choose('')">无图标<Check v-if="!isDefault && !currentValue" :size="13" /></button><small>{{ results.length }} 个结果</small></div>
          <div class="icon-picker-grid" role="listbox" aria-label="可选图标">
            <button v-for="name in results" :key="name" type="button" class="icon-picker-option" role="option" :data-icon-name="name" :aria-label="name" :aria-selected="currentValue === name" :title="name" @click="choose(name)"><VanIcon :name="name" :size="25" aria-hidden="true" /><span>{{ name }}</span><Check v-if="currentValue === name" :size="13" class="icon-picker-check" /></button>
            <p v-if="!results.length" class="icon-picker-empty">没有找到匹配图标，试试其他名称或中文关键词。</p>
          </div>
          <footer class="icon-picker-note">点击图标立即应用；支持方向键选择和 Enter 确认。</footer>
        </template>
        <form v-else class="icon-picker-custom" @submit.prevent="applyCustom">
          <label :for="`${id}-custom-icon`">图片链接或自定义图标名称</label>
          <input :id="`${id}-custom-icon`" v-model="draft" aria-label="图片链接或自定义图标名称" placeholder="https://…、/assets/icon.svg 或自定义名称" :aria-invalid="!!error" :aria-describedby="error ? `${id}-icon-error` : undefined" @input="error = ''" />
          <p>用于已有图片或自定义图标库；普通图标可直接在「图标库」中选择。</p>
          <p v-if="error" :id="`${id}-icon-error`" role="alert" class="icon-picker-error">{{ error }}</p>
          <div><button type="button" @click="close()">取消</button><button type="submit">应用</button></div>
        </form>
      </section>
    </Teleport>
  </div>
</template>
