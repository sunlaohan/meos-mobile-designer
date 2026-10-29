<script setup lang="ts">
import { ref } from 'vue';
import { Search, X } from 'lucide-vue-next';
import { useI18n } from '../utils/i18n';

defineProps<{ modelValue: string; label: string; placeholder: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>();
const { t } = useI18n();
const input = ref<HTMLInputElement>();
function clear() {
  emit('update:modelValue', '');
  input.value?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="panel-search">
    <Search :size="14" aria-hidden="true" />
    <input ref="input" type="search" :value="modelValue" :aria-label="t(label)" :placeholder="t(placeholder)" autocomplete="off" spellcheck="false" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" @keydown.esc.stop.prevent="clear" />
    <button v-if="modelValue" type="button" :aria-label="t('清除{0}', [t(label)])" @click="clear"><X :size="13" aria-hidden="true" /></button>
  </div>
</template>
