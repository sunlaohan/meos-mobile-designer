<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, BookOpen, Copy, ExternalLink, Eye, Layers3, Settings2, Trash2 } from 'lucide-vue-next';
import { getDefinition } from '../data/componentCatalog';
import { getComponentDocsUrl } from '../utils/componentDocs';
import DesignTokenControl from './DesignTokenControl.vue';
import LayoutStyleEditor from './LayoutStyleEditor.vue';
import ContainerExtensionEditor from './ContainerExtensionEditor.vue';
import IconPickerControl from './IconPickerControl.vue';
import { isIconProperty } from '../utils/iconCatalog';
import InteractionEditor from './InteractionEditor.vue';
import AssociatedEditBar from './AssociatedEditBar.vue';
import type { CanvasNode, ContainerExtensions, PropertySchema } from '../types';
import { isContainer } from '../utils/nodeTree';
import { isCanvasPanel } from '../utils/canvasPresentation';

const props = defineProps<{
  node: CanvasNode | null;
  nodes: CanvasNode[];
  selection: CanvasNode[];
  canGroup: boolean;
  index: number;
  total: number;
  editingPanel?: CanvasNode | null;
}>();

const emit = defineEmits<{
  (event: 'patch', value: Record<string, unknown>): void;
  (event: 'extensions', value: ContainerExtensions): void;
  (event: 'content', value: string): void;
  (event: 'duplicate'): void;
  (event: 'remove'): void;
  (event: 'move', direction: -1 | 1): void;
  (event: 'error', message: string): void;
  (event: 'group'): void;
  (event: 'ungroup'): void;
  (event: 'preview-panel'): void;
  (event: 'bind-panel', name: string, targetId: string): void;
  (event: 'create-panel', name: string, type: string): void;
  (event: 'remove-associated', name: string): void;
  (event: 'edit-associated', name: string): void;
  (event: 'exit-associated-edit'): void;
}>();

const tab = ref<'design' | 'docs'>('design');
const jsonDrafts = ref<Record<string, string>>({});
const container = computed(() => props.node ? isContainer(props.node) : false);
const background = computed(() => props.node?.type === 'background');
const panel = computed(() => props.node ? isCanvasPanel(props.node) : false);
const definition = computed(() => (props.node && !container.value ? getDefinition(props.node.type) : null));
const backgroundThemes = [['default', '默认'], ['light', '浅色'], ['gray', '灰色'], ['solid', '纯色'], ['style-1', '样式一'], ['style-2', '样式二'], ['style-3', '样式三']];
function layerName(node: CanvasNode) {
  return isContainer(node) ? node.props.name || '容器组' : getDefinition(node.type).name;
}
const groups = computed(() => {
  const map = new Map<string, PropertySchema[]>();
  for (const item of definition.value?.properties || []) {
    const key = item.group || '属性';
    map.set(key, [...(map.get(key) || []), item]);
  }
  return [...map.entries()];
});

watch(
  () => [props.node?.id, props.selection.length],
  () => { if (container.value || props.selection.length > 1) tab.value = 'design'; },
);
watch(() => props.editingPanel?.id, (id) => { if (id) tab.value = 'design'; });

watch(
  () => props.node?.id,
  () => {
    jsonDrafts.value = {};
    for (const schema of definition.value?.properties || []) {
      if (schema.control === 'json' && props.node) {
        jsonDrafts.value[schema.key] = JSON.stringify(props.node.props[schema.key] ?? [], null, 2);
      }
    }
  },
  { immediate: true },
);

function valueOf(schema: PropertySchema) {
  if (!props.node) return '';
  return schema.target === 'content' ? props.node.content || '' : props.node.props[schema.key];
}

function fieldId(schema: PropertySchema) {
  return `property-${props.node?.id}-${schema.key}`;
}

function update(schema: PropertySchema, value: unknown) {
  if (schema.target === 'content') emit('content', String(value));
  else emit('patch', { [schema.key]: value });
}

function updateJson(schema: PropertySchema) {
  try {
    const parsed = JSON.parse(jsonDrafts.value[schema.key] || 'null');
    update(schema, parsed);
  } catch {
    emit('error', `${schema.label} 不是有效的 JSON`);
  }
}
</script>

