<script setup lang="ts">
import { useI18n, componentName } from '../utils/i18n';
const { t } = useI18n();
import {
  BlueMarkHeader,
  Background,
  BatchMultiSelect,
  BottomActionBar,
  Button,
  Cell,
  Divider,
  Empty,
  Field,
  Form,
  Image as VanImage,
  InfoCard,
  Loading,
  NavBar,
  NoticeBar,
  Progress,
  PullRefresh,
  List,
  Search,
  Stepper,
  Switch,
  Tag,
  TitleBar,
  TreeSelect,
  WorkOrderCard,
  Uploader,
} from 'persagy-vant';
import { computed } from 'vue';
import DynamicPanelRenderer from './DynamicPanelRenderer.vue';
import { getDefinition } from '../data/componentCatalog';
import type { CanvasNode } from '../types';
import { isCanvasPanel } from '../utils/canvasPresentation';
import { getBackgroundProps, getBackgroundStyle } from '../utils/nodeTree';
import { initialComponentStateKey } from '../utils/componentStyles';

const props = withDefaults(
  defineProps<{
    node: CanvasNode;
    thumbnail?: boolean;
    interactive?: boolean;
    docked?: boolean;
    followed?: boolean;
    stylePreview?: boolean;
    nativeSlot?: boolean;
  }>(),
  { thumbnail: false, interactive: false },
);

const emit = defineEmits<{
  (event: 'patch', value: Record<string, unknown>): void;
  (event: 'patch-child', id: string, value: Record<string, unknown>): void;
  (event: 'action', message: string): void;
  (event: 'trigger', name: string, message: string): void;
  (event: 'trigger-child', id: string, name: string, message: string): void;
}>();

const definition = computed(() => getDefinition(props.node.type));
const dynamicComponent = computed(() => `van-${props.node.type}`);

function patch(key: string, value: unknown) {
  if (!props.interactive && !props.thumbnail) return;
  emit('patch', { [key]: value });
}

function action(message: string) {
  if (props.interactive) emit('action', message);
}

function trigger(name: string, message: string) {
  if (props.interactive) emit('trigger', name, message);
}
</script>

