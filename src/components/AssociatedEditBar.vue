<script setup lang="ts">
import { useI18n } from '../utils/i18n';
const { t } = useI18n();
import { PencilLine, X } from 'lucide-vue-next';

defineProps<{ name: string; surface: 'phone' | 'panel' }>();
defineEmits<{ (event: 'exit'): void }>();
</script>

<template>
  <div class="associated-edit-bar" :class="`associated-edit-bar--${surface}`">
    <PencilLine :size="16" />
    <span><small>{{ t("正在编辑关联组件") }}</small><strong>{{ name }}</strong></span>
    <button type="button" :aria-label="surface === 'phone' ? t('在模拟器中退出编辑') : t('在属性面板退出编辑')" @click.stop="$emit('exit')"><X :size="14" />{{ t("退出编辑") }}</button>
  </div>
</template>
