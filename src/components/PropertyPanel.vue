<script setup lang="ts">
import { useI18n, componentName, propertyName, uiDescription } from '../utils/i18n';
const { t } = useI18n();
import { computed, ref, watch } from 'vue';
import { ArrowDown, ArrowUp, BookOpen, Copy, ExternalLink, Eye, Layers3, Settings2, Trash2 } from 'lucide-vue-next';
import { getDefinition } from '../data/componentCatalog';
import { getComponentDocsUrl } from '../utils/componentDocs';
import DesignTokenControl from './DesignTokenControl.vue';
import LayoutStyleEditor from './LayoutStyleEditor.vue';
import ContainerExtensionEditor from './ContainerExtensionEditor.vue';
import IconPickerControl from './IconPickerControl.vue';
import ImageSourceControl from './ImageSourceControl.vue';
import { isIconProperty } from '../utils/iconCatalog';
import InteractionEditor from './InteractionEditor.vue';
import AssociatedEditBar from './AssociatedEditBar.vue';
import ComponentStylePicker from './ComponentStylePicker.vue';
import PanelSearch from './PanelSearch.vue';
import SearchHighlight from './SearchHighlight.vue';
import { filterPropertySchemas } from '../utils/panelSearch';
import { componentPropertyHint, componentPropertyPatch, componentPropertyValue, visibleComponentProperties } from '../utils/componentStyles';
import type { CanvasNode, ContainerExtensions, PropertySchema } from '../types';
import { isContainer } from '../utils/nodeTree';
import { isCanvasPanel } from '../utils/canvasPresentation';
import libraryPackage from 'persagy-vant/package.json';

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
  (event: 'style', id: string): void;
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
const stateQuery = ref('');
const jsonDrafts = ref<Record<string, string>>({});
const container = computed(() => props.node ? isContainer(props.node) : false);
const background = computed(() => props.node?.type === 'background');
const panel = computed(() => props.node ? isCanvasPanel(props.node) : false);
const definition = computed(() => (props.node && !container.value ? getDefinition(props.node.type) : null));
const backgroundThemes = [['default', '默认'], ['light', '浅色'], ['gray', '灰色'], ['solid', '纯色'], ['style-1', '样式一'], ['style-2', '样式二'], ['style-3', '样式三']];
function layerName(node: CanvasNode) {
  return isContainer(node) ? node.props.name || t('容器组') : componentName(getDefinition(node.type));
}
const groups = computed(() => {
  const map = new Map<string, PropertySchema[]>();
  for (const item of props.node && definition.value ? visibleComponentProperties(props.node, definition.value) : []) {
    const key = item.group || '属性';
    map.set(key, [...(map.get(key) || []), item]);
  }
  return [...map.entries()].map(([name, schemas]) => [name, name === '状态' ? filterPropertySchemas(schemas, stateQuery.value) : schemas] as const);
});
watch(() => props.node?.id, () => { stateQuery.value = ''; });

watch(
  () => [props.node?.id, props.selection.length],
  () => { if (container.value || props.selection.length > 1) tab.value = 'design'; },
);
watch(() => props.editingPanel?.id, (id) => { if (id) tab.value = 'design'; });

watch(
  () => [props.node?.id, ...Object.values(props.node?.props || {})],
  () => {
    jsonDrafts.value = {};
    for (const schema of definition.value?.properties || []) {
      if (schema.control === 'json' && props.node) {
        jsonDrafts.value[schema.key] = JSON.stringify(componentPropertyValue(props.node, schema.key) ?? [], null, 2);
      }
    }
  },
  { immediate: true },
);

function valueOf(schema: PropertySchema) {
  if (!props.node) return '';
  return schema.target === 'content' ? props.node.content || '' : componentPropertyValue(props.node, schema.key);
}

function fieldId(schema: PropertySchema) {
  return `property-${props.node?.id}-${schema.key}`;
}

function update(schema: PropertySchema, value: unknown) {
  if (schema.target === 'content') emit('content', String(value));
  else if (props.node) emit('patch', componentPropertyPatch(props.node, schema.key, value));
}

function updateJson(schema: PropertySchema) {
  try {
    const parsed = JSON.parse(jsonDrafts.value[schema.key] || 'null');
    update(schema, parsed);
  } catch {
    emit('error', `${propertyName(schema)} 不是有效的 JSON`);
  }
}
</script>