<template>
  <div
    :key="initialComponentStateKey(node)"
    class="renderer"
    :class="{
      'renderer--padded': ['button', 'tag', 'switch', 'stepper', 'progress', 'loading'].includes(node.type),
      'renderer--thumbnail': thumbnail,
      'renderer--interactive': interactive,
      'renderer--selection': ['tree-select', 'quantity-input'].includes(node.type),
      'renderer--contained': node.type === 'quantity-input',
      'renderer--followed': followed,
      'renderer--panel-preview': stylePreview && isCanvasPanel(node),
      'renderer--native-slot': nativeSlot,
    }"
  >
    <NavBar v-if="node.type === 'nav-bar'" v-bind="{ ...node.props, ...((docked || thumbnail) ? { fixed: false, placeholder: false, safeAreaInsetTop: false } : {}) }" @click-left="trigger('click-left', t('点击了返回'))" @click-right="trigger('click-right', t('点击了右侧操作'))" />
    <BlueMarkHeader v-else-if="node.type === 'blue-mark-header'" v-bind="node.props" />
    <TitleBar v-else-if="node.type === 'title-bar'" v-bind="node.props" />
    <Search
      v-else-if="node.type === 'search'"
      v-bind="node.props"
      @update:model-value="patch('modelValue', $event)"
      @search="action(t('搜索：{0}', [$event]))"
    />
    <Cell v-else-if="node.type === 'cell'" v-bind="node.props" @click="trigger('click', t('打开：{0}', [node.props.title || '单元格']))" />
    <Field v-else-if="node.type === 'field'" v-bind="node.props" @update:model-value="patch('modelValue', $event)" @click="trigger('click', t('点击了输入框'))" />
    <Button v-else-if="node.type === 'button'" v-bind="node.props" @click="trigger('click', node.props.text || t('按钮操作'))" />
    <Tag v-else-if="node.type === 'tag'" v-bind="node.props">{{ node.content }}</Tag>
    <Switch v-else-if="node.type === 'switch'" v-bind="node.props" @update:model-value="patch('modelValue', $event)" />
    <Stepper v-else-if="node.type === 'stepper'" v-bind="node.props" @update:model-value="patch('modelValue', $event)" />
    <NoticeBar v-else-if="node.type === 'notice-bar'" v-bind="node.props" />
    <Progress v-else-if="node.type === 'progress'" v-bind="node.props" />
    <VanImage v-else-if="node.type === 'image'" v-bind="node.props" />
    <Divider v-else-if="node.type === 'divider'" v-bind="node.props">{{ node.content }}</Divider>
    <InfoCard
      v-else-if="node.type === 'info-card'"
      v-bind="node.props"
      @update:model-value="patch('modelValue', $event)"
      @change="patch('modelValue', $event)"
    ><slot>{{ node.content }}</slot></InfoCard>
    <WorkOrderCard
      v-else-if="node.type === 'work-order-card'"
      v-bind="node.props"
      @update:expanded="patch('expanded', $event)"
      @click-action="trigger('click-action', t('执行工单操作'))"
    />
    <BottomActionBar
      v-else-if="node.type === 'bottom-action-bar'"
      v-bind="{ ...node.props, ...((docked || thumbnail) ? { fixed: false, placeholder: false } : {}) }"
      @confirm="trigger('confirm', node.props.confirmText || t('确认'))"
      @secondary="trigger('secondary', node.props.secondaryText || t('次要操作'))"
      @icon="trigger('icon', t('图标操作'))"
      @more="trigger('more', t('更多操作'))"
    />
    <Empty v-else-if="node.type === 'empty'" v-bind="node.props" />
    <Loading v-else-if="node.type === 'loading'" v-bind="node.props">{{ node.content }}</Loading>
    <Background v-else-if="node.type === 'background'" v-bind="getBackgroundProps(node)" :style="getBackgroundStyle(node)"><slot><ComponentRenderer v-for="child in node.children" :key="child.id" :node="child" :thumbnail="thumbnail" :interactive="interactive" :style-preview="stylePreview" @patch="emit('patch-child', child.id, $event)" @patch-child="(id, value) => emit('patch-child', id, value)" @trigger="(name, message) => emit('trigger-child', child.id, name, message)" @trigger-child="(id, name, message) => emit('trigger-child', id, name, message)" @action="action" /><template v-if="!node.children?.length">{{ node.content }}</template></slot></Background>
    <Form v-else-if="node.type === 'form' && node.children" v-bind="node.props"><slot><ComponentRenderer v-for="child in node.children" :key="child.id" :node="child" :thumbnail="thumbnail" :interactive="interactive" :style-preview="stylePreview" @patch="emit('patch-child', child.id, $event)" @patch-child="(id, value) => emit('patch-child', id, value)" @trigger="(name, message) => emit('trigger-child', child.id, name, message)" @trigger-child="(id, name, message) => emit('trigger-child', id, name, message)" @action="action" /></slot></Form>
    <List v-else-if="node.type === 'list' && node.children" v-bind="node.props"><slot><ComponentRenderer v-for="child in node.children" :key="child.id" :node="child" :thumbnail="thumbnail" :interactive="interactive" :style-preview="stylePreview" @patch="emit('patch-child', child.id, $event)" @patch-child="(id, value) => emit('patch-child', id, value)" @trigger="(name, message) => emit('trigger-child', child.id, name, message)" @trigger-child="(id, name, message) => emit('trigger-child', id, name, message)" @action="action" /></slot></List>
    <PullRefresh v-else-if="node.type === 'pull-refresh' && node.children" v-bind="node.props" @update:model-value="patch('modelValue', $event)" @refresh="patch('modelValue', false); action(t('本地示例数据，刷新接口待接入'))"><slot><ComponentRenderer v-for="child in node.children" :key="child.id" :node="child" :thumbnail="thumbnail" :interactive="interactive" :style-preview="stylePreview" @patch="emit('patch-child', child.id, $event)" @patch-child="(id, value) => emit('patch-child', id, value)" @trigger="(name, message) => emit('trigger-child', child.id, name, message)" @trigger-child="(id, name, message) => emit('trigger-child', id, name, message)" @action="action" /></slot></PullRefresh>
    <Uploader v-else-if="node.type === 'uploader'" v-bind="node.props" @update:model-value="patch('modelValue', $event)" @oversize="action(t('文件超出大小限制'))" />
    <TreeSelect
      v-else-if="node.type === 'tree-select'"
      v-bind="node.props"
      @update:model-value="patch('modelValue', $event)"
      @update:expanded-keys="patch('expandedKeys', $event)"
    />
    <BatchMultiSelect
      v-else-if="node.type === 'quantity-input'"
      v-bind="node.props"
      @update:model-value="patch('modelValue', $event)"
      @update:expanded="patch('expanded', $event)"
      @confirm="action(t('已选择 {0} 项', [$event.filter(Boolean).length]))"
    />
    <template v-else-if="isCanvasPanel(node)">
      <DynamicPanelRenderer v-if="interactive || stylePreview" :node="stylePreview ? { ...node, props: { ...node.props, overlay: false, duration: 0, lazyRender: false } } : node" :show="stylePreview || !!node.props.show" :editing="stylePreview" @update:show="patch('show', $event)" @patch="emit('patch', $event)" @action="action"><template v-if="$slots.default || node.children?.length" #default><slot><ComponentRenderer v-for="child in node.children" :key="child.id" :node="child" :thumbnail="thumbnail" :interactive="interactive" :style-preview="stylePreview" @patch="emit('patch-child', child.id, $event)" @patch-child="(id, value) => emit('patch-child', id, value)" @trigger="(name, message) => emit('trigger-child', child.id, name, message)" @trigger-child="(id, name, message) => emit('trigger-child', id, name, message)" @action="action" /></slot></template></DynamicPanelRenderer>
      <div v-else class="configured-component"><span class="configured-icon">P</span><span class="configured-copy"><strong>{{ node.props.title || componentName(definition) }}</strong><small>{{ t("弹出面板 · 在图层中选择预览") }}</small></span></div>
    </template>
    <component v-else-if="definition.previewMode === 'live' || stylePreview" :is="dynamicComponent" v-bind="node.props" @update:model-value="patch('modelValue', $event)" @update:active="patch('active', $event)" @update:current-rate="patch('currentRate', $event)" @update:show-more="patch('showMore', $event)">
      <template v-if="$slots.default || node.children?.length" #default><slot><ComponentRenderer v-for="child in node.children" :key="child.id" :node="child" :thumbnail="thumbnail" :interactive="interactive" :style-preview="stylePreview" native-slot @patch="emit('patch-child', child.id, $event)" @patch-child="(id, value) => emit('patch-child', id, value)" @trigger="(name, message) => emit('trigger-child', child.id, name, message)" @trigger-child="(id, name, message) => emit('trigger-child', id, name, message)" @action="action" /></slot></template>
      <template v-else-if="node.content !== undefined" #default>{{ node.content }}</template>
    </component>
    <div v-else class="configured-component">
      <span class="configured-icon">{{ definition.englishName.slice(0, 1) }}</span>
      <span class="configured-copy">
        <strong>{{ componentName(definition) }}</strong>
        <small>{{ definition.englishName }} {{ t("· 需要业务数据/插槽") }}</small>
      </span>
      <span class="configured-count">{{ definition.properties.length }} Props</span>
    </div>
  </div>
