<script setup lang="ts">
import EditorSelect from './EditorSelect.vue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-vue-next';
import type { CanvasArtboard } from '../types';
import { useI18n } from '../utils/i18n';
const { t } = useI18n();
const props = defineProps<{ artboards: CanvasArtboard[]; activeId: string; preview?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'switch', id: string): void; (event: 'add'): void; (event: 'copy'): void; (event: 'remove'): void; (event: 'rename', title: string): void }>();
const menu = ref<HTMLDetailsElement>();
const input = ref<HTMLInputElement>();
const renaming = ref(false);
const title = ref('');
watch(() => props.activeId, () => { renaming.value = false; if (menu.value) menu.value.open = false; });
function currentIndex() { return props.artboards.findIndex(board => board.id === props.activeId); }
function adjacent(offset: number) { const board = props.artboards[currentIndex() + offset]; if (board) emit('switch', board.id); }
async function rename() {
  if (menu.value) menu.value.open = false;
  title.value = props.artboards[currentIndex()]?.title || '';
  renaming.value = true;
  await nextTick(); input.value?.focus(); input.value?.select();
}
function finishRename() {
  if (!renaming.value) return;
  const value = title.value.trim();
  renaming.value = false;
  if (value) emit('rename', value);
}
function action(kind: 'copy' | 'remove') { if (menu.value) menu.value.open = false; if (kind === 'copy') emit('copy'); else emit('remove'); }
function outsideMenu(event: PointerEvent) { if (menu.value?.open && !menu.value.contains(event.target as Node)) menu.value.open = false; }
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !menu.value?.open) return;
  event.preventDefault(); menu.value.open = false; menu.value.querySelector('summary')?.focus();
}
onMounted(() => document.addEventListener('pointerdown', outsideMenu, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outsideMenu, true));
</script>

<template>
  <div class="artboard-controls" :class="{ 'artboard-controls--multiple': artboards.length > 1 }" @keydown.stop="keydown" @click.stop>
    <i class="artboard-dot" aria-hidden="true" />
    <input v-if="renaming" ref="input" v-model="title" class="artboard-rename" maxlength="100" :aria-label="t('画板名称')" @blur="finishRename" @keydown.enter.prevent="finishRename" @keydown.esc.prevent="renaming = false" />
    <template v-else-if="artboards.length > 1">
      <button :aria-label="t('上一个画板')" :disabled="disabled || currentIndex() === 0" @click="adjacent(-1)"><ChevronLeft :size="14" /></button>
      <EditorSelect class="artboard-page-select" size="compact" :model-value="activeId" :options="artboards.map((board, index) => ({ label: `${index + 1}. ${board.title}`, value: board.id }))" :aria-label="t('切换画板')" :disabled="disabled" @update:model-value="emit('switch', String($event))" />
      <span class="artboard-position">{{ currentIndex() + 1 }}/{{ artboards.length }}</span>
      <button :aria-label="t('下一个画板')" :disabled="disabled || currentIndex() === artboards.length - 1" @click="adjacent(1)"><ChevronRight :size="14" /></button>
    </template>
    <span v-else class="artboard-single-title" :title="artboards[0]?.title">{{ artboards[0]?.title }}</span>
    <template v-if="!preview">
      <button :aria-label="t('新增画板')" :title="t('新增画板')" :disabled="disabled" @click="emit('add')"><Plus :size="15" /></button>
      <details ref="menu" class="artboard-menu">
        <summary :aria-label="t('画板操作')" :title="t('画板操作')"><MoreHorizontal :size="16" /></summary>
        <div class="artboard-menu-items">
          <button :disabled="disabled" @click="rename"><Pencil :size="14" />{{ t('重命名画板') }}</button>
          <button :disabled="disabled" @click="action('copy')"><Copy :size="14" />{{ t('复制画板') }}</button>
          <button :disabled="disabled || artboards.length === 1" @click="action('remove')"><Trash2 :size="14" />{{ t('删除画板') }}</button>
        </div>
      </details>
    </template>
  </div>
</template>
