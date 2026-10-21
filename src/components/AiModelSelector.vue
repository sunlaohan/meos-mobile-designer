<script setup lang="ts">
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
const error = ref('');
function select() {
  try { localStorage.setItem(storageKey, selected.value); } catch { /* Selection still works without persistence. */ }
  emit('update:model', selected.value);
  const model = models.value.find((item) => item.id === selected.value);
  if (model) emit('change', model);
}
async function load(refresh = false) {
  loading.value = true;
  error.value = '';
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
    error.value = reason instanceof Error ? reason.message : '模型列表加载失败，请重试。';
  } finally { loading.value = false; }
}
onMounted(() => load());
</script>

<template>
  <div class="ai-model-settings">
    <div class="ai-model-label"><label for="ai-model-select">生成模型</label><span>{{ loading ? '加载中…' : `${models.length} 家精选` }}</span><button type="button" title="刷新模型列表" aria-label="刷新模型列表" :disabled="disabled || loading" @click="load(true)"><RefreshCw :size="12" :class="{ spinning: loading }" /></button></div>
    <div class="ai-model-control">
      <select id="ai-model-select" v-model="selected" aria-label="生成模型" :disabled="disabled || loading || !models.length" @change="select">
        <option v-if="!models.length" value="">{{ loading ? '正在获取模型…' : '暂无可用模型' }}</option>
        <option v-for="model in models" :key="model.id" :value="model.id">{{ model.label || model.id }}</option>
      </select>
      <ChevronDown class="ai-model-chevron" :size="14" aria-hidden="true" />
    </div>
    <small v-if="models.length" class="ai-model-hint">每家保留一款，默认 Gemini</small>
    <p v-if="error" class="ai-request-error" role="alert">{{ error }}</p>
  </div>
</template>
