<script setup lang="ts">
import { useNotifications } from '../utils/notifications';
import { useI18n } from '../utils/i18n';
const { t } = useI18n();
import { onMounted, ref } from 'vue';
import { ChevronDown, RefreshCw } from 'lucide-vue-next';
import { fetchAiModels } from '../utils/aiClient';
import type { AiModel } from '../types';

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{
  (event: 'update:model', value: string): void;
  (event: 'update:ready', value: boolean): void;
  (event: 'change', model: AiModel): void;
}>();
const storageKey = 'meri-mobile-designer:ai-model';
const models = ref<AiModel[]>([]);
const selected = ref('');
const loading = ref(false);
const { notify } = useNotifications();
function select() {
  try { localStorage.setItem(storageKey, selected.value); } catch { /* Selection still works without persistence. */ }
  emit('update:model', selected.value);
  const model = models.value.find((item) => item.id === selected.value);
  if (model) emit('change', model);
}
async function load(refresh = false) {
  if (loading.value) return;
  loading.value = true;
  emit('update:ready', false);
  try {
    const result = await fetchAiModels(refresh);
    models.value = result.models;
    let saved = selected.value;
    try { saved ||= localStorage.getItem(storageKey) || ''; } catch { /* Use server default. */ }
    selected.value = result.models.some((model) => model.id === saved) ? saved : result.defaultModel;
    select();
    emit('update:ready', !!selected.value);
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : '模型列表加载失败，请重试。', 'error');
  } finally { loading.value = false; }
}
onMounted(() => load());
</script>

<template>
  <div class="ai-model-settings">
    <div class="ai-model-label"><label for="ai-model-select">{{ t("生成模型") }}</label><span>{{ loading ? t('加载中…') : t('{0} 家精选', [models.length]) }}</span><button type="button" :title="t('刷新模型列表')" :aria-label="t('刷新模型列表')" :disabled="disabled || loading" :aria-busy="loading" @click="load(true)"><RefreshCw :size="12" :class="{ spinning: loading }" /></button></div>
    <div class="ai-model-control">
      <select id="ai-model-select" v-model="selected" :aria-label="t('生成模型')" :disabled="disabled || loading || !models.length" @change="select">
        <option v-if="!models.length" value="">{{ loading ? t('正在获取模型…') : t('暂无可用模型') }}</option>
        <option v-for="model in models" :key="model.id" :value="model.id">{{ model.label || model.id }}</option>
      </select>
      <ChevronDown class="ai-model-chevron" :size="14" aria-hidden="true" />
    </div>
    <small v-if="models.length" class="ai-model-hint">{{ t("每家保留一款，默认 Gemini") }}</small>
  </div>
</template>