<template>
  <aside class="property-panel">
    <div class="property-tabs" role="tablist">
      <button :class="{ active: tab === 'design' }" @click="tab = 'design'"><Settings2 :size="15" />设计</button>
      <button :class="{ active: tab === 'docs' }" :disabled="container || selection.length > 1" @click="tab = 'docs'"><BookOpen :size="15" />文档</button>
    </div>

    <AssociatedEditBar v-if="editingPanel" :name="getDefinition(editingPanel.type).name" surface="panel" @exit="emit('exit-associated-edit')" />

    <template v-if="selection.length > 1">
      <header class="selection-header">
        <div><p>多选图层</p><h2>已选择 {{ selection.length }} 个图层</h2><span>图层 Shift 连选；⌘ / Ctrl 单击加选或取消</span></div>
        <div class="node-actions">
          <button title="复制选中图层" @click="emit('duplicate')"><Copy :size="15" /></button>
          <button class="danger" title="删除选中图层" @click="emit('remove')"><Trash2 :size="15" /></button>
        </div>
      </header>
      <div class="property-scroll">
        <section class="property-group">
          <h3>创建父级容器</h3>
          <p class="panel-description">将选中图层放入一个容器，统一设置填充、圆角、内外边距与组件间距。</p>
          <button class="group-action-button" :disabled="!canGroup" @click="emit('group')"><Layers3 :size="16" />创建容器组</button>
          <p v-if="!canGroup" class="panel-description">请选择同一层级的图层；可将不同组内的图层拖到同一层级后再编组。</p>
          <span class="panel-shortcut">⌘ / Ctrl + G</span>
        </section>
        <section class="property-group">
          <h3>选中的图层</h3>
          <div v-for="item in selection" :key="item.id" class="selection-list-item"><Layers3 :size="14" />{{ layerName(item) }}</div>
        </section>
      </div>
    </template>

    <div v-else-if="!node || (!definition && !container)" class="property-empty">
      <span class="empty-glyph">⌁</span>
      <h3>选择一个组件</h3>
      <p>选择组件编辑属性或创建父级容器；图层支持 Shift 首尾连选，画布支持 Shift 逐个多选。</p>
    </div>

    <template v-else>
      <header class="selection-header">
        <div>
          <p>{{ container ? '布局' : definition?.category }} · {{ String(index + 1).padStart(2, '0') }}</p>
          <h2>{{ container ? node.props.name || '容器组' : definition?.name }}</h2>
          <span>{{ container ? `${node.children?.length || 0} 个子图层` : definition?.englishName }}</span>
        </div>
        <div class="node-actions">
          <button :disabled="index <= 0" title="上移" @click="emit('move', -1)"><ArrowUp :size="15" /></button>
          <button :disabled="index >= total - 1" title="下移" @click="emit('move', 1)"><ArrowDown :size="15" /></button>
          <button title="复制" @click="emit('duplicate')"><Copy :size="15" /></button>
          <button class="danger" title="删除" @click="emit('remove')"><Trash2 :size="15" /></button>
        </div>
      </header>

      <div v-if="tab === 'design'" class="single-group-action">
        <button class="group-action-button group-action-button--secondary" :disabled="!canGroup" @click="emit('group')"><Layers3 :size="15" />创建父级容器</button>
        <span class="panel-shortcut">⌘ / Ctrl + G</span>
      </div>

      <div v-if="panel && tab === 'design' && !editingPanel" class="panel-preview-control">
        <p>这是弹出面板，默认收起，可在手机内预览。</p>
        <button type="button" @click="emit('preview-panel')"><Eye :size="14" />预览面板</button>
      </div>

      <div v-if="(container || background) && tab === 'design'" class="property-scroll">
        <ContainerExtensionEditor v-if="node.layoutRole !== 'spacer'" :key="node.id" :node="node" :nodes="nodes" @update="emit('extensions', $event)" />
        <section v-if="container" class="property-group">
          <h3>容器组</h3>
          <label class="property-row"><span class="property-label">图层名称</span><input :value="node.props.name" aria-label="容器图层名称" @input="emit('patch', { name: ($event.target as HTMLInputElement).value })" /></label>
          <button class="group-action-button group-action-button--secondary" @click="emit('ungroup')"><Layers3 :size="16" />解组</button>
          <span class="panel-shortcut">⌘ / Ctrl + Shift + G · 子图层会保留</span>
        </section>
        <LayoutStyleEditor :key="node.id" :node="node" @patch="emit('patch', $event)" />
        <section v-if="background" class="property-group">
          <h3>背景主题</h3>
          <label class="property-row">
            <span class="property-label">内置背景主题</span>
            <select :value="node.props.theme || 'default'" aria-label="内置背景主题" @change="emit('patch', { theme: ($event.target as HTMLSelectElement).value })">
              <option v-for="[value, label] in backgroundThemes" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <p class="panel-description">背景颜色恢复默认后，使用内置主题。</p>
        </section>
      </div>

      <div v-else-if="tab === 'design'" class="property-scroll">
        <InteractionEditor :node="node" :nodes="nodes"
          @bind="(name, targetId) => emit('bind-panel', name, targetId)"
          @create="(name, type) => emit('create-panel', name, type)"
          @remove="emit('remove-associated', $event)"
          @edit="emit('edit-associated', $event)"
          @error="emit('error', $event)"
        />
        <section v-for="[groupName, schemas] in groups" :key="groupName" class="property-group">
          <h3>{{ groupName }}</h3>
          <div v-for="schema in schemas" :key="schema.key" class="property-row" :class="`control-${schema.control}`">
            <component
              :is="schema.tokenKind || schema.control === 'select' || isIconProperty(node.type, schema) ? 'div' : 'label'"
              :id="`${fieldId(schema)}-label`"
              class="property-label"
              :for="schema.tokenKind || schema.control === 'select' || isIconProperty(node.type, schema) ? undefined : fieldId(schema)"
              :title="`${schema.description || schema.label}（${schema.help || schema.key}）`"
            >
              <span class="property-label-title">{{ schema.label }}</span>
              <small v-if="schema.help">{{ schema.help }}</small>
            </component>

            <IconPickerControl
              v-if="isIconProperty(node.type, schema)"
              :id="fieldId(schema)"
              :key="fieldId(schema)"
              :label="schema.label"
              :model-value="valueOf(schema)"
              @update:model-value="update(schema, $event)"
            />
            <DesignTokenControl
              v-else-if="schema.tokenKind"
              :id="fieldId(schema)"
              :key="fieldId(schema)"
              :schema="schema"
              :component-type="definition?.docsPath || node.type"
              :model-value="valueOf(schema)"
              @update:model-value="update(schema, $event)"
            />

            <input
              v-else-if="schema.control === 'text'"
              :id="fieldId(schema)"
              :value="valueOf(schema)"
              type="text"
              :placeholder="schema.placeholder"
              @input="update(schema, ($event.target as HTMLInputElement).value)"
            />
            <textarea
              v-else-if="schema.control === 'textarea'"
              :id="fieldId(schema)"
              :value="valueOf(schema)"
              :placeholder="schema.placeholder"
              @input="update(schema, ($event.target as HTMLTextAreaElement).value)"
            />
            <input
              v-else-if="schema.control === 'number'"
              :id="fieldId(schema)"
              :value="valueOf(schema)"
              type="number"
              :min="schema.min"
              :max="schema.max"
              :step="schema.step || 1"
              @input="update(schema, Number(($event.target as HTMLInputElement).value))"
            />
            <select
              v-else-if="schema.control === 'select'"
              :id="fieldId(schema)"
              :aria-labelledby="`${fieldId(schema)}-label`"
              :value="valueOf(schema)"
              @change="update(schema, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in schema.options" :key="String(option.value)" :value="option.value">{{ option.label }}</option>
            </select>
            <button
              v-else-if="schema.control === 'boolean'"
              :id="fieldId(schema)"
              type="button"
              class="property-switch"
              :class="{ checked: Boolean(valueOf(schema)) }"
              :aria-pressed="Boolean(valueOf(schema))"
              @click="update(schema, !valueOf(schema))"
            >
              <span />
            </button>
            <textarea
              v-else-if="schema.control === 'json'"
              :id="fieldId(schema)"
              v-model="jsonDrafts[schema.key]"
              class="json-input"
              spellcheck="false"
              @change="updateJson(schema)"
              @blur="updateJson(schema)"
            />
          </div>
        </section>
      </div>

      <div v-else-if="definition" class="docs-panel">
        <span class="docs-badge">PERSAGY VANT</span>
        <h3>{{ definition.name }} {{ definition.englishName }}</h3>
        <p>{{ definition.description }}</p>
        <div class="docs-meta">
          <span>组件版本</span><strong>0.0.50</strong>
          <span>变量来源</span><strong>README.zh-CN.md</strong>
        </div>
        <a :href="getComponentDocsUrl(definition.docsPath)" target="_blank" rel="noreferrer">
          查看组件文档 <ExternalLink :size="14" />
        </a>
        <div class="docs-note">
          当前属性面板只展示已在组件 README 中公开的 Props；内容型默认插槽会明确标记为 default slot。
        </div>
      </div>
    </template>
  </aside>
</template>