<template>
  <aside class="property-panel">
    <div class="property-tabs" role="tablist">
      <button :class="{ active: tab === 'design' }" @click="tab = 'design'"><Settings2 :size="15" />{{ t("设计") }}</button>
      <button :class="{ active: tab === 'docs' }" :disabled="container || selection.length > 1" @click="tab = 'docs'"><BookOpen :size="15" />{{ t("文档") }}</button>
    </div>

    <AssociatedEditBar v-if="editingPanel" :name="componentName(getDefinition(editingPanel.type))" surface="panel" @exit="emit('exit-associated-edit')" />

    <template v-if="selection.length > 1">
      <header class="selection-header">
        <div><p>{{ t("多选图层") }}</p><h2>{{ t('已选择 {0} 个图层', [selection.length]) }}</h2><span>{{ t("图层 Shift 连选；⌘ / Ctrl 单击加选或取消") }}</span></div>
        <div class="node-actions">
          <button :title="t('复制选中图层')" @click="emit('duplicate')"><Copy :size="15" /></button>
          <button class="danger" :title="t('删除选中图层')" @click="emit('remove')"><Trash2 :size="15" /></button>
        </div>
      </header>
      <div class="property-scroll">
        <section class="property-group">
          <h3>{{ t("创建父级容器") }}</h3>
          <p class="panel-description">{{ t("将选中图层放入一个容器，统一设置填充、圆角、内外边距与组件间距。") }}</p>
          <button class="group-action-button" :disabled="!canGroup" @click="emit('group')"><Layers3 :size="16" />{{ t("创建容器组") }}</button>
          <p v-if="!canGroup" class="panel-description">{{ t("请选择同一层级的图层；可将不同组内的图层拖到同一层级后再编组。") }}</p>
          <span class="panel-shortcut">⌘ / Ctrl + G</span>
        </section>
        <section class="property-group">
          <h3>{{ t("选中的图层") }}</h3>
          <div v-for="item in selection" :key="item.id" class="selection-list-item"><Layers3 :size="14" />{{ layerName(item) }}</div>
        </section>
      </div>
    </template>

    <div v-else-if="!node || (!definition && !container)" class="property-empty">
      <span class="empty-glyph">⌁</span>
      <h3>{{ t("选择一个组件") }}</h3>
      <p>{{ t("选择组件编辑属性或创建父级容器；图层支持 Shift 首尾连选，画布支持 Shift 逐个多选。") }}</p>
    </div>

    <template v-else>
      <header class="selection-header">
        <div>
          <p>{{ container ? t('布局') : t(definition?.category) }} · {{ String(index + 1).padStart(2, '0') }}</p>
          <h2>{{ container ? node.props.name || t('容器组') : definition && componentName(definition) }}</h2>
          <span>{{ container ? t('{0} 个子图层', [node.children?.length || 0]) : definition?.englishName }}</span>
        </div>
        <div class="node-actions">
          <button :disabled="index <= 0" :title="t('上移')" @click="emit('move', -1)"><ArrowUp :size="15" /></button>
          <button :disabled="index >= total - 1" :title="t('下移')" @click="emit('move', 1)"><ArrowDown :size="15" /></button>
          <button :title="t('复制')" @click="emit('duplicate')"><Copy :size="15" /></button>
          <button class="danger" :title="t('删除')" @click="emit('remove')"><Trash2 :size="15" /></button>
        </div>
      </header>

      <div v-if="tab === 'design'" class="single-group-action">
        <button class="group-action-button group-action-button--secondary" :disabled="!canGroup" @click="emit('group')"><Layers3 :size="15" />{{ t("创建父级容器") }}</button>
        <span class="panel-shortcut">⌘ / Ctrl + G</span>
      </div>

      <div v-if="panel && tab === 'design' && !editingPanel" class="panel-preview-control">
        <p>{{ t("这是弹出面板，默认收起，可在手机内预览。") }}</p>
        <button type="button" @click="emit('preview-panel')"><Eye :size="14" />{{ t("预览面板") }}</button>
      </div>

      <div v-if="(container || background) && tab === 'design'" class="property-scroll">
        <ContainerExtensionEditor v-if="node.layoutRole !== 'spacer'" :key="node.id" :node="node" :nodes="nodes" @update="emit('extensions', $event)" />
        <section v-if="container" class="property-group">
          <h3>{{ t("容器组") }}</h3>
          <label class="property-row"><span class="property-label">{{ t("图层名称") }}</span><input :value="node.props.name" :aria-label="t('容器图层名称')" @input="emit('patch', { name: ($event.target as HTMLInputElement).value })" /></label>
          <button class="group-action-button group-action-button--secondary" @click="emit('ungroup')"><Layers3 :size="16" />{{ t("解组") }}</button>
          <span class="panel-shortcut">{{ t("⌘ / Ctrl + Shift + G · 子图层会保留") }}</span>
        </section>
        <LayoutStyleEditor :key="node.id" :node="node" @patch="emit('patch', $event)" />
        <section v-if="background" class="property-group">
          <h3>{{ t("背景主题") }}</h3>
          <label class="property-row">
            <span class="property-label">{{ t("内置背景主题") }}</span>
            <select :value="node.props.theme || 'default'" :aria-label="t('内置背景主题')" @change="emit('patch', { theme: ($event.target as HTMLSelectElement).value })">
              <option v-for="[value, label] in backgroundThemes" :key="value" :value="value">{{ t(label) }}</option>
            </select>
          </label>
          <p class="panel-description">{{ t("背景颜色恢复默认后，使用内置主题。") }}</p>
        </section>
      </div>

      <div v-else-if="tab === 'design'" class="property-scroll">
        <ComponentStylePicker :node="node" @select="emit('style', $event)" />
        <InteractionEditor :node="node" :nodes="nodes"
          @bind="(name, targetId) => emit('bind-panel', name, targetId)"
          @create="(name, type) => emit('create-panel', name, type)"
          @remove="emit('remove-associated', $event)"
          @edit="emit('edit-associated', $event)"
          @error="emit('error', $event)"
        />
        <section v-for="[groupName, schemas] in groups" :key="groupName" class="property-group" :class="{ 'property-group--searchable': groupName === '状态' }">
          <h3>{{ t(groupName) }}</h3>
          <PanelSearch v-if="groupName === '状态'" v-model="stateQuery" label="搜索状态" placeholder="搜索状态名称或英文属性" />
          <p v-if="groupName === '状态' && stateQuery.trim()" class="panel-search-feedback" role="status">{{ schemas.length ? t('找到 {0} 个状态', [schemas.length]) : t('未找到匹配的状态') }}</p>
          <div v-for="schema in schemas" :key="schema.key" class="property-row" :class="`control-${schema.control}`">
            <component
              :is="schema.tokenKind || schema.control === 'select' || isIconProperty(node.type, schema) ? 'div' : 'label'"
              :id="`${fieldId(schema)}-label`"
              class="property-label"
              :for="schema.tokenKind || schema.control === 'select' || isIconProperty(node.type, schema) ? undefined : fieldId(schema)"
              :title="`${uiDescription(schema.description, propertyName(schema))} (${uiDescription(schema.help, schema.key) || schema.key})`"
            >
              <span class="property-label-title"><SearchHighlight :text="propertyName(schema)" :query="groupName === '状态' ? stateQuery : ''" /></span>
              <small v-if="schema.help"><SearchHighlight :text="uiDescription(schema.help, schema.key)" :query="groupName === '状态' ? stateQuery : ''" /></small>
            </component>

            <ImageSourceControl
              v-if="node.type === 'image' && schema.key === 'src'"
              :id="fieldId(schema)"
              :key="fieldId(schema)"
              :model-value="valueOf(schema)"
              @update:model-value="update(schema, $event)"
              @error="emit('error', $event)"
            />
            <IconPickerControl
              v-else-if="isIconProperty(node.type, schema)"
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
              :placeholder="t(schema.placeholder)"
              @input="update(schema, ($event.target as HTMLInputElement).value)"
            />
            <textarea
              v-else-if="schema.control === 'textarea'"
              :id="fieldId(schema)"
              :value="valueOf(schema)"
              :placeholder="t(schema.placeholder)"
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
              <option v-for="option in schema.options" :key="String(option.value)" :value="option.value">{{ t(option.label) }}</option>
            </select>
            <button
              v-else-if="schema.control === 'boolean'"
              :id="fieldId(schema)"
              type="button"
              class="property-switch"
              :class="{ checked: Boolean(valueOf(schema)) }"
              :aria-pressed="Boolean(valueOf(schema))"
              :aria-labelledby="`${fieldId(schema)}-label`"
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
            <p v-if="componentPropertyHint(node, schema.key)" class="property-effect-hint"><SearchHighlight :text="t(componentPropertyHint(node, schema.key))" :query="groupName === '状态' ? stateQuery : ''" /></p>
          </div>
        </section>
      </div>

      <div v-else-if="definition" class="docs-panel">
        <span class="docs-badge">PERSAGY VANT</span>
        <h3>{{ componentName(definition) }} {{ definition.englishName }}</h3>
        <p>{{ uiDescription(definition.description) }}</p>
        <div class="docs-meta">
          <span>{{ t("组件版本") }}</span><strong>{{ libraryPackage.version }}</strong>
          <span>{{ t("变量来源") }}</span><strong>README.zh-CN.md</strong>
        </div>
        <a :href="getComponentDocsUrl(definition.docsPath)" target="_blank" rel="noreferrer">
          {{ t("查看组件文档") }} <ExternalLink :size="14" />
        </a>
        <div class="docs-note">
          {{ t("当前属性面板只展示已在组件 README 中公开的 Props；内容型默认插槽会明确标记为 default slot。") }}
        </div>
      </div>
    </template>
  </aside>
</template>
