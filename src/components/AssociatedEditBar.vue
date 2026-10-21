<script setup lang="ts">
import { PencilLine, X } from 'lucide-vue-next';

defineProps<{ name: string; surface: 'phone' | 'panel' }>();
defineEmits<{ (event: 'exit'): void }>();
</script>

<template>
  <div class="associated-edit-bar" :class="`associated-edit-bar--${surface}`">
    <PencilLine :size="16" />
    <span><small>正在编辑关联组件</small><strong>{{ name }}</strong></span>
    <button type="button" :aria-label="surface === 'phone' ? '在模拟器中退出编辑' : '在属性面板退出编辑'" @click.stop="$emit('exit')"><X :size="14" />退出编辑</button>
  </div>
</template>
