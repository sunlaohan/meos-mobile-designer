<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ImagePlus, LoaderCircle, Shuffle } from 'lucide-vue-next';
import { IMAGE_ACCEPT } from '../../shared/attachments.mjs';
import { useI18n } from '../utils/i18n';
import { loadComponentImage, randomImageSource, readComponentImage } from '../utils/componentImage';

const props = defineProps<{ id: string; modelValue: unknown }>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'error', message: string): void;
}>();
const { t } = useI18n();
const fileInput = ref<HTMLInputElement>();
const busy = ref<'local' | 'random' | ''>('');
const error = ref('');
const embedded = computed(() => typeof props.modelValue === 'string' && props.modelValue.startsWith('data:image/'));
const source = computed(() => typeof props.modelValue === 'string' ? props.modelValue : '');
let controller: AbortController | undefined;

async function replace(kind: 'local' | 'random', file?: File) {
  if (busy.value) return;
  busy.value = kind;
  error.value = '';
  const operation = new AbortController();
  controller = operation;
  try {
    const next = kind === 'local' && file ? await readComponentImage(file) : randomImageSource();
    if (kind === 'random') await loadComponentImage(next, operation.signal);
    if (operation.signal.aborted) return;
    emit('update:modelValue', next);
  } catch (failure) {
    if (operation.signal.aborted) return;
    error.value = failure instanceof Error ? failure.message : '图片替换失败，请重试。';
    emit('error', error.value);
  } finally {
    if (controller === operation) { busy.value = ''; controller = undefined; }
  }
}

function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void replace('local', file);
}

function editLink(event: Event) {
  error.value = '';
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

watch(() => props.modelValue, () => {
  controller?.abort();
  controller = undefined;
  busy.value = '';
  error.value = '';
});
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div class="image-source-control" :aria-busy="!!busy">
    <input :id="id" type="text" :value="embedded ? '' : source" :disabled="!!busy" :placeholder="embedded ? t('已嵌入本地图片，可输入网络链接替换') : 'https://…'" @input="editLink" />
    <div v-if="embedded" class="image-source-local">
      <img :src="source" alt="" />
      <span><strong>{{ t("本地图片") }}</strong><small>{{ t('图片已嵌入页面') }}</small></span>
    </div>
    <input :id="`${id}-file`" ref="fileInput" type="file" :accept="IMAGE_ACCEPT" :aria-label="t('选择本地图片')" hidden @change="chooseFile" />
    <div class="image-source-actions">
      <button type="button" :disabled="!!busy" @click="fileInput?.click()"><LoaderCircle v-if="busy === 'local'" class="image-source-spinner" :size="15" /><ImagePlus v-else :size="15" />{{ busy === 'local' ? t('读取中…') : t('选择本地图片') }}</button>
      <button type="button" :disabled="!!busy" @click="replace('random')"><LoaderCircle v-if="busy === 'random'" class="image-source-spinner" :size="15" /><Shuffle v-else :size="15" />{{ busy === 'random' ? t('加载中…') : t('随机网络图片') }}</button>
    </div>
    <p class="image-source-hint">{{ t("支持 PNG、JPG、WebP，单张不超过 5MB。") }}</p>
    <p v-if="error" class="image-source-error" role="alert">{{ t(error) }}</p>
  </div>
</template>

<style scoped>
.image-source-control { min-width: 0; display: grid; gap: 9px; }
.image-source-control input[type="file"][hidden] { display: none; }
.image-source-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.image-source-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; flex: 1; min-height: 34px; padding: 6px 8px; border: 1px solid var(--ui-border-strong, #48515f); border-radius: 5px; background: var(--ui-surface-raised, #2d3035); color: var(--text); font-size: var(--font-caption); cursor: pointer; white-space: nowrap; }
.image-source-actions button:hover:not(:disabled) { background: var(--ui-tint, #303f57); border-color: var(--accent); }
.image-source-actions svg { flex: none; }
.image-source-hint, .image-source-error { margin: 0; font-size: var(--font-caption); line-height: 1.5; color: var(--text-3); }
.image-source-error { color: var(--ui-error-text, #ff9696); }
.image-source-local { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--ui-surface-inset, #20242a); }
.image-source-local img { flex: none; width: 48px; height: 38px; border-radius: 3px; object-fit: contain; background: var(--ui-surface-raised, #2d3035); }
.image-source-local span { display: grid; gap: 3px; min-width: 0; }
.image-source-local strong { font-size: var(--font-caption); font-weight: 500; }
.image-source-local small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-caption); color: var(--text-3); }
.image-source-spinner { animation: image-source-spin .9s linear infinite; }
@keyframes image-source-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .image-source-spinner { animation: none; } }
</style>
