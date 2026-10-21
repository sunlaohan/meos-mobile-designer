<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, Layers3, Plus, Search, X } from 'lucide-vue-next';
import type { CanvasNode } from '../types';
import { getDefinition } from '../data/componentCatalog';
import { associationControls } from '../../shared/association-controls.mjs';

const props = defineProps<{ targets: CanvasNode[]; currentId?: string }>();
const emit = defineEmits<{
  (event: 'select', id: string): void;
  (event: 'create', type: string): void;
  (event: 'close'): void;
}>();
const dialog = ref<HTMLElement>();
const search = ref<HTMLInputElement>();
const query = ref('');
let previousFocus: HTMLElement | null = null;
const definitions = associationControls.map((item) => ({ ...getDefinition(item.type), associationGroup: item.group }));
const filteredDefinitions = computed(() => definitions.filter((item) => matches(`${item.name} ${item.englishName} ${item.type} ${item.description}`)));
const groups = computed(() => [...new Set(filteredDefinitions.value.map((item) => item.associationGroup))].map((name) => ({ name, items: filteredDefinitions.value.filter((item) => item.associationGroup === name) })));
const filteredTargets = computed(() => props.targets.map((node, index) => ({ node, definition: getDefinition(node.type), caption: String(node.props.title || node.props.name || `图层 ${index + 1}`) }))
  .filter(({ node, definition, caption }) => matches(`${definition.name} ${definition.englishName} ${node.type} ${caption} ${node.id}`)));
function matches(text: string) { return text.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()); }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  if (event.key !== 'Tab') return;
  const controls = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') || []).filter((element) => element.offsetParent !== null);
  const first = controls[0]; const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => { previousFocus = document.activeElement as HTMLElement | null; await nextTick(); search.value?.focus(); });
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<template>
  <Teleport to="body">
    <div class="association-picker-backdrop" @click.self="emit('close')">
      <section ref="dialog" class="association-picker" role="dialog" aria-modal="true" aria-labelledby="association-picker-title" @keydown.stop="keydown">
        <header class="association-picker-header"><div><h2 id="association-picker-title">选择关联控件</h2><p>选择控件后立即关联，也可复用画板中的控件。</p></div><button type="button" aria-label="关闭关联控件选择" @click="emit('close')"><X :size="18" /></button></header>
        <label class="association-picker-search"><Search :size="17" /><input ref="search" v-model="query" placeholder="搜索控件或已有图层" aria-label="搜索关联控件" /><button v-if="query" type="button" aria-label="清空关联控件搜索" @click="query = ''; search?.focus()"><X :size="14" /></button></label>
        <div class="association-picker-scroll">
          <section v-if="filteredDefinitions.length" class="association-picker-section">
            <h3>添加并关联 <span>{{ filteredDefinitions.length }}</span></h3>
            <div v-for="group in groups" :key="group.name" class="association-type-group">
            <h4>{{ group.name }} <span>{{ group.items.length }}</span></h4>
            <div class="association-type-grid">
              <button v-for="item in group.items" :key="item.type" type="button" class="association-type-option" :aria-label="`添加并关联${item.name}`" @click="emit('create', item.type)">
                <span class="association-type-icon"><Layers3 :size="19" /></span><span><strong>{{ item.name }}</strong><small>{{ item.englishName }}</small></span><Plus :size="15" />
              </button>
            </div>
            </div>
          </section>
          <section v-if="filteredTargets.length" class="association-picker-section">
            <h3>使用已有控件 <span>{{ filteredTargets.length }}</span></h3>
            <div class="association-existing-list">
              <button v-for="{ node, definition, caption } in filteredTargets" :key="node.id" type="button" class="association-existing-option" :class="{ selected: node.id === currentId }" :data-association-target="node.id" :aria-pressed="node.id === currentId" :aria-label="`关联已有${definition.name}：${caption}`" @click="emit('select', node.id)">
                <Layers3 :size="17" /><span><strong>{{ definition.name }}</strong><small>{{ caption }} · {{ node.id.slice(-4) }}</small></span><Check v-if="node.id === currentId" :size="17" />
              </button>
            </div>
          </section>
          <p v-if="!filteredDefinitions.length && !filteredTargets.length" class="association-picker-empty">没有找到匹配的控件</p>
        </div>
        <footer class="association-picker-footer">更换关联保留原控件；删除关联控件会同步删除对应图层，可撤销恢复。</footer>
      </section>
    </div>
  </Teleport>
</template>