</template>

<style scoped>
.renderer {
  width: 100%;
  min-width: 0;
}
.renderer--native-slot { display: contents; }

/* Contain the component's fixed action panel and overlay in its own canvas block. */
.renderer--contained {
  position: relative;
  transform: translateZ(0);
  isolation: isolate;
}

.renderer--selection:not(.renderer--interactive) {
  pointer-events: none;
}

.renderer--padded {
  padding: 12px 16px;
}

.renderer--thumbnail {
  pointer-events: none;
  transform-origin: left top;
}

.renderer--thumbnail.renderer--padded {
  padding: 8px;
}

.renderer--panel-preview { position: relative; height: 160px; overflow: hidden; --phone-viewport-height: 160px; --phone-screen-height: 256px; }
.renderer--panel-preview :deep(.van-popup) { position: absolute; inset: 0; width: 100%; max-width: 100%; max-height: 100%; transform: none; }
.renderer--panel-preview :deep(.dynamic-panel-renderer--anchored) { left: 40px !important; top: 20px !important; }

/* Canvas selection wrappers otherwise make every native Cell a last child. */
.renderer--followed > :deep(.van-cell:not(.van-cell--borderless)::after) {
  display: block;
}

.configured-component {
  min-height: 58px;
  margin: 8px 12px;
  padding: 10px;
  border: 1px solid #e1e8f0;
  border-radius: 8px;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #2e3742;
}

.configured-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: #ebf3ff;
  color: #246fe5;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
}

.configured-copy {
  flex: 1;
  min-width: 0;
}

.configured-copy strong,
.configured-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.configured-copy strong { font-size: 14px; }
.configured-copy small { margin-top: 2px; color: #8b949e; font-size: 12px; }
.configured-count { color: #8b949e; font-size: 12px; white-space: nowrap; }
</style>
