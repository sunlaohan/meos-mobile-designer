<script setup lang="ts">
import { useI18n, componentName } from '../utils/i18n';
const { t } = useI18n();
import { computed } from 'vue';
import { Layers3 } from 'lucide-vue-next';
import { componentDragState as drag } from '../utils/componentDragState';
import { getDefinition } from '../data/componentCatalog';
import { findNode } from '../utils/nodeTree';
import type { CanvasNode } from '../types';

const props = defineProps<{ nodes: CanvasNode[] }>();
function name(id: string | null) {
  const node = id ? findNode(props.nodes, id)?.node : null;
  return node ? String(node.props.name || node.props.title || node.props.label || componentName(getDefinition(node.type))) : t('页面');
}
const hint = computed(() => {
  const target = drag.target;
  if (drag.associationId) return '松手关联此控件';
  if (!target) return '拖入画板选择放置位置';
  if (target.mode === 'panel') return '松手添加弹出控件 · 默认收起';
  if (target.position === 'append') return `${drag.sourceId ? t('移动') : t('添加')}到「${name(target.parentId)}」末尾`;
  if (target.position === 'inside') return `放入「${name(target.parentId)}」`;
  return `插入「${name(target.anchorId)}」${target.position === 'before' ? t('之前') : t('之后')}`;
});
const parentHint = computed(() => drag.target?.mode === 'flow' && drag.target.position !== 'append' && drag.target.parentId ? `放入「${name(drag.target.parentId)}」` : '');
function boxStyle(box: { left: number; top: number; width: number; height?: number }) {
  return { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, ...(box.height !== undefined ? { height: `${box.height}px` } : {}) };
}
</script>

<template>
  <Teleport to="body">
    <template v-if="drag.type">
      <div v-if="drag.target?.highlight" class="canvas-drop-highlight" :class="{ 'canvas-drop-highlight--panel': drag.target.mode === 'panel' }" :style="boxStyle(drag.target.highlight)" aria-hidden="true" />
      <div v-if="drag.target?.appendZone && drag.target.appendZone.height >= 24" class="canvas-drop-append-zone" :style="boxStyle(drag.target.appendZone)" aria-hidden="true"><span>{{ t('松手{0}到末尾', [drag.sourceId ? t('移动') : t('添加')]) }}</span></div>
      <div v-if="drag.target?.indicator" class="canvas-drop-indicator" :style="boxStyle(drag.target.indicator)" :data-drop-parent-id="drag.target.parentId || ''" :data-drop-index="drag.target.index" :data-drop-position="drag.target.position" aria-hidden="true">
        <span class="canvas-drop-label" :class="{ 'canvas-drop-label--below': drag.target.indicator.labelBelow }">{{ t(hint) }}</span>
      </div>
      <div class="component-drag-ghost" :class="{ 'component-drag-ghost--valid': drag.target || drag.associationId }" :style="{ transform: `translate3d(${drag.x + 14}px, ${drag.y + 14}px, 0)` }" aria-hidden="true">
        <Layers3 :size="17" /><span><strong>{{ drag.sourceId ? name(drag.sourceId) : componentName(getDefinition(drag.type)) }}</strong><small>{{ t(parentHint || hint) }}</small></span>
      </div>
    </template>
  </Teleport>
</template>
