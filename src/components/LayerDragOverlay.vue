<script setup lang="ts">
import { useI18n } from '../utils/i18n';
const { t } = useI18n();
import { Layers3 } from 'lucide-vue-next';
import { layerDragState as drag } from '../utils/layerDragState';
</script>

<template>
  <Teleport to="body">
    <template v-if="drag.sourceId">
      <div class="layer-drag-overlay" :class="{ 'layer-drag-overlay--invalid': !drag.target && !drag.association }" :style="{ transform: `translate3d(${drag.x + 16}px, ${drag.y + 18}px, 0)` }">
        <Layers3 :size="17" /><span><strong>{{ drag.label }}</strong><small>{{ t(drag.detail) }}</small></span>
      </div>
      <div v-if="drag.indicator" class="layer-drop-indicator" :style="{ left: `${drag.indicator.left}px`, top: `${drag.indicator.top}px`, width: `${drag.indicator.width}px` }" />
    </template>
  </Teleport>
</template>
