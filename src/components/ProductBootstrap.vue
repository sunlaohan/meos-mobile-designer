<script setup lang="ts">
import { onMounted, ref } from 'vue';
import DesignSkeleton from './DesignSkeleton.vue';
import GlobalNotifications from './GlobalNotifications.vue';
import { designLoadingVariant } from '../utils/designLoading';
import { useNotifications } from '../utils/notifications';
import { useI18n } from '../utils/i18n';
import '../feedback.css';

const emit = defineEmits<{ (event: 'ready', mountProduct: () => void): void }>();
const variant = designLoadingVariant(new URL(location.href));
const failed = ref(false);
const { notify } = useNotifications();
const { t } = useI18n();
function reload() { location.reload(); }
onMounted(async () => {
  try { const { mountProduct } = await import('../product-entry'); emit('ready', mountProduct); }
  catch { failed.value = true; notify('页面资源加载失败，请刷新重试。', 'error'); }
});
</script>

<template>
  <GlobalNotifications />
  <div v-if="failed" class="product-bootstrap-error"><span class="skeleton-brand-mark">C</span><h1>{{ t('页面加载失败') }}</h1><button type="button" @click="reload">{{ t('重新加载') }}</button></div>
  <DesignSkeleton v-else :variant="variant" />
</template>
